import { after, NextRequest, NextResponse } from "next/server";
import { kioskAuthed, parseReport, storeReport } from "@/lib/kiosk";
import { flushSell } from "@/lib/sell";

/** The Pi's minute-by-minute report. The reply carries any queued commands. */
export async function POST(req: NextRequest) {
  if (!kioskAuthed(req.headers.get("authorization"))) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = body && typeof body === "object" ? parseReport(body) : null;
  if (!parsed) return NextResponse.json({ ok: false, code: "invalid" }, { status: 400 });
  try {
    const commands = await storeReport(parsed.report, parsed.topups);
    // It just proved it's online, so this is the moment for sales that waited.
    after(() => flushSell("hub").catch((err) => console.error("kiosk sell flush", err)));
    return NextResponse.json({ ok: true, topups_stored: parsed.topups.length, commands: commands.map(({ id, kind, args }) => ({ id, kind, args })) });
  } catch (err) {
    console.error("kiosk report", err);
    return NextResponse.json({ ok: false, code: "db_unavailable" }, { status: 503 });
  }
}
