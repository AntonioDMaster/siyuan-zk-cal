import type { CalendarMetadata, CalendarSource, CalendarSourceContext } from "../types";
import { streakDaily, streakWeekly } from "./streak";
import { tagsDaily } from "./tags";
import { tasksDaily } from "./tasks";
import { wordCountDaily } from "./wordCount";

export function createDefaultSources(i18n: Record<string, string>): CalendarSource[] {
    return [
        {
            id: "streak",
            label: i18n["calendar.source.streak"] ?? "Streak",
            getDailyMetadata: streakDaily,
            getWeeklyMetadata: streakWeekly,
        },
        {
            id: "wordCount",
            label: i18n["calendar.source.wordCount"] ?? "Word Count",
            getDailyMetadata: wordCountDaily,
        },
        {
            id: "tasks",
            label: i18n["calendar.source.tasks"] ?? "Tasks",
            getDailyMetadata: tasksDaily,
        },
        {
            id: "tags",
            label: i18n["calendar.source.tags"] ?? "Tags",
            getDailyMetadata: tagsDaily,
        },
    ];
}

export async function evaluateDailySources(sources: CalendarSource[], ctx: CalendarSourceContext): Promise<CalendarMetadata> {
    const metadataList = await Promise.all(sources.map((source) => source.getDailyMetadata?.(ctx) ?? Promise.resolve(null)));
    return mergeMetadata(metadataList);
}

export async function evaluateWeeklySources(sources: CalendarSource[], ctx: CalendarSourceContext): Promise<CalendarMetadata> {
    const metadataList = await Promise.all(sources.map((source) => source.getWeeklyMetadata?.(ctx) ?? Promise.resolve(null)));
    return mergeMetadata(metadataList);
}

function mergeMetadata(list: Array<CalendarMetadata | null>): CalendarMetadata {
    const merged: CalendarMetadata = { classes: [], dataAttributes: {}, dots: [], details: [] };
    for (const item of list) {
        if (!item) {
            continue;
        }
        if (item.classes) {
            merged.classes?.push(...item.classes);
        }
        if (item.dataAttributes) {
            merged.dataAttributes = { ...merged.dataAttributes, ...item.dataAttributes };
        }
        if (item.dots) {
            merged.dots?.push(...item.dots);
        }
        if (item.details) {
            merged.details?.push(...item.details);
        }
    }
    return merged;
}
