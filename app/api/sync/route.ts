import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, resetSchema, sql } from "@/lib/db";
import { merge, valid } from "@/lib/merge";
import { authed } from "@/lib/session";
import { STORES, type StoreName } from "@/lib/types";

type Row = Record<string, unknown> & { id: string };

// A missing or unreachable database is a sync failure, not a crash: the
// tablet keeps everything in its outbox and tries again.
function dbDown(err: unknown) {
  console.error("sync db error", err);
  resetSchema();
  return NextResponse.json({ ok: false, code: "db_unavailable" }, { status: 503 });
}

const unauthorized = () => NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });

/** Rows changed since the tablet's last pull (`?since=` is the cursor the
 *  previous pull returned), or everything when there is no cursor. */
export async function GET(req: NextRequest) {
  if (!authed(req)) return unauthorized();
  const since = req.nextUrl.searchParams.get("since");
  try {
    await ensureSchema();
    const q = sql();
    const [{ now }] = (await q`SELECT now() AS now`) as { now: string }[];
    const rows = (since
      ? await q`SELECT store, data FROM merch_rows WHERE synced_at > ${since}::timestamptz`
      : await q`SELECT store, data FROM merch_rows`) as { store: StoreName; data: Row }[];
    const out: Record<string, Row[]> = Object.fromEntries(STORES.map((s) => [s, []]));
    for (const r of rows) out[r.store]?.push(r.data);
    // Step the cursor back a little so a write that committed during this
    // read is picked up next time. Merging makes re-reading a row harmless.
    const cursor = new Date(new Date(now).getTime() - 5000).toISOString();
    return NextResponse.json({ ok: true, cursor, ...out });
  } catch (err) {
    return dbDown(err);
  }
}

/** Merge-upsert by id, so a tablet can resend its outbox as often as it likes. */
export async function POST(req: NextRequest) {
  if (!authed(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, code: "invalid" }, { status: 400 });

  const incoming: [StoreName, Row[]][] = STORES.map((s) => [s, Array.isArray(body[s]) ? body[s] : []]);
  const total = incoming.reduce((n, [, rows]) => n + rows.length, 0);
  if (total > 3000) return NextResponse.json({ ok: false, code: "too_many" }, { status: 413 });
  for (const [store, rows] of incoming) {
    const bad = rows.find((r) => !valid(store, r));
    if (bad) return NextResponse.json({ ok: false, code: "invalid", store, id: bad?.id ?? null }, { status: 400 });
  }
  if (!total) return NextResponse.json({ ok: true, written: 0 });

  try {
    await ensureSchema();
    const q = sql();
    const writes = [];
    for (const [store, rows] of incoming) {
      if (!rows.length) continue;
      const ids = rows.map((r) => r.id);
      const existing = (await q`SELECT id, data FROM merch_rows WHERE store = ${store} AND id = ANY(${ids})`) as { id: string; data: Row }[];
      const have = new Map(existing.map((e) => [e.id, e.data]));
      for (const r of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const merged = merge(store, have.get(r.id) as any, r as any);
        have.set(r.id, merged as unknown as Row);
        writes.push(q`
          INSERT INTO merch_rows (store, id, data) VALUES (${store}, ${r.id}, ${JSON.stringify(merged)}::jsonb)
          ON CONFLICT (store, id) DO UPDATE SET data = EXCLUDED.data, synced_at = now()`);
      }
    }
    await q.transaction(writes);
    return NextResponse.json({ ok: true, written: writes.length });
  } catch (err) {
    return dbDown(err);
  }
}
