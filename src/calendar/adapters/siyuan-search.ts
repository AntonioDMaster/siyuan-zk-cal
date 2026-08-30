import { fetchSyncPost } from "siyuan";
import { getDocsInfo, getHPathByID, getIDsByHPath, listDocTree, type DocTreeFile } from "@/api";
import type { DebugLogger } from "../types";

export interface SiyuanDocRow {
    id: string;
    box: string;
    path: string;
    hpath: string;
    content: string;
}

function docRowsStatement(withHPath: boolean, docId?: string): string {
    const idFilter = docId ? ` and id = '${docId}' limit 1` : "";
    return `select id, box, path${withHPath ? ", hpath" : ""}, content from blocks where type = 'd'${idFilter}`;
}

async function queryDocRows(statement: string, debug?: DebugLogger): Promise<SiyuanDocRow[] | null> {
    try {
        const response = await fetchSyncPost("/api/query/sql", { stmt: statement });
        if (response.code !== 0) {
            debug?.("listAllDocumentRoots: sql query failed", { code: response.code, msg: response.msg, statement });
            return null;
        }
        return (response.data ?? []) as SiyuanDocRow[];
    } catch (error) {
        debug?.("listAllDocumentRoots: sql query threw", { statement, error: String(error) });
        return null;
    }
}

/**
 * List all document root rows. Newer kernels expose `hpath` (notebook-relative
 * human-readable path) on the `blocks` table; on older kernels the statement is
 * rejected ("no such column: hpath"), so we log the kernel error and fall back
 * to a statement without the column. Callers detect empty `hpath` and resolve
 * readable paths via the kernel blocktree API instead.
 */
export async function listAllDocumentRoots(debug?: DebugLogger): Promise<SiyuanDocRow[]> {
    const rows = await queryDocRows(docRowsStatement(true), debug);
    if (rows !== null) {
        const first = rows[0];
        if (first && typeof first.hpath === "string") {
            // debug?.("listAllDocumentRoots: blocks.hpath available", {
            //     rows: rows.length,
            //     sample: rows.slice(0, 2).map((row) => ({ id: row.id, path: row.path, hpath: row.hpath })),
            // });
            return rows;
        }
        debug?.("listAllDocumentRoots: hpath column missing from sql result, falling back", {
            rows: rows.length,
            keys: first ? Object.keys(first) : [],
        });
    }
    const fallback = await queryDocRows(docRowsStatement(false), debug);
    const docs = (fallback ?? []).map((row) => ({ ...(row as object), hpath: "" })) as SiyuanDocRow[];
    debug?.("listAllDocumentRoots: fallback rows without hpath", { rows: docs.length });
    return docs;
}

export async function getDocumentById(docId: string): Promise<SiyuanDocRow | null> {
    const rows = await queryDocRows(docRowsStatement(true, docId));
    const first = rows?.[0];
    if (first && typeof first.hpath === "string") {
        return first;
    }
    const fallback = await queryDocRows(docRowsStatement(false, docId));
    const row = fallback?.[0];
    return row ? ({ ...(row as object), hpath: "" } as SiyuanDocRow) : null;
}

/**
 * Notebook-relative readable path of a doc row: `blocks.hpath` when present,
 * otherwise the kernel blocktree API, which is maintained on all supported
 * kernel versions.
 */
export async function resolveDocHPath(row: SiyuanDocRow): Promise<string> {
    if (row.hpath) {
        return row.hpath;
    }
    try {
        const hpath = await getHPathByID(row.id);
        return typeof hpath === "string" ? hpath : "";
    } catch (_error) {
        return "";
    }
}

/**
 * Root doc ids of a folder by hpath, used to match docs by data path when
 * `blocks.hpath` is unavailable (older kernels).
 */
export async function getFolderRootIDs(notebookId: string, folder: string): Promise<string[]> {
    if (!notebookId || !folder) {
        return [];
    }
    try {
        const ids = await getIDsByHPath(notebookId, folder);
        return Array.isArray(ids) ? ids : [];
    } catch (_error) {
        return [];
    }
}

function collectDocIDs(files: DocTreeFile[]): string[] {
    const ids: string[] = [];
    const walk = (list: DocTreeFile[]): void => {
        for (const file of list) {
            ids.push(file.id);
            if (file.children && file.children.length > 0) {
                walk(file.children);
            }
        }
    };
    walk(files);
    return ids;
}

async function buildDocRows(notebookId: string, files: DocTreeFile[], rootHPath: string): Promise<SiyuanDocRow[]> {
    const docIDs = collectDocIDs(files);
    if (docIDs.length === 0) {
        return [];
    }
    const titles = new Map<string, string>();
    for (const info of await getDocsInfo(docIDs)) {
        titles.set(info.id, info.name ?? "");
    }
    const rows: SiyuanDocRow[] = [];
    const walk = (list: DocTreeFile[], prefix: string): void => {
        for (const file of list) {
            const title = titles.get(file.id) ?? "";
            const hpath = `${prefix}/${title}`;
            rows.push({ id: file.id, box: notebookId, path: "", hpath, content: title });
            if (file.children && file.children.length > 0) {
                walk(file.children, hpath);
            }
        }
    };
    walk(files, rootHPath);
    return rows;
}

/**
 * Doc rows under a folder, listed from sources that are current immediately
 * after creation: the kernel blocktree index (folder root ids) plus a
 * disk-based doc tree scan. The `blocks` table lags on some setups, so it
 * only serves as a fallback.
 */
export async function listFolderDocRows(notebookId: string, folder: string, debug?: DebugLogger): Promise<SiyuanDocRow[]> {
    const rows: SiyuanDocRow[] = [];
    for (const rootID of await getFolderRootIDs(notebookId, folder)) {
        const tree = await listDocTree(notebookId, `/${rootID}`);
        if (tree.length > 0) {
            rows.push(...(await buildDocRows(notebookId, tree, folder)));
        }
    }
    if (rows.length > 0) {
        //debug?.("listFolderDocRows: listed docs via blocktree + file tree", { folder, rows: rows.length });
        return rows;
    }
    // debug?.("listFolderDocRows: file tree listing empty, falling back to blocks table", { folder });
    return listAllDocumentRoots(debug);
}
