import Link from "next/link";
import { Panel, Stat } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet } from "@/lib/pi";
import { euros } from "@/lib/types";
import { PiDown } from "../PiDown";

export const metadata = { title: "Kiosk sales · SGA Hub" };

const REPORTS = { sales: "Sales", when: "When", what: "Flavours", who: "Students", money: "Money", reliability: "Reliability" } as const;
type Name = keyof typeof REPORTS;
type Row = Record<string, string | number | null>;
type Report = { range: { from: string; to: string }; takeaway?: string; rows: Row[]; totals?: Record<string, number | null> };

const words = (k: string) => k.replace(/_cents$/, "").replace(/_/g, " ");
const cell = (k: string, v: string | number | null) => (v === null ? "–" : k.endsWith("_cents") && typeof v === "number" ? euros(v, true) : String(v));
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function Sales({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  const me = await requireBoard();
  const sp = await searchParams;
  const name: Name = sp.r && sp.r in REPORTS ? (sp.r as Name) : "sales";
  const range = isDate(sp.from) && isDate(sp.to) ? `?from=${sp.from}&to=${sp.to}` : "";
  const d = await piGet<Report>(`/analytics/${name}${range}`, me.email);
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Kiosk sales</h1></header>
      <div className="row">
        {(Object.keys(REPORTS) as Name[]).map((r) => <Link key={r} className={"btn btn--sm" + (r === name ? " btn--primary" : "")} href={`/kiosk/sales?r=${r}${range ? `&from=${sp.from}&to=${sp.to}` : ""}`}>{REPORTS[r]}</Link>)}
      </div>
      {!d.ok ? <PiDown err={d} /> : (
        <>
          <form className="row" method="get">
            <input type="hidden" name="r" value={name} />
            <label className="small muted">From <input className="field field--sm field--short" type="date" name="from" defaultValue={d.range.from} /></label>
            <label className="small muted">To <input className="field field--sm field--short" type="date" name="to" defaultValue={d.range.to} /></label>
            <button className="btn btn--sm">Show</button>
          </form>
          {d.takeaway && <div className="notice">{d.takeaway}</div>}
          {d.totals && (
            <div className="stats">{Object.entries(d.totals).map(([k, v]) => <Stat key={k} label={words(k)} value={cell(k, v)} />)}</div>
          )}
          <Panel title={REPORTS[name]}>
            {d.rows.length === 0 ? <p className="muted">Nothing in this range.</p> : (
              <table className="tbl">
                <thead><tr>{Object.keys(d.rows[0]).map((k) => <th key={k}>{words(k)}</th>)}</tr></thead>
                <tbody>{d.rows.slice(0, 200).map((r, i) => <tr key={i}>{Object.keys(d.rows[0]).map((k) => <td key={k}>{cell(k, r[k])}</td>)}</tr>)}</tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
