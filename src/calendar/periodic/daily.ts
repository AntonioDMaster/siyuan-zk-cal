import type { CalendarSettings, DebugLogger, PeriodicDoc } from "../types";
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
import { getFolderRootIDs, listAllDocumentRoots, listFolderDocRows, resolveDocHPath, type SiyuanDocRow } from "../adapters/siyuan-search";
import { formatDateByPattern, getDateUID, parseNoteDate } from "./parse";
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

export async function getAllDailyNotes(settings: CalendarSettings, debug?: DebugLogger): Promise<Record<string, PeriodicDoc>> {
    const folder = normalizeFolder(settings.dailyNoteFolder);
    // Notes under the configured folder are listed from the kernel blocktree
    // index + disk doc tree (current right after creation); the `blocks`
    // table lags on some setups, so it remains a fallback only.
    const docs =
        folder && settings.notebookId
            ? await listFolderDocRows(settings.notebookId, folder, debug)
            : await listAllDocumentRoots(debug);
    const mapped: Record<string, PeriodicDoc> = {};
    const folderRootIDs =
        folder && !docs.some((row) => row.hpath) ? await getFolderRootIDs(settings.notebookId, folder) : [];
    for (const row of docs) {
        if (folder && !isDocInFolder(row, folder, folderRootIDs, settings.notebookId)) {
            continue;
        }
        let hpath = row.hpath;
        let title = inferTitle(hpath, row.path, row.content);
        let date = parseNoteDate(hpath, folder, title, settings.dailyNoteFormat, "day");
        if (!date && !hpath) {
            // Older kernels have no blocks.hpath; the data-path segment is a doc id,
            // so try the content (doc title) first, then the kernel blocktree API.
            const contentTitle = (row.content ?? "").trim();
            if (contentTitle) {
                date = parseNoteDate("", folder, contentTitle, settings.dailyNoteFormat, "day");
            }
            if (!date) {
                hpath = await resolveDocHPath(row);
                title = hpath ? hpath.split("/").filter(Boolean).pop() || title : title;
                date = parseNoteDate(hpath, folder, title, settings.dailyNoteFormat, "day");
            }
        }
        if (!date) {
            continue;
        }
        const dateUID = getDateUID(date, "day");
        mapped[dateUID] = {
            id: row.id,
            box: row.box,
            path: row.path,
            hpath,
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

export async function createDailyNote(
    date: Date,
    settings: CalendarSettings,
    debug?: DebugLogger,
): Promise<string | null> {
    if (!settings.notebookId) {
        debug?.("createDailyNote: no notebook selected, aborting");
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
        debug?.("createDailyNote: using plugin folder path", { path, template: effectiveTemplatePath || null });
        if (effectiveTemplatePath) {
            const docId = await createDocWithMd(notebookId, path, "");
            if (!docId) {
                debug?.("createDailyNote: createDocWithMd failed", { path });
                return null;
            }
            await renderTemplateToDocument(docId, effectiveTemplatePath);
            debug?.("createDailyNote: daily note created", { docId, path });
            return docId;
        }
        const docId = await createDocumentWithMarkdown(notebookId, path, `# ${title}\n`);
        if (!docId) {
            debug?.("createDailyNote: createDocumentWithMarkdown failed", { path });
            return null;
        }
        debug?.("createDailyNote: daily note created", { docId, path });
        return docId;
    }

    if (savePath) {
        const pathTemplate = buildSavePathTemplate(savePath);
        const dateStr = formatDateByPattern(date, "YYYY-MM-DD");
        const templateWithDate = pathTemplate.replace(/\[\[dateSlot\]\]/g, dateStr);
        const renderedPath = await renderSprig(templateWithDate);
        if (!renderedPath || typeof renderedPath !== "string") {
            debug?.("createDailyNote: sprig rendering of dailyNoteSavePath failed", { savePath });
            return null;
        }
        debug?.("createDailyNote: using notebook dailyNoteSavePath", { path: renderedPath, template: effectiveTemplatePath || null });
        const docId = await createDocWithMd(notebookId, renderedPath, "");
        if (!docId) {
            debug?.("createDailyNote: createDocWithMd failed", { path: renderedPath });
            return null;
        }
        if (effectiveTemplatePath) {
            await renderTemplateToDocument(docId, effectiveTemplatePath);
        }
        const attrValue = formatDateByPattern(date, "YYYYMMDD");
        await setBlockAttrs(docId, { "custom-dailynote-yyyyMMdd": attrValue });
        debug?.("createDailyNote: daily note created", { docId, path: renderedPath });
        return docId;
    }

    const path = `/${title}`;
    const template = await readTemplateContent(pluginTemplate ?? "");
    const markdown = template ? applyTemplateTokens(template, date, settings.dailyNoteFormat) : `# ${title}\n`;
    debug?.("createDailyNote: using notebook root path", { path, template: pluginTemplate || null });
    const docId = await createDocumentWithMarkdown(notebookId, path, markdown);
    if (!docId) {
        debug?.("createDailyNote: createDocumentWithMarkdown failed", { path });
        return null;
    }
    debug?.("createDailyNote: daily note created", { docId, path });
    return docId;
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

/**
 * Whether a doc row lives inside the folder. Uses `blocks.hpath` when present;
 * on older kernels (no hpath column) matches by data path, where descendants
 * are stored under their parent doc id (e.g. `/<folderRootId>/<docId>.sy`).
 */
function isDocInFolder(row: SiyuanDocRow, folder: string, folderRootIDs: string[], notebookId: string): boolean {
    if (!folder) {
        return true;
    }
    if (row.hpath) {
        return isPathInFolder(row.hpath, folder);
    }
    if (notebookId && row.box !== notebookId) {
        return false;
    }
    return folderRootIDs.some((rootID) => row.path.startsWith(`/${rootID}/`));
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
