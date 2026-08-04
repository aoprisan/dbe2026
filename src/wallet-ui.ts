import qrcode from 'qrcode-generator';
import { DAYS, FESTIVAL, NIGHTS, doorSaleNote } from './data';
import type { NightId } from './types';
import {
  importTicketFile,
  loadWallet,
  removeTicket,
  setTicketScope,
  setWristband,
  subscribeWallet,
  TicketImportError,
  walletTickets,
  type TicketScope,
  type WalletTicket,
} from './wallet';

/**
 * The wallet, on screen: its own sheet off the bottom bar, a card per imported
 * ticket, and a full-screen viewer built for one moment only — standing at the
 * gate, at night, holding the phone out to someone with a scanner.
 *
 * This app is for people who are going, so the wallet is the ticket surface:
 * the ticket you bought, and — for anyone who hasn't yet — the shop's own link
 * and what the gate itself still sells. What eventbook.ro charges is
 * eventbook.ro's business; the door price is the festival's own and exists
 * nowhere else.
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

/**
 * The ticket's own payload, redrawn. 'H' error correction so a fingerprint or
 * a bit of glare on the screen still scans.
 */
function qrSvg(text: string): string {
  const qr = qrcode(0, 'H');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function dayLabel(id: NightId): string {
  const day = DAYS.find((d) => d.id === id);
  if (!day) return id;
  const date = new Date(day.date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  return `${day.label} · ${date}`;
}

const PASS_LABEL = 'Full festival pass';

function scopeLabel(scope: TicketScope | null): string {
  if (scope === 'full') return PASS_LABEL;
  return scope ? dayLabel(scope) : 'Pass, or a single night?';
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* ---------- the sheet ---------- */

let sheet: HTMLDialogElement | null = null;

/**
 * What the bottom bar's ticket button does. At the gate there is one thing you
 * want and no patience for a menu, so a single un-swapped ticket goes straight
 * to full screen. Everything else — nothing imported yet, several tickets, or a
 * ticket already traded for a wristband — opens the sheet, where there is a
 * choice to make.
 */
export function openWallet(): void {
  const live = walletTickets().filter((t) => t.wristbandAt == null);
  if (live.length === 1) openTicketViewer(live[0].id);
  else openWalletSheet();
}

/** The wallet itself: every ticket on the device, and where to buy one. */
export function openWalletSheet(): void {
  if (!sheet) sheet = buildSheet();
  paintSheet();
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute('open', '');
  // The wallet is read from IndexedDB, so it may land a moment after the sheet
  // opens; the subscription below repaints it in place when it does.
  void loadWallet();
}

function buildSheet(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'sheet wallet-sheet';
  d.setAttribute('aria-label', 'My ticket');

  const card = el('div', 'sheet-card');

  const head = el('div', 'sheet-head');
  head.appendChild(el('h2', 'sheet-title', '🎫 My ticket'));
  const close = el('button', 'sheet-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close my ticket');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(
    el('p', 'sheet-sub', 'The ticket you bought, on this device — ready at the gate.'),
  );

  const body = el('div', 'sheet-body');
  body.id = 'wallet-body';
  card.appendChild(body);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  document.body.appendChild(d);

  subscribeWallet(() => {
    if (d.open) paintSheet();
  });

  return d;
}

function paintSheet(): void {
  const body = sheet?.querySelector('#wallet-body');
  if (!body) return;
  body.innerHTML = '';

  const held = walletTickets().length > 0;
  body.appendChild(renderWallet(paintSheet));

  // Not everyone opening this has bought yet, and nobody wants a price table
  // from a fan app — the shop is one line away and it is the source of truth.
  const buy = el(
    'a',
    held ? 'ticket-buy is-secondary' : 'ticket-buy',
    held ? '🎟 Another night — buy on eventbook.ro' : '🎟 Buy a ticket on eventbook.ro',
  );
  buy.href = FESTIVAL.ticketsUrl;
  buy.target = '_blank';
  buy.rel = 'noopener noreferrer';
  body.appendChild(buy);

  // The shop is not the only counter this year: the gate itself sells on the
  // first two nights, and that is the one thing a link to eventbook.ro cannot
  // tell someone who has left it too late to order.
  body.appendChild(
    el(
      'p',
      'ticket-door',
      `Still undecided? ${doorSaleNote()} At the gate you are handed the real thing, so there is nothing to import.`,
    ),
  );

  body.appendChild(
    el(
      'p',
      'sheet-hint',
      'eventbook.ro sells the tickets and states what they cost; the gate price above is the festival’s own word. This app only carries the ticket you already have, and it never leaves the device.',
    ),
  );
}

/**
 * `repaint` is the sheet's own repaint — importing or removing a ticket changes
 * what the rest of the sheet says, so the whole panel is redrawn.
 */
function renderWallet(repaint: () => void): HTMLElement {
  const wrap = el('section', 'wallet');
  const tickets = walletTickets();

  if (tickets.length === 0) {
    wrap.appendChild(
      el(
        'p',
        'wallet-empty',
        'Import the ticket you bought — the festival pass or a single night, as the PDF from the shop or a photo of it — and it opens here, full screen, ready to scan. It never leaves this device.',
      ),
    );
  } else {
    const head = el('div', 'wallet-head');
    head.appendChild(
      el('span', 'wallet-count', `${tickets.length} on this device`),
    );
    wrap.appendChild(head);

    const list = el('ul', 'wallet-list');
    for (const ticket of tickets) list.appendChild(renderCard(ticket, repaint));
    wrap.appendChild(list);
  }

  wrap.appendChild(renderImporter(repaint, tickets.length > 0));
  return wrap;
}

function renderImporter(repaint: () => void, compact: boolean): HTMLElement {
  const box = el('div', 'wallet-import');

  const input = el('input') as HTMLInputElement;
  input.type = 'file';
  input.accept = 'application/pdf,image/*';
  input.multiple = true;
  input.className = 'wallet-file';
  input.id = 'wallet-file-input';

  const button = el('button', 'wallet-add', compact ? '＋ Add another ticket' : '🎫 Import my ticket');
  button.type = 'button';
  button.addEventListener('click', () => input.click());

  const status = el('p', 'wallet-status');
  status.setAttribute('role', 'status');

  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = ''; // let the same file be re-picked after a failure
    if (files.length === 0) return;

    button.disabled = true;
    status.className = 'wallet-status is-busy';
    status.textContent = files.length > 1 ? `Reading ${files.length} tickets…` : 'Reading your ticket…';

    void (async () => {
      const failures: string[] = [];
      for (const file of files) {
        try {
          await importTicketFile(file);
        } catch (err) {
          failures.push(
            err instanceof TicketImportError ? err.message : `${file.name} couldn't be imported.`,
          );
        }
      }
      button.disabled = false;
      if (failures.length > 0) {
        status.className = 'wallet-status is-error';
        status.textContent = failures[0];
      } else {
        status.className = 'wallet-status';
        status.textContent = '';
      }
      repaint();
    })();
  });

  box.appendChild(button);
  box.appendChild(input);
  box.appendChild(status);
  return box;
}

function renderCard(ticket: WalletTicket, repaint: () => void): HTMLElement {
  const li = el('li', 'wallet-card');
  if (ticket.scope && ticket.scope !== 'full') {
    li.style.setProperty('--c', NIGHTS[ticket.scope].color);
  }
  const swapped = ticket.wristbandAt != null;
  if (swapped) li.classList.add('is-swapped');

  const open = el('button', 'wallet-open');
  open.type = 'button';
  open.setAttribute('aria-label', `Show ${scopeLabel(ticket.scope)} full screen`);

  const thumb = el('span', 'wallet-thumb');
  const img = el('img') as HTMLImageElement;
  const url = URL.createObjectURL(ticket.pages[0]);
  img.src = url;
  img.alt = '';
  img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
  thumb.appendChild(img);
  open.appendChild(thumb);

  const text = el('span', 'wallet-card-text');
  text.appendChild(el('span', 'wallet-card-night', scopeLabel(ticket.scope)));
  if (ticket.code) {
    text.appendChild(el('span', 'wallet-card-code', ticket.code));
  } else {
    text.appendChild(el('span', 'wallet-card-name', ticket.name));
  }
  if (ticket.guessed && ticket.scope) {
    text.appendChild(el('span', 'wallet-card-hint', 'read off the ticket — fix it if it is wrong'));
  }
  text.appendChild(
    el(
      'span',
      swapped ? 'wallet-card-cta is-quiet' : 'wallet-card-cta',
      swapped ? `🎗 wristband since ${shortDate(ticket.wristbandAt!)}` : 'Tap to show',
    ),
  );
  open.appendChild(text);

  open.addEventListener('click', () => openTicketViewer(ticket.id));
  li.appendChild(open);

  const tools = el('div', 'wallet-card-tools');

  // Most people buy the pass, so it leads the list — and picking it is what
  // strikes all four nights off the bill below.
  const select = el('select', 'wallet-night') as HTMLSelectElement;
  select.setAttribute('aria-label', 'What this ticket admits you to');
  const none = el('option', undefined, 'Not set') as HTMLOptionElement;
  none.value = '';
  select.appendChild(none);
  const pass = el('option', undefined, `${PASS_LABEL} · all four nights`) as HTMLOptionElement;
  pass.value = 'full';
  select.appendChild(pass);
  for (const day of DAYS) {
    const option = el('option', undefined, dayLabel(day.id)) as HTMLOptionElement;
    option.value = day.id;
    select.appendChild(option);
  }
  select.value = ticket.scope ?? '';
  select.addEventListener('change', () => {
    void setTicketScope(ticket.id, (select.value || null) as TicketScope | null).then(repaint);
  });
  tools.appendChild(select);

  // The gate keeps the scan and gives you a wristband; from then on the ticket
  // is a receipt. Marking it here is what quiets the app down.
  const band = el('button', 'wallet-band', swapped ? '🎗 Wristband on' : '🎗 Got my wristband');
  band.type = 'button';
  band.classList.toggle('is-on', swapped);
  band.setAttribute('aria-pressed', String(swapped));
  band.title = swapped
    ? 'Scanned at the gate and swapped for a wristband — tap to undo'
    : 'Mark this ticket as scanned and exchanged for a wristband';
  band.addEventListener('click', () => {
    void setWristband(ticket.id, !swapped).then(repaint);
  });
  tools.appendChild(band);

  const remove = el('button', 'wallet-remove', 'Remove');
  remove.type = 'button';
  remove.title = 'Delete this ticket from the device';
  remove.addEventListener('click', () => {
    if (!confirm('Remove this ticket from this device? The original file is untouched.')) return;
    void removeTicket(ticket.id).then(repaint);
  });
  tools.appendChild(remove);

  li.appendChild(tools);
  return li;
}

/* ---------- full-screen viewer ---------- */

let viewer: HTMLDialogElement | null = null;
let openUrls: string[] = [];
let wakeLock: { release: () => Promise<void> } | null = null;

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
}

/**
 * White page, black ink, nothing else: a scanner wants contrast, and a phone
 * that has been in a pocket all night wants to stay awake while someone lines
 * the red line up with the code.
 */
export function openTicketViewer(id: string): void {
  const ticket = walletTickets().find((t) => t.id === id);
  if (!ticket) return;

  if (!viewer) viewer = buildViewer();
  paintViewer(viewer, ticket);

  if (typeof viewer.showModal === 'function') viewer.showModal();
  else viewer.setAttribute('open', '');

  const nav = navigator as Navigator & WakeLockNavigator;
  nav.wakeLock
    ?.request('screen')
    .then((lock) => {
      // The dialog may already have been closed while the request was pending.
      if (viewer?.open) wakeLock = lock;
      else void lock.release();
    })
    .catch(() => undefined);
}

function buildViewer(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'ticket-viewer';
  d.setAttribute('aria-label', 'Your ticket');

  const close = el('button', 'ticket-viewer-close', '✕ Close');
  close.type = 'button';
  close.addEventListener('click', () => d.close());
  d.appendChild(close);

  d.appendChild(el('div', 'ticket-viewer-body'));

  d.addEventListener('close', () => {
    openUrls.forEach((u) => URL.revokeObjectURL(u));
    openUrls = [];
    void wakeLock?.release().catch(() => undefined);
    wakeLock = null;
  });

  document.body.appendChild(d);
  return d;
}

function paintViewer(d: HTMLDialogElement, ticket: WalletTicket): void {
  const body = d.querySelector('.ticket-viewer-body');
  if (!body) return;
  openUrls.forEach((u) => URL.revokeObjectURL(u));
  openUrls = [];
  body.innerHTML = '';

  const head = el('div', 'ticket-viewer-head');
  head.appendChild(el('span', 'ticket-viewer-night', scopeLabel(ticket.scope)));
  if (ticket.code) head.appendChild(el('span', 'ticket-viewer-code', ticket.code));
  if (ticket.wristbandAt != null) {
    head.appendChild(
      el(
        'span',
        'ticket-viewer-swapped',
        `🎗 Swapped for a wristband on ${shortDate(ticket.wristbandAt)} — the band gets you in now.`,
      ),
    );
  }
  body.appendChild(head);

  // A ticket PDF is A4: scaled to a phone, its QR ends up a centimetre across.
  // When the code could be read — and it really is a QR — the same payload is
  // redrawn at the width of the screen, which is what the scanner wants.
  if (ticket.code && ticket.codeFormat === 'qr_code') {
    const big = el('div', 'ticket-viewer-qr');
    big.innerHTML = qrSvg(ticket.code);
    big.setAttribute('role', 'img');
    big.setAttribute('aria-label', 'Your ticket code as a large QR code');
    body.appendChild(big);
  }

  ticket.pages.forEach((page, i) => {
    const url = URL.createObjectURL(page);
    openUrls.push(url);
    const img = el('img', 'ticket-viewer-page') as HTMLImageElement;
    img.src = url;
    img.alt =
      ticket.pages.length > 1 ? `Ticket page ${i + 1} of ${ticket.pages.length}` : 'Your ticket';
    // Tap to fill the screen width and a half — enough to read the small print
    // on an A4 ticket without pinching in the dark.
    img.title = 'Tap to zoom';
    img.addEventListener('click', () => img.classList.toggle('is-zoomed'));
    const frame = el('div', 'ticket-viewer-frame');
    frame.appendChild(img);
    body.appendChild(frame);
  });

  // The moment after the scanner beeps is the only moment anyone will ever
  // remember to tap this, so the button lives here, under the ticket.
  if (ticket.wristbandAt == null) {
    const done = el('button', 'ticket-viewer-band', '🎗 Scanned — I got my wristband');
    done.type = 'button';
    done.addEventListener('click', () => {
      void setWristband(ticket.id, true).then(() => d.close());
    });
    body.appendChild(done);
  }

  body.appendChild(
    el(
      'p',
      'ticket-viewer-hint',
      'Turn your screen brightness up before you reach the gate — tap the ticket to zoom. This page stays awake while it is open.',
    ),
  );

  // With one ticket in the wallet the bottom bar comes straight here, so this
  // is the only way back to the sheet — where tickets are added and fixed.
  const manage = el('button', 'ticket-viewer-manage', 'All my tickets');
  manage.type = 'button';
  manage.addEventListener('click', () => {
    d.close();
    openWalletSheet();
  });
  body.appendChild(manage);
}
