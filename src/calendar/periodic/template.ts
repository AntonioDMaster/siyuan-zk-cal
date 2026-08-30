import { formatDateByPattern, type WeekStartOption } from "./parse";

export function applyTemplateTokens(
    template: string,
    date: Date,
    format: string,
    weekStart: WeekStartOption = "monday",
): string {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return template
        .replaceAll("{{date}}", formatDateByPattern(date, format, weekStart))
        .replaceAll("{{time}}", `${hh}:${min}:${ss}`)
        .replaceAll("{{yyyy}}", yyyy)
        .replaceAll("{{MM}}", mm)
        .replaceAll("{{dd}}", dd);
}
