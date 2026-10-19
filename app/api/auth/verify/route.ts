import { NextRequest, NextResponse } from "next/server";
import { HUB_COOKIE, consumeLoginToken, cookieOptions, isBoardEmail, issueSession } from "@/lib/auth";

// The emailed link opens /auth/verify, which only shows a button that posts
// here. Mail scanners (Outlook Safe Links and the like) follow GET links, so a
// link that signed in on GET would be spent before the person ever clicked it.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  const back = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, req.url), 303);
  if (!token) return back("link");
  try {
    const email = await consumeLoginToken(token);
    if (!email) return back("link");
    // Taken off the board list since the link was sent: no entry.
    if (!(await isBoardEmail(email))) return back("not_on_board");
    const { value, maxAge } = issueSession(email);
    const res = NextResponse.redirect(new URL("/", req.url), 303);
    res.cookies.set(HUB_COOKIE, value, cookieOptions(maxAge));
    return res;
  } catch (err) {
    console.error("auth verify", err);
    return back("server");
  }
}
