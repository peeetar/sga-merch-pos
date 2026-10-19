"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CashBoxDialog, ClosedResult, CloseShift, OpenShift } from "@/components/CashBox";
import Sell, { Checkout, SalesDialog } from "@/components/Sell";
import Stats from "@/components/Stats";
import Stock from "@/components/Stock";
import { Dialog, PasswordForm, SellerForm, SyncBadge, type SyncState } from "@/components/ui";
import { countTotal, stockLevels, trackedVariants } from "@/lib/calc";
import * as local from "@/lib/local";
import { SEED, euros, type Bundle, type CashMove, type Line, type Product, type Sale, type Shift, type StockMove, type StoreName } from "@/lib/types";

type Tab = "sell" | "stock" | "stats";
type Modal = "checkout" | "box" | "close" | "sales" | "seller" | "reauth" | null;

const SESSION_MS = 12 * 3600 * 1000;
const EMPTY: Bundle = { products: [], moves: [], sales: [], shifts: [], cashmoves: [] };
const now = () => new Date().toISOString();

export default function POS() {
  const [booted, setBooted] = useState(false);
  const [meta, setMetaState] = useState<local.Meta>({});
  const [data, setData] = useState<Bundle>(EMPTY);
  const [sync, setSync] = useState<SyncState>("idle");
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState<Tab>("sell");
  const [cart, setCart] = useState<Line[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastClosedId, setLastClosedId] = useState<string | null>(null);

  const unlocked = !!meta.pwHash && (meta.unlockedUntil || 0) > Date.now();
  const seller = meta.seller || "";
  const deviceId = meta.deviceId || "";
  const shift = data.shifts.find((s) => s.device_id === deviceId && !s.closed_at) || null;
  const lastShift = useMemo(() => data.shifts.filter((s) => s.device_id === deviceId && s.closed_at)
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at))[0] || null, [data.shifts, deviceId]);
  const levels = useMemo(() => ({ on: stockLevels(data.moves, data.sales), tracked: trackedVariants(data.moves) }), [data.moves, data.sales]);

  const reload = useCallback(async () => setData(await local.loadAll()), []);

  const saveMeta = useCallback(async (patch: Partial<local.Meta>) => {
    await local.setMeta(patch);
    setMetaState((m) => ({ ...m, ...patch }));
  }, []);

  // --- sync: push the outbox, then pull what other tablets wrote ------------

  const syncing = useRef(false);
  const trySync = useCallback(async () => {
    if (syncing.current) return;
    const box = await local.outbox();
    setPending(box.count);
    if (!navigator.onLine) return setSync("offline");
    syncing.current = true;
    setSync("syncing");
    try {
      if (box.count) {
        const { count: _c, ...rows } = box;
        const res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) });
        if (res.status === 401) return setSync("auth");
        if (!res.ok) return setSync("error");
        await local.markSynced(rows);
      }
      const m = await local.getMeta();
      const res = await fetch("/api/sync" + (m.cursor ? `?since=${encodeURIComponent(m.cursor)}` : ""), { cache: "no-store" });
      if (res.status === 401) return setSync("auth");
      if (!res.ok) return setSync("error");
      const pulled = await res.json();
      await local.applyRemote(pulled);
      await local.setMeta({ cursor: pulled.cursor });
      await reload();
      setPending((await local.outbox()).count);
      setSync("idle");
    } catch {
      setSync("offline");
    } finally {
      syncing.current = false;
    }
  }, [reload]);

  useEffect(() => {
    (async () => {
      let m = await local.getMeta();
      if (!m.deviceId) {
        await local.setMeta({ deviceId: crypto.randomUUID() });
        m = await local.getMeta();
      }
      setMetaState(m);
      let d = await local.loadAll();
      if (!d.products.length) {
        // First run on this tablet: see if the cloud already has a catalogue
        // before falling back to the starter one.
        if ((m.unlockedUntil || 0) > Date.now()) await trySync();
        d = await local.loadAll();
        if (!d.products.length) for (const p of SEED) await local.put("products", p);
        d = await local.loadAll();
      }
      setData(d);
      setBooted(true);
      if ((m.unlockedUntil || 0) > Date.now()) trySync();
    })();
    const tick = setInterval(trySync, 20_000);
    window.addEventListener("online", trySync);
    const onOffline = () => setSync("offline");
    window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator && location.hostname !== "localhost") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", trySync);
      window.removeEventListener("offline", onOffline);
    };
  }, [trySync]);

  // Re-lock when the 12 h session runs out, even with the page left open.
  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(() => setMetaState((m) => ({ ...m })), (meta.unlockedUntil || 0) - Date.now() + 500);
    return () => clearTimeout(t);
  }, [unlocked, meta.unlockedUntil]);

  const flash = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 3200);
  }, []);

  // --- writes: IndexedDB first, then the screen, then the cloud -------------

  async function write<S extends StoreName>(store: S, rows: Bundle[S]) {
    for (const r of rows) await local.put(store, r as never);
    setData((d) => {
      type R = Bundle[S][number];
      const byId = new Map<string, R>((d[store] as R[]).map((r) => [r.id, r]));
      for (const r of rows as R[]) byId.set(r.id, r);
      return { ...d, [store]: [...byId.values()] };
    });
    trySync();
  }

  // --- screens ---------------------------------------------------------------

  if (!booted) return <main className="center"><p className="muted">Loading…</p></main>;

  if (!unlocked) {
    return <Login knownHash={meta.pwHash} onUnlock={async (pwHash, online) => {
      await saveMeta({ pwHash, unlockedUntil: Date.now() + SESSION_MS });
      if (online) trySync();
    }} />;
  }

  if (!seller) return <SellerScreen onDone={(name) => saveMeta({ seller: name })} />;

  const lastClosed = lastClosedId ? data.shifts.find((s) => s.id === lastClosedId) || null : null;
  const shiftSales = shift ? data.sales.filter((s) => s.shift_id === shift.id).length : 0;

  return (
    <div className="app">
      <header className="bar">
        <span className="brand"><span className="brand__mark">SGA</span> Merch</span>
        <nav className="tabs">
          {(["sell", "stock", "stats"] as Tab[]).map((t) => (
            <button key={t} className={"tab" + (tab === t ? " is-on" : "")} onClick={() => setTab(t)}>
              {t === "sell" ? "Sell" : t === "stock" ? "Stock" : "Stats"}
              {t === "sell" && cart.length > 0 && tab !== "sell" && <span className="tab__dot">{cart.reduce((n, l) => n + l.qty, 0)}</span>}
            </button>
          ))}
        </nav>
        <span className="bar__spacer" />
        <SyncBadge state={sync} pending={pending} onClick={() => (sync === "auth" ? setModal("reauth") : trySync())} />
        {shift && <button className="bar__btn" onClick={() => setModal("sales")}>Sales · {shiftSales}</button>}
        {shift && <button className="bar__btn" onClick={() => setModal("box")}>Cash box</button>}
        <button className="bar__seller" onClick={() => setModal("seller")}><span className="bar__who">Selling:</span> <strong>{seller}</strong></button>
        <button className="bar__btn" onClick={() => saveMeta({ unlockedUntil: 0 })} aria-label="Lock">🔒</button>
      </header>

      {tab === "sell" && (shift ? (
        <Sell products={data.products} levels={levels} cart={cart} setCart={setCart} shift={shift}
          sales={data.sales} cashmoves={data.cashmoves} onFlash={flash}
          onCheckout={() => setModal("checkout")} onOpenBox={() => setModal("box")} />
      ) : lastClosed ? (
        <ClosedResult shift={lastClosed} sales={data.sales} cashmoves={data.cashmoves}
          onStats={() => { setLastClosedId(null); setTab("stats"); }} onNew={() => setLastClosedId(null)} />
      ) : (
        <OpenShift seller={seller} onOpen={(counts) => write("shifts", [{
          id: crypto.randomUUID(), device_id: deviceId, opened_at: now(), opened_by: seller,
          opening_cents: countTotal(counts), opening_counts: counts, closed_at: null, closed_by: null,
          counted_cents: null, counted_counts: null, expected_cents: null, note: null,
        } satisfies Shift])} />
      ))}

      {tab === "stock" && (
        <Stock products={data.products} levels={levels} sales={data.sales} seller={seller}
          onMoves={async (moves: StockMove[]) => { await write("moves", moves); flash(`Stock updated (${moves.length} change${moves.length > 1 ? "s" : ""})`); }}
          onSaveProduct={async (p: Product) => { await write("products", [p]); flash(`Saved ${p.name}`); }} />
      )}

      {tab === "stats" && <Stats data={data} shift={shift} lastShift={lastShift} levels={levels} />}

      {toast && <div className="toast" role="status">{toast}</div>}

      {modal === "checkout" && shift && (
        <Checkout cart={cart} onCancel={() => setModal(null)} onDone={async (tendered) => {
          const total = cart.reduce((n, l) => n + l.qty * l.unit_cents, 0);
          const change = tendered - total;
          await write("sales", [{
            id: crypto.randomUUID(), shift_id: shift.id, device_id: deviceId, seller, sold_at: now(),
            total_cents: total, tendered_cents: tendered, change_cents: change,
            lines: cart, voided_at: null, void_reason: null, void_by: null,
          } satisfies Sale]);
          const items = cart.reduce((n, l) => n + l.qty, 0);
          setCart([]);
          setModal(null);
          flash(`Sold ${items} item${items > 1 ? "s" : ""} · ${euros(total)}${change ? ` · ${euros(change)} change` : ""}`);
        }} />
      )}
      {modal === "box" && shift && (
        <CashBoxDialog shift={shift} sales={data.sales} cashmoves={data.cashmoves} onClose={() => setModal(null)}
          onCloseShift={() => setModal("close")}
          onMove={async (cents, reason) => {
            await write("cashmoves", [{ id: crypto.randomUUID(), shift_id: shift.id, cents, reason, by: seller, at: now(), voided_at: null } satisfies CashMove]);
            flash(`${cents > 0 ? "Paid in" : "Paid out"} ${euros(Math.abs(cents))}`);
          }}
          onVoidMove={async (m) => { await write("cashmoves", [{ ...m, voided_at: now() }]); }} />
      )}
      {modal === "close" && shift && (
        <CloseShift shift={shift} sales={data.sales} cashmoves={data.cashmoves} seller={seller} onCancel={() => setModal("box")}
          onClose={async (closed) => {
            await write("shifts", [closed]);
            setLastClosedId(closed.id);
            setCart([]);
            setTab("sell");
            setModal(null);
          }} />
      )}
      {modal === "sales" && shift && (
        <SalesDialog shift={shift} sales={data.sales} seller={seller} onClose={() => setModal(null)}
          onVoid={async (s, reason) => {
            await write("sales", [{ ...s, voided_at: now(), void_reason: reason, void_by: seller }]);
            flash(`Voided · give back ${euros(s.total_cents)}`);
          }} />
      )}
      {modal === "seller" && (
        <Dialog title="Who is selling now?" onClose={() => setModal(null)}>
          <SellerForm initial={seller} onDone={async (name) => { await saveMeta({ seller: name }); setModal(null); }} />
        </Dialog>
      )}
      {modal === "reauth" && (
        <Dialog title="Sign in again to sync" onClose={() => setModal(null)}>
          <p className="muted">The server session ran out. Everything is safe on this tablet in the meantime.</p>
          <PasswordForm submitLabel="Sign in" onSubmit={async (pw) => {
            const res = await serverLogin(pw);
            if (res !== "ok") return loginError(res);
            await saveMeta({ pwHash: await local.hashPassword(pw), unlockedUntil: Date.now() + SESSION_MS });
            setModal(null);
            setSync("idle");
            trySync();
            return null;
          }} />
        </Dialog>
      )}
    </div>
  );
}

// --- auth ------------------------------------------------------------------

type LoginResult = "ok" | "wrong" | "rate" | "config" | "network";

async function serverLogin(password: string): Promise<LoginResult> {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return "ok";
    if (res.status === 401) return "wrong";
    if (res.status === 429) return "rate";
    return "config";
  } catch {
    return "network";
  }
}

function loginError(r: LoginResult): string {
  return {
    ok: "",
    wrong: "Wrong password.",
    rate: "Too many attempts. Wait a few minutes.",
    config: "POS_PASSWORD isn't set on the server.",
    network: "No connection. The first sign-in on this tablet needs internet.",
  }[r];
}

function Login({ knownHash, onUnlock }: { knownHash?: string; onUnlock: (pwHash: string, online: boolean) => Promise<void> }) {
  return (
    <main className="center center--brand">
      <div className="card card--narrow">
        <p className="brand brand--big"><span className="brand__mark">SGA</span> Merch</p>
        <p className="muted">Ask the SGA board for the till password.</p>
        <PasswordForm submitLabel="Unlock" onSubmit={async (pw) => {
          const pwHash = await local.hashPassword(pw);
          const res = await serverLogin(pw);
          if (res === "ok") { await onUnlock(pwHash, true); return null; }
          // No signal: this tablet has signed in before, so check against that.
          if (res === "network" && knownHash && knownHash === pwHash) { await onUnlock(pwHash, false); return null; }
          return loginError(res === "network" && knownHash ? "wrong" : res);
        }} />
      </div>
    </main>
  );
}

function SellerScreen({ onDone }: { onDone: (name: string) => void }) {
  return (
    <main className="center center--brand">
      <div className="card card--narrow">
        <h1>Who is selling?</h1>
        <SellerForm initial="" onDone={onDone} />
      </div>
    </main>
  );
}

