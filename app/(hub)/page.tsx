import Link from "next/link";
import { DbDown, Panel, Stat, ago } from "@/components/hub/bits";
import { live } from "@/lib/calc";
import { currentTerm, ensureSchema, sql } from "@/lib/db";
import { loadKiosk } from "@/lib/kiosk";
import { lowStock, loadMerch, variantName } from "@/lib/merch";
import { ntfyConfigured } from "@/lib/notify";
import { athensDay, lastDays, termStart } from "@/lib/time";
import { euros } from "@/lib/types";

import { setupChecks } from "./settings/checks";

export const metadata = { title: "Overview · SGA Hub" };

export default async function Overview() {
  let body: React.ReactNode;
  try {
    await ensureSchema();
    const [data, term, kiosk] = await Promise.all([loadMerch(), currentTerm(), loadKiosk()]);
    const [{ filled }] = (await sql()`SELECT count(*)::int AS filled FROM hub_people WHERE term = ${term}`) as { filled: number }[];
    const [{ seats }] = (await sql()`SELECT sum(seats)::int AS seats FROM hub_roles`) as { seats: number }[];

    const sales = live(data.sales);
    const today = athensDay(Date.now());
    const week = new Set(lastDays(7));
    const from = termStart(term);
    const sum = (pred: (day: string) => boolean) => sales.filter((s) => pred(athensDay(s.sold_at))).reduce((n, s) => n + s.total_cents, 0);
    const openShifts = data.shifts.filter((s) => !s.closed_at);
    const low = lowStock(data);
    const missing = setupChecks().filter((c) => !c.ok && c.required);

    body = (
      <>
        {missing.length > 0 && (
          <div className="notice notice--warn">
            <strong>Setup isn&apos;t finished:</strong> {missing.map((c) => c.label).join(", ")}. See <Link href="/settings">Settings</Link>.
          </div>
        )}
        <div className="stats">
          <Stat label="Till today" value={euros(sum((d) => d === today), true)} href="/merch" />
          <Stat label="Last 7 days" value={euros(sum((d) => week.has(d)), true)} href="/merch" />
          <Stat label={`Since 1 Aug (${term})`} value={euros(sum((d) => d >= from), true)} href="/merch" />
          <Stat label="Cash boxes open" value={openShifts.length}
            sub={openShifts.length ? openShifts.map((s) => s.opened_by).join(", ") : "none"} href="/merch" />
        </div>

        <div className="cols">
          <Panel title="Running low" action={<Link className="linkbtn" href="/merch">All stock</Link>}>
            {low.length === 0 ? <p className="muted">Nothing is low. 🎉</p> : (
              <ul className="list">
                {low.slice(0, 8).map((r) => (
                  <li key={r.key}><span>{variantName(r.product, r.color, r.size)}</span>
                    <span className={"pill " + (r.left <= 0 ? "pill--bad" : "pill--warn")}>{r.left <= 0 ? "sold out" : `${r.left} left`}</span></li>
                ))}
                {low.length > 8 && <li className="muted">…and {low.length - 8} more</li>}
              </ul>
            )}
          </Panel>

          <Panel title="Coffee kiosk" action={<Link className="linkbtn" href="/kiosk">Kiosk</Link>}>
            {!kiosk.report ? <p className="muted">Not connected yet. Once the Pi reports in, its status shows here.</p> : (
              <>
                <p><span className={"dot-status dot-status--" + (!kiosk.online ? "off" : kiosk.report.mode === "in_service" ? "ok" : kiosk.report.mode === "maintenance" ? "warn" : "bad")}>
                  {!kiosk.online ? "Offline" : kiosk.report.mode === "in_service" ? "In service" : kiosk.report.mode === "maintenance" ? "Maintenance" : "Out of service"}</span>
                  <span className="muted small"> · {kiosk.online ? "reported" : "last seen"} {ago(kiosk.receivedAt)}</span></p>
                <p><strong>{kiosk.report.today.vends}</strong> coffees today · <strong>{kiosk.report.columns.reduce((n, c) => n + Math.max(0, c.stock), 0)}</strong> capsules left
                  {kiosk.report.columns.some((c) => c.enabled && c.sku && c.stock <= 0) && <span className="pill pill--bad"> a column is empty</span>}</p>
              </>
            )}
          </Panel>

          <Panel title="Board" action={<Link className="linkbtn" href="/people">People</Link>}>
            <p><strong>{filled}</strong> of {seats} seats filled for {term}.</p>
            <p className="muted small">Alerts go to ntfy{ntfyConfigured() ? "" : " (not set up yet)"}. Everyone on the board should subscribe to the topic in Settings.</p>
          </Panel>
        </div>
      </>
    );
  } catch (err) {
    body = <DbDown err={err} />;
  }
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Overview</h1></header>
      {body}
    </main>
  );
}
