import { DAYS, NIGHTS } from './data';
import { bandFrom, bandGenre, bandListen } from './band-meta';
import type { FestivalDay, NightId, SetSlot } from './types';

/**
 * DBE runs 12–15 August 2026 in Eastern European Summer Time (UTC+3).
 * Converting each set to an absolute UTC instant lets "now / next", the
 * reminders and the calendar export line up regardless of the viewer's own
 * device timezone.
 */
const FEST_UTC_OFFSET_H = 3;

export function festivalInstant(isoDate: string, hhmm: string): Date {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const day = h < 8 ? d + 1 : d; // small-hours sets roll into the next date
  return new Date(Date.UTC(y, mo - 1, day, h - FEST_UTC_OFFSET_H, mi));
}

/**
 * Convert "HH:MM" into minutes from a noon anchor so that sets running past
 * midnight stay monotonically ordered (e.g. 01:00 -> next day).
 * Anything before 08:00 is considered part of the previous evening.
 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  let minutes = h * 60 + m - 12 * 60; // anchor at noon
  if (minutes < -4 * 60) minutes += 24 * 60; // before 08:00 => after midnight
  return minutes;
}

export function slotId(dayId: NightId, band: string): string {
  return `${dayId}::${band}`;
}

/** Resolve a band link: curated URL if present, otherwise a web search. */
export function bandLink(band: string, link?: string): string {
  if (link) return link;
  return `https://duckduckgo.com/?q=${encodeURIComponent(`${band} band official`)}`;
}

export function buildSlots(day: FestivalDay): SetSlot[] {
  return day.sets.map((raw) => ({
    id: slotId(day.id, raw.band),
    band: raw.band,
    night: NIGHTS[day.id],
    dayId: day.id,
    startLabel: raw.start,
    endLabel: raw.end,
    tba: raw.tba === true,
    note: raw.note,
    link: raw.link === null ? undefined : bandLink(raw.band, raw.link),
    listen: raw.listen === null ? undefined : (raw.listen ?? bandListen(raw.band)),
    genre: bandGenre(raw.band),
    from: bandFrom(raw.band),
    start: toMinutes(raw.start),
    end: toMinutes(raw.end),
    startAt: festivalInstant(day.date, raw.start),
    endAt: festivalInstant(day.date, raw.end),
  }));
}

export const ALL_SLOTS: SetSlot[] = DAYS.flatMap(buildSlots);

const slotById = new Map(ALL_SLOTS.map((s) => [s.id, s]));
export function getSlot(id: string): SetSlot | undefined {
  return slotById.get(id);
}

export function dayOf(dayId: string): FestivalDay | undefined {
  return DAYS.find((d) => d.id === dayId);
}

/** Format noon-anchored timeline minutes back into a "HH:MM" wall-clock label. */
export function minutesToLabel(min: number): string {
  let total = min + 12 * 60; // undo noon anchor
  total = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export interface Changeover {
  from: SetSlot;
  to: SetSlot;
  /** Minutes between one set ending and the next starting. */
  minutes: number;
}

/**
 * The breathers between consecutive sets on the night. With one stage there is
 * nothing to clash — the useful reading is the other way round: where the gaps
 * are, so you know when to eat, smoke, or get to the front for the next one.
 */
export function changeovers(slots: SetSlot[]): Changeover[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start);
  const out: Changeover[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (from.dayId !== to.dayId) continue;
    out.push({ from, to, minutes: Math.max(0, to.start - from.end) });
  }
  return out;
}

/** Every set on a night, in running order. */
export function nightSlots(dayId: string): SetSlot[] {
  return ALL_SLOTS.filter((s) => s.dayId === dayId).sort((a, b) => a.start - b.start);
}

/** The span from the night's first downbeat to its last note, in minutes. */
export function nightLength(dayId: string): number {
  const slots = nightSlots(dayId);
  if (slots.length === 0) return 0;
  return Math.max(...slots.map((s) => s.end)) - Math.min(...slots.map((s) => s.start));
}
