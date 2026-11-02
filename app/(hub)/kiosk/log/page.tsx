import { Panel } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet } from "@/lib/pi";
import { athensDate, athensTime } from "@/lib/time";
import { PiDown } from "../PiDown";

export const metadata = { title: "Kiosk log · SGA Hub" };

type Entry = { id: number; at: string; actor: string; listener: string; action: string; target: string | null };

export default async function Log() {
  const me = await requireBoard();
  const d = await piGet<{ entries: Entry[] }>("/audit?limit=200", me.email);
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Kiosk log</h1></header>
      {!d.ok ? <PiDown err={d} /> : (
        <Panel title="Everything the board changed on the kiosk">
          {d.entries.length === 0 ? <p className="muted">Nothing yet.</p> : (
            <table className="tbl">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>On</th></tr></thead>
              <tbody>{d.entries.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{athensDate(e.at)} {athensTime(e.at)}</td><td className="small">{e.actor}</td>
                  <td>{e.action.replace(/^admin_api[a-z_]*\./, "").replace(/_/g, " ")}</td><td className="muted small">{(e.target || "").replace(/[{}"]/g, "").slice(0, 40)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      )}
    </main>
  );
}
