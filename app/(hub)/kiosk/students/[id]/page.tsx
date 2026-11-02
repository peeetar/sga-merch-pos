import Link from "next/link";
import { Panel, Stat, ago } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet, type PiConfig, type PiStudentDetail } from "@/lib/pi";
import { athensDate, athensTime } from "@/lib/time";
import { euros } from "@/lib/types";
import { PiDown } from "../../PiDown";
import { Adjust, FixId, Housekeeping, TopUp } from "./StudentActions";

export const metadata = { title: "Student · SGA Hub" };

const WHAT: Record<string, string> = { topup: "Top-up", manual: "Correction", promo: "Early sign-up gift", refund: "Refund", vend: "Coffee" };

export default async function Student({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireBoard();
  const { id } = await params;
  const [d, cfg] = await Promise.all([
    piGet<PiStudentDetail>(`/students/${encodeURIComponent(id)}`, me.email),
    piGet<PiConfig>("/config", me.email),
  ]);
  if (!d.ok) return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>{id}</h1><Link className="btn btn--sm" href="/kiosk/students">Back</Link></header>
      <PiDown err={d} />
    </main>
  );
  const s = d.student;
  return (
    <main className="hubpage">
      <header className="hubpage__head">
        <h1>{s.student_id} {s.kind === "staff" && <span className="pill pill--warn">staff</span>}</h1>
        <Link className="btn btn--sm" href="/kiosk/students">Back</Link>
      </header>
      {!d.history_matches && <div className="notice notice--bad"><strong>The balance doesn&apos;t match the history below.</strong> Tell the Treasurer before changing anything.</div>}
      <div className="stats">
        <Stat label="Coffees" value={s.credits} sub="prepaid balance" />
        <Stat label="PIN" value={s.locked_for > 0 ? "Locked" : s.has_pin ? "Set" : "Not yet"} sub={s.locked_for > 0 ? `for ${Math.ceil(s.locked_for / 60)} more min` : s.failed_pins ? `${s.failed_pins} wrong tries` : "no wrong tries"} />
        <Stat label="Last seen" value={<span className="small">{ago(s.last_seen_at)}</span>} sub={`joined ${athensDate(s.created_at)}`} />
      </div>
      <div className="cols">
        <Panel title="Top up">
          {cfg.ok ? <TopUp id={s.student_id} bundles={cfg.bundles} /> : <p className="muted">The price list didn&apos;t load.</p>}
          <p className="muted small">At a stall or office hours, use <Link href="/kiosk/sell">Sell</Link>, so the cash counts in the box.</p>
        </Panel>
        <Panel title="Fix something">
          <Adjust id={s.student_id} />
          <Housekeeping id={s.student_id} locked={s.locked_for > 0} hasPin={s.has_pin} staff={s.kind === "staff"} />
          {s.kind === "student" && cfg.ok && <FixId id={s.student_id} length={cfg.student_id_length} />}
        </Panel>
      </div>
      <Panel title="History">
        {d.timeline.length === 0 ? <p className="muted">Nothing yet.</p> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>What</th><th className="num">Coffees</th><th className="num">Balance</th><th>By</th></tr></thead>
            <tbody>
              {d.timeline.slice(0, 100).map((t) => (
                <tr key={`${t.kind}-${t.id}`}>
                  <td className="muted">{athensDate(t.at)} {athensTime(t.at)}</td>
                  <td>{WHAT[t.reason || t.kind] || t.reason || t.kind}{t.cash_cents ? <span className="muted"> · {euros(t.cash_cents, true)} cash</span> : null}</td>
                  <td className="num">{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                  <td className="num">{t.balance}</td>
                  <td className="muted small">{t.actor || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}
