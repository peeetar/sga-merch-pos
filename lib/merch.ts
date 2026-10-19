// Server only. The till's rows as the hub sees them: what the overview, the
// Merch page and the low-stock alerts read. The maths is lib/calc, the same
// code the tablets run, so the hub and the till never disagree.
import { activeProducts, stockLevels, trackedVariants } from "./calc";
import { ensureSchema, sql } from "./db";
import { isPlain, lowMark, variantKey, type Bundle, type Product, type StoreName } from "./types";

export async function loadMerch(): Promise<Bundle> {
  await ensureSchema();
  const rows = (await sql()`SELECT store, data FROM merch_rows`) as { store: StoreName; data: never }[];
  const out: Bundle = { products: [], moves: [], sales: [], shifts: [], cashmoves: [] };
  for (const r of rows) (out[r.store] as unknown[] | undefined)?.push(r.data);
  return out;
}

export type LowRow = { key: string; product: Product; color: string; size: string; left: number };

/** Variants on sale that are counted and at or under the low mark. A size
 *  that never had any stock (ordered as 0) isn't "sold out", it just isn't
 *  stocked, so it's left out. */
export function lowStock(data: Bundle): LowRow[] {
  const on = stockLevels(data.moves, data.sales);
  const tracked = trackedVariants(data.moves);
  const stocked = new Set(data.moves.filter((m) => m.delta > 0).map((m) => variantKey(m.product_id, m.color_id, m.size)));
  const out: LowRow[] = [];
  for (const p of activeProducts(data.products)) {
    const low = lowMark(p);
    for (const c of p.colors) for (const s of p.sizes) {
      const key = variantKey(p.id, c.id, s);
      if (!tracked.has(key) || !stocked.has(key)) continue;
      const left = on.get(key) || 0;
      if (left <= low) out.push({ key, product: p, color: c.name, size: s, left });
    }
  }
  return out.sort((a, b) => a.left - b.left || a.product.sort - b.product.sort);
}

/** Human name for a variant; a plain article has no colour or size to show. */
export function variantName(p: Product, color: string, size: string) {
  return isPlain(p) ? p.name : `${p.name} · ${color} · ${size}`;
}
