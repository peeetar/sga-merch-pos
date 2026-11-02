"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui";
import { athensDay } from "@/lib/time";
import { addDelivery, setShelf } from "../live-actions";
import { useAct } from "../useAct";

export function ShelfCount({ sku, sleeves }: { sku: string; sleeves: number | null }) {
  const [value, setValue] = useState(sleeves === null ? "" : String(sleeves));
  const { busy, run, note } = useAct();
  const changed = value !== "" && Number(value) !== sleeves;
  return (
    <div className="row row--tight row--end">
      {note}
      <input className="field field--sm field--tiny" inputMode="numeric" placeholder="–" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label={`Sleeves of ${sku} on the shelf`} />
      {changed && <button className="btn btn--sm" disabled={busy} onClick={() => run(() => setShelf(sku, Number(value)))}>Save</button>}
    </div>
  );
}

export function DeliveryButton({ capsules }: { capsules: { sku: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [sku, setSku] = useState(capsules[0]?.sku || "");
  const [sleeves, setSleeves] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [day, setDay] = useState(athensDay(new Date()));
  const { busy, run, note } = useAct();
  const cents = Math.round(Number(cost.replace(",", ".")) * 100);
  return (
    <>
      <button className="linkbtn" onClick={() => setOpen(true)}>Record a delivery</button>
      {open && (
        <Dialog title="Record a delivery" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => addDelivery({ sku, sleeves: Number(sleeves), cost_cents: cents, bought_at: day, supplier }), (o) => { if (o.ok) setOpen(false); }); }}>
            <select className="field field--sm" value={sku} onChange={(e) => setSku(e.target.value)} aria-label="Capsule">
              {capsules.map((c) => <option key={c.sku} value={c.sku}>{c.name}</option>)}
            </select>
            <div className="row row--tight">
              <input className="field field--sm" inputMode="numeric" placeholder="Sleeves" value={sleeves} onChange={(e) => setSleeves(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Sleeves" />
              <input className="field field--sm" inputMode="decimal" placeholder="Total cost €" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))} aria-label="Total cost in euros" />
            </div>
            <input className="field field--sm" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
            <input className="field field--sm" placeholder="Supplier (optional)" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={60} aria-label="Supplier" />
            <button className="btn btn--sm btn--primary" disabled={busy || !Number(sleeves) || Number.isNaN(cents)}>Save</button>
            {note}
          </form>
        </Dialog>
      )}
    </>
  );
}
