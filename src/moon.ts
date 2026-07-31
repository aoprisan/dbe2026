import { DAYS } from './data';
import { festivalInstant } from './schedule';
import type { FestivalDay, NightId } from './types';

/**
 * The moon over the citadel.
 *
 * DBE is four nights in an open courtyard inside a fortress, so how much moon
 * there is overhead is a real detail of the evening — dark sky or not, and how
 * much light there is to find your way back through the walls afterwards. This
 * module answers one question per day: what phase is the moon in that night.
 *
 * The maths is Meeus' *Astronomical Algorithms* (chapters 25, 47 and 48),
 * truncated to the largest periodic terms. That is worth a few arcminutes on
 * the moon's longitude and well under a percentage point of illumination —
 * far finer than a label reading "Waxing crescent · 6% lit" can express.
 */

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
/** Mean synodic month, in days — used only to phrase the moon's age. */
const SYNODIC_DAYS = 29.530588853;

/** Julian centuries since J2000.0 (2000-01-01 12:00 TT). */
function julianCenturies(at: Date): number {
  const jd = at.getTime() / 86400000 + 2440587.5;
  return (jd - 2451545) / 36525;
}

const sin = (deg: number) => Math.sin(deg * DEG);
const cos = (deg: number) => Math.cos(deg * DEG);

/** Normalise an angle in degrees to [0, 360). */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
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
  const t = julianCenturies(at);

  // Sun — Meeus ch. 25, apparent longitude and radius vector.
  const sunM = norm360(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
  const sunL0 = norm360(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
  const sunC =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(sunM) +
    (0.019993 - 0.000101 * t) * sin(2 * sunM) +
    0.000289 * sin(3 * sunM);
  const sunLon = norm360(sunL0 + sunC);
  const sunAu =
    1.000001018 *
    ((1 - 0.016708634 * 0.016708634) / (1 + 0.016708634 * cos(sunM + sunC)));

  // Moon — Meeus ch. 47, the leading terms of the longitude and distance series.
  const lp = norm360(218.3164477 + 481267.88123421 * t); // mean longitude
  const d = norm360(297.8501921 + 445267.1114034 * t); // mean elongation
  const mp = norm360(134.9633964 + 477198.8675055 * t); // mean anomaly
  const f = norm360(93.272095 + 483202.0175233 * t); // argument of latitude

  const moonLon = norm360(
    lp +
      6.288774 * sin(mp) +
      1.274027 * sin(2 * d - mp) +
      0.658314 * sin(2 * d) +
      0.213618 * sin(2 * mp) -
      0.185116 * sin(sunM) -
      0.114332 * sin(2 * f) +
      0.058793 * sin(2 * d - 2 * mp) +
      0.057066 * sin(2 * d - sunM - mp) +
      0.053322 * sin(2 * d + mp) +
      0.045758 * sin(2 * d - sunM),
  );
  const moonLat =
    5.128122 * sin(f) +
    0.280602 * sin(mp + f) +
    0.277693 * sin(mp - f) +
    0.173237 * sin(2 * d - f) +
    0.055413 * sin(2 * d - mp + f) +
    0.046271 * sin(2 * d - mp - f);
  const moonKm =
    385000.56 -
    20905.355 * cos(mp) -
    3699.111 * cos(2 * d - mp) -
    2955.968 * cos(2 * d) -
    569.925 * cos(2 * mp);

  // Elongation, then the phase angle of the sun–moon–earth triangle: the moon
  // is close enough that the sun does not light it from exactly our direction,
  // which is what keeps a "new" moon from reading as precisely 0% lit.
  const cosPsi = cos(moonLat) * cos(moonLon - sunLon);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi))) / DEG;
  const sunKm = sunAu * AU_KM;
  const phaseAngle =
    Math.atan2(sunKm * sin(psi), moonKm - sunKm * cos(psi)) / DEG;
  const fraction = (1 + cos(phaseAngle)) / 2;

  // Signed elongation carries what the unsigned phase angle cannot: which side
  // of new or full we are on, and therefore which way the crescent points.
  const angle = norm360(moonLon - sunLon);
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
