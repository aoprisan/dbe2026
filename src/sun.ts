import { DAYS, VENUE_SITE } from './data';
import {
  altitude,
  bisect,
  julianCenturies,
  norm360,
  obliquity,
  moonNode,
  sin,
  cos,
  toEquatorial,
  topocentric,
  type Equatorial,
  type Site,
} from './astro';
import type { FestivalDay, NightId } from './types';

/**
 * When the light goes.
 *
 * DBE is an open courtyard inside a fortress in the middle of August, and the
 * music starts at 18:00 — a good two and a half hours before the sun is off the
 * walls, which means the opening of every night happens in broad daylight and
 * the stage only really becomes a stage later on. Knowing when that is turns out to be the single most useful thing
 * this app can say about a night before it starts: it's when to be inside, when
 * the courtyard cools, when the light stops fighting the projections, and — on
 * the opening night of this particular edition — when to be looking west.
 *
 * The sun's position is Meeus ch. 25. Sunset is the standard definition every
 * almanac and weather site uses: the moment the centre of the disc is 0°50′
 * below the true horizon, an allowance that covers both the sun's own radius
 * (about 16′) and average atmospheric refraction at the horizon (about 34′).
 * Computed on the device, like the moon — no network, no key, no forecast.
 */

/** The venue, in the shape the astronomy helpers want. */
export const SITE: Site = {
  lat: VENUE_SITE.lat,
  lon: VENUE_SITE.lon,
  elevationM: VENUE_SITE.elevationM,
};

/** True radius of the sun, kilometres — its apparent size during the eclipse. */
export const SUN_RADIUS_KM = 696000;

/**
 * Centre-of-disc altitude that counts as sunset: refraction plus semidiameter.
 * The value everyone quotes, so the number here matches the number on the
 * weather app in someone's other hand.
 */
const SUNSET_ALTITUDE = -0.8333;

/** Civil twilight: the light is off the sky, but you can still read by it. */
const CIVIL_ALTITUDE = -6;

/** Apparent geocentric position of the sun (Meeus ch. 25). */
export function sunPosition(at: Date): Equatorial & { lon: number } {
  const t = julianCenturies(at);

  const m = norm360(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
  const l0 = norm360(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
  // Equation of the centre — the orbit is an ellipse, so the sun runs ahead of
  // and behind its own mean position by up to about 1.9° over the year.
  const c =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(m) +
    (0.019993 - 0.000101 * t) * sin(2 * m) +
    0.000289 * sin(3 * m);

  // Apparent longitude: true longitude corrected for aberration and nutation.
  const lon = norm360(l0 + c - 0.00569 - 0.00478 * sin(moonNode(t)));
  const e = 0.016708634 - 0.000042037 * t;
  const au = (1.000001018 * (1 - e * e)) / (1 + e * cos(m + c));

  // The sun is on the ecliptic by definition, so its latitude is zero to well
  // under an arcsecond — the one coordinate here that needs no series at all.
  return { lon, ...toEquatorial(lon, 0, obliquity(t), au * 149597870.7) };
}

/** Where the sun stands over the citadel at a given instant, in degrees. */
export function sunAltitude(at: Date): number {
  return altitude(topocentric(sunPosition(at), at, SITE), at, SITE);
}

/**
 * The instant the sun crosses a given altitude on its way down, on a given
 * date. Bracketed between local noon and local midnight, which in August at
 * 46°N contains exactly one descending crossing of every altitude we ask for.
 */
function descendingThrough(dateIso: string, targetAltitude: number): Date {
  const [y, mo, d] = dateIso.split('-').map(Number);
  // Local noon and midnight in EEST (UTC+3), expressed as UTC.
  const noon = Date.UTC(y, mo - 1, d, 12 - 3, 0);
  const midnight = Date.UTC(y, mo - 1, d, 24 - 3, 0);
  return bisect(noon, midnight, (at) => sunAltitude(at) > targetAltitude);
}

export interface DaySun {
  /** Centre of the disc on the horizon — the sunset every almanac prints. */
  sunset: Date;
  /** End of civil twilight: the point the courtyard is genuinely dark. */
  duskCivil: Date;
}

function daySun(day: FestivalDay): DaySun {
  return {
    sunset: descendingThrough(day.date, SUNSET_ALTITUDE),
    duskCivil: descendingThrough(day.date, CIVIL_ALTITUDE),
  };
}

const byDay = new Map<NightId, DaySun>(DAYS.map((day) => [day.id, daySun(day)]));

export function sunForDay(dayId: NightId): DaySun | undefined {
  return byDay.get(dayId);
}

/** The sunset for a festival day, computed once and reused. */
export function nightSunset(day: FestivalDay): Date {
  return (byDay.get(day.id) ?? daySun(day)).sunset;
}

/**
 * Festival-local wall clock, always EEST. Deliberately not the viewer's own
 * timezone: someone reading this from another country wants to know when the
 * sun goes down over the citadel, not what their own clock will say at the
 * time.
 */
export function festivalClock(at: Date): string {
  return new Date(at.getTime() + 3 * 3600000).toISOString().slice(11, 16);
}

/** "Sunset 20:39" — the short form, for a header line or a chip. */
export function sunsetLabel(at: Date): string {
  return `Sunset ${festivalClock(at)}`;
}

/** The longer form, for a tooltip: what it means for the evening. */
export function sunsetTitle(sun: DaySun): string {
  return (
    `The sun is off the horizon at ${festivalClock(sun.sunset)} local (EEST), and the last of the ` +
    `light leaves the courtyard around ${festivalClock(sun.duskCivil)}. The music starts at 18:00, so ` +
    `the first stretch of the night runs in daylight. Standard flat-horizon sunset — the citadel walls ` +
    `will take the sun a few minutes earlier than that. Computed on the device, not fetched.`
  );
}
