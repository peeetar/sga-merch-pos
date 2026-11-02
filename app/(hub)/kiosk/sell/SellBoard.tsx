"use client";

import { useState } from "react";
import { CashCount } from "@/components/CashBox";
import { Panel } from "@/components/hub/bits";
import { Dialog } from "@/components/ui";
import { countTotal } from "@/lib/calc";
import type { CoffeeShift, PriceList, SaleRow } from "@/lib/sell";
import { athensTime } from "@/lib/time";
import { euros, type Counts } from "@/lib/types";
import { useAct } from "../useAct";
import { closeBox, openBox, sell, tryNow, voidIt } from "./actions";

const VOID_REASONS = ["Wrong student ID", "Wrong package", "Money returned"];

function Open() {
  const [counts, setCounts] = useState<Counts>({});
  const { busy, run, note } = useAct();
  return (
    <Panel title="Open the cash box">
      <p className="muted">Count what&apos;s in the box before the first sale. Closing is checked against this float.</p>
      <CashCount counts={counts} onChange={setCounts} />
      <button className="btn btn--primary btn--block" disabled={busy} onClick={() => run(() => openBox(counts))}>
        Start selling with {euros(countTotal(counts))} in the box
      </button>
      {note}
    </Panel>
  );
}

function Close({ shift, expected, onClose }: { shift: CoffeeShift; expected: number; onClose: () => void }) {
  const [counts, setCounts] = useState<Counts>({});
  const [text, setText] = useState("");
  const { busy, run, note } = useAct();
  const counted = countTotal(counts);
  const off = counted - expected;
  return (
    <Dialog title="Close the cash box" onClose={onClose} wide>
      <p className="muted">Opened by {shift.opened_by} at {athensTime(shift.opened_at)}. Count the box note by note.</p>
      <CashCount counts={counts} onChange={setCounts} />
      <div className="eq">
        <div className="eq__row"><span>Should be in the box</span><span>{euros(expected)}</span></div>
        <div className="eq__row"><span>Counted</span><span>{euros(counted)}</span></div>
        <div className="eq__total"><span>{off === 0 ? "Exact" : off > 0 ? "Over" : "Short"}</span><strong>{euros(Math.abs(off))}</strong></div>
      </div>
      <input className="field field--sm" placeholder="Note, if it doesn't match" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} aria-label="Note" />
      <button className="btn btn--primary btn--block" disabled={busy} onClick={() => run(() => closeBox(counts, text), (o) => { if (o.ok) onClose(); })}>Close the box</button>
      {note}
    </Dialog>
  );
}

function VoidButton({ sale }: { sale: SaleRow }) {
  const [open, setOpen] = useState(false);
  const { busy, run, note } = useAct();
  return (
    <>
      <button className="linkbtn" onClick={() => setOpen(true)}>Void</button>
      {open && (
        <Dialog title={`Void ${euros(sale.bundle_cents, true)} for ${sale.student_id}`} onClose={() => setOpen(false)}>
          <p className="muted">The sale stays on record, and the {sale.coffees} coffees come off their balance.</p>
          <div className="row">
            {VOID_REASONS.map((r) => <button key={r} className="btn btn--sm" disabled={busy} onClick={() => run(() => voidIt(sale.id, r), (o) => { if (o.ok) setOpen(false); })}>{r}</button>)}
          </div>
          {note}
        </Dialog>
      )}
    </>
  );
}

function Selling({ shift, sales, prices }: { shift: CoffeeShift; sales: SaleRow[]; prices: PriceList }) {
  const [id, setId] = useState("");
  const [closing, setClosing] = useState(false);
  const { busy, run, note } = useAct();
  const live = sales.filter((s) => !s.voided_at);
  const taken = live.reduce((n, s) => n + s.bundle_cents, 0);
  const expected = shift.opening_cents + taken;
  const ready = id.length === prices.student_id_length;
  return (
    <>
      <div className="cols">
        <Panel title="Sell">
          <div className="stack">
            <input className="field" autoFocus inputMode="numeric" placeholder={`${prices.student_id_length}-digit student ID`} value={id}
              onChange={(e) => setId(e.target.value.replace(/\D/g, "").slice(0, prices.student_id_length))} aria-label="Student ID" />
            <div className="row">
              {prices.bundles.map((b) => <button key={b.cents} className="btn btn--primary" disabled={busy || !ready}
                onClick={() => run(() => sell(id, b.cents), (o) => { if (o.ok) setId(""); })}>{euros(b.cents, true)} · {b.coffees} coffees</button>)}
            </div>
            {note}
          </div>
        </Panel>
        <Panel title="Cash box" action={<button className="linkbtn" onClick={() => setClosing(true)}>Close it</button>}>
          <div className="eq">
            <div className="eq__row"><span>Float at open</span><span>{euros(shift.opening_cents)}</span></div>
            <div className="eq__row eq__row--plus"><span>Sales ({live.length})</span><span>+{euros(taken)}</span></div>
            <div className="eq__total"><span>Should be in the box</span><strong>{euros(expected)}</strong></div>
          </div>
        </Panel>
      </div>
      <Panel title="This shift">
        {sales.length === 0 ? <p className="muted">No sales yet.</p> : (
          <table className="tbl">
            <thead><tr><th>Time</th><th>Student</th><th className="num">Paid</th><th>By</th><th /></tr></thead>
            <tbody>{sales.map((s) => (
              <tr key={s.id}>
                <td className="muted">{athensTime(s.sold_at)}</td><td>{s.student_id}</td><td className="num">{euros(s.bundle_cents, true)}</td>
                <td className="muted small">{s.seller}</td>
                <td>{s.voided_at ? <span className="pill pill--bad">voided</span> : <>{s.waiting && <span className="pill pill--warn">waiting</span>} <VoidButton sale={s} /></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
      {closing && <Close shift={shift} expected={expected} onClose={() => setClosing(false)} />}
    </>
  );
}

export function SellBoard({ shift, sales, pending, refused, prices }: {
  shift: CoffeeShift | null; sales: SaleRow[]; pending: number; refused: { id: string; reason: string; student_id: string | null }[]; prices: PriceList; me: string;
}) {
  const { busy, run, note } = useAct();
  return (
    <>
      {pending > 0 && (
        <div className="notice notice--warn">
          <strong>{pending} waiting for the kiosk.</strong> They apply by themselves when it&apos;s back.{" "}
          <button className="linkbtn" disabled={busy} onClick={() => run(tryNow)}>Try now</button>{note}
        </div>
      )}
      {refused.length > 0 && (
        <div className="notice notice--bad"><strong>The kiosk refused {refused.length === 1 ? "a sale" : `${refused.length} sales`}:</strong>{" "}
          {refused.map((r) => `${r.student_id || r.id}: ${r.reason}`).join(" · ")}. Give the cash back or sell it again with the right ID.</div>
      )}
      {shift ? <Selling shift={shift} sales={sales} prices={prices} /> : <Open />}
    </>
  );
}
