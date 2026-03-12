import type { CalendarSettings, PeriodicDoc } from "../types";
import {
    createDocWithMd,
    getNotebookConf,
    getSystemConf,
    prependBlock,
    render,
    renderSprig,
    setBlockAttrs,
} from "@/api";
import { createDocumentWithMarkdown, readTemplateContent } from "../adapters/siyuan-filetree";
import { listAllDocumentRoots } from "../adapters/siyuan-search";
import { formatDateByPattern, getDateUID, parseDateByPattern } from "./parse";
import { applyTemplateTokens } from "./template";

/**
 * Build path template for SiYuan Sprig: replace Go-style {{.now.Format "..."}} with
 * Sprig (toDate "2006-01-02" "[[dateSlot]]"), then substitute [[dateSlot]] with the date string.
 */
function buildSavePathTemplate(notebookSavePath: string): string {
    return notebookSavePath.replace(/\{\{(.*?)\}\}/g, (match) =>
        match.replace(/\bnow\b(?=(?:(?:[^"]*"){2})*[^"]*$)/g, '(toDate "2006-01-02" "[[dateSlot]]")')
    );
}

export async function getAllDailyNotes(settings: CalendarSettings): Promise<Record<string, PeriodicDoc>> {
    const docs = await listAllDocumentRoots();
    const mapped: Record<string, PeriodicDoc> = {};
    const folder = normalizeFolder(settings.dailyNoteFolder);
    for (const row of docs) {
        if (folder && !isPathInFolder(row.path, folder)) {
            continue;
        }
        const title = inferTitle(row.hpath, row.path, row.content);
        const date = parseDateByPattern(title, settings.dailyNoteFormat, "day");
        if (!date) {
            continue;
        }
        const dateUID = getDateUID(date, "day");
        mapped[dateUID] = {
            id: row.id,
            box: row.box,
            path: row.path,
            hpath: row.hpath,
            title,
            granularity: "day",
            dateUID,
            date,
        };
    }
    return mapped;
}

export function getDailyNote(date: Date, notes: Record<string, PeriodicDoc>): PeriodicDoc | null {
    return notes[getDateUID(date, "day")] ?? null;
}

/**
 * Returns the rendered daily note name/path for a date (whether or not the note exists).
 * Uses notebook dailyNoteSavePath + renderSprig when set, else plugin folder + format.
 */
export async function getRenderedDailyNoteName(date: Date, settings: CalendarSettings): Promise<string> {
    const title = formatDateByPattern(date, settings.dailyNoteFormat);
    const folder = normalizeFolder(settings.dailyNoteFolder);
    let result: string;
    if (folder) {
        result = buildPathWithFolder(folder, title);
    } else if (!settings.notebookId) {
        result = title;
    } else {
        const confRes = await getNotebookConf(settings.notebookId);
        const savePath = confRes?.conf?.dailyNoteSavePath?.trim();
        if (savePath) {
            const pathTemplate = buildSavePathTemplate(savePath);
            const dateStr = formatDateByPattern(date, "YYYY-MM-DD");
            const templateWithDate = pathTemplate.replace(/\[\[dateSlot\]\]/g, dateStr);
            const rendered = await renderSprig(templateWithDate);
            if (rendered && typeof rendered === "string") {
                result = rendered;
            } else {
                result = title;
            }
        } else {
            result = title;
        }
    }
    if (!folder && result.startsWith("/")) {
        return result.replace(/^\/+/, "");
    }
    return result;
}

export async function createDailyNote(date: Date, settings: CalendarSettings): Promise<string | null> {
    if (!settings.notebookId) {
        return null;
    }
    const notebookId = settings.notebookId;
    const confRes = await getNotebookConf(notebookId);
    const savePath = confRes?.conf?.dailyNoteSavePath?.trim();
    const templatePath = confRes?.conf?.dailyNoteTemplatePath?.trim();
    const folder = normalizeFolder(settings.dailyNoteFolder);
    const pluginTemplate = settings.dailyNoteTemplate?.trim();
    const effectiveTemplatePath = pluginTemplate || templatePath;
    const title = formatDateByPattern(date, settings.dailyNoteFormat);

    if (folder) {
        const path = `${folder}/${title}`;
        if (effectiveTemplatePath) {
            const docId = await createDocWithMd(notebookId, path, "");
            if (!docId) {
                return null;
            }
            await renderTemplateToDocument(docId, effectiveTemplatePath);
            return docId;
        }
        return createDocumentWithMarkdown(notebookId, path, `# ${title}\n`);
    }

    if (savePath) {
        const pathTemplate = buildSavePathTemplate(savePath);
        const dateStr = formatDateByPattern(date, "YYYY-MM-DD");
        const templateWithDate = pathTemplate.replace(/\[\[dateSlot\]\]/g, dateStr);
        const renderedPath = await renderSprig(templateWithDate);
        if (!renderedPath || typeof renderedPath !== "string") {
            return null;
        }
        const docId = await createDocWithMd(notebookId, renderedPath, "");
        if (!docId) {
            return null;
        }
        if (effectiveTemplatePath) {
            await renderTemplateToDocument(docId, effectiveTemplatePath);
        }
        const attrValue = formatDateByPattern(date, "YYYYMMDD");
        await setBlockAttrs(docId, { "custom-dailynote-yyyyMMdd": attrValue });
        return docId;
    }

    const path = `/${title}`;
    const template = await readTemplateContent(pluginTemplate ?? "");
    const markdown = template ? applyTemplateTokens(template, date, settings.dailyNoteFormat) : `# ${title}\n`;
    return createDocumentWithMarkdown(notebookId, path, markdown);
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

function buildPathWithFolder(folder: string, title: string): string {
    return `${normalizeFolder(folder)}/${title}`.replace(/^\/+/, "");
}

async function renderTemplateToDocument(docId: string, templatePath: string): Promise<void> {
    const sysConf = await getSystemConf();
    const dataDir = sysConf?.conf?.system?.dataDir ?? "";
    const fullTemplatePath = `${dataDir}/templates/${templatePath.replace(/^\/+/, "")}`;
    const rendered = await render(docId, fullTemplatePath);
    if (rendered?.content) {
        await prependBlock("dom", rendered.content, docId);
    }
}
