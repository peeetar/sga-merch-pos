// Server only. After a tablet syncs, tell the board on ntfy when something
// runs low or sells out. Each variant alerts once per level (low, then out)
// and a delivery that lifts it back above the mark re-arms it. The very first
// check only records where things stand, so going live doesn't page the
// board about every size that was never ordered.
import { ensureSchema, getSetting, setSetting, sql } from "./db";
import { lowStock, loadMerch, variantName } from "./merch";
import { appUrl, notify, ntfyConfigured } from "./notify";

export async function checkStockAlerts() {
  if (!ntfyConfigured()) return;
  await ensureSchema();
  const q = sql();
  const data = await loadMerch();
  const low = lowStock(data);
  const state = new Map(((await q`SELECT key, level FROM hub_alert_state WHERE key LIKE 'stock:%'`) as { key: string; level: string }[])
    .map((r) => [r.key, r.level]));

  const writes = [];
  const fresh: string[] = [];
  let anyOut = false;
  const lowKeys = new Set<string>();
  for (const r of low) {
    const key = "stock:" + r.key;
    lowKeys.add(key);
    const level = r.left <= 0 ? "out" : "low";
    const was = state.get(key);
    if (was === level || (was === "out" && level === "low")) continue; // already told, or a recount nudged it up a little
    if (level === "out") anyOut = true;
    fresh.push(`${variantName(r.product, r.color, r.size)}: ${level === "out" ? "sold out" : `${r.left} left`}`);
    writes.push(q`INSERT INTO hub_alert_state (key, level) VALUES (${key}, ${level})
      ON CONFLICT (key) DO UPDATE SET level = EXCLUDED.level, at = now()`);
  }
  for (const key of state.keys()) if (!lowKeys.has(key)) writes.push(q`DELETE FROM hub_alert_state WHERE key = ${key}`);
  if (writes.length) await q.transaction(writes);
  if (!(await getSetting("stock_alerts_armed", false))) return setSetting("stock_alerts_armed", true);
  if (!fresh.length) return;
  await notify({
    title: anyOut ? "Merch sold out" : "Merch running low",
    message: fresh.slice(0, 12).join("\n") + (fresh.length > 12 ? `\n…and ${fresh.length - 12} more` : ""),
    priority: anyOut ? 4 : 3,
    tags: [anyOut ? "rotating_light" : "warning", "package"],
    click: appUrl("/merch"),
  });
}
