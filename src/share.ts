import { DAYS, FESTIVAL, RUNNING_ORDER_ANNOUNCED } from './data';
import type { NightId, SetSlot } from './types';
import { getSlot } from './schedule';
import { selection } from './store';

export const SHARE_URL = 'https://aoprisan.github.io/dbe2026/';
const FILE_NAME = 'dbe-12-picks.png';

/** The poster's own ink: near-black paper, parchment type, antique gold rules. */
export const COLORS = {
  bgTop: '#14110d',
  bgBottom: '#08070a',
  panel: '#16130f',
  line: '#2e2820',
  text: '#efe6d0',
  muted: '#9c9082',
  accent: '#c9a961',
  ceremony: '#9d84c4',
  thu: '#c9a961',
  fri: '#6fb0a8',
  sat: '#c97a4a',
} as const;

function selectedSlots(): SetSlot[] {
  return selection
    .ids()
    .map((id) => getSlot(id))
    .filter((s): s is SetSlot => Boolean(s));
}

export interface ShareResult {
  /** 'shared' via the native sheet, 'downloaded' as a fallback, or 'empty'. */
  outcome: 'shared' | 'downloaded' | 'empty';
}

/**
 * Render the current selection to a PNG and offer it to the user — via the
 * native mobile share sheet where available, otherwise as a file download.
 */
export async function shareSelection(): Promise<ShareResult> {
  if (selection.size() === 0) return { outcome: 'empty' };
  const blob = await renderSelectionPng();
  return sharePngBlob(blob, FILE_NAME, {
    title: `My ${FESTIVAL.shortName} 12 nights`,
    text: `My nights at ${FESTIVAL.name} 2026 — ${SHARE_URL}`,
  });
}

/**
 * Offer a rendered PNG via the native share sheet, falling back to a file
 * download. Shared by the picks image and the Rewind recap.
 */
export async function sharePngBlob(
  blob: Blob,
  fileName: string,
  meta: { title: string; text: string },
): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: 'image/png' });
  const shareData: ShareData = { files: [file], ...meta };

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.canShare === 'function' && nav.canShare(shareData) && nav.share) {
    try {
      await nav.share(shareData);
      return { outcome: 'shared' };
    } catch (err) {
      // User dismissed the share sheet — treat as a no-op, don't fall back.
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { outcome: 'shared' };
      }
      // Any other failure: fall through to a download so the user still gets it.
    }
  }

  downloadBlob(blob, fileName);
  return { outcome: 'downloaded' };
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function nightColor(id: NightId): string {
  return COLORS[id];
}

/** Build a PNG image (Blob) of the current selection. */
export function renderSelectionPng(): Promise<Blob> {
  const slots = selectedSlots();

  const byDay = DAYS.map((day) => ({
    day,
    picks: slots
      .filter((s) => s.dayId === day.id)
      .sort((a, b) => a.start - b.start),
  })).filter((g) => g.picks.length > 0);

  // ---- layout metrics (logical px) ----
  const W = 560;
  const PAD = 28;
  const HEADER_H = 150;
  const DAY_HEAD_H = 46;
  const ROW_H = 60;
  const DAY_GAP = 18;
  const FOOTER_H = 64;

  let bodyH = 0;
  for (const g of byDay) {
    bodyH += DAY_HEAD_H + g.picks.length * ROW_H + DAY_GAP;
  }
  const H = HEADER_H + bodyH + FOOTER_H;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  // ---- background ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(0.55, COLORS.bgBottom);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // A hairline gold frame, the way the posters carry one.
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  roundRect(ctx, 10, 10, W - 20, H - 20, 10);
  ctx.stroke();

  // ---- header ----
  const nameGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  nameGrad.addColorStop(0, COLORS.text);
  nameGrad.addColorStop(0.55, COLORS.accent);
  nameGrad.addColorStop(1, COLORS.sat);
  ctx.fillStyle = nameGrad;
  ctx.font = '800 26px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('DARK BOMBASTIC EVENING', PAD, 56);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(
    truncate(ctx, `${FESTIVAL.edition} · ${FESTIVAL.dates} · ${FESTIVAL.location}`, W - 2 * PAD),
    PAD,
    80,
  );

  // stat pills
  const picks = slots.length;
  const nights = byDay.length;
  let pillX = PAD;
  const pillY = 100;
  pillX = drawPill(
    ctx,
    pillX,
    pillY,
    `${picks} ${picks === 1 ? 'set' : 'sets'}`,
    COLORS.text,
    COLORS.line,
    COLORS.panel,
  );
  drawPill(
    ctx,
    pillX + 8,
    pillY,
    `${nights} ${nights === 1 ? 'night' : 'nights'}`,
    COLORS.text,
    COLORS.line,
    COLORS.panel,
  );

  // ---- body ----
  let y = HEADER_H;
  for (const { day, picks: dayPicks } of byDay) {
    // day header
    ctx.fillStyle = COLORS.text;
    ctx.font = '800 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(day.label, PAD, y + 22);

    const date = new Date(day.date + 'T00:00:00');
    const dateStr = date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(dateStr, W - PAD, y + 22);
    ctx.textAlign = 'left';

    // underline
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + DAY_HEAD_H - 10);
    ctx.lineTo(W - PAD, y + DAY_HEAD_H - 10);
    ctx.stroke();

    y += DAY_HEAD_H;

    for (const slot of dayPicks) {
      drawPickRow(ctx, slot, PAD, y, W - 2 * PAD, ROW_H - 8);
      y += ROW_H;
    }
    y += DAY_GAP;
  }

  // ---- footer ----
  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    RUNNING_ORDER_ANNOUNCED
      ? 'Unofficial night planner · times subject to change'
      : 'Unofficial night planner · running order not announced — times provisional',
    W / 2,
    H - 36,
  );
  ctx.fillStyle = COLORS.accent;
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(SHARE_URL.replace(/^https?:\/\//, ''), W / 2, H - 18);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });
}

function drawPickRow(
  ctx: CanvasRenderingContext2D,
  slot: SetSlot,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const color = nightColor(slot.dayId);

  // card background
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();

  // night colour bar
  roundRect(ctx, x, y, 5, h, 2.5);
  ctx.fillStyle = color;
  ctx.fill();

  const innerX = x + 18;

  // time — a leading "~" is the whole honesty of a provisional slot.
  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  const tilde = slot.tba ? '~' : '';
  ctx.fillText(`${tilde}${slot.startLabel}–${slot.endLabel}`, innerX, y + h / 2 - 4);

  // genre
  ctx.fillStyle = color;
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText((slot.genre ?? slot.night.name).toUpperCase(), innerX, y + h / 2 + 14);

  // band name (right area), truncated to fit
  ctx.fillStyle = COLORS.text;
  ctx.font = '800 17px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right';
  const maxBandW = w - 170;
  const star = selection.isStarred(slot.id) ? '★ ' : '';
  ctx.fillText(star + truncate(ctx, slot.band, maxBandW), x + w - 14, y + h / 2 + 6);
  ctx.textAlign = 'left';
}

export function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  textColor: string,
  borderColor: string,
  fillColor: string,
): number {
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const padX = 12;
  const w = tw + padX * 2;
  const h = 26;
  roundRect(ctx, x, y, w, h, 13);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.fillText(text, x + padX, y + h / 2 + 5);
  return x + w;
}

export function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
