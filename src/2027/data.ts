/**
 * Dark Bombastic Evening 2027 — everything the festival has said so far, which
 * is one poster: the dates and the house. No bands, no count of bands, no
 * times, no tickets. Anything not on that poster is left out rather than
 * guessed, and every night says so.
 */
export const FESTIVAL_2027 = {
  name: 'Dark Bombastic Evening',
  year: 2027,
  dates: '12–14 August 2027',
  /** As the poster prints it. */
  venue: 'RYMA',
  city: 'Alba Iulia, Romania',
  mapQuery: 'Poarta 7 by Ryma, Alba Iulia',
  siteUrl: 'https://darkbombasticevening.com',
  facebookUrl: 'https://www.facebook.com/profile.php?id=100066546990712',
};

export interface Night2027 {
  id: string;
  numeral: string;
  /** ISO date; the weekday is derived from it, never typed in. */
  date: string;
}

export const NIGHTS_2027: Night2027[] = [
  { id: 'n1', numeral: 'I', date: '2027-08-12' },
  { id: 'n2', numeral: 'II', date: '2027-08-13' },
  { id: 'n3', numeral: 'III', date: '2027-08-14' },
];

/**
 * Midnight at the venue on a given ISO date. August in Romania is Eastern
 * European Summer Time, UTC+3, so local midnight is 21:00 UTC the day before.
 */
export function venueMidnight(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, -3));
}
