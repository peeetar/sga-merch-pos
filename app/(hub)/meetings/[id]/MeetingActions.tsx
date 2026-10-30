"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMeeting, redoFrom } from "../actions";

export default function MeetingActions({ id, status, hasError, hasAudio, hasNotes, filed }: {
  id: string; status: string; hasError: boolean; hasAudio: boolean; hasNotes: boolean; filed: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const retry = () => start(async () => {
    setMsg(null);
    const res = await fetch(`/api/meetings/${id}/step`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMsg(res.status === 409 ? "Another tab is already working on it." : body.ok ? null : body.error || "Still failing.");
    router.refresh();
  });
  return (
    <div className="row">
      {hasError && <button className="btn btn--sm btn--primary" disabled={busy} onClick={retry}>{busy ? "Working…" : "Try again"}</button>}
      {hasNotes && status === "done" && (
        <button className="btn btn--sm" disabled={busy} onClick={() => {
          if (confirm(filed ? "Rewrite the notes from the transcript? You'll then file them again, which makes a new Notion page; delete the old one there." : "Rewrite the notes from the transcript?")) start(() => redoFrom(id, "notes"));
        }}>Rewrite notes</button>
      )}
      {hasAudio && status !== "upload" && (
        <button className="btn btn--sm" disabled={busy} onClick={() => { if (confirm("Transcribe the recording again from scratch?")) start(() => redoFrom(id, "transcribe")); }}>Transcribe again</button>
      )}
      <span className="grow" />
      <button className="btn btn--sm btn--out" disabled={busy} onClick={() => {
        if (confirm("Delete this meeting from the hub? The Notion page, if any, stays.")) start(async () => { await deleteMeeting(id); router.push("/meetings"); });
      }}>Delete</button>
      {msg && <p className="error small">{msg}</p>}
    </div>
  );
}
