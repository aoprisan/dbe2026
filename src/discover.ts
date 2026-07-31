import type { FestivalDay, SetSlot } from './types';
import { ALL_SLOTS, changeovers, fmtDuration, getSlot, nightSlots } from './schedule';
import { scoreAgainst, tasteProfile, type Suggestion } from './taste';
import { selection } from './store';

/**
 * One stage means no clashes — nothing to arbitrate. The question that *is*
 * open on a bill like this is the opposite one: which act are you about to walk
 * past? This panel answers it, twice over.
 *
 * **Match** ranks the sets you haven't picked against a TF-IDF model of the
 * genres you *have* picked, so the nudge is your own taste argued back at you
 * rather than a generic "you might also like". **Breathers** reads the same
 * night the other way round — where the gaps in your evening fall, and how long
 * you've got.
 */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

function pickedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s));
}

/**
 * Unpicked sets ranked against the taste your picks describe. Scored across the
 * whole bill (your taste doesn't reset at midnight) but returned for one night,
 * so the panel stays anchored to the night you're looking at.
 */
export function suggestionsFor(dayId: string): Suggestion[] {
  const picks = pickedSlots();
  if (picks.length === 0) return [];
  const profile = tasteProfile(picks);
  return ALL_SLOTS.filter((s) => s.dayId === dayId && !selection.has(s.id))
    .map((slot) => scoreAgainst(profile, slot))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.slot.start - b.slot.start);
}

/** Unpicked, taste-matching sets across the whole bill, best first. */
export function topSuggestions(limit: number): Suggestion[] {
  const picks = pickedSlots();
  if (picks.length === 0) return [];
  const profile = tasteProfile(picks);
  return ALL_SLOTS.filter((s) => !selection.has(s.id))
    .map((slot) => scoreAgainst(profile, slot))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.slot.start - b.slot.start)
    .slice(0, limit);
}

/**
 * The panel under the day tabs: a taste read on what you're skipping tonight,
 * plus the breathers between the sets you did pick.
 */
export function renderDiscover(day: FestivalDay): HTMLElement {
  const panel = el('section', 'discover-panel');

  if (selection.size() === 0) {
    panel.classList.add('hint');
    panel.appendChild(
      el(
        'p',
        'hint-text',
        'Tap an act to add it to your night. Once you have a few, this panel reads your taste back to you and flags the ones you’re about to walk past.',
      ),
    );
    return panel;
  }

  const picksTonight = pickedSlots().filter((s) => s.dayId === day.id);
  const suggestions = suggestionsFor(day.id);

  const head = el('div', 'discover-head');
  head.appendChild(el('span', 'discover-icon', '🜂'));
  head.appendChild(
    el(
      'p',
      'discover-title',
      picksTonight.length === 0
        ? `Nothing picked on ${day.label} yet`
        : `${picksTonight.length} of ${day.sets.length} picked on ${day.label}`,
    ),
  );
  panel.appendChild(head);

  if (suggestions.length > 0) {
    panel.appendChild(renderMatches(suggestions.slice(0, 3)));
  } else if (picksTonight.length === day.sets.length) {
    panel.appendChild(
      el('p', 'discover-note', 'You’re taking the whole night. Nothing left to talk you into.'),
    );
  } else {
    panel.appendChild(
      el(
        'p',
        'discover-note',
        'Nothing left on this night that matches the genres you’ve picked — which doesn’t mean it isn’t worth your time.',
      ),
    );
  }

  const breathers = renderBreathers(picksTonight);
  if (breathers) panel.appendChild(breathers);

  return panel;
}

function renderMatches(suggestions: Suggestion[]): HTMLElement {
  const wrap = el('div', 'discover-block');
  wrap.appendChild(el('p', 'discover-block-head', 'Matches your taste, still unpicked'));

  const list = el('ul', 'discover-list');
  for (const s of suggestions) list.appendChild(renderMatch(s));
  wrap.appendChild(list);
  return wrap;
}

function renderMatch(s: Suggestion): HTMLElement {
  const li = el('li', 'discover-item');
  li.style.setProperty('--c', s.slot.night.color);

  const top = el('div', 'discover-item-top');
  const band = s.slot.link
    ? el('a', 'discover-band', s.slot.band)
    : el('span', 'discover-band', s.slot.band);
  if (band instanceof HTMLAnchorElement) {
    band.href = s.slot.link!;
    band.target = '_blank';
    band.rel = 'noopener noreferrer';
  }
  top.appendChild(band);
  top.appendChild(
    el(
      'span',
      'discover-when',
      `${s.slot.tba ? '~' : ''}${s.slot.startLabel}${s.slot.genre ? ` · ${s.slot.genre}` : ''}`,
    ),
  );
  li.appendChild(top);

  const why = el(
    'p',
    'discover-why',
    s.matched.length > 0
      ? `Shares ${s.matched.slice(0, 3).join(', ')} with what you’ve already picked.`
      : 'Close to the rest of your bill.',
  );
  li.appendChild(why);

  const add = el('button', 'discover-add', '+ Add');
  add.type = 'button';
  add.setAttribute('aria-label', `Add ${s.slot.band} to your picks`);
  add.addEventListener('click', () => selection.add(s.slot.id));
  li.appendChild(add);

  return li;
}

/**
 * The gaps between the sets you picked tonight. Only worth showing when you
 * have at least two picks and there is real time between them.
 */
function renderBreathers(picks: SetSlot[]): HTMLElement | null {
  if (picks.length < 2) return null;
  const gaps = changeovers(picks).filter((c) => c.minutes >= 10);
  if (gaps.length === 0) return null;

  const wrap = el('div', 'discover-block');
  wrap.appendChild(el('p', 'discover-block-head', 'Your breathers'));

  const list = el('ul', 'breather-list');
  for (const g of gaps) {
    const li = el('li', 'breather-item');
    li.appendChild(el('span', 'breather-span', `${g.from.endLabel}–${g.to.startLabel}`));
    li.appendChild(el('span', 'breather-gap', fmtDuration(g.minutes)));
    li.appendChild(el('span', 'breather-between', `${g.from.band} → ${g.to.band}`));
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

/** Total minutes of music on a night, for the night-tab captions. */
export function nightSetCount(dayId: string): number {
  return nightSlots(dayId).length;
}
