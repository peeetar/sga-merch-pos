"use client";

import { useState, useTransition } from "react";
import { sendTestAlert, startTerm } from "./actions";

export function TestAlert() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="row">
      <button className="btn btn--sm" disabled={busy} onClick={() => start(async () => setMsg(await sendTestAlert()))}>
        {busy ? "Sending…" : "Send a test alert"}
      </button>
      {msg && <span className="muted small">{msg}</span>}
    </div>
  );
}

const next = (t: string) => {
  const y = Number(t.slice(0, 4)) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

export function TermForm({ current }: { current: string }) {
  const [term, setTerm] = useState(next(current));
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form className="row" onSubmit={(e) => {
      e.preventDefault();
      if (!confirm(`Switch to ${term}? People listed under ${current} will no longer be able to sign in.`)) return;
      start(async () => setErr(await startTerm(term)));
    }}>
      <input className="field field--sm field--short" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="New term" />
      <button className="btn btn--sm" disabled={busy || term === current}>Switch term</button>
      {err && <span className="error">{err}</span>}
    </form>
  );
}
