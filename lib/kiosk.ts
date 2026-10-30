// Server only. The coffee kiosk's line to the hub. The Pi calls out (it has no
// open ports): every minute it POSTs a report to /api/kiosk/report and gets
// back any commands the board queued. Everything here is what the Pi last
// said, so the hub keeps working, showing "last seen", when the kiosk is off.
//
// Students are never sent: top-ups arrive as amounts only, for Finance.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { ensureSchema, sql } from "./db";

export type KioskColumn = { index: number; name: string | null; sku: string | null; color?: string | null; stock: number; capacity: number; enabled: boolean };
export type KioskAlert = { code: string; level: string; detail?: string | null; since?: string | null };
export type KioskReport = {
  boot_id: string;
  version: string;
  reported_at: string;
  mode: "in_service" | "maintenance" | "out_of_service";
  columns: KioskColumn[];
  today: { vends: number; failed: number; topups_cents: number };
  health?: Record<string, string | number | boolean | null>;
  alerts?: KioskAlert[];
};
export type Topup = { id: string; at: string; cents: number; coffees: number };

export const COMMANDS = {
  maintenance: "Maintenance on/off",
  refill: "Refill a column",
  reload: "Reload the kiosk screen",
} as const;
export type CommandKind = keyof typeof COMMANDS;
export type Command = { id: string; kind: CommandKind; args: Record<string, unknown>; created_by: string; created_at: string;
  picked_at: string | null; done_at: string | null; ok: boolean | null; result: string | null };

/** A command nobody picked up in this long is dropped: a refill queued while
 *  the kiosk was off for a week must not land on top of a real refill. */
export const COMMAND_TTL_MIN = 15;
export const ONLINE_WITHIN_S = 180;

export function kioskAuthed(header: string | null): boolean {
  const want = process.env.KIOSK_TOKEN || "";
  const got = (header || "").replace(/^Bearer\s+/i, "");
  return want.length >= 24 && want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

const isStr = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max;
const isInt = (v: unknown, min = 0, max = 1e9): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;

/** Keep what we understand, drop the rest, refuse nonsense. */
export function parseReport(b: Record<string, unknown>): { report: KioskReport; topups: Topup[] } | null {
  if (!isStr(b.boot_id, 64) || !isStr(b.version, 64) || !isStr(b.reported_at, 40)) return null;
  if (!["in_service", "maintenance", "out_of_service"].includes(String(b.mode))) return null;
  if (!Array.isArray(b.columns) || b.columns.length > 40) return null;
  const columns: KioskColumn[] = [];
  for (const c of b.columns as Record<string, unknown>[]) {
    if (!c || !isInt(c.index, 0, 99) || !isInt(c.stock, -999, 999) || !isInt(c.capacity, 0, 999)) return null;
    columns.push({ index: c.index, stock: c.stock, capacity: c.capacity, enabled: c.enabled !== false,
      name: isStr(c.name, 80) ? c.name : null, sku: isStr(c.sku, 80) ? c.sku : null,
      color: isStr(c.color, 9) && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : null });
  }
  const t = (b.today || {}) as Record<string, unknown>;
  const health: Record<string, string | number | boolean | null> = {};
  if (b.health && typeof b.health === "object") {
    for (const [k, v] of Object.entries(b.health as Record<string, unknown>).slice(0, 30)) {
      if (k.length <= 40 && (v === null || typeof v === "boolean" || typeof v === "number" || (typeof v === "string" && v.length <= 200))) health[k] = v as never;
    }
  }
  const alerts = Array.isArray(b.alerts) ? (b.alerts as Record<string, unknown>[]).filter((a) => a && isStr(a.code, 60) && isStr(a.level, 10)).slice(0, 30)
    .map((a) => ({ code: a.code as string, level: a.level as string, detail: isStr(a.detail, 300) ? a.detail : null, since: isStr(a.since, 40) ? a.since : null })) : [];
  const topups = Array.isArray(b.topups) ? (b.topups as Record<string, unknown>[])
    .filter((x) => x && isStr(x.id, 64) && isStr(x.at, 40) && !Number.isNaN(Date.parse(x.at as string)) && isInt(x.cents, 1, 100_000) && isInt(x.coffees, 0, 1000))
    .slice(0, 2000).map((x) => ({ id: x.id as string, at: x.at as string, cents: x.cents as number, coffees: x.coffees as number })) : [];
  return {
    report: {
      boot_id: b.boot_id, version: b.version, reported_at: b.reported_at, mode: b.mode as KioskReport["mode"], columns,
      today: { vends: isInt(t.vends) ? t.vends : 0, failed: isInt(t.failed) ? t.failed : 0, topups_cents: isInt(t.topups_cents) ? t.topups_cents : 0 },
      health, alerts,
    },
    topups,
  };
}

export async function storeReport(report: KioskReport, topups: Topup[]): Promise<Command[]> {
  await ensureSchema();
  const q = sql();
  await q.transaction([
    q`INSERT INTO hub_kiosk_state (id, report, received_at) VALUES (1, ${JSON.stringify(report)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET report = EXCLUDED.report, received_at = now()`,
    ...topups.map((t) => q`INSERT INTO hub_kiosk_topups (id, at, cents, coffees) VALUES (${t.id}, ${t.at}::timestamptz, ${t.cents}, ${t.coffees})
      ON CONFLICT (id) DO NOTHING`),
    q`UPDATE hub_kiosk_commands SET done_at = now(), ok = false, result = 'expired: the kiosk did not pick it up in time'
      WHERE picked_at IS NULL AND done_at IS NULL AND created_at < now() - make_interval(mins => ${COMMAND_TTL_MIN})`,
  ]);
  // Hand over what's waiting, and anything picked up but never acknowledged
  // (the Pi restarted mid-command); the Pi runs each id at most once.
  return (await q`UPDATE hub_kiosk_commands SET picked_at = COALESCE(picked_at, now())
    WHERE done_at IS NULL RETURNING id, kind, args, created_by, created_at::text, picked_at::text, done_at, ok, result`) as Command[];
}

export async function ackCommand(id: string, ok: boolean, result: string) {
  await ensureSchema();
  await sql()`UPDATE hub_kiosk_commands SET done_at = now(), ok = ${ok}, result = ${result.slice(0, 500)} WHERE id = ${id} AND done_at IS NULL`;
}

export async function queueCommand(kind: CommandKind, args: Record<string, unknown>, by: string) {
  await ensureSchema();
  await sql()`INSERT INTO hub_kiosk_commands (id, kind, args, created_by) VALUES (${randomUUID()}, ${kind}, ${JSON.stringify(args)}::jsonb, ${by})`;
}

export async function loadKiosk() {
  await ensureSchema();
  const q = sql();
  const [state] = (await q`SELECT report, received_at::text AS received_at FROM hub_kiosk_state WHERE id = 1`) as { report: KioskReport; received_at: string }[];
  const commands = (await q`SELECT id, kind, args, created_by, created_at::text, picked_at::text, done_at::text, ok, result
    FROM hub_kiosk_commands ORDER BY created_at DESC LIMIT 15`) as Command[];
  const topups = (await q`SELECT id, at::text AS at, cents, coffees FROM hub_kiosk_topups ORDER BY at DESC LIMIT 20`) as Topup[];
  const online = !!state && Date.now() - Date.parse(state.received_at) < ONLINE_WITHIN_S * 1000;
  return { report: state?.report ?? null, receivedAt: state?.received_at ?? null, online, commands, topups };
}
