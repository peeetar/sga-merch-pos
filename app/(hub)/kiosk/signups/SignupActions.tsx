"use client";

import { useState } from "react";
import { addSignups, removeSignup } from "../live-actions";
import { useAct } from "../useAct";

export function AddSignups({ credits }: { credits: number }) {
  const [ids, setIds] = useState("");
  const [gift, setGift] = useState(String(credits));
  const { busy, run, note } = useAct();
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => addSignups(ids, Number(gift)), (o) => { if (o.ok) setIds(""); }); }}>
      <textarea className="field" rows={3} placeholder="Paste student IDs, separated by spaces or new lines" value={ids} onChange={(e) => setIds(e.target.value)} aria-label="Student IDs" />
      <div className="row row--tight">
        <input className="field field--sm field--tiny" inputMode="numeric" value={gift} onChange={(e) => setGift(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Free coffees each" />
        <span className="muted small">free coffees each</span>
        <button className="btn btn--sm btn--primary" disabled={busy || !ids.trim() || !Number(gift)}>Add</button>
      </div>
      {note}
    </form>
  );
}

export function RemoveSignup({ id }: { id: string }) {
  const { busy, run, note } = useAct();
  return <>{note}<button className="linkbtn" disabled={busy} onClick={() => { if (confirm(`Take ${id} off the list?`)) run(() => removeSignup(id)); }}>Remove</button></>;
}
