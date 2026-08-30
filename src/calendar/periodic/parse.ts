import type { CalendarGranularity } from "../types";

const FORMAT_TOKEN_REGEX = /(YYYY|MM|DD|gggg|ww)/g;
const DAY_MS = 24 * 60 * 60 * 1000;
export type WeekStartOption =
    | "locale"
    | "sunday"
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday";

export function getDateUID(date: Date, granularity: CalendarGranularity, weekStart: WeekStartOption = "monday"): string {
    const normalized = granularity === "week" ? startOfWeek(date, weekStart) : startOfDay(date);
    return `${granularity}-${normalized.toISOString()}`;
}

export function formatDateByPattern(date: Date, format: string, weekStart: WeekStartOption = "monday"): string {
    const weekInfo = getWeekInfoByStart(date, weekStart);
    const tokenValues: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        MM: String(date.getMonth() + 1).padStart(2, "0"),
        DD: String(date.getDate()).padStart(2, "0"),
        gggg: String(weekInfo.weekYear),
        ww: String(weekInfo.week).padStart(2, "0"),
    };
    return format.replace(FORMAT_TOKEN_REGEX, (token) => tokenValues[token] ?? token);
}

export function parseDateByPattern(
    title: string,
    format: string,
    granularity: CalendarGranularity,
    weekStart: WeekStartOption = "monday",
): Date | null {
    const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenOrder: string[] = [];
    const regexBody = escaped.replace(FORMAT_TOKEN_REGEX, (token) => {
        tokenOrder.push(token);
        return token === "ww" ? "(\\d{1,2})" : "(\\d{1,4})";
    });
    const regex = new RegExp(`^${regexBody}$`);
    const match = title.match(regex);
    if (!match) {
        return null;
    }
    const groups: Record<string, number> = {};
    tokenOrder.forEach((token, index) => {
        groups[token] = Number(match[index + 1]);
    });
    if (granularity === "day") {
        const year = groups.YYYY;
        const month = groups.MM;
        const day = groups.DD;
        if (!year || !month || !day) {
            return null;
        }
        const result = new Date(year, month - 1, day);
        return Number.isNaN(result.getTime()) ? null : startOfDay(result);
    }

    const weekYear = groups.gggg;
    const week = groups.ww;
    if (!weekYear || !week) {
        return null;
    }
    return weekStartDate(weekYear, week, weekStart);
}

/**
 * Parse a periodic note date from a document's hpath.
 *
 * The format may contain sub-paths (e.g. "YYYY/MM/YYYY-MM-DD"), in which case
 * the folder-relative path (e.g. "2026/08/2026-08-30") is the string that matches
 * the format, not just the last path segment. The folder-relative path is tried
 * first, then the last segment (preserves the prior behavior for flat formats
 * and for notes with extra nesting beyond the format), then the fallback title.
 */
export function parseNoteDate(
    hpath: string,
    folder: string,
    fallbackTitle: string,
    format: string,
    granularity: CalendarGranularity,
    weekStart: WeekStartOption = "monday",
): Date | null {
    for (const candidate of noteNameCandidates(hpath, folder, fallbackTitle)) {
        const date = parseDateByPattern(candidate, format, granularity, weekStart);
        if (date) {
            return date;
        }
    }
    return null;
}

function noteNameCandidates(hpath: string, folder: string, fallbackTitle: string): string[] {
    const path = (hpath ?? "").trim().replace(/^\/+/, "");
    const folderPath = (folder ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
    const candidates: string[] = [];
    if (path && path !== folderPath) {
        const relative =
            folderPath && path.startsWith(`${folderPath}/`) ? path.slice(folderPath.length + 1) : path;
        candidates.push(relative);
        const last = path.split("/").filter(Boolean).pop();
        if (last && last !== relative) {
            candidates.push(last);
        }
    }
    if (fallbackTitle && !candidates.includes(fallbackTitle)) {
        candidates.push(fallbackTitle);
    }
    return candidates;
}

export function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, amount: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
}

export function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfISOWeek(date: Date): Date {
    const normalized = startOfDay(date);
    const day = normalized.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    return addDays(normalized, offset);
}

export function startOfWeek(date: Date, weekStart: WeekStartOption = "locale"): Date {
    const normalized = startOfDay(date);
    const firstDay = resolveWeekStartDay(weekStart);
    const day = normalized.getDay();
    const offset = (day - firstDay + 7) % 7;
    return addDays(normalized, -offset);
}


/**
 * Week info for weeks starting on the resolved `weekStart` day. Week 1 of a year
 * is the week containing Jan 4 of that year (ISO-compatible when the week
 * starts on Monday). The week year is the year containing the week's 4th day
 * (Thursday for Monday-start weeks).
 */
export function getWeekInfoByStart(date: Date, weekStart: WeekStartOption): { week: number; weekYear: number } {
    const weekStartDay = startOfWeek(date, weekStart);
    const weekYear = addDays(weekStartDay, 3).getFullYear();
    const week1Start = startOfWeek(new Date(weekYear, 0, 4), weekStart);
    const diffMs = weekStartDay.getTime() - week1Start.getTime();
    const week = Math.floor(diffMs / (7 * DAY_MS)) + 1;
    return { week, weekYear };
}

/**
 * Inverse of `getWeekInfoByStart`: the first day of week `week` of `weekYear`
 * under the resolved `weekStart` day.
 */
export function weekStartDate(weekYear: number, week: number, weekStart: WeekStartOption): Date | null {
    if (week < 1 || week > 53) {
        return null;
    }
    const week1Start = startOfWeek(new Date(weekYear, 0, 4), weekStart);
    const result = addDays(week1Start, (week - 1) * 7);
    return Number.isNaN(result.getTime()) ? null : startOfDay(result);
}

export function getWeekNumber(date: Date): number {
    return getWeekNumberByStart(date, "locale");
}

export function getWeekNumberByStart(date: Date, weekStart: WeekStartOption = "locale"): number {
    return getWeekInfoByStart(date, weekStart).week;
}

export function getWeekdayLabels(weekStart: WeekStartOption = "locale", locale = navigator.language): string[] {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const week = [];
    const firstDay = resolveWeekStartDay(weekStart);
    // 2024-01-07 is Sunday, used as stable base.
    const baseSunday = new Date(2024, 0, 7);
    for (let i = 0; i < 7; i += 1) {
        const day = addDays(baseSunday, (firstDay + i) % 7);
        week.push(formatter.format(day));
    }
    return week;
}

const WEEKDAY_TO_JS_DAY: Record<Exclude<WeekStartOption, "locale">, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};

export function resolveWeekStartDay(weekStart: WeekStartOption): number {
    const day = WEEKDAY_TO_JS_DAY[weekStart as keyof typeof WEEKDAY_TO_JS_DAY];
    if (typeof day === "number") {
        return day;
    }
    return getLocaleFirstDay();
}

function getLocaleFirstDay(): number {
    try {
        const locale = new Intl.Locale(navigator.language);
        const firstDay = locale.weekInfo?.firstDay;
        if (typeof firstDay === "number") {
            // Intl Locale uses 1..7 (Mon..Sun). JS Date uses 0..6 (Sun..Sat).
            return firstDay % 7;
        }
    } catch (_error) {
        // Fallback below.
    }
    return 1;
}
