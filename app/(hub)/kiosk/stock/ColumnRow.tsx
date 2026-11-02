"use client";

import { useState } from "react";
import type { PiColumn } from "@/lib/pi";
import { assignCapsule, clearJams, enableColumn, setStock } from "../live-actions";
import { useAct } from "../useAct";

export function ColumnRow({ c, capsules }: { c: PiColumn; capsules: { sku: string; name: string }[] }) {
  const i = c.column_index;
  const [stock, setValue] = useState(String(c.stock));
  const { busy, run, note } = useAct();
  const changed = Number(stock) !== c.stock;
  return (
    <>
      <tr>
        <td>{i + 1}</td>
        <td>
          <select className="field field--sm" value={c.sku || ""} disabled={busy} aria-label={`Capsule in column ${i + 1}`}
            onChange={(e) => { if (confirm("Change the capsule in this column? Check the stock number afterwards.")) run(() => assignCapsule(i, e.target.value)); }}>
            <option value="">Empty</option>
            {capsules.map((k) => <option key={k.sku} value={k.sku}>{k.name}</option>)}
          </select>
        </td>
        <td>
          <div className="row row--tight">
            <input className="field field--sm field--tiny" inputMode="numeric" value={stock} aria-label={`Stock in column ${i + 1}`} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            <span className="muted">/{c.capacity}</span>
            {changed && <button className="btn btn--sm" disabled={busy || stock === ""} onClick={() => run(() => setStock(i, Number(stock)))}>Save</button>}
          </div>
        </td>
        <td>{c.enabled ? (c.sku && c.stock <= c.low_threshold ? <span className="pill pill--warn">low</span> : <span className="pill pill--ok">on</span>) : <span className="pill pill--bad">off</span>}
          {c.consecutive_jams > 0 && <span className="pill pill--bad"> {c.consecutive_jams} jam{c.consecutive_jams > 1 ? "s" : ""}</span>}</td>
        <td>
          <div className="row row--tight">
            <button className="linkbtn" disabled={busy} onClick={() => run(() => enableColumn(i, !c.enabled))}>{c.enabled ? "Turn off" : "Turn on"}</button>
            {c.jam_count > 0 && <button className="linkbtn" disabled={busy} onClick={() => run(() => clearJams(i))}>Clear jams</button>}
          </div>
        </td>
      </tr>
      {note && <tr><td colSpan={5}>{note}</td></tr>}
    </>
  );
}
