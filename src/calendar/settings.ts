import type { CalendarSettings } from "./types";

export const CALENDAR_SETTINGS_FILE = "calendar-settings.json";

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
    notebookId: "",
    dailyNoteFolder: "/daily",
    dailyNoteFormat: "YYYY-MM-DD",
    dailyNoteTemplate: "",
    weeklyEnabled: false,
    weeklyNoteFolder: "/weekly",
    weeklyNoteFormat: "gggg-Www",
    weeklyNoteTemplate: "",
    weekStart: "locale",
    wordsPerDot: 250,
    confirmBeforeCreate: true,
    localeOverride: "system-default",
    showWeekNumbers: false,
    debugMessages: false,
};

export function normalizeCalendarSettings(raw: unknown): CalendarSettings {
    const data = (raw ?? {}) as Partial<CalendarSettings>;
    return {
        ...DEFAULT_CALENDAR_SETTINGS,
        ...data,
        weekStart: normalizeWeekStart(data.weekStart),
        wordsPerDot: normalizeWordsPerDot(data.wordsPerDot),
        debugMessages: normalizeDebugMessages(data.debugMessages),
        localeOverride: normalizeLocaleOverride(data.localeOverride),
    };
}

function normalizeWordsPerDot(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return DEFAULT_CALENDAR_SETTINGS.wordsPerDot;
    }
    if (value < 0) {
        return 0;
    }
    return Math.floor(value);
}

const VALID_WEEK_START = [
    "locale",
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const;

function normalizeWeekStart(value: unknown): CalendarSettings["weekStart"] {
    if (typeof value === "string" && VALID_WEEK_START.includes(value as (typeof VALID_WEEK_START)[number])) {
        return value as CalendarSettings["weekStart"];
    }
    return DEFAULT_CALENDAR_SETTINGS.weekStart;
}

function normalizeLocaleOverride(value: unknown): string {
    if (typeof value !== "string") {
        return DEFAULT_CALENDAR_SETTINGS.localeOverride;
    }
    const normalized = value.trim().replace(/_/g, "-");
    if (!normalized) {
        return DEFAULT_CALENDAR_SETTINGS.localeOverride;
    }
    return normalized;
}

function normalizeDebugMessages(value: unknown): boolean {
    if (typeof value !== "boolean") {
        return DEFAULT_CALENDAR_SETTINGS.debugMessages;
    }
    return value;
}
