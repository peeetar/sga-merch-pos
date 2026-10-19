// Server only. The cloud copy: every tablet pushes its outbox here and pulls
// everyone else's rows back, which is how stock and stats stay shared. The
// tablet's IndexedDB is still where a sale is written first.
//
// One table holds every kind of row as JSON. The data is small (a merch sale
// is a few hundred bytes) and all the maths happens on the tablet, so a
// schema per kind would only add migrations.
import { neon, neonConfig } from "@neondatabase/serverless";

// Local development only: point the driver at a Neon-compatible HTTP endpoint
// (e.g. a local proxy) instead of the real Neon. Unset in production.
if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

let ready: Promise<unknown> | null = null;

export function ensureSchema() {
  ready ??= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS merch_rows (
      store      TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       JSONB NOT NULL,
      synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (store, id)
    )`;
  })().catch((err) => {
    ready = null; // try again on the next request
    throw err;
  });
  return ready;
}

/** Forget that the schema was checked, so the next request checks again
 *  (e.g. after the database was reset under a warm function). */
export function resetSchema() {
  ready = null;
}
