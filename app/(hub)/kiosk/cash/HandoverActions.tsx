"use client";

import { useState } from "react";
import { confirmHandover, recordHandover } from "../live-actions";
import { useAct } from "../useAct";

export function HandoverForm({ people }: { people: { name: string; email: string; title: string }[] }) {
  const [to, setTo] = useState(people[0]?.email || "");
  const [amount, setAmount] = useState("");
  const { busy, run, note } = useAct();
  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  if (people.length === 0) return <p className="muted small">Add the Treasurer with an email on People, then cash can be handed over here.</p>;
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => recordHandover(to, cents, ""), (o) => { if (o.ok) setAmount(""); }); }}>
      <div className="row row--tight">
        <select className="field field--sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hand to">
          {people.map((p) => <option key={p.email} value={p.email}>{p.name} ({p.title})</option>)}
        </select>
        <input className="field field--sm field--tiny" inputMode="decimal" placeholder="€" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))} aria-label="Amount in euros" />
        <button className="btn btn--sm btn--primary" disabled={busy || !(cents > 0)}>Hand over</button>
      </div>
      {note}
    </form>
  );
}

export function ConfirmHandover({ id }: { id: number }) {
  const { busy, run, note } = useAct();
  return <>{note}<button className="btn btn--sm btn--primary" disabled={busy} onClick={() => { if (confirm("Confirm you received this cash?")) run(() => confirmHandover(id)); }}>Confirm</button></>;
}
