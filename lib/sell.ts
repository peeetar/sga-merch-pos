// Server only. The coffee cash box: shifts and top-ups sold from the hub.
//
// A sale is saved here first and then sent to the Pi with /pos/sync, the same
// call its own Sell tab uses. That call counts each id once however many times
// it arrives, so sending again is always safe. If the Pi is off, sales wait
// here and go out when it's back: on the next page view, the next sale, or the
// Pi's next minute report.
import { randomUUID } from "node:crypto";
import { ensureSchema, getSetting, setSetting, sql } from "./db";
import { countTotal } from "./calc";
import { piGet, piPost, type PiConfig, type PiFailure } from "./pi";
import type { Counts } from "./types";

export type CoffeeShift = {
  id: string; opened_at: string; opened_by: string; opening_cents: number; opening_counts: Counts;
  closed_at: string | null; closed_by: string | null; counted_cents: number | null; counted_counts: Counts | null;
  expected_cents: number | null; note: string | null;
};
export type CoffeeSale = {
  id: string; student_id: string; bundle_cents: number; coffees: number; seller: string; shift_id: string;
  sold_at: string; voided_at: string | null; void_reason: string | null; void_by: string | null;
};
export type SaleRow = CoffeeSale & { waiting: boolean; rejected: string | null };
type Row = { kind: "shift" | "sale"; id: string; data: CoffeeShift | CoffeeSale; version: number };
type SyncReply = { sales: Record<string, string>; shifts: string[]; balances: Record<string, number>; rejected: Record<string, string> };

const DEVICE = "SGA Hub";
const PRICE_KEY = "kiosk_price_list";
const SYNC_TIMEOUT_MS = 4000; // a repeat is harmless, so don't keep a seller waiting

export type PriceList = Pick<PiConfig, "bundles" | "student_id_length">;

/** From the Pi when it answers, remembered so selling works when it doesn't. */
export async function priceList(actor: string): Promise<PriceList | null> {
  const saved = await getSetting<PriceList | null>(PRICE_KEY, null);
  if (saved) return saved;
  const cfg = await piGet<PiConfig>("/config", actor);
  if (!cfg.ok) return null;
  const list = { bundles: cfg.bundles, student_id_length: cfg.student_id_length };
  await setSetting(PRICE_KEY, list);
  return list;
}

export async function refreshPriceList(actor: string) {
  const cfg = await piGet<PiConfig>("/config", actor);
  if (cfg.ok) await setSetting(PRICE_KEY, { bundles: cfg.bundles, student_id_length: cfg.student_id_length });
}

export async function loadSell() {
  await ensureSchema();
  const rows = (await sql()`SELECT kind, id, data, version, synced, rejected FROM hub_coffee_rows
    WHERE kind = 'shift' AND data->>'closed_at' IS NULL
       OR kind = 'sale' AND data->>'shift_id' IN (SELECT id FROM hub_coffee_rows WHERE kind = 'shift' AND data->>'closed_at' IS NULL)
       OR rejected IS NOT NULL
    ORDER BY created_at DESC LIMIT 1000`) as (Row & { synced: number; rejected: string | null })[];
  const [pending] = (await sql()`SELECT count(*)::int AS n FROM hub_coffee_rows WHERE synced < version AND rejected IS NULL`) as { n: number }[];
  const shift = (rows.find((r) => r.kind === "shift" && !(r.data as CoffeeShift).closed_at)?.data as CoffeeShift) || null;
  const sales: SaleRow[] = rows.filter((r) => r.kind === "sale" && shift && (r.data as CoffeeSale).shift_id === shift.id)
    .map((r) => ({ ...(r.data as CoffeeSale), waiting: r.synced < r.version && !r.rejected, rejected: r.rejected }));
  const refused = rows.filter((r) => r.rejected).map((r) => ({ id: r.id, reason: r.rejected as string, student_id: (r.data as CoffeeSale).student_id ?? null }));
  return { shift, sales, pending: pending.n, refused };
}

const liveCents = (sales: { bundle_cents: number; voided_at: string | null }[]) =>
  sales.filter((s) => !s.voided_at).reduce((n, s) => n + s.bundle_cents, 0);

export async function openShift(by: string, counts: Counts): Promise<string | null> {
  const { shift } = await loadSell();
  if (shift) return "A cash box is already open.";
  const data: CoffeeShift = {
    id: randomUUID(), opened_at: new Date().toISOString(), opened_by: by, opening_cents: countTotal(counts), opening_counts: counts,
    closed_at: null, closed_by: null, counted_cents: null, counted_counts: null, expected_cents: null, note: null,
  };
  await sql()`INSERT INTO hub_coffee_rows (kind, id, data) VALUES ('shift', ${data.id}, ${JSON.stringify(data)}::jsonb)`;
  return null;
}

export async function recordSale(seller: string, studentId: string, cents: number): Promise<string | CoffeeSale> {
  const { shift } = await loadSell();
  if (!shift) return "Open the cash box first.";
  const prices = await priceList(seller);
  if (!prices) return "The price list hasn't loaded yet. The kiosk has to answer once.";
  const bundle = prices.bundles.find((b) => b.cents === cents);
  if (!bundle) return "That amount isn't on the price list.";
  if (!/^\d+$/.test(studentId) || studentId.length !== prices.student_id_length) return `A student ID is ${prices.student_id_length} digits.`;
  const data: CoffeeSale = {
    id: randomUUID(), student_id: studentId, bundle_cents: cents, coffees: bundle.coffees, seller, shift_id: shift.id,
    sold_at: new Date().toISOString(), voided_at: null, void_reason: null, void_by: null,
  };
  await sql()`INSERT INTO hub_coffee_rows (kind, id, data) VALUES ('sale', ${data.id}, ${JSON.stringify(data)}::jsonb)`;
  return data;
}

export async function voidSale(id: string, reason: string, by: string): Promise<string | null> {
  await ensureSchema();
  const patch = { voided_at: new Date().toISOString(), void_reason: reason.slice(0, 200), void_by: by };
  const rows = await sql()`UPDATE hub_coffee_rows SET data = data || ${JSON.stringify(patch)}::jsonb, version = version + 1
    WHERE kind = 'sale' AND id = ${id} AND data->>'voided_at' IS NULL RETURNING id`;
  return rows.length ? null : "That sale was already voided.";
}

export async function closeShift(by: string, counts: Counts, note: string): Promise<string | null> {
  const { shift, sales } = await loadSell();
  if (!shift) return "No cash box is open.";
  const patch = {
    closed_at: new Date().toISOString(), closed_by: by, counted_cents: countTotal(counts), counted_counts: counts,
    expected_cents: shift.opening_cents + liveCents(sales), note: note.trim().slice(0, 500) || null,
  };
  await sql()`UPDATE hub_coffee_rows SET data = data || ${JSON.stringify(patch)}::jsonb, version = version + 1 WHERE kind = 'shift' AND id = ${shift.id}`;
  return null;
}

/** Send whatever the Pi doesn't have yet. Returns what's still waiting. */
export async function flushSell(actor: string): Promise<{ pending: number; balances: Record<string, number>; failure?: PiFailure }> {
  await ensureSchema();
  const q = sql();
  const rows = (await q`SELECT kind, id, data, version FROM hub_coffee_rows WHERE synced < version AND rejected IS NULL ORDER BY created_at LIMIT 500`) as Row[];
  if (rows.length === 0) return { pending: 0, balances: {} };
  const shifts = rows.filter((r) => r.kind === "shift").map((r) => r.data as CoffeeShift);
  const sales = rows.filter((r) => r.kind === "sale").map((r) => r.data as CoffeeSale);
  const oldest = sales.map((s) => s.sold_at).sort()[0] ?? null;
  const res = await piPost<SyncReply>("/pos/sync", actor, { device: DEVICE, oldest_queued_at: oldest, sales, shifts }, SYNC_TIMEOUT_MS);
  if (!res.ok) return { pending: rows.length, balances: {}, failure: res };
  const took = new Set([...Object.keys(res.sales), ...res.shifts]);
  await q.transaction(rows.flatMap((r) => {
    if (took.has(r.id)) return [q`UPDATE hub_coffee_rows SET synced = GREATEST(synced, ${r.version}) WHERE kind = ${r.kind} AND id = ${r.id}`];
    const why = res.rejected[r.id];
    return why ? [q`UPDATE hub_coffee_rows SET rejected = ${why.slice(0, 300)} WHERE kind = ${r.kind} AND id = ${r.id}`] : [];
  }));
  const [left] = (await q`SELECT count(*)::int AS n FROM hub_coffee_rows WHERE synced < version AND rejected IS NULL`) as { n: number }[];
  return { pending: left.n, balances: res.balances };
}
