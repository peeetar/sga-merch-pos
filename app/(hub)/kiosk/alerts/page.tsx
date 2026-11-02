import { Panel } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet, type PiAlert } from "@/lib/pi";
import { athensDate, athensTime } from "@/lib/time";
import { PiDown } from "../PiDown";
import { AlertActions } from "./AlertActions";

export const metadata = { title: "Kiosk alerts · SGA Hub" };

const tone = (p: string) => (p === "urgent" ? "pill--bad" : p === "high" ? "pill--warn" : "");

export default async function Alerts() {
  const me = await requireBoard();
  const d = await piGet<{ alerts: PiAlert[] }>("/alerts", me.email);
  const open = d.ok ? d.alerts.filter((a) => a.state !== "resolved") : [];
  const done = d.ok ? d.alerts.filter((a) => a.state === "resolved").slice(0, 20) : [];
  const row = (a: PiAlert, actions: boolean) => (
    <tr key={a.id}>
      <td><span className={"pill " + tone(a.priority)}>{a.priority}</span></td>
      <td><strong>{a.title}</strong>{(a.message || a.detail) && <div className="muted small">{a.message || a.detail}</div>}</td>
      <td className="muted">{athensDate(a.last_at)} {athensTime(a.last_at)}{(a.count ?? 1) > 1 ? ` · ${a.count}×` : ""}</td>
      <td>{a.state === "acked" && <span className="pill pill--warn">being handled</span>}{actions && <AlertActions id={a.id} acked={a.state === "acked"} />}</td>
    </tr>
  );
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Kiosk alerts</h1></header>
      {!d.ok ? <PiDown err={d} /> : (
        <>
          <Panel title={`Open (${open.length})`}>
            {open.length === 0 ? <p className="muted">All clear.</p> : <table className="tbl"><tbody>{open.map((a) => row(a, true))}</tbody></table>}
          </Panel>
          {done.length > 0 && <Panel title="Resolved"><table className="tbl"><tbody>{done.map((a) => row(a, false))}</tbody></table></Panel>}
        </>
      )}
    </main>
  );
}
