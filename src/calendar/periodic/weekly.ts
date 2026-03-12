import type { CalendarSettings, PeriodicDoc } from "../types";
import { createDocWithMd, getSystemConf, prependBlock, render } from "@/api";
import { createDocumentWithMarkdown, readTemplateContent } from "../adapters/siyuan-filetree";
import { listAllDocumentRoots } from "../adapters/siyuan-search";
import { formatDateByPattern, getDateUID, getWeekNumberByStart, parseDateByPattern, startOfWeek } from "./parse";
import { applyTemplateTokens } from "./template";

export async function getAllWeeklyNotes(settings: CalendarSettings): Promise<Record<string, PeriodicDoc>> {
    const docs = await listAllDocumentRoots();
    const mapped: Record<string, PeriodicDoc> = {};
    const folder = normalizeFolder(settings.weeklyNoteFolder);
    for (const row of docs) {
        if (folder && !isPathInFolder(row.path, folder)) {
            continue;
        }
        const title = inferTitle(row.hpath, row.path, row.content);
        const date = parseDateByPattern(title, settings.weeklyNoteFormat, "week");
        if (!date) {
            continue;
        }
        const weekDate = startOfWeek(date, settings.weekStart);
        const dateUID = getDateUID(weekDate, "week", settings.weekStart);
        mapped[dateUID] = {
            id: row.id,
            box: row.box,
            path: row.path,
            hpath: row.hpath,
            title,
            granularity: "week",
            dateUID,
            date: weekDate,
        };
    }
    return mapped;
}

export function getWeeklyNote(
    date: Date,
    notes: Record<string, PeriodicDoc>,
    weekStart: CalendarSettings["weekStart"] = "locale",
): PeriodicDoc | null {
    return notes[getDateUID(date, "week", weekStart)] ?? null;
}

export async function createWeeklyNote(date: Date, settings: CalendarSettings): Promise<string | null> {
    if (!settings.notebookId) {
        return null;
    }
    const weekDate = startOfWeek(date, settings.weekStart);
    const title = formatDateByPattern(weekDate, settings.weeklyNoteFormat);
    const path = `${normalizeFolder(settings.weeklyNoteFolder)}/${title}`;
    const templatePath = settings.weeklyNoteTemplate?.trim();

    if (templatePath) {
        const docId = await createDocWithMd(settings.notebookId, path, "");
        if (!docId) {
            return null;
        }
        const sysConf = await getSystemConf();
        const dataDir = sysConf?.conf?.system?.dataDir ?? "";
        const fullTemplatePath = `${dataDir}/templates/${templatePath.replace(/^\/+/, "")}`;
        const rendered = await render(docId, fullTemplatePath);
        if (rendered?.content) {
            await prependBlock("dom", rendered.content, docId);
        }
        return docId;
    }

    const template = await readTemplateContent(settings.weeklyNoteTemplate);
    const markdown = template ? applyTemplateTokens(template, weekDate, settings.weeklyNoteFormat) : `# ${title}\n`;
    return createDocumentWithMarkdown(settings.notebookId, path, markdown);
}

export function formatWeekLabel(date: Date): string {
    const week = getWeekNumberByStart(date, "locale");
    return `W${String(week).padStart(2, "0")}`;
}

function inferTitle(hpath: string, path: string, content: string): string {
    const hpathTitle = hpath?.split("/").filter(Boolean).pop();
    if (hpathTitle) {
        return hpathTitle;
    }
    const pathTitle = path?.split("/").filter(Boolean).pop()?.replace(/\.sy$/, "");
    if (pathTitle) {
        return pathTitle;
    }
    return content ?? "";
}

function normalizeFolder(input: string): string {
    if (!input) {
        return "";
    }
    let folder = input.trim();
    if (!folder.startsWith("/")) {
        folder = `/${folder}`;
    }
    return folder.replace(/\/+$/, "");
}

function normalizePathForCompare(path: string): string {
    const normalized = (path ?? "").trim().replace(/^\/+/, "");
    return `/${normalized}`;
}

function isPathInFolder(path: string, folder: string): boolean {
    if (!folder) {
        return true;
    }
    const normalizedPath = normalizePathForCompare(path);
    const normalizedFolder = normalizePathForCompare(folder);
    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}
