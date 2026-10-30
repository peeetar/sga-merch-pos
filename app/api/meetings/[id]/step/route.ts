import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { runStep } from "@/lib/meetings";

// Transcribing an hour of audio takes a minute or two; give each step room.
export const maxDuration = 300;

/** Run the next step of one meeting. The Meetings page calls this in a loop
 *  while it is open; a 409 means another tab is already on it. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await runStep(id);
  return NextResponse.json(r, { status: r.busy ? 409 : 200 });
}
