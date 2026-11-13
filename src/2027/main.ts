import './style.css';
import { FESTIVAL_2027 as F, NIGHTS_2027, venueMidnight } from './data';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href: string, text: string, external = true): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href;
  if (external) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

const DAY_MS = 86_400_000;
const first = venueMidnight(NIGHTS_2027[0].date);
/** The morning after the last night: the edition is over. */
const over = new Date(venueMidnight(NIGHTS_2027[NIGHTS_2027.length - 1].date).getTime() + DAY_MS);

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
/** The ISO date is a calendar date, not an instant — format it as written. */
const asWritten = (iso: string) => new Date(iso + 'T00:00:00Z');

/** Which night is on right now at the venue, if any. */
function tonightId(now: Date): string | null {
  for (const n of NIGHTS_2027) {
    const start = venueMidnight(n.date).getTime();
    if (now.getTime() >= start && now.getTime() < start + DAY_MS) return n.id;
  }
  return null;
}

function renderCountdown(now: Date): HTMLElement {
  const wrap = el('div', 'countdown');
  wrap.setAttribute('role', 'status');
  if (now >= over) {
    wrap.append(el('span', 'countdown-word', 'The candles are out.'));
    return wrap;
  }
  if (now >= first) {
    wrap.append(el('span', 'countdown-word', 'It is happening now.'));
    return wrap;
  }
  const days = Math.ceil((first.getTime() - now.getTime()) / DAY_MS);
  wrap.append(
    el('span', 'countdown-num', String(days)),
    el('span', 'countdown-word', days === 1 ? 'night until the gate opens' : 'nights until the gate opens'),
  );
  return wrap;
}

function renderNight(n: (typeof NIGHTS_2027)[number], tonight: string | null): HTMLElement {
  const card = el('li', 'night');
  card.dataset.night = n.id;
  if (tonight === n.id) card.classList.add('is-tonight');

  const flame = el('span', 'flame');
  flame.setAttribute('aria-hidden', 'true');

  const head = el('div', 'night-head');
  head.append(
    el('span', 'night-numeral', `Night ${n.numeral}`),
    el('h2', 'night-day', weekday.format(asWritten(n.date))),
    el('span', 'night-date', dayMonth.format(asWritten(n.date))),
  );

  const body = el('div', 'night-body');
  body.append(el('span', 'tba', 'TBA'), el('p', 'night-note', 'Line-up to be announced.'));

  card.append(flame, head, body);
  return card;
}

function render(root: HTMLElement): void {
  const now = new Date();
  root.replaceChildren();

  const hero = el('header', 'hero');
  const mark = el('span', 'hero-mark');
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', F.name);
  hero.append(
    mark,
    el('p', 'hero-kicker', 'Peace and Love · DBE'),
    el('h1', 'hero-title', F.name),
    el('p', 'hero-year', String(F.year)),
  );
  const where = el('p', 'hero-where');
  where.append(
    el('span', 'hero-dates', '12–14 August'),
    link(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(F.mapQuery)}`,
      `${F.venue} · ${F.city}`,
    ),
  );
  hero.append(where, renderCountdown(now));

  const main = el('main');
  const list = el('ol', 'nights');
  list.setAttribute('aria-label', 'The three nights');
  const tonight = tonightId(now);
  for (const n of NIGHTS_2027) list.append(renderNight(n, tonight));
  const known = el('p', 'known');
  known.textContent =
    'That is everything announced so far: the dates and the house. ' +
    'Bands, times and tickets will appear here when the festival names them.';
  main.append(list, known);

  const footer = el('footer', 'foot');
  const back = el('p', 'foot-2026');
  back.append(link('../', '← The 2026 night planner', false));
  const official = el('p', 'foot-official');
  official.append(
    'The festival’s own word: ',
    link(F.siteUrl, 'darkbombasticevening.com'),
    ' · ',
    link(F.facebookUrl, 'Facebook'),
  );
  footer.append(
    back,
    official,
    el('p', 'foot-fine', 'Unofficial and fan-made · not affiliated with the festival.'),
  );

  root.append(hero, main, footer);
}

const app = document.getElementById('app');
if (app) {
  render(app);
  // The count is in days, so an hourly repaint keeps it honest in a tab left open.
  setInterval(() => render(app), 3_600_000);
}
