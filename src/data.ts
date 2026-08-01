import type { FestivalDay, Night, NightId } from './types';

export const FESTIVAL = {
  name: 'Dark Bombastic Evening',
  shortName: 'DBE',
  edition: '12th Edition',
  /**
   * The RYMA spaces in the Alba Iulia citadel, listed on the map — and known
   * locally — as "Poarta 7 by Ryma", after Gate VII it is built into. Named
   * here exactly as the map names it, so the label in the header and the pin
   * the venue link opens are recognisably the same place.
   */
  venue: 'Poarta 7 by Ryma',
  location: 'Poarta 7 by Ryma · Alba Iulia, Romania',
  /**
   * Where in town, for anyone arriving without the map open: the venue is set
   * into the northern wall of the citadel at its seventh gate, off Str. Gemina
   * — a place you walk to through the fortress, not an address you drive to.
   */
  venueWhere: 'Alba Carolina Citadel, Gate VII · Str. Gemina',
  /**
   * The town on its own, for the share and recap images: their header line is
   * drawn on a 560px canvas and the full venue line does not fit, so it would
   * be cut mid-word rather than simply saying less.
   */
  city: 'Alba Iulia',
  dates: '12–15 August 2026',
  /**
   * "Starting at 6 PM", as printed on the poster — read as the first note
   * rather than as a gate an hour ahead of it, which is where the provisional
   * grid below now puts its opening set.
   */
  doors: '18:00',
  /** What the "open in Maps" link searches for: the venue's own map listing. */
  mapQuery: 'Poarta 7 by Ryma, Alba Iulia',
  ticketsUrl: 'https://eventbook.ro/music/bilete-dbe-12',
  /**
   * The festival's own site, as the festival itself lists it. Anything this app
   * deliberately does not carry — the official word on the running order, the
   * house rules, whatever changes late — is theirs to publish and ours to link.
   */
  siteUrl: 'https://darkbombasticevening.com',
  /**
   * The Facebook page, by its numeric profile id rather than a vanity handle:
   * the id is what the page resolves to and cannot be reassigned. This is where
   * the posters and the day-to-day announcements actually land first.
   */
  facebookUrl: 'https://www.facebook.com/profile.php?id=100066546990712',
};

/**
 * Where the citadel actually is, for everything that has to be computed rather
 * than fetched: the forecast lookup, the moon over each night, the sunset the
 * nights begin against, and the eclipse that clips the first one. The elevation
 * is the plateau the fortress stands on, not the Mureș valley below it.
 */
export const VENUE_SITE = {
  lat: 46.07,
  lon: 23.58,
  elevationM: 250,
  /** IANA zone — EEST (UTC+3) for all four nights. */
  timeZone: 'Europe/Bucharest',
} as const;

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
export const DATA_VERSION = '2026-08-01';

/**
 * The official running order has not been published yet — the posters give the
 * bill per night, the venue, and "starting at 6 PM", nothing more. That 6 PM is
 * taken at its word: it is when the music starts, not when a gate opens an hour
 * ahead of it. What is known beyond the poster: changeovers run about 25
 * minutes, and the night must end between 23:30 and 23:45 (see CURFEW). Every
 * set below is therefore placed on a provisional grid built from those numbers
 * (see PROVISIONAL_SLOTS), in the order the poster lists it, and flagged `tba`
 * so the whole UI can say so.
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
export const SET_MINUTES = 65;
export const CHANGEOVER_MINUTES = 25;

/**
 * The provisional shape of a band night: four sets with ~25-minute changeovers
 * between them, pinned at both ends — the first downbeat on the poster's 18:00
 * start, the last note at 23:35, inside the curfew. Four bands across those
 * 5h35m, minus three changeovers, is what makes a set 65 minutes rather than
 * the 50 an evening with more names on it would run. It lands on a 90-minute
 * cadence — 18:00, 19:30, 21:00, 22:30 — which is the shape you can plan a
 * night around. Used only while `tba` is set.
 */
export const PROVISIONAL_SLOTS: ReadonlyArray<{ start: string; end: string }> = [
  { start: '18:00', end: '19:05' },
  { start: '19:30', end: '20:35' },
  { start: '21:00', end: '22:05' },
  { start: '22:30', end: '23:35' },
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
 * Transcribed from the official Dark Bombastic Evening 12 line-up posters.
 * Bands are listed in poster order; times are provisional — see
 * RUNNING_ORDER_ANNOUNCED above. What a night costs is deliberately not here:
 * eventbook.ro sells the tickets and states the prices, and this app is for
 * people who already hold one.
 */
export const DAYS: FestivalDay[] = [
  {
    id: 'ceremony',
    label: 'Ceremony',
    date: '2026-08-12',
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
    sets: [
      { band: 'Årabrot', start: '18:00', end: '19:05', tba: true },
      { band: 'Evoken', start: '19:30', end: '20:35', tba: true },
      { band: 'Kwoon', start: '21:00', end: '22:05', tba: true },
      { band: 'Wolvennest', start: '22:30', end: '23:35', tba: true },
    ],
  },
  {
    id: 'fri',
    label: 'Night III',
    date: '2026-08-14',
    sets: [
      { band: 'Pothamus', start: '18:00', end: '19:05', tba: true },
      { band: 'Heretoir', start: '19:30', end: '20:35', tba: true },
      { band: 'Mesarthim', start: '21:00', end: '22:05', tba: true },
      { band: 'This Will Destroy You', start: '22:30', end: '23:35', tba: true },
    ],
  },
  {
    id: 'sat',
    label: 'Night IV',
    date: '2026-08-15',
    sets: [
      { band: 'Opia', start: '18:00', end: '19:05', tba: true },
      { band: 'Skuggsjá', start: '19:30', end: '20:35', tba: true },
      { band: 'The Kilimanjaro Darkjazz Ensemble', start: '21:00', end: '22:05', tba: true },
      { band: "Old Man's Child", start: '22:30', end: '23:35', tba: true },
    ],
  },
];
