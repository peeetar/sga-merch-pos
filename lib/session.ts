// Server only. One shared password (POS_PASSWORD), held in an
// HttpOnly signed cookie for 12 h.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const COOKIE = "merch_session";
export const SESSION_HOURS = 12;

function password(): string {
  return process.env.POS_PASSWORD || "";
}

function mac(payload: string): string {
  const key = createHmac("sha256", password()).update("sga-merch-session-v1").digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function passwordMatches(given: string): boolean {
  const want = Buffer.from(password());
  const got = Buffer.from(given);
  return want.length > 0 && want.length === got.length && timingSafeEqual(want, got);
}

export function issue(): { value: string; maxAge: number } {
  const maxAge = SESSION_HOURS * 3600;
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + maxAge * 1000 })).toString("base64url");
  return { value: `${payload}.${mac(payload)}`, maxAge };
}

export function authed(req: NextRequest): boolean {
  if (!password()) return false;
  const token = req.cookies.get(COOKIE)?.value || "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const want = Buffer.from(mac(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

// Best effort: per function instance, so it slows guessing rather than
// stopping it. 10 tries per 5 minutes.
const attempts = new Map<string, number[]>();
export function allowLogin(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < 300_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length <= 10;
}
