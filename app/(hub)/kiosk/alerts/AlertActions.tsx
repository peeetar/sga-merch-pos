"use client";

import { alertState } from "../live-actions";
import { useAct } from "../useAct";

export function AlertActions({ id, acked }: { id: number; acked: boolean }) {
  const { busy, run, note } = useAct();
  return (
    <div className="row row--tight">
      {!acked && <button className="linkbtn" disabled={busy} onClick={() => run(() => alertState(id, "ack"))}>I&apos;m on it</button>}
      <button className="linkbtn" disabled={busy} onClick={() => run(() => alertState(id, "resolve"))}>Resolve</button>
      {note}
    </div>
  );
}
