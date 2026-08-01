/**
 * The small amount of spherical astronomy the rest of the app builds on.
 *
 * Three modules now want the same primitives — `sun.ts` for sunset, `moon.ts`
 * for the phase, `eclipse.ts` for the bite the moon takes out of the sun over
 * the opening ceremony — and they all have to agree, to the arcminute, or the
 * eclipse contact times drift away from the sunset they are quoted against.
 * So the shared parts live here once: time, obliquity, sidereal rotation, and
 * the two coordinate changes that turn a geocentric position into something an
 * observer standing in the citadel would actually see.
 *
 * Everything is Meeus, *Astronomical Algorithms* (2nd ed.), and everything runs
 * on the device — none of it needs a network, which is the point: the sky is
 * the one part of this planner that still works with no signal inside a
 * fortress.
 */

export const DEG = Math.PI / 180;

export const sin = (deg: number): number => Math.sin(deg * DEG);
export const cos = (deg: number): number => Math.cos(deg * DEG);
export const tan = (deg: number): number => Math.tan(deg * DEG);
export const asin = (x: number): number => Math.asin(Math.max(-1, Math.min(1, x))) / DEG;
export const acos = (x: number): number => Math.acos(Math.max(-1, Math.min(1, x))) / DEG;
export const atan2 = (y: number, x: number): number => Math.atan2(y, x) / DEG;

/** Normalise an angle in degrees to [0, 360). */
export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Julian Day for an instant. */
export function julianDay(at: Date): number {
  return at.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since J2000.0 (2000-01-01 12:00 TT). */
export function julianCenturies(at: Date): number {
  return (julianDay(at) - 2451545) / 36525;
}

/**
 * The longitude of the ascending node of the moon's orbit — the one nutation
 * term big enough to matter here, used to nudge both the obliquity and the
 * sun's apparent longitude.
 */
export function moonNode(t: number): number {
  return 125.04452 - 1934.136261 * t;
}

/**
 * True obliquity of the ecliptic: the mean value (Meeus 22.2) plus the leading
 * nutation term. Worth about 9 arcseconds — invisible on a moon label, but it
 * is the axis every equatorial coordinate below is measured against.
 */
export function obliquity(t: number): number {
  const mean = 23.4392911 - (46.815 * t + 0.00059 * t * t - 0.001813 * t * t * t) / 3600;
  return mean + 0.00256 * cos(moonNode(t));
}

/** A position on the celestial sphere, with the distance that gives it a size. */
export interface Equatorial {
  /** Right ascension, degrees. */
  ra: number;
  /** Declination, degrees. */
  dec: number;
  /** Distance from the observer, kilometres. */
  distKm: number;
}

/** Ecliptic longitude/latitude to right ascension/declination (Meeus 13.3–13.4). */
export function toEquatorial(lon: number, lat: number, eps: number, distKm: number): Equatorial {
  return {
    ra: norm360(atan2(sin(lon) * cos(eps) - tan(lat) * sin(eps), cos(lon))),
    dec: asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)),
    distKm,
  };
}

/** Greenwich mean sidereal time in degrees (Meeus 12.4). */
export function siderealTime(at: Date): number {
  const jd = julianDay(at);
  const t = (jd - 2451545) / 36525;
  return norm360(
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t - (t * t * t) / 38710000,
  );
}

/** Where on Earth we are standing. */
export interface Site {
  /** Degrees north. */
  lat: number;
  /** Degrees east. */
  lon: number;
  /** Metres above sea level. */
  elevationM: number;
}

/**
 * Geocentric to topocentric (Meeus ch. 40).
 *
 * For the sun this is a rounding error. For the moon it is not: it sits close
 * enough that an observer on the surface sees it up to a degree away from where
 * the centre of the Earth would — nearly two full moon-widths, and far more
 * than the whole width of the partial eclipse this app reports. Skipping this
 * step is the single easiest way to get an eclipse wrong.
 */
export function topocentric(body: Equatorial, at: Date, site: Site): Equatorial {
  // Observer's distance from the Earth's centre, split into the components
  // parallel to the axis and to the equator, on the IAU 1976 ellipsoid.
  const u = Math.atan(0.99664719 * tan(site.lat));
  const rhoSin = 0.99664719 * Math.sin(u) + (site.elevationM / 6378140) * sin(site.lat);
  const rhoCos = Math.cos(u) + (site.elevationM / 6378140) * cos(site.lat);

  const parallax = 6378.14 / body.distKm; // sin of the equatorial horizontal parallax
  const h = norm360(siderealTime(at) + site.lon - body.ra); // local hour angle

  const dRa = atan2(-rhoCos * parallax * sin(h), cos(body.dec) - rhoCos * parallax * cos(h));
  const dec = atan2(
    (sin(body.dec) - rhoSin * parallax) * cos(dRa),
    cos(body.dec) - rhoCos * parallax * cos(h),
  );
  return { ra: norm360(body.ra + dRa), dec, distKm: body.distKm };
}

/**
 * Geometric altitude above the horizon, degrees. No refraction: the callers
 * that need it (sunset) apply the standard allowance themselves, so that the
 * one place it is assumed is the one place it is documented.
 */
export function altitude(body: Equatorial, at: Date, site: Site): number {
  const h = norm360(siderealTime(at) + site.lon - body.ra);
  return asin(sin(site.lat) * sin(body.dec) + cos(site.lat) * cos(body.dec) * cos(h));
}

/** Angular distance between two positions on the sky, degrees. */
export function separation(a: Equatorial, b: Equatorial): number {
  return acos(sin(a.dec) * sin(b.dec) + cos(a.dec) * cos(b.dec) * cos(a.ra - b.ra));
}

/** Apparent radius of a body of the given true radius, at the given distance. */
export function apparentRadius(radiusKm: number, distKm: number): number {
  return asin(radiusKm / distKm);
}

/**
 * Bisect a monotonic-in-this-window predicate down to the second.
 *
 * Both callers here — sunset, and an eclipse contact — are looking for the
 * moment a smoothly moving quantity crosses a threshold, inside a bracket they
 * already know contains exactly one crossing. Forty halvings takes a twelve-hour
 * bracket well below a millisecond, so the limit is the ephemeris, not this.
 */
export function bisect(
  fromMs: number,
  toMs: number,
  holdsAt: (at: Date) => boolean,
): Date {
  let lo = fromMs;
  let hi = toMs;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (holdsAt(new Date(mid))) lo = mid;
    else hi = mid;
  }
  return new Date((lo + hi) / 2);
}
