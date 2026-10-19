// Server only. Board sign-in for the hub.
//
// Everyone on the board has the same access. Who counts as "the board" is the
// People page: anyone listed for the current term with an email can ask for a
// sign-in link. HUB_BOOTSTRAP_EMAILS lets the first person in before anyone is
// listed. HUB_PASSWORD, if set, is a shared fallback for when email is down.
//
// The till (/pos) has its own password and session (lib/session.ts), because
// volunteers who aren't on the board sell merch too.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentTerm, ensureSchema, sql } from "./db";

export const HUB_COOKIE = "hub_session";
const SESSION_DAYS = 30;
export const LINK_MINUTES = 15;

function secret(): string {
  const s = process.env.HUB_SECRET || "";
  if (s.length < 32) throw new Error("HUB_SECRET must be set (32+ characters)");
  return s;
}

const mac = (payload: string) => createHmac("sha256", secret()).update("hub-session-v1." + payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type Session = { email: string; exp: number };

export function issueSession(email: string): { value: string; maxAge: number } {
  const maxAge = SESSION_DAYS * 86400;
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + maxAge * 1000 })).toString("base64url");
  return { value: `${payload}.${mac(payload)}`, maxAge };
}

export function readSession(token: string | undefined): Session | null {
  if (!token || !process.env.HUB_SECRET) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(mac(payload), sig)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAge: number) =>
  ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

/** For server components and actions: the signed-in board member, or off to /login. */
export async function requireBoard(): Promise<Session> {
  const s = readSession((await cookies()).get(HUB_COOKIE)?.value);
  if (!s) redirect("/login");
  return s;
}

export async function currentSession(): Promise<Session | null> {
  return readSession((await cookies()).get(HUB_COOKIE)?.value);
}

// --- who may sign in ---------------------------------------------------------

export const normEmail = (e: string) => e.trim().toLowerCase();

const bootstrap = () => (process.env.HUB_BOOTSTRAP_EMAILS || "").split(",").map(normEmail).filter(Boolean);

export async function isBoardEmail(email: string): Promise<boolean> {
  const e = normEmail(email);
  if (!e.includes("@")) return false;
  if (bootstrap().includes(e)) return true;
  await ensureSchema();
  const term = await currentTerm();
  const rows = await sql()`SELECT 1 FROM hub_people WHERE lower(email) = ${e} AND term = ${term} LIMIT 1`;
  return rows.length > 0;
}

// --- sign-in links -----------------------------------------------------------

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** A single-use token. Only its hash is stored, so a database leak can't be
 *  turned into a sign-in. */
export async function createLoginToken(email: string): Promise<string> {
  await ensureSchema();
  const token = randomBytes(32).toString("base64url");
  const q = sql();
  await q.transaction([
    q`DELETE FROM hub_login_tokens WHERE expires_at < now() - interval '1 day'`,
    q`INSERT INTO hub_login_tokens (hash, email, expires_at)
      VALUES (${hashToken(token)}, ${normEmail(email)}, now() + make_interval(mins => ${LINK_MINUTES}))`,
  ]);
  return token;
}

/** Spend a token. Returns the email it was for, or null if it is unknown,
 *  expired or already used. The update is the check, so two clicks can't
 *  both win. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  await ensureSchema();
  const rows = (await sql()`
    UPDATE hub_login_tokens SET used_at = now()
    WHERE hash = ${hashToken(token)} AND used_at IS NULL AND expires_at > now()
    RETURNING email`) as { email: string }[];
  return rows[0]?.email ?? null;
}

export function sharedPasswordMatches(given: string): boolean {
  const want = process.env.HUB_PASSWORD || "";
  return want.length >= 12 && safeEqual(want, given);
}

// Best effort: per function instance, so it slows guessing rather than
// stopping it. 10 tries per 5 minutes per key.
const attempts = new Map<string, number[]>();
export function rateOk(key: string, max = 10): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < 300_000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length <= max;
}
