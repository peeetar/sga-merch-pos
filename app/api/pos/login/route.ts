import { NextRequest, NextResponse } from "next/server";
import { COOKIE, allowLogin, issue, passwordMatches } from "@/lib/session";

export async function POST(req: NextRequest) {
  if (!process.env.POS_PASSWORD) {
    return NextResponse.json({ ok: false, code: "not_configured" }, { status: 500 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!allowLogin(ip)) {
    return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || !passwordMatches(password)) {
    return NextResponse.json({ ok: false, code: "wrong_password" }, { status: 401 });
  }
  const { value, maxAge } = issue();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, value, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge });
  return res;
}
