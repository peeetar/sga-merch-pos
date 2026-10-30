"use server";

import { revalidatePath } from "next/cache";
import { requireBoard } from "@/lib/auth";
import { queueCommand } from "@/lib/kiosk";

export async function setMaintenance(on: boolean) {
  const me = await requireBoard();
  await queueCommand("maintenance", { on }, me.email);
  revalidatePath("/kiosk");
}

export async function refill(column: number, how: { add: number } | { to: number }) {
  const me = await requireBoard();
  if (!Number.isInteger(column) || column < 0 || column > 99) return;
  const n = "add" in how ? how.add : how.to;
  if (!Number.isInteger(n) || n < 0 || n > 99) return;
  await queueCommand("refill", { column, ...how }, me.email);
  revalidatePath("/kiosk");
}

export async function reloadScreen() {
  const me = await requireBoard();
  await queueCommand("reload", {}, me.email);
  revalidatePath("/kiosk");
}
