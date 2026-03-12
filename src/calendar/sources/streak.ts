import type { CalendarMetadata, CalendarSourceContext } from "../types";

export async function streakDaily(ctx: CalendarSourceContext): Promise<CalendarMetadata | null> {
    if (!ctx.dailyDoc) {
        return null;
    }
    return {
        classes: ["has-note"],
        details: [{ label: "streak", value: "1" }],
    };
}

export async function streakWeekly(ctx: CalendarSourceContext): Promise<CalendarMetadata | null> {
    if (!ctx.weeklyDoc) {
        return null;
    }
    return {
        classes: ["has-week-note"],
    };
}
