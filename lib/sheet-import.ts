// Turns rows copied out of the Treasurer's Google Sheet into ledger entries.
// Copying a range in Sheets gives tab-separated text; a downloaded CSV works
// too. Columns are found by their header, so the sheet's layout can change.

export type ParsedRow = {
  kind: "income" | "expense"; occurred_on: string; cents: number; category: string;
  description: string; method: string; paid_by: string; reimbursed_on: string;
};
export type KindRule = "expense" | "income" | "sign";

function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t");
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** "€12,50", "12.50", "1.234,56", "-8" → cents (signed), or null. */
export function parseEuro(raw: string): number | null {
  let s = raw.replace(/[€\s]|EUR/gi, "");
  if (!s) return null;
  const neg = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[()\-+]/g, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const c = Math.round(parseFloat(s) * 100);
  return neg ? -c : c;
}

/** Day first, as in Greece: 19/10/2025, 19.10.25, or ISO 2025-10-19. */
export function parseDay(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const find = (head: string[], re: RegExp) => head.findIndex((h) => re.test(h));

export function parseSheet(text: string, rule: KindRule, defaultCategory: string): { rows: ParsedRow[]; errors: string[]; columns: string } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["Paste the header row and at least one row under it."], columns: "" };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = splitLine(lines[0], sep).map((h) => h.trim().toLowerCase());
  const col = {
    date: find(head, /date|day|when/),
    desc: find(head, /desc|item|what|detail|purpose|for\b|note|product/),
    amount: find(head, /amount|total|cost|price|sum|€|eur|value/),
    income: find(head, /^(income|in|money in|received)$/),
    expense: find(head, /^(expense|expenses|out|money out|spent|paid)$/),
    category: find(head, /categ|type|kind/),
    paidBy: find(head, /paid by|payer|who|person|bought by|by\b/),
    repaid: find(head, /reimb|repaid|paid back|refund/),
    method: find(head, /method|cash|bank/),
  };
  const errors: string[] = [];
  if (col.date < 0) errors.push("No date column (a header with “date” in it).");
  if (col.amount < 0 && col.income < 0 && col.expense < 0) errors.push("No amount column (“amount”, “total”, “cost”…, or “income”/“expense”).");
  if (errors.length) return { rows: [], errors, columns: head.join(" · ") };

  const rows: ParsedRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const c = splitLine(line, sep).map((x) => x.trim());
    const at = (k: number) => (k >= 0 ? c[k] || "" : "");
    if (c.every((x) => !x)) return;
    const day = parseDay(at(col.date));
    if (!day) { errors.push(`Row ${i + 2}: can't read the date “${at(col.date)}”.`); return; }
    let kind: "income" | "expense", cents: number | null;
    if (col.amount >= 0) {
      cents = parseEuro(at(col.amount));
      if (cents === null) { if (at(col.amount)) errors.push(`Row ${i + 2}: can't read the amount “${at(col.amount)}”.`); return; }
      kind = rule === "sign" ? (cents < 0 ? "expense" : "income") : rule;
      cents = Math.abs(cents);
    } else {
      const inc = parseEuro(at(col.income)), exp = parseEuro(at(col.expense));
      if (inc) { kind = "income"; cents = Math.abs(inc); }
      else if (exp) { kind = "expense"; cents = Math.abs(exp); }
      else return; // an empty row in a two-column layout
    }
    if (!cents) return;
    const repaidRaw = at(col.repaid);
    const repaid = parseDay(repaidRaw) || (/^(yes|y|✓|true|done|paid)$/i.test(repaidRaw) ? day : "");
    rows.push({
      kind, occurred_on: day, cents,
      category: at(col.category) || (kind === "income" ? "Other income" : defaultCategory),
      description: at(col.desc) || "(no description)",
      method: /bank|card|transfer/i.test(at(col.method)) ? "bank" : "cash",
      paid_by: kind === "expense" ? at(col.paidBy) : "",
      reimbursed_on: kind === "expense" && at(col.paidBy) ? repaid : "",
    });
  });
  return { rows, errors, columns: head.join(" · ") };
}
