import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { currentTerm } from "@/lib/db";
import { ledgerCsv, loadEntries, periodRange, type Period } from "@/lib/finance";

/** The term's books as a CSV, automatic rows included. */
export async function GET(req: NextRequest) {
  if (!(await currentSession())) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  const term = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get("term") || "") ? req.nextUrl.searchParams.get("term")! : await currentTerm();
  const p = req.nextUrl.searchParams.get("period");
  const period: Period = p === "fall" || p === "spring" ? p : "year";
  const [from, to] = periodRange(term, period);
  return new NextResponse(ledgerCsv(await loadEntries(from, to)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sga-finance-${term}-${period}.csv"`,
    },
  });
}
