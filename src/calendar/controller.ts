import { confirm, openTab, Plugin } from "siyuan";

/** SiYuan runtime adds getActiveEditor on the plugin; the siyuan package types may not declare it. */
interface PluginWithActiveEditor extends Plugin {
    getActiveEditor?(): { protyle?: { block?: { rootID?: string } } } | null;
}
import { getTreeStat } from "@/api";
import { exportDocumentMarkdown, getOpenNotebooks, removeDocument } from "./adapters/siyuan-filetree";
import { getDocumentById, resolveDocHPath } from "./adapters/siyuan-search";
import type { DocTreeStat } from "./types";
import { createDefaultSources, evaluateDailySources, evaluateWeeklySources } from "./sources";
import type { CalendarCellData, CalendarSettings, CalendarSource, DebugLogger, PeriodicDoc } from "./types";
import { createDailyNote, getAllDailyNotes, getDailyNote, getRenderedDailyNoteName } from "./periodic/daily";
import {
    addDays,
    formatDateByPattern,
    getWeekNumberByStart,
    getWeekdayLabels,
    isSameDay,
    parseNoteDate,
    startOfMonth,
    startOfWeek,
} from "./periodic/parse";
import { createWeeklyNote, getAllWeeklyNotes, getWeeklyNote } from "./periodic/weekly";

export class CalendarController {
    public settings: CalendarSettings;
    public readonly plugin: Plugin;
    public readonly i18n: Record<string, string>;

    private sources: CalendarSource[];
    private debug: DebugLogger;
    private dailyNotes: Record<string, PeriodicDoc> = {};
    private weeklyNotes: Record<string, PeriodicDoc> = {};
    private markdownCache = new Map<string, string>();
    private displayLocaleMessages: Record<string, unknown> | null = null;
    private displayLocaleMessagesLocale = "";

    constructor(plugin: Plugin, settings: CalendarSettings, i18n: Record<string, string>, debug: DebugLogger = () => undefined) {
        this.plugin = plugin;
        this.settings = settings;
        this.i18n = i18n;
        this.debug = debug;
        this.sources = createDefaultSources(i18n);
    }

    async ensureNotebookSelected(): Promise<void> {
        if (this.settings.notebookId) {
            return;
        }
        const notebooks = await getOpenNotebooks();
        if (notebooks.length > 0) {
            this.settings.notebookId = notebooks[0].id;
        }
    }

    setSettings(next: CalendarSettings): void {
        this.settings = next;
        this.sources = createDefaultSources(this.i18n);
    }

    async refresh(): Promise<void> {
        await this.ensureNotebookSelected();
        this.dailyNotes = await getAllDailyNotes(this.settings, (message, extra) => this.debug(message, extra));
        this.weeklyNotes = this.settings.weeklyEnabled
            ? await getAllWeeklyNotes(this.settings, (message, extra) => this.debug(message, extra))
            : {};
        this.markdownCache.clear();
        this.statCache.clear();
    }

    async buildMonthCells(displayedMonth: Date): Promise<{ weeks: CalendarCellData[][]; weekNumbers: number[] }> {
        await this.ensureDisplayLocaleMessages();
        const monthStart = startOfMonth(displayedMonth);
        const monthStartWeek = startOfWeek(monthStart, this.settings.weekStart);
        const weeks: CalendarCellData[][] = [];
        const weekNumbers: number[] = [];
        let cursor = new Date(monthStartWeek);
        for (let week = 0; week < 6; week += 1) {
            const row: CalendarCellData[] = [];
            weekNumbers.push(getWeekNumberByStart(cursor, this.settings.weekStart));
            for (let day = 0; day < 7; day += 1) {
                const dailyDoc = getDailyNote(cursor, this.dailyNotes);
                const weeklyDoc = this.settings.weeklyEnabled
                    ? getWeeklyNote(cursor, this.weeklyNotes, this.settings.weekStart)
                    : null;
                const markdown = dailyDoc ? await this.getMarkdown(dailyDoc.id) : "";
                const docStat = dailyDoc ? await this.getDocStat(dailyDoc.id) : null;
                const dailyMeta = await evaluateDailySources(this.sources, {
                    date: cursor,
                    dailyDoc,
                    weeklyDoc,
                    markdown,
                    docStat,
                    settings: this.settings,
                });
                const weeklyMeta = await evaluateWeeklySources(this.sources, {
                    date: cursor,
                    dailyDoc,
                    weeklyDoc,
                    markdown,
                    docStat,
                    settings: this.settings,
                });
                row.push({
                    date: new Date(cursor),
                    isToday: isSameDay(cursor, new Date()),
                    isCurrentMonth: cursor.getMonth() === displayedMonth.getMonth(),
                    dailyDoc,
                    weeklyDoc,
                    metadata: {
                        classes: [...(dailyMeta.classes ?? []), ...(weeklyMeta.classes ?? [])],
                        dataAttributes: { ...(dailyMeta.dataAttributes ?? {}), ...(weeklyMeta.dataAttributes ?? {}) },
                        dots: [...(dailyMeta.dots ?? []), ...(weeklyMeta.dots ?? [])],
                        details: [...(dailyMeta.details ?? []), ...(weeklyMeta.details ?? [])],
                    },
                });
                cursor = addDays(cursor, 1);
            }
            weeks.push(row);
        }
        return { weeks, weekNumbers };
    }

    async openOrCreateDaily(date: Date): Promise<void> {
        let doc = getDailyNote(date, this.dailyNotes);
        if (!doc) {
            this.debug("openOrCreateDaily: no daily note for date", { date: date.toISOString() });
            const shouldCreate = await this.shouldCreateMissing("day", date);
            if (!shouldCreate) {
                return;
            }
            const created = await createDailyNote(date, this.settings, (message, extra) => this.debug(message, extra));
            if (!created) {
                return;
            }
            await this.refresh();
            doc = getDailyNote(date, this.dailyNotes);
            if (!doc) {
                this.debug("openOrCreateDaily: note created but not found after refresh", {
                    date: date.toISOString(),
                    docId: created,
                    row: await this.getDocDebugRow(created),
                });
                return;
            }
        } else {
            this.debug("openOrCreateDaily: existing daily note found", { date: date.toISOString(), docId: doc.id, path: doc.path });
        }
        if (doc) {
            this.debug("openOrCreateDaily: opening note in tab", { docId: doc.id });
            await openTab({ app: this.plugin.app, doc: { id: doc.id } });
        }
    }

    async openOrCreateWeekly(date: Date): Promise<void> {
        if (!this.settings.weeklyEnabled) {
            this.debug("openOrCreateWeekly: weekly notes are disabled in settings, ignoring");
            return;
        }
        const weekDate = startOfWeek(date, this.settings.weekStart);
        let doc = getWeeklyNote(weekDate, this.weeklyNotes, this.settings.weekStart);
        if (!doc) {
            this.debug("openOrCreateWeekly: no weekly note for week", { weekDate: weekDate.toISOString() });
            const shouldCreate = await this.shouldCreateMissing("week", weekDate);
            if (!shouldCreate) {
                return;
            }
            const created = await createWeeklyNote(weekDate, this.settings, (message, extra) => this.debug(message, extra));
            if (!created) {
                return;
            }
            await this.refresh();
            doc = getWeeklyNote(weekDate, this.weeklyNotes, this.settings.weekStart);
            if (!doc) {
                this.debug("openOrCreateWeekly: note created but not found after refresh", {
                    weekDate: weekDate.toISOString(),
                    docId: created,
                    row: await this.getDocDebugRow(created),
                });
                return;
            }
        } else {
            this.debug("openOrCreateWeekly: existing weekly note found", { weekDate: weekDate.toISOString(), docId: doc.id, path: doc.path });
        }
        if (doc) {
            this.debug("openOrCreateWeekly: opening note in tab", { docId: doc.id });
            await openTab({ app: this.plugin.app, doc: { id: doc.id } });
        }
    }

    private async getDocDebugRow(docId: string): Promise<Record<string, unknown> | null> {
        const row = await getDocumentById(docId);
        if (!row) {
            return null;
        }
        return { id: row.id, box: row.box, path: row.path, hpath: await resolveDocHPath(row), content: row.content };
    }

    async removeDaily(date: Date): Promise<void> {
        const doc = getDailyNote(date, this.dailyNotes);
        if (!doc) {
            this.debug("removeDaily: no daily note to delete", { date: date.toISOString() });
            return;
        }
        this.debug("removeDaily: deleting note", { docId: doc.id, box: doc.box, path: doc.path });
        await removeDocument(doc.box, doc.path);
        this.debug("removeDaily: note deleted, refreshing");
        await this.refresh();
    }

    async removeWeekly(date: Date): Promise<void> {
        const doc = getWeeklyNote(date, this.weeklyNotes, this.settings.weekStart);
        if (!doc) {
            this.debug("removeWeekly: no weekly note to delete", { date: date.toISOString() });
            return;
        }
        this.debug("removeWeekly: deleting note", { docId: doc.id, box: doc.box, path: doc.path });
        await removeDocument(doc.box, doc.path);
        this.debug("removeWeekly: note deleted, refreshing");
        await this.refresh();
    }

    async revealActiveNoteDate(): Promise<Date | null> {
        let active: { protyle?: { block?: { rootID?: string } } } | null | undefined;
        try {
            active = (this.plugin as PluginWithActiveEditor).getActiveEditor?.();
        } catch {
            this.debug("revealActiveNoteDate: getActiveEditor threw");
            return null;
        }
        const docId = active?.protyle?.block?.rootID;
        if (!docId) {
            this.debug("revealActiveNoteDate: no active document");
            return null;
        }
        const doc = await getDocumentById(docId);
        if (!doc) {
            this.debug("revealActiveNoteDate: active document not found in database", { docId });
            return null;
        }
        const hpath = await resolveDocHPath(doc);
        const title = hpath ? hpath.split("/").filter(Boolean).pop() ?? doc.content : doc.content;
        const dailyDate = title
            ? parseNoteDate(hpath, this.settings.dailyNoteFolder, title, this.settings.dailyNoteFormat, "day")
            : null;
        if (dailyDate) {
            this.debug("revealActiveNoteDate: active note is a daily note", { docId, date: dailyDate.toISOString() });
            return dailyDate;
        }
        const weeklyDate = title
            ? parseNoteDate(
                  hpath,
                  this.settings.weeklyNoteFolder,
                  title,
                  this.settings.weeklyNoteFormat,
                  "week",
                  this.settings.weekStart,
              )
            : null;
        if (weeklyDate) {
            const weekStart = startOfWeek(weeklyDate, this.settings.weekStart);
            this.debug("revealActiveNoteDate: active note is a weekly note", { docId, date: weekStart.toISOString() });
            return weekStart;
        }
        this.debug("revealActiveNoteDate: title does not match a periodic note format", { docId, title: title ?? "" });
        return null;
    }

    getDaysOfWeek(locale = this.getDisplayLocale()): string[] {
        return getWeekdayLabels(this.settings.weekStart, locale);
    }

    getMetadataPopoverDate(date: Date): string {
        return date.toLocaleDateString(this.getDisplayLocale() || undefined);
    }

    getMetadataPopoverLabel(label: string): string {
        switch (label) {
            case "words":
                return (
                    this.getDisplayLocaleMessage("wordCount") ??
                    this.i18n["calendar.source.wordCount"] ??
                    "Words"
                );
            case "tasks":
                return this.getDisplayLocaleMessage("check") ?? this.i18n["calendar.source.tasks"] ?? "Tasks";
            case "tags":
                return this.getDisplayLocaleMessage("tag") ?? this.i18n["calendar.source.tags"] ?? "Tags";
            case "streak":
                return this.i18n["calendar.source.streak"] ?? "Streak";
            default:
                return label;
        }
    }

    getMetadataPopoverEmptyText(): string {
        return this.getDisplayLocaleMessage("empty") ?? this.i18n["calendar.popover.noMetadata"] ?? "No metadata";
    }

    async getRenderedDailyNoteName(date: Date): Promise<string> {
        return getRenderedDailyNoteName(date, this.settings);
    }

    getDisplayLocale(): string {
        const override = this.normalizeLocale(this.settings.localeOverride);
        if (override && override !== "system-default") {
            return override;
        }
        return this.resolveSiyuanLocale();
    }

    private resolveSiyuanLocale(): string {
        const config = window.siyuan?.config ?? {};
        const candidates: unknown[] = [
            config.lang,
            config.locale,
            config.system?.lang,
            document.documentElement?.lang,
            navigator.language,
        ];
        for (const candidate of candidates) {
            const normalized = this.normalizeLocale(candidate);
            if (normalized && normalized !== "system-default") {
                return normalized;
            }
        }
        return "en-US";
    }

    private normalizeLocale(value: unknown): string | null {
        if (typeof value !== "string") {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const normalized = trimmed.replace(/_/g, "-");
        try {
            new Intl.DateTimeFormat(normalized);
            return normalized;
        } catch (_error) {
            return null;
        }
    }

    private getDisplayLocaleMessage(key: string): string | null {
        const value = this.displayLocaleMessages?.[key];
        if (typeof value !== "string") {
            return null;
        }
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }

    private async ensureDisplayLocaleMessages(): Promise<void> {
        const displayLocale = this.getDisplayLocale();
        if (this.displayLocaleMessagesLocale === displayLocale) {
            return;
        }
        this.displayLocaleMessagesLocale = displayLocale;
        this.displayLocaleMessages = await this.loadDisplayLocaleMessages(displayLocale);
    }

    private async loadDisplayLocaleMessages(locale: string): Promise<Record<string, unknown> | null> {
        const siyuanLocale = this.resolveSiyuanLocale();
        if (locale === siyuanLocale) {
            return this.getCurrentSiyuanLanguages();
        }
        const localeFileName = locale.replace(/-/g, "_");
        const candidatePaths = [
            `/appearance/langs/${localeFileName}.json`,
            `/stage/build/app/appearance/langs/${localeFileName}.json`,
            `/stage/build/app/langs/${localeFileName}.json`,
        ];
        for (const path of candidatePaths) {
            try {
                const response = await fetch(path);
                if (!response.ok) {
                    continue;
                }
                const payload: unknown = await response.json();
                if (payload && typeof payload === "object") {
                    return payload as Record<string, unknown>;
                }
            } catch (_error) {
                continue;
            }
        }
        return this.getCurrentSiyuanLanguages();
    }

    private getCurrentSiyuanLanguages(): Record<string, unknown> | null {
        const languages = window.siyuan?.languages;
        if (!languages || typeof languages !== "object") {
            return null;
        }
        return languages as Record<string, unknown>;
    }

    private async getMarkdown(docId: string): Promise<string> {
        if (this.markdownCache.has(docId)) {
            return this.markdownCache.get(docId) ?? "";
        }
        const markdown = await exportDocumentMarkdown(docId);
        this.markdownCache.set(docId, markdown);
        return markdown;
    }

    private statCache = new Map<string, DocTreeStat>();

    private async getDocStat(docId: string): Promise<DocTreeStat | null> {
        if (this.statCache.has(docId)) {
            return this.statCache.get(docId) ?? null;
        }
        const raw = await getTreeStat(docId);
        if (!raw) {
            return null;
        }
        const stat: DocTreeStat = {
            wordCount: raw.wordCount ?? 0,
            runeCount: raw.runeCount ?? 0,
            blockCount: raw.blockCount ?? 0,
        };
        this.statCache.set(docId, stat);
        return stat;
    }

    private async shouldCreateMissing(granularity: "day" | "week", date: Date): Promise<boolean> {
        if (!this.settings.confirmBeforeCreate) {
            this.debug("shouldCreateMissing: confirmBeforeCreate disabled, creating without prompt");
            return true;
        }
        const format = granularity === "day" ? this.settings.dailyNoteFormat : this.settings.weeklyNoteFormat;
        const noteName =
            granularity === "day"
                ? formatDateByPattern(date, format)
                : formatDateByPattern(date, format, this.settings.weekStart);
        const messageTemplate = this.i18n["calendar.confirmCreateMessage"] ?? "Note {name} does not exist. Would you like to create it?";
        const message = messageTemplate.replace("{name}", noteName);
        return new Promise((resolve) => {
            confirm(
                this.i18n["calendar.confirmCreateTitle"] ?? "Create note",
                message,
                () => {
                    this.debug("shouldCreateMissing: user confirmed note creation", { noteName });
                    resolve(true);
                },
                () => {
                    this.debug("shouldCreateMissing: user cancelled note creation", { noteName });
                    resolve(false);
                },
            );
        });
    }
}
