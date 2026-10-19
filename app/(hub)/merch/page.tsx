import { DbDown, Panel, Stat } from "@/components/hub/bits";
import { activeProducts, live, stockLevels, trackedVariants } from "@/lib/calc";
import { currentTerm } from "@/lib/db";
import { lowStock, loadMerch, variantName } from "@/lib/merch";
import { athensDate, athensDay, athensTime, lastDays, termStart } from "@/lib/time";
import { categoryOf, euros, isPlain, variantKey } from "@/lib/types";

export const metadata = { title: "Till & merch · SGA Hub" };

export default async function Merch() {
  let body: React.ReactNode;
  try {
    const [data, term] = await Promise.all([loadMerch(), currentTerm()]);
    const from = termStart(term);
    const sales = live(data.sales).filter((s) => athensDay(s.sold_at) >= from);
    const total = sales.reduce((n, s) => n + s.total_cents, 0);
    const units = sales.reduce((n, s) => n + s.lines.reduce((k, l) => k + l.qty, 0), 0);
    const days = lastDays(14);
    const perDay = new Map(days.map((d) => [d, 0]));
    for (const s of sales) { const d = athensDay(s.sold_at); if (perDay.has(d)) perDay.set(d, perDay.get(d)! + s.total_cents); }
    const peak = Math.max(1, ...perDay.values());

    const byProduct = new Map<string, { name: string; units: number; cents: number }>();
    for (const s of sales) for (const l of s.lines) {
      const r = byProduct.get(l.product_id) || { name: l.product_name, units: 0, cents: 0 };
      r.units += l.qty; r.cents += l.qty * l.unit_cents;
      byProduct.set(l.product_id, r);
    }
    const on = stockLevels(data.moves, data.sales);
    const tracked = trackedVariants(data.moves);
    const products = activeProducts(data.products);
    const low = lowStock(data);
    const shifts = [...data.shifts].sort((a, b) => b.opened_at.localeCompare(a.opened_at)).slice(0, 10);

    body = (
      <>
        <div className="stats">
          <Stat label={`Takings since 1 Aug`} value={euros(total, true)} sub={`${sales.length} sales · ${units} items`} />
          <Stat label="Products on sale" value={products.length} sub={`${[...new Set(products.map(categoryOf))].length} categories`} />
          <Stat label="Low or sold out" value={low.length} sub={low.filter((r) => r.left <= 0).length + " sold out"} />
        </div>

        <Panel title="Last 14 days">
          <div className="bars" role="img" aria-label="Takings per day for the last 14 days">
            {days.map((d) => {
              const c = perDay.get(d) || 0;
              return (
                <div key={d} className="bars__col" title={`${athensDate(d + "T12:00:00Z")}: ${euros(c)}`}>
                  <span className="bars__val">{c ? euros(c, true) : ""}</span>
                  <span className="bars__bar" style={{ height: `${(c / peak) * 100}%` }} />
                  <span className="bars__day">{athensDate(d + "T12:00:00Z", { day: "numeric" })}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="cols">
          <Panel title="Stock on hand">
            <table className="tbl">
              <thead><tr><th>Product</th><th className="num">On hand</th><th className="num">Sold this term</th></tr></thead>
              <tbody>
                {products.map((p) => {
                  let n = 0, any = false;
                  for (const c of p.colors) for (const s of p.sizes) {
                    const k = variantKey(p.id, c.id, s);
                    if (tracked.has(k)) { any = true; n += on.get(k) || 0; }
                  }
                  return (
                    <tr key={p.id}>
                      <td>{p.name} <span className="muted small">· {categoryOf(p)}{isPlain(p) ? "" : ` · ${p.colors.length}×${p.sizes.length}`}</span></td>
                      <td className="num">{any ? n : "—"}</td>
                      <td className="num">{byProduct.get(p.id)?.units ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted small">Change prices, add articles and log deliveries on the till&apos;s Stock tab.</p>
          </Panel>

          <Panel title="Running low">
            {low.length === 0 ? <p className="muted">Nothing is low.</p> : (
              <ul className="list">
                {low.map((r) => (
                  <li key={r.key}><span>{variantName(r.product, r.color, r.size)}</span>
                    <span className={"pill " + (r.left <= 0 ? "pill--bad" : "pill--warn")}>{r.left <= 0 ? "sold out" : `${r.left} left`}</span></li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Cash boxes" action={<a className="btn btn--sm" href="/api/merch/export">Export sales CSV</a>}>
          {shifts.length === 0 ? <p className="muted">No shifts yet.</p> : (
            <table className="tbl">
              <thead><tr><th>Opened</th><th>By</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Over / short</th></tr></thead>
              <tbody>
                {shifts.map((s) => {
                  const diff = s.counted_cents !== null && s.expected_cents !== null ? s.counted_cents - s.expected_cents : null;
                  return (
                    <tr key={s.id}>
                      <td>{athensDate(s.opened_at, { weekday: "short", day: "numeric", month: "short" })} {athensTime(s.opened_at)}</td>
                      <td>{s.opened_by}{s.closed_by && s.closed_by !== s.opened_by ? ` → ${s.closed_by}` : ""}</td>
                      <td className="num">{s.expected_cents !== null ? euros(s.expected_cents) : <span className="pill pill--warn">open</span>}</td>
                      <td className="num">{s.counted_cents !== null ? euros(s.counted_cents) : "—"}</td>
                      <td className={"num " + (diff ? (diff > 0 ? "pos" : "neg") : "")}>{diff === null ? "—" : diff === 0 ? "exact" : (diff > 0 ? "+" : "") + euros(diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </>
    );
  } catch (err) {
    body = <DbDown err={err} />;
  }
  return (
    <main className="hubpage">
      <header className="hubpage__head">
        <h1>Till &amp; merch</h1>
        <a className="btn btn--sm btn--primary" href="/pos">Open the till</a>
      </header>
      {body}
    </main>
  );
}
