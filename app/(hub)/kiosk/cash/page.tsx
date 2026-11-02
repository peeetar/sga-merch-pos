import { Panel, Stat } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { currentTerm, ensureSchema, sql } from "@/lib/db";
import { piGet } from "@/lib/pi";
import { athensDate, athensTime } from "@/lib/time";
import { euros } from "@/lib/types";
import { PiDown } from "../PiDown";
import { ConfirmHandover, HandoverForm } from "./HandoverActions";

export const metadata = { title: "Kiosk cash · SGA Hub" };

type Shift = { id: string; opened_at: string; opened_by: string; closed_at: string | null; counted_cents: number | null; expected_cents: number | null; sales_cents: number };
type Handover = { id: number; from_email: string; to_email: string; amount_cents: number; at: string; note: string | null; confirmed_at: string | null };
type Cash = {
  totals: { taken_cents: number; with_treasurer_cents: number; not_handed_over_cents: number; unconfirmed_cents: number; credits_held: number; liability_cents: number };
  shifts: Shift[]; handovers: Handover[]; stale_handovers: number; me: string;
};

/** Cash goes to the Treasurer or the President, as listed on People. */
async function recipients(me: string) {
  try {
    await ensureSchema();
    const term = await currentTerm();
    const rows = (await sql()`SELECT p.name, p.email, r.title FROM hub_people p JOIN hub_roles r ON r.id = p.role_id
      WHERE p.term = ${term} AND p.email IS NOT NULL AND p.role_id IN ('treasurer', 'president') ORDER BY r.sort DESC`) as { name: string; email: string; title: string }[];
    return rows.filter((r) => r.email !== me);
  } catch {
    return [];
  }
}

export default async function CashPage() {
  const me = await requireBoard();
  const d = await piGet<Cash>("/cash/summary", me.email);
  const people = d.ok ? await recipients(me.email) : [];
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Kiosk cash</h1></header>
      {!d.ok ? <PiDown err={d} /> : (
        <>
          <div className="stats">
            <Stat label="Taken, all time" value={euros(d.totals.taken_cents, true)} />
            <Stat label="With the Treasurer" value={euros(d.totals.with_treasurer_cents, true)} sub={d.totals.unconfirmed_cents ? `${euros(d.totals.unconfirmed_cents, true)} unconfirmed` : "all confirmed"} />
            <Stat label="Not handed over" value={euros(d.totals.not_handed_over_cents, true)} />
            <Stat label="Owed in coffees" value={euros(d.totals.liability_cents, true)} sub={`${d.totals.credits_held} coffees in balances`} />
          </div>
          {d.stale_handovers > 0 && <div className="notice notice--warn"><strong>{d.stale_handovers} handover{d.stale_handovers > 1 ? "s" : ""}</strong> waiting over 48 hours for the Treasurer to confirm.</div>}
          <div className="cols">
            <Panel title="Shifts">
              {d.shifts.length === 0 ? <p className="muted">None yet.</p> : (
                <table className="tbl">
                  <thead><tr><th>Opened</th><th>By</th><th className="num">Sold</th><th className="num">Over / short</th></tr></thead>
                  <tbody>{d.shifts.slice(0, 30).map((s) => (
                    <tr key={s.id}>
                      <td className="muted">{athensDate(s.opened_at)} {athensTime(s.opened_at)}</td><td className="small">{s.opened_by}</td>
                      <td className="num">{euros(s.sales_cents, true)}</td>
                      <td className="num">{s.counted_cents === null ? <span className="pill pill--warn">open</span> : euros(s.counted_cents - (s.expected_cents ?? 0), true)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Handovers">
              <HandoverForm people={people} />
              {d.handovers.length > 0 && (
                <table className="tbl">
                  <thead><tr><th>When</th><th>From</th><th>To</th><th className="num">Amount</th><th /></tr></thead>
                  <tbody>{d.handovers.slice(0, 30).map((h) => (
                    <tr key={h.id}>
                      <td className="muted">{athensDate(h.at)}</td><td className="small">{h.from_email}</td><td className="small">{h.to_email}</td><td className="num">{euros(h.amount_cents, true)}</td>
                      <td>{h.confirmed_at ? <span className="pill pill--ok">confirmed</span> : h.to_email === d.me ? <ConfirmHandover id={h.id} /> : <span className="pill pill--warn">waiting</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Panel>
          </div>
        </>
      )}
    </main>
  );
}
