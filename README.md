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

- A "How this planner works" panel — the whole app in one minute, opened once on
  a first visit and afterwards from the `?` in the header
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
- Sunset and the moon phase over each night, computed on the device — no network
  needed, so they still show when the forecast can't be fetched
- The partial solar eclipse that takes the sun down over the opening ceremony on
  12 August 2026, found by the same maths rather than written in by hand
- Your own ticket, one tap from the bottom bar — the festival pass or a single
  night, imported from the shop's PDF or a photo, kept on the device, shown full
  screen at the gate, and marked once it becomes a wristband
- A link out to eventbook.ro for anyone who hasn't bought yet; prices and fees
  are the shop's to state, not this app's
- A post-show journal, ratings, statistics, and recap image
- "Ask about the festival" — your question handed to Claude or ChatGPT along with
  a written brief of everything the planner knows, or copied for any other
  assistant
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

Until the official running order lands, the provisional grid is pinned at both
ends and filled in between. The poster's "starting at 6 PM" is taken as the
first downbeat rather than as a gate an hour ahead of it, so the opening set is
at 18:00; the last note is at 23:35, inside the 23:30–23:45 finish the venue has
agreed with the police. Four bands across those 5h35m, with the ~25-minute
changeovers a single stage needs, works out at 65-minute sets and a 90-minute
cadence: 18:00, 19:30, 21:00, 22:30.

The Opening Ceremony is not on that grid. It is one staged piece rather than a
bill of bands, and it stays at 21:00 — after dark, which is what a masked and
lit HAMLET wants, and which leaves the eclipsed sunset in the empty hour before
it.

When an official running order is announced:

1. Replace the provisional times in `src/data.ts`.
2. Set `RUNNING_ORDER_ANNOUNCED` to `true`.
3. Update `DATA_VERSION` so returning visitors see the line-up update notice.

Use `null` for an event's `link` or `listen` value when no useful online
destination exists and the app should not generate a search fallback.

## The usage guide

Everything in this app is built for the fourth night: the tools fold away behind
one strip, the ticket and the journal are icons in the bottom bar, and the
must-see star only exists once a set is picked. That is the wrong shape for the
first minute, so [`src/guide.ts`](src/guide.ts) walks the app once, in the order
a person meets it — the nights, a pick, the strip of tools, the bar at the
bottom, then installing, offline and where the data lives.

It opens by itself on every start until someone ticks **Don't show this again on
start** at its foot. A planner is opened a handful of times a year — once when
the bill lands, again the week of the festival — so being shown it once is not
the same as having learnt it, and the panel keeps offering itself until it is
told not to. The tick is written through the moment it is made, so a panel
swiped away or a tab killed mid-read still keeps the answer; unticking it in a
later visit brings the panel back on launch. Either way it is always the `?` in
the header and **❔ How this works** in ⚙ Options.

The panel is written against the real UI, so a section that stops being true is
a section to change: the copy names the actual buttons, and the numbers in it
(the band-night count, doors, the curfew window) are read from `src/data.ts`.
While the running order is provisional it also carries that caveat at the foot,
under the same warning rule the rest of the app uses.

## Asking about the festival

People turn up with questions this planner deliberately does not answer — how to
get to Alba Iulia, what an August night inside the citadel is like, whether one
night is worth swapping for another. [`src/ask.ts`](src/ask.ts) hands those to an
assistant without making anyone explain the festival first: it writes out a plain
text brief — dates, venue and how to find it, the curfew, the whole bill with
genres and countries, sunset and the moon over each night, the eclipse on the
opening one, the official links, and optionally your own picks — puts the
question on top, and offers three ways out.

- **Ask Claude** opens `https://claude.ai/new?q=…` with the prompt in the
  composer. It is a real anchor rather than a scripted `window.open` on purpose:
  that is the only form iOS and Android hand to the installed Claude app, so a
  phone with the app opens the app and everyone else lands on the web. (The
  `claude://` scheme goes to the Code tab and expects a Claude Code account —
  the wrong door for someone asking what to pack.)
- **Ask ChatGPT** does the same through `https://chatgpt.com/?q=…`, which the
  ChatGPT mobile apps claim as a universal link. `chat.openai.com` only
  redirects there, which would cost a hop and, on some Android versions, the
  hand-off to the app; and `chatgpt://` fails outright for anyone without the
  app instead of falling back to the site.
- **Copy prompt** puts the same text on the clipboard for any other assistant.
  It also runs behind both assistant buttons, which covers a blocked tab and a
  prompt over the 5,000-character prefill ceiling, where the composer opens
  empty. Claude documents that limit; ChatGPT does not, so it shares the same
  conservative number rather than an invented one.

The brief is generated from `src/data.ts` and `src/band-meta.ts`, so it stays
correct as the line-up does, and it says in its own first lines that it is
fan-made and that provisional times are estimates. Nothing is sent anywhere by
the app itself: the whole prompt is on screen behind "See exactly what gets
sent", and it only travels when the person taps through to an assistant.

## The sky over the citadel

The music starts at 18:00 and the sun does not leave a mid-August evening in Alba Iulia
until well past 20:30, so the first stretch of every night happens in daylight.
[`src/sun.ts`](src/sun.ts) says when that ends, [`src/moon.ts`](src/moon.ts) says
what replaces it, and [`src/astro.ts`](src/astro.ts) holds the spherical
astronomy all of it shares. Everything is Meeus, *Astronomical Algorithms*
(2nd ed.), and everything runs on the device: the sky is the one part of this
planner that still works with no signal inside a fortress.

Sunset uses the definition every almanac prints — the centre of the disc 0°50′
below the true horizon, covering both the sun's own radius and average
refraction — so the number matches whatever weather app is in someone's other
hand. It is a flat-horizon figure; the citadel walls will take the sun a few
minutes earlier, and the tooltip says so.

### The eclipse on the opening night

On 12 August 2026 there is a total solar eclipse over the North Atlantic,
Greenland, Iceland and northern Spain. Alba Iulia is nowhere near the path of
totality and the sun sets there long before the deep phase — but the opening
ceremony still gets the striking half of that trade, because the sun goes down
*already bitten into*, low over the western wall, in the empty hour before the
first performance.

[`src/eclipse.ts`](src/eclipse.ts) works this out rather than storing it. It asks
the same question of all four nights — is the moon in front of the sun here, and
is the sun still up — gated on the moon being near new, then bisects the contact
times out of the same ephemeris the sunset and the phase come from. Point the app
at another edition and the eclipse either moves or stops being mentioned, with no
date edited into a string. Both bodies are converted to topocentric coordinates
first: from the surface the moon sits up to a degree from its geocentric place,
several times the entire depth of this partial phase.

From the venue that works out as first contact at 20:24 local with the sun 1.6°
up, sunset at 20:39 with the sun still eclipsed, and greatest eclipse at 21:14
when it is long below the horizon. The app reports two numbers for how deep it
gets, because quoting one is how "30% eclipsed" and "19% eclipsed" come to
describe the same sky: magnitude, the fraction of the sun's *diameter* covered,
and obscuration, the fraction of its *area*. It also says, everywhere it says
anything, that a partly eclipsed sun still needs certified filters to look at.

The maths was checked against published local circumstances for this eclipse: it
reproduces the 38% obscuration quoted for Oradea and correctly puts the sun below
the horizon in Bucharest before first contact.

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
