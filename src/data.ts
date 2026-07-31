import type { FestivalDay, Night, NightId } from './types';

export const FESTIVAL = {
  name: 'Dark Bombastic Evening',
  shortName: 'DBE',
  edition: '12th Edition',
  venue: 'RÂMA',
  location: 'RÂMA · Alba Iulia, Romania',
  dates: '12–15 August 2026',
  /** Doors / first note, as printed on the poster. */
  doors: '18:00',
  /**
   * What the "open in Maps" link searches for. A place name rather than a pin:
   * the exact coordinates of the site are not published, and a search degrades
   * to the right town instead of dropping a marker in the wrong field. Replace
   * with "lat,lon" once the venue's own pin is confirmed.
   */
  mapQuery: 'RÂMA, Alba Iulia, Romania',
  ticketsUrl: 'https://eventbook.ro/music/bilete-dbe-12',
  siteUrl: 'https://www.facebook.com/DarkBombasticEvening',
};

/**
 * Google Maps' cross-platform URL: the same link opens the native app on
 * Android and iOS and the web map on desktop, so one anchor covers everyone.
 */
export function mapsUrl(): string {
  const q = encodeURIComponent(FESTIVAL.mapQuery);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/**
 * Bump whenever the line-up or the running order below changes (a set added,
 * dropped or re-timed). Returning visitors whose last-seen stamp differs get a
 * one-time "line-up updated" banner so stale plans don't go unnoticed.
 */
export const DATA_VERSION = '2026-07-31b';

/**
 * The official running order has not been published yet — the posters give the
 * bill per night, the venue, and "starting at 6 PM", nothing more. What is
 * known beyond the poster: sets run about 50 minutes, changeovers about 25, and
 * the night must end between 23:30 and 23:45 (see CURFEW). Every set below is
 * therefore placed on a provisional grid built from those three numbers (see
 * PROVISIONAL_SLOTS), in the order the poster lists it, and flagged `tba` so
 * the whole UI can say so.
 *
 * Flip this to false — and replace the times — the day the running order lands.
 */
export const RUNNING_ORDER_ANNOUNCED = false;

/**
 * The night has to be over between 23:30 and 23:45 — the venue's noise
 * agreement with the police, not a soft target. Nothing on the provisional grid
 * may be placed past it, and the last note is set inside this window rather
 * than against its far edge.
 */
export const CURFEW = { from: '23:30', to: '23:45' } as const;

/** Set length and changeover used to build the provisional grid, in minutes. */
export const SET_MINUTES = 50;
export const CHANGEOVER_MINUTES = 25;

/**
 * The provisional shape of a band night: four ~50-minute sets with ~25-minute
 * changeovers between them, laid backwards from the curfew so the last note
 * falls at 23:35. That fixes the first downbeat at 19:00 — an hour after doors
 * — and gives a 75-minute cadence you can plan a night around. Used only while
 * `tba` is set.
 */
export const PROVISIONAL_SLOTS: ReadonlyArray<{ start: string; end: string }> = [
  { start: '19:00', end: '19:50' },
  { start: '20:15', end: '21:05' },
  { start: '21:30', end: '22:20' },
  { start: '22:45', end: '23:35' },
];

/**
 * DBE plays one stage, so the nights themselves carry the colour. Four muted
 * hues drawn from the poster's own palette — candle gold, ember, moonlight,
 * violet — enough to tell the nights apart without breaking the black.
 */
export const NIGHTS: Record<NightId, Night> = {
  ceremony: { id: 'ceremony', name: 'Opening Ceremony', short: 'Ceremony', color: '#9d84c4' },
  thu: { id: 'thu', name: 'Second Night', short: 'Night II', color: '#c9a961' },
  fri: { id: 'fri', name: 'Third Night', short: 'Night III', color: '#6fb0a8' },
  sat: { id: 'sat', name: 'Fourth Night', short: 'Night IV', color: '#c97a4a' },
};

/**
 * Transcribed from the official Dark Bombastic Evening 12 posters (line-up and
 * day-ticket prices). Bands are listed in poster order; times are provisional
 * — see RUNNING_ORDER_ANNOUNCED above.
 */
export const DAYS: FestivalDay[] = [
  {
    id: 'ceremony',
    label: 'Ceremony',
    date: '2026-08-12',
    price: null, // "soon" on the ticket poster
    sets: [
      {
        band: 'HAMLET',
        start: '21:00',
        end: '22:30',
        tba: true,
        link: null,
        listen: null,
        note: 'Shakespeare staged in the extreme — masks, no text, live score by Sol Faur & Norbert Lovasz.',
      },
    ],
  },
  {
    id: 'thu',
    label: 'Night II',
    date: '2026-08-13',
    price: 350,
    sets: [
      { band: 'Årabrot', start: '19:00', end: '19:50', tba: true },
      { band: 'Evoken', start: '20:15', end: '21:05', tba: true },
      { band: 'Kwoon', start: '21:30', end: '22:20', tba: true },
      { band: 'Wolvennest', start: '22:45', end: '23:35', tba: true },
    ],
  },
  {
    id: 'fri',
    label: 'Night III',
    date: '2026-08-14',
    price: 375,
    sets: [
      { band: 'Pothamus', start: '19:00', end: '19:50', tba: true },
      { band: 'Heretoir', start: '20:15', end: '21:05', tba: true },
      { band: 'Mesarthim', start: '21:30', end: '22:20', tba: true },
      { band: 'This Will Destroy You', start: '22:45', end: '23:35', tba: true },
    ],
  },
  {
    id: 'sat',
    label: 'Night IV',
    date: '2026-08-15',
    price: 400,
    sets: [
      { band: 'Opia', start: '19:00', end: '19:50', tba: true },
      { band: 'Skuggsjá', start: '20:15', end: '21:05', tba: true },
      { band: 'The Kilimanjaro Darkjazz Ensemble', start: '21:30', end: '22:20', tba: true },
      { band: "Old Man's Child", start: '22:45', end: '23:35', tba: true },
    ],
  },
];

/** Nights that carry a published day-ticket price. */
export function pricedDays(): FestivalDay[] {
  return DAYS.filter((d) => d.price != null);
}
