"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBoard } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { recordDoc } from "@/lib/files";

export type EntryInput = {
  kind: "income" | "expense";
  occurred_on: string;
  cents: number;
  category: string;
  description: string;
  method: string;
  paid_by: string;
  reimbursed_on: string;
  receipt?: { pathname: string; name: string } | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function check(e: EntryInput): string | null {
  if (e.kind !== "income" && e.kind !== "expense") return "Pick money in or money out.";
  if (!DAY.test(e.occurred_on)) return "Pick a date.";
  if (!Number.isSafeInteger(e.cents) || e.cents <= 0 || e.cents > 10_000_000) return "Type an amount above €0.";
  if (!e.category.trim()) return "Pick a category.";
  if (!e.description.trim()) return "Say what it was for.";
  if (e.reimbursed_on && !DAY.test(e.reimbursed_on)) return "Bad repaid date.";
  return null;
}

const done = () => { revalidatePath("/finance"); revalidatePath("/"); };

export async function saveEntry(id: string | null, e: EntryInput): Promise<string | null> {
  const me = await requireBoard();
  const err = check(e);
  if (err) return err;
  await ensureSchema();
  const docId = e.receipt ? (await recordDoc(e.receipt.pathname, e.receipt.name, "Receipts", [e.occurred_on.slice(0, 7)], me.email)).id : null;
  const v = {
    category: e.category.trim().slice(0, 60), description: e.description.trim().slice(0, 300),
    method: e.method.trim().slice(0, 30) || "cash", paid_by: e.kind === "expense" ? e.paid_by.trim().slice(0, 80) || null : null,
    reimbursed_on: e.kind === "expense" && e.paid_by.trim() && e.reimbursed_on ? e.reimbursed_on : null,
  };
  const q = sql();
  if (id) {
    await q`UPDATE hub_ledger SET kind = ${e.kind}, occurred_on = ${e.occurred_on}::date, cents = ${e.cents}, category = ${v.category},
      description = ${v.description}, method = ${v.method}, paid_by = ${v.paid_by}, reimbursed_on = ${v.reimbursed_on}::date,
      doc_id = COALESCE(${docId}, doc_id) WHERE id = ${id} AND voided_at IS NULL`;
  } else {
    await q`INSERT INTO hub_ledger (id, kind, occurred_on, cents, category, description, method, paid_by, reimbursed_on, doc_id, created_by)
      VALUES (${randomUUID()}, ${e.kind}, ${e.occurred_on}::date, ${e.cents}, ${v.category}, ${v.description}, ${v.method},
              ${v.paid_by}, ${v.reimbursed_on}::date, ${docId}, ${me.email})`;
  }
  done();
  return null;
}

/** Entries are never deleted, so the books can always be explained. */
export async function voidEntry(id: string, reason: string) {
  await requireBoard();
  await ensureSchema();
  await sql()`UPDATE hub_ledger SET voided_at = now(), void_reason = ${reason.trim().slice(0, 200) || "voided"} WHERE id = ${id} AND voided_at IS NULL`;
  done();
}

export async function markRepaid(ids: string[], day: string) {
  await requireBoard();
  if (!DAY.test(day)) return;
  await ensureSchema();
  await sql()`UPDATE hub_ledger SET reimbursed_on = ${day}::date WHERE id = ANY(${ids}) AND reimbursed_on IS NULL AND paid_by IS NOT NULL`;
  done();
}

/** Rows from the Treasurer's Google Sheet, already parsed and checked in the
 *  browser. Each row's import_ref is a hash of its content, so pasting the
 *  same sheet twice adds nothing the second time. */
export async function importEntries(rows: EntryInput[]): Promise<{ added: number; skipped: number; error?: string }> {
  const me = await requireBoard();
  if (rows.length > 2000) return { added: 0, skipped: 0, error: "Too many rows at once (2000 max)." };
  for (const [i, r] of rows.entries()) {
    const err = check(r);
    if (err) return { added: 0, skipped: 0, error: `Row ${i + 1}: ${err}` };
  }
  await ensureSchema();
  const q = sql();
  const seen = new Map<string, number>();
  const refs = rows.map((r) => {
    const base = createHash("sha256").update([r.kind, r.occurred_on, r.cents, r.category, r.description, r.paid_by].join("|")).digest("hex").slice(0, 32);
    // Two identical rows in one sheet are two real purchases, not a duplicate.
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return `sheet:${base}:${n}`;
  });
  const existing = new Set(((await q`SELECT import_ref FROM hub_ledger WHERE import_ref = ANY(${refs})`) as { import_ref: string }[]).map((r) => r.import_ref));
  const fresh = rows.map((r, i) => ({ r, ref: refs[i] })).filter(({ ref }) => !existing.has(ref));
  if (fresh.length) {
    await q.transaction(fresh.map(({ r, ref }) => q`
      INSERT INTO hub_ledger (id, kind, occurred_on, cents, category, description, method, paid_by, reimbursed_on, import_ref, created_by)
      VALUES (${randomUUID()}, ${r.kind}, ${r.occurred_on}::date, ${r.cents}, ${r.category.trim().slice(0, 60)}, ${r.description.trim().slice(0, 300)},
              ${r.method || "cash"}, ${r.paid_by.trim() || null}, ${r.reimbursed_on || null}::date, ${ref}, ${me.email})
      ON CONFLICT (import_ref) DO NOTHING`));
  }
  done();
  return { added: fresh.length, skipped: rows.length - fresh.length };
}
