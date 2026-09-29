# B&B Park — website, reservations & table ordering

A premium, mobile-first website for **B&B Park**, restaurant in Kénitra (Morocco), with:

- online **table reservations** from any phone (no account, no QR code);
- **at-the-restaurant ordering**: scan the table's QR code or type the table number;
- a protected **staff dashboard** for reservations, orders, tables & QR codes, menu, opening hours and booking rules.

React + Tailwind CSS + GSAP on the front, a small Fastify + SQLite server behind it. Everything runs as **one
Node.js process** with its data in **one folder** — easy to host and to back up.

> [!IMPORTANT]
> **This is a preview.** The official site bandbpark.ma could not be opened from the build environment, so the
> restaurant details come from B&B Park's pages as indexed by search engines and from its Facebook page. Nothing was
> invented: unknown details are left out, and each known one is annotated with its source in
> [`content/restaurant.ts`](content/restaurant.ts). **The menu is a sample** (clearly labelled as such on the site).
> Work through [Before launch](#before-launch--details-to-confirm) with the restaurant, then switch `status` to `'live'`.

---

## Contents

1. [What's included](#whats-included)
2. [Before launch — details to confirm](#before-launch--details-to-confirm)
3. [Quick start (on your computer)](#quick-start-on-your-computer)
4. [Editing the content](#editing-the-content)
5. [How the customer flows work](#how-the-customer-flows-work)
6. [Staff dashboard](#staff-dashboard)
7. [Deploying](#deploying)
8. [Configuration (environment variables)](#configuration-environment-variables)
9. [Backups, updates and maintenance commands](#backups-updates-and-maintenance-commands)
10. [Notifications and integrations](#notifications-and-integrations)
11. [Privacy and security](#privacy-and-security)
12. [Tests](#tests)
13. [Project structure](#project-structure)
14. [Troubleshooting](#troubleshooting)

---

## What's included

| Area | Highlights |
| --- | --- |
| **Public website** (`/`) | Cinematic hero with **Reserve a table** / **View menu**, interactive menu (categories, search, dietary & allergen filters, dish details with options, photos and prices), the restaurant's story, chef's specials, photo gallery, opening hours with live "open now" status, address, directions, phone, social links. A **reservation bar stays at the bottom of the screen** on phones. French by default, English with one tap (remembered). |
| **Animations** | GSAP ScrollTrigger: subtle hero parallax, scroll-triggered section reveals, staggered menu cards. Only `transform`/`opacity` are animated, scrolling stays native, and everything is shown instantly when the visitor's device asks for **reduced motion**. |
| **Reserve from a phone** (`/reservation`) | Name, phone, optional e-mail, date, **only the times actually available**, number of guests, optional requests. No account, no QR code, no table number. See [below](#1-reserve-from-a-phone--no-qr-code-needed). |
| **At the restaurant** (`/table`, `/t/<code>`) | "I'm at the restaurant": **scan a QR code** or **enter the table number**. A table's QR code opens the menu with "Table 8" to confirm or change. |
| **Dine-in ordering** (`/order`) | Filters, dish details and options, cart with quantities and preparation notes, total before sending, one order per tap (no duplicates), confirmation only once the server has accepted it, live order status. **No online payment.** |
| **Staff dashboard** (`/staff`) | Reservation requests (confirm / decline / cancel / seated / no-show, assign tables), live orders with sound, order status, tables and printable QR codes, menu editor (prices, photos, sold out), opening hours, closures, booking capacity and time slots, team accounts. |
| **Quality** | Lighthouse (mobile emulation): accessibility 100 and best practices 100 on the guest pages, SEO 100 on the pages meant for search engines, no layout shift; server-side validation, protected staff access, private customer data; unit, API and browser tests. |

## Before launch — details to confirm

All of these live in **one file**, [`content/restaurant.ts`](content/restaurant.ts), unless marked *dashboard*.

| # | Detail | What the preview uses | Source |
| --- | --- | --- | --- |
| 1 | **Menu, prices, dish photos** | A **sample menu** (5 categories, 19 dishes) labelled "Menu d'exemple" on the site | none — *replace in dashboard → Carte*, then **Supprimer le menu d'exemple** |
| 2 | **Opening hours** | 12:00–23:00, **closed on Fridays** | Tripadvisor photo caption ("de Midi à 23H ! Fermé tous les Vendredi"); other listings say until midnight — *dashboard → Réglages → Horaires d'ouverture* |
| 3 | **Logo** | Typographic "B&B PARK" wordmark | none — add the file under `public/brand/` and set `logo` |
| 4 | **Photos** (hero, story, gallery, link preview) | Elegant illustrated placeholders — never stock photos | none — see [Photos](#photos) |
| 5 | Phone | 05 37 37 06 24 (`+212537370624`) | B&B Park Facebook posts |
| 6 | Address | 52, Avenue Hassan II, Résidence Zazia, 14000 Kénitra | Facebook — confirm exact spelling |
| 7 | Landmark line | "Près de la gare de Kénitra, face au Petit Jardin, à proximité de la wilaya" | Facebook description |
| 8 | Directions link | A Google Maps **search** for the address | replace `mapsUrl` with the restaurant's Google Maps share link (optionally `mapEmbedUrl`) |
| 9 | E-mail | **Hidden** (`null`) | `contact@bandbpark.ma` appears only in a search summary — confirm before showing |
| 10 | WhatsApp number | Hidden | provide if guests should use WhatsApp |
| 11 | Story text | Paraphrase of the "Notre Histoire" page (open since 2010, fish & seafood, Moroccan tradition with a modern touch) | bandbpark.ma via search index — confirm wording |
| 12 | Instagram / Facebook | `bandb.park.kenitra` | search results |
| 13 | Chef's name and photo | Hidden (unknown) | provide if wanted |
| 14 | Booking rules | Staff approval required; 90-minute tables; up to 16 guests arriving per half-hour and 40 seated at once; groups up to 12; bookable 1 hour to 60 days ahead | defaults — *dashboard → Réglages* |
| 15 | Tables | Sample tables 1–12 if you loaded the sample data | *dashboard → Tables & QR* |

When everything is confirmed: set `status: 'live'` in `content/restaurant.ts` (this removes the preview banner) and redeploy.

## Quick start (on your computer)

Requirements: **Node.js 22.9 or newer** (22 LTS recommended) and npm.

```bash
npm install
npm run seed:demo      # optional — sample menu + 12 tables, to try every flow
npm run create-admin   # your staff account (asks for e-mail, name and a password of 10+ characters)
npm run dev
```

- Website: <http://localhost:5173>
- Staff dashboard: <http://localhost:5173/staff>

`npm run dev` starts the website (Vite, with instant reload) and the API server (port 3000) together. Data is
stored in `./data/` (SQLite database + uploaded dish photos).

**Try it on a real phone** (same Wi-Fi as your computer):

```bash
npm run build
PUBLIC_URL=http://192.168.1.20:3000 COOKIE_SECURE=false npm start   # your computer's local IP address
```

(`npm start` runs in production mode, which expects HTTPS; `COOKIE_SECURE=false` allows this plain-HTTP test —
never use it on the real site.)

Open `http://192.168.1.20:3000` on the phone, print or display the QR codes from *Tables & QR*, and scan them with
the phone's camera app. (The **in-site** scanner needs HTTPS, so on plain HTTP it falls back to typing the table
number — the camera app works either way.)

## Editing the content

| What | Where |
| --- | --- |
| Name, tagline, story, contact, address, social links, SEO texts, payment note | [`content/restaurant.ts`](content/restaurant.ts) — every text is `{ fr: '…', en: '…' }`; set a field to `null` to hide it |
| Hero, story and gallery photos, link-preview image | [`content/photos/`](content/photos/README.md) + file names in `content/restaurant.ts` |
| Menu, prices, dish photos, options (sides, cooking…), dietary labels, sold out, chef's specials | Staff dashboard → **Carte** (no code) |
| Opening hours, exceptional closures, booking capacity and slots, ordering on/off | Staff dashboard → **Réglages** (no code) |
| Tables and QR codes | Staff dashboard → **Tables & QR** (no code) |
| Interface wording | `src/i18n/fr.ts`, `src/i18n/en.ts` (public), `src/staff/strings.ts` (dashboard) |
| Colours and fonts | `src/styles/app.css` (`@theme` tokens) |

Changes made in the dashboard are live immediately. Changes to files need a rebuild and redeploy
(`npm run build` then restart, or `docker compose up -d --build`).

### Photos

Drop the restaurant's own photos (JPEG/PNG/WebP/AVIF, ideally 2400 px wide for the hero) into `content/photos/` and
reference them by file name in `content/restaurant.ts`:

```ts
hero: { …, photo: 'salle.jpg' },
story: { …, photo: 'cuisine.jpg' },
gallery: [{ photo: 'plateau-fruits-de-mer.jpg', alt: { fr: 'Plateau de fruits de mer', en: 'Seafood platter' } }],
seo: { …, shareImage: 'salle.jpg' },
```

The build (`npm run photos`, run automatically by `npm run dev` and `npm run build`) generates responsive AVIF, WebP
and JPEG versions. Dish photos are uploaded from the dashboard; they are resized and stripped of camera metadata
(including GPS) automatically.

## How the customer flows work

### 1. Reserve from a phone — no QR code needed

1. The guest taps **Réserver une table** (hero, header, or the bar at the bottom of the screen) → `/reservation`.
2. They pick a date (past dates, closed days and full days cannot be chosen), then one of the **available** times for
   their party size, and fill in name, phone, and optionally e-mail and requests. Everything is validated in the
   browser **and again on the server**, which re-checks capacity at the moment of booking.
3. What the guest sees depends on the booking system's answer — never on a guess:
   - staff approval required (default): **"Demande de réservation reçue — en attente de confirmation"**;
   - automatic confirmation (if you turn approval off in *Réglages*) and there is room: **"Réservation confirmée"**
     — except for a request that repeats a booking, or comes from a number already holding three, which waits for
     staff (see [Privacy and security](#privacy-and-security)).
4. The guest gets a private status link (`/reservation/<token>`, also useful to cancel). The page updates by itself
   when the restaurant confirms or declines.
5. Staff assign the table in the dashboard; the guest never has to choose one.

If the server cannot be reached, the guest sees an error and **no confirmation**; a banner says the booking system
is unavailable.

### 2. At the restaurant — scan or enter the table number

`/table` — *"Vous êtes au restaurant ?"*, reached from the navigation (*Au restaurant ?*), the home page's *"Déjà à
table ?"* section and the QR icon of the bottom bar — offers two choices:

- **Scanner le QR code de ma table** — the in-site scanner asks for camera permission **only after this tap**. Guests
  can also simply use their phone's camera app on the printed code.
- **Saisir le numéro de table** — types the number shown on the table (works everywhere, always available).

| QR code | Link | What happens |
| --- | --- | --- |
| **Table QR code** (one per table) | `https://…/t/<code>` | Opens the menu with **"Table 8"**; the guest confirms, or changes it |
| **General QR code** (entrance, flyers) | `https://…/table?src=qr` | Asks the guest to enter their table number |
| Unknown or replaced code | `https://…/t/<old>` | Explains it, and asks for the table number |

A table code is not a password: guests may also simply type the table number, so the site can't prove that
someone ordering is really sitting at that table. Staff see every order with its table number before anything is
served, can cancel a prank order in one tap, and can pause ordering or limit it to opening hours (*Réglages*).
**Générer un nouveau QR code** retires a code (e.g. a damaged or misplaced sticker). QR codes that point to another
website are refused by the in-site scanner.

Anyone can browse the menu without a table; a valid, active table is only required to **send an order**.

### 3. Dine-in ordering

Browse and filter the menu → open a dish for details and options → add to the cart → change quantities and add
notes (per dish and for the whole order) → review the total → **Envoyer la commande**. The button locks while sending
and each order carries a unique key, so repeated taps or a flaky connection can't create duplicates. The
confirmation appears only once the server has accepted the order; the guest then follows its status (*reçue →
en préparation → prête → servie*) live. Prices are always recalculated by the server; if a dish has sold out or a
price has changed in the meantime, the server refuses the order, nothing reaches the kitchen, and the guest sees what
changed. No payment is taken online — `paymentNote` in `content/restaurant.ts` says so in the cart and on the order
status page.

## Staff dashboard

Open `/staff` and sign in. Two roles:

| | **Administrateur** | **Équipe** (waiter, host, kitchen) |
| --- | --- | --- |
| Reservations: view, confirm, decline, cancel, seat, add phone bookings, assign tables | ✅ | ✅ |
| Orders: view live, change status | ✅ | ✅ |
| Mark a dish sold out / available again; pause dine-in ordering | ✅ | ✅ |
| Menu: dishes, prices, photos, options, categories | ✅ | — |
| Tables & QR codes | ✅ | — |
| Opening hours, closures, booking rules and capacity | ✅ | — |
| Team accounts | ✅ | — |

- **Live**: new reservations and orders appear instantly (with a sound you can switch on), without reloading.
  A tablet left open on *Commandes* works as a simple kitchen screen.
- **Reservations**: pending requests are counted in the menu; assigning a table warns about overlapping bookings;
  one-tap **call** and **WhatsApp** buttons to reach the guest (WhatsApp opens with a confirmation or decline message
  already written in the guest's language).
- **Tables & QR**: download each code as PNG or SVG, or print an A4 sheet of table cards (each with the table
  number and the typed-in fallback).
- **Réglages**: weekly hours (several services per day possible), exceptional closures/hours, whether requests
  need approval, slot interval, table duration, notice and booking window, maximum party size, pacing (guests
  arriving per slot) and capacity (guests seated at once), and whether guests can order at the table.

## Deploying

What you need: a small Linux server (VPS) or any host that runs Docker **with a persistent disk**, a domain name, and
**HTTPS** (required by the in-site camera scanner and for secure staff sessions). Because it stores data in SQLite,
run **one** instance — it comfortably handles a restaurant's traffic. Serverless platforms (Vercel functions,
Netlify…) are not suitable.

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env          # set PUBLIC_URL, ADMIN_EMAIL, ADMIN_PASSWORD (see below)
docker compose up -d --build
docker compose exec restaurant node dist/server/cli.js seed --demo   # optional sample data
```

The app listens on `127.0.0.1:3000`; put an HTTPS reverse proxy in front. With [Caddy](https://caddyserver.com/)
(automatic certificates), the whole configuration is:

```caddyfile
bandbpark.ma, www.bandbpark.ma {
  reverse_proxy 127.0.0.1:3000
}
```

…and add `TRUST_PROXY=1` to `.env` (the number of proxies in front of the app: 2 if Cloudflare also sits in front). With nginx, use `proxy_pass http://127.0.0.1:3000;` plus the usual
`X-Forwarded-*` headers (the live dashboard stream already disables nginx buffering).

### Option B — Node.js directly

```bash
npm ci
npm run build
cp .env.example .env   # and edit it
npm start              # reads .env; keep it running with systemd, pm2, etc.
```

Only `dist/`, `node_modules/` (production dependencies) and `package.json` are needed at run time. The database is
created and migrated automatically on start-up.

### After the first deployment

1. Sign in at `https://<your-domain>/staff` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (then you may remove the password
   from `.env`), and create accounts for the team in *Équipe*.
2. Enter the real menu, hours and tables; remove the sample menu.
3. **Check that `PUBLIC_URL` is right, then print the QR codes** (*Tables & QR → Imprimer les QR codes*).
4. Point the Google Business Profile "Réserver" link and Instagram/Facebook bio to `https://<your-domain>/reservation`.

## Configuration (environment variables)

All optional. Copy [`.env.example`](.env.example) to `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_URL` | — | Public address, e.g. `https://www.bandbpark.ma`. Used in QR codes, links and SEO. **Set before printing QR codes.** |
| `DATA_DIR` | `./data` | Database, uploaded photos, backups |
| `DATABASE_PATH` | `$DATA_DIR/restaurant.db` | Override the database file |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Where the server listens |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | — | Creates the first administrator when no staff account exists |
| `TRUST_PROXY` | off | Behind a reverse proxy: the **number** of proxies (usually `1`) or their IP addresses. `true` is refused: it would let visitors fake their address and slip past the rate limits |
| `COOKIE_SECURE` | `auto` | `auto` = HTTPS-only cookies, HSTS and HTTPS upgrades in production (the default for `npm start` and Docker) or when `PUBLIC_URL` is https. `false` only for testing over plain HTTP |
| `SESSION_TTL_HOURS` | `168` | Staff sessions expire after 7 days |
| `NOTIFY_WEBHOOK_URL` | — | See [Notifications](#notifications-and-integrations) |
| `RETENTION_DAYS` | `0` (never) | Erase guests' names, phones, e-mails and notes from reservations older than N days |
| `RATE_LIMIT` | `true` | Limits abuse of the public forms and the login |
| `LOG_LEVEL` | `info` | `fatal` … `trace`, or `silent` |

## Backups, updates and maintenance commands

Everything lives in the data folder (`./data`, or the `restaurant-data` Docker volume): the database
(`restaurant.db`) and dish photos (`uploads/`).

```bash
# Docker
docker compose exec restaurant node dist/server/cli.js backup           # consistent copy, safe while running
docker compose cp restaurant:/app/data/backups ./backups                 # copy backups off the container
docker compose cp restaurant:/app/data/uploads ./backups/uploads

# Without Docker
node --env-file=.env dist/server/cli.js backup                           # → data/backups/restaurant-<date>.db
```

Keep backups somewhere else (another machine or cloud storage). They contain guests' personal data — store them
securely. **Restore**: stop the app, replace `restaurant.db` with the backup (delete any `restaurant.db-wal` /
`-shm` next to it), start again.

**Update** to a new version: `git pull && docker compose up -d --build` (or `npm ci && npm run build` and restart).
Database migrations run automatically.

| Command (`node dist/server/cli.js …` in production, `npm run cli -- …` in development) | |
| --- | --- |
| `create-admin [--email … --name … --password …]` | Create an administrator (asks interactively if flags are omitted) |
| `reset-password --email …` | Set a new password (signs that person out everywhere) |
| `seed --demo` | Load the sample menu and 12 sample tables |
| `remove-demo-menu` | Delete the sample menu (also a button in the dashboard) |
| `purge --days N` | Erase personal data from reservations older than N days |
| `backup [--out file]` | Consistent copy of the database |

## Notifications and integrations

**Built in** — the staff dashboard updates live (Server-Sent Events, with automatic fallback to polling) and can
chime for new orders and reservations.

**Webhook** — set `NOTIFY_WEBHOOK_URL` and the server POSTs a small JSON message for each event. Connect it to Make,
Zapier, n8n or a chat tool to alert the team's phones:

```json
{ "type": "reservation.created",
  "data": { "reference": "R-7K3P9Q", "status": "pending", "date": "2026-10-10", "time": "20:30", "partySize": 4, "source": "web" },
  "sentAt": "2026-10-08T14:03:11.000Z" }
```

Events: `reservation.created`, `reservation.updated` (status changes), `reservation.cancelled_by_guest`,
`order.created` (`reference`, `tableNumber`, `totalCents`, `items`). **No names, phone numbers or e-mails are
sent**: staff open the dashboard for details.

**Not built in** (each needs an account with an outside provider — ask if you want one added):

- **SMS / WhatsApp / e-mail messages sent automatically to guests.** Guests always get their status link on screen;
  staff can message them in one tap from the dashboard (WhatsApp with a pre-filled text, or a call).
- **Online payment** — not enabled; the bill is settled at the restaurant. (A Moroccan payment provider such as CMI
  would be needed.)
- **Till (POS) or kitchen printer** — orders appear in the dashboard; no printer integration.

## Privacy and security

- Guests' details (phone, e-mail, notes) are visible **only to signed-in staff**. Public pages and status links
  never show them. Status links use long random tokens; the database keeps only fingerprints, so even a copy of it
  can't be used to rebuild them, and they are masked in the server logs.
- Staff passwords are hashed with scrypt; sessions are stored server-side; the cookie is `HttpOnly`,
  `SameSite=Strict` and `Secure`; state-changing requests must come from the site itself (CSRF protection);
  administrator-only actions are enforced by the server. Failed sign-ins are throttled per address, so nobody can
  lock a colleague out; changing your password signs out your other devices.
- Every submission is validated on the server (the browser checks are only for convenience); the public forms are
  rate-limited, and one connection can send at most 20 reservation requests a day.
- The booking form never reveals whether a phone number already has a reservation, and can't be used to block
  someone: a request that repeats a booking, or comes from a number holding several, is accepted but always waits
  for staff, who see it flagged (*"Doublon possible"*, *"Même numéro : 3 autres réservations"*) with a link to all
  that number's bookings.
- Strict security headers (Content-Security-Policy, HSTS, no framing, camera allowed only for this site).
- No third-party trackers, fonts or scripts are loaded. Guests get no cookies (their language, cart and table are
  kept on their own phone). The QR scanner decodes the camera image **on the phone** — nothing is uploaded.
- Old personal data can be erased automatically with `RETENTION_DAYS` (e.g. 180).

## Tests

```bash
npm run typecheck
npm test              # unit + API tests (availability, time zones, pricing, reservations, orders, staff rules)
npx playwright install chromium   # first time only
npm run test:e2e      # browser tests on phone and desktop sizes
```

The browser tests build the site, start it with a fresh database, and check:

- **reservation from a phone**: "awaiting confirmation" until staff confirm, "Reservation confirmed" only when the
  system confirms, repeated taps create one reservation, cancellation from the status link;
- **table-specific QR code**: "Table 8" shown, confirm or change, order sent with the right table; unknown and
  general QR codes ask for the number; the **in-site scanner with a simulated camera**, which requests the camera
  only after the tap and refuses other websites' codes;
- **manual table entry** and ordering;
- **staff dashboard**: login protection, confirming reservations and assigning tables, live orders, sold-out dishes,
  QR codes that encode the right link, booking settings;
- the public site: navigation, filters, dish details, language switch, animations, reduced motion, and **no
  sideways scrolling on phones**.

## Project structure

```text
content/            ← the restaurant's texts, contact details and photos (edit here)
src/                   React website
  site/                public pages and sections (hero, story, specials, gallery, visit…)
  menu/                interactive menu, filters, dish details
  reserve/             reservation form and status page
  dinein/              at-the-restaurant flow: table entry, QR scanner, ordering, order status
  staff/               staff dashboard
  i18n/                French and English texts
server/                Fastify API: routes, services (reservations, orders, auth), SQLite, CLI
shared/                code used by both sides: validation, availability, pricing, time zones
tests/                 unit, API (tests/api) and browser tests (tests/e2e)
scripts/               photo optimisation, compression, server bundling
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Staff sign-in doesn't stick | Production mode requires HTTPS. For a quick test over plain HTTP set `COOKIE_SECURE=false` (never on the real site). |
| QR codes open the wrong address | Set `PUBLIC_URL`, restart, then download/print the QR codes again. A warning appears in *Tables & QR* while it's missing. |
| The in-site scanner doesn't open the camera | It needs HTTPS and the guest's permission; entering the table number always works, as does the phone's camera app. |
| Dashboard doesn't update live | Check that your proxy doesn't buffer `/api/staff/events`; meanwhile the dashboard still refreshes every 15–30 seconds. |
| "No staff account exists yet" in the logs | Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` or run the `create-admin` command. |
| Forgot a password | `reset-password --email …` (see [commands](#backups-updates-and-maintenance-commands)). |
