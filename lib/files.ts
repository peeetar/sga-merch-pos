// Server only. Files live in a private Vercel Blob store: nothing is reachable
// by URL alone. Browsers upload straight to Blob (so phone photos and hour-long
// recordings aren't squeezed through a function's 4.5 MB request limit), then
// the hub records the file; reading goes through /api/files/<id>, which checks
// the board session first.
import { randomUUID } from "node:crypto";
import { del, head } from "@vercel/blob";
import { ensureSchema, sql } from "./db";

/** What may be uploaded where. The browser asks for a pathname under one of
 *  these prefixes, and the upload route signs only those. */
export const AREAS = {
  docs: { max: 50 * 1024 * 1024, types: ["image/*", "application/pdf", "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"] },
  receipts: { max: 20 * 1024 * 1024, types: ["image/*", "application/pdf"] },
  meetings: { max: 300 * 1024 * 1024, types: ["audio/*", "video/mp4", "video/quicktime"] },
} as const;
export type Area = keyof typeof AREAS;

export const blobConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export function areaOf(pathname: string): Area | null {
  const a = pathname.split("/")[0];
  return a in AREAS ? (a as Area) : null;
}

import type { Doc } from "./files-client";
export { fileUrl, humanSize, type Doc } from "./files-client";

/** Record a file the browser has just uploaded. head() proves it is really
 *  in the store, and gives the true size and type rather than the client's. */
export async function recordDoc(pathname: string, name: string, folder: string, tags: string[], by: string): Promise<Doc> {
  if (!areaOf(pathname) || areaOf(pathname) === "meetings") throw new Error("not a document path");
  const meta = await head(pathname);
  await ensureSchema();
  const rows = (await sql()`
    INSERT INTO hub_docs (id, pathname, name, content_type, size, folder, tags, uploaded_by)
    VALUES (${randomUUID()}, ${meta.pathname}, ${name.slice(0, 200) || meta.pathname}, ${meta.contentType || "application/octet-stream"},
            ${meta.size}, ${folder.slice(0, 60) || "General"}, ${tags.map((t) => t.slice(0, 40)).slice(0, 12)}, ${by})
    ON CONFLICT (pathname) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, pathname, name, content_type, size::int AS size, folder, tags, note, uploaded_by, created_at`) as Doc[];
  return rows[0];
}

export async function deleteDoc(id: string) {
  await ensureSchema();
  const rows = (await sql()`DELETE FROM hub_docs WHERE id = ${id} RETURNING pathname`) as { pathname: string }[];
  if (rows[0]) await del(rows[0].pathname).catch((err) => console.error("blob del", err));
}

