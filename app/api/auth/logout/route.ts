import { NextRequest, NextResponse } from "next/server";
import { HUB_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(HUB_COOKIE);
  return res;
}
