// The SGA lives in Thessaloniki; the server runs in UTC. Days, weeks and
// clock times on the hub are Athens time, wherever the page is rendered.
export const TZ = "Europe/Athens";

/** "2026-10-30" for the Athens calendar day an instant falls on. */
export const athensDay = (d: Date | string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

export const athensTime = (d: Date | string | number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));

export const athensDate = (d: Date | string | number, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(new Date(d));

/** The Athens days from `n - 1` days ago up to today, oldest first. */
export function lastDays(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(athensDay(now.getTime() - i * 86400_000));
  return [...new Set(out)];
}

/** A term like "2026-27" runs from 1 August 2026 to 31 July 2027. */
export function termStart(term: string): string {
  return `${term.slice(0, 4)}-08-01`;
}
