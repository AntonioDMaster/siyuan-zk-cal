import { sql } from "@/api";

export interface SiyuanDocRow {
    id: string;
    box: string;
    path: string;
    hpath: string;
    content: string;
}

export async function listAllDocumentRoots(): Promise<SiyuanDocRow[]> {
    const statement = "select id, box, path, hpath, content from blocks where type = 'd'";
    const result = await sql(statement);
    return (result ?? []) as SiyuanDocRow[];
}

export async function getDocumentById(docId: string): Promise<SiyuanDocRow | null> {
    const statement = `select id, box, path, hpath, content from blocks where type = 'd' and id = '${docId}' limit 1`;
    const result = await sql(statement);
    return ((result ?? [])[0] as SiyuanDocRow) ?? null;
}
