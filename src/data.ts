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
  ticketsUrl: 'https://eventbook.ro/music/bilete-dbe-12',
  siteUrl: 'https://www.facebook.com/DarkBombasticEvening',
};

/**
 * Bump whenever the line-up or the running order below changes (a set added,
 * dropped or re-timed). Returning visitors whose last-seen stamp differs get a
 * one-time "line-up updated" banner so stale plans don't go unnoticed.
 */
export const DATA_VERSION = '2026-07-31';

/**
 * The official running order has not been published yet — the posters give the
 * bill per night, the venue, and "starting at 6 PM", nothing more. Every set
 * below is therefore placed on a provisional grid (see PROVISIONAL_SLOTS) in
 * the order the poster lists it, and flagged `tba` so the whole UI can say so.
 *
 * Flip this to false — and replace the times — the day the running order lands.
 */
export const RUNNING_ORDER_ANNOUNCED = false;

/**
 * The provisional shape of a band night: four sets from doors at 18:00 to the
 * small hours, with changeovers between them. Used only while `tba` is set.
 */
export const PROVISIONAL_SLOTS: ReadonlyArray<{ start: string; end: string }> = [
  { start: '18:30', end: '19:30' },
  { start: '20:00', end: '21:00' },
  { start: '21:30', end: '22:45' },
  { start: '23:15', end: '00:45' },
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
      { band: 'Årabrot', start: '18:30', end: '19:30', tba: true },
      { band: 'Evoken', start: '20:00', end: '21:00', tba: true },
      { band: 'Kwoon', start: '21:30', end: '22:45', tba: true },
      { band: 'Wolvennest', start: '23:15', end: '00:45', tba: true },
    ],
  },
  {
    id: 'fri',
    label: 'Night III',
    date: '2026-08-14',
    price: 375,
    sets: [
      { band: 'Pothamus', start: '18:30', end: '19:30', tba: true },
      { band: 'Heretoir', start: '20:00', end: '21:00', tba: true },
      { band: 'Mesarthim', start: '21:30', end: '22:45', tba: true },
      { band: 'This Will Destroy You', start: '23:15', end: '00:45', tba: true },
    ],
  },
  {
    id: 'sat',
    label: 'Night IV',
    date: '2026-08-15',
    price: 400,
    sets: [
      { band: 'Opia', start: '18:30', end: '19:30', tba: true },
      { band: 'Skuggsjá', start: '20:00', end: '21:00', tba: true },
      { band: 'The Kilimanjaro Darkjazz Ensemble', start: '21:30', end: '22:45', tba: true },
      { band: "Old Man's Child", start: '23:15', end: '00:45', tba: true },
    ],
  },
];

/** Nights that carry a published day-ticket price. */
export function pricedDays(): FestivalDay[] {
  return DAYS.filter((d) => d.price != null);
}
