"use client";

import { alertState, muteAlert } from "../live-actions";
import { useAct } from "../useAct";

export function AlertActions({ id, code, acked }: { id: number; code: string; acked: boolean }) {
  const { busy, run, note } = useAct();
  return (
    <div className="row row--tight">
      {!acked && <button className="linkbtn" disabled={busy} onClick={() => run(() => alertState(id, "ack"))}>I&apos;m on it</button>}
      <button className="linkbtn" disabled={busy} onClick={() => run(() => alertState(id, "resolve"))}>Resolve</button>
      <button className="linkbtn" disabled={busy} onClick={() => run(() => muteAlert(code, 8))}>Mute 8 h</button>
      {note}
    </div>
  );
}

export function Unmute({ code }: { code: string }) {
  const { busy, run, note } = useAct();
  return <>{note}<button className="linkbtn" disabled={busy} onClick={() => run(() => muteAlert(code, 0))}>Unmute</button></>;
}
