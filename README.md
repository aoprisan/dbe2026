# DBE 2026 Night Planner

An unofficial, installable night planner for the 12th edition of
[Dark Bombastic Evening](https://www.facebook.com/DarkBombasticEvening), held at
RÂMA in Alba Iulia, Romania, from 12–15 August 2026.

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
- Festival-hour weather from Open-Meteo
- Ticket prices and estimated plan cost
- A post-show journal, ratings, statistics, and recap image
- Offline support and installation as a Progressive Web App

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

The core festival details, nights, prices, and set times live in
[`src/data.ts`](src/data.ts). Band genres, countries, and curated listening links
live in [`src/band-meta.ts`](src/band-meta.ts).

When an official running order is announced:

1. Replace the provisional times in `src/data.ts`.
2. Set `RUNNING_ORDER_ANNOUNCED` to `true`.
3. Update `DATA_VERSION` so returning visitors see the line-up update notice.

Use `null` for an event's `link` or `listen` value when no useful online
destination exists and the app should not generate a search fallback.

## Deployment

Pushes to `main` are built and deployed to GitHub Pages by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

The Vite base path in [`vite.config.ts`](vite.config.ts) must stay aligned with
the repository name.

## License

[GNU Affero General Public License v3.0](LICENSE)
