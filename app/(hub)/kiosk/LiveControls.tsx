"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui";
import { refillLive, setMaintenanceLive } from "./live-actions";
import { useAct } from "./useAct";

export function LiveMaintenance({ on }: { on: boolean }) {
  const { busy, run, note } = useAct();
  return (
    <div className="stack">
      <div className="row">
        <button className={"btn btn--sm" + (on ? " btn--primary" : "")} disabled={busy} onClick={() => {
          if (confirm(on ? "Put the kiosk back in service?" : "Put the kiosk in maintenance? It finishes any purchase in progress, then shows “Back in a few minutes”.")) run(() => setMaintenanceLive(!on));
        }}>{on ? "End maintenance" : "Start maintenance"}</button>
      </div>
      {note}
    </div>
  );
}

export function LiveRefill({ column, capacity, stock, disabled }: { column: number; capacity: number; stock: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState("10");
  const { busy, run, note } = useAct();
  const room = capacity - stock;
  if (disabled) return null;
  const go = (count: number) => run(() => refillLive(column, count), (o) => { if (o.ok) setOpen(false); });
  return (
    <>
      <button className="linkbtn" onClick={() => setOpen(true)}>Refill</button>
      {open && (
        <Dialog title={`Refill column ${column + 1}`} onClose={() => setOpen(false)}>
          <p className="muted">It has {stock} of {capacity}. Do this once the capsules are physically in the column.</p>
          <div className="row">
            <button className="btn btn--sm btn--primary" disabled={busy || room < 1} onClick={() => go(room)}>Filled to the top ({capacity})</button>
          </div>
          <div className="row row--tight">
            <input className="field field--sm" inputMode="numeric" value={add} onChange={(e) => setAdd(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Capsules added" />
            <button className="btn btn--sm" disabled={busy || !Number(add)} onClick={() => go(Number(add))}>Added this many</button>
          </div>
          {note}
        </Dialog>
      )}
    </>
  );
}
