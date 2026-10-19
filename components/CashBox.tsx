"use client";

// Everything about the physical cash box: counting it in, what should be in
// it right now, money in and out that isn't a sale, and the closing recount.
import { useState } from "react";
import { COUNT_DENOMS, countTotal, shiftTotals } from "@/lib/calc";
import { euros, type CashMove, type Counts, type Sale, type Shift } from "@/lib/types";
import { Dialog, MoneyPad } from "./ui";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Count the box note by note. Counting pieces is how a drawer actually gets
 *  counted, and it gives an exact total with no decimal typing. */
export function CashCount({ counts, onChange }: { counts: Counts; onChange: (c: Counts) => void }) {
  function set(d: number, n: number) {
    const next = { ...counts };
    if (n > 0) next[d] = Math.min(n, 9999);
    else delete next[d];
    onChange(next);
  }
  return (
    <div className="count">
      {COUNT_DENOMS.map((d) => {
        const n = counts[d] || 0;
        return (
          <div key={d} className={"count__row" + (d >= 500 ? " count__row--note" : "")}>
            <span className="count__denom">{d >= 100 ? `€${d / 100}` : `${d}c`}</span>
            <button type="button" className="step" onClick={() => set(d, n - 1)} disabled={!n} aria-label="one fewer">−</button>
            <input className="count__n" inputMode="numeric" pattern="[0-9]*" value={n || ""} placeholder="0"
              onChange={(e) => set(d, parseInt(e.target.value.replace(/\D/g, "") || "0", 10))} />
            <button type="button" className="step" onClick={() => set(d, n + 1)} aria-label="one more">+</button>
            <span className="count__sub">{n ? euros(d * n) : ""}</span>
          </div>
        );
      })}
      <div className="count__total">
        <span>Total</span>
        <strong>{euros(countTotal(counts))}</strong>
      </div>
    </div>
  );
}

export function OpenShift({ seller, onOpen }: { seller: string; onOpen: (counts: Counts) => void }) {
  const [counts, setCounts] = useState<Counts>({});
  return (
    <main className="center center--top">
      <div className="card card--wide">
        <h1>Open the cash box</h1>
        <p className="muted">Count what is in the box before the first sale, {seller}. This float is what the day gets checked against when you close.</p>
        <CashCount counts={counts} onChange={setCounts} />
        <button className="btn btn--primary btn--block" onClick={() => onOpen(counts)}>
          Start selling with {euros(countTotal(counts))} in the box
        </button>
      </div>
    </main>
  );
}

/** The box as an equation, top to bottom, so anyone can see where the
 *  "should be in the box" number comes from. */
export function BoxEquation({ shift, sales, cashmoves }: { shift: Shift; sales: Sale[]; cashmoves: CashMove[] }) {
  const t = shiftTotals(shift, sales, cashmoves);
  return (
    <div className="eq">
      <div className="eq__row"><span>Float at open</span><span>{euros(shift.opening_cents)}</span></div>
      <div className="eq__row eq__row--plus"><span>Sales ({t.ok.length})</span><span>+{euros(t.cash)}</span></div>
      {t.paidIn > 0 && <div className="eq__row eq__row--plus"><span>Paid in</span><span>+{euros(t.paidIn)}</span></div>}
      {t.paidOut < 0 && <div className="eq__row eq__row--minus"><span>Paid out</span><span>{euros(t.paidOut)}</span></div>}
      <div className="eq__total"><span>Should be in the box</span><strong>{euros(t.expected)}</strong></div>
    </div>
  );
}

const IN_REASONS = ["Change from the SGA office", "Float top-up"];
const OUT_REASONS = ["Handed to the Treasurer", "Supplier payment", "Change run"];

export function CashBoxDialog({ shift, sales, cashmoves, onMove, onVoidMove, onClose, onCloseShift }: {
  shift: Shift; sales: Sale[]; cashmoves: CashMove[];
  onMove: (cents: number, reason: string) => Promise<void>;
  onVoidMove: (m: CashMove) => Promise<void>;
  onClose: () => void; onCloseShift: () => void;
}) {
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [cents, setCents] = useState(0);
  const [reason, setReason] = useState("");
  const t = shiftTotals(shift, sales, cashmoves);
  const reasons = mode === "in" ? IN_REASONS : OUT_REASONS;
  const tooMuch = mode === "out" && cents > t.expected;

  return (
    <Dialog title="Cash box" onClose={onClose} wide>
      <div className="boxdlg">
        <div className="stack">
          <BoxEquation shift={shift} sales={sales} cashmoves={cashmoves} />
          <p className="muted small">Opened {time(shift.opened_at)} by {shift.opened_by}. {t.items} items in {t.ok.length} sales{t.voided ? `, ${t.voided} voided` : ""}.</p>
          {t.moves.length > 0 && (
            <>
              <h3 className="h3">Money in and out</h3>
              <ul className="moves">
                {cashmoves.filter((m) => m.shift_id === shift.id).map((m) => (
                  <li key={m.id} className={m.voided_at ? "is-void" : ""}>
                    <span className="muted small">{time(m.at)}</span>
                    <span>{m.reason} <span className="muted small">· {m.by}</span></span>
                    <strong className={m.cents > 0 ? "pos" : "neg"}>{m.cents > 0 ? "+" : ""}{euros(m.cents)}</strong>
                    {!m.voided_at && <button className="linkbtn" onClick={() => onVoidMove(m)}>Undo</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="btn btn--danger btn--block" onClick={onCloseShift}>Close shift and recount</button>
        </div>

        <div className="stack">
          {!mode ? (
            <>
              <h3 className="h3">Money in or out that isn&apos;t a sale</h3>
              <p className="muted small">Paying a supplier from the box, handing cash to the Treasurer mid-day, or bringing extra change. Logging it keeps the closing count honest.</p>
              <div className="row">
                <button className="btn btn--in" onClick={() => { setMode("in"); setCents(0); setReason(""); }}>+ Pay in</button>
                <button className="btn btn--out" onClick={() => { setMode("out"); setCents(0); setReason(""); }}>− Pay out</button>
              </div>
            </>
          ) : (
            <>
              <h3 className="h3">{mode === "in" ? "Putting money in" : "Taking money out"}</h3>
              <div className={"amount " + (mode === "in" ? "amount--in" : "amount--out")}>{mode === "in" ? "+" : "−"}{euros(cents)}</div>
              <MoneyPad cents={cents} onChange={setCents} />
              <div className="chips">
                {reasons.map((r) => (
                  <button key={r} className={"chip" + (reason === r ? " is-on" : "")} onClick={() => setReason(r)}>{r}</button>
                ))}
              </div>
              <input className="field" placeholder="Or type what it was for" maxLength={200}
                value={reasons.includes(reason) ? "" : reason} onChange={(e) => setReason(e.target.value)} />
              {tooMuch && <p className="error">That&apos;s more than should be in the box ({euros(t.expected)}).</p>}
              <div className="row">
                <button className="btn" onClick={() => setMode(null)}>Cancel</button>
                <button className="btn btn--primary grow" disabled={!cents || !reason.trim()} onClick={async () => {
                  await onMove(mode === "in" ? cents : -cents, reason.trim());
                  setMode(null);
                }}>Log {mode === "in" ? "pay in" : "pay out"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function CloseShift({ shift, sales, cashmoves, onCancel, onClose, seller }: {
  shift: Shift; sales: Sale[]; cashmoves: CashMove[]; seller: string;
  onCancel: () => void; onClose: (s: Shift) => void;
}) {
  const [counts, setCounts] = useState<Counts>({});
  const [note, setNote] = useState("");
  const t = shiftTotals(shift, sales, cashmoves);
  const counted = countTotal(counts);
  const diff = counted - t.expected;
  return (
    <Dialog title="Close shift: recount the box" onClose={onCancel} wide>
      <div className="close">
        <CashCount counts={counts} onChange={setCounts} />
        <div className="close__side">
          <BoxEquation shift={shift} sales={sales} cashmoves={cashmoves} />
          <dl className="figures">
            <dt>Counted</dt><dd><strong>{euros(counted)}</strong></dd>
          </dl>
          <Diff diff={diff} />
          <textarea className="field" rows={3} placeholder="Note (optional), e.g. why it's off"
            value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <button className="btn btn--primary btn--block" onClick={() => onClose({
            ...shift, closed_at: new Date().toISOString(), closed_by: seller, counted_cents: counted,
            counted_counts: counts, expected_cents: t.expected, note: note.trim() || null,
          })}>Close shift</button>
        </div>
      </div>
    </Dialog>
  );
}

export function Diff({ diff }: { diff: number }) {
  return (
    <div className={"diff " + (diff === 0 ? "diff--ok" : diff > 0 ? "diff--over" : "diff--short")}>
      {diff === 0 ? "Box matches" : diff > 0 ? `Over by ${euros(diff)}` : `Short by ${euros(-diff)}`}
    </div>
  );
}

export function ClosedResult({ shift, sales, cashmoves, onStats, onNew }: {
  shift: Shift; sales: Sale[]; cashmoves: CashMove[]; onStats: () => void; onNew: () => void;
}) {
  const t = shiftTotals(shift, sales, cashmoves);
  return (
    <main className="center">
      <div className="card card--narrow">
        <h1>Shift closed</h1>
        <dl className="figures">
          <dt>Items sold</dt><dd>{t.items}</dd>
          <dt>Sales</dt><dd>{euros(t.cash)}</dd>
          <dt>Expected in box</dt><dd>{euros(shift.expected_cents || 0)}</dd>
          <dt>Counted</dt><dd><strong>{euros(shift.counted_cents || 0)}</strong></dd>
        </dl>
        <Diff diff={(shift.counted_cents || 0) - (shift.expected_cents || 0)} />
        <p className="muted small">Hand the box to the Treasurer. The day&apos;s sales are in Stats, with a CSV for the cash book.</p>
        <div className="stack">
          <button className="btn btn--primary" onClick={onStats}>See the stats</button>
          <button className="btn" onClick={onNew}>Open a new shift</button>
        </div>
      </div>
    </main>
  );
}
