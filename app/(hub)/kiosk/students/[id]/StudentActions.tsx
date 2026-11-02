"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { euros } from "@/lib/types";
import { adjust, mergeStudent, removeStaff, resetPin, topUp, unlock } from "../../live-actions";
import { useAct } from "../../useAct";

export function TopUp({ id, bundles }: { id: string; bundles: { cents: number; coffees: number }[] }) {
  const { busy, run, note, last } = useAct();
  // One id per real top-up. It only changes after a clear answer, so pressing
  // again after "the kiosk didn't answer" can't add the coffees twice.
  const requestId = useRef<{ cents: number; id: string } | null>(null);
  const go = (b: { cents: number; coffees: number }) => {
    // Pressing the same amount after no answer is the same top-up, not a new one.
    const retry = !!last?.unsure && requestId.current?.cents === b.cents;
    if (!retry && !confirm(`Took ${euros(b.cents, true)} in cash from ${id}? This adds ${b.coffees} coffees.`)) return;
    const rid = retry ? requestId.current!.id : crypto.randomUUID();
    requestId.current = { cents: b.cents, id: rid };
    run(() => topUp(id, b.cents, rid), (o) => { if (!o.unsure) requestId.current = null; });
  };
  return (
    <div className="stack">
      <div className="row">
        {bundles.map((b) => <button key={b.cents} className="btn btn--primary" disabled={busy} onClick={() => go(b)}>{euros(b.cents, true)} · {b.coffees} coffees</button>)}
      </div>
      {note}
      {last?.unsure && <p className="small muted">Press the same amount again. It&apos;s safe: the kiosk won&apos;t count it twice.</p>}
    </div>
  );
}

export function Adjust({ id }: { id: string }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { busy, run, note } = useAct();
  const n = Number(amount);
  return (
    <form className="stack" onSubmit={(e) => {
      e.preventDefault();
      if (confirm(`${n > 0 ? "Add" : "Remove"} ${Math.abs(n)} coffee${Math.abs(n) === 1 ? "" : "s"} with no cash? This goes in the audit log.`)) run(() => adjust(id, n, reason), (o) => { if (o.ok) { setAmount(""); setReason(""); } });
    }}>
      <div className="row row--tight">
        <input className="field field--sm field--short" inputMode="numeric" placeholder="+1 or -1" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, "").slice(0, 4))} aria-label="Coffees to add or remove" />
        <input className="field field--sm" placeholder="Why (required)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} aria-label="Reason" />
      </div>
      <button className="btn btn--sm" disabled={busy || !n || reason.trim().length < 3}>Correct the balance</button>
      {note}
    </form>
  );
}

export function Housekeeping({ id, locked, hasPin, staff }: { id: string; locked: boolean; hasPin: boolean; staff: boolean }) {
  const router = useRouter();
  const { busy, run, note } = useAct();
  return (
    <div className="stack">
      <div className="row">
        {locked && <button className="btn btn--sm" disabled={busy} onClick={() => run(() => unlock(id))}>Unlock</button>}
        {hasPin && <button className="btn btn--sm" disabled={busy} onClick={() => { if (confirm(`Clear ${id}'s PIN? They choose a new one on their next visit.`)) run(() => resetPin(id)); }}>Reset PIN</button>}
        {staff && <button className="btn btn--sm btn--danger" disabled={busy} onClick={() => { if (confirm(`Remove the staff account ${id}? Its balance goes with it.`)) run(() => removeStaff(id), (o) => { if (o.ok) router.push("/kiosk/students"); }); }}>Remove staff account</button>}
      </div>
      {note}
    </div>
  );
}

export function FixId({ id, length }: { id: string; length: number }) {
  const router = useRouter();
  const [right, setRight] = useState("");
  const { busy, run, note } = useAct();
  return (
    <form className="stack" onSubmit={(e) => {
      e.preventDefault();
      if (confirm(`Move everything from ${id} to ${right}? ${id} stops existing.`)) run(() => mergeStudent(id, right), (o) => { if (o.ok) router.push(`/kiosk/students/${right}`); });
    }}>
      <p className="muted small">Typed the wrong ID at a sale? Move this balance and history to the right one.</p>
      <div className="row row--tight">
        <input className="field field--sm" inputMode="numeric" placeholder="The right ID" value={right} onChange={(e) => setRight(e.target.value.replace(/\D/g, "").slice(0, length))} aria-label="The right ID" />
        <button className="btn btn--sm" disabled={busy || right.length !== length}>Move</button>
      </div>
      {note}
    </form>
  );
}
