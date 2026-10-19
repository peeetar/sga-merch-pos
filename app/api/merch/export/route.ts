import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { salesCsv } from "@/lib/calc";
import { loadMerch } from "@/lib/merch";
import { athensDay } from "@/lib/time";

/** Every till sale, one row per line item, for the Treasurer's cash book. */
export async function GET() {
  if (!(await currentSession())) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  const data = await loadMerch();
  return new NextResponse(salesCsv(data.sales), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sga-till-sales-${athensDay(Date.now())}.csv"`,
    },
  });
}
