"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui";
import { refill, reloadScreen, setMaintenance } from "./actions";

export function KioskControls({ mode }: { mode: string }) {
  const [busy, start] = useTransition();
  const maint = mode === "maintenance";
  return (
    <div className="row">
      <button className={"btn btn--sm" + (maint ? " btn--primary" : "")} disabled={busy} onClick={() => {
        if (confirm(maint ? "Put the kiosk back in service?" : "Put the kiosk in maintenance? It finishes any purchase in progress, then shows “Back in a few minutes”.")) start(() => setMaintenance(!maint));
      }}>{maint ? "End maintenance" : "Start maintenance"}</button>
      <button className="btn btn--sm" disabled={busy} onClick={() => start(() => reloadScreen())}>Reload screen</button>
    </div>
  );
}

export function RefillButton({ column, capacity, stock, disabled }: { column: number; capacity: number; stock: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState("10");
  const [busy, start] = useTransition();
  if (disabled) return null;
  const done = (fn: () => Promise<void>) => start(async () => { await fn(); setOpen(false); });
  return (
    <>
      <button className="linkbtn" onClick={() => setOpen(true)}>Refill</button>
      {open && (
        <Dialog title={`Refill column ${column + 1}`} onClose={() => setOpen(false)}>
          <p className="muted">It has {stock} of {capacity}. Only queue this once the capsules are physically in the column.</p>
          <div className="row">
            <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => done(() => refill(column, { to: capacity }))}>Filled to the top ({capacity})</button>
          </div>
          <div className="row row--tight">
            <input className="field field--sm" inputMode="numeric" value={add} onChange={(e) => setAdd(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Capsules added" />
            <button className="btn btn--sm" disabled={busy || !add} onClick={() => done(() => refill(column, { add: Number(add) }))}>Added this many</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
