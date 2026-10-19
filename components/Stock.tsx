"use client";

// Stock and catalogue. Each product is a colour × size grid of what's on
// hand; tap it to log a delivery, a recount or a write-off. Edit a product to
// change its price, colours or sizes.
import { useState } from "react";
import { euros, variantKey, COLOR_PRESETS, SIZE_PRESETS, type Color, type Product, type Sale, type StockMove } from "@/lib/types";
import Garment from "./Garment";
import { Dialog } from "./ui";

type Levels = { on: Map<string, number>; tracked: Set<string> };
type Adjust = { product: Product; mode: StockMove["reason"]; focus?: string };

const LOW = 3;

export default function Stock({ products, levels, sales, seller, onMoves, onSaveProduct }: {
  products: Product[]; levels: Levels; sales: Sale[]; seller: string;
  onMoves: (moves: StockMove[]) => Promise<void>;
  onSaveProduct: (p: Product) => Promise<void>;
}) {
  const [adjust, setAdjust] = useState<Adjust | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = products.filter((p) => showArchived || !p.archived).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const sold = new Map<string, number>();
  for (const s of sales) if (!s.voided_at) for (const l of s.lines) {
    const k = variantKey(l.product_id, l.color_id, l.size);
    sold.set(k, (sold.get(k) || 0) + l.qty);
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1>Stock &amp; catalogue</h1>
        <div className="row">
          <label className="toggle"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show hidden products</label>
          <button className="btn btn--primary" onClick={() => setEditing("new")}>+ New product</button>
        </div>
      </div>
      <p className="muted small">Tap a number to change it. Grey dashes mean nobody has counted that one yet. Sold-out and low (≤{LOW}) are highlighted.</p>

      <div className="stocklist">
        {list.map((p) => {
          let total = 0, any = false;
          return (
            <section key={p.id} className={"pcard" + (p.archived ? " pcard--archived" : "")}>
              <header className="pcard__head">
                <Garment name={p.name} hex={p.colors[0]?.hex || "#ccc"} size={56} />
                <div className="pcard__title">
                  <h2>{p.name} {p.archived && <span className="tag">hidden</span>}</h2>
                  <span className="muted">{euros(p.price_cents)} · {p.colors.length} colours · {p.sizes.length} sizes</span>
                </div>
                <div className="row">
                  <button className="btn btn--sm" onClick={() => setAdjust({ product: p, mode: "delivery" })}>+ Delivery</button>
                  <button className="btn btn--sm" onClick={() => setAdjust({ product: p, mode: "count" })}>Recount</button>
                  <button className="btn btn--sm" onClick={() => setEditing(p)}>Edit</button>
                </div>
              </header>
              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr><th />{p.sizes.map((s) => <th key={s}>{s}</th>)}<th>Total</th></tr>
                  </thead>
                  <tbody>
                    {p.colors.map((c) => {
                      let row = 0, rowAny = false;
                      return (
                        <tr key={c.id}>
                          <th><span className="dot" style={{ background: c.hex }} />{c.name}</th>
                          {p.sizes.map((s) => {
                            const k = variantKey(p.id, c.id, s);
                            const tracked = levels.tracked.has(k);
                            const n = levels.on.get(k) || 0;
                            if (tracked) { row += n; rowAny = true; any = true; total += n; }
                            const cls = !tracked ? "is-none" : n <= 0 ? "is-out" : n <= LOW ? "is-low" : "";
                            return (
                              <td key={s}>
                                <button className={"cell " + cls} onClick={() => setAdjust({ product: p, mode: tracked ? "count" : "delivery", focus: k })}
                                  title={`${sold.get(k) || 0} sold`}>
                                  {tracked ? n : "—"}
                                  {(sold.get(k) || 0) > 0 && <small>{sold.get(k)} sold</small>}
                                </button>
                              </td>
                            );
                          })}
                          <td className="matrix__sum">{rowAny ? row : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <footer className="pcard__foot muted small">{any ? `${total} on hand` : "Not counted yet: tap + Delivery when the batch arrives."}</footer>
            </section>
          );
        })}
      </div>

      {adjust && (
        <AdjustDialog {...adjust} levels={levels} onClose={() => setAdjust(null)} onSave={async (rows, reason, note) => {
          const at = new Date().toISOString();
          await onMoves(rows.map((r) => ({
            id: crypto.randomUUID(), product_id: adjust.product.id, color_id: r.color, size: r.size,
            delta: r.delta, reason, note, by: seller, at,
          })));
          setAdjust(null);
        }} />
      )}
      {editing && (
        <ProductEditor initial={editing === "new" ? null : editing} nextSort={Math.max(0, ...products.map((p) => p.sort)) + 1}
          onClose={() => setEditing(null)} onSave={async (p) => { await onSaveProduct(p); setEditing(null); }} />
      )}
    </main>
  );
}

const MODES: { id: StockMove["reason"]; label: string; help: string }[] = [
  { id: "delivery", label: "+ Delivery", help: "Type how many arrived. They are added to what's there." },
  { id: "count", label: "Recount", help: "Type what is actually on the table. The difference is logged." },
  { id: "damaged", label: "− Damaged", help: "Type how many to write off as damaged or lost." },
  { id: "giveaway", label: "− Giveaway", help: "Prizes, gifts to volunteers, samples. Taken off stock, no money." },
];

function AdjustDialog({ product, mode: initialMode, focus, levels, onClose, onSave }: Adjust & {
  levels: Levels; onClose: () => void;
  onSave: (rows: { color: string; size: string; delta: number }[], reason: StockMove["reason"], note: string | null) => Promise<void>;
}) {
  const [mode, setMode] = useState(initialMode);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const rows: { color: string; size: string; delta: number }[] = [];
  for (const c of product.colors) for (const s of product.sizes) {
    const k = variantKey(product.id, c.id, s);
    const raw = vals[k];
    if (raw === undefined || raw === "") continue;
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) continue;
    const cur = levels.tracked.has(k) ? levels.on.get(k) || 0 : 0;
    // A recount of an uncounted variant still writes a 0-delta row, so it
    // becomes "tracked" and stops showing a dash.
    const delta = mode === "delivery" ? v : mode === "count" ? v - cur : -v;
    if (delta !== 0 || (mode === "count" && !levels.tracked.has(k))) rows.push({ color: c.id, size: s, delta });
  }
  const net = rows.reduce((n, r) => n + r.delta, 0);

  return (
    <Dialog title={`${product.name}: stock`} onClose={onClose} wide>
      <div className="seg seg--4">
        {MODES.map((m) => <button key={m.id} className={mode === m.id ? "is-on" : ""} onClick={() => { setMode(m.id); setVals({}); }}>{m.label}</button>)}
      </div>
      <p className="muted small">{MODES.find((m) => m.id === mode)?.help} Leave a box empty to skip it.</p>
      <div className="matrix-wrap">
        <table className="matrix matrix--input">
          <thead><tr><th />{product.sizes.map((s) => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>
            {product.colors.map((c) => (
              <tr key={c.id}>
                <th><span className="dot" style={{ background: c.hex }} />{c.name}</th>
                {product.sizes.map((s) => {
                  const k = variantKey(product.id, c.id, s);
                  const tracked = levels.tracked.has(k);
                  return (
                    <td key={s}>
                      <input className="cellin" inputMode="numeric" pattern="[0-9]*" autoFocus={k === focus}
                        placeholder={mode === "count" ? (tracked ? String(levels.on.get(k) || 0) : "—") : "0"}
                        value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                      <small className="muted">now {tracked ? levels.on.get(k) || 0 : "—"}</small>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <input className="field" placeholder="Note (optional), e.g. supplier invoice #, who took them" maxLength={300}
        value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button className="btn grow" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary grow" disabled={!rows.length || busy} onClick={async () => {
          setBusy(true);
          await onSave(rows, mode, note.trim() || null);
          setBusy(false);
        }}>{rows.length ? `Save ${rows.length} change${rows.length > 1 ? "s" : ""} (${net >= 0 ? "+" : ""}${net})` : "Nothing to save"}</button>
      </div>
    </Dialog>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "c";

function ProductEditor({ initial, nextSort, onClose, onSave }: {
  initial: Product | null; nextSort: number; onClose: () => void; onSave: (p: Product) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial ? (initial.price_cents / 100).toFixed(2) : "");
  const [colors, setColors] = useState<Color[]>(initial?.colors || []);
  const [sizes, setSizes] = useState<string[]>(initial?.sizes || ["S", "M", "L", "XL"]);
  const [archived, setArchived] = useState(initial?.archived || false);
  const [sort, setSort] = useState(initial?.sort ?? nextSort);
  const [customColor, setCustomColor] = useState({ name: "", hex: "#8B1A1A" });
  const [customSize, setCustomSize] = useState("");

  const cents = Math.round(parseFloat(price.replace(",", ".")) * 100);
  const ok = name.trim() && Number.isFinite(cents) && cents >= 0 && colors.length && sizes.length;
  const toggleColor = (c: Color) =>
    setColors(colors.some((x) => x.id === c.id) ? colors.filter((x) => x.id !== c.id) : [...colors, c]);
  const toggleSize = (s: string) => {
    if (sizes.includes(s)) return setSizes(sizes.filter((x) => x !== s));
    // Keep sizes in the usual order, custom ones at the end.
    const order = (x: string) => { const i = SIZE_PRESETS.indexOf(x); return i < 0 ? 99 : i; };
    setSizes([...sizes, s].sort((a, b) => order(a) - order(b)));
  };
  const extraColors = colors.filter((c) => !COLOR_PRESETS.some((p) => p.id === c.id));

  return (
    <Dialog title={initial ? `Edit ${initial.name}` : "New product"} onClose={onClose} wide>
      <div className="editor">
        <div className="stack">
          <label className="lbl">Name<input className="field" value={name} maxLength={60} placeholder="e.g. Zip-up hoodie" onChange={(e) => setName(e.target.value)} /></label>
          <label className="lbl">Price (€)<input className="field" inputMode="decimal" value={price} placeholder="30.00" onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ""))} /></label>
          {initial && initial.price_cents !== cents && Number.isFinite(cents) && (
            <p className="muted small">Past sales keep the price they were sold at.</p>
          )}
          <div className="editor__preview">
            <Garment name={name || "item"} hex={colors[0]?.hex || "#cccccc"} size={120} />
            <span className="muted small">The drawing is picked from the name: hoodie, zip, crewneck, tee, tote, cap, bottle.</span>
          </div>
          <label className="lbl">Position on the sell screen
            <div className="row">
              <button className="btn btn--sm" onClick={() => setSort(sort - 1.5)}>Move earlier</button>
              <button className="btn btn--sm" onClick={() => setSort(sort + 1.5)}>Move later</button>
            </div>
          </label>
          <label className="toggle"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Hide from the sell screen (keeps its sales and stock history)</label>
        </div>

        <div className="stack">
          <p className="lbl">Colours</p>
          <div className="chips">
            {[...COLOR_PRESETS, ...extraColors].map((c) => (
              <button key={c.id} className={"chip chip--color" + (colors.some((x) => x.id === c.id) ? " is-on" : "")} onClick={() => toggleColor(c)}>
                <i style={{ background: c.hex }} />{c.name}
              </button>
            ))}
          </div>
          <div className="row row--tight">
            <input type="color" className="colorpick" value={customColor.hex} onChange={(e) => setCustomColor({ ...customColor, hex: e.target.value })} aria-label="Colour" />
            <input className="field field--sm grow" placeholder="Other colour name, e.g. Lilac" maxLength={40} value={customColor.name}
              onChange={(e) => setCustomColor({ ...customColor, name: e.target.value })} />
            <button className="btn btn--sm" disabled={!customColor.name.trim()} onClick={() => {
              const n = customColor.name.trim();
              const id = "c-" + slug(n);
              if (!colors.some((c) => c.id === id)) setColors([...colors, { id, name: n, hex: customColor.hex.toUpperCase() }]);
              setCustomColor({ name: "", hex: customColor.hex });
            }}>Add</button>
          </div>
          <p className="lbl">Sizes</p>
          <div className="chips">
            {[...SIZE_PRESETS, ...sizes.filter((s) => !SIZE_PRESETS.includes(s))].map((s) => (
              <button key={s} className={"chip" + (sizes.includes(s) ? " is-on" : "")} onClick={() => toggleSize(s)}>{s}</button>
            ))}
          </div>
          <div className="row row--tight">
            <input className="field field--sm grow" placeholder="Other size, e.g. XXXL or 500ml" maxLength={20} value={customSize}
              onChange={(e) => setCustomSize(e.target.value)} />
            <button className="btn btn--sm" disabled={!customSize.trim() || sizes.includes(customSize.trim())}
              onClick={() => { setSizes([...sizes, customSize.trim()]); setCustomSize(""); }}>Add</button>
          </div>
          {initial && (initial.colors.some((c) => !colors.some((x) => x.id === c.id)) || initial.sizes.some((s) => !sizes.includes(s))) && (
            <p className="muted small">Removed colours or sizes disappear from the till and the stock grid. Their past sales still count in Stats.</p>
          )}
        </div>
      </div>
      <div className="row">
        <button className="btn grow" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary grow" disabled={!ok} onClick={() => onSave({
          id: initial?.id || "p-" + crypto.randomUUID().slice(0, 8),
          name: name.trim(), price_cents: cents, colors, sizes, sort, archived,
          updated_at: new Date().toISOString(),
        })}>{initial ? "Save changes" : "Add product"}</button>
      </div>
    </Dialog>
  );
}
