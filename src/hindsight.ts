import { DAYS } from './data';

// Same site the forecast is fetched for (see weather.ts): Poarta 7 by Ryma,
// in the Alba Iulia citadel.
const LAT = 46.07;
const LON = 23.58;
const TZ = 'Europe/Bucharest';

// Open-Meteo's Previous Runs API replays, for any recent hour, what earlier
// model runs had predicted for it — next to what the current analysis says
// actually happened. One request therefore carries both halves of a benchmark:
// the past forecast and the real sky it was aimed at. Free, keyless and
// CORS-enabled like the forecast endpoint itself.
const API = 'https://previous-runs-api.open-meteo.com/v1/forecast';

// How many finished days to grade. Ten is enough to catch a lean without
// reaching back into a different weather regime altogether.
const PAST_DAYS = 10;

// A day counts as rained-on from 0.2 mm — below that is dew and gauge noise.
const RAIN_MM = 0.2;

// The learned correction only kicks in once there is a real sample behind it,
// ignores drift smaller than reading error, and never swings further than
// 3 °C no matter how strange the past fortnight was.
const MIN_SAMPLE = 5;
const DEAD_BAND = 0.3;
const MAX_NUDGE = 3;

// Cache the last report card so it still shows on site with patchy signal.
// Bump the suffix whenever the cached shape changes.
const CACHE_KEY = 'dbe12:weather:hindsight:v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // the model reruns a few times a day

/** One finished day: what the forecast said for it vs what actually fell. */
export interface DayGrade {
  date: string; // ISO yyyy-mm-dd
  saidHigh: number; // forecast daily max, °C
  saidLow: number;
  saidRainMm: number;
  wasHigh: number; // what the current analysis says really happened
  wasLow: number;
  wasRainMm: number;
}

export interface Hindsight {
  checkedAt: number;
  /** How many days ahead the graded forecasts were issued. */
  lead: number;
  /** Graded days, most recent first. */
  days: DayGrade[];
  /** Mean said-minus-was on daily highs, °C. Positive = forecast ran hot. */
  highBias: number;
  lowBias: number;
  /** Days whose rain / no-rain call was right. */
  rainHits: number;
}

/**
 * Grade forecasts issued at the same distance people are reading this one
 * from: as far out as the first night still is, capped by how far back the
 * previous-run columns reach (7 days), and never less than "yesterday's
 * forecast for today" once the festival is under way.
 */
function leadDays(): number {
  const first = new Date(DAYS[0].date + 'T12:00:00');
  const ahead = Math.ceil((first.getTime() - Date.now()) / 86_400_000);
  return Math.min(7, Math.max(1, ahead));
}

let current: Hindsight | null = null;
let seeded = false;
let inFlight: Promise<Hindsight | null> | null = null;

function seed(): void {
  if (seeded) return;
  seeded = true;
  current = readCache();
}

/** The last report card we have, cache included — may be null before first fetch. */
export function cachedHindsight(): Hindsight | null {
  seed();
  return current;
}

/**
 * Make sure the report card is in memory: cache first, network when the cache
 * has aged past its TTL. Never rejects — offline just returns whatever the
 * cache held, or null.
 */
export function ensureHindsight(): Promise<Hindsight | null> {
  seed();
  if (current && Date.now() - current.checkedAt < CACHE_TTL_MS) {
    return Promise.resolve(current);
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const fresh = await fetchHindsight();
      current = fresh;
      writeCache(fresh);
    } catch {
      /* offline / API down — keep whatever the cache gave us */
    }
    inFlight = null;
    return current;
  })();
  return inFlight;
}

async function fetchHindsight(): Promise<Hindsight> {
  const lead = leadDays();
  const params = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    hourly: [
      'temperature_2m',
      'precipitation',
      `temperature_2m_previous_day${lead}`,
      `precipitation_previous_day${lead}`,
    ].join(','),
    timezone: TZ,
    past_days: String(PAST_DAYS),
    forecast_days: '1',
  });

  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { hourly?: Record<string, unknown> };
  const hourly = json.hourly ?? {};
  const times = Array.isArray(hourly.time) ? (hourly.time as string[]) : [];
  const num = (name: string): (number | null)[] =>
    Array.isArray(hourly[name]) ? (hourly[name] as (number | null)[]) : [];

  const wasTemp = num('temperature_2m');
  const wasRain = num('precipitation');
  const saidTemp = num(`temperature_2m_previous_day${lead}`);
  const saidRain = num(`precipitation_previous_day${lead}`);

  interface Bucket {
    wasT: number[];
    saidT: number[];
    wasR: number;
    saidR: number;
  }
  const byDate = new Map<string, Bucket>();
  times.forEach((t, i) => {
    const date = t.slice(0, 10);
    let b = byDate.get(date);
    if (!b) {
      b = { wasT: [], saidT: [], wasR: 0, saidR: 0 };
      byDate.set(date, b);
    }
    const wt = wasTemp[i];
    if (typeof wt === 'number') b.wasT.push(wt);
    const st = saidTemp[i];
    if (typeof st === 'number') b.saidT.push(st);
    const wr = wasRain[i];
    if (typeof wr === 'number') b.wasR += wr;
    const sr = saidRain[i];
    if (typeof sr === 'number') b.saidR += sr;
  });

  // forecast_days=1 means the final timestamp falls on today (venue time), and
  // today is still unfolding — only earlier, finished days can be graded. Days
  // missing a real chunk of either column (range edges, model gaps) are
  // skipped rather than graded on a partial sky.
  const today = times.length > 0 ? times[times.length - 1].slice(0, 10) : '';
  const days: DayGrade[] = [...byDate.entries()]
    .filter(([date, b]) => date < today && b.wasT.length >= 20 && b.saidT.length >= 20)
    .map(([date, b]) => ({
      date,
      saidHigh: Math.max(...b.saidT),
      saidLow: Math.min(...b.saidT),
      saidRainMm: b.saidR,
      wasHigh: Math.max(...b.wasT),
      wasLow: Math.min(...b.wasT),
      wasRainMm: b.wasR,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  const highBias = days.length ? mean(days.map((d) => d.saidHigh - d.wasHigh)) : 0;
  const lowBias = days.length ? mean(days.map((d) => d.saidLow - d.wasLow)) : 0;
  const rainHits = days.filter(
    (d) => d.saidRainMm >= RAIN_MM === d.wasRainMm >= RAIN_MM,
  ).length;

  return { checkedAt: Date.now(), lead, days, highBias, lowBias, rainHits };
}

/**
 * What the current estimate has learned from past mistakes: the nudge (°C)
 * applied to displayed highs and lows. Zero until enough days are graded,
 * zero inside the dead band, clamped to ±MAX_NUDGE beyond it.
 */
function nudges(): { high: number; low: number } {
  seed();
  const h = current;
  if (!h || h.days.length < MIN_SAMPLE) return { high: 0, low: 0 };
  return { high: toNudge(h.highBias), low: toNudge(h.lowBias) };
}

function toNudge(bias: number): number {
  if (!Number.isFinite(bias) || Math.abs(bias) < DEAD_BAND) return 0;
  return Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, -bias));
}

/** A daily-high temperature, corrected by the learned high bias. */
export function adjustHigh(t: number): number {
  return t + nudges().high;
}

/** A daily-low temperature, corrected by the learned low bias. */
export function adjustLow(t: number): number {
  return t + nudges().low;
}

/** An hourly temperature, corrected by the mean of the two learned biases. */
export function adjustTemp(t: number): number {
  const n = nudges();
  return t + (n.high + n.low) / 2;
}

/** True while any learned correction is being applied to displayed numbers. */
export function isAdjusting(): boolean {
  const n = nudges();
  return n.high !== 0 || n.low !== 0;
}

/**
 * A stamp of the correction currently in force. The weather panel repaints
 * only when this changes, so an unchanged nudge doesn't collapse open rows.
 */
export function adjustmentKey(): string {
  const n = nudges();
  return `${n.high.toFixed(2)}|${n.low.toFixed(2)}`;
}

/* ---------- rendering ---------- */

/**
 * Render the report card into `container`: a collapsible section grading the
 * last PAST_DAYS of forecasts against the real sky, and saying in plain words
 * what correction — if any — the festival numbers above it now carry.
 * Re-renders in place; the expanded/collapsed state survives via a dataset
 * flag on the container.
 */
export function renderHindsight(container: HTMLElement, h: Hindsight | null): void {
  const expanded = container.dataset.expanded === '1';
  container.innerHTML = '';
  container.className = 'hindsight';

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'hindsight-row';
  row.setAttribute('aria-expanded', String(expanded));

  const title = document.createElement('span');
  title.className = 'hindsight-title';
  title.textContent = '📋 The forecast’s report card';
  row.appendChild(title);

  const chevron = document.createElement('span');
  chevron.className = 'hindsight-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▸';
  row.appendChild(chevron);

  const sub = document.createElement('span');
  sub.className = 'hindsight-sub';
  sub.textContent =
    h && h.days.length > 0
      ? `${h.days.length} past days graded against the real sky`
      : 'grades past forecasts against the real sky';
  row.appendChild(sub);

  const body = document.createElement('div');
  body.className = 'hindsight-body';
  body.hidden = !expanded;

  row.addEventListener('click', () => {
    const open = row.getAttribute('aria-expanded') === 'true';
    row.setAttribute('aria-expanded', String(!open));
    body.hidden = open;
    container.dataset.expanded = open ? '0' : '1';
  });

  container.appendChild(row);
  container.appendChild(body);

  if (!h || h.days.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hindsight-empty';
    empty.textContent =
      'No grades yet — the report card needs one connection to look up what ' +
      'past forecasts said and what actually fell on the citadel.';
    body.appendChild(empty);
    return;
  }

  const sum = document.createElement('p');
  sum.className = 'hindsight-summary';
  sum.textContent =
    `Forecasts issued ${h.lead} day${h.lead === 1 ? '' : 's'} ahead — the same ` +
    `distance you are reading this one from — ran ${signedDeg(h.highBias)} on ` +
    `highs and ${signedDeg(h.lowBias)} on lows over the last ${h.days.length} ` +
    `days here. Rain or no rain was called right ${h.rainHits} of ${h.days.length}.`;
  body.appendChild(sum);

  const table = document.createElement('div');
  table.className = 'hindsight-days';
  table.appendChild(gradeRow('', 'said', 'was', 'high off', true));
  h.days.forEach((d) => {
    const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
    });
    table.appendChild(
      gradeRow(
        label,
        `${Math.round(d.saidHigh)}°/${Math.round(d.saidLow)}° · ${fmtRain(d.saidRainMm)}`,
        `${Math.round(d.wasHigh)}°/${Math.round(d.wasLow)}° · ${fmtRain(d.wasRainMm)}`,
        signedDeg(d.saidHigh - d.wasHigh),
      ),
    );
  });
  body.appendChild(table);

  const learn = document.createElement('p');
  learn.className = 'hindsight-learn';
  const n = nudges();
  if (h.days.length < MIN_SAMPLE) {
    learn.textContent =
      'Too few graded days to correct anything yet — the festival numbers above ' +
      'are shown exactly as forecast.';
  } else if (n.high === 0 && n.low === 0) {
    learn.textContent =
      'Learned: nothing to fix — those calls landed close enough that the ' +
      'festival numbers above stand exactly as forecast.';
  } else {
    const parts: string[] = [];
    if (n.high !== 0) parts.push(`highs ${signedDeg(n.high)}`);
    if (n.low !== 0) parts.push(`lows ${signedDeg(n.low)}`);
    learn.textContent =
      `Learned: the festival temperatures above are nudged ${parts.join(' and ')} ` +
      'to pay for those misses — that is the * on their chips.';
  }
  body.appendChild(learn);

  const src = document.createElement('p');
  src.className = 'hindsight-note';
  src.textContent = 'Past runs and observations from Open-Meteo.';
  body.appendChild(src);
}

function gradeRow(
  when: string,
  said: string,
  was: string,
  off: string,
  head = false,
): HTMLElement {
  const row = document.createElement('div');
  row.className = head ? 'hindsight-day hindsight-day-head' : 'hindsight-day';
  [when, said, was, off].forEach((text, i) => {
    const cell = document.createElement('span');
    if (i === 3) cell.className = 'hindsight-off';
    cell.textContent = text;
    row.appendChild(cell);
  });
  return row;
}

/** Signed degrees with a typographic minus: +1.4°, −0.6°, ±0°. */
function signedDeg(x: number): string {
  const r = Math.round(x * 10) / 10;
  if (r === 0) return '±0°';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}°`;
}

function fmtRain(mm: number): string {
  if (mm < RAIN_MM) return 'dry';
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
}

/* ---------- cache ---------- */

function readCache(): Hindsight | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Hindsight;
    if (typeof parsed.checkedAt !== 'number') return null;
    if (!Array.isArray(parsed.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(h: Hindsight): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(h));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}
