import type { BandMeta } from './types';

/**
 * Descriptive metadata for the acts on the bill, keyed by exact band name.
 *
 * Kept as a side table (rather than inline in `data.ts`) so the line-up stays a
 * clean transcription of the posters. Genres and countries are only listed
 * where they're well established for the act; anything we're unsure about is
 * simply omitted and the UI degrades gracefully. Every act still gets a working
 * "listen" affordance via the Spotify-search fallback in `bandListen()`.
 */
export const BAND_META: Record<string, BandMeta> = {
  // ---- 12.08 · Opening Ceremony ----
  HAMLET: { genre: 'Mask theatre / live score', from: 'Romania' },

  // ---- 13.08 ----
  Årabrot: { genre: 'Noise rock / post-punk', from: 'Norway' },
  Evoken: { genre: 'Funeral doom metal', from: 'USA' },
  Kwoon: { genre: 'Dream pop / post-rock', from: 'France' },
  Wolvennest: { genre: 'Occult psych / ritual doom', from: 'Belgium' },

  // ---- 14.08 ----
  Pothamus: { genre: 'Ritual post-metal', from: 'Belgium' },
  Heretoir: { genre: 'Post-black metal / blackgaze', from: 'Germany' },
  Mesarthim: { genre: 'Atmospheric black metal / synth', from: 'Australia' },
  'This Will Destroy You': { genre: 'Post-rock', from: 'USA' },

  // ---- 15.08 ----
  // "Opia" is on the bill without a genre we can state with confidence — the
  // UI degrades gracefully and still offers a listen link.
  Skuggsjá: { genre: 'Norse folk / black metal', from: 'Norway' },
  'The Kilimanjaro Darkjazz Ensemble': { genre: 'Dark jazz / cinematic doom', from: 'Netherlands' },
  "Old Man's Child": { genre: 'Symphonic black metal', from: 'Norway' },
};

/** Genre label for a band, if we have one. */
export function bandGenre(band: string): string | undefined {
  return BAND_META[band]?.genre;
}

/** Country of origin for a band, if we have one. */
export function bandFrom(band: string): string | undefined {
  return BAND_META[band]?.from;
}

/**
 * A "listen" link for a band: the curated one if present, otherwise a Spotify
 * search — a real, working URL for every act without inventing specific IDs.
 */
export function bandListen(band: string): string {
  const curated = BAND_META[band]?.listen;
  if (curated) return curated;
  return `https://open.spotify.com/search/${encodeURIComponent(band)}`;
}
