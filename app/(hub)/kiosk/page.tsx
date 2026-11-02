import Link from "next/link";
import { DbDown, Panel, Stat, ago } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { COMMANDS, kioskAuthed, loadKiosk } from "@/lib/kiosk";
import { piConfigured, piGet, type PiOverview } from "@/lib/pi";
import { athensDate, athensTime } from "@/lib/time";
import { euros } from "@/lib/types";
import { KioskControls, RefillButton } from "./KioskControls";
import { LiveMaintenance, LiveRefill } from "./LiveControls";
import { PiDown } from "./PiDown";

export const metadata = { title: "Coffee kiosk · SGA Hub" };

const MODE = { in_service: ["In service", "ok"], maintenance: ["Maintenance", "warn"], out_of_service: ["Out of service", "bad"] } as const;

/** What the Pi says right now. */
function Live({ o }: { o: PiOverview }) {
  const [label, tone] = MODE[o.status.state];
  const t = o.today.today;
  const empty = o.columns.filter((c) => c.enabled && c.sku && c.stock <= 0).length;
  return (
    <>
      <div className="stats">
        <Stat label="Status" value={<span className={"dot-status dot-status--" + tone}>{label}</span>} sub={o.status.reason || "live from the Pi"} />
        <Stat label="Coffees today" value={t.coffees} sub={`${o.today.last_week.coffees} by now last week`} />
        <Stat label="Top-ups today" value={euros(t.cash_cents, true)} sub={`${t.topups} top-up${t.topups === 1 ? "" : "s"}, ${t.new_students} new`} href="/kiosk/cash" />
        <Stat label="Capsules left" value={o.columns.reduce((n, c) => n + Math.max(0, c.stock), 0)} sub={empty ? `${empty} column${empty > 1 ? "s" : ""} empty` : "no empty columns"} href="/kiosk/stock" />
      </div>

      {o.alerts.length > 0 && (
        <div className="notice notice--bad"><strong>Open alerts:</strong> {o.alerts.map((a) => a.title).join(" · ")} <Link href="/kiosk/alerts">See them</Link></div>
      )}

      <Panel title="Columns" action={<Link className="small" href="/kiosk/stock">Manage stock</Link>}>
        <div className="tubes">
          {o.columns.map((c) => (
            <div key={c.column_index} className={"tube" + (!c.enabled ? " tube--off" : "")}>
              <span className="tube__glass" title={`${c.stock} of ${c.capacity}`}>
                <i style={{ height: `${Math.max(0, Math.min(1, c.stock / Math.max(1, c.capacity))) * 100}%`, background: c.bg_color || "var(--crimson)" }} />
              </span>
              <strong>{c.stock}<span className="muted">/{c.capacity}</span></strong>
              <span className="tube__name" title={c.name || ""}>{c.name || "empty"}</span>
              {!c.enabled && <span className="pill pill--bad">off</span>}
              <LiveRefill column={c.column_index} capacity={c.capacity} stock={c.stock} disabled={!c.sku} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="cols">
        <Panel title="To do">
          {o.todos.length === 0 ? <p className="muted">Nothing needs doing.</p> : (
            <ul className="list">{o.todos.map((t2) => <li key={t2.text}><span>{t2.text}</span><span className={"pill " + (t2.level === "bad" || t2.level === "urgent" ? "pill--bad" : "pill--warn")}>{t2.level}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Control">
          <LiveMaintenance on={o.status.maintenance.on} />
          <p className="muted small">Software {o.chips.version.slice(0, 7)}. Hardware tests, restarts, deploys and settings stay on the Pi, over SSH.</p>
        </Panel>
      </div>
    </>
  );
}

export default async function Kiosk() {
  const me = await requireBoard();
  const live = piConfigured() ? await piGet<PiOverview>("/overview", me.email) : null;
  if (live?.ok) {
    return (
      <main className="hubpage">
        <header className="hubpage__head"><h1>Coffee kiosk</h1><span className="pill pill--ok">live</span></header>
        <Live o={live} />
      </main>
    );
  }
  const configured = kioskAuthed("Bearer " + (process.env.KIOSK_TOKEN || ""));
  let body: React.ReactNode;
  try {
    const k = await loadKiosk();
    const r = k.report;
    body = !r ? (
      <div className="notice">
        <strong>The kiosk hasn&apos;t reported in yet.</strong>{" "}
        {configured ? "Once its hub link is switched on (HUB_URL and HUB_TOKEN on the Pi), its status shows here within a minute." : "Set KIOSK_TOKEN here (24+ random characters) and the same value as HUB_TOKEN on the Pi."}
      </div>
    ) : (
      <>
        <div className="stats">
          <Stat label="Status" value={<span className={"dot-status dot-status--" + (k.online ? MODE[r.mode][1] : "off")}>{k.online ? MODE[r.mode][0] : "Offline"}</span>}
            sub={k.online ? `reported ${ago(k.receivedAt)}` : `last seen ${ago(k.receivedAt)}, showing that report`} />
          <Stat label="Coffees today" value={r.today.vends} sub={r.today.failed ? `${r.today.failed} failed` : "no failures"} />
          <Stat label="Top-ups today" value={euros(r.today.topups_cents, true)} sub="cash at the desk" />
          <Stat label="Capsules left" value={r.columns.reduce((n, c) => n + Math.max(0, c.stock), 0)}
            sub={(() => { const n = r.columns.filter((c) => c.enabled && c.sku && c.stock <= 0).length; return n ? `${n} column${n > 1 ? "s" : ""} empty` : "no empty columns"; })()} />
        </div>

        {r.alerts && r.alerts.length > 0 && (
          <div className="notice notice--bad"><strong>Open alerts on the kiosk:</strong> {r.alerts.map((a) => a.detail || a.code).join(" · ")}</div>
        )}

        {live && !live.ok && (live.kind === "offline"
          ? <div className="notice notice--warn"><strong>The kiosk isn&apos;t answering live.</strong> This is its last report. Refills here are queued for its next check-in.</div>
          : <PiDown err={live} />)}

        <Panel title="Columns" action={<span className="muted small">Refills are queued and the kiosk applies them on its next check-in.</span>}>
          <div className="tubes">
            {r.columns.map((c) => (
              <div key={c.index} className={"tube" + (!c.enabled ? " tube--off" : "")}>
                <span className="tube__glass" title={`${c.stock} of ${c.capacity}`}>
                  <i style={{ height: `${Math.max(0, Math.min(1, c.stock / Math.max(1, c.capacity))) * 100}%`, background: c.color || "var(--crimson)" }} />
                </span>
                <strong>{c.stock}<span className="muted">/{c.capacity}</span></strong>
                <span className="tube__name" title={c.name || ""}>{c.name || "empty"}</span>
                {!c.enabled && <span className="pill pill--bad">off</span>}
                <RefillButton column={c.index} capacity={c.capacity} stock={c.stock} disabled={!c.sku} />
              </div>
            ))}
          </div>
        </Panel>

        <div className="cols">
          <Panel title="Control">
            <KioskControls mode={r.mode} />
            <h3 className="h3">Recent commands</h3>
            {k.commands.length === 0 ? <p className="muted">None yet.</p> : (
              <ul className="list">
                {k.commands.map((c) => (
                  <li key={c.id}>
                    <span>{COMMANDS[c.kind] || c.kind}{c.kind === "maintenance" ? (c.args.on ? ": on" : ": off") : c.kind === "refill" ? `: column ${Number(c.args.column) + 1}, ${"to" in c.args ? `fill to ${c.args.to}` : `+${c.args.add}`}` : ""}
                      <span className="muted small"> · {athensDate(c.created_at)} {athensTime(c.created_at)}</span></span>
                    <span className={"pill " + (c.ok === true ? "pill--ok" : c.ok === false ? "pill--bad" : "pill--warn")} title={c.result || ""}>
                      {c.ok === true ? "done" : c.ok === false ? "failed" : c.picked_at ? "running" : "waiting"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent cash top-ups">
            {k.topups.length === 0 ? <p className="muted">None reported yet.</p> : (
              <ul className="list">{k.topups.map((t) => (
                <li key={t.id}><span>{athensDate(t.at)} {athensTime(t.at)} <span className="muted small">· {t.coffees} coffees</span></span><strong>{euros(t.cents)}</strong></li>
              ))}</ul>
            )}
            <p className="muted small">Amounts only; who topped up stays on the kiosk. These feed Finance automatically.</p>
          </Panel>

          {r.health && Object.keys(r.health).length > 0 && (
            <Panel title="Health">
              <table className="tbl"><tbody>
                {Object.entries(r.health).map(([k2, v]) => <tr key={k2}><td>{k2.replace(/_/g, " ")}</td><td className="num">{String(v)}</td></tr>)}
                <tr><td>software</td><td className="num"><code>{r.version}</code></td></tr>
              </tbody></table>
            </Panel>
          )}
        </div>
      </>
    );
  } catch (err) {
    body = <DbDown err={err} />;
  }
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Coffee kiosk</h1></header>
      {body}
    </main>
  );
}
