// Server only. The SGA's books for a term, in one list. Two kinds of rows:
//
// - automatic: till sales and kiosk cash top-ups, one row per Athens day,
//   read from where they happen (the till's rows, the kiosk's reports), so
//   they're never typed twice;
// - entered: everything else, kept in hub_ledger (spending with its receipt,
//   reimbursements, and any income that isn't the till or the kiosk).
//
// Cash is the only money there is, so there's no bank side to reconcile.
import { live } from "./calc";
import { ensureSchema, sql } from "./db";
import { loadMerch } from "./merch";
import { athensDay, termStart } from "./time";

export const INCOME_CATEGORIES = ["Merch (till)", "Coffee kiosk top-ups", "Other income"];
export const EXPENSE_CATEGORIES = ["Merch stock", "Coffee capsules", "Kiosk hardware", "Events & refreshments", "Printing", "Supplies", "Other"];

export type Entry = {
  id: string;
  source: "till" | "kiosk" | "manual";
  kind: "income" | "expense";
  occurred_on: string; // YYYY-MM-DD
  cents: number;
  category: string;
  description: string;
  method: string;
  paid_by: string | null;
  reimbursed_on: string | null;
  doc_id: string | null;
  created_by: string;
  voided_at: string | null;
  void_reason: string | null;
};

export type Period = "year" | "fall" | "spring";

/** A term runs 1 Aug–31 Jul. Fall is Aug–Dec, spring Jan–Jul: what the
 *  Treasurer's mid-year and end-of-year reports cover. */
export function periodRange(term: string, period: Period): [string, string] {
  const y = Number(term.slice(0, 4));
  if (period === "fall") return [`${y}-08-01`, `${y}-12-31`];
  if (period === "spring") return [`${y + 1}-01-01`, `${y + 1}-07-31`];
  return [termStart(term), `${y + 1}-07-31`];
}

export async function loadEntries(from: string, to: string): Promise<Entry[]> {
  await ensureSchema();
  const q = sql();
  const [manual, topups, merch] = await Promise.all([
    q`SELECT id, kind, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, cents, category, description, method, paid_by,
        to_char(reimbursed_on, 'YYYY-MM-DD') AS reimbursed_on, doc_id, created_by, voided_at::text AS voided_at, void_reason
      FROM hub_ledger WHERE occurred_on BETWEEN ${from}::date AND ${to}::date`.then((r) => r as Omit<Entry, "source">[]),
    q`SELECT at, cents FROM hub_kiosk_topups
      WHERE at >= (${from}::date - 1) AND at < (${to}::date + 2)`.then((r) => r as { at: string; cents: number }[]),
    loadMerch(),
  ]);
  const out: Entry[] = manual.map((m) => ({ ...m, source: "manual" as const }));

  const daily = (rows: { day: string; cents: number }[], source: "till" | "kiosk", category: string, noun: string) => {
    const by = new Map<string, { cents: number; n: number }>();
    for (const r of rows) {
      if (r.day < from || r.day > to) continue;
      const d = by.get(r.day) || { cents: 0, n: 0 };
      d.cents += r.cents; d.n += 1;
      by.set(r.day, d);
    }
    for (const [day, d] of by) {
      if (!d.cents) continue;
      out.push({ id: `${source}-${day}`, source, kind: "income", occurred_on: day, cents: d.cents, category,
        description: `${d.n} ${noun}${d.n === 1 ? "" : "s"}`, method: "cash", paid_by: null, reimbursed_on: null,
        doc_id: null, created_by: "automatic", voided_at: null, void_reason: null });
    }
  };
  daily(live(merch.sales).map((s) => ({ day: athensDay(s.sold_at), cents: s.total_cents })), "till", "Merch (till)", "till sale");
  daily(topups.map((t) => ({ day: athensDay(t.at), cents: t.cents })), "kiosk", "Coffee kiosk top-ups", "kiosk top-up");

  // Money a seller took out of a till cash box (a supplier paid on the spot)
  // is spending too, but it's recorded on the till; it's listed separately
  // in Finance so it isn't typed in twice.
  return out.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || a.source.localeCompare(b.source));
}

export async function tillPayouts(from: string, to: string) {
  const merch = await loadMerch();
  return merch.cashmoves
    .filter((m) => !m.voided_at && m.cents < 0 && athensDay(m.at) >= from && athensDay(m.at) <= to)
    .map((m) => ({ id: m.id, day: athensDay(m.at), cents: -m.cents, reason: m.reason, by: m.by }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export function summarise(entries: Entry[]) {
  const ok = entries.filter((e) => !e.voided_at);
  const income = ok.filter((e) => e.kind === "income");
  const spent = ok.filter((e) => e.kind === "expense");
  const sum = (xs: Entry[]) => xs.reduce((n, e) => n + e.cents, 0);
  const group = (xs: Entry[]) => {
    const m = new Map<string, number>();
    for (const e of xs) m.set(e.category, (m.get(e.category) || 0) + e.cents);
    return [...m.entries()].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);
  };
  const owed = new Map<string, { cents: number; ids: string[] }>();
  for (const e of spent) if (e.paid_by && !e.reimbursed_on) {
    const o = owed.get(e.paid_by) || { cents: 0, ids: [] };
    o.cents += e.cents; o.ids.push(e.id);
    owed.set(e.paid_by, o);
  }
  const months = new Map<string, { income: number; expense: number }>();
  for (const e of ok) {
    const k = e.occurred_on.slice(0, 7);
    const m = months.get(k) || { income: 0, expense: 0 };
    m[e.kind] += e.cents;
    months.set(k, m);
  }
  return {
    income: sum(income), expense: sum(spent), net: sum(income) - sum(spent),
    byIncome: group(income), byExpense: group(spent),
    owed: [...owed.entries()].map(([who, o]) => ({ who, ...o })).sort((a, b) => b.cents - a.cents),
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, m]) => ({ month, ...m })),
  };
}

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ledgerCsv(entries: Entry[]): string {
  const head = ["date", "type", "category", "description", "amount_eur", "signed_eur", "source", "method", "paid_by", "reimbursed_on", "voided", "void_reason"];
  const rows = [head.join(",")];
  for (const e of [...entries].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
    rows.push([e.occurred_on, e.kind, e.category, e.description, (e.cents / 100).toFixed(2),
      ((e.kind === "income" ? 1 : -1) * e.cents / 100).toFixed(2), e.source, e.method, e.paid_by,
      e.reimbursed_on, e.voided_at ? "yes" : "", e.void_reason].map(esc).join(","));
  }
  return rows.join("\n") + "\n";
}
