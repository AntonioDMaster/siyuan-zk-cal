import { Menu, Plugin, Setting } from "siyuan";
import "./index.scss";
import CalendarView from "@/calendar/ui/Calendar.svelte";
import { CalendarController } from "@/calendar/controller";
import { CALENDAR_SETTINGS_FILE, normalizeCalendarSettings } from "@/calendar/settings";
import type { CalendarCellData, CalendarSettings } from "@/calendar/types";

const DOCK_TYPE = "siyuan-zk-cal-dock";

export default class SiYuanZkCalPlugin extends Plugin {
    private settings: CalendarSettings;
    private controller: CalendarController;
    private dockContainer: HTMLDivElement | null = null;
    private calendarApp: CalendarView | null = null;
    private refreshSignal = 0;
    private layoutVersion = 0;

    private debug(message: string, extra?: Record<string, unknown>): void {
        if (!this.settings?.debugMessages) {
            return;
        }
        if (extra) {
            console.debug(`[siyuan-zk-cal] ${message}`, extra);
            return;
        }
        console.debug(`[siyuan-zk-cal] ${message}`);
    }

    async onload(): Promise<void> {
        const loaded = await this.loadData(CALENDAR_SETTINGS_FILE);
        this.settings = normalizeCalendarSettings(loaded);
        this.controller = new CalendarController(this, { ...this.settings }, this.i18n as Record<string, string>);
        await this.controller.refresh();

        this.registerDock();
        this.registerCommands();
        this.registerSetting();
        this.registerEvents();
    }

    async onunload(): Promise<void> {
        this.calendarApp?.$destroy();
        this.calendarApp = null;
    }

    private registerDock(): void {
        this.addDock({
            type: DOCK_TYPE,
            config: {
                icon: "iconCalendar",
                title: this.i18n["calendar.title"] ?? "Calendar",
                position: "RightBottom",
                size: { width: 320, height: 0 },
            },
            data: {},
            init: (dock) => {
                this.dockContainer = document.createElement("div");
                this.dockContainer.className = "zk-cal__dock";
                dock.element.appendChild(this.dockContainer);
                this.mountCalendar();
            },
            destroy: () => {
                this.calendarApp?.$destroy();
                this.calendarApp = null;
            },
        });
    }

    /** Mount or remount the calendar UI (same as initial draw). Call after toggling week-numbers column. */
    private mountCalendar(): void {
        if (!this.dockContainer) {
            return;
        }
        this.calendarApp?.$destroy();
        this.calendarApp = null;
        while (this.dockContainer.firstChild) {
            this.dockContainer.removeChild(this.dockContainer.firstChild);
        }
        this.calendarApp = new CalendarView({
            target: this.dockContainer,
            props: {
                controller: this.controller,
                refreshSignal: this.refreshSignal,
                layoutVersion: this.layoutVersion,
            },
        });
        this.calendarApp.$on("dayClick", async (event) => {
            const date = (event.detail as { cell: CalendarCellData }).cell.date;
            this.debug("User clicked day", { date: date.toISOString() });
            await this.controller.openOrCreateDaily(date);
            await this.forceRefresh();
        });
        this.calendarApp.$on("weekClick", async (event) => {
            const weekDate = (event.detail as { weekDate: Date }).weekDate;
            this.debug("User clicked week", { weekDate: weekDate.toISOString() });
            await this.controller.openOrCreateWeekly(weekDate);
            await this.forceRefresh();
        });
        this.calendarApp.$on("dayContext", (event) => {
            const detail = event.detail as { cell: CalendarCellData; event: MouseEvent };
            this.debug("User opened day context menu", { date: detail.cell.date.toISOString() });
            this.openDayContextMenu(detail.cell, detail.event);
        });
        this.calendarApp.$on("weekContext", (event) => {
            const detail = event.detail as { weekDate: Date; event: MouseEvent };
            this.debug("User opened week context menu", { weekDate: detail.weekDate.toISOString() });
            this.openWeekContextMenu(detail.weekDate, detail.event);
        });
    }

    private registerCommands(): void {
        this.addCommand({
            langKey: "calendar.refresh",
            hotkey: "",
            callback: async () => {
                this.debug("Command executed: refresh calendar");
                await this.forceRefresh();
            },
        });

        this.addCommand({
            langKey: "calendar.openWeekly",
            hotkey: "",
            callback: async () => {
                this.debug("Command executed: open current week note");
                await this.controller.openOrCreateWeekly(new Date());
                await this.forceRefresh();
            },
        });

        this.addCommand({
            langKey: "calendar.revealActive",
            hotkey: "",
            callback: async () => {
                this.debug("Command executed: reveal active note");
                const date = await this.controller.revealActiveNoteDate();
                if (date && this.calendarApp) {
                    await (this.calendarApp as any).revealDate(date);
                }
            },
        });
    }

    private registerEvents(): void {
        this.eventBus.on("ws-main", async () => {
            await this.forceRefresh();
        });
    }

    private registerSetting(): void {
        this.setting = new Setting({
            confirmCallback: async () => {
                await this.persistSettings();
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.notebookId"] ?? "Notebook ID",
            description: this.i18n["calendar.settings.notebookId.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__size200";
                input.value = this.settings.notebookId;
                input.onchange = () => {
                    this.settings.notebookId = input.value.trim();
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.dailyFolder"] ?? "Daily folder",
            description: this.i18n["calendar.settings.dailyFolder.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__size200";
                input.value = this.settings.dailyNoteFolder;
                input.onchange = () => {
                    this.settings.dailyNoteFolder = input.value.trim();
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.dailyFormat"] ?? "Daily format",
            description: this.i18n["calendar.settings.dailyFormat.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__size200";
                input.value = this.settings.dailyNoteFormat;
                input.onchange = () => {
                    this.settings.dailyNoteFormat = input.value.trim();
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.dailyTemplate"] ?? "Daily template path",
            description: this.i18n["calendar.settings.dailyTemplate.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__size200";
                input.value = this.settings.dailyNoteTemplate;
                input.onchange = () => {
                    this.settings.dailyNoteTemplate = input.value.trim();
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.weeklyEnabled"] ?? "Enable weekly notes",
            description: this.i18n["calendar.settings.weeklyEnabled.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.type = "checkbox";
                input.className = "b3-switch fn__flex-center";
                input.checked = this.settings.weeklyEnabled;
                input.onchange = () => {
                    this.settings.weeklyEnabled = input.checked;
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.weeklyFolder"] ?? "Weekly folder",
            description: this.i18n["calendar.settings.weeklyFolder.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__size200";
                input.value = this.settings.weeklyNoteFolder;
                input.onchange = () => {
                    this.settings.weeklyNoteFolder = input.value.trim();
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.weeklyFormat"] ?? "Weekly format",
            description: this.i18n["calendar.settings.weeklyFormat.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__size200";
                input.value = this.settings.weeklyNoteFormat;
                input.onchange = () => {
                    this.settings.weeklyNoteFormat = input.value.trim();
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.weeklyTemplate"] ?? "Weekly template path",
            description: this.i18n["calendar.settings.weeklyTemplate.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__size200";
                input.value = this.settings.weeklyNoteTemplate;
                input.onchange = () => {
                    this.settings.weeklyNoteTemplate = input.value.trim();
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.weekStart"] ?? "Week starts on",
            description: this.i18n["calendar.settings.weekStart.desc"] ?? "",
            createActionElement: () => {
                const select = document.createElement("select");
                select.className = "b3-select fn__size200";
                const options = [
                    { value: "locale", key: "locale" },
                    { value: "sunday", key: "sunday" },
                    { value: "monday", key: "monday" },
                    { value: "tuesday", key: "tuesday" },
                    { value: "wednesday", key: "wednesday" },
                    { value: "thursday", key: "thursday" },
                    { value: "friday", key: "friday" },
                    { value: "saturday", key: "saturday" },
                ];
                options.forEach((item) => {
                    const option = document.createElement("option");
                    option.value = item.value;
                    option.text = this.i18n[`calendar.settings.weekStart.${item.key}`] ?? item.value;
                    select.appendChild(option);
                });
                select.value = this.settings.weekStart;
                select.onchange = () => {
                    this.settings.weekStart = select.value as CalendarSettings["weekStart"];
                };
                return select;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.localeOverride"] ?? "Calendar locale",
            description: this.i18n["calendar.settings.localeOverride.desc"] ?? "",
            createActionElement: () => {
                const select = document.createElement("select");
                select.className = "b3-select fn__size200";
                const followOption = document.createElement("option");
                followOption.value = "system-default";
                followOption.text = this.i18n["calendar.settings.localeOverride.followSiyuan"] ?? "Follow SiYuan locale";
                select.appendChild(followOption);

                this.getLocaleOverrideOptions().forEach((localeCode) => {
                    const option = document.createElement("option");
                    option.value = localeCode;
                    option.text = localeCode;
                    select.appendChild(option);
                });

                select.value = this.settings.localeOverride || "system-default";
                select.onchange = () => {
                    this.settings.localeOverride = select.value;
                };
                return select;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.wordsPerDot"] ?? "Words per dot",
            description: this.i18n["calendar.settings.wordsPerDot.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.type = "number";
                input.className = "b3-text-field fn__size200";
                input.value = String(this.settings.wordsPerDot);
                input.onchange = () => {
                    this.settings.wordsPerDot = Number(input.value);
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.confirmBeforeCreate"] ?? "Confirm before create",
            description: this.i18n["calendar.settings.confirmBeforeCreate.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.type = "checkbox";
                input.className = "b3-switch fn__flex-center";
                input.checked = this.settings.confirmBeforeCreate;
                input.onchange = () => {
                    this.settings.confirmBeforeCreate = input.checked;
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.showWeekNumbers"] ?? "Show week numbers",
            description: this.i18n["calendar.settings.showWeekNumbers.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.type = "checkbox";
                input.className = "b3-switch fn__flex-center";
                input.checked = this.settings.showWeekNumbers;
                input.onchange = () => {
                    this.settings.showWeekNumbers = input.checked;
                };
                return input;
            },
        });
        this.setting.addItem({
            title: this.i18n["calendar.settings.debugMessages"] ?? "Debug messages",
            description: this.i18n["calendar.settings.debugMessages.desc"] ?? "",
            createActionElement: () => {
                const input = document.createElement("input");
                input.type = "checkbox";
                input.className = "b3-switch fn__flex-center";
                input.checked = this.settings.debugMessages;
                input.onchange = () => {
                    this.settings.debugMessages = input.checked;
                };
                return input;
            },
        });
    }

    private async persistSettings(): Promise<void> {
        const prevShowWeekNumbers = this.controller.settings.showWeekNumbers;
        const normalized = normalizeCalendarSettings(this.settings);
        this.settings = normalized;
        this.debug("Settings saved", {
            notebookId: this.settings.notebookId,
            weekStart: this.settings.weekStart,
            debugMessages: this.settings.debugMessages,
        });
        await this.saveData(CALENDAR_SETTINGS_FILE, normalized);
        this.controller.setSettings({ ...normalized });
        if (prevShowWeekNumbers !== normalized.showWeekNumbers) {
            this.layoutVersion += 1;
            requestAnimationFrame(() => {
                this.mountCalendar();
                this.forceRefresh();
            });
            return;
        }
        await this.forceRefresh();
    }

    private async forceRefresh(): Promise<void> {
        await this.controller.refresh();
        this.refreshSignal += 1;
        this.calendarApp?.$set({
            refreshSignal: this.refreshSignal,
            layoutVersion: this.layoutVersion,
        });
    }

    private getLocaleOverrideOptions(): string[] {
        const defaults = ["en-US", "zh-CN", "zh-TW", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES", "ru-RU"];
        const candidates = [
            ...defaults,
            this.controller.getDisplayLocale(),
            window.siyuan?.config?.lang,
            document.documentElement?.lang,
            navigator.language,
        ];
        const uniq = new Set<string>();
        for (const candidate of candidates) {
            if (typeof candidate !== "string") {
                continue;
            }
            const normalized = candidate.trim().replace(/_/g, "-");
            if (!normalized || normalized === "system-default") {
                continue;
            }
            uniq.add(normalized);
        }
        return Array.from(uniq);
    }

    private openDayContextMenu(cell: CalendarCellData, event: MouseEvent): void {
        const menu = new Menu("zk-cal-day");
        menu.addItem({
            icon: "iconCalendar",
            label: this.i18n["calendar.action.openOrCreate"] ?? "Open or create",
            click: async () => {
                this.debug("Context action: open/create daily note", { date: cell.date.toISOString() });
                await this.controller.openOrCreateDaily(cell.date);
                await this.forceRefresh();
            },
        });
        if (cell.dailyDoc) {
            menu.addItem({
                icon: "iconTrashcan",
                label: this.i18n["calendar.action.delete"] ?? "Delete",
                click: async () => {
                    this.debug("Context action: delete daily note", { date: cell.date.toISOString() });
                    await this.controller.removeDaily(cell.date);
                    await this.forceRefresh();
                },
            });
        }
        menu.open({ x: event.clientX, y: event.clientY });
    }

    private openWeekContextMenu(weekDate: Date, event: MouseEvent): void {
        const menu = new Menu("zk-cal-week");
        menu.addItem({
            icon: "iconCalendar",
            label: this.i18n["calendar.action.openOrCreateWeek"] ?? "Open or create weekly",
            click: async () => {
                this.debug("Context action: open/create weekly note", { weekDate: weekDate.toISOString() });
                await this.controller.openOrCreateWeekly(weekDate);
                await this.forceRefresh();
            },
        });
        menu.addItem({
            icon: "iconTrashcan",
            label: this.i18n["calendar.action.deleteWeek"] ?? "Delete weekly",
            click: async () => {
                this.debug("Context action: delete weekly note", { weekDate: weekDate.toISOString() });
                await this.controller.removeWeekly(weekDate);
                await this.forceRefresh();
            },
        });
        menu.open({ x: event.clientX, y: event.clientY });
    }
}
