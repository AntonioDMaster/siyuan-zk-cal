import type { CalendarSettings, DebugLogger, PeriodicDoc } from "../types";
import { createDocWithMd, getSystemConf, prependBlock, render } from "@/api";
import { createDocumentWithMarkdown, readTemplateContent } from "../adapters/siyuan-filetree";
import { getFolderRootIDs, listAllDocumentRoots, listFolderDocRows, resolveDocHPath, type SiyuanDocRow } from "../adapters/siyuan-search";
import { formatDateByPattern, getDateUID, getWeekNumberByStart, parseNoteDate, startOfWeek } from "./parse";
import { applyTemplateTokens } from "./template";

export async function getAllWeeklyNotes(settings: CalendarSettings, debug?: DebugLogger): Promise<Record<string, PeriodicDoc>> {
    const folder = normalizeFolder(settings.weeklyNoteFolder);
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
        let date = parseNoteDate(hpath, folder, title, settings.weeklyNoteFormat, "week", settings.weekStart);
        if (!date && !hpath) {
            // Older kernels have no blocks.hpath; the data-path segment is a doc id,
            // so try the content (doc title) first, then the kernel blocktree API.
            const contentTitle = (row.content ?? "").trim();
            if (contentTitle) {
                date = parseNoteDate("", folder, contentTitle, settings.weeklyNoteFormat, "week", settings.weekStart);
            }
            if (!date) {
                hpath = await resolveDocHPath(row);
                title = hpath ? hpath.split("/").filter(Boolean).pop() || title : title;
                date = parseNoteDate(hpath, folder, title, settings.weeklyNoteFormat, "week", settings.weekStart);
            }
        }
        if (!date) {
            continue;
        }
        const weekDate = startOfWeek(date, settings.weekStart);
        const dateUID = getDateUID(weekDate, "week", settings.weekStart);
        mapped[dateUID] = {
            id: row.id,
            box: row.box,
            path: row.path,
            hpath,
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

export async function createWeeklyNote(
    date: Date,
    settings: CalendarSettings,
    debug?: DebugLogger,
): Promise<string | null> {
    if (!settings.notebookId) {
        debug?.("createWeeklyNote: no notebook selected, aborting");
        return null;
    }
    const weekDate = startOfWeek(date, settings.weekStart);
    const title = formatDateByPattern(weekDate, settings.weeklyNoteFormat, settings.weekStart);
    const path = `${normalizeFolder(settings.weeklyNoteFolder)}/${title}`;
    const templatePath = settings.weeklyNoteTemplate?.trim();
    debug?.("createWeeklyNote: resolved path", { path, template: templatePath || null });

    if (templatePath) {
        const docId = await createDocWithMd(settings.notebookId, path, "");
        if (!docId) {
            debug?.("createWeeklyNote: createDocWithMd failed", { path });
            return null;
        }
        const sysConf = await getSystemConf();
        const dataDir = sysConf?.conf?.system?.dataDir ?? "";
        const fullTemplatePath = `${dataDir}/templates/${templatePath.replace(/^\/+/, "")}`;
        const rendered = await render(docId, fullTemplatePath);
        if (rendered?.content) {
            await prependBlock("dom", rendered.content, docId);
        }
        debug?.("createWeeklyNote: weekly note created", { docId, path });
        return docId;
    }

    const template = await readTemplateContent(settings.weeklyNoteTemplate);
    const markdown = template ? applyTemplateTokens(template, weekDate, settings.weeklyNoteFormat, settings.weekStart) : `# ${title}\n`;
    const docId = await createDocumentWithMarkdown(settings.notebookId, path, markdown);
    if (!docId) {
        debug?.("createWeeklyNote: createDocumentWithMarkdown failed", { path });
        return null;
    }
    debug?.("createWeeklyNote: weekly note created", { docId, path });
    return docId;
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
