"use server";

import { revalidatePath } from "next/cache";
import { requireBoard } from "@/lib/auth";
import { piDelete, piPost, piPut, type PiResult } from "@/lib/pi";

export type Outcome = { ok: boolean; message: string; unsure?: boolean };

const ID = /^[A-Za-z0-9._-]{1,40}$/;
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const bad = (message: string): Outcome => ({ ok: false, message });

function outcome(res: PiResult<object>, done: string, wrote = true): Outcome {
  if (res.ok) return { ok: true, message: done };
  // No answer to a write: it may have landed. Say so rather than "failed".
  if (res.kind === "offline" && wrote) return { ok: false, unsure: true, message: "The kiosk didn't answer, so this may or may not have gone through." };
  return { ok: false, message: res.message };
}

/** Refresh the page only on a clear success. After no answer the page would
 *  reload against a Pi that's down and lose the form, and with it the safe
 *  retry. */
function settle(res: PiResult<object>, done: string, ...paths: string[]): Outcome {
  if (res.ok) paths.forEach((p) => revalidatePath(p));
  return outcome(res, done);
}

// --- students ------------------------------------------------------------------

export async function topUp(id: string, cents: number, requestId: string): Promise<Outcome> {
  const me = await requireBoard();
  if (!ID.test(id) || !Number.isInteger(cents) || !REQUEST_ID.test(requestId)) return bad("That isn't a valid top-up.");
  const res = await piPost<{ coffees: number; credits: number }>(`/students/${encodeURIComponent(id)}/topup`, me.email, { bundle_cents: cents, request_id: requestId });
  return res.ok
    ? settle(res, `Added ${res.coffees} coffees. Balance is now ${res.credits}.`, `/kiosk/students/${id}`, "/kiosk/students")
    : outcome(res, "");
}

export async function createStudent(id: string, cents: number | null): Promise<Outcome> {
  const me = await requireBoard();
  if (!/^\d{1,20}$/.test(id)) return bad("A student ID is digits only.");
  const res = await piPost(`/students`, me.email, cents === null ? { student_id: id } : { student_id: id, bundle_cents: cents });
  return settle(res, `Student ${id} added.`, "/kiosk/students");
}

export async function adjust(id: string, amount: number, reason: string): Promise<Outcome> {
  const me = await requireBoard();
  if (!ID.test(id)) return bad("Bad ID.");
  const res = await piPost(`/students/${encodeURIComponent(id)}/adjust`, me.email, { amount, reason: reason.trim().slice(0, 200) });
  return settle(res, "Balance corrected.", `/kiosk/students/${id}`);
}

export async function resetPin(id: string): Promise<Outcome> {
  const me = await requireBoard();
  if (!ID.test(id)) return bad("Bad ID.");
  const res = await piPost(`/students/${encodeURIComponent(id)}/reset-pin`, me.email);
  return settle(res, "PIN cleared. They choose a new one on their next visit.", `/kiosk/students/${id}`);
}

export async function unlock(id: string): Promise<Outcome> {
  const me = await requireBoard();
  if (!ID.test(id)) return bad("Bad ID.");
  const res = await piPost(`/students/${encodeURIComponent(id)}/unlock`, me.email);
  return settle(res, "Unlocked.", `/kiosk/students/${id}`);
}

export async function removeStaff(id: string): Promise<Outcome> {
  const me = await requireBoard();
  if (!ID.test(id)) return bad("Bad ID.");
  const res = await piPost(`/staff/${encodeURIComponent(id)}/remove`, me.email);
  return settle(res, "Staff account removed.", "/kiosk/students");
}

// --- early sign-ups ------------------------------------------------------------

export async function addSignups(ids: string, credits: number): Promise<Outcome> {
  const me = await requireBoard();
  const res = await piPost<{ added: number; bad: string[] }>("/signups", me.email, { ids: ids.slice(0, 20000), credits });
  return res.ok
    ? settle(res, `Added ${res.added}.${res.bad.length ? ` Skipped ${res.bad.length} that aren't valid IDs.` : ""}`, "/kiosk/signups")
    : outcome(res, "");
}

export async function removeSignup(id: string): Promise<Outcome> {
  const me = await requireBoard();
  if (!ID.test(id)) return bad("Bad ID.");
  const res = await piDelete(`/signups/${encodeURIComponent(id)}`, me.email);
  return settle(res, "Removed.", "/kiosk/signups");
}

// --- the machine ---------------------------------------------------------------

const column = (n: number) => Number.isInteger(n) && n >= 0 && n <= 99;

export async function setMaintenanceLive(on: boolean): Promise<Outcome> {
  const me = await requireBoard();
  const res = await piPost("/system/maintenance", me.email, { on, note: "from the SGA Hub" });
  return settle(res, on ? "Maintenance on." : "Back in service.", "/kiosk");
}

export async function refillLive(index: number, count: number): Promise<Outcome> {
  const me = await requireBoard();
  if (!column(index)) return bad("Bad column.");
  const res = await piPost(`/columns/${index}/refill`, me.email, { count });
  return settle(res, `Column ${index + 1} refilled.`, "/kiosk", "/kiosk/stock");
}

export async function setStock(index: number, stock: number): Promise<Outcome> {
  const me = await requireBoard();
  if (!column(index)) return bad("Bad column.");
  const res = await piPost(`/columns/${index}/stock`, me.email, { stock });
  return settle(res, "Stock saved.", "/kiosk", "/kiosk/stock");
}

export async function assignCapsule(index: number, sku: string): Promise<Outcome> {
  const me = await requireBoard();
  if (!column(index)) return bad("Bad column.");
  const res = await piPut(`/columns/${index}`, me.email, { sku: sku || null });
  return settle(res, "Capsule saved.", "/kiosk", "/kiosk/stock");
}

export async function enableColumn(index: number, enabled: boolean): Promise<Outcome> {
  const me = await requireBoard();
  if (!column(index)) return bad("Bad column.");
  const res = await piPost(`/columns/${index}/enable`, me.email, { enabled });
  return settle(res, enabled ? "Column on." : "Column off.", "/kiosk", "/kiosk/stock");
}

export async function clearJams(index: number): Promise<Outcome> {
  const me = await requireBoard();
  if (!column(index)) return bad("Bad column.");
  const res = await piPost(`/columns/${index}/clear-jams`, me.email);
  return settle(res, "Jams cleared.", "/kiosk", "/kiosk/stock");
}

// --- alerts --------------------------------------------------------------------

export async function alertState(id: number, to: "ack" | "resolve"): Promise<Outcome> {
  const me = await requireBoard();
  if (!Number.isInteger(id)) return bad("Bad alert.");
  const res = await piPost(`/alerts/${id}/${to}`, me.email);
  return settle(res, to === "ack" ? "Marked as being handled." : "Resolved.", "/kiosk/alerts", "/kiosk");
}
