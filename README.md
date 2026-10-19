# SGA Merch POS

A tablet till for SGA merch sales (cash only): tap a product, its colour and its
size, take the cash, and the app keeps the cash box, the stock and the stats for you.
Same stack and feel as the SGA Coffee POS: Next.js on Vercel, Neon Postgres,
and an offline-first copy on the tablet, behind one shared password.

## How a sale day goes

1. **Unlock** with the till password (`POS_PASSWORD`). The first unlock on a
   tablet needs internet; after that it also works offline for 12 h.
2. **Seller name.** Every sale carries it. Tap *Selling: …* to hand over.
3. **Open the cash box.** Count the float note by note.
4. **Sell.** Tap a product → colour → size; it lands in the cart. Every button
   shows how many are left. Tap **Charge**, then tap what they handed you
   (Exact, €20, €50, … or type it) and the screen shows the change to give
   back, note by note.
5. **The cash box** card (right side) always shows what should be in the box:
   float + sales ± money paid in or out. Tap it to log a pay-out (supplier,
   cash handed to the Treasurer) or pay-in (extra change).
6. **Sales** (top bar) lists the shift's sales. **Void** a mistake: the items go
   back into stock and the sale stays on record as voided.
7. **Close shift** (inside Cash box). Recount the box; it shows expected vs
   counted and by how much you're over or short.
8. **Stats** → **Export CSV** for the Treasurer's cash book.

## Stock and catalogue

**Stock** shows each product as a colour × size grid of what's on hand.

- **+ Delivery** when a batch arrives (type how many of each).
- **Recount** to set what's actually on the table; the difference is logged.
- Damaged / Giveaway write items off without money.
- A dash (—) means nobody has counted that variant yet. It can still be sold.
- Selling something at 0 asks for a second tap, so a wrong count never blocks a sale.
- **Edit** a product to change its price, colours (presets or any custom
  colour) and sizes, or hide it from the till. Past sales keep the price they
  were sold at.

The first run seeds a starter catalogue (zip-up, hoodie, crewneck, tee, tote,
cap). **The prices are placeholders: set the real ones before the first sale.**

## Stats

Revenue, items, sales and average for this shift, today, 7 days or all time;
units or € by product, colour, size, top product·colour·size combinations,
seller and hour of day; plus a running-low list.

## More than one tablet

Every tablet writes to its own IndexedDB first and syncs with Neon in the
background (badge in the top bar). Each tablet has its own cash box and shift.
Stock, catalogue edits and stats are shared: a delivery logged on one tablet
and a hoodie sold on another both show up everywhere after the next sync.

Stock is a ledger (deliveries, recounts and write-offs, minus sales), not a
number that gets overwritten, so two tablets selling offline at the same time
merge cleanly. Catalogue edits: last edit wins. Voids and closed shifts stick.

## Setup (Vercel)

- New Vercel project from this repo. Region is pinned to `fra1` in `vercel.json`.
- Storage → add **Neon** (Marketplace). This sets `DATABASE_URL`. The one table
  (`merch_rows`) is created on first use.
- Env var `POS_PASSWORD`: the till password, shared with whoever sells.
- Open it on the tablet and use *Add to Home Screen*. It runs full-screen and
  keeps working with no signal.

## Local

```bash
npm install
POS_PASSWORD=test npm run dev   # sync shows "failed" without DATABASE_URL; selling, stock and stats still work
npm run typecheck
```

`NEON_FETCH_ENDPOINT` (dev only) points the Neon driver at a local
Neon-compatible HTTP endpoint instead of the real Neon.

## Files

- `app/page.tsx`: the shell, sync loop and every write
- `components/Sell.tsx`: product grid, colour/size picker, cart, checkout, sales list
- `components/CashBox.tsx`: float count, box equation, pay in/out, close shift
- `components/Stock.tsx`: stock grid, deliveries/recounts, product editor
- `components/Stats.tsx`: the numbers and CSV export
- `lib/local.ts`: IndexedDB copy and outbox · `lib/merge.ts`: how copies combine, and input checks
- `lib/calc.ts`: stock levels, box totals, change, stats · `app/api/sync`: push/pull
