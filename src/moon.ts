import { DAYS } from './data';
import { festivalInstant } from './schedule';
import { sunPosition } from './sun';
import {
  acos,
  atan2,
  cos,
  julianCenturies,
  norm360,
  obliquity,
  sin,
  toEquatorial,
  type Equatorial,
} from './astro';
import type { FestivalDay, NightId } from './types';

/**
 * The moon over the citadel.
 *
 * DBE is four nights in an open courtyard inside a fortress, so how much moon
 * there is overhead is a real detail of the evening — dark sky or not, and how
 * much light there is to find your way back through the walls afterwards. This
 * module answers one question per day: what phase is the moon in that night.
 *
 * The maths is Meeus' *Astronomical Algorithms* (chapters 47 and 48), with the
 * full periodic series rather than a truncation. A label reading "Waxing
 * crescent · 6% lit" would survive a much rougher moon than this — but the
 * eclipse over the opening ceremony would not, and it reads the moon's position
 * from here. One lunar theory, accurate enough for the strictest reader of it.
 */

/** Mean synodic month, in days — used only to phrase the moon's age. */
const SYNODIC_DAYS = 29.530588853;
/** True radius of the moon, kilometres — its apparent size during the eclipse. */
export const MOON_RADIUS_KM = 1737.4;

/**
 * Meeus table 47.A — the periodic terms of the moon's longitude and distance.
 * Columns: multiples of D, M, M′ and F, then the coefficient of the sine term
 * in longitude (units of 1e-6 degrees) and of the cosine term in distance
 * (units of 1e-3 km).
 */
const LON_DIST_TERMS: ReadonlyArray<readonly number[]> = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];

/**
 * Meeus table 47.B — the periodic terms of the moon's ecliptic latitude, in
 * units of 1e-6 degrees. The moon's orbit is tilted about 5° to the ecliptic,
 * and that tilt is exactly why most new moons are not eclipses.
 */
const LAT_TERMS: ReadonlyArray<readonly number[]> = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777], [4, 0, -2, 1, 671], [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366], [2, 1, 0, 1, -351], [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315], [2, -2, 0, -1, 302], [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181], [0, 1, 2, 1, -177], [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166], [1, 0, 1, -1, -164], [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107],
];

export interface MoonPosition extends Equatorial {
  /** Apparent geocentric ecliptic longitude, degrees. */
  lon: number;
  /** Ecliptic latitude, degrees — how far off the ecliptic the moon rides. */
  lat: number;
}

/** Apparent geocentric position of the moon (Meeus ch. 47). */
export function moonPosition(at: Date): MoonPosition {
  const t = julianCenturies(at);

  const lp = norm360(218.3164477 + 481267.88123421 * t - 0.0015786 * t * t); // mean longitude
  const d = norm360(297.8501921 + 445267.1114034 * t - 0.0018819 * t * t); // mean elongation
  const m = norm360(357.5291092 + 35999.0502909 * t - 0.0001536 * t * t); // sun's mean anomaly
  const mp = norm360(134.9633964 + 477198.8675055 * t + 0.0087414 * t * t); // moon's mean anomaly
  const f = norm360(93.272095 + 483202.0175233 * t - 0.0036539 * t * t); // argument of latitude

  // Venus, Jupiter and the flattening of the Earth, as three further arguments.
  const a1 = norm360(119.75 + 131.849 * t);
  const a2 = norm360(53.09 + 479264.29 * t);
  const a3 = norm360(313.45 + 481266.484 * t);

  // The eccentricity of the Earth's orbit is falling, which slowly weakens every
  // term that depends on the sun's anomaly.
  const e = 1 - 0.002516 * t - 0.0000074 * t * t;
  const eccentricity = (mult: number): number =>
    Math.abs(mult) === 1 ? e : Math.abs(mult) === 2 ? e * e : 1;

  let sumL = 0;
  let sumR = 0;
  for (const [cd, cm, cmp, cf, coefL, coefR] of LON_DIST_TERMS) {
    const arg = cd * d + cm * m + cmp * mp + cf * f;
    const scale = eccentricity(cm);
    sumL += coefL * scale * sin(arg);
    sumR += coefR * scale * cos(arg);
  }

  let sumB = 0;
  for (const [cd, cm, cmp, cf, coefB] of LAT_TERMS) {
    const arg = cd * d + cm * m + cmp * mp + cf * f;
    sumB += coefB * eccentricity(cm) * sin(arg);
  }

  // Additive corrections for the planetary perturbations (Meeus, after 47.B).
  sumL += 3958 * sin(a1) + 1962 * sin(lp - f) + 318 * sin(a2);
  sumB +=
    -2235 * sin(lp) +
    382 * sin(a3) +
    175 * sin(a1 - f) +
    175 * sin(a1 + f) +
    127 * sin(lp - mp) -
    115 * sin(lp + mp);

  const lon = norm360(lp + sumL / 1e6);
  const lat = sumB / 1e6;
  const distKm = 385000.56 + sumR / 1000;

  return { lon, lat, ...toEquatorial(lon, lat, obliquity(t), distKm) };
}

export interface MoonPhase {
  /** Fraction of the disc lit, 0–1. */
  fraction: number;
  /** Illuminated percentage, rounded — what the labels show. */
  percent: number;
  /**
   * Geocentric elongation of the moon from the sun, 0–360°: 0 new,
   * 90 first quarter, 180 full, 270 last quarter. Also what decides the glyph.
   */
  angle: number;
  /** Days since the last new moon, approximated from the elongation. */
  age: number;
  /** True while the lit side is growing (elongation under 180°). */
  waxing: boolean;
  /** "New moon", "Waxing crescent", … */
  name: string;
  /** Northern-hemisphere glyph — Alba Iulia is at 46°N. */
  emoji: string;
}

/**
 * How close to an exact new/quarter/full moon still counts as that phase, in
 * degrees of elongation. ~6.6° is half a day of the moon's mean motion, so a
 * day whose evening falls within half a day of the exact instant is named for
 * it rather than for the crescent it is a few hours away from being.
 */
const PRINCIPAL_WINDOW = 6.6;

const INTERMEDIATE = [
  { name: 'Waxing crescent', emoji: '🌒' },
  { name: 'Waxing gibbous', emoji: '🌔' },
  { name: 'Waning gibbous', emoji: '🌖' },
  { name: 'Waning crescent', emoji: '🌘' },
];

const PRINCIPAL = [
  { name: 'New moon', emoji: '🌑' },
  { name: 'First quarter', emoji: '🌓' },
  { name: 'Full moon', emoji: '🌕' },
  { name: 'Last quarter', emoji: '🌗' },
];

function nameFor(angle: number): { name: string; emoji: string } {
  for (let i = 0; i < 4; i++) {
    const exact = i * 90;
    // Shortest way round the circle, so 359.9° counts as new and not as 360.
    const off = Math.abs(((angle - exact + 540) % 360) - 180);
    if (off <= PRINCIPAL_WINDOW) return PRINCIPAL[i];
  }
  return INTERMEDIATE[Math.floor(angle / 90) % 4];
}

/** The phase of the moon at a given instant. */
export function moonPhase(at: Date): MoonPhase {
  const sun = sunPosition(at);
  const moon = moonPosition(at);

  // Elongation, then the phase angle of the sun–moon–earth triangle: the moon
  // is close enough that the sun does not light it from exactly our direction,
  // which is what keeps a "new" moon from reading as precisely 0% lit.
  const psi = acos(cos(moon.lat) * cos(moon.lon - sun.lon));
  const sunKm = sun.distKm;
  const phaseAngle = atan2(sunKm * sin(psi), moon.distKm - sunKm * cos(psi));
  const fraction = (1 + cos(phaseAngle)) / 2;

  // Signed elongation carries what the unsigned phase angle cannot: which side
  // of new or full we are on, and therefore which way the crescent points.
  const angle = norm360(moon.lon - sun.lon);
  const { name, emoji } = nameFor(angle);

  return {
    fraction,
    percent: Math.round(fraction * 100),
    angle,
    age: (angle / 360) * SYNODIC_DAYS,
    waxing: angle < 180,
    name,
    emoji,
  };
}

/**
 * The instant a festival night is judged by: 22:00 local, deep into the set
 * list. Taking the phase at midnight would name some nights for a moon that
 * only arrives after everyone has left.
 */
function nightInstant(day: FestivalDay): Date {
  return festivalInstant(day.date, '22:00');
}

/** The moon over a given night of the festival. */
export function nightMoon(day: FestivalDay): MoonPhase {
  return moonPhase(nightInstant(day));
}

const byDay = new Map<NightId, MoonPhase>(
  DAYS.map((day) => [day.id, nightMoon(day)]),
);

export function moonForDay(dayId: NightId): MoonPhase | undefined {
  return byDay.get(dayId);
}

/** "Waxing crescent · 6% lit", or just "New moon" when there is nothing to light. */
export function moonLabel(phase: MoonPhase): string {
  if (phase.name === 'New moon') return phase.name;
  return `${phase.name} · ${phase.percent}% lit`;
}

/** The longer form, for tooltips: what it means for the night itself. */
export function moonTitle(phase: MoonPhase): string {
  const age = phase.age.toFixed(1);
  const dark =
    phase.percent <= 10
      ? ' — a dark sky over the citadel'
      : phase.percent >= 90
        ? ' — bright enough to walk the walls by'
        : '';
  return `${moonLabel(phase)}, about ${age} days into the lunar month, at 22:00 local${dark}. Computed on the device, not fetched.`;
}
