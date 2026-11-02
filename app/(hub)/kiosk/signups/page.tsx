import { Panel, Stat } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet } from "@/lib/pi";
import { athensDate } from "@/lib/time";
import { PiDown } from "../PiDown";
import { AddSignups, RemoveSignup } from "./SignupActions";

export const metadata = { title: "Early sign-ups · SGA Hub" };

type Signup = { student_id: string; credits: number; claimed_at: string | null; first_paid_at: string | null };
type Data = { signups: Signup[]; default_credits: number; totals: { registered: number; claimed: number; converted: number } };

export default async function Signups() {
  const me = await requireBoard();
  const d = await piGet<Data>("/signups", me.email);
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Early sign-ups</h1></header>
      {!d.ok ? <PiDown err={d} /> : (
        <>
          <div className="stats">
            <Stat label="On the list" value={d.totals.registered} />
            <Stat label="Claimed" value={d.totals.claimed} />
            <Stat label="Went on to pay" value={d.totals.converted} />
          </div>
          <Panel title="Add to the list"><AddSignups credits={d.default_credits} /></Panel>
          <Panel title="The list">
            {d.signups.length === 0 ? <p className="muted">Nobody yet.</p> : (
              <table className="tbl">
                <thead><tr><th>ID</th><th className="num">Free coffees</th><th>Claimed</th><th>First paid</th><th /></tr></thead>
                <tbody>{d.signups.map((s) => (
                  <tr key={s.student_id}>
                    <td>{s.student_id}</td><td className="num">{s.credits}</td>
                    <td className="muted">{s.claimed_at ? athensDate(s.claimed_at) : "–"}</td>
                    <td className="muted">{s.first_paid_at ? athensDate(s.first_paid_at) : "–"}</td>
                    <td>{!s.claimed_at && <RemoveSignup id={s.student_id} />}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
