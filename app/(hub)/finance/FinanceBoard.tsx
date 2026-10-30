"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import Uploader, { type Uploaded } from "@/components/hub/Uploader";
import { Dialog } from "@/components/ui";
import { fileUrl } from "@/lib/files-client";
import { parseEuro, parseSheet, type KindRule } from "@/lib/sheet-import";
import { euros } from "@/lib/types";
import type { Entry, Period, summarise } from "@/lib/finance";
import { importEntries, markRepaid, saveEntry, voidEntry, type EntryInput } from "./actions";

type Summary = ReturnType<typeof summarise>;
type Filter = "all" | "income" | "expense" | "owed" | "noreceipt";

const PERIODS: { id: Period; label: string }[] = [
  { id: "year", label: "Whole year" }, { id: "fall", label: "Fall (Aug–Dec)" }, { id: "spring", label: "Spring (Jan–Jul)" },
];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const monthName = (m: string) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function FinanceBoard({ term, period, terms, entries, summary, payouts, people, blobReady, incomeCats, expenseCats }: {
  term: string; period: Period; terms: string[]; entries: Entry[]; summary: Summary;
  payouts: { id: string; day: string; cents: number; reason: string; by: string }[];
  people: string[]; blobReady: boolean; incomeCats: string[]; expenseCats: string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ entry: Entry | null; kind: "income" | "expense" } | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, start] = useTransition();
  const go = (t: string, p: Period) => router.push(`/finance?term=${t}&period=${p}`);
  const shown = useMemo(() => entries.filter((e) =>
    filter === "all" ? true
    : filter === "owed" ? e.kind === "expense" && !!e.paid_by && !e.reimbursed_on && !e.voided_at
    : filter === "noreceipt" ? e.kind === "expense" && e.source === "manual" && !e.doc_id && !e.voided_at
    : e.kind === filter), [entries, filter]);
  const owedTotal = summary.owed.reduce((n, o) => n + o.cents, 0);
  const maxCat = Math.max(1, ...summary.byIncome.map((c) => c.cents), ...summary.byExpense.map((c) => c.cents));

  return (
    <main className="hubpage">
      <header className="hubpage__head">
        <h1>Finance</h1>
        <div className="row">
          <select className="field field--sm field--short" value={term} onChange={(e) => go(e.target.value, period)} aria-label="Term">
            {terms.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="btn btn--sm" onClick={() => setImporting(true)}>Import from sheet</button>
          <a className="btn btn--sm" href={`/api/finance/export?term=${term}&period=${period}`}>Export CSV</a>
          <button className="btn btn--sm" onClick={() => setEditing({ entry: null, kind: "income" })}>+ Money in</button>
          <button className="btn btn--sm btn--primary" onClick={() => setEditing({ entry: null, kind: "expense" })}>+ Spending</button>
        </div>
      </header>
      <div className="seg seg--inline">
        {PERIODS.map((p) => <button key={p.id} className={period === p.id ? "is-on" : ""} onClick={() => go(term, p.id)}>{p.label}</button>)}
      </div>

      <div className="stats">
        <div className="stat"><span className="stat__label">Money in</span><strong className="stat__value pos">{euros(summary.income)}</strong></div>
        <div className="stat"><span className="stat__label">Money out</span><strong className="stat__value neg">{euros(summary.expense)}</strong></div>
        <div className="stat"><span className="stat__label">Net</span><strong className={"stat__value " + (summary.net < 0 ? "neg" : "")}>{euros(summary.net)}</strong></div>
        <button className="stat stat--link" onClick={() => setFilter("owed")}><span className="stat__label">Owed to people</span><strong className="stat__value">{euros(owedTotal)}</strong>
          <span className="stat__sub">{summary.owed.length ? summary.owed.map((o) => o.who).join(", ") : "nobody"}</span></button>
      </div>

      <div className="cols">
        <section className="panel">
          <header className="panel__head"><h2>Where it came from</h2></header>
          <CatBars rows={summary.byIncome} max={maxCat} tone="in" empty="No income yet." />
          <h2 className="panel__sub">Where it went</h2>
          <CatBars rows={summary.byExpense} max={maxCat} tone="out" empty="No spending yet." />
        </section>

        <section className="panel">
          <header className="panel__head"><h2>Owed to people</h2></header>
          {summary.owed.length === 0 ? <p className="muted">Nobody is waiting to be paid back.</p> : (
            <ul className="list">
              {summary.owed.map((o) => (
                <li key={o.who}>
                  <span><strong>{o.who}</strong> <span className="muted small">· {o.ids.length} receipt{o.ids.length > 1 ? "s" : ""}</span></span>
                  <span className="row row--tight"><strong>{euros(o.cents)}</strong>
                    <button className="btn btn--sm" disabled={busy} onClick={() => {
                      if (confirm(`Paid ${o.who} back ${euros(o.cents)} today?`)) start(() => markRepaid(o.ids, today()));
                    }}>Paid back</button></span>
                </li>
              ))}
            </ul>
          )}
          {payouts.length > 0 && (
            <>
              <h2 className="panel__sub">Paid out of till cash boxes</h2>
              <p className="muted small">Recorded on the till, so not in the totals above. If one of these was a purchase, add it as spending (with its receipt) and say “paid from till” in the description.</p>
              <ul className="list">{payouts.map((p) => <li key={p.id}><span>{day(p.day)} · {p.reason} <span className="muted small">({p.by})</span></span><strong>{euros(p.cents)}</strong></li>)}</ul>
            </>
          )}
        </section>
      </div>

      {summary.months.length > 0 && (
        <section className="panel">
          <header className="panel__head"><h2>By month</h2></header>
          <table className="tbl">
            <thead><tr><th>Month</th><th className="num">In</th><th className="num">Out</th><th className="num">Net</th></tr></thead>
            <tbody>{summary.months.map((m) => (
              <tr key={m.month}><td>{monthName(m.month)}</td><td className="num">{euros(m.income)}</td><td className="num">{euros(m.expense)}</td>
                <td className={"num " + (m.income - m.expense < 0 ? "neg" : "")}>{euros(m.income - m.expense)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <header className="panel__head">
          <h2>Entries</h2>
          <div className="cats cats--tight">
            {([["all", "All"], ["income", "In"], ["expense", "Out"], ["owed", "Owed"], ["noreceipt", "No receipt"]] as [Filter, string][]).map(([f, l]) => (
              <button key={f} className={"chip" + (filter === f ? " is-on" : "")} onClick={() => setFilter(f)}>{l}</button>
            ))}
          </div>
        </header>
        <p className="muted small">Till sales and kiosk top-ups are added automatically, one line per day. Everything else is typed in or imported.</p>
        {shown.length === 0 ? <p className="muted">Nothing here.</p> : (
          <ul className="ledger">
            {shown.map((e) => (
              <li key={e.id} className={e.voided_at ? "is-void" : ""}>
                <span className="ledger__day">{day(e.occurred_on)}</span>
                <span className="ledger__what">
                  <strong>{e.description}</strong>
                  <span className="muted small">
                    {e.category}
                    {e.source !== "manual" && " · automatic"}
                    {e.paid_by && <> · paid by {e.paid_by} {e.reimbursed_on ? `· repaid ${day(e.reimbursed_on)}` : <span className="pill pill--warn">owed</span>}</>}
                    {e.voided_at && <> · voided: {e.void_reason}</>}
                  </span>
                </span>
                {e.doc_id && <a className="linkbtn" href={fileUrl(e.doc_id)} target="_blank" rel="noreferrer">Receipt</a>}
                <strong className={"ledger__amt " + (e.kind === "income" ? "pos" : "neg")}>{e.kind === "income" ? "+" : "−"}{euros(e.cents)}</strong>
                {e.source === "manual" && !e.voided_at ? <button className="linkbtn" onClick={() => setEditing({ entry: e, kind: e.kind })}>Edit</button> : <span />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && <EntryDialog {...editing} people={people} blobReady={blobReady} cats={editing.kind === "income" ? incomeCats : expenseCats}
        otherCats={editing.kind === "income" ? expenseCats : incomeCats} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </main>
  );
}

function CatBars({ rows, max, tone, empty }: { rows: { label: string; cents: number }[]; max: number; tone: "in" | "out"; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="catbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="catbars__label">{r.label}</span>
          <span className="catbars__track"><i className={"catbars__bar catbars__bar--" + tone} style={{ width: `${(r.cents / max) * 100}%` }} /></span>
          <strong>{euros(r.cents, true)}</strong>
        </li>
      ))}
    </ul>
  );
}

function EntryDialog({ entry, kind: initialKind, people, blobReady, cats, otherCats, onClose }: {
  entry: Entry | null; kind: "income" | "expense"; people: string[]; blobReady: boolean;
  cats: string[]; otherCats: string[]; onClose: () => void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [f, setF] = useState({
    occurred_on: entry?.occurred_on || today(), amount: entry ? (entry.cents / 100).toFixed(2) : "",
    category: entry?.category || "", description: entry?.description || "", method: entry?.method || "cash",
    paid_by: entry?.paid_by || "", reimbursed_on: entry?.reimbursed_on || "",
  });
  const [receipt, setReceipt] = useState<Uploaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const list = kind === initialKind ? cats : otherCats;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog title={entry ? "Edit entry" : kind === "expense" ? "Add spending" : "Add money in"} onClose={onClose}>
      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        const cents = parseEuro(f.amount);
        const input: EntryInput = { kind, occurred_on: f.occurred_on, cents: cents ?? 0, category: f.category, description: f.description,
          method: f.method, paid_by: f.paid_by, reimbursed_on: f.reimbursed_on, receipt: receipt && { pathname: receipt.pathname, name: receipt.name } };
        start(async () => { const r = await saveEntry(entry?.id ?? null, input); if (r) setErr(r); else onClose(); });
      }}>
        <div className="seg">
          <button type="button" className={kind === "expense" ? "is-on" : ""} onClick={() => setKind("expense")}>Money out</button>
          <button type="button" className={kind === "income" ? "is-on" : ""} onClick={() => setKind("income")}>Money in</button>
        </div>
        <div className="row row--tight">
          <label className="lbl grow">Date<input type="date" className="field field--sm" value={f.occurred_on} onChange={set("occurred_on")} required /></label>
          <label className="lbl grow">Amount (€)<input className="field field--sm" inputMode="decimal" placeholder="12.50" value={f.amount} onChange={set("amount")} required /></label>
        </div>
        <label className="lbl">What for<input className="field field--sm" value={f.description} maxLength={300} onChange={set("description")} placeholder={kind === "expense" ? "e.g. 3 packs of cups, Halloween" : "e.g. bake sale"} required /></label>
        <label className="lbl">Category
          <input className="field field--sm" list="fin-cats" value={f.category} onChange={set("category")} required />
          <datalist id="fin-cats">{list.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="lbl">Paid with
          <select className="field field--sm" value={f.method} onChange={set("method")}><option value="cash">Cash</option><option value="bank">Card / bank</option></select>
        </label>
        {kind === "expense" && (
          <>
            <label className="lbl">Paid by (if someone used their own money)
              <input className="field field--sm" list="fin-people" value={f.paid_by} onChange={set("paid_by")} placeholder="Leave empty if paid from SGA cash" />
              <datalist id="fin-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
            </label>
            {f.paid_by.trim() && <label className="lbl">Paid back on (leave empty if still owed)<input type="date" className="field field--sm" value={f.reimbursed_on} onChange={set("reimbursed_on")} /></label>}
            {blobReady ? (
              <div className="row">
                <Uploader area="receipts" accept="image/*,application/pdf" label={receipt || entry?.doc_id ? "Replace receipt photo" : "Add receipt photo"} onUploaded={(files) => setReceipt(files[0])} />
                {receipt && <span className="muted small">✓ {receipt.name}</span>}
                {!receipt && entry?.doc_id && <a className="linkbtn" href={fileUrl(entry.doc_id)} target="_blank" rel="noreferrer">Current receipt</a>}
              </div>
            ) : <p className="muted small">Receipt photos need file storage (Documents explains how).</p>}
          </>
        )}
        {err && <p className="error">{err}</p>}
        <div className="row">
          {entry && <button type="button" className="btn btn--sm btn--out" disabled={busy} onClick={() => {
            const reason = prompt("Why void this entry? It stays on record, crossed out.");
            if (reason !== null) start(async () => { await voidEntry(entry.id, reason); onClose(); });
          }}>Void</button>}
          <span className="grow" />
          <button type="button" className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [rule, setRule] = useState<KindRule>("expense");
  const [category, setCategory] = useState("Other");
  const [result, setResult] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const parsed = useMemo(() => (text.trim() ? parseSheet(text, rule, category) : null), [text, rule, category]);
  return (
    <Dialog title="Import from the Treasurer's sheet" onClose={onClose} wide>
      <p className="muted small">In Google Sheets, select the rows <strong>including the header row</strong>, copy, and paste here. Columns are matched by their headers: a date, an amount (or separate income/expense columns), and optionally description, category, paid by, and reimbursed. Pasting the same rows again adds nothing new.</p>
      <textarea className="field field--sm mono" rows={8} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }}
        placeholder={"Date\tDescription\tAmount\tCategory\tPaid by\n19/10/2026\tCups and napkins\t12,50\tEvents & refreshments\tAlex"} />
      <div className="row">
        <label className="lbl">The amounts are
          <select className="field field--sm" value={rule} onChange={(e) => setRule(e.target.value as KindRule)}>
            <option value="expense">all spending</option><option value="income">all income</option><option value="sign">signed (negative = spending)</option>
          </select>
        </label>
        <label className="lbl">Category when the sheet has none<input className="field field--sm" value={category} onChange={(e) => setCategory(e.target.value)} /></label>
      </div>
      {parsed && (
        <>
          <p className="muted small">Columns found: {parsed.columns}</p>
          {parsed.errors.length > 0 && <p className="small"><strong>{parsed.rows.length ? "These rows will be skipped:" : "Can't import yet:"}</strong></p>}
          {parsed.errors.length > 0 && <ul className="error small">{parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}{parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more</li>}</ul>}
          {parsed.rows.length > 0 && (
            <div className="panel panel--flat">
              <table className="tbl">
                <thead><tr><th>Date</th><th>What</th><th>Category</th><th>Paid by</th><th className="num">Amount</th></tr></thead>
                <tbody>{parsed.rows.slice(0, 12).map((r, i) => (
                  <tr key={i}><td>{r.occurred_on}</td><td>{r.description}</td><td>{r.category}</td><td>{r.paid_by}{r.reimbursed_on ? " ✓" : ""}</td>
                    <td className={"num " + (r.kind === "income" ? "pos" : "neg")}>{r.kind === "income" ? "+" : "−"}{euros(r.cents)}</td></tr>
                ))}</tbody>
              </table>
              {parsed.rows.length > 12 && <p className="muted small">…and {parsed.rows.length - 12} more rows.</p>}
            </div>
          )}
        </>
      )}
      {result && <p className="notice">{result}</p>}
      <div className="row">
        <span className="grow" />
        <button className="btn btn--sm" onClick={onClose}>Close</button>
        <button className="btn btn--sm btn--primary" disabled={busy || !parsed?.rows.length} onClick={() => start(async () => {
          const r = await importEntries(parsed!.rows);
          setResult(r.error || `Added ${r.added} row${r.added === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} already imported` : ""}.`);
          if (!r.error) setText("");
        })}>{busy ? "Importing…" : `Import ${parsed?.rows.length || 0} rows`}</button>
      </div>
    </Dialog>
  );
}
