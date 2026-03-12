import type { CalendarMetadata, CalendarSourceContext, CalendarDot } from "../types";

/** Uses SiYuan kernel document stat (getTreeStat). Solid dot per full wordsPerDot, one dotted for remainder below threshold. */
export async function wordCountDaily(ctx: CalendarSourceContext): Promise<CalendarMetadata | null> {
    if (!ctx.dailyDoc) {
        return null;
    }
    if (ctx.settings.wordsPerDot === 0) {
        return null;
    }
    const words = ctx.docStat?.wordCount ?? 0;
    const threshold = Math.max(1, ctx.settings.wordsPerDot);
    if (words <= 0) {
        return { details: [{ label: "words", value: "0" }] };
    }
    const fullDots = Math.floor(words / threshold);
    const hasRemainder = words % threshold > 0;
    const solidCount = fullDots;
    const dottedCount = hasRemainder ? 1 : 0;
    const dots: CalendarDot[] = [
        ...Array.from({ length: solidCount }, () => ({ type: "solid" as const, sourceId: "wordCount", value: words })),
        ...Array.from({ length: dottedCount }, () => ({ type: "dotted" as const, sourceId: "wordCount", value: words })),
    ];
    return {
        dots,
        details: [{ label: "words", value: String(words) }],
    };
}
