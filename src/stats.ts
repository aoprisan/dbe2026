import type { NightId, SetSlot } from './types';
import { DAYS } from './data';
import { ALL_SLOTS, getSlot } from './schedule';
import { selection } from './store';

/** A summary of the whole selection, for the "Your festival" panel. */
export interface FestivalStats {
  picks: number;
  /** Total time in front of the stage: the union of picked sets. */
  onSiteMin: number;
  nightsActive: number;
  /** Sets on the bill you have not picked. */
  skipped: number;
  fullest?: { label: string; count: number; total: number };
  perNight: Record<NightId, number>;
}

function pickedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s));
}

/** Total length of the union of a night's intervals (overlaps counted once). */
export function unionMinutes(slots: SetSlot[]): number {
  const intervals = slots.map((s) => [s.start, s.end] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [start, end] of intervals) {
    if (start > curEnd) {
      if (curEnd > -Infinity) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else {
      curEnd = Math.max(curEnd, end);
    }
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return total;
}

export function computeStats(): FestivalStats {
  const slots = pickedSlots();
  const perNight: Record<NightId, number> = { ceremony: 0, thu: 0, fri: 0, sat: 0 };
  const perDay = new Map<string, SetSlot[]>();

  for (const s of slots) {
    perNight[s.dayId] += 1;
    const list = perDay.get(s.dayId) ?? [];
    list.push(s);
    perDay.set(s.dayId, list);
  }

  let onSiteMin = 0;
  let fullest: { label: string; count: number; total: number } | undefined;
  for (const day of DAYS) {
    const list = perDay.get(day.id);
    if (!list || list.length === 0) continue;
    onSiteMin += unionMinutes(list);
    if (!fullest || list.length > fullest.count) {
      fullest = { label: day.label, count: list.length, total: day.sets.length };
    }
  }

  return {
    picks: slots.length,
    onSiteMin,
    nightsActive: perDay.size,
    skipped: ALL_SLOTS.length - slots.length,
    fullest,
    perNight,
  };
}
