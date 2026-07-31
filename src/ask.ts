import {
  CURFEW,
  DAYS,
  FESTIVAL,
  NIGHTS,
  RUNNING_ORDER_ANNOUNCED,
  SET_MINUTES,
  CHANGEOVER_MINUTES,
} from './data';
import { nightSlots } from './schedule';
import { moonLabel, nightMoon } from './moon';
import { festivalClock, sunForDay } from './sun';
import { eclipseBriefLines, eclipseForDay } from './eclipse';
import { selection } from './store';
import { copyText } from './clipboard';
import type { SetSlot } from './types';

/**
 * "Ask about the festival": everything this planner knows, written out as plain
 * text and handed to an AI assistant along with your question.
 *
 * People arrive at a festival with questions this app deliberately does not
 * answer — what to pack for an August night inside a citadel, whether the
 * Kilimanjaro set is worth skipping dinner for, how to get to Alba Iulia from
 * Cluj. An assistant can help with those, but only if it knows which festival,
 * which nights, which bands and what is still provisional. That briefing is the
 * tedious part, so the app writes it: one button hands over the line-up, the
 * venue, the curfew and (optionally) your own picks, with the question on top.
 *
 * Three ways out, because not everyone uses the same assistant: open it in
 * Claude, open it in ChatGPT, or copy the whole prompt and paste it wherever you
 * like. Nothing is sent anywhere by this app — the copy stays on the clipboard,
 * and each button just opens that assistant's own site with the prompt sitting
 * in the composer, which on a phone means its app.
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

/** What the prompt asks for when the box is left empty. */
const DEFAULT_QUESTION =
  'Help me get the most out of these four nights — what should I know before I go?';

/**
 * Openers for the blank page. Deliberately the questions this app cannot
 * answer itself: the town, the trip, the weather, the bands' back catalogues.
 */
const SUGGESTIONS: ReadonlyArray<{ label: string; question: string }> = [
  {
    label: '🚆 Getting there',
    question:
      'How do people usually get to Alba Iulia for this festival, and where is it worth staying for four nights?',
  },
  {
    label: '🎒 What to pack',
    question:
      'What is an August night in the Alba Carolina citadel like, and what should I pack for four evenings outdoors there?',
  },
  {
    label: '🎧 Homework',
    question:
      'Give me one album or track per act on the bill to listen to before I go, and a line on why.',
  },
  {
    label: '🍽 Between sets',
    question:
      'The changeovers are about 25 minutes. What is worth doing, eating or seeing in the citadel in those gaps and during the day?',
  },
  {
    label: '🖤 Which nights',
    question:
      'I can only make two of the four nights. Compare them and tell me which two you would pick, and why.',
  },
];

/**
 * The openers actually shown. One of them only exists in editions where the sky
 * does something — this year the opening night's sun sets partly eclipsed — so
 * it is added from the same computation the rest of the app reads, rather than
 * written into the list above and left to rot after August.
 */
function suggestions(): ReadonlyArray<{ label: string; question: string }> {
  const eclipseNight = DAYS.find((day) => eclipseForDay(day.id)?.visible);
  if (!eclipseNight) return SUGGESTIONS;
  return [
    {
      label: '🌘 The eclipse',
      question:
        `The sun sets partly eclipsed over the venue on the opening night, between doors and the ` +
        `first performance. How do I watch that safely, what will it actually look like that low ` +
        `on the horizon, and where in the citadel would I get a clear view west?`,
    },
    ...SUGGESTIONS,
  ];
}

function dateLabel(dateIso: string, long: boolean): string {
  return new Date(dateIso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: long ? 'long' : 'short',
  });
}

function slotLine(slot: SetSlot): string {
  const bits = [slot.genre, slot.from].filter(Boolean).join(' · ');
  const when = `${slot.startLabel}–${slot.endLabel}${slot.tba ? ' (provisional)' : ''}`;
  return `  ${when}  ${slot.band}${bits ? ` — ${bits}` : ''}`;
}

/** The user's picks, in running order across the whole festival. */
function pickedSlots(): SetSlot[] {
  return DAYS.flatMap((day) => nightSlots(day.id)).filter((s) => selection.has(s.id));
}

/**
 * Everything the planner knows, as plain text. Written for a reader who has
 * never heard of DBE: what it is, when and where, what is fixed and — the part
 * that matters most — what is still only this app's own estimate.
 */
export function festivalBrief(includePicks: boolean): string {
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lines: string[] = [];
  lines.push(`FESTIVAL BRIEF — ${FESTIVAL.name} (${FESTIVAL.shortName}), ${FESTIVAL.edition}`);
  lines.push(
    `Compiled ${today} by an unofficial, fan-made night planner app. Not the festival's own word.`,
  );
  lines.push('');

  lines.push('WHEN AND WHERE');
  lines.push(`- Dates: ${FESTIVAL.dates}, four consecutive nights.`);
  lines.push(`- Venue: ${FESTIVAL.location}.`);
  lines.push(`- Finding it: ${FESTIVAL.venueWhere} — you walk to it through the fortress.`);
  lines.push(
    `- One stage only, so nothing on the bill clashes. Doors ${FESTIVAL.doors} local time (EEST, UTC+3).`,
  );
  lines.push(
    `- Hard finish between ${CURFEW.from} and ${CURFEW.to}: the venue's noise agreement with the police.`,
  );
  lines.push(`- Tickets: ${FESTIVAL.ticketsUrl} (the shop states the prices; this app does not).`);
  lines.push(`- Official site: ${FESTIVAL.siteUrl}`);
  lines.push(`- Official Facebook: ${FESTIVAL.facebookUrl}`);
  lines.push('');

  if (RUNNING_ORDER_ANNOUNCED) {
    lines.push('RUNNING ORDER (official)');
  } else {
    lines.push('RUNNING ORDER (NOT YET OFFICIAL)');
    lines.push(
      `The festival has published the bill per night and "starting at 6 PM", nothing more. The times below are this app's own provisional grid — roughly ${SET_MINUTES}-minute sets, roughly ${CHANGEOVER_MINUTES}-minute changeovers, laid backwards from the curfew, in poster order. Treat every time marked "provisional" as an estimate, not a timetable.`,
    );
  }
  lines.push('');

  for (const day of DAYS) {
    const moon = nightMoon(day);
    const sun = sunForDay(day.id);
    const sky = [
      sun ? `sunset ${festivalClock(sun.sunset)}, dark by ${festivalClock(sun.duskCivil)}` : null,
      `moon at 22:00: ${moonLabel(moon)}`,
    ]
      .filter(Boolean)
      .join('; ');
    lines.push(`${dateLabel(day.date, true)} — ${NIGHTS[day.id].name}  [${sky}]`);
    for (const slot of nightSlots(day.id)) {
      lines.push(slotLine(slot));
      if (slot.note) lines.push(`      ${slot.note}`);
    }
    // An eclipse is not a set, but it is the only thing on one of these nights
    // that has a time and cannot be rescheduled — the assistant should know.
    const eclipse = eclipseForDay(day.id);
    if (eclipse?.visible) {
      lines.push(...eclipseBriefLines(eclipse, dateLabel(day.date, true)));
    }
    lines.push('');
  }

  if (includePicks) {
    const picks = pickedSlots();
    lines.push('MY PICKS (saved on my device, not published anywhere)');
    if (picks.length === 0) {
      lines.push('  Nothing picked yet.');
    } else {
      for (const slot of picks) {
        const day = DAYS.find((d) => d.id === slot.dayId);
        const when = day ? dateLabel(day.date, false) : NIGHTS[slot.dayId].name;
        const star = selection.isStarred(slot.id) ? ' [must-see]' : '';
        lines.push(`  ${when}, ${slot.startLabel} — ${slot.band}${star}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/** The whole message: the question, the brief, and how to handle both. */
export function askPrompt(question: string, includePicks: boolean): string {
  const asked = question.trim() || DEFAULT_QUESTION;
  return [
    `I'm going to ${FESTIVAL.name} (${FESTIVAL.edition}) in ${FESTIVAL.city}, Romania, and I have a question about it.`,
    '',
    'MY QUESTION',
    asked,
    '',
    festivalBrief(includePicks),
    '',
    'HOW TO ANSWER',
    "Use the brief where it helps, and say plainly when the answer isn't in it rather than filling the gap. Set times marked provisional are a fan's estimate — don't present them as announced. For anything official (the final running order, house rules, late changes), point me back to the festival's own site or Facebook page. Otherwise, go ahead and use what you know about these bands, about Alba Iulia, and about the practical side of a four-night festival.",
  ].join('\n');
}

/**
 * Longest prompt we will try to hand over inside a link. Claude's own deep
 * links cap a pre-filled prompt at 5,000 characters; past that the composer
 * opens empty and the clipboard copy is what saves the day. ChatGPT publishes
 * no such number, so it gets the same conservative ceiling rather than an
 * invented one — the fallback below is the same either way.
 */
const MAX_PREFILL_CHARS = 5000;

/**
 * Where a prompt can be sent.
 *
 * Both entries are plain `https://` addresses, and that is the whole trick: on
 * a phone with the app installed, iOS and Android hand these to the app rather
 * than the browser, and everyone else lands on the web version of the same
 * thing. Custom schemes would be worse on both counts — `claude://` opens the
 * Code tab and wants a Claude Code account, and `chatgpt://` simply fails for
 * anyone without the app rather than falling back to the site.
 */
export interface Assistant {
  id: string;
  /** What the button says. */
  label: string;
  /** Where the composer lives, with the prompt in it. */
  compose: (prompt: string) => string;
  /** Where to land when the prompt is too long to travel in a link. */
  blank: string;
  /** Name used in the status line under the buttons. */
  name: string;
}

export const ASSISTANTS: readonly Assistant[] = [
  {
    id: 'claude',
    label: '💬 Ask Claude ↗',
    name: 'Claude',
    compose: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}`,
    blank: 'https://claude.ai/new',
  },
  {
    id: 'chatgpt',
    label: '💬 Ask ChatGPT ↗',
    name: 'ChatGPT',
    // chatgpt.com is the current home and the one the mobile apps claim as a
    // universal link; chat.openai.com only redirects to it, which would cost a
    // hop and, on some Android versions, the hand-off to the app.
    compose: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}`,
    blank: 'https://chatgpt.com/',
  },
];

/** The composer URL for one assistant, and whether the prompt fits inside it. */
export function assistantUrl(
  assistant: Assistant,
  prompt: string,
): { url: string; prefilled: boolean } {
  if (prompt.length > MAX_PREFILL_CHARS) return { url: assistant.blank, prefilled: false };
  return { url: assistant.compose(prompt), prefilled: true };
}

/* ---------- the sheet ---------- */

let sheet: HTMLDialogElement | null = null;
let question = '';
let includePicks = true;

export function openAsk(): void {
  if (!sheet) sheet = buildSheet();
  // Picks and stars may have moved since the sheet was last built, and they
  // ride in the prompt: rebuild the link before it can be tapped.
  refresh();
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute('open', '');
}

function buildSheet(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'sheet ask';
  d.setAttribute('aria-label', 'Ask about the festival');

  const card = el('div', 'sheet-card');

  const head = el('div', 'sheet-head');
  head.appendChild(el('h2', 'sheet-title', '💬 Ask about the festival'));
  const close = el('button', 'sheet-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(
    el(
      'p',
      'sheet-sub',
      'Ask anything about these four nights. Your question travels with everything this planner knows — the line-up, the times, the venue, the sky over each night — so you don’t have to explain the festival first. Pick an assistant: it opens in that app if you have it installed, and on the web if you don’t. Or copy the prompt and paste it into any other.',
    ),
  );

  const body = el('div', 'sheet-body');

  const box = el('textarea', 'field ask-question') as HTMLTextAreaElement;
  box.rows = 3;
  box.placeholder = 'What do you want to know?';
  box.setAttribute('aria-label', 'Your question about the festival');
  box.value = question;
  box.addEventListener('input', () => {
    question = box.value;
    refresh();
  });
  body.appendChild(box);

  const chips = el('div', 'ask-chips');
  for (const s of suggestions()) {
    const chip = el('button', 'ask-chip', s.label);
    chip.type = 'button';
    chip.title = s.question;
    chip.addEventListener('click', () => {
      question = s.question;
      box.value = s.question;
      box.focus();
      refresh();
    });
    chips.appendChild(chip);
  }
  body.appendChild(chips);

  const picksToggle = el('label', 'switch ask-picks');
  picksToggle.title = 'Send the sets you picked, so the answer can work around your night';
  const cb = el('input') as HTMLInputElement;
  cb.type = 'checkbox';
  cb.checked = includePicks;
  cb.addEventListener('change', () => {
    includePicks = cb.checked;
    refresh();
  });
  picksToggle.appendChild(cb);
  picksToggle.appendChild(el('span', 'switch-track'));
  picksToggle.appendChild(el('span', 'switch-label', 'Include my picks'));
  body.appendChild(picksToggle);

  const actions = el('div', 'ask-actions');

  // Real links, not a scripted window.open: that is what lets a phone with the
  // app installed take the tap itself — iOS and Android only hand claude.ai and
  // chatgpt.com addresses to their apps when the navigation comes from an
  // activated anchor. Each href is rebuilt as the question changes, and once
  // more on the click, so the prompt that travels is the prompt on screen.
  for (const [i, assistant] of ASSISTANTS.entries()) {
    const link = el('a', 'ask-btn primary', assistant.label) as HTMLAnchorElement;
    link.id = `ask-open-${assistant.id}`;
    link.dataset.assistant = assistant.id;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = `Open this prompt in the ${assistant.name} app, or in ${assistant.name} on the web`;
    // The first is the filled button, the rest are outlined: the same prompt
    // goes either way, so this is a default rather than a recommendation.
    if (i > 0) link.classList.remove('primary');
    link.href = assistantUrl(assistant, askPrompt(question, includePicks)).url;
    link.addEventListener('click', () => handleAsk(assistant));
    actions.appendChild(link);
  }

  const copyBtn = el('button', 'ask-btn ask-btn-copy', 'Copy prompt');
  copyBtn.type = 'button';
  copyBtn.title = 'Copy the question and the brief, to paste into any assistant';
  copyBtn.addEventListener('click', () => {
    void handleCopy(copyBtn);
  });
  actions.appendChild(copyBtn);

  body.appendChild(actions);

  const status = el('p', 'ask-status');
  status.id = 'ask-status';
  status.setAttribute('aria-live', 'polite');
  body.appendChild(status);

  // What gets sent, in full, before it goes anywhere. Folded away by default —
  // it is long — but a tap away for anyone who wants to read it first.
  const details = el('details', 'ask-preview-wrap');
  const summary = el('summary', 'ask-preview-summary', 'See exactly what gets sent');
  details.appendChild(summary);
  const pre = el('pre', 'ask-preview');
  pre.id = 'ask-preview';
  details.appendChild(pre);
  details.addEventListener('toggle', () => {
    if (details.open) paintPreview();
  });
  body.appendChild(details);

  body.appendChild(
    el(
      'p',
      'sheet-hint',
      'An assistant is not the festival, and it can be wrong or out of date. For the official word — the running order, house rules, anything that changes late — the festival’s own site and Facebook page are in the footer.',
    ),
  );

  card.appendChild(body);
  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  document.body.appendChild(d);
  return d;
}

/**
 * Keep the link and the (optional) preview in step with what has been typed —
 * and drop the last status line, which described a prompt that no longer exists.
 */
function refresh(): void {
  syncAskLinks();
  paintPreview();
  setStatus('');
}

function paintPreview(): void {
  const pre = sheet?.querySelector('#ask-preview');
  const details = pre?.parentElement as HTMLDetailsElement | null;
  if (!pre || !details?.open) return;
  pre.textContent = askPrompt(question, includePicks);
}

function setStatus(text: string): void {
  const status = sheet?.querySelector('#ask-status');
  if (status) status.textContent = text;
}

/**
 * Point every assistant link at the prompt as it currently stands. Returns the
 * prompt and whether it is short enough to travel inside a link — the answer is
 * the same for all of them, since they share one ceiling.
 */
function syncAskLinks(): { prompt: string; prefilled: boolean } {
  const prompt = askPrompt(question, includePicks);
  let prefilled = true;
  for (const assistant of ASSISTANTS) {
    const result = assistantUrl(assistant, prompt);
    prefilled = result.prefilled;
    const link = sheet?.querySelector(`#ask-open-${assistant.id}`) as HTMLAnchorElement | null;
    if (link) link.href = result.url;
  }
  return { prompt, prefilled };
}

/**
 * Runs alongside the link's own navigation: the prompt goes to the clipboard
 * too. That covers the cases the link can't — a prompt too long to ride in the
 * URL, a browser that blocks the new tab, or simply wanting to paste it
 * somewhere else. The copy is fire-and-forget; awaiting anything here would
 * only race the navigation the browser is already performing.
 */
function handleAsk(assistant: Assistant): void {
  const { prompt, prefilled } = syncAskLinks();
  const who = assistant.name;

  void copyText(prompt).then((copied) => {
    if (prefilled) {
      setStatus(
        copied
          ? `Opening ${who} with the prompt in its composer — the app, if you have it installed. It’s on your clipboard too.`
          : `Opening ${who} with the prompt in its composer — the app, if you have it installed.`,
      );
      return;
    }
    setStatus(
      copied
        ? `Too long to travel in a link, so ${who} opens empty — the prompt is copied, just paste it.`
        : `Too long to travel in a link. Use “Copy prompt”, then paste it into ${who}.`,
    );
  });
}

async function handleCopy(btn: HTMLButtonElement): Promise<void> {
  const original = btn.textContent;
  btn.disabled = true;
  const ok = await copyText(askPrompt(question, includePicks));
  btn.textContent = ok ? 'Copied ✓' : 'Copy failed';
  setStatus(
    ok
      ? 'Prompt copied — paste it into Claude, or any other assistant you use.'
      : 'Could not reach the clipboard. Open “See exactly what gets sent” and copy it by hand.',
  );
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1600);
}
