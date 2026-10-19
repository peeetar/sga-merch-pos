"use client";

// The till: tap a product, its colour, its size, and it lands in the cart.
// One tap per decision, stock shown on every button, cash box always in view.
import { useMemo, useState } from "react";
import { activeProducts, changeBreakdown, shiftTotals, tenderSuggestions } from "@/lib/calc";
import { euros, variantKey, type CashMove, type Line, type Product, type Sale, type Shift } from "@/lib/types";
import Garment from "./Garment";
import { Dialog, Money, MoneyPad } from "./ui";

type Levels = { on: Map<string, number>; tracked: Set<string> };

const lineTotal = (lines: Line[]) => lines.reduce((n, l) => n + l.qty * l.unit_cents, 0);
const itemCount = (lines: Line[]) => lines.reduce((n, l) => n + l.qty, 0);
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export default function Sell({ products, levels, cart, setCart, shift, sales, cashmoves, onCheckout, onOpenBox, onFlash }: {
  products: Product[]; levels: Levels; cart: Line[]; setCart: (c: Line[]) => void;
  shift: Shift; sales: Sale[]; cashmoves: CashMove[];
  onCheckout: () => void; onOpenBox: () => void; onFlash: (msg: string) => void;
}) {
  const [picking, setPicking] = useState<Product | null>(null);
  const list = activeProducts(products);
  const t = shiftTotals(shift, sales, cashmoves);

  /** Stock left for a variant once what's already in the cart is taken off. */
  const left = (p: string, c: string, s: string) => {
    const k = variantKey(p, c, s);
    if (!levels.tracked.has(k)) return null;
    const inCart = cart.filter((l) => variantKey(l.product_id, l.color_id, l.size) === k).reduce((n, l) => n + l.qty, 0);
    return (levels.on.get(k) || 0) - inCart;
  };
  const productLeft = (p: Product) => {
    let any = false, n = 0;
    for (const c of p.colors) for (const s of p.sizes) {
      const v = left(p.id, c.id, s);
      if (v !== null) { any = true; n += Math.max(0, v); }
    }
    return any ? n : null;
  };

  function add(p: Product, colorId: string, size: string) {
    const color = p.colors.find((c) => c.id === colorId)!;
    const i = cart.findIndex((l) => l.product_id === p.id && l.color_id === colorId && l.size === size && l.unit_cents === p.price_cents);
    const next = [...cart];
    if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + 1 };
    else next.push({ product_id: p.id, product_name: p.name, color_id: color.id, color_name: color.name, size, qty: 1, unit_cents: p.price_cents });
    setCart(next);
    setPicking(null);
    onFlash(`Added ${p.name} · ${color.name} · ${size}`);
  }

  function setQty(i: number, qty: number) {
    setCart(qty <= 0 ? cart.filter((_, j) => j !== i) : cart.map((l, j) => (j === i ? { ...l, qty } : l)));
  }

  const total = lineTotal(cart);

  return (
    <main className="sell">
      <section className="shelf">
        {!picking ? (
          list.length === 0 ? (
            <div className="empty">
              <p>No products yet. Add some in <strong>Stock</strong>.</p>
            </div>
          ) : (
            <div className="grid">
              {list.map((p) => {
                const n = productLeft(p);
                return (
                  <button key={p.id} className={"tile" + (n === 0 ? " tile--out" : "")} onClick={() => setPicking(p)}>
                    <Garment name={p.name} hex={p.colors[0]?.hex || "#cccccc"} size={110} />
                    <span className="tile__name">{p.name}</span>
                    <span className="tile__price">{euros(p.price_cents, true)}</span>
                    <span className="tile__dots">
                      {p.colors.map((c) => <i key={c.id} style={{ background: c.hex }} title={c.name} />)}
                    </span>
                    {n !== null && <span className={"tile__left" + (n === 0 ? " is-out" : n <= 5 ? " is-low" : "")}>{n === 0 ? "Sold out" : `${n} left`}</span>}
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <Picker product={picking} left={left} onBack={() => setPicking(null)} onAdd={(c, s) => add(picking, c, s)} />
        )}
      </section>

      <aside className="side">
        <div className="cart">
          <div className="cart__head">
            <h2>Cart {cart.length > 0 && <span className="muted small">· {itemCount(cart)} item{itemCount(cart) === 1 ? "" : "s"}</span>}</h2>
            {cart.length > 0 && <button className="linkbtn" onClick={() => setCart([])}>Clear</button>}
          </div>
          <ul className="cart__lines">
            {cart.length === 0 && <li className="muted cart__empty">Tap a product to start a sale.</li>}
            {cart.map((l, i) => {
              const hex = products.find((p) => p.id === l.product_id)?.colors.find((c) => c.id === l.color_id)?.hex || "#ccc";
              return (
                <li key={i} className="cline">
                  <Garment name={l.product_name} hex={hex} size={44} />
                  <div className="cline__what">
                    <strong>{l.product_name}</strong>
                    <span className="muted small">{l.color_name} · {l.size} · {euros(l.unit_cents, true)}</span>
                  </div>
                  <div className="qty">
                    <button className="step step--sm" onClick={() => setQty(i, l.qty - 1)} aria-label="one fewer">−</button>
                    <span>{l.qty}</span>
                    <button className="step step--sm" onClick={() => setQty(i, l.qty + 1)} aria-label="one more">+</button>
                  </div>
                  <span className="cline__sum">{euros(l.qty * l.unit_cents, true)}</span>
                </li>
              );
            })}
          </ul>
          <button className="btn btn--confirm" disabled={!cart.length} onClick={onCheckout}>
            {cart.length ? `Charge ${euros(total, true)}` : "Charge"}
          </button>
        </div>

        <button className="boxcard" onClick={onOpenBox}>
          <span className="boxcard__label">Should be in the cash box</span>
          <strong className="boxcard__cash">{euros(t.expected)}</strong>
          <span className="boxcard__sub">
            {euros(shift.opening_cents)} float + {euros(t.cash)} cash{t.paidIn + t.paidOut !== 0 ? ` ${t.paidIn + t.paidOut > 0 ? "+" : "−"} ${euros(Math.abs(t.paidIn + t.paidOut))} in/out` : ""}
          </span>
          <span className="boxcard__grid">
            <span><strong>{t.items}</strong> items</span>
            <span><strong>{t.ok.length}</strong> sales</span>
            <span><strong>{t.voided}</strong> voided</span>
          </span>
        </button>
      </aside>
    </main>
  );
}

function Picker({ product, left, onBack, onAdd }: {
  product: Product; left: (p: string, c: string, s: string) => number | null;
  onBack: () => void; onAdd: (colorId: string, size: string) => void;
}) {
  const [colorId, setColorId] = useState<string | null>(product.colors.length === 1 ? product.colors[0].id : null);
  const [armed, setArmed] = useState<string | null>(null); // size tapped once while out of stock
  const color = product.colors.find((c) => c.id === colorId) || null;
  const colorLeft = (cid: string) => {
    let any = false, n = 0;
    for (const s of product.sizes) { const v = left(product.id, cid, s); if (v !== null) { any = true; n += Math.max(0, v); } }
    return any ? n : null;
  };

  return (
    <div className="picker">
      <div className="picker__head">
        <button className="btn btn--back" onClick={onBack}>← All products</button>
        <h1>{product.name} <span className="muted">{euros(product.price_cents, true)}</span></h1>
      </div>
      <div className="picker__body">
        <div className="picker__art">
          <Garment name={product.name} hex={color?.hex || product.colors[0]?.hex || "#ccc"} size={220} />
          <p className="picker__chosen">{color ? color.name : "Pick a colour"}</p>
        </div>
        <div className="picker__choices">
          <p className="eyebrow">1 · Colour</p>
          <div className="swatches">
            {product.colors.map((c) => {
              const n = colorLeft(c.id);
              return (
                <button key={c.id} className={"swatch" + (c.id === colorId ? " is-on" : "") + (n === 0 ? " is-out" : "")}
                  onClick={() => { setColorId(c.id); setArmed(null); }}>
                  <i style={{ background: c.hex }} />
                  <span>{c.name}</span>
                  {n !== null && <small>{n === 0 ? "out" : `${n} left`}</small>}
                </button>
              );
            })}
          </div>
          <p className="eyebrow">2 · Size {color ? "· tap to add" : ""}</p>
          <div className="sizes">
            {product.sizes.map((s) => {
              const n = color ? left(product.id, color.id, s) : null;
              const out = n !== null && n <= 0;
              const isArmed = armed === s;
              return (
                <button key={s} className={"size" + (out ? " is-out" : "") + (isArmed ? " is-armed" : "") + (s.length > 4 ? " size--wide" : "")}
                  disabled={!color}
                  onClick={() => {
                    if (!color) return;
                    if (out && !isArmed) return setArmed(s);
                    onAdd(color.id, s);
                  }}>
                  <span className="size__label">{s}</span>
                  <small>{!color ? "" : isArmed ? "Tap again to sell anyway" : n === null ? "not counted" : out ? "out of stock" : `${n} left`}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Checkout({ cart, onCancel, onDone }: {
  cart: Line[]; onCancel: () => void;
  onDone: (tendered: number) => Promise<void>;
}) {
  const total = lineTotal(cart);
  const [tendered, setTendered] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const quick = useMemo(() => tenderSuggestions(total), [total]);
  const change = tendered !== null ? tendered - total : null;
  const ready = tendered !== null && tendered >= total;

  return (
    <Dialog title={`Charge ${euros(total)}`} onClose={onCancel} wide>
      <div className="checkout">
        <div className="stack">
          <ul className="receipt">
            {cart.map((l, i) => (
              <li key={i}><span>{l.qty}× {l.product_name} <span className="muted">· {l.color_name} · {l.size}</span></span><span>{euros(l.qty * l.unit_cents)}</span></li>
            ))}
            <li className="receipt__total"><span>Total</span><span>{euros(total)}</span></li>
          </ul>
          <p className="muted small">Cash only. Take the money, put it in the box, give back the change shown.</p>
        </div>

        <div className="stack">
          <>
              <p className="eyebrow eyebrow--ink">What did they hand you?</p>
              {!typing ? (
                <div className="tender">
                  {quick.map((c) => (
                    <button key={c} className={"tender__btn" + (tendered === c ? " is-on" : "")} onClick={() => setTendered(c)}>
                      {c === total ? "Exact" : euros(c, true)}
                      {c === total && <small>{euros(c, true)}</small>}
                    </button>
                  ))}
                  <button className="tender__btn tender__btn--other" onClick={() => { setTyping(true); setTendered(0); }}>Other…</button>
                </div>
              ) : (
                <>
                  <div className="amount">{euros(tendered || 0)}</div>
                  <MoneyPad cents={tendered || 0} onChange={setTendered} />
                  <button className="linkbtn" onClick={() => { setTyping(false); setTendered(null); }}>Back to quick amounts</button>
                </>
              )}
              {change !== null && tendered! > 0 && (
                change < 0 ? (
                  <div className="changebox changebox--short">Still {euros(-change)} short</div>
                ) : (
                  <div className="changebox">
                    <span className="changebox__label">{change === 0 ? "No change" : "Give back"}</span>
                    {change > 0 && <strong className="changebox__amt">{euros(change)}</strong>}
                    {change > 0 && <div className="changebox__money">{changeBreakdown(change).map((b) => <Money key={b.denom} denom={b.denom} n={b.n} />)}</div>}
                  </div>
                )
              )}
          </>
          <button className="btn btn--confirm" disabled={!ready || busy} onClick={async () => {
            setBusy(true);
            await onDone(tendered!);
            setBusy(false);
          }}>
            {!ready ? "Enter the cash received"
              : change ? `${euros(tendered!, true)} in, ${euros(change)} out, confirm`
              : "Cash received, confirm"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

const VOID_REASONS = ["Wrong item rung up", "Customer changed their mind", "Money returned"];

export function SalesDialog({ shift, sales, seller, onVoid, onClose }: {
  shift: Shift; sales: Sale[]; seller: string;
  onVoid: (s: Sale, reason: string) => Promise<void>; onClose: () => void;
}) {
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const mine = sales.filter((s) => s.shift_id === shift.id).slice().sort((a, b) => b.sold_at.localeCompare(a.sold_at));

  if (voiding) {
    return (
      <Dialog title="Void this sale?" onClose={() => setVoiding(null)}>
        <p><strong>{euros(voiding.total_cents)}</strong> · {time(voiding.sold_at)} by {voiding.seller}</p>
        <ul className="receipt receipt--sm">
          {voiding.lines.map((l, i) => <li key={i}><span>{l.qty}× {l.product_name} · {l.color_name} · {l.size}</span></li>)}
        </ul>
        <p className="muted small">The items go back into stock and the sale stays on record as voided. Give back {euros(voiding.total_cents)} from the box.</p>
        <div className="chips">
          {VOID_REASONS.map((r) => <button key={r} className={"chip" + (reason === r ? " is-on is-bad" : "")} onClick={() => setReason(r)}>{r}</button>)}
        </div>
        <input className="field" placeholder="Or type a reason" maxLength={200} value={VOID_REASONS.includes(reason) ? "" : reason}
          onChange={(e) => setReason(e.target.value)} />
        <div className="row">
          <button className="btn grow" onClick={() => setVoiding(null)}>Keep sale</button>
          <button className="btn btn--danger grow" disabled={!reason.trim()} onClick={async () => {
            await onVoid(voiding, reason.trim());
            setVoiding(null);
            setReason("");
          }}>Void sale</button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Sales this shift" onClose={onClose} wide>
      {mine.length === 0 && <p className="muted">No sales yet.</p>}
      <ul className="saleslist">
        {mine.map((s) => (
          <li key={s.id} className={s.voided_at ? "is-void" : ""}>
            <span className="muted small">{time(s.sold_at)}</span>
            <span className="saleslist__what">
              {s.lines.map((l) => `${l.qty}× ${l.product_name} ${l.color_name} ${l.size}`).join(", ")}
              {s.seller !== seller && <span className="muted small"> · {s.seller}</span>}
            </span>
            <strong>{euros(s.total_cents, true)}</strong>
            {s.voided_at
              ? <span className="voidtag" title={s.void_reason || ""}>void</span>
              : <button className="sale__void" onClick={() => { setVoiding(s); setReason(""); }}>Void</button>}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
