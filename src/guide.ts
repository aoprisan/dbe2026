import { CURFEW, DAYS, FESTIVAL, RUNNING_ORDER_ANNOUNCED } from './data';
import { selection } from './store';

/**
 * "How this works" — the one panel that explains the app itself.
 *
 * Everything else in here is built for someone who already knows what the
 * planner does: the tools live behind a collapsed strip, the ticket and the
 * journal behind icons in the bottom bar, the must-see star behind a pick. That
 * is the right shape for the fourth night and the wrong shape for the first
 * minute, so this panel walks the whole app once, in the order a person meets
 * it — the nights, a pick, the strip of tools, the bar at the bottom — and then
 * gets out of the way.
 *
 * It opens by itself on a first visit and never again unprompted; after that it
 * is a "?" in the header and an entry in ⚙ Options.
 */

const SEEN_KEY = 'dbe12.guide.seen.v1';

interface Section {
  icon: string;
  title: string;
  body: string;
}

/**
 * The number of band nights, spelled out — the Ceremony is its own thing, and
 * this reads as prose rather than as a count in a table. Derived rather than
 * written down so it survives a night being added or dropped.
 */
const BAND_NIGHTS = (['no', 'one', 'two', 'three', 'four', 'five'][DAYS.length - 1] ??
  String(DAYS.length - 1)) as string;

const SECTIONS: Section[] = [
  {
    icon: '🌙',
    title: 'Four nights, one stage',
    body:
      `The tabs under the title move between the Opening Ceremony and the ${BAND_NIGHTS} band ` +
      `nights. ${FESTIVAL.shortName} plays a single stage, so a night is one running order read ` +
      `top to bottom — doors at ${FESTIVAL.doors}, the first set at 19:00, and the last note ` +
      `between ${CURFEW.from} and ${CURFEW.to}, which is the venue's noise limit rather than a ` +
      `soft target.`,
  },
  {
    icon: '✦',
    title: 'Tap a set to pick it',
    body:
      'A tap anywhere on a card adds that set to your picks and lights the card up; another tap ' +
      'drops it. The two badges in the top right count what you have picked and how many nights ' +
      'those picks land on.',
  },
  {
    icon: '★',
    title: 'Star the ones you came for',
    body:
      'A picked set grows a ☆ pill. Star it and it reads as must-see — starred sets are marked ' +
      'on the timeline, lead your shared image, and are flagged when you hand the line-up to an ' +
      'assistant. ▶ Listen and Info open the band elsewhere without touching your pick.',
  },
  {
    icon: '🔎',
    title: 'Filters, picks & matches',
    body:
      'The strip under the tabs unfolds into the working end of the app: "Only my picks", a ' +
      'search that finds a band across all four nights, ⚙ Options, and Clear all. Under it sit ' +
      'the Now / Next bar and suggestions drawn from what you have already picked.',
  },
  {
    icon: '⚙',
    title: 'Options: reminders, calendar, crew',
    body:
      '🔔 Remind me raises a notification a chosen number of minutes before each picked set. ' +
      '📅 Calendar exports the same picks to your own calendar, and can take them back out. ' +
      '🔗 Share picks link copies a link that reopens your exact line-up on another phone, and ' +
      '👥 Crew takes your friends’ links and overlays them: the sets you are all at, and the ' +
      'gaps where you could actually meet.',
  },
  {
    icon: '⏱',
    title: 'What is on right now',
    body:
      'While the festival runs, the Now / Next bar names the set on stage and counts down to the ' +
      'next one, and a line creeps down the running order at the real time. Both keep moving ' +
      'with the app open.',
  },
  {
    icon: '🎫',
    title: 'Your ticket, one tap away',
    body:
      'The first button in the bottom bar holds the pass or single night you bought: import it ' +
      'from the shop’s PDF or a photo of it, and it stays on this device, ready to show full ' +
      'screen at the gate. Mark it once it becomes a wristband. No ticket yet — the same panel ' +
      'links out to the shop.',
  },
  {
    icon: '🌤',
    title: 'Weather and the moon',
    body:
      'The forecast covers festival hours, night by night and set by set, and carries a report ' +
      'card that grades how the same forecast has done on the last ten finished days — the ' +
      'estimate on screen is nudged by what it got wrong, and says so with a *. The moon over ' +
      'each night is computed on the device, so it still shows with no signal.',
  },
  {
    icon: '🕯',
    title: 'Rate it afterwards',
    body:
      'Once a picked set has played it appears in the journal: one to five candles, a line of ' +
      'memory, or a mark that you did not make it there. When the festival is over that becomes ' +
      'a Rewind image you can share.',
  },
  {
    icon: '⤴',
    title: 'Sharing',
    body:
      'Share turns your nights into a picture, or puts a QR code on screen for the planner ' +
      'itself — the fastest way to get it onto someone else’s phone in a queue.',
  },
  {
    icon: '💬',
    title: 'Ask about the festival',
    body:
      'For the questions this planner does not answer — getting to Alba Iulia, what an August ' +
      'night in the citadel is like — your question is handed to an assistant together with a ' +
      'written brief of the whole bill. You can read exactly what gets sent, and nothing leaves ' +
      'this device until you tap through.',
  },
  {
    icon: '⤓',
    title: 'Install it, and it works offline',
    body:
      'Add the planner to your home screen and it opens like an app and keeps working without a ' +
      'signal — the citadel is not generous with reception. The footer stamps which build you ' +
      'are on, with a button that fetches a newer one on the spot.',
  },
  {
    icon: '🔒',
    title: 'Everything stays on this phone',
    body:
      'Picks, stars, tickets, journal entries and crew overlays live in this browser only. There ' +
      'is no account, no server and no analytics — which also means clearing site data clears ' +
      'them, and a shared link or an exported calendar is the only way to carry them across.',
  },
];

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

let dialog: HTMLDialogElement | null = null;

/** Whether this device has already been shown the guide. */
function guideSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) != null;
  } catch {
    // Private mode: treat it as seen rather than opening the panel on every
    // single load of a browser that cannot remember it was closed.
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

/** Open the usage guide. */
export function openGuide(): void {
  if (!dialog) dialog = buildDialog();
  // Stamped on open, not on close: a panel swiped away or a tab killed
  // mid-read has still been offered, and offering it twice is nagging.
  markSeen();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/**
 * First visit — nobody has picked anything and nothing was imported from a
 * shared link — opens the guide once. A returning phone, or one that landed
 * here on someone else's line-up, goes straight to the running order.
 */
export function maybeOpenGuide(): void {
  if (guideSeen() || selection.size() > 0) return;
  openGuide();
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'sheet guide';
  d.setAttribute('aria-label', 'How this planner works');

  const card = el('div', 'sheet-card');

  const head = el('div', 'sheet-head');
  head.appendChild(el('h2', 'sheet-title', 'How this planner works'));
  const close = el('button', 'sheet-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close the guide');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(
    el(
      'p',
      'sheet-sub',
      `An unofficial planner for ${FESTIVAL.name}, ${FESTIVAL.edition} — ${FESTIVAL.dates}, ` +
        `${FESTIVAL.venue}. Here is the whole thing in one minute.`,
    ),
  );

  const body = el('div', 'sheet-body');

  const list = el('div', 'guide-list');
  for (const section of SECTIONS) {
    const item = el('section', 'guide-item');
    item.appendChild(el('span', 'guide-icon', section.icon));
    const text = el('div', 'guide-text');
    text.appendChild(el('h3', 'guide-title', section.title));
    text.appendChild(el('p', 'guide-body', section.body));
    item.appendChild(text);
    list.appendChild(item);
  }
  body.appendChild(list);

  if (!RUNNING_ORDER_ANNOUNCED) {
    // The one caveat that changes how everything above should be read: the
    // times people are planning around are this app's arithmetic, not the
    // festival's word.
    body.appendChild(
      el(
        'p',
        'guide-caveat',
        'Set times are provisional. Until the festival publishes its running order, the grid is ' +
          'built from ~50-minute sets, ~25-minute changeovers and the curfew — the bill and the ' +
          'nights are from the official posters, the clock is an estimate, and every ' +
          'provisional time is marked with a ~.',
      ),
    );
  }

  body.appendChild(
    el(
      'p',
      'sheet-hint',
      'Fan-made and not affiliated with the festival: where this app and the official site or ' +
        'Facebook page disagree, theirs is the one that counts. You can reopen this guide any ' +
        'time from the ? in the header.',
    ),
  );

  const foot = el('div', 'guide-foot');
  const done = el('button', 'pill-btn', 'Start planning');
  done.type = 'button';
  done.addEventListener('click', () => d.close());
  foot.appendChild(done);
  body.appendChild(foot);

  card.appendChild(body);
  d.appendChild(card);

  // Backdrop click closes, as everywhere else in the app.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  document.body.appendChild(d);
  return d;
}
