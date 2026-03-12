import type { CalendarMetadata, CalendarSourceContext } from "../types";

const OPEN_TASK_REGEX = /-\s\[\s\]\s/g;

export async function tasksDaily(ctx: CalendarSourceContext): Promise<CalendarMetadata | null> {
    if (!ctx.dailyDoc || !ctx.markdown) {
        return null;
    }
    const openTaskCount = ctx.markdown.match(OPEN_TASK_REGEX)?.length ?? 0;
    if (openTaskCount <= 0) {
        return null;
    }
    return {
        dots: [{ type: "hollow", sourceId: "tasks" }],
        details: [{ label: "tasks", value: String(openTaskCount) }],
    };
}
