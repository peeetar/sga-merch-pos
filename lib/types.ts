// Shared by the tablet and the server. Everything is plain JSON so a row can
// sit in IndexedDB, travel to /api/sync and land in Postgres unchanged.

export type Color = { id: string; name: string; hex: string };

/** One catalogue item. A sellable unit is product × colour × size. A plain
 *  article (a tote, a sticker, a can of cola) has one colour, STD_COLOR, and
 *  one size, ONE_SIZE, and the till adds it in one tap. */
export type Product = {
  id: string;
  name: string;
  price_cents: number;
  colors: Color[];
  sizes: string[];
  sort: number;
  archived: boolean;
  updated_at: string; // last write wins, across tablets
  category?: string;  // groups the sell screen; missing = "Merch"
  low_at?: number;    // warn at or under this many per variant; missing = lowMark's default
};

export const LOW_STOCK = 3;
export const DEFAULT_CATEGORY = "Merch";
export const STD_COLOR: Color = { id: "std", name: "Standard", hex: "#8B1A1A" };
export const ONE_SIZE = "One size";
export const categoryOf = (p: Product) => p.category?.trim() || DEFAULT_CATEGORY;

/** One colour and one size: nothing to pick, so the till adds it in a tap. */
export const isPlain = (p: Product) => p.colors.length === 1 && p.sizes.length === 1;

/** When a variant counts as low. Merch comes in ones and twos per size, so a
 *  sized product only warns when a size sells out; a plain article (a crate
 *  of cola) warns at LOW_STOCK. A product's own low_at overrides both. */
export const lowMark = (p: Product) => p.low_at ?? (isPlain(p) ? LOW_STOCK : 0);

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

/** First-run catalogue and opening stock: the 2025-26 Treasury merch order.
 *  Fixed ids and an epoch timestamp, so every tablet seeds the same rows (no
 *  double-counted stock) and any later edit made in the app wins. */
const EPOCH = "1970-01-01T00:00:00.000Z";
const SIZES = ["S", "M", "L", "XL", "XXL"];
const BURGUNDY: Color = { id: "burgundy", name: "Burgundy", hex: "#7A1F2B" };
const BLACK: Color = { id: "black", name: "Black", hex: "#1B1B1D" };
const PINK: Color = { id: "pink-dark-logo", name: "Pink (dark pink logo)", hex: "#F2A9C4" };
const BROWN: Color = { id: "brown-white-logo", name: "Brown (white logo)", hex: "#5B3A29" };
const GRAY_BURG: Color = { id: "gray-burgundy-logo", name: "College Gray (burgundy logo)", hex: "#A3A7AB" };
const GRAY: Color = { id: "college-gray", name: "College Gray", hex: "#A3A7AB" };
const WHITE_BLUE: Color = { id: "white-blue-logo", name: "White (dark blue logo)", hex: "#F7F7F5" };

const product = (id: string, name: string, euro: number, colors: Color[], sort: number): Product =>
  ({ id, name, price_cents: euro * 100, colors, sizes: SIZES, sort, archived: false, updated_at: EPOCH });

export const SEED: Product[] = [
  product("aau-hoodie", "AAU Hoodie", 20, [BURGUNDY, PINK, BLACK, BROWN, GRAY_BURG], 1),
  product("aau-sweater", "AAU Sweater", 15, [BURGUNDY, BLACK], 2),
  product("aau-tee", "AAU T-Shirt", 10, [BURGUNDY, PINK, WHITE_BLUE], 3),
  product("act-zip", "ACT Zip-Up Jacket", 20, [GRAY_BURG, BURGUNDY], 4),
  product("aau-mascot-hoodie", "AAU Mascot Hoodie", 20, [GRAY], 5),
];

/** Quantities per size, in S M L XL XXL order, straight from the order sheet. */
const ORDER: [string, string, number[]][] = [
  ["aau-hoodie", "burgundy", [2, 2, 2, 2, 1]],
  ["aau-hoodie", "pink-dark-logo", [2, 2, 2, 1, 0]],
  ["aau-hoodie", "black", [0, 1, 1, 1, 0]],
  ["aau-hoodie", "brown-white-logo", [0, 1, 2, 2, 0]],
  ["aau-hoodie", "gray-burgundy-logo", [1, 2, 2, 2, 1]],
  ["aau-sweater", "burgundy", [1, 2, 2, 1, 0]],
  ["aau-sweater", "black", [0, 2, 2, 1, 0]],
  ["aau-tee", "burgundy", [1, 2, 2, 2, 1]],
  ["aau-tee", "pink-dark-logo", [2, 3, 1, 1, 0]],
  ["aau-tee", "white-blue-logo", [1, 2, 2, 1, 0]],
  ["act-zip", "gray-burgundy-logo", [0, 1, 1, 1, 0]],
  ["act-zip", "burgundy", [0, 1, 1, 1, 0]],
  ["aau-mascot-hoodie", "college-gray", [0, 1, 2, 2, 0]],
];

/** Every variant gets a row, zeros included, so sizes that weren't ordered
 *  show "0" (sold out) rather than "not counted". */
export const SEED_MOVES: StockMove[] = ORDER.flatMap(([product_id, color_id, qty]) =>
  SIZES.map((size, i) => ({
    id: `opening-${product_id}-${color_id}-${size}`,
    product_id, color_id, size, delta: qty[i],
    reason: "delivery" as const,
    note: "Opening stock: Treasury merch order 2025-26",
    by: "Treasury", at: "2026-10-19T00:00:00.000Z",
  })));

/** "AAU Hoodie · Burgundy · M", or just "Cola" for a plain article. */
export const lineName = (l: Pick<Line, "product_name" | "color_id" | "color_name" | "size">) =>
  l.color_id === STD_COLOR.id ? l.product_name : `${l.product_name} · ${l.color_name} · ${l.size}`;
