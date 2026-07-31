import { DAYS, FESTIVAL } from './data';
import type { FestivalDay } from './types';
import { fmtDuration, getSlot } from './schedule';
import { unionMinutes } from './stats';
import { selection } from './store';

/**
 * DBE sells the festival by the night, at a different price per night. With one
 * stage there is nothing to clash — the decision the app can actually settle is
 * the one you make before you travel: **which nights do I buy?**
 *
 * So this panel turns the selection into money. For every night it shows the
 * day-ticket price, what your picks on that night cost per set and per hour of
 * music, and what the nights you've chosen add up to — plus what each night you
 * haven't chosen would add if you talked yourself into it.
 */

const CURRENCY = 'lei';

export interface NightCost {
  day: FestivalDay;
  picks: number;
  /** Total sets on the bill that night. */
  total: number;
  /** Minutes of music among your picks (overlaps counted once). */
  minutes: number;
  /** Day-ticket price, or null while unannounced. */
  price: number | null;
  /** Price per picked set, or null when the price or the picks are missing. */
  perSet: number | null;
  /** Price per hour of picked music, or null when either side is missing. */
  perHour: number | null;
}

export function nightCosts(): NightCost[] {
  return DAYS.map((day) => {
    const picked = selection
      .ids()
      .map((id) => getSlot(id))
      .filter((s) => s && s.dayId === day.id)
      .map((s) => s!);
    const minutes = unionMinutes(picked);
    const price = day.price;
    return {
      day,
      picks: picked.length,
      total: day.sets.length,
      minutes,
      price,
      perSet: price != null && picked.length > 0 ? price / picked.length : null,
      perHour: price != null && minutes > 0 ? price / (minutes / 60) : null,
    };
  });
}

export interface TicketTotals {
  /** Nights you have at least one pick on. */
  chosen: NightCost[];
  /** Nights you have no picks on. */
  untouched: NightCost[];
  /** Sum of the published prices across your chosen nights. */
  total: number;
  /** True when a chosen night has no published price yet. */
  hasUnpriced: boolean;
  /** Sum of every published price on the bill. */
  fullRun: number;
}

export function ticketTotals(): TicketTotals {
  const costs = nightCosts();
  const chosen = costs.filter((c) => c.picks > 0);
  return {
    chosen,
    untouched: costs.filter((c) => c.picks === 0),
    total: chosen.reduce((sum, c) => sum + (c.price ?? 0), 0),
    hasUnpriced: chosen.some((c) => c.price == null),
    fullRun: costs.reduce((sum, c) => sum + (c.price ?? 0), 0),
  };
}

function money(n: number): string {
  return `${Math.round(n)} ${CURRENCY}`;
}

/* ---------- dialog ---------- */

let dialog: HTMLDialogElement | null = null;

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

export function openTickets(): void {
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'sheet tickets';
  d.setAttribute('aria-label', 'Tickets and nightly prices');

  const card = el('div', 'sheet-card');

  const head = el('div', 'sheet-head');
  head.appendChild(el('h2', 'sheet-title', '🎟 Tickets'));
  const close = el('button', 'sheet-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close tickets');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(
    el('p', 'sheet-sub', 'Day tickets, priced per night — and what your picks work out to.'),
  );

  const body = el('div', 'sheet-body');
  body.id = 'tickets-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  const body = dialog?.querySelector('#tickets-body');
  if (!body) return;
  body.innerHTML = '';

  const totals = ticketTotals();

  body.appendChild(renderNightList(nightCosts()));
  body.appendChild(renderTotals(totals));

  const buy = el('a', 'ticket-buy', '🎟 Buy on eventbook.ro');
  buy.href = FESTIVAL.ticketsUrl;
  buy.target = '_blank';
  buy.rel = 'noopener noreferrer';
  body.appendChild(buy);

  body.appendChild(
    el(
      'p',
      'sheet-hint',
      'Prices transcribed from the official ticket poster and shown for planning only — eventbook.ro is the source of truth, and fees or a full pass may change the maths.',
    ),
  );
}

function renderNightList(costs: NightCost[]): HTMLElement {
  const list = el('ul', 'ticket-list');

  for (const c of costs) {
    const li = el('li', 'ticket-row');
    li.style.setProperty('--c', c.day.id === 'ceremony' ? '#9d84c4' : 'var(--accent)');
    if (c.picks > 0) li.classList.add('is-chosen');

    const top = el('div', 'ticket-row-top');
    top.appendChild(el('span', 'ticket-night', c.day.label));
    top.appendChild(
      el(
        'span',
        'ticket-date',
        new Date(c.day.date + 'T00:00:00').toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
      ),
    );
    const price = el(
      'span',
      c.price == null ? 'ticket-price is-tba' : 'ticket-price',
      c.price == null ? 'soon' : money(c.price),
    );
    top.appendChild(price);
    li.appendChild(top);

    const meta = el('div', 'ticket-meta');
    meta.appendChild(
      el('span', 'ticket-chip', `${c.picks}/${c.total} ${c.total === 1 ? 'set' : 'sets'} picked`),
    );
    if (c.minutes > 0) meta.appendChild(el('span', 'ticket-chip', fmtDuration(c.minutes)));
    if (c.perSet != null) {
      meta.appendChild(el('span', 'ticket-chip', `${money(c.perSet)}/set`));
    }
    if (c.perHour != null) {
      meta.appendChild(el('span', 'ticket-chip', `${money(c.perHour)}/hour`));
    }
    if (c.picks === 0) {
      meta.appendChild(el('span', 'ticket-chip is-quiet', 'nothing picked yet'));
    }
    li.appendChild(meta);

    list.appendChild(li);
  }

  return list;
}

function renderTotals(t: TicketTotals): HTMLElement {
  const wrap = el('div', 'ticket-total');

  if (t.chosen.length === 0) {
    wrap.appendChild(
      el(
        'p',
        'sheet-empty',
        'Pick a few acts and this works out which nights you actually need a ticket for — and what they come to.',
      ),
    );
    return wrap;
  }

  const nights = t.chosen.length;
  const head = el('p', 'ticket-total-head');
  head.textContent = `${nights} ${nights === 1 ? 'night' : 'nights'} to buy`;
  wrap.appendChild(head);

  const sum = el('p', 'ticket-total-sum');
  sum.textContent = t.hasUnpriced ? `${money(t.total)} + ceremony (price soon)` : money(t.total);
  wrap.appendChild(sum);

  const names = t.chosen.map((c) => c.day.label).join(' · ');
  wrap.appendChild(el('p', 'ticket-total-note', names));

  if (t.untouched.length > 0) {
    wrap.appendChild(el('p', 'ticket-upsell-head', 'Talked into another night?'));
    const ul = el('ul', 'ticket-upsell');
    for (const c of t.untouched) {
      const li = el('li', 'ticket-upsell-item');
      li.appendChild(el('span', 'ticket-upsell-night', c.day.label));
      li.appendChild(
        el(
          'span',
          'ticket-upsell-cost',
          c.price == null
            ? '+ price soon'
            : `+ ${money(c.price)} for ${c.total} ${c.total === 1 ? 'set' : 'sets'}`,
        ),
      );
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    wrap.appendChild(
      el(
        'p',
        'ticket-total-note',
        `All four nights, at the published day prices: ${money(t.fullRun)}${
          DAYS.some((d) => d.price == null) ? ' + ceremony' : ''
        }.`,
      ),
    );
  }

  return wrap;
}
