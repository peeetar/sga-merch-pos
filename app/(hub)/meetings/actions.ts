"use server";

import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireBoard } from "@/lib/auth";
import { ensureSchema, setSetting, sql } from "@/lib/db";
import { areaOf } from "@/lib/files";
import { KINDS, type Kind } from "@/lib/meetings";

export type NewMeeting = { title: string; kind: Kind; held_on: string; start_time: string; attendees: string[]; others: string; audio_path: string };

export async function createMeeting(m: NewMeeting): Promise<{ id?: string; error?: string }> {
  const me = await requireBoard();
  if (!m.title.trim()) return { error: "Give it a title." };
  if (!(m.kind in KINDS)) return { error: "Pick a kind." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.held_on) || !/^\d{2}:\d{2}$/.test(m.start_time)) return { error: "Pick the date and time." };
  if (areaOf(m.audio_path) !== "meetings") return { error: "Upload the recording first." };
  await ensureSchema();
  const id = randomUUID();
  await sql()`INSERT INTO hub_meetings (id, title, kind, held_on, start_time, attendees, others, audio_path, status, created_by)
    VALUES (${id}, ${m.title.trim().slice(0, 120)}, ${m.kind}, ${m.held_on}::date, ${m.start_time}, ${JSON.stringify(m.attendees.slice(0, 40))}::jsonb,
            ${m.others.trim().slice(0, 300)}, ${m.audio_path}, 'upload', ${me.email})`;
  revalidatePath("/meetings");
  return { id };
}

export async function deleteMeeting(id: string) {
  await requireBoard();
  await ensureSchema();
  const [m] = (await sql()`DELETE FROM hub_meetings WHERE id = ${id} RETURNING audio_path`) as { audio_path: string | null }[];
  if (m?.audio_path) await del(m.audio_path).catch(() => {});
  revalidatePath("/meetings");
}

/** Go back a step, e.g. to rewrite the notes after fixing a name. */
export async function redoFrom(id: string, step: "transcribe" | "notes" | "notion") {
  await requireBoard();
  await ensureSchema();
  const [m] = (await sql()`SELECT audio_path, gemini_file, transcript, notes FROM hub_meetings WHERE id = ${id}`) as { audio_path: string | null; transcript: string | null; notes: unknown }[];
  if (!m) return;
  // Transcribing again needs the recording, which is deleted once filed.
  if (step === "transcribe" && !m.audio_path) return;
  const status = step === "transcribe" ? "upload" : step === "notes" && !m.transcript ? "upload" : step;
  await sql()`UPDATE hub_meetings SET status = ${status}, error = NULL, running_since = NULL, notion_url = CASE WHEN ${step} = 'notion' THEN NULL ELSE notion_url END WHERE id = ${id}`;
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
}

export async function saveMeetingSettings(context: string, fixes: string) {
  await requireBoard();
  await setSetting("meeting_context", context.slice(0, 8000));
  await setSetting("meeting_fixes", fixes.slice(0, 8000));
  revalidatePath("/meetings");
}
