import type { CalendarMetadata, CalendarSourceContext } from "../types";

export async function tagsDaily(ctx: CalendarSourceContext): Promise<CalendarMetadata | null> {
    if (!ctx.dailyDoc || !ctx.markdown) {
        return null;
    }
    const tags = extractTags(ctx.markdown);
    if (tags.length === 0) {
        return null;
    }
    return {
        dataAttributes: {
            "data-tags": tags.join(","),
        },
        details: [{ label: "tags", value: tags.join(", ") }],
    };
}

function extractTags(markdown: string): string[] {
    const frontmatter = markdown.match(/^---[\s\S]*?---/);
    if (!frontmatter) {
        return [];
    }
    const tagLine = frontmatter[0].split("\n").find((line) => line.trim().startsWith("tags:"));
    if (!tagLine) {
        return [];
    }
    return tagLine
        .replace("tags:", "")
        .split(/[,\s]+/)
        .map((item) => item.trim().replace(/^[-\[\]"]+|[-\[\]"]+$/g, ""))
        .filter(Boolean);
}
