import { NextRequest, NextResponse } from "next/server";
import { ackCommand, kioskAuthed } from "@/lib/kiosk";

/** The Pi says how a command went. */
export async function POST(req: NextRequest) {
  if (!kioskAuthed(req.headers.get("authorization"))) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b.id !== "string" || typeof b.ok !== "boolean") return NextResponse.json({ ok: false, code: "invalid" }, { status: 400 });
  try {
    await ackCommand(b.id, b.ok, typeof b.result === "string" ? b.result : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("kiosk ack", err);
    return NextResponse.json({ ok: false, code: "db_unavailable" }, { status: 503 });
  }
}
