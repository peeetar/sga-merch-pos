"use server";

import { revalidatePath } from "next/cache";
import { requireBoard } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { deleteDoc, recordDoc, type Doc } from "@/lib/files";

export async function addDocs(files: { pathname: string; name: string }[], folder: string, tags: string[]): Promise<Doc[]> {
  const me = await requireBoard();
  const out: Doc[] = [];
  for (const f of files.slice(0, 50)) out.push(await recordDoc(f.pathname, f.name, folder.trim() || "General", tags, me.email));
  revalidatePath("/documents");
  return out;
}

export async function updateDoc(id: string, patch: { name: string; folder: string; tags: string[]; note: string }) {
  await requireBoard();
  await ensureSchema();
  await sql()`UPDATE hub_docs SET name = ${patch.name.trim().slice(0, 200)}, folder = ${patch.folder.trim().slice(0, 60) || "General"},
    tags = ${patch.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12)}, note = ${patch.note.slice(0, 1000)} WHERE id = ${id}`;
  revalidatePath("/documents");
}

export async function removeDoc(id: string) {
  await requireBoard();
  await deleteDoc(id);
  revalidatePath("/documents");
  revalidatePath("/finance");
}
