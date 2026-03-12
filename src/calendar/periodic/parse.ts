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

export function formatDateByPattern(date: Date, format: string): string {
    const iso = getISOWeekInfo(date);
    const tokenValues: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        MM: String(date.getMonth() + 1).padStart(2, "0"),
        DD: String(date.getDate()).padStart(2, "0"),
        gggg: String(iso.weekYear),
        ww: String(iso.week).padStart(2, "0"),
    };
    return format.replace(FORMAT_TOKEN_REGEX, (token) => tokenValues[token] ?? token);
}

export function parseDateByPattern(title: string, format: string, granularity: CalendarGranularity): Date | null {
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
    return isoWeekToDate(weekYear, week);
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

export function getISOWeekInfo(date: Date): { week: number; weekYear: number } {
    const target = startOfDay(date);
    const thursday = addDays(target, 3 - ((target.getDay() + 6) % 7));
    const weekYear = thursday.getFullYear();
    const firstThursday = new Date(weekYear, 0, 4);
    const firstThursdayWeekStart = addDays(firstThursday, -((firstThursday.getDay() + 6) % 7));
    const diffMs = thursday.getTime() - firstThursdayWeekStart.getTime();
    const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    return { week, weekYear };
}

export function isoWeekToDate(weekYear: number, week: number): Date | null {
    if (week < 1 || week > 53) {
        return null;
    }
    const jan4 = new Date(weekYear, 0, 4);
    const week1Start = addDays(jan4, -((jan4.getDay() + 6) % 7));
    const result = addDays(week1Start, (week - 1) * 7);
    return Number.isNaN(result.getTime()) ? null : startOfDay(result);
}

export function getWeekNumber(date: Date): number {
    return getWeekNumberByStart(date, "locale");
}

export function getWeekNumberByStart(date: Date, weekStart: WeekStartOption = "locale"): number {
    const firstDay = resolveWeekStartDay(weekStart);
    if (firstDay === 1) {
        return getISOWeekInfo(date).week;
    }
    const normalized = startOfWeek(date, weekStart);
    const jan1 = new Date(normalized.getFullYear(), 0, 1);
    const firstWeekStart = startOfWeek(jan1, weekStart);
    const diff = normalized.getTime() - firstWeekStart.getTime();
    return Math.floor(diff / DAY_MS / 7) + 1;
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
