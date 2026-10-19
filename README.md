# SGA Hub

One place for the SGA board: the till, stock, money, people, meetings and the
coffee kiosk. It is hosted on Vercel, independent of the kiosk, so everything
keeps working when the kiosk's Pi is offline. It is meant to be the single
source of truth for stock and the system, and to be handed down to each new
board without anyone having to rebuild it.

Next.js on Vercel (`fra1`), Neon Postgres, ntfy for alerts, Resend for sign-in
emails.

## What's in it

| Module | Status |
|---|---|
| **Overview**: today's takings, open cash boxes, what's running low, the board | ✅ |
| **Till** (`/pos`): the tablet till, offline-first, cash only | ✅ |
| **Till & merch** (`/merch`): takings, stock on hand, cash boxes, sales CSV | ✅ |
| **People**: every SGA position, who holds it this term, handover | ✅ |
| **Settings**: setup checklist, ntfy topic and test alert, term switch | ✅ |
| Event supplies: snacks, drinks, BBQ stock and a how-much-to-buy planner | planned |
| Finance: one ledger for till, kiosk top-ups, receipts and reimbursements | planned |
| Meetings: voice memo → Gemini → notes in Notion | planned |
| Coffee kiosk: the Pi reports in; status, stock, top-ups | planned |
| Documents: photos and files on Vercel Blob | planned |
| Year-end report (PDF) | planned, contents to be decided |

## Signing in

Everyone on the board has the same access.

- **Board** (`/login`): type your ACT email and get a one-time sign-in link,
  valid for 15 minutes. Anyone listed on **People** for the current term with
  an email can ask for one. The link opens a page with a *Sign in* button
  rather than signing in straight away, because Outlook's link scanner would
  otherwise use up the link before you click it. A device stays signed in for
  30 days.
- **Fallback**: if `HUB_PASSWORD` is set, *Use the shared password* signs in
  without email.
- **First sign-in**: before anyone is on People, the addresses in
  `HUB_BOOTSTRAP_EMAILS` can sign in. Clear it once People is filled in.
- **Till** (`/pos`): its own password, `POS_PASSWORD`, because volunteers who
  aren't on the board sell too. It works the way the old merch till did: the
  first unlock needs internet, then it also works offline for 12 hours.

## The till

It's the SGA merch POS moved in, with three additions:

- **Any article.** *+ New product* → *Colours & sizes* (hoodies, tees) or
  *Plain article* (a tote, a sticker, a can of cola), which the till adds in
  one tap.
- **Categories** (Merch, Snacks, Drinks…) group the sell screen.
- **Low-stock mark per product.** By default a sized item warns when a size
  sells out (merch comes in ones and twos per size), and a plain article warns
  at 3 left.

Everything else is unchanged: cash box counted note by note, change shown as
notes and coins, voids that put stock back, shift close with over/short,
stats, CSV. Stock is a ledger, so two tablets selling offline merge cleanly.
See the comments in `lib/merge.ts`.

**Install it on the tablet**: open `/pos` and use *Add to Home Screen*. It
opens full-screen at the till and keeps working with no signal.

## Alerts

All alerts go to one ntfy topic (`NTFY_TOPIC`). Everyone on the board
installs the ntfy app and subscribes to it. *Settings → Send a test alert*
checks it works. So far the hub sends:

- **Merch running low** and **sold out**, after a tablet syncs. Each size
  alerts once per level, and a delivery re-arms it. The first check after
  going live only records a baseline, so nobody gets paged about sizes that
  were never ordered.

Kiosk alerts join once the kiosk is connected.

## Setup (Vercel)

1. New Vercel project from this repo. The region is pinned to `fra1` in
   `vercel.json`.
2. **Database**: connect the **same Neon database the merch till used**
   (Storage → Neon, or copy its `DATABASE_URL`). The till's table
   (`merch_rows`) is reused as is, so every sale, shift and stock move carries
   over. The hub's own tables (`hub_*`) are created on first use.
3. Environment variables, listed in `.env.example`. *Settings* in the hub
   shows which are missing; values never leave Vercel.
4. **Resend**: create the account with the SGA mailbox, verify a sending
   domain, and set `RESEND_API_KEY` and `HUB_EMAIL_FROM`. Without a verified
   domain, Resend only delivers to the account's own address. Until then, the
   shared password works.
5. Sign in with a bootstrap email or the shared password, go to **People**,
   then *Paste a list*.
6. Switch the merch tablets to the new address (`/pos`), and retire the old
   merch till's Vercel project once they've synced.

Every push to `main` deploys on Vercel. CI (`.github/workflows/ci.yml`) runs
the typecheck and build on every push and PR.

## Handing over to the next board

1. On **People**, pick the new term and add the new board (or *Paste a list*:
   `Role | Name | email | Notion user ID`).
2. **Settings → Handover → Switch term.** From then on only the new board can
   sign in; last year's stays on record under its own term.
3. Rotate `POS_PASSWORD`, `HUB_PASSWORD` and, if anyone leaving knew it, the
   ntfy topic. Update the SGA password manager.
4. Make sure the Vercel, Neon, Resend and GitHub accounts are owned by the SGA
   mailbox, not a person.

Names and emails live in the database, never in this repo.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in at least HUB_SECRET and POS_PASSWORD
npm run dev
npm run typecheck
```

`NEON_FETCH_ENDPOINT` points the Neon driver at a local Neon-compatible HTTP
endpoint, so you can run against a local Postgres. Without a database the till
still sells offline, and the hub pages say the database is missing.

## Files

- `app/(hub)/`: board pages (overview, merch, people, settings), behind `requireBoard()`
- `app/pos/`: the till · `components/`: its screens (`Sell`, `Stock`, `CashBox`, `Stats`)
- `app/api/auth/*`: sign-in links, fallback password · `app/api/pos/*`: till login and sync
- `lib/auth.ts`: board sessions and sign-in tokens · `lib/session.ts`: the till's session
- `lib/db.ts`: schema and settings · `lib/roles.ts`: the SGA positions
- `lib/calc.ts`, `lib/merge.ts`, `lib/local.ts`: the till's maths, merge rules and offline copy
- `lib/merch.ts`, `lib/stock-alerts.ts`: what the hub reads from the till, and the ntfy alerts
- `lib/notify.ts`: Resend and ntfy · `lib/time.ts`: Athens days and times
