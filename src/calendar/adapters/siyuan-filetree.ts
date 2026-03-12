import { createDocWithMd, exportMdContent, getFile, lsNotebooks, removeDoc } from "@/api";
import { openTab } from "siyuan";

export interface NotebookInfo {
    id: string;
    name: string;
    closed: boolean;
}

export async function getOpenNotebooks(): Promise<NotebookInfo[]> {
    const result = await lsNotebooks();
    const notebooks = result?.notebooks ?? [];
    return notebooks.filter((item) => !item.closed).map((item) => ({
        id: item.id,
        name: item.name,
        closed: item.closed,
    }));
}

export async function createDocumentWithMarkdown(notebookId: string, path: string, markdown: string): Promise<string | null> {
    const docId = await createDocWithMd(notebookId, path, markdown);
    return docId ?? null;
}

export async function openDocument(docId: string): Promise<void> {
    await openTab({
        app: window.siyuan?.ws?.app,
        doc: { id: docId },
    });
}

export async function removeDocument(notebookId: string, path: string): Promise<void> {
    await removeDoc(notebookId, path);
}

export async function readTemplateContent(path: string): Promise<string> {
    if (!path) {
        return "";
    }
    const response = await getFile(path);
    if (!response) {
        return "";
    }
    if (typeof response === "string") {
        return response;
    }
    if (typeof response?.data === "string") {
        return response.data;
    }
    return "";
}

export async function exportDocumentMarkdown(docId: string): Promise<string> {
    const response = await exportMdContent(docId);
    return response?.content ?? "";
}
