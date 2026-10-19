"use client";

import { useState } from "react";

export function Dialog({ title, children, onClose, wide }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"dialog" + (wide ? " dialog--wide" : "")} role="dialog" aria-label={title}>
        <div className="dialog__head">
          <h2>{title}</h2>
          <button className="dialog__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PasswordForm({ submitLabel, onSubmit }: {
  submitLabel: string; onSubmit: (pw: string) => Promise<string | null>;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!pw || busy) return;
      setBusy(true);
      const err = await onSubmit(pw);
      setBusy(false);
      setError(err);
      if (err) setPw("");
    }}>
      <input type="password" autoFocus autoComplete="current-password" placeholder="Password"
        value={pw} onChange={(e) => setPw(e.target.value)} className="field" />
      {error && <p className="error">{error}</p>}
      <button className="btn btn--primary" disabled={busy || !pw}>{busy ? "Checking…" : submitLabel}</button>
    </form>
  );
}

export const cleanName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 40);

export function SellerForm({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const clean = cleanName(name);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (clean) onDone(clean); }}>
      <input autoFocus placeholder="Your name" value={name} maxLength={40} className="field"
        onChange={(e) => setName(e.target.value)} />
      <p className="muted small">Goes on every sale you ring up, so the stats can show who sold what.</p>
      <button className="btn btn--primary" disabled={!clean}>Continue</button>
    </form>
  );
}

/** A euro amount typed on big keys, like a till: digits fill from the cents
 *  end, so "2", "5", "0", "0" reads €25.00. No decimal point to miss. */
export function MoneyPad({ cents, onChange, max = 99999_99 }: {
  cents: number; onChange: (c: number) => void; max?: number;
}) {
  const press = (d: string) => {
    const next = Number(String(cents) + d);
    if (next <= max) onChange(next);
  };
  return (
    <div className="moneypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"].map((k) => (
        <button key={k} type="button" className="mkey" onClick={() => press(k)}>{k}</button>
      ))}
      <button type="button" className="mkey mkey--util" onClick={() => onChange(Math.floor(cents / 10))} aria-label="Delete">⌫</button>
    </div>
  );
}

export type SyncState = "idle" | "syncing" | "offline" | "auth" | "error";

export function SyncBadge({ state, pending, onClick }: { state: SyncState; pending: number; onClick: () => void }) {
  const label =
    state === "auth" ? "Sign in to sync"
    : state === "syncing" ? "Syncing…"
    : pending === 0 && state === "offline" ? "Offline"
    : pending === 0 ? "Synced"
    : state === "offline" ? `Offline · ${pending} waiting`
    : state === "error" ? `Sync failed · ${pending} waiting`
    : `${pending} waiting`;
  const tone = state === "auth" || state === "error" ? "bad" : pending === 0 && state !== "offline" ? "ok" : "warn";
  return <button className={"badge badge--" + tone} onClick={onClick}>{label}</button>;
}

export function Money({ denom, n }: { denom: number; n?: number }) {
  const note = denom >= 500;
  return (
    <span className={"money " + (note ? "money--note money--n" + denom : "money--coin")}>
      {denom >= 100 ? `€${denom / 100}` : `${denom}c`}{n && n > 1 ? <small> ×{n}</small> : null}
    </span>
  );
}
