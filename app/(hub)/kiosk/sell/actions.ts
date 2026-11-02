"use server";

import { revalidatePath } from "next/cache";
import { requireBoard } from "@/lib/auth";
import { closeShift, flushSell, openShift, recordSale, voidSale } from "@/lib/sell";
import { euros, type Counts } from "@/lib/types";
import type { Outcome } from "../live-actions";

const refresh = () => { revalidatePath("/kiosk/sell"); revalidatePath("/kiosk/cash"); };
const WAITING = "It reaches the kiosk by itself when the kiosk is back online.";

export async function openBox(counts: Counts): Promise<Outcome> {
  const me = await requireBoard();
  const err = await openShift(me.email, counts);
  if (err) return { ok: false, message: err };
  await flushSell(me.email);
  refresh();
  return { ok: true, message: "Cash box open." };
}

export async function sell(studentId: string, cents: number): Promise<Outcome> {
  const me = await requireBoard();
  const sale = await recordSale(me.email, studentId.trim(), cents);
  if (typeof sale === "string") return { ok: false, message: sale };
  const sent = await flushSell(me.email);
  refresh();
  const balance = sent.balances[sale.student_id];
  return balance === undefined
    ? { ok: true, message: `Saved: ${sale.coffees} coffees for ${sale.student_id}, ${euros(cents, true)}. ${WAITING}` }
    : { ok: true, message: `Added ${sale.coffees} coffees to ${sale.student_id}. Balance is now ${balance}.` };
}

export async function voidIt(id: string, reason: string): Promise<Outcome> {
  const me = await requireBoard();
  const err = await voidSale(id, reason, me.email);
  if (err) return { ok: false, message: err };
  const sent = await flushSell(me.email);
  refresh();
  return { ok: true, message: sent.failure ? `Voided. ${WAITING}` : "Voided, and the coffees are off their balance." };
}

export async function closeBox(counts: Counts, note: string): Promise<Outcome> {
  const me = await requireBoard();
  const err = await closeShift(me.email, counts, note);
  if (err) return { ok: false, message: err };
  await flushSell(me.email);
  refresh();
  return { ok: true, message: "Cash box closed." };
}

export async function tryNow(): Promise<Outcome> {
  const me = await requireBoard();
  const sent = await flushSell(me.email);
  refresh();
  return sent.failure ? { ok: false, message: sent.failure.message } : { ok: true, message: sent.pending ? `${sent.pending} still waiting.` : "All sent." };
}
