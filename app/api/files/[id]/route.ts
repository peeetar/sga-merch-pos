import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";

/** Streams a private file to a signed-in board member. `?download` saves it
 *  instead of opening it in the browser. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await ensureSchema();
  const [doc] = (await sql()`SELECT pathname, name, content_type FROM hub_docs WHERE id = ${id}`) as { pathname: string; name: string; content_type: string }[];
  if (!doc) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  const blob = await get(doc.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  const disposition = req.nextUrl.searchParams.has("download") ? "attachment" : "inline";
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
