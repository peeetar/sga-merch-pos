// Shared by the tablet and the server. Everything is plain JSON so a row can
// sit in IndexedDB, travel to /api/sync and land in Postgres unchanged.

export type Color = { id: string; name: string; hex: string };

/** One catalogue item. A sellable unit is product × colour × size. */
export type Product = {
  id: string;
  name: string;
  price_cents: number;
  colors: Color[];
  sizes: string[];
  sort: number;
  archived: boolean;
  updated_at: string; // last write wins, across tablets
};

/** Stock is a ledger: on hand = sum of moves − units sold (not voided). Two
 *  tablets restocking offline merge cleanly because nothing is overwritten. */
export type StockMove = {
  id: string;
  product_id: string;
  color_id: string;
  size: string;
  delta: number;
  reason: "delivery" | "count" | "damaged" | "giveaway" | "other";
  note: string | null;
  by: string;
  at: string;
};

export type Line = {
  product_id: string;
  product_name: string;
  color_id: string;
  color_name: string;
  size: string;
  qty: number;
  unit_cents: number;
};

export type Sale = {
  id: string;
  shift_id: string;
  device_id: string;
  seller: string;
  sold_at: string;
  total_cents: number;
  tendered_cents: number; // what the buyer handed over
  change_cents: number;
  lines: Line[];
  voided_at: string | null;
  void_reason: string | null;
  void_by: string | null;
};

export type Counts = Record<string, number>; // denomination in cents -> pieces

/** One cash box, on one tablet, from float count to closing recount. */
export type Shift = {
  id: string;
  device_id: string;
  opened_at: string;
  opened_by: string;
  opening_cents: number;
  opening_counts: Counts;
  closed_at: string | null;
  closed_by: string | null;
  counted_cents: number | null;
  counted_counts: Counts | null;
  expected_cents: number | null;
  note: string | null;
};

/** Money put into or taken out of the box that isn't a sale: a supplier
 *  payment, change brought from the office, cash handed to the Treasurer. */
export type CashMove = {
  id: string;
  shift_id: string;
  cents: number; // + in, − out
  reason: string;
  by: string;
  at: string;
  voided_at: string | null;
};

export type Bundle = {
  products: Product[];
  moves: StockMove[];
  sales: Sale[];
  shifts: Shift[];
  cashmoves: CashMove[];
};

export const STORES = ["products", "moves", "sales", "shifts", "cashmoves"] as const;
export type StoreName = (typeof STORES)[number];

export const euros = (cents: number, trim = false) => {
  const s = (cents < 0 ? "−" : "") + "€" + (Math.abs(cents) / 100).toFixed(2);
  return trim ? s.replace(/\.00$/, "") : s;
};

export const variantKey = (productId: string, colorId: string, size: string) => `${productId}|${colorId}|${size}`;

export const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "One size"];

export const COLOR_PRESETS: Color[] = [
  { id: "black", name: "Black", hex: "#1B1B1D" },
  { id: "white", name: "White", hex: "#F7F7F5" },
  { id: "grey", name: "Heather grey", hex: "#A7A9AC" },
  { id: "navy", name: "Navy", hex: "#1F2A44" },
  { id: "burgundy", name: "Burgundy", hex: "#7A1F2B" },
  { id: "cream", name: "Cream", hex: "#EFE6D2" },
  { id: "forest", name: "Forest", hex: "#2F4A3A" },
  { id: "sky", name: "Sky blue", hex: "#9CC3E4" },
];

/** First-run catalogue. Fixed ids and an epoch timestamp, so every tablet
 *  seeds the same rows and any real edit replaces them. Prices are guesses:
 *  edit them in Stock → Edit before the first sale. */
const EPOCH = "1970-01-01T00:00:00.000Z";
const c = (...ids: string[]) => COLOR_PRESETS.filter((p) => ids.includes(p.id));
const APPAREL = ["S", "M", "L", "XL", "XXL"];
export const SEED: Product[] = [
  { id: "seed-zip", name: "Zip-up hoodie", price_cents: 3500, colors: c("black", "grey", "burgundy"), sizes: APPAREL, sort: 1, archived: false, updated_at: EPOCH },
  { id: "seed-hoodie", name: "Hoodie", price_cents: 3000, colors: c("black", "grey", "burgundy", "navy"), sizes: APPAREL, sort: 2, archived: false, updated_at: EPOCH },
  { id: "seed-crew", name: "Crewneck", price_cents: 2500, colors: c("grey", "cream", "navy"), sizes: APPAREL, sort: 3, archived: false, updated_at: EPOCH },
  { id: "seed-tee", name: "T-shirt", price_cents: 1500, colors: c("white", "black", "burgundy"), sizes: APPAREL, sort: 4, archived: false, updated_at: EPOCH },
  { id: "seed-tote", name: "Tote bag", price_cents: 1000, colors: c("cream", "black"), sizes: ["One size"], sort: 5, archived: false, updated_at: EPOCH },
  { id: "seed-cap", name: "Cap", price_cents: 1200, colors: c("black", "burgundy"), sizes: ["One size"], sort: 6, archived: false, updated_at: EPOCH },
];
