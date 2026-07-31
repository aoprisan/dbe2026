import { DAYS } from './data';
import type { NightId } from './types';

/**
 * The wallet: the ticket you actually bought.
 *
 * Everything else in this app is a plan — this is the one thing the gate wants
 * to see. eventbook.ro mails a PDF; people also keep a screenshot or a photo of
 * it. Both come in here, get turned into page images once at import time, and
 * are kept in IndexedDB on this device, so the ticket opens instantly, in the
 * dark, on the citadel's non-existent signal.
 *
 * Nothing is uploaded. There is no backend to upload it to.
 */

const DB_NAME = 'dbe12.wallet';
const DB_VERSION = 1;
const STORE = 'tickets';

/** Page images are capped so a multi-page order doesn't fill the quota. */
const MAX_PAGES = 4;
/** Rendered page width in device pixels — sharp enough for a gate scanner. */
const PAGE_WIDTH = 1400;

/**
 * What a ticket admits you to. Most people buy the pass — DBE sells the four
 * nights as one — so "full" is a first-class answer here, not four day tickets
 * bolted together.
 */
export type TicketScope = 'full' | NightId;

export interface WalletTicket {
  id: string;
  /** Original file name, kept as the human label for the card. */
  name: string;
  kind: 'pdf' | 'image';
  addedAt: number;
  /** The pass, or the single night. Guessed at import, always correctable. */
  scope: TicketScope | null;
  /** True while `scope` is the app's guess and not the user's own choice. */
  guessed: boolean;
  /**
   * When this ticket was swapped for a wristband at the gate. From that moment
   * the wristband is what gets you in and the ticket is only a receipt — the
   * app stops pushing it at you, but keeps it, because queues have disputes.
   */
  wristbandAt: number | null;
  /** The QR / barcode payload, when this device could read one. */
  code: string | null;
  /**
   * The symbology `code` was read from ("qr_code", "pdf417", …). Only a QR can
   * be honestly redrawn larger from its payload, so the viewer checks this
   * before offering the blown-up version.
   */
  codeFormat: string | null;
  /** Page images, in order. Page 1 is the one with the code on it. */
  pages: Blob[];
}

/* ---------- IndexedDB ---------- */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ---------- in-memory mirror ---------- */

/**
 * The price panel asks "do I already hold this night?" while it renders, so the
 * wallet is mirrored in memory and hydrated once at startup. Before hydration
 * the mirror is simply empty and the listeners repaint when it fills.
 */
let tickets: WalletTicket[] = [];
let hydrated = false;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeWallet(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** Read the stored tickets into memory. Safe to call more than once. */
export async function loadWallet(): Promise<void> {
  if (hydrated) return;
  try {
    const all = await withStore<WalletTicket[]>('readonly', (s) => s.getAll());
    tickets = all.map(normalise).sort((a, b) => a.addedAt - b.addedAt);
  } catch {
    tickets = []; // private mode, blocked storage, corrupted db — go on without
  }
  hydrated = true;
  notify();
}

/** Fill in fields written by an older build of the wallet. */
function normalise(ticket: WalletTicket): WalletTicket {
  const legacy = ticket as WalletTicket & { nightId?: NightId | null };
  if (ticket.scope == null && legacy.nightId) ticket.scope = legacy.nightId;
  if (ticket.wristbandAt === undefined) ticket.wristbandAt = null;
  return ticket;
}

export function walletTickets(): WalletTicket[] {
  return tickets;
}

/** Every night the tickets on this device cover — a pass covers all of them. */
export function heldNights(): Set<NightId> {
  const held = new Set<NightId>();
  for (const t of tickets) {
    if (t.scope === 'full') for (const day of DAYS) held.add(day.id);
    else if (t.scope) held.add(t.scope);
  }
  return held;
}

/** True once a pass is in the wallet — the whole run is paid for. */
export function hasFullPass(): boolean {
  return tickets.some((t) => t.scope === 'full');
}

export function ticketsForNight(id: NightId): WalletTicket[] {
  return tickets.filter((t) => t.scope === id || t.scope === 'full');
}

async function put(ticket: WalletTicket): Promise<void> {
  await withStore('readwrite', (s) => s.put(ticket));
}

/** Point a ticket at the pass or a single night, overriding the guess. */
export async function setTicketScope(id: string, scope: TicketScope | null): Promise<void> {
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return;
  ticket.scope = scope;
  ticket.guessed = false;
  await put(ticket);
  notify();
}

/**
 * Mark the ticket as exchanged at the gate — or un-mark it, for the tap that
 * happened in a pocket.
 */
export async function setWristband(id: string, on: boolean): Promise<void> {
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return;
  ticket.wristbandAt = on ? Date.now() : null;
  await put(ticket);
  notify();
}

export async function removeTicket(id: string): Promise<void> {
  tickets = tickets.filter((t) => t.id !== id);
  try {
    await withStore('readwrite', (s) => s.delete(id));
  } catch {
    /* it is already gone from the list the user sees */
  }
  notify();
}

/* ---------- import ---------- */

export class TicketImportError extends Error {}

/**
 * Take a file the user picked — a PDF from the ticket shop, or a photo or
 * screenshot of one — and store it as page images plus whatever the device
 * could read off it.
 */
export async function importTicketFile(file: File): Promise<WalletTicket> {
  await loadWallet();

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) {
    throw new TicketImportError('That file is not a PDF or an image.');
  }

  let pages: Blob[];
  let text = '';
  try {
    if (isPdf) {
      const rendered = await renderPdf(file);
      pages = rendered.pages;
      text = rendered.text;
    } else {
      pages = [file];
    }
  } catch {
    throw new TicketImportError(
      isPdf
        ? "That PDF couldn't be opened. A screenshot of the ticket works just as well."
        : "That image couldn't be read.",
    );
  }
  if (pages.length === 0) throw new TicketImportError('That file had no pages in it.');

  const read = await readCode(pages[0]);
  const scope = guessScope(`${text}\n${file.name}`);
  const ticket: WalletTicket = {
    id: newId(),
    name: file.name || 'Ticket',
    kind: isPdf ? 'pdf' : 'image',
    addedAt: Date.now(),
    scope,
    guessed: scope != null,
    wristbandAt: null,
    code: read?.value ?? null,
    codeFormat: read?.format ?? null,
    pages,
  };

  try {
    await put(ticket);
  } catch {
    throw new TicketImportError("This device wouldn't store the ticket — is storage full?");
  }
  tickets = [...tickets, ticket];
  notify();
  return ticket;
}

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Rasterise the PDF once, here, rather than keeping a viewer on the hot path:
 * at the gate the ticket has to be on screen before the person behind you sighs.
 *
 * pdf.js is pulled in on demand and shipped in its legacy build so older iOS
 * Safari can open a ticket too. No cmaps or standard-font data are bundled —
 * ticket PDFs embed their fonts, and the barcode is vector art either way.
 */
async function renderPdf(file: File): Promise<{ pages: Blob[]; text: string }> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const pages: Blob[] = [];
  const texts: string[] = [];
  const count = Math.min(doc.numPages, MAX_PAGES);
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, PAGE_WIDTH / base.width) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    // Ticket PDFs are drawn on transparent white; give the scanner real paper.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;

    pages.push(await toBlob(canvas));

    try {
      const content = await page.getTextContent();
      texts.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' '),
      );
    } catch {
      /* an image-only ticket still scans fine */
    }
    page.cleanup();
  }
  await doc.destroy();

  return { pages, text: texts.join('\n') };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/png');
  });
}

/* ---------- reading the code off the page ---------- */

interface DetectedBarcode {
  rawValue: string;
  format?: string;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
};

/**
 * Chrome on Android can read the ticket's own QR; Safari can't. This is a
 * bonus, never a requirement — the code is shown as text under the ticket so
 * you can read it out at the gate if a scanner is having a bad night. The
 * page image is what actually gets scanned, and it is stored either way.
 */
async function readCode(page: Blob): Promise<{ value: string; format: string | null } | null> {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    const detector = new Ctor({ formats: ['qr_code', 'aztec', 'pdf417', 'code_128'] });
    bitmap = await createImageBitmap(page);
    const found = await detector.detect(bitmap);
    const hit = found.find((b) => b.rawValue?.trim());
    return hit ? { value: hit.rawValue.trim(), format: hit.format ?? null } : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/* ---------- pass, or which night? ---------- */

/**
 * What did you buy? Ticket shops write dates and Romanian shop-speak, not
 * "Night III", so it is read back out of the PDF's text:
 *
 * - an abonament / full pass / "4 zile" says so outright;
 * - a ticket naming the whole run, or more than one of its days, is a pass;
 * - exactly one date, or "ziua 2", is that one night;
 * - anything else stays unset rather than wrong, and the card says so.
 */
export function guessScope(text: string): TicketScope | null {
  const norm = text.toLowerCase().replace(/\s+/g, ' ');

  if (/\babonament|full[ -]?(?:festival )?pass|festival pass|4 (?:zile|days)|toate zilele|all (?:four )?(?:days|nights)\b/.test(norm)) {
    return 'full';
  }

  // "12-15 august": a compact range names the run, and would otherwise read as
  // its own end date, so it is taken out before the single dates are counted.
  const compactRange = /1[2-5]\s*[-–—]\s*1[2-5]/.test(norm);
  const singles = norm.replace(/1[2-5]\s*[-–—]\s*1[2-5]/g, ' ');

  const hits = new Set<NightId>();
  for (const day of DAYS) {
    const [y, m, d] = day.date.split('-');
    const dd = String(Number(d));
    const mm = String(Number(m));
    const stamps = [
      day.date,
      `${d}.${m}.${y}`,
      `${dd}.${mm}.${y}`,
      `${d}/${m}/${y}`,
      `${dd}/${mm}/${y}`,
      `${d}-${m}-${y}`,
      `${dd} august`,
      `${dd} aug`,
    ];
    if (stamps.some((s) => singles.includes(s))) hits.add(day.id);
  }

  // Romanian ticket shops label the nights: "ziua 2", "day 2".
  const numbered = singles.match(/\b(?:ziua|zi|day|night|noaptea)\s*([1-4])\b/);
  if (numbered) hits.add(DAYS[Number(numbered[1]) - 1].id);

  if (hits.size === 1) return [...hits][0];
  if (hits.size > 1) return 'full'; // several days on one ticket is a pass
  return compactRange ? 'full' : null;
}
