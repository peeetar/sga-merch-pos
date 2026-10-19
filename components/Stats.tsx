"use client";

// What's selling. Every tablet's sales are pulled in on sync, so these numbers
// cover the whole stall, not just this device.
import { useMemo, useState } from "react";
import { activeProducts, salesCsv, stats, type Agg } from "@/lib/calc";
import { euros, variantKey, type Bundle, type Shift } from "@/lib/types";

type Range = "shift" | "today" | "week" | "all";
type Levels = { on: Map<string, number>; tracked: Set<string> };

function bounds(range: Range, shift: Shift | null): [number, number] {
  const end = Date.now() + 60_000;
  if (range === "shift" && shift) return [Date.parse(shift.opened_at), Date.parse(shift.closed_at || "") || end];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "today") return [d.getTime(), end];
  if (range === "week") return [d.getTime() - 6 * 86400_000, end];
  return [0, end];
}

function Bars({ title, rows, by, limit = 12, stack }: { title: string; rows: Agg[]; by: "units" | "cents"; limit?: number; stack?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r[by]));
  const total = rows.reduce((n, r) => n + r.units, 0);
  return (
    <section className="statcard">
      <h3 className="h3">{title}</h3>
      {rows.length === 0 && <p className="muted small">Nothing sold in this range.</p>}
      <ul className={"bars" + (stack ? " bars--stack" : "")}>
        {rows.slice(0, limit).map((r) => (
          <li key={r.key}>
            <span className="bars__label">{r.hex && <i className="dot" style={{ background: r.hex }} />}{r.label}</span>
            <span className="bars__track"><span className="bars__fill" style={{ width: `${(r[by] / max) * 100}%` }} /></span>
            <span className="bars__val">
              <strong>{by === "units" ? r.units : euros(r.cents, true)}</strong>
              <small>{by === "units" ? `${Math.round((r.units / Math.max(1, total)) * 100)}% · ${euros(r.cents, true)}` : `${r.units} items`}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Stats({ data, shift, lastShift, levels }: {
  data: Bundle; shift: Shift | null; lastShift: Shift | null; levels: Levels;
}) {
  const refShift = shift || lastShift;
  const [range, setRange] = useState<Range>(refShift ? "shift" : "today");
  const [by, setBy] = useState<"units" | "cents">("units");
  const [from, to] = bounds(range, refShift);
  const s = useMemo(() => stats(data, from, to), [data, from, to]);

  const watch = useMemo(() => {
    const out: { label: string; hex: string; n: number }[] = [];
    for (const p of activeProducts(data.products)) for (const c of p.colors) for (const z of p.sizes) {
      const k = variantKey(p.id, c.id, z);
      if (!levels.tracked.has(k)) continue;
      const n = levels.on.get(k) || 0;
      if (n <= 3) out.push({ label: `${p.name} · ${c.name} · ${z}`, hex: c.hex, n });
    }
    return out.sort((a, b) => a.n - b.n);
  }, [data.products, levels]);

  function exportCsv() {
    const all = data.sales.filter((x) => { const t = Date.parse(x.sold_at); return t >= from && t < to; });
    const blob = new Blob([salesCsv(all)], { type: "text/csv" });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([blob], `sga-merch-${range}-${stamp}.csv`, { type: "text/csv" });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: file.name }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1>Stats</h1>
        <div className="row">
          <div className="seg seg--inline">
            {refShift && <button className={range === "shift" ? "is-on" : ""} onClick={() => setRange("shift")}>{shift ? "This shift" : "Last shift"}</button>}
            <button className={range === "today" ? "is-on" : ""} onClick={() => setRange("today")}>Today</button>
            <button className={range === "week" ? "is-on" : ""} onClick={() => setRange("week")}>7 days</button>
            <button className={range === "all" ? "is-on" : ""} onClick={() => setRange("all")}>All time</button>
          </div>
          <div className="seg seg--inline">
            <button className={by === "units" ? "is-on" : ""} onClick={() => setBy("units")}>Items</button>
            <button className={by === "cents" ? "is-on" : ""} onClick={() => setBy("cents")}>€</button>
          </div>
          <button className="btn btn--sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Revenue</span><strong>{euros(s.cents)}</strong></div>
        <div className="kpi"><span>Items sold</span><strong>{s.units}</strong></div>
        <div className="kpi"><span>Sales</span><strong>{s.count}</strong></div>
        <div className="kpi"><span>Average sale</span><strong>{euros(s.avg)}</strong></div>
      </div>

      <div className="statgrid">
        <Bars title="By product" rows={s.byProduct} by={by} />
        <Bars title="By colour" rows={s.byColor} by={by} />
        <Bars title="By size" rows={s.bySize} by={by} />
        <Bars title="Top combinations" rows={s.byVariant} by={by} limit={10} stack />
        <Bars title="By seller" rows={s.bySeller} by={by} />
        <Bars title="By hour" rows={s.byHour} by={by} limit={24} />
        <section className="statcard">
          <h3 className="h3">Running low</h3>
          {watch.length === 0 && <p className="muted small">Nothing counted is at 3 or fewer.</p>}
          <ul className="watch">
            {watch.slice(0, 20).map((w) => (
              <li key={w.label}><i className="dot" style={{ background: w.hex }} />{w.label}<strong className={w.n <= 0 ? "neg" : ""}>{w.n <= 0 ? "out" : w.n}</strong></li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
