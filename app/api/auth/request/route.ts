import { NextRequest, NextResponse } from "next/server";
import { LINK_MINUTES, createLoginToken, isBoardEmail, normEmail, rateOk } from "@/lib/auth";
import { appUrl, sendLoginEmail } from "@/lib/notify";

/** Email a single-use sign-in link to anyone on this year's board list. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const { email } = await req.json().catch(() => ({ email: "" }));
  if (typeof email !== "string" || !email.includes("@") || email.length > 200) {
    return NextResponse.json({ ok: false, code: "invalid" }, { status: 400 });
  }
  const e = normEmail(email);
  if (!rateOk("ip:" + ip, 10) || !rateOk("email:" + e, 5)) {
    return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
  }
  try {
    if (!(await isBoardEmail(e))) return NextResponse.json({ ok: false, code: "not_on_board" }, { status: 403 });
    const token = await createLoginToken(e);
    const sent = await sendLoginEmail(e, appUrl(`/auth/verify?token=${token}`), LINK_MINUTES);
    if (sent !== "sent") return NextResponse.json({ ok: false, code: sent === "not_configured" ? "email_not_configured" : "email_failed" }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("auth request", err);
    return NextResponse.json({ ok: false, code: "server" }, { status: 500 });
  }
}
