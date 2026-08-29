export type CalendarGranularity = "day" | "week";

/** Optional debug logger; prints to the dev console only when the "Debug messages" setting is on. */
export type DebugLogger = (message: string, extra?: Record<string, unknown>) => void;

export interface CalendarSettings {
    notebookId: string;
    dailyNoteFolder: string;
    dailyNoteFormat: string;
    dailyNoteTemplate: string;
    weeklyEnabled: boolean;
    weeklyNoteFolder: string;
    weeklyNoteFormat: string;
    weeklyNoteTemplate: string;
    weekStart: "locale" | "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
    wordsPerDot: number;
    confirmBeforeCreate: boolean;
    debugMessages: boolean;
    localeOverride: string;
    showWeekNumbers: boolean;
}

export interface PeriodicDoc {
    id: string;
    box: string;
    path: string;
    hpath: string;
    title: string;
    dateUID: string;
    granularity: CalendarGranularity;
    date: Date;
}

export interface CalendarDot {
    type: "solid" | "hollow" | "dotted";
    sourceId: string;
    color?: string;
    value?: number;
}

export interface CalendarMetadata {
    classes?: string[];
    dataAttributes?: Record<string, string>;
    dots?: CalendarDot[];
    details?: Array<{ label: string; value: string }>;
}

/** SiYuan document tree stat (word/rune count from kernel). */
export interface DocTreeStat {
    wordCount: number;
    runeCount: number;
    blockCount: number;
}

export interface CalendarSourceContext {
    date: Date;
    dailyDoc?: PeriodicDoc | null;
    weeklyDoc?: PeriodicDoc | null;
    markdown?: string;
    /** SiYuan kernel document stat for daily doc (from /api/block/getTreeStat). */
    docStat?: DocTreeStat | null;
    settings: CalendarSettings;
}

export interface CalendarSource {
    id: string;
    label: string;
    getDailyMetadata?: (ctx: CalendarSourceContext) => Promise<CalendarMetadata | null>;
    getWeeklyMetadata?: (ctx: CalendarSourceContext) => Promise<CalendarMetadata | null>;
}

export interface CalendarCellData {
    date: Date;
    isToday: boolean;
    isCurrentMonth: boolean;
    dailyDoc: PeriodicDoc | null;
    weeklyDoc: PeriodicDoc | null;
    metadata: CalendarMetadata;
}

export interface CalendarWeekData {
    weekDate: Date;
    weekNumber: number;
    weeklyDoc: PeriodicDoc | null;
}
