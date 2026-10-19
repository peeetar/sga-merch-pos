"use server";

import { revalidatePath } from "next/cache";
import { requireBoard } from "@/lib/auth";
import { setSetting } from "@/lib/db";
import { appUrl, notify } from "@/lib/notify";

export async function sendTestAlert(): Promise<string> {
  const me = await requireBoard();
  const ok = await notify({ title: "SGA Hub test", message: `Test alert sent by ${me.email}. If you can read this, alerts reach you.`, tags: ["white_check_mark"], click: appUrl("/settings") });
  return ok ? "Sent. Check your phone." : "Couldn't send. Is NTFY_TOPIC set?";
}

/** The yearly handover: the new board's term becomes current. Last year's
 *  people stay on record under their own term but can no longer sign in. */
export async function startTerm(term: string): Promise<string | null> {
  await requireBoard();
  if (!/^\d{4}-\d{2}$/.test(term) || (Number(term.slice(0, 4)) + 1) % 100 !== Number(term.slice(5))) return "Write it like 2027-28.";
  await setSetting("term", term);
  revalidatePath("/", "layout");
  return null;
}
