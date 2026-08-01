import {
  DAYS,
  FESTIVAL,
  DATA_VERSION,
  RUNNING_ORDER_ANNOUNCED,
  CURFEW,
  SET_MINUTES,
  CHANGEOVER_MINUTES,
  mapsUrl,
} from './data';
import type { FestivalDay, SetSlot } from './types';
import {
  ALL_SLOTS,
  buildSlots,
  festivalInstant,
  getSlot,
  minutesToLabel,
} from './schedule';
import { moonLabel, moonTitle, nightMoon } from './moon';
import { sunForDay, sunsetLabel, sunsetTitle } from './sun';
import { eclipseForDay, eclipseLabel, eclipseTitle } from './eclipse';
import { renderDiscover } from './discover';
import { openGuide } from './guide';
import { openCrew, friendsForSlot, subscribeCrew, initials } from './crew';
import {
  selection,
  loadActiveDay,
  saveActiveDay,
  loadSeenVersion,
  saveSeenVersion,
} from './store';
import { shareSelection } from './share';
import { openShareApp } from './share-app';
import { openAsk } from './ask';
import { sharePicksLink } from './picks-link';
import { computeLive, fmtCountdown } from './live';
import { computeStats } from './stats';
import {
  fmtMm,
  openWeather,
  setWeatherIcons,
  subscribeForecast,
  ensureForecast,
  startForecastAutoRefresh,
} from './weather';
import { exportCalendar, clearCalendar, hasExported } from './calendar';
import {
  CANDLE,
  openJournal,
  rating as journalRating,
  subscribeJournal,
  unratedCount,
} from './journal';
import * as notify from './notify';
import { subscribeWallet, ticketsForNight, walletTickets } from './wallet';
import { openTicketViewer, openWallet, openWalletSheet } from './wallet-ui';

// Vertical scale of the running order. DBE plays one stage, so each set gets the
// full width of the sheet and needs far less height than a three-column grid —
// this is sized so a 60-minute set comfortably holds its name, genre, weather
// and action pills, and longer sets simply get taller.
const PX_PER_MIN = 2;

let activeDayId = loadActiveDay(DAYS[0].id);
let onlyPicks = false;
// The filters / options / discovery panel under the night tabs is folded away
// by default; the header keeps showing live counts while it's closed.
let controlsOpen = false;
// The "Your festival" stats panel at the foot of the sheet is likewise collapsed.
let statsOpen = false;
let bannerDismissed = false;
let provisionalDismissed = false;

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

function activeDay(): FestivalDay {
  return DAYS.find((d) => d.id === activeDayId) ?? DAYS[0];
}

/** All selected slots across the whole festival. */
function selectedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s));
}

export function mount(root: HTMLElement): void {
  root.innerHTML = '';
  root.appendChild(renderHeader());
  root.appendChild(renderDayTabs());
  root.appendChild(renderControls());

  const banner = el('div', 'update-banner-wrap');
  banner.id = 'update-banner';
  root.appendChild(banner);

  const main = el('main', 'content');
  main.id = 'content';
  root.appendChild(main);

  root.appendChild(renderShareBar());

  // Host for in-app reminder toasts (the visible counterpart to the native OS
  // notification). Fixed to the viewport, filled by the reminder subscription.
  const toasts = el('div', 'toast-host');
  toasts.id = 'toast-host';
  toasts.setAttribute('aria-live', 'polite');
  root.appendChild(toasts);

  // Surface an in-app toast whenever a picked set enters its reminder window.
  notify.onReminder(({ slot, lead }) => showReminderToast(slot, lead));

  selection.subscribe(() => {
    renderContent(main);
    renderLiveBar();
    refreshChrome();
    updateJournalDot(); // picking a set that already played can light the dot
  });

  // Friend overlays ride on the running order; repaint when the crew changes.
  subscribeCrew(() => renderContent(main));

  // An imported ticket puts a "show my ticket" chip on that night's header and
  // lights the bottom bar's own ticket button.
  subscribeWallet(() => {
    renderContent(main);
    updateTicketBtn();
  });

  // Ratings show on the timeline, and the journal button's dot tracks them.
  subscribeJournal(() => {
    renderContent(main);
    updateJournalDot();
  });

  // Per-set weather icons need the hourly forecast; load it in the background
  // and re-render once it arrives (from cache, then network).
  subscribeForecast(() => renderContent(main));
  void ensureForecast();
  startForecastAutoRefresh();

  renderUpdateBanner();
  renderClock();
  renderLiveBar();
  renderContent(main);
  refreshChrome();
  updateJournalDot();
  updateTicketBtn();

  // The clock ticks every second; the "now" line and "Now / Next" bar creep
  // forward on their own while the app sits open all evening.
  window.setInterval(renderClock, 1_000);
  window.setInterval(() => {
    positionNowLine();
    renderLiveBar();
    updateJournalDot(); // sets finish while the app sits open
  }, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderClock();
      positionNowLine();
      renderLiveBar();
    }
  });
}

function renderHeader(): HTMLElement {
  const header = el('header', 'app-header');
  const title = el('div', 'brand');
  title.appendChild(el('h1', 'brand-name', FESTIVAL.name));
  const sub = el('p', 'brand-sub');
  // No "·" before the link: it takes a line of its own, and a separator left
  // stranded at the end of this one reads as a typo. The pin separates instead.
  sub.append(`${FESTIVAL.edition} · ${FESTIVAL.dates}`);
  sub.appendChild(renderMapLink());
  title.appendChild(sub);

  // Live wall clock — the current date and time, ticking while the app is open.
  const clock = el('p', 'brand-clock');
  clock.id = 'header-clock';
  title.appendChild(clock);

  header.appendChild(title);

  // The right-hand corner of the masthead: what you have picked, and the way
  // back to the explanation of how any of it works.
  const right = el('div', 'header-right');

  const stats = el('div', 'header-stats');
  stats.id = 'header-stats';
  right.appendChild(stats);

  right.appendChild(renderGuideBadge());
  header.appendChild(right);
  return header;
}

/**
 * The "?" in the corner. The guide opens itself once on a first visit; this is
 * where it lives afterwards, because the corner of the header is where a person
 * who is lost has always looked for it.
 */
function renderGuideBadge(): HTMLElement {
  const btn = el('button', 'header-help', '?');
  btn.type = 'button';
  btn.title = 'How this planner works';
  btn.setAttribute('aria-label', 'How this planner works');
  btn.addEventListener('click', () => openGuide());
  return btn;
}

/**
 * The venue block, but tappable: it hands the site straight to Google Maps for
 * directions. An anchor rather than a button so it behaves like every other
 * link on the phone — long-press to copy, open in a new tab, share it on.
 *
 * The gate and street ride inside the same anchor rather than beside it: they
 * are the answer to the same question, and folding them in makes the whole
 * two-line block one comfortable thumb target instead of a 0.7rem strip.
 */
function renderMapLink(): HTMLAnchorElement {
  const a = el('a', 'brand-map') as HTMLAnchorElement;
  a.href = mapsUrl();
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = 'Open the venue in Google Maps';
  a.setAttribute(
    'aria-label',
    `Open ${FESTIVAL.location}, ${FESTIVAL.venueWhere}, in Google Maps`,
  );

  const line = el('span', 'brand-map-line');
  line.appendChild(el('span', 'brand-map-pin', '📍'));
  line.append(FESTIVAL.location);
  a.appendChild(line);

  a.appendChild(el('span', 'brand-map-where', FESTIVAL.venueWhere));
  return a;
}

/**
 * Where the festival speaks for itself. This planner is fan-made and says so in
 * the same breath, so the footer that admits it is exactly where the official
 * addresses belong: the moment anything here looks wrong or out of date, these
 * are the two places that outrank it.
 */
export function renderOfficialLinks(): HTMLElement {
  const wrap = el('p', 'footer-official');
  wrap.append('Official: ');

  const link = (href: string, label: string, title: string): HTMLAnchorElement => {
    const a = el('a', undefined, label) as HTMLAnchorElement;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = title;
    return a;
  };

  wrap.appendChild(
    link(FESTIVAL.siteUrl, 'darkbombasticevening.com', `${FESTIVAL.name} — official site`),
  );
  wrap.append(' · ');
  wrap.appendChild(
    link(FESTIVAL.facebookUrl, 'Facebook', `${FESTIVAL.name} on Facebook`),
  );
  return wrap;
}

function renderDayTabs(): HTMLElement {
  const nav = el('nav', 'day-tabs');
  nav.setAttribute('aria-label', 'Festival nights');
  for (const day of DAYS) {
    const btn = el('button', 'day-tab', day.label);
    btn.dataset.day = day.id;
    btn.style.setProperty('--c', dayColor(day));
    const date = new Date(day.date + 'T00:00:00');
    btn.appendChild(
      el(
        'span',
        'day-date',
        date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      ),
    );
    if (day.id === activeDayId) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeDayId = day.id;
      saveActiveDay(day.id);
      refreshChrome();
      renderContent(document.getElementById('content') as HTMLElement);
    });
    nav.appendChild(btn);
  }
  return nav;
}

function dayColor(day: FestivalDay): string {
  return { ceremony: '#9d84c4', thu: '#c9a961', fri: '#6fb0a8', sat: '#c97a4a' }[day.id];
}

function renderToolbar(): HTMLElement {
  const wrap = el('div', 'toolbar-wrap');
  const bar = el('div', 'toolbar');

  // Left group: the primary "Only my picks" filter stays always visible.
  const toggles = el('div', 'tb-group');

  const pickToggle = el('label', 'switch');
  const cb = el('input') as HTMLInputElement;
  cb.type = 'checkbox';
  cb.addEventListener('change', () => {
    onlyPicks = cb.checked;
    renderContent(document.getElementById('content') as HTMLElement);
  });
  pickToggle.appendChild(cb);
  pickToggle.appendChild(el('span', 'switch-track'));
  pickToggle.appendChild(el('span', 'switch-label', 'Only my picks'));
  toggles.appendChild(pickToggle);

  toggles.appendChild(renderSearch());

  bar.appendChild(toggles);

  // Collapsible panel: secondary reminder + calendar + sharing controls.
  const panel = el('div', 'toolbar-options');
  panel.id = 'toolbar-options';
  panel.hidden = true;

  const notifyCtl = renderNotifyControl();
  if (notifyCtl) panel.appendChild(notifyCtl);
  panel.appendChild(renderCalendarMenu());
  panel.appendChild(renderPicksLinkButton());
  panel.appendChild(renderCrewButton());
  panel.appendChild(renderAskButton());
  panel.appendChild(renderGuideButton());

  // Right group: options disclosure + clear all.
  const actions = el('div', 'tb-group tb-actions');

  const optionsBtn = el('button', 'btn-ghost btn-options', '⚙ Options ▾');
  optionsBtn.setAttribute('aria-haspopup', 'true');
  optionsBtn.setAttribute('aria-expanded', 'false');
  optionsBtn.setAttribute('aria-controls', 'toolbar-options');
  optionsBtn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    optionsBtn.setAttribute('aria-expanded', String(open));
    optionsBtn.textContent = open ? '⚙ Options ▴' : '⚙ Options ▾';
  });
  actions.appendChild(optionsBtn);

  const clear = el('button', 'btn-ghost', 'Clear all');
  clear.addEventListener('click', () => {
    if (selection.size() === 0) return;
    if (confirm('Remove all your picks?')) selection.clear();
  });
  actions.appendChild(clear);

  bar.appendChild(actions);

  wrap.appendChild(bar);
  wrap.appendChild(panel);
  return wrap;
}

/**
 * Everything that would otherwise crowd the space under the night tabs — the
 * "Only my picks" filter, search, Options, Clear all, the now/next live bar and
 * the discovery panel — folded into one collapsible. The header still shows the
 * live counts, so nothing urgent is lost while it's closed.
 */
function renderControls(): HTMLElement {
  const wrap = el('div', 'controls-wrap');

  const body = el('div', 'controls-body');
  body.id = 'controls-body';
  body.hidden = !controlsOpen;
  body.appendChild(renderToolbar());

  // Hosts re-filled by renderLiveBar() / renderContent().
  const live = el('div', 'live-bar-wrap');
  live.id = 'live-bar';
  body.appendChild(live);

  const discover = el('div', 'discover-wrap');
  discover.id = 'discover';
  body.appendChild(discover);

  const toggle = el('button', 'controls-toggle');
  toggle.id = 'controls-toggle';
  toggle.setAttribute('aria-controls', 'controls-body');
  const paint = (): void => {
    toggle.setAttribute('aria-expanded', String(controlsOpen));
    toggle.innerHTML = '';
    toggle.appendChild(el('span', 'controls-toggle-label', 'Filters, picks & matches'));
    toggle.appendChild(el('span', 'controls-toggle-chevron', controlsOpen ? '▲' : '▼'));
  };
  paint();
  toggle.addEventListener('click', () => {
    controlsOpen = !controlsOpen;
    body.hidden = !controlsOpen;
    paint();
  });

  wrap.appendChild(toggle);
  wrap.appendChild(body);
  return wrap;
}

/**
 * "📅 Calendar" button with a small Add / Remove menu. Add exports the current
 * picks with reminders; Remove cancels the events previously exported.
 */
function renderCalendarMenu(): HTMLElement {
  const wrap = el('div', 'cal-wrap');

  const btn = el('button', 'btn-ghost btn-calendar', '📅 Calendar ▾');
  btn.id = 'calendar-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const menu = el('div', 'cal-menu');
  menu.hidden = true;

  const add = el('button', 'cal-menu-item', 'Add to calendar');
  add.title = 'Add your picks with a reminder before each set';
  add.addEventListener('click', () => {
    close();
    void handleCalendar('add');
  });

  const remove = el('button', 'cal-menu-item', 'Remove from calendar');
  remove.title = 'Cancel the festival events you previously added';
  remove.addEventListener('click', () => {
    close();
    void handleCalendar('remove');
  });

  menu.appendChild(add);
  menu.appendChild(remove);

  function close(): void {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function open(): void {
    add.disabled = selection.size() === 0;
    remove.disabled = !hasExported();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden ? open() : close();
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

/**
 * "Remind me" toggle plus a lead-time selector. Returns null on platforms
 * without the Notification API so the toolbar stays clean.
 */
function renderNotifyControl(): HTMLElement | null {
  if (!notify.notificationsSupported()) return null;

  const wrap = el('div', 'notify-ctl');

  const toggle = el('label', 'switch');
  toggle.title = 'Get an in-app and native reminder before each picked set starts';
  const cb = el('input') as HTMLInputElement;
  cb.type = 'checkbox';
  cb.checked = notify.isEnabled();

  const lead = el('select', 'notify-lead') as HTMLSelectElement;
  lead.setAttribute('aria-label', 'Remind me this many minutes before a set');
  for (const min of notify.LEAD_OPTIONS) {
    const opt = el('option') as HTMLOptionElement;
    opt.value = String(min);
    opt.textContent = `${min} min before`;
    if (min === notify.leadMinutes()) opt.selected = true;
    lead.appendChild(opt);
  }
  lead.hidden = !cb.checked;
  lead.addEventListener('change', () => notify.setLeadMinutes(Number(lead.value)));

  cb.addEventListener('change', async () => {
    const wanted = cb.checked;
    const ok = await notify.setEnabled(wanted);
    cb.checked = ok;
    lead.hidden = !ok;
    if (wanted && !ok) {
      alert(
        notify.permission() === 'denied'
          ? 'Notifications are blocked for this site. Enable them in your browser settings to get set reminders.'
          : 'Could not enable notifications on this device.',
      );
    }
  });

  toggle.appendChild(cb);
  toggle.appendChild(el('span', 'switch-track'));
  toggle.appendChild(el('span', 'switch-label', '🔔 Remind me'));
  wrap.appendChild(toggle);
  wrap.appendChild(lead);
  return wrap;
}

/** Sticky bottom bar holding the primary actions. */
function renderShareBar(): HTMLElement {
  const bar = el('div', 'share-bar');

  // The ticket you bought is the one thing in this app that has to be found in
  // the dark with a queue behind you, so it leads the bar and carries the
  // accent. One tap is the whole design: hold a single ticket and this opens it
  // full screen without passing through a sheet first.
  const ticket = el('button', 'btn-ghost btn-ticket', '🎫 My ticket');
  ticket.id = 'ticket-btn';
  ticket.addEventListener('click', () => openWallet());
  bar.appendChild(ticket);

  const weather = el('button', 'btn-ghost btn-weather', '🌙 Weather');
  weather.setAttribute('aria-label', 'Open the festival weather forecast');
  weather.addEventListener('click', () => openWeather());
  bar.appendChild(weather);

  const journal = el('button', 'btn-ghost btn-journal', `${CANDLE} Journal`);
  journal.id = 'journal-btn';
  journal.setAttribute(
    'aria-label',
    'Open your festival journal: rate the sets you saw and share your Rewind',
  );
  journal.addEventListener('click', () => openJournal());
  bar.appendChild(journal);

  bar.appendChild(renderShareMenu());

  return bar;
}

/**
 * One "Share" button for the whole bottom bar: a small menu opening upward with
 * both share actions — your picks as an image, and the app itself via QR.
 */
function renderShareMenu(): HTMLElement {
  const wrap = el('div', 'share-menu-wrap');

  const btn = el('button', 'btn-ghost btn-share', '⤴ Share ▾');
  btn.id = 'share-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const menu = el('div', 'cal-menu share-menu');
  menu.hidden = true;

  const picks = el('button', 'cal-menu-item', '🖼 My nights as an image');
  picks.title = 'Render your line-up to a picture and share it';
  picks.addEventListener('click', () => {
    close();
    void handleShare(btn);
  });

  const app = el('button', 'cal-menu-item', '▦ Share the app (QR)');
  app.title = 'A QR code and link that open this planner';
  app.addEventListener('click', () => {
    close();
    openShareApp();
  });

  menu.appendChild(picks);
  menu.appendChild(app);

  function close(): void {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function open(): void {
    picks.disabled = selection.size() === 0;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.classList.contains('busy')) return;
    menu.hidden ? open() : close();
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

async function handleShare(btn: HTMLButtonElement): Promise<void> {
  if (selection.size() === 0 || btn.disabled) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.classList.add('busy');
  btn.textContent = 'Preparing…';
  try {
    const { outcome } = await shareSelection();
    btn.textContent = outcome === 'downloaded' ? 'Saved image ✓' : original;
  } catch {
    btn.textContent = 'Share failed';
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('busy');
      btn.textContent = original;
    }, 1600);
  }
}

async function handleCalendar(mode: 'add' | 'remove'): Promise<void> {
  const btn = document.getElementById('calendar-btn') as HTMLButtonElement | null;
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  try {
    const { outcome } = mode === 'add' ? await exportCalendar() : await clearCalendar();
    if (outcome === 'empty') {
      btn.textContent = mode === 'add' ? 'No picks yet' : 'Nothing to remove';
    } else if (outcome === 'downloaded') {
      btn.textContent = mode === 'add' ? 'Saved .ics ✓' : 'Saved remove ✓';
    } else {
      btn.textContent = mode === 'add' ? 'Added ✓' : 'Removed ✓';
    }
  } catch {
    btn.textContent = mode === 'add' ? 'Export failed' : 'Remove failed';
  } finally {
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1600);
  }
}

/**
 * Light the ticket button once there is a ticket behind it — an empty wallet
 * still invites the tap, it just doesn't pretend to be holding anything.
 */
function updateTicketBtn(): void {
  const btn = document.getElementById('ticket-btn');
  if (!btn) return;
  const tickets = walletTickets();
  const live = tickets.filter((t) => t.wristbandAt == null);
  btn.classList.toggle('has-ticket', tickets.length > 0);
  btn.setAttribute(
    'aria-label',
    tickets.length === 0
      ? 'Import the ticket you bought, or buy one'
      : live.length === 1
        ? 'Show your ticket full screen'
        : 'Open your tickets',
  );
}

/** Light the journal button when seen sets are still waiting on a verdict. */
function updateJournalDot(): void {
  const btn = document.getElementById('journal-btn');
  if (!btn) return;
  btn.classList.toggle('has-dot', unratedCount(Date.now()) > 0);
}

function refreshChrome(): void {
  document.querySelectorAll<HTMLButtonElement>('.day-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.day === activeDayId);
  });

  const stats = document.getElementById('header-stats');
  if (!stats) return;
  stats.innerHTML = '';

  const picks = selection.size();
  const pickBadge = el('div', 'stat');
  pickBadge.appendChild(el('span', 'stat-num', String(picks)));
  pickBadge.appendChild(el('span', 'stat-label', picks === 1 ? 'set' : 'sets'));
  stats.appendChild(pickBadge);

  // The second badge is how much of the run you have a reason to be there for:
  // the nights your picks land on.
  const nights = new Set(selectedSlots().map((s) => s.dayId)).size;
  const nightBadge = el('div', nights ? 'stat stat-nights' : 'stat');
  nightBadge.appendChild(el('span', 'stat-num', String(nights)));
  nightBadge.appendChild(el('span', 'stat-label', nights === 1 ? 'night' : 'nights'));
  stats.appendChild(nightBadge);
}

function renderContent(main: HTMLElement): void {
  main.innerHTML = '';
  const day = activeDay();
  const slots = buildSlots(day);

  renderDiscoverHost(day);

  const notice = renderProvisionalNotice();
  if (notice) main.appendChild(notice);

  main.appendChild(renderNightHead(day));
  main.appendChild(renderTimeline(slots, day.date));
  const stats = renderStats();
  if (stats) main.appendChild(stats);
}

function renderDiscoverHost(day: FestivalDay): void {
  const host = document.getElementById('discover');
  if (!host) return;
  host.innerHTML = '';
  host.appendChild(renderDiscover(day));
}

/**
 * The bill is out; the running order is not. Say so once, plainly, above the
 * timeline — every provisional set also carries a "~" on its own time, so the
 * two never drift apart.
 */
function renderProvisionalNotice(): HTMLElement | null {
  if (RUNNING_ORDER_ANNOUNCED || provisionalDismissed) return null;

  const bar = el('div', 'provisional-notice');
  bar.setAttribute('role', 'note');
  bar.appendChild(el('span', 'provisional-icon', '⧗'));

  const text = el('div', 'provisional-text');
  text.appendChild(el('strong', 'provisional-title', 'Running order not announced yet'));
  text.appendChild(
    el(
      'span',
      'provisional-sub',
      `The posters give the bill per night and a ${FESTIVAL.doors} start, nothing more. The grid below is this app’s own placement — marked “~” — in the order the poster lists the acts: it opens on that ${FESTIVAL.doors} and fills the night to a last note by ${CURFEW.to}, because the venue has to be quiet for the police after that, which works out at ${SET_MINUTES}-minute sets with ${CHANGEOVER_MINUTES}-minute changeovers. Picks, reminders and the calendar export all still work; they just move when the real times land.`,
    ),
  );
  bar.appendChild(text);

  const dismiss = el('button', 'provisional-close', '✕');
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.addEventListener('click', () => {
    provisionalDismissed = true;
    renderContent(document.getElementById('content') as HTMLElement);
  });
  bar.appendChild(dismiss);
  return bar;
}

/**
 * The sky over this night, under its date: when the sun goes, and what moon
 * replaces it. Four nights in an open courtyard inside a fortress, with the
 * music from 18:00 — so the first stretch of every night happens in daylight, and when
 * that daylight ends is part of what the evening will look like.
 */
function renderNightSky(day: FestivalDay): HTMLElement {
  const line = el('p', 'night-sky');

  const sun = sunForDay(day.id);
  if (sun) {
    const sunset = el('span', 'night-sky-part');
    sunset.title = sunsetTitle(sun);
    const glyph = el('span', 'night-sky-glyph', '🌇');
    glyph.setAttribute('aria-hidden', 'true');
    sunset.appendChild(glyph);
    sunset.appendChild(el('span', 'night-sky-text', sunsetLabel(sun.sunset)));
    line.appendChild(sunset);
  }

  const phase = nightMoon(day);
  const moon = el('span', 'night-sky-part');
  moon.title = moonTitle(phase);
  const moonGlyph = el('span', 'night-sky-glyph', phase.emoji);
  moonGlyph.setAttribute('aria-hidden', 'true');
  moon.appendChild(moonGlyph);
  moon.appendChild(el('span', 'night-sky-text', moonLabel(phase)));
  line.appendChild(moon);

  return line;
}

/**
 * The rarest thing on the bill, and not on the bill at all: on the opening
 * night of this edition the sun sets over the citadel already bitten into by
 * the moon. It lands in the hour before the first performance, so it is the one
 * piece of sky here that is genuinely actionable — hence its own line, marked,
 * rather than another grey chip nobody reads.
 */
function renderNightEclipse(day: FestivalDay): HTMLElement | null {
  const e = eclipseForDay(day.id);
  if (!e?.visible) return null;

  const line = el('p', 'night-eclipse');
  line.title = eclipseTitle(e);
  const glyph = el('span', 'night-eclipse-glyph', '🌘');
  glyph.setAttribute('aria-hidden', 'true');
  line.appendChild(glyph);
  line.appendChild(el('span', 'night-eclipse-text', eclipseLabel(e)));
  return line;
}

/** The night's own header: date, your ticket for it, and how much you've taken. */
function renderNightHead(day: FestivalDay): HTMLElement {
  const head = el('div', 'night-head');
  head.style.setProperty('--c', dayColor(day));

  const left = el('div', 'night-head-left');
  left.appendChild(el('h2', 'night-name', day.label));
  left.appendChild(
    el(
      'p',
      'night-date',
      new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    ),
  );
  left.appendChild(renderNightSky(day));
  const eclipse = renderNightEclipse(day);
  if (eclipse) left.appendChild(eclipse);
  head.appendChild(left);

  const right = el('div', 'night-head-right');
  const picked = selectedSlots().filter((s) => s.dayId === day.id).length;
  right.appendChild(
    el('span', 'night-chip', `${picked}/${day.sets.length} picked`),
  );
  // What you want from this header at the gate is the ticket itself, one tap
  // away — and, until there is one on the device, the way to put it there.
  const held = ticketsForNight(day.id);
  if (held.length > 0) {
    // Once the ticket has been swapped at the gate the wristband is what admits
    // you, so the chip says so — and still opens the ticket, for the receipt.
    const ticket = held.find((t) => t.wristbandAt == null) ?? held[0];
    const swapped = ticket.wristbandAt != null;
    const show = el('button', 'night-chip night-ticket', swapped ? '🎗 Wristband' : '🎫 My ticket');
    if (swapped) show.classList.add('is-swapped');
    show.type = 'button';
    show.title = swapped
      ? 'You swapped this for a wristband — tap to see the ticket anyway'
      : 'Show your ticket for this night, full screen';
    show.addEventListener('click', () => openTicketViewer(ticket.id));
    right.appendChild(show);
  } else if (walletTickets().length === 0) {
    // Only while the wallet is completely empty: once a ticket is on the device
    // this stops asking, rather than nagging on every night you didn't buy.
    const add = el('button', 'night-chip night-add-ticket', '🎫 Add your ticket');
    add.type = 'button';
    add.title = 'Import the ticket you bought, or buy one';
    add.addEventListener('click', () => openWalletSheet());
    right.appendChild(add);
  }

  head.appendChild(right);

  return head;
}

function renderTimeline(slots: SetSlot[], dayDate: string): HTMLElement {
  const visible = onlyPicks ? slots.filter((s) => selection.has(s.id)) : slots;

  const wrap = el('div', 'timeline-wrap');

  if (visible.length === 0) {
    const empty = el('div', 'empty');
    empty.appendChild(el('p', 'empty-title', 'Nothing picked on this night yet'));
    empty.appendChild(
      el('p', 'empty-sub', 'Turn off “Only my picks” to browse the full bill.'),
    );
    wrap.appendChild(empty);
    return wrap;
  }

  const minStart = Math.min(...slots.map((s) => s.start));
  const maxEnd = Math.max(...slots.map((s) => s.end));
  // round to the hour
  const top = Math.floor(minStart / 60) * 60;
  const bottom = Math.ceil(maxEnd / 60) * 60;
  const height = (bottom - top) * PX_PER_MIN;

  const grid = el('div', 'timeline');
  grid.style.height = `${height}px`;

  // hour gridlines + axis labels
  const axis = el('div', 'time-axis');
  for (let m = top; m <= bottom; m += 60) {
    const y = (m - top) * PX_PER_MIN;
    const line = el('div', 'gridline');
    line.style.top = `${y}px`;
    grid.appendChild(line);

    const label = el('span', 'time-label', minutesToLabel(m));
    label.style.top = `${y}px`;
    axis.appendChild(label);
  }
  grid.appendChild(axis);

  // "You are here" marker: a horizontal rule at the current time, shown only
  // while now falls within this night's window. positionNowLine() reads the
  // window bounds off the element and is also re-run on a timer.
  const nowLine = el('div', 'now-line');
  nowLine.id = 'now-line';
  nowLine.setAttribute('aria-hidden', 'true');
  nowLine.dataset.top = String(top);
  nowLine.dataset.bottom = String(bottom);
  nowLine.dataset.date = dayDate;
  nowLine.appendChild(el('span', 'now-line-label', 'NOW'));
  grid.appendChild(nowLine);
  positionNowLine(nowLine);

  const col = el('div', 'set-col');
  for (const slot of visible) col.appendChild(renderSlot(slot, top, dayDate));
  grid.appendChild(col);

  wrap.appendChild(grid);
  return wrap;
}

function renderSlot(slot: SetSlot, top: number, dayDate: string): HTMLElement {
  const y = (slot.start - top) * PX_PER_MIN;
  const h = (slot.end - slot.start) * PX_PER_MIN;
  const node = el('button', 'set');
  node.dataset.slot = slot.id;
  node.style.top = `${y}px`;
  node.style.height = `${Math.max(h - 4, 56)}px`;
  node.style.setProperty('--c', slot.night.color);

  const picked = selection.has(slot.id);
  const starred = picked && selection.isStarred(slot.id);
  const friends = friendsForSlot(slot.id);
  if (picked) node.classList.add('picked');
  if (starred) node.classList.add('starred');

  node.setAttribute(
    'aria-label',
    `${slot.band}, ${slot.tba ? 'provisionally ' : ''}${slot.startLabel} to ${slot.endLabel}${
      slot.genre ? `, ${slot.genre}` : ''
    }${slot.from ? `, from ${slot.from}` : ''}${picked ? ', picked' : ''}${
      starred ? ', must-see' : ''
    }${friends.length ? `, friends going: ${friends.map((f) => f.name).join(', ')}` : ''}`,
  );
  node.setAttribute('aria-pressed', String(picked));

  // ---- left rail: the time ----
  const when = el('div', 'set-when');
  when.appendChild(el('span', 'set-start', `${slot.tba ? '~' : ''}${slot.startLabel}`));
  when.appendChild(el('span', 'set-end', slot.endLabel));
  if (slot.tba) {
    const tag = el('span', 'set-tba', 'provisional');
    tag.title = 'The official running order is not out yet — this slot is an estimate.';
    when.appendChild(tag);
  }
  node.appendChild(when);

  // ---- main body ----
  const body = el('div', 'set-body');

  const nameRow = el('div', 'set-name-row');
  nameRow.appendChild(el('span', 'set-band', slot.band));
  if (starred) nameRow.appendChild(el('span', 'set-flag star', '★'));
  else if (picked) {
    const horns = journalRating(slot.id);
    if (horns > 0) {
      const flag = el('span', 'set-flag rate', `${CANDLE}${horns}`);
      flag.title = `You rated this ${horns}/5`;
      nameRow.appendChild(flag);
    } else nameRow.appendChild(el('span', 'set-flag check', '✓'));
  }
  body.appendChild(nameRow);

  const meta = el('div', 'set-meta');
  if (slot.genre) meta.appendChild(el('span', 'set-genre', slot.genre));
  if (slot.from) meta.appendChild(el('span', 'set-from', slot.from));

  // Forecast for the hours this set runs — one or more icons depending on how
  // long the set is and whether the sky changes across it, plus peak rain.
  const wx = setWeatherIcons(dayDate, slot.start, slot.end);
  if (wx.icons.length || wx.precip != null) meta.appendChild(weatherStrip(wx));
  if (meta.childElementCount > 0) body.appendChild(meta);

  if (slot.note) body.appendChild(el('p', 'set-note', slot.note));

  // Friend overlays: who else from your crew is at this set.
  if (friends.length > 0) {
    const crewRow = el('span', 'set-crew');
    for (const f of friends.slice(0, 4)) {
      const chip = el('span', 'set-crew-chip', initials(f.name));
      chip.style.setProperty('--c', f.color);
      chip.title = `${f.name} is going`;
      crewRow.appendChild(chip);
    }
    if (friends.length > 4) {
      crewRow.appendChild(el('span', 'set-crew-more', `+${friends.length - 4}`));
    }
    body.appendChild(crewRow);
  }

  const actions = renderSetActions(slot, picked, starred);
  if (actions) body.appendChild(actions);
  node.appendChild(body);

  node.addEventListener('click', () => selection.toggle(slot.id));
  return node;
}

function weatherStrip(wx: ReturnType<typeof setWeatherIcons>): HTMLElement {
  const strip = el('span', 'set-weather');
  const labels = wx.icons.map((c) => c.label).join(', then ');
  // Show the amount when it's non-zero; when the set carries a rain chance but
  // no forecast accumulation, read "probably dry" rather than a bare "0 mm"
  // (the % is an ensemble spread, the mm a single deterministic run).
  const hasMm = wx.precipMm != null && wx.precipMm > 0;
  const dryish = wx.precipMm === 0 && wx.precip != null;
  const mmText = hasMm ? `${fmtMm(wx.precipMm!)} mm` : dryish ? 'probably dry' : '';
  const rainText = wx.precip != null ? `${Math.round(wx.precip)}% rain` : '';
  const rainDetail = [rainText, mmText].filter(Boolean).join(' · ');
  const aria = [labels, rainDetail].filter(Boolean).join(' · ');
  strip.setAttribute('aria-label', aria ? `Forecast: ${aria}` : 'Forecast');
  strip.title = [wx.icons.map((c) => c.label).join(' → '), rainDetail]
    .filter(Boolean)
    .join(' · ');

  for (const c of wx.icons) {
    const ic = el('span', 'set-wx-icon', c.icon);
    ic.setAttribute('aria-hidden', 'true');
    strip.appendChild(ic);
  }
  if (wx.precip != null) {
    const rain = el('span', 'set-wx-rain', `💧${Math.round(wx.precip)}%`);
    rain.setAttribute('aria-hidden', 'true');
    if (wx.precip >= 50) rain.classList.add('is-wet');
    strip.appendChild(rain);
  }
  if (hasMm) {
    const amount = el('span', 'set-wx-mm', `${fmtMm(wx.precipMm!)}mm`);
    amount.setAttribute('aria-hidden', 'true');
    strip.appendChild(amount);
  } else if (dryish) {
    const amount = el('span', 'set-wx-mm set-wx-dry', 'probably dry');
    amount.setAttribute('aria-hidden', 'true');
    strip.appendChild(amount);
  }
  return strip;
}

function renderSetActions(
  slot: SetSlot,
  picked: boolean,
  starred: boolean,
): HTMLElement | null {
  const actions = el('div', 'set-actions');

  // "Must-see" star: only on picked sets.
  if (picked) {
    const star = el('button', 'set-pill set-star');
    star.type = 'button';
    star.appendChild(el('span', 'set-pill-icon', starred ? '★' : '☆'));
    if (starred) star.classList.add('is-on');
    star.setAttribute(
      'aria-label',
      starred ? `Unmark ${slot.band} as must-see` : `Mark ${slot.band} as must-see`,
    );
    star.title = starred ? 'Must-see' : 'Mark as must-see';
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      selection.toggleStar(slot.id);
    });
    actions.appendChild(star);
  }

  if (slot.listen) {
    const listen = el('a', 'set-pill set-listen');
    listen.appendChild(el('span', 'set-pill-icon', '▶'));
    listen.appendChild(el('span', 'set-pill-label', 'Listen'));
    listen.setAttribute('href', slot.listen);
    listen.setAttribute('target', '_blank');
    listen.setAttribute('rel', 'noopener noreferrer');
    listen.setAttribute('aria-label', `Listen to ${slot.band}`);
    listen.addEventListener('click', (e) => e.stopPropagation());
    actions.appendChild(listen);
  }

  if (slot.link) {
    const link = el('a', 'set-pill set-link');
    link.appendChild(el('span', 'set-pill-label', 'Info'));
    link.appendChild(el('span', 'set-pill-icon', '↗'));
    link.setAttribute('href', slot.link);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('aria-label', `Open ${slot.band} info`);
    link.addEventListener('click', (e) => e.stopPropagation());
    actions.appendChild(link);
  }

  return actions.childElementCount > 0 ? actions : null;
}

/* ---------- data-update banner ---------- */
function renderUpdateBanner(): void {
  const host = document.getElementById('update-banner');
  if (!host) return;
  host.innerHTML = '';

  const seen = loadSeenVersion();
  // First visit ever: quietly record the version, no banner.
  if (seen == null) {
    saveSeenVersion(DATA_VERSION);
    return;
  }
  if (seen === DATA_VERSION || bannerDismissed) return;

  const bar = el('div', 'update-banner');
  bar.setAttribute('role', 'status');
  bar.appendChild(el('span', 'update-banner-icon', '↻'));
  bar.appendChild(
    el(
      'span',
      'update-banner-text',
      'Line-up updated — some sets or times may have changed. Double-check your picks.',
    ),
  );
  const dismiss = el('button', 'update-banner-close', '✕');
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.addEventListener('click', () => {
    bannerDismissed = true;
    saveSeenVersion(DATA_VERSION);
    renderUpdateBanner();
  });
  bar.appendChild(dismiss);
  host.appendChild(bar);
}

/* ---------- live wall clock ---------- */
function renderClock(): void {
  const host = document.getElementById('header-clock');
  if (!host) return;
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  host.innerHTML = '';
  host.appendChild(el('span', 'clock-date', `${date} · `));
  host.appendChild(el('span', 'clock-time', time));
}

/**
 * Place (or hide) the "now" rule on the running order. The current instant is
 * converted into the timeline's minutes-from-noon coordinate via the night's
 * festival noon; the line only shows while now sits inside this night's window,
 * which naturally limits it to the night currently running.
 */
function positionNowLine(line?: HTMLElement | null): void {
  const el0 = line ?? document.getElementById('now-line');
  if (!el0) return;
  const top = Number(el0.dataset.top);
  const bottom = Number(el0.dataset.bottom);
  const date = el0.dataset.date;
  if (!date || Number.isNaN(top) || Number.isNaN(bottom)) return;
  const noonMs = festivalInstant(date, '12:00').getTime();
  const nowMin = (Date.now() - noonMs) / 60_000;
  if (nowMin < top || nowMin > bottom) {
    el0.hidden = true;
    return;
  }
  el0.hidden = false;
  el0.style.top = `${(nowMin - top) * PX_PER_MIN}px`;
}

/* ---------- "now / next" live bar ---------- */
function renderLiveBar(): void {
  const host = document.getElementById('live-bar');
  if (!host) return;
  host.innerHTML = '';

  const state = computeLive(Date.now());
  if (state.phase === 'empty') return; // nothing picked — stay out of the way

  const bar = el('div', 'live-bar');
  bar.setAttribute('role', 'status');

  if (state.phase === 'pre' && state.toGatesMin != null) {
    bar.classList.add('is-pre');
    bar.appendChild(liveCell('Your festival starts', `in ${fmtCountdown(state.toGatesMin)}`, null));
    host.appendChild(bar);
    return;
  }

  if (state.phase === 'post') {
    bar.classList.add('is-post');
    bar.appendChild(liveCell('That’s a wrap', 'no more picks tonight', null));
    host.appendChild(bar);
    return;
  }

  // live
  bar.classList.add('is-live');
  if (state.now) {
    const c = liveCell(
      'Now',
      `${state.now.slot.band} · ends ${fmtCountdown(state.now.endsInMin)}`,
      state.now.slot.night.color,
    );
    c.classList.add('live-now');
    bar.appendChild(c);
  }
  if (state.next) {
    bar.appendChild(
      liveCell(
        state.now ? 'Then' : 'Next',
        `${state.next.slot.band} · in ${fmtCountdown(state.next.startsInMin)}`,
        state.next.slot.night.color,
      ),
    );
  }
  if (!state.now && !state.next) {
    bar.appendChild(liveCell('Standing by', 'nothing on right now', null));
  }
  host.appendChild(bar);
}

/* ---------- in-app reminder toasts ---------- */
/**
 * Show a dismissible in-app toast for an upcoming picked set. Complements the
 * native OS notification (which browsers routinely hide while the app is
 * focused). Tapping the toast jumps to the set; it also self-dismisses after a
 * short while, and old toasts are capped so a burst can't bury the screen.
 */
function showReminderToast(slot: SetSlot, lead: number): void {
  const host = document.getElementById('toast-host');
  if (!host) return;

  // Keep at most a few on screen — drop the oldest first.
  while (host.children.length >= 3) host.firstElementChild?.remove();

  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.style.setProperty('--c', slot.night.color);

  const dot = el('span', 'toast-dot');
  dot.setAttribute('aria-hidden', 'true');
  toast.appendChild(dot);

  const body = el('div', 'toast-body');
  const lead_ = Math.max(0, Math.round(lead));
  body.appendChild(
    el('span', 'toast-title', `${slot.band} ${lead_ > 0 ? `starts in ${lead_} min` : 'is starting'}`),
  );
  body.appendChild(
    el(
      'span',
      'toast-meta',
      `${slot.tba ? '~' : ''}${slot.startLabel} · ${slot.night.name}`,
    ),
  );
  toast.appendChild(body);

  const close = el('button', 'toast-close', '✕');
  close.setAttribute('aria-label', `Dismiss reminder for ${slot.band}`);

  let removed = false;
  const remove = (): void => {
    if (removed) return;
    removed = true;
    toast.classList.add('leaving');
    window.setTimeout(() => toast.remove(), 200);
  };

  close.addEventListener('click', (e) => {
    e.stopPropagation();
    remove();
  });
  toast.addEventListener('click', () => {
    remove();
    jumpToSlot(slot);
  });

  toast.appendChild(close);
  host.appendChild(toast);

  // Auto-dismiss after ~12s so it doesn't linger through the set itself.
  window.setTimeout(remove, 12_000);
}

function liveCell(label: string, value: string, color: string | null): HTMLElement {
  const cell = el('div', 'live-cell');
  const lab = el('span', 'live-label', label);
  if (color) {
    lab.style.setProperty('--c', color);
    lab.classList.add('has-dot');
  }
  cell.appendChild(lab);
  cell.appendChild(el('span', 'live-value', value));
  return cell;
}

/* ---------- "your festival" stats ---------- */
function renderStats(): HTMLElement | null {
  const s = computeStats();
  if (s.picks === 0) return null;

  const panel = el('section', 'stats-panel');

  const body = el('div', 'stats-body');
  body.id = 'stats-body';
  body.hidden = !statsOpen;

  const toggle = el('button', 'stats-toggle');
  toggle.id = 'stats-toggle';
  toggle.setAttribute('aria-controls', 'stats-body');
  const paint = (): void => {
    toggle.setAttribute('aria-expanded', String(statsOpen));
    toggle.innerHTML = '';
    toggle.appendChild(el('span', 'stats-title', 'Your festival'));
    toggle.appendChild(el('span', 'stats-toggle-chevron', statsOpen ? '▲' : '▼'));
  };
  paint();
  toggle.addEventListener('click', () => {
    statsOpen = !statsOpen;
    body.hidden = !statsOpen;
    paint();
  });
  panel.appendChild(toggle);

  const grid = el('div', 'stats-grid');
  const tile = (num: string, label: string): HTMLElement => {
    const t = el('div', 'stats-tile');
    t.appendChild(el('span', 'stats-num', num));
    t.appendChild(el('span', 'stats-tile-label', label));
    return t;
  };

  grid.appendChild(tile(String(s.picks), s.picks === 1 ? 'set' : 'sets'));
  const hours = Math.floor(s.onSiteMin / 60);
  const mins = s.onSiteMin % 60;
  grid.appendChild(
    tile(hours ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`, 'of music'),
  );
  grid.appendChild(tile(String(s.nightsActive), s.nightsActive === 1 ? 'night' : 'nights'));
  grid.appendChild(tile(String(s.skipped), 'skipped'));
  body.appendChild(grid);

  if (s.fullest) {
    body.appendChild(
      el(
        'p',
        'stats-note',
        `Fullest night: ${s.fullest.label} (${s.fullest.count} of ${s.fullest.total}). Split — ${DAYS.map(
          (d) => `${d.label} ${s.perNight[d.id]}`,
        ).join(' · ')}.`,
      ),
    );
  }
  panel.appendChild(body);
  return panel;
}

/* ---------- act search ---------- */
function renderSearch(): HTMLElement {
  const wrap = el('div', 'search-wrap');

  const input = el('input', 'search-input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = '🔎 Find an act';
  input.setAttribute('aria-label', 'Find an act across all nights');
  input.autocomplete = 'off';

  const results = el('div', 'search-results');
  results.hidden = true;

  const close = (): void => {
    results.hidden = true;
    results.innerHTML = '';
  };

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (q.length < 2) {
      results.hidden = true;
      return;
    }
    const matches = ALL_SLOTS.filter((s) => s.band.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0) {
      results.appendChild(el('div', 'search-none', 'No act matches'));
      results.hidden = false;
      return;
    }
    for (const slot of matches) {
      const item = el('button', 'search-item');
      item.type = 'button';
      const dayLabel = DAYS.find((d) => d.id === slot.dayId)?.label ?? '';
      const name = el('span', 'search-band', slot.band);
      name.style.setProperty('--c', slot.night.color);
      item.appendChild(name);
      item.appendChild(
        el(
          'span',
          'search-meta',
          `${dayLabel} · ${slot.tba ? '~' : ''}${slot.startLabel}${
            slot.genre ? ` · ${slot.genre}` : ''
          }`,
        ),
      );
      item.addEventListener('click', () => {
        input.value = '';
        close();
        jumpToSlot(slot);
      });
      results.appendChild(item);
    }
    results.hidden = false;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      close();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) close();
  });

  wrap.appendChild(input);
  wrap.appendChild(results);
  return wrap;
}

/** Switch to a set's night, then scroll it into view with a brief highlight. */
function jumpToSlot(slot: SetSlot): void {
  // "Only my picks" would hide an unpicked search hit — turn it off first.
  if (onlyPicks && !selection.has(slot.id)) {
    onlyPicks = false;
    const cb = document.querySelector<HTMLInputElement>('.toolbar .switch input');
    if (cb) cb.checked = false;
  }
  if (activeDayId !== slot.dayId) {
    activeDayId = slot.dayId;
    saveActiveDay(slot.dayId);
  }
  refreshChrome();
  renderContent(document.getElementById('content') as HTMLElement);
  requestAnimationFrame(() => {
    const node = document.querySelector<HTMLElement>(
      `.set[data-slot="${cssEscape(slot.id)}"]`,
    );
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.remove('flash');
    void node.offsetWidth; // restart the animation
    node.classList.add('flash');
    window.setTimeout(() => node.classList.remove('flash'), 1600);
  });
}

function cssEscape(s: string): string {
  const anyCss = window.CSS as unknown as { escape?: (v: string) => string };
  return anyCss?.escape ? anyCss.escape(s) : s.replace(/["\\]/g, '\\$&');
}

/* ---------- crew mode ---------- */
function renderCrewButton(): HTMLElement {
  const btn = el('button', 'btn-ghost btn-crew', '👥 Crew');
  btn.title = 'Overlay your friends’ picks: shared sets and meet-up windows';
  btn.addEventListener('click', () => openCrew());
  return btn;
}

/**
 * The same guide, from inside the toolbar. The "?" in the header is for anyone
 * who is lost on arrival; this one is for the person already holding a tool
 * they don't recognise, standing among the rest of them.
 */
function renderGuideButton(): HTMLElement {
  const btn = el('button', 'btn-ghost btn-guide', '❔ How this works');
  btn.title = 'A one-minute tour of everything this planner does';
  btn.addEventListener('click', () => openGuide());
  return btn;
}

/* ---------- ask an assistant about the festival ---------- */
function renderAskButton(): HTMLElement {
  const btn = el('button', 'btn-ghost btn-ask', '💬 Ask about the fest');
  btn.title = 'Ask an assistant anything about the festival, with the line-up handed over for you';
  btn.addEventListener('click', () => openAsk());
  return btn;
}

/**
 * The same door, in the footer. Options is where the tools live, but a question
 * about the festival tends to arrive at the bottom of the page — after the last
 * set, next to the line admitting this planner is not the festival.
 */
export function renderAskLink(): HTMLElement {
  const wrap = el('p', 'footer-ask');
  const btn = el('button', 'footer-ask-btn', '💬 Ask about the festival');
  btn.type = 'button';
  btn.title = 'Your question, plus everything this planner knows, handed to an assistant';
  btn.addEventListener('click', () => openAsk());
  wrap.appendChild(btn);
  return wrap;
}

/* ---------- share picks as a link ---------- */
function renderPicksLinkButton(): HTMLElement {
  const btn = el('button', 'btn-ghost btn-picks-link', '🔗 Share picks link');
  btn.title = 'Copy a link that reopens your exact picks on another device';
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    if (selection.size() === 0) {
      btn.textContent = 'No picks yet';
      setTimeout(() => (btn.textContent = original), 1600);
      return;
    }
    btn.disabled = true;
    try {
      const { outcome } = await sharePicksLink();
      btn.textContent =
        outcome === 'copied'
          ? 'Link copied ✓'
          : outcome === 'shared'
            ? 'Shared ✓'
            : outcome === 'empty'
              ? 'No picks yet'
              : 'Copy failed';
    } catch {
      btn.textContent = 'Copy failed';
    } finally {
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1600);
    }
  });
  return btn;
}
