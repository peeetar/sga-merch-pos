import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { AREAS, areaOf } from "@/lib/files";

/** Signs a one-off upload token for the browser, for a pathname under docs/,
 *  receipts/ or meetings/ only, within that area's size and type limits. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // Blob's own completion callback carries no session; we don't use it, and
  // the browser records the file itself once the upload is done.
  if (body.type !== "blob.generate-client-token") return NextResponse.json({ ok: true });
  if (!(await currentSession())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  try {
    const json = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        const area = areaOf(pathname);
        if (!area || pathname.includes("..")) throw new Error("Not an upload area");
        return {
          allowedContentTypes: [...AREAS[area].types],
          maximumSizeInBytes: AREAS[area].max,
          addRandomSuffix: true,
          validUntil: Date.now() + 30 * 60_000,
        };
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload refused" }, { status: 400 });
  }
}
