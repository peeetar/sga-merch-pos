// How two copies of the same row combine. Used by the server when a tablet
// pushes, and by the tablet when it pulls, so every copy converges on the same
// answer whichever order the syncs happen in.
import type { CashMove, Product, Sale, Shift, StockMove, StoreName } from "./types";

type AnyRow = Product | StockMove | Sale | Shift | CashMove;

/** JSON with object keys sorted, so two copies of a row compare equal even
 *  after Postgres JSONB has reordered the keys of one of them. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(v ?? null);
}

export function merge(store: StoreName, have: AnyRow | undefined, incoming: AnyRow): AnyRow {
  if (!have) return incoming;
  switch (store) {
    case "products": {
      // Last edit wins. Ties go to what is already stored, so it is stable.
      const a = have as Product, b = incoming as Product;
      return b.updated_at > a.updated_at ? b : a;
    }
    case "moves":
      return have; // a stock move never changes once written
    case "sales": {
      // A void only ever sticks: a resend of the pre-void copy cannot undo it.
      const a = have as Sale, b = incoming as Sale;
      if (a.voided_at) return a;
      return b.voided_at ? { ...a, voided_at: b.voided_at, void_reason: b.void_reason, void_by: b.void_by } : a;
    }
    case "shifts": {
      const a = have as Shift, b = incoming as Shift;
      if (a.closed_at) return a;
      return b.closed_at ? b : a;
    }
    case "cashmoves": {
      const a = have as CashMove, b = incoming as CashMove;
      return a.voided_at || !b.voided_at ? a : { ...a, voided_at: b.voided_at };
    }
  }
}

const str = (v: unknown, max = 80) => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max = 300) => v === null || (typeof v === "string" && v.length <= max);
const int = (v: unknown) => Number.isSafeInteger(v);
const nonNeg = (v: unknown) => int(v) && (v as number) >= 0;

/** Shape checks for anything arriving over the wire. Loose enough to never
 *  reject a real sale, strict enough to keep junk out of the database. */
export function valid(store: StoreName, r: Record<string, unknown>): boolean {
  if (!r || typeof r !== "object" || !str(r.id)) return false;
  switch (store) {
    case "products":
      return str(r.name, 60) && nonNeg(r.price_cents) && Array.isArray(r.colors) && r.colors.length <= 30
        && (r.colors as Record<string, unknown>[]).every((c) => str(c.id) && str(c.name, 40) && /^#[0-9a-fA-F]{6}$/.test(String(c.hex)))
        && Array.isArray(r.sizes) && r.sizes.length > 0 && r.sizes.length <= 20 && r.sizes.every((s) => str(s, 20))
        && typeof r.sort === "number" && Number.isFinite(r.sort) && typeof r.archived === "boolean" && str(r.updated_at);
    case "moves":
      return str(r.product_id) && str(r.color_id) && str(r.size, 20) && int(r.delta)
        && ["delivery", "count", "damaged", "giveaway", "other"].includes(String(r.reason))
        && optStr(r.note) && str(r.by, 40) && str(r.at);
    case "sales":
      return str(r.shift_id) && str(r.device_id) && str(r.seller, 40) && str(r.sold_at)
        && nonNeg(r.total_cents) && nonNeg(r.tendered_cents) && nonNeg(r.change_cents)
        && Array.isArray(r.lines) && r.lines.length > 0 && r.lines.length <= 100
        && (r.lines as Record<string, unknown>[]).every((l) => str(l.product_id) && str(l.product_name, 60)
          && str(l.color_id) && str(l.color_name, 40) && str(l.size, 20) && int(l.qty) && (l.qty as number) > 0 && nonNeg(l.unit_cents))
        && optStr(r.voided_at, 64) && optStr(r.void_reason) && optStr(r.void_by, 40);
    case "shifts":
      return str(r.device_id) && str(r.opened_at) && str(r.opened_by, 40) && int(r.opening_cents)
        && typeof r.opening_counts === "object" && optStr(r.closed_at, 64) && optStr(r.closed_by, 40)
        && (r.counted_cents === null || int(r.counted_cents)) && (r.expected_cents === null || int(r.expected_cents))
        && optStr(r.note, 500);
    case "cashmoves":
      return str(r.shift_id) && int(r.cents) && str(r.reason, 200) && str(r.by, 40) && str(r.at) && optStr(r.voided_at, 64);
  }
}
