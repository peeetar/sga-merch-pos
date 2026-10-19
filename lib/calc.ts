// Pure maths over the local copy: stock on hand, what should be in the box,
// change to give back, and the numbers behind the Stats tab.
import type { Bundle, CashMove, Counts, Product, Sale, Shift, StockMove } from "./types";
import { variantKey } from "./types";

export const DENOMS = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
export const COUNT_DENOMS = DENOMS.filter((d) => d >= 5); // nobody counts 1c and 2c coins at a stall

export const countTotal = (c: Counts) =>
  Object.entries(c).reduce((sum, [d, n]) => sum + Number(d) * (n || 0), 0);

export const live = (sales: Sale[]) => sales.filter((s) => !s.voided_at);

/** On hand per variant: every stock move, minus every unit sold and not voided. */
export function stockLevels(moves: StockMove[], sales: Sale[]): Map<string, number> {
  const m = new Map<string, number>();
  const add = (k: string, n: number) => m.set(k, (m.get(k) || 0) + n);
  for (const mv of moves) add(variantKey(mv.product_id, mv.color_id, mv.size), mv.delta);
  for (const s of live(sales)) for (const l of s.lines) add(variantKey(l.product_id, l.color_id, l.size), -l.qty);
  return m;
}

/** Has this variant ever had stock entered? A product nobody has counted yet
 *  shows "—" instead of a misleading 0. */
export function trackedVariants(moves: StockMove[]): Set<string> {
  return new Set(moves.map((mv) => variantKey(mv.product_id, mv.color_id, mv.size)));
}

/** Greedy works for euro denominations: it always gives the fewest pieces. */
export function changeBreakdown(cents: number): { denom: number; n: number }[] {
  const out: { denom: number; n: number }[] = [];
  let left = cents;
  for (const d of DENOMS) {
    const n = Math.floor(left / d);
    if (n) { out.push({ denom: d, n }); left -= n * d; }
  }
  return out;
}

/** Buttons for "how much did they hand you": exact, then the next note
 *  amounts above it (for €100: €105, €110, €120, €150). */
export function tenderSuggestions(total: number): number[] {
  const out = new Set<number>([total]);
  for (const step of [500, 1000, 2000, 5000, 10000]) out.add(Math.floor(total / step) * step + step);
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

export function shiftTotals(shift: Shift, sales: Sale[], cashmoves: CashMove[]) {
  const mine = sales.filter((s) => s.shift_id === shift.id);
  const ok = live(mine);
  const cash = ok.reduce((n, s) => n + s.total_cents, 0);
  const moves = cashmoves.filter((m) => m.shift_id === shift.id && !m.voided_at);
  const paidIn = moves.filter((m) => m.cents > 0).reduce((n, m) => n + m.cents, 0);
  const paidOut = moves.filter((m) => m.cents < 0).reduce((n, m) => n + m.cents, 0);
  const items = ok.reduce((n, s) => n + s.lines.reduce((k, l) => k + l.qty, 0), 0);
  const sellers = new Map<string, { n: number; cents: number }>();
  for (const s of ok) {
    const row = sellers.get(s.seller) || { n: 0, cents: 0 };
    row.n += 1;
    row.cents += s.total_cents;
    sellers.set(s.seller, row);
  }
  return {
    sales: mine, ok, cash, paidIn, paidOut, moves, items, sellers,
    voided: mine.length - ok.length,
    expected: shift.opening_cents + cash + paidIn + paidOut,
  };
}

// --- stats ------------------------------------------------------------------

export type Agg = { key: string; label: string; hex?: string; units: number; cents: number };

function bump(map: Map<string, Agg>, key: string, label: string, units: number, cents: number, hex?: string) {
  const row = map.get(key) || { key, label, hex, units: 0, cents: 0 };
  row.units += units;
  row.cents += cents;
  map.set(key, row);
}

const sorted = (m: Map<string, Agg>) => [...m.values()].sort((a, b) => b.units - a.units || b.cents - a.cents);

export function stats(data: Bundle, from: number, to: number) {
  const inRange = live(data.sales).filter((s) => {
    const t = Date.parse(s.sold_at);
    return t >= from && t < to;
  });
  const byProduct = new Map<string, Agg>();
  const byColor = new Map<string, Agg>();
  const bySize = new Map<string, Agg>();
  const byVariant = new Map<string, Agg>();
  const bySeller = new Map<string, Agg>();
  const byHour = new Map<string, Agg>();
  const hexOf = new Map<string, string>();
  for (const p of data.products) for (const c of p.colors) hexOf.set(c.id, c.hex);

  let units = 0;
  let cents = 0;
  for (const s of inRange) {
    const u = s.lines.reduce((n, l) => n + l.qty, 0);
    units += u;
    cents += s.total_cents;
    bump(bySeller, s.seller, s.seller, u, s.total_cents);
    const h = new Date(s.sold_at).getHours();
    bump(byHour, String(h).padStart(2, "0"), `${String(h).padStart(2, "0")}:00`, u, s.total_cents);
    for (const l of s.lines) {
      const c = l.qty * l.unit_cents;
      bump(byProduct, l.product_id, l.product_name, l.qty, c);
      bump(byColor, l.color_name.toLowerCase(), l.color_name, l.qty, c, hexOf.get(l.color_id));
      bump(bySize, l.size, l.size, l.qty, c);
      bump(byVariant, variantKey(l.product_id, l.color_id, l.size), `${l.product_name} · ${l.color_name} · ${l.size}`, l.qty, c, hexOf.get(l.color_id));
    }
  }
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "One size"];
  const sizes = [...bySize.values()].sort((a, b) => {
    const ia = sizeOrder.indexOf(a.key), ib = sizeOrder.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return {
    count: inRange.length, units, cents,
    avg: inRange.length ? Math.round(cents / inRange.length) : 0,
    byProduct: sorted(byProduct), byColor: sorted(byColor), bySize: sizes,
    byVariant: sorted(byVariant), bySeller: sorted(bySeller),
    byHour: [...byHour.values()].sort((a, b) => a.key.localeCompare(b.key)),
    sales: inRange,
  };
}

/** One row per line item, for the Treasurer's spreadsheet / cash book. */
export function salesCsv(sales: Sale[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["sale_id", "sold_at", "seller", "product", "color", "size", "qty", "unit_eur", "line_eur", "sale_total_eur", "voided_at", "void_reason"];
  const rows = [head.join(",")];
  for (const s of [...sales].sort((a, b) => a.sold_at.localeCompare(b.sold_at))) {
    for (const l of s.lines) {
      rows.push([s.id, s.sold_at, s.seller, l.product_name, l.color_name, l.size, l.qty,
        (l.unit_cents / 100).toFixed(2), ((l.qty * l.unit_cents) / 100).toFixed(2), (s.total_cents / 100).toFixed(2),
        s.voided_at, s.void_reason].map(esc).join(","));
    }
  }
  return rows.join("\n") + "\n";
}

export const activeProducts = (products: Product[]) =>
  products.filter((p) => !p.archived).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
