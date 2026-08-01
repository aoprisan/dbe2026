import { DAYS } from './data';
import { MOON_RADIUS_KM, moonPhase, moonPosition } from './moon';
import {
  SITE,
  SUN_RADIUS_KM,
  festivalClock,
  nightSunset,
  sunAltitude,
  sunPosition,
} from './sun';
import { apparentRadius, bisect, separation, topocentric } from './astro';
import type { FestivalDay, NightId } from './types';

/**
 * The eclipse over the opening ceremony.
 *
 * On 12 August 2026 — the first night of this edition — there is a total solar
 * eclipse over the North Atlantic, Greenland, Iceland and northern Spain. Alba
 * Iulia is nowhere near the path of totality, and the sun sets in the citadel
 * long before the deep phase arrives. What the courtyard actually gets is the
 * better half of that trade for anyone already standing in it: the sun goes
 * down *with a bite taken out of it*, low over the western wall, in the hour
 * between doors and the first performance.
 *
 * Nothing about that is hardcoded. This module asks the same question of all
 * four nights — is the moon in front of the sun here, and is the sun still up —
 * and answers it from the same ephemeris the moon phase and the sunset use. If
 * the dates move, or the app is pointed at another edition, the eclipse either
 * appears somewhere else or stops being mentioned, without anyone editing a
 * date into a string.
 *
 * Two numbers describe how deep it gets, and they are not the same number:
 *
 * - **Magnitude** — the fraction of the sun's *diameter* covered. The one
 *   eclipse tables print.
 * - **Obscuration** — the fraction of the sun's *area* covered. The one that
 *   matches what the light actually does, and always the smaller of the two.
 *
 * Both are reported, because quoting only one is how "30% eclipsed" and
 * "19% eclipsed" end up describing the same sky.
 */

/** How deep the moon is into the sun's disc at one instant. */
interface Coverage {
  /** Fraction of the sun's diameter covered, 0–1. */
  magnitude: number;
  /** Fraction of the sun's area covered, 0–1. */
  obscuration: number;
  /** Angular distance between the two centres, degrees. */
  separation: number;
}

const CLEAR: Coverage = { magnitude: 0, obscuration: 0, separation: Infinity };

/**
 * The overlap of the two discs as seen from the venue.
 *
 * Topocentric on both bodies: from the surface the moon sits up to a degree
 * from its geocentric place, which is several times the whole depth of the
 * partial phase here. Geocentric positions would put this eclipse in the wrong
 * decade of a degree.
 */
function coverageAt(at: Date): Coverage {
  const sun = topocentric(sunPosition(at), at, SITE);
  const moon = topocentric(moonPosition(at), at, SITE);

  const d = separation(sun, moon);
  const rs = apparentRadius(SUN_RADIUS_KM, sun.distKm);
  const rm = apparentRadius(MOON_RADIUS_KM, moon.distKm);

  if (d >= rs + rm) return { ...CLEAR, separation: d };

  // Total or annular: one disc entirely inside the other.
  if (d <= Math.abs(rs - rm)) {
    const ratio = rm / rs;
    return {
      magnitude: Math.min(1, ratio),
      obscuration: Math.min(1, ratio * ratio),
      separation: d,
    };
  }

  const magnitude = (rs + rm - d) / (2 * rs);

  // Area of the circular lune, by the standard two-circle intersection: each
  // disc contributes a circular segment on its side of the common chord.
  const a = Math.acos((d * d + rs * rs - rm * rm) / (2 * d * rs));
  const b = Math.acos((d * d + rm * rm - rs * rs) / (2 * d * rm));
  const overlap =
    rs * rs * (a - Math.sin(2 * a) / 2) + rm * rm * (b - Math.sin(2 * b) / 2);

  return { magnitude, obscuration: overlap / (Math.PI * rs * rs), separation: d };
}

export interface SolarEclipse {
  dayId: NightId;
  /** First contact: the moon's edge touches the sun's. */
  startsAt: Date;
  /** Last contact — often after the sun has set, from here. */
  endsAt: Date;
  /** Greatest eclipse, wherever it falls relative to the horizon. */
  greatestAt: Date;
  greatest: Coverage;
  /** The sun's altitude when the eclipse begins, degrees. */
  altitudeAtStart: number;
  /** Sunset that evening, for the window below. */
  sunsetAt: Date;

  /* ---- what is actually visible from the courtyard ---- */

  /** True when any of it happens with the sun above the horizon. */
  visible: boolean;
  /** End of the visible stretch: last contact, or sunset, whichever comes first. */
  visibleUntil: Date;
  /** Deepest coverage reached while the sun is still up. */
  best: Coverage;
  /** True when the sun is still eclipsed at the moment it sets. */
  setsEclipsed: boolean;
}

/**
 * A solar eclipse needs a new moon, and most new moons are not eclipses — the
 * moon's orbit is tilted about 5°, so it usually passes above or below. Testing
 * the elongation first keeps the search below from running on the three nights
 * where the moon is nowhere near the sun.
 */
const NEW_MOON_WINDOW_DEG = 15;

/** Step of the coarse scan, in minutes. Well under the ~1h partial phase here. */
const SCAN_STEP_MIN = 4;

function findEclipse(day: FestivalDay): SolarEclipse | null {
  const [y, mo, d] = day.date.split('-').map(Number);
  // Local noon to local midnight (EEST = UTC+3), the only stretch of the
  // festival day in which the sun is up or has just gone down.
  const from = Date.UTC(y, mo - 1, d, 12 - 3, 0);
  const to = Date.UTC(y, mo - 1, d, 24 - 3, 0);

  const midday = moonPhase(new Date((from + to) / 2));
  const fromNew = Math.min(midday.angle, 360 - midday.angle);
  if (fromNew > NEW_MOON_WINDOW_DEG) return null;

  // Coarse scan for the interval in which the discs overlap at all.
  const step = SCAN_STEP_MIN * 60000;
  let firstTouch: number | null = null;
  let lastTouch: number | null = null;
  let deepest = { ms: from, cov: CLEAR };
  for (let ms = from; ms <= to; ms += step) {
    const cov = coverageAt(new Date(ms));
    if (cov.magnitude > 0) {
      if (firstTouch == null) firstTouch = ms;
      lastTouch = ms;
      if (cov.magnitude > deepest.cov.magnitude) deepest = { ms, cov };
    }
  }
  if (firstTouch == null || lastTouch == null) return null;

  // Refine the two contacts. Each bracket holds exactly one crossing: the discs
  // are approaching before first contact and separating after last contact.
  const startsAt =
    firstTouch === from
      ? new Date(from)
      : bisect(firstTouch, firstTouch - step, (at) => coverageAt(at).magnitude > 0);
  const endsAt =
    lastTouch === to
      ? new Date(to)
      : bisect(lastTouch, lastTouch + step, (at) => coverageAt(at).magnitude > 0);

  // Greatest eclipse, by golden-section-free ternary search on the separation.
  let lo = deepest.ms - step;
  let hi = deepest.ms + step;
  for (let i = 0; i < 40; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (coverageAt(new Date(a)).separation < coverageAt(new Date(b)).separation) hi = b;
    else lo = a;
  }
  const greatestAt = new Date((lo + hi) / 2);

  const sunsetAt = nightSunset(day);
  const visible = startsAt.getTime() < sunsetAt.getTime();
  const visibleUntil = new Date(Math.min(endsAt.getTime(), sunsetAt.getTime()));
  // Coverage grows monotonically until greatest eclipse, so the deepest sight
  // from the ground is either greatest itself or whatever it had reached when
  // the sun went down.
  const best = !visible
    ? CLEAR
    : greatestAt <= sunsetAt
      ? coverageAt(greatestAt)
      : coverageAt(visibleUntil);

  return {
    dayId: day.id,
    startsAt,
    endsAt,
    greatestAt,
    greatest: coverageAt(greatestAt),
    altitudeAtStart: sunAltitude(startsAt),
    sunsetAt,
    visible,
    visibleUntil,
    best,
    setsEclipsed: visible && endsAt.getTime() > sunsetAt.getTime(),
  };
}

const byDay = new Map<NightId, SolarEclipse>();
for (const day of DAYS) {
  const found = findEclipse(day);
  if (found) byDay.set(day.id, found);
}

/** The solar eclipse over a festival night, when there is one. */
export function eclipseForDay(dayId: NightId): SolarEclipse | undefined {
  return byDay.get(dayId);
}

/** Every night of this edition that has one — normally none, this year one. */
export function eclipseNights(): SolarEclipse[] {
  return [...byDay.values()];
}

const pct = (x: number): number => Math.round(x * 100);

/**
 * The one-line form for a header or a chip. Leads with the fact that it happens
 * at sunset, because that is both the striking part and the reason it is short.
 */
export function eclipseLabel(e: SolarEclipse): string {
  if (!e.visible) return 'Eclipse below the horizon';
  const when = `${festivalClock(e.startsAt)}–${festivalClock(e.visibleUntil)}`;
  return e.setsEclipsed
    ? `Partial eclipse at sunset · ${when}`
    : `Partial eclipse · ${when}`;
}

/** The short "how much" line: both numbers, named, so neither can mislead. */
export function eclipseDepth(e: SolarEclipse): string {
  return `${pct(e.best.magnitude)}% of the sun's width covered (${pct(e.best.obscuration)}% of its face)`;
}

/** The long form, for a tooltip or the panel: what to expect, and what not to. */
export function eclipseTitle(e: SolarEclipse): string {
  if (!e.visible) {
    return (
      `A solar eclipse runs from ${festivalClock(e.startsAt)} to ${festivalClock(e.endsAt)} local, ` +
      `but the sun has already set over Alba Iulia by then, so there is nothing to see from the citadel.`
    );
  }
  const parts = [
    `The moon starts crossing the sun at ${festivalClock(e.startsAt)} local (EEST), with the sun ` +
      `only ${e.altitudeAtStart.toFixed(1)}° above the horizon — low, over the western wall.`,
    e.setsEclipsed
      ? `It sets still eclipsed at ${festivalClock(e.sunsetAt)}, with ${eclipseDepth(e)}.`
      : `The eclipse ends at ${festivalClock(e.endsAt)}, with ${eclipseDepth(e)} at its deepest.`,
  ];
  if (e.greatestAt > e.sunsetAt) {
    parts.push(
      `The deep phase — ${pct(e.greatest.magnitude)}% — comes at ${festivalClock(e.greatestAt)}, ` +
        `by which time the sun is well below the horizon here. Totality itself is over the North ` +
        `Atlantic and northern Spain, not Romania.`,
    );
  }
  parts.push(
    'Never look at a partly eclipsed sun without proper eclipse filters — it is still bright ' +
      'enough to burn, low and dimmed though it looks. Computed on the device, not fetched.',
  );
  return parts.join(' ');
}

/** Plain-text lines for the AI brief, where there is room to say it properly. */
export function eclipseBriefLines(e: SolarEclipse, dayName: string): string[] {
  if (!e.visible) return [];
  return [
    `- ECLIPSE: a partial solar eclipse is visible from the venue on ${dayName}, the same evening.`,
    `  The moon first touches the sun at ${festivalClock(e.startsAt)} local, with the sun about ` +
      `${e.altitudeAtStart.toFixed(1)}° above the horizon.`,
    e.setsEclipsed
      ? `  The sun then sets, still eclipsed, at ${festivalClock(e.sunsetAt)}, with ${eclipseDepth(e)}.`
      : `  It ends at ${festivalClock(e.endsAt)}, with ${eclipseDepth(e)} at its deepest.`,
    `  Greatest eclipse (${pct(e.greatest.magnitude)}%) is at ${festivalClock(e.greatestAt)}, below the ` +
      `horizon from here. This is NOT totality — the total path is over the Atlantic, Greenland, Iceland and northern Spain.`,
    `  It falls between doors and the first performance, and needs certified eclipse filters to look at safely.`,
  ];
}
