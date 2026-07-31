import type { BandMeta } from './types';

/**
 * Descriptive metadata for the acts on the bill, keyed by exact band name.
 *
 * Kept as a side table (rather than inline in `data.ts`) so the line-up stays a
 * clean transcription of the posters. Genres and countries are only listed
 * where they're well established for the act; anything we're unsure about is
 * simply omitted and the UI degrades gracefully. Every act still gets a working
 * "listen" affordance via the Spotify-search fallback in `bandListen()`.
 *
 * Listen links point at Bandcamp wherever the act has a page there: full
 * streams for free, no account, and the money goes closer to the band than
 * anywhere else. Each URL below was verified against the act's own page (or
 * their label's, where the band keeps no page of their own). Deliberately links,
 * not embedded players: Bandcamp's embed is an iframe that needs a numeric
 * album id scraped by hand per record, only embeds single albums (never an
 * artist), and needs a live connection — a dead white box on the citadel hill
 * with no signal, in an app built to work offline. A link opens the same full
 * stream in the browser or Bandcamp app, at zero weight here.
 */
export const BAND_META: Record<string, BandMeta> = {
  // ---- 12.08 · Opening Ceremony ----
  // A stage production, not a recording artist — no listen page to point at.
  HAMLET: { genre: 'Mask theatre / live score', from: 'Romania' },

  // ---- 13.08 ----
  Årabrot: {
    genre: 'Noise rock / post-punk',
    from: 'Norway',
    listen: 'https://arabrot.bandcamp.com/',
  },
  // Evoken's own subdomain carries only merch; the music lives at
  // evokenofficial (Hypnagogia, Atra Mors, Shades of Night Descending).
  Evoken: {
    genre: 'Funeral doom metal',
    from: 'USA',
    listen: 'https://evokenofficial.bandcamp.com/',
  },
  Kwoon: {
    genre: 'Dream pop / post-rock',
    from: 'France',
    listen: 'https://kwoon.bandcamp.com/',
  },
  // The band's active page (carries 2025's "Procession"); the older
  // wolvennest subdomain stops at 2023.
  Wolvennest: {
    genre: 'Occult psych / ritual doom',
    from: 'Belgium',
    listen: 'https://wolvennestband.bandcamp.com/',
  },

  // ---- 14.08 ----
  Pothamus: {
    genre: 'Ritual post-metal',
    from: 'Belgium',
    listen: 'https://pothamus.bandcamp.com/',
  },
  Heretoir: {
    genre: 'Post-black metal / blackgaze',
    from: 'Germany',
    listen: 'https://heretoir.bandcamp.com/',
  },
  Mesarthim: {
    genre: 'Atmospheric black metal / synth',
    from: 'Australia',
    listen: 'https://mesarthim.bandcamp.com/',
  },
  'This Will Destroy You': {
    genre: 'Post-rock',
    from: 'USA',
    listen: 'https://thiswilldestroyyou.bandcamp.com/',
  },

  // ---- 15.08 ----
  // Opia keep no Bandcamp of their own; their one record streams in full on
  // their label's page, so the link goes straight to the album.
  Opia: {
    genre: 'Gothic doom metal',
    from: 'UK / Spain',
    listen: 'https://hammerheart.bandcamp.com/album/i-welcome-thee-eternal-sleep',
  },
  Skuggsjá: {
    genre: 'Norse folk / black metal',
    from: 'Norway',
    listen: 'https://skuggsja.bandcamp.com/',
  },
  'The Kilimanjaro Darkjazz Ensemble': {
    genre: 'Dark jazz / cinematic doom',
    from: 'Netherlands',
    listen: 'https://tkde.bandcamp.com/',
  },
  // No band-run page; their catalogue is spread across two label pages, so the
  // link goes to the latest record rather than pretending one label page is
  // "their" page. The Spotify fallback would scatter the same way.
  "Old Man's Child": {
    genre: 'Symphonic black metal',
    from: 'Norway',
    listen: 'https://centurymedia.bandcamp.com/album/slaves-of-the-world',
  },
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
