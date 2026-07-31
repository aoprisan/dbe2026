# DBE 2026 Night Planner

An unofficial, installable night planner for the 12th edition of
[Dark Bombastic Evening](https://darkbombasticevening.com), held at
Poarta 7 by Ryma — the RYMA spaces in the Alba Iulia citadel, Romania — from
12–15 August 2026.

The festival's own pages —
[darkbombasticevening.com](https://darkbombasticevening.com) and
[Facebook](https://www.facebook.com/profile.php?id=100066546990712) — are linked
from the app's footer, and are the word that outranks anything here.

**[Open the planner](https://aoprisan.github.io/dbe2026/)**

> The running order and set times are provisional until the festival publishes
> an official timetable. This is a fan-made project and is not affiliated with
> Dark Bombastic Evening.

## Features

- A single-stage timeline for all four festival nights
- Device-local picks and must-see acts
- Live “now / next” status and set countdowns
- Search, taste-based discovery, and changeover summaries
- Shareable pick links, QR codes, and crew overlays
- Calendar export and optional local reminders
- One-tap directions to the venue in Google Maps
- Festival-hour weather from Open-Meteo, with a report card that benchmarks
  past forecasts against the real sky and lets today's estimate learn from
  those misses
- The moon phase over each night, computed on the device — no network needed,
  so it still shows when the forecast can't be fetched
- Your own ticket, one tap from the bottom bar — the festival pass or a single
  night, imported from the shop's PDF or a photo, kept on the device, shown full
  screen at the gate, and marked once it becomes a wristband
- A link out to eventbook.ro for anyone who hasn't bought yet; prices and fees
  are the shop's to state, not this app's
- A post-show journal, ratings, statistics, and recap image
- "Ask about the festival" — your question handed to Claude along with a written
  brief of everything the planner knows, or copied for any other assistant
- Links out to the festival's official site and Facebook page
- Offline support and installation as a Progressive Web App
- A build stamp in the footer, with a "force update" button for pulling a newer
  build straight away instead of waiting for the service worker to notice

All personal data stays in the browser. There is no account, backend, or
analytics service.

## Development

Requirements:

- Node.js 20 or newer
- npm

Install dependencies and start the local server:

```bash
npm install
npm run dev
```

Vite serves the project under `/dbe2026/` to match its GitHub Pages path.

Create a production build:

```bash
npm run build
```

The build performs a TypeScript check, generates the PWA icons, and writes the
deployable site to `dist/`.

Preview the production build locally:

```bash
npm run preview
```

## Festival data

The core festival details, nights, and set times live in
[`src/data.ts`](src/data.ts). Band genres, countries, and curated listening links
live in [`src/band-meta.ts`](src/band-meta.ts).

Until the official running order lands, the provisional grid is built from three
known constraints: roughly 50-minute sets, roughly 25-minute changeovers, and a
hard finish between 23:30 and 23:45 — the venue's noise limit with the police.
The slots are laid backwards from that curfew, which puts the first set at 19:00
and the last note at 23:35.

When an official running order is announced:

1. Replace the provisional times in `src/data.ts`.
2. Set `RUNNING_ORDER_ANNOUNCED` to `true`.
3. Update `DATA_VERSION` so returning visitors see the line-up update notice.

Use `null` for an event's `link` or `listen` value when no useful online
destination exists and the app should not generate a search fallback.

## Asking about the festival

People turn up with questions this planner deliberately does not answer — how to
get to Alba Iulia, what an August night inside the citadel is like, whether one
night is worth swapping for another. [`src/ask.ts`](src/ask.ts) hands those to an
assistant without making anyone explain the festival first: it writes out a plain
text brief — dates, venue and how to find it, the curfew, the whole bill with
genres and countries, the official links, and optionally your own picks — puts
the question on top, and offers two ways out.

- **Ask Claude** opens `https://claude.ai/new?q=…` with the prompt in the
  composer. It is a real anchor rather than a scripted `window.open` on purpose:
  that is the only form iOS and Android hand to the installed Claude app, so a
  phone with the app opens the app and everyone else lands on the web. (The
  `claude://` scheme goes to the Code tab and expects a Claude Code account —
  the wrong door for someone asking what to pack.)
- **Copy prompt** puts the same text on the clipboard for any other assistant.
  It also runs behind the Claude button, which covers a blocked tab and a prompt
  over the 5,000-character prefill limit, where the composer opens empty.

The brief is generated from `src/data.ts` and `src/band-meta.ts`, so it stays
correct as the line-up does, and it says in its own first lines that it is
fan-made and that provisional times are estimates. Nothing is sent anywhere by
the app itself: the whole prompt is on screen behind "See exactly what gets
sent", and it only travels when the person taps through to Claude.

## The forecast's report card

A forecast for a festival two weeks out deserves to be asked how it has been
doing. [`src/hindsight.ts`](src/hindsight.ts) asks: it pulls Open-Meteo's
Previous Runs API for the venue, which carries — for each of the last ten
finished days — both what actually happened and what the forecast had said
about that day from the same distance you are reading the festival forecast
from (as many days ahead as the first night still is, capped at seven). Each
day is graded on its daily high, low, and rain-or-no-rain call, and the
weather panel shows the whole ledger in a collapsible section under the
nights.

The current estimate then learns from those mistakes: the mean error on highs
and lows becomes a nudge applied to the temperatures the panel displays.
The nudge is deliberately hard to earn — it needs at least five graded days,
ignores drift under 0.3 °C, and never exceeds ±3 °C — and it is never silent:
adjusted chips carry a `*`, and the report card states in plain words what was
learned and what it changed. Rain is reported but not corrected; a hit rate is
honest, a rescaled millimetre figure would only pretend to be. The report card
is cached like the forecast itself, so the learned correction still applies on
site with no signal.

## Builds and updates

Every build stamps its own timestamp and short commit into the bundle
(`__BUILD_TIME__` / `__BUILD_COMMIT__`, defined in
[`vite.config.ts`](vite.config.ts) and declared in [`src/env.d.ts`](src/env.d.ts)).
The footer shows the timestamp; the commit and the line-up data version sit in
its tooltip. Because the stamp changes on every build, the entry chunk does too,
which is what gives the service worker a new revision to install.

The service worker updates on its own, but a phone can sit on yesterday's copy
until its next cold start. The footer's **force update** button, implemented in
[`src/update.ts`](src/update.ts), settles it on the spot:

- a newer build is on its way in — the page reloads onto it;
- nothing newer — the caches are dropped, the worker unregistered and the page
  reloaded, so the device comes back on a clean copy of the current build (this
  is also how a precache that was half-written on a bad connection is repaired);
- the site is unreachable — nothing is touched and the button says so, because
  clearing an offline-first app's caches with no signal leaves a blank page.

Note that `registration.update()` resolves rather than rejects when its fetch
fails, so "up to date" and "offline" look identical from there. The button
confirms the site is actually reachable with its own cache-busting request
before it throws anything away.

Picks, tickets, journal entries and crew overlays live in `localStorage` and are
untouched by any of this.

## Deployment

Pushes to `main` are built and deployed to GitHub Pages by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

The Vite base path in [`vite.config.ts`](vite.config.ts) must stay aligned with
the repository name.

## License

[GNU Affero General Public License v3.0](LICENSE)
