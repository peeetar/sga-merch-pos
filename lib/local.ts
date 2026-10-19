// The tablet's own copy. Every write lands here first, so a dead connection
// never loses a sale. Rows marked dirty are the outbox.
"use client";

import { canon, merge } from "./merge";
import { STORES, type Bundle, type StoreName } from "./types";

type Row = { id: string; [k: string]: unknown };
type Stored = Row & { dirty: 0 | 1 };

export type Meta = {
  pwHash?: string;
  unlockedUntil?: number;
  seller?: string;
  deviceId?: string;
  cursor?: string;
};

const DB = "sga-merch-pos";
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) db.createObjectStore(s, { keyPath: "id" });
      db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

/** Run fn inside one transaction and resolve on commit, not on the request:
 *  a write only counts once it is durable. */
async function run<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => () => T): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result());
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const strip = ({ dirty: _d, ...rest }: Stored) => rest as Row;

export async function loadAll(): Promise<Bundle> {
  return run([...STORES], "readonly", (t) => {
    const reqs = STORES.map((s) => t.objectStore(s).getAll() as IDBRequest<Stored[]>);
    return () => Object.fromEntries(STORES.map((s, i) => [s, reqs[i].result.map(strip)])) as unknown as Bundle;
  });
}

export function put(store: StoreName, row: Row) {
  return run([store], "readwrite", (t) => {
    t.objectStore(store).put({ ...row, dirty: 1 });
    return () => undefined;
  });
}

export async function outbox(): Promise<Bundle & { count: number }> {
  const out = await run([...STORES], "readonly", (t) => {
    const reqs = STORES.map((s) => t.objectStore(s).getAll() as IDBRequest<Stored[]>);
    return () => Object.fromEntries(STORES.map((s, i) => [s, reqs[i].result.filter((r) => r.dirty).map(strip)])) as unknown as Bundle;
  });
  const count = STORES.reduce((n, s) => n + out[s].length, 0);
  return { ...out, count };
}

/** Clear the dirty flag, but only on rows unchanged since they were sent --
 *  a void made while the request was in flight must still go out. */
export function markSynced(sent: Bundle) {
  return run([...STORES], "readwrite", (t) => {
    for (const s of STORES) {
      const store = t.objectStore(s);
      for (const row of sent[s] as unknown as Row[]) {
        const req = store.get(row.id);
        req.onsuccess = () => {
          const cur = req.result as Stored | undefined;
          if (cur && canon(strip(cur)) === canon(row)) store.put({ ...cur, dirty: 0 });
        };
      }
    }
    return () => undefined;
  });
}

/** Fold rows pulled from the cloud into the local copy. A row stays dirty if
 *  this tablet knows something the cloud doesn't yet. */
export function applyRemote(remote: Partial<Bundle>) {
  return run([...STORES], "readwrite", (t) => {
    for (const s of STORES) {
      const store = t.objectStore(s);
      for (const row of (remote[s] || []) as unknown as Row[]) {
        const req = store.get(row.id);
        req.onsuccess = () => {
          const cur = req.result as Stored | undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const merged = merge(s, cur ? (strip(cur) as any) : undefined, row as any) as unknown as Row;
          // Dirty only if the merge kept something the cloud doesn't have yet.
          const dirty = canon(merged) !== canon(row) ? 1 : 0;
          store.put({ ...merged, dirty });
        };
      }
    }
    return () => undefined;
  });
}

export async function getMeta(): Promise<Meta> {
  return run(["meta"], "readonly", (t) => {
    const req = t.objectStore("meta").get("meta");
    return () => (req.result as Meta) || {};
  });
}

export async function setMeta(patch: Partial<Meta>) {
  const cur = await getMeta();
  await run(["meta"], "readwrite", (t) => {
    t.objectStore("meta").put({ ...cur, ...patch }, "meta");
    return () => undefined;
  });
}

/** Lets a tablet that has signed in once unlock again with no signal. Only
 *  this slow hash is kept, never the password. */
export async function hashPassword(pw: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode("sga-merch-pos-offline-v1"), iterations: 150_000 }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
