export type NightId = 'ceremony' | 'thu' | 'fri' | 'sat';

/**
 * Dark Bombastic Evening runs on a single stage, so a "night" — not a stage —
 * is the axis that identifies a set. Each night carries its own ink so the
 * timeline, share images and recap stay legible without inventing venues.
 */
export interface Night {
  id: NightId;
  name: string;
  /** Short label for chips and the sticky timeline header. */
  short: string;
  color: string;
}

export interface RawSet {
  band: string;
  /** "HH:MM" 24h. Times before ~08:00 are treated as after midnight. */
  start: string;
  end: string;
  /**
   * True while the official running order is still unannounced and this slot is
   * the app's own provisional placement. The UI marks every such set so nobody
   * mistakes an estimate for a printed time.
   */
  tba?: boolean;
  /**
   * Official website or social media URL. Omit for a web-search fallback; use
   * null for a new or one-off event that should not link anywhere yet.
   */
  link?: string | null;
  /**
   * Direct listening URL. Omit for the band metadata / Spotify fallback; use
   * null when there is no recording or meaningful search result yet.
   */
  listen?: string | null;
  /** One line of context — used for the opening ceremony and other one-offs. */
  note?: string;
}

/** Optional per-band descriptive metadata, keyed by band name in band-meta.ts. */
export interface BandMeta {
  /** Short genre label, e.g. "Funeral doom". */
  genre?: string;
  /** Country of origin, shown alongside the genre. */
  from?: string;
  /** A "listen" URL (Spotify/YouTube/Bandcamp). Falls back to a Spotify search. */
  listen?: string;
}

export interface FestivalDay {
  id: NightId;
  label: string;
  date: string; // ISO date of the day the bulk of sets start
  sets: RawSet[];
}

export interface SetSlot {
  id: string;
  band: string;
  night: Night;
  dayId: NightId;
  startLabel: string;
  endLabel: string;
  /** True while this slot is a provisional placement, not an announced time. */
  tba: boolean;
  /** One line of context, when the act has one. */
  note?: string;
  /** Official website / social link, or a web-search fallback when available. */
  link?: string;
  /** A curated or Spotify-search listening URL when available. */
  listen?: string;
  /** Short genre label, when known. */
  genre?: string;
  /** Country of origin, when known. */
  from?: string;
  /** minutes from a fixed noon anchor, monotonic across midnight */
  start: number;
  end: number;
  /** Absolute instant the set starts, in real (UTC) time. */
  startAt: Date;
  /** Absolute instant the set ends, in real (UTC) time. */
  endAt: Date;
}
