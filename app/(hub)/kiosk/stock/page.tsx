import { Panel } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet, type PiColumn } from "@/lib/pi";
import { athensDate } from "@/lib/time";
import { euros } from "@/lib/types";
import { PiDown } from "../PiDown";
import { ColumnRow } from "./ColumnRow";
import { DeliveryButton, ShelfCount } from "./ShelfActions";

export const metadata = { title: "Stock · SGA Hub" };

type Capsule = { sku: string; name: string; on_hand: number; loaded: number; sleeves: number | null; days_left: number | null; reorder: boolean };
type Purchase = { id: number; bought_at: string; name: string | null; sku: string; sleeves: number; cost_cents: number; supplier: string | null };

export default async function Stock() {
  const me = await requireBoard();
  const [cols, caps, bought] = await Promise.all([
    piGet<{ columns: PiColumn[]; capsules: { sku: string; name: string }[] }>("/columns", me.email),
    piGet<{ capsules: Capsule[] }>("/capsules", me.email),
    piGet<{ purchases: Purchase[] }>("/purchases", me.email),
  ]);
  const inUse = caps.ok ? caps.capsules.filter((c) => c.loaded > 0 || (c.sleeves ?? 0) > 0) : [];
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Stock</h1></header>
      {!cols.ok ? <PiDown err={cols} /> : (
        <>
          <Panel title="Columns">
            <table className="tbl">
              <thead><tr><th>#</th><th>Capsule</th><th>Stock</th><th>Status</th><th /></tr></thead>
              <tbody>{cols.columns.map((c) => <ColumnRow key={c.column_index} c={c} capsules={cols.capsules} />)}</tbody>
            </table>
          </Panel>
          <Panel title="Capsules on hand" action={<DeliveryButton capsules={cols.capsules} />}>
            {inUse.length === 0 ? <p className="muted">Nothing loaded.</p> : (
              <table className="tbl">
                <thead><tr><th>Capsule</th><th className="num">In the machine</th><th className="num">Sleeves on the shelf</th><th className="num">Days left</th><th /></tr></thead>
                <tbody>{inUse.map((c) => (
                  <tr key={c.sku}>
                    <td>{c.name}</td><td className="num">{c.loaded}</td><td className="num"><ShelfCount sku={c.sku} sleeves={c.sleeves} /></td>
                    <td className="num">{c.days_left === null ? "–" : Math.round(c.days_left)}</td>
                    <td>{c.reorder && <span className="pill pill--warn">reorder</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
          {bought.ok && bought.purchases.length > 0 && (
            <Panel title="Deliveries">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Capsule</th><th className="num">Sleeves</th><th className="num">Cost</th><th>From</th></tr></thead>
                <tbody>{bought.purchases.slice(0, 20).map((p) => (
                  <tr key={p.id}><td className="muted">{athensDate(p.bought_at)}</td><td>{p.name || p.sku}</td><td className="num">{p.sleeves}</td><td className="num">{euros(p.cost_cents, true)}</td><td className="muted">{p.supplier || "–"}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </main>
  );
}
