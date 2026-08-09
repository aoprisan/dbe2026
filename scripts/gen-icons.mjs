/**
 * Rasterises the festival emblem (scripts/logo-art.mjs) into the PNG icons the
 * PWA installs with, and writes the SVG favicon and masthead logo from the same
 * source. Run by `npm run icons`, which the build runs for you.
 *
 * There is no image library here on purpose — the repo installs a compiler and
 * a bundler and nothing else. The emblem is line art, so it rasterises well
 * with a round brush: coverage is accumulated at 3x into a float mask, the mask
 * is box-filtered down to the icon size, and the ink is composited over the
 * background once at the end. Doing it in that order keeps overlapping strokes
 * from stacking into bright seams, and gives the edges their antialiasing for
 * free.
 */

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIZE, flattenPath, shapes, toSvg } from './logo-art.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');

const SUPERSAMPLE = 3;
const BACKGROUND = [8, 7, 10]; // #08070a — the app's own backdrop
const INK = [247, 244, 239]; // warm white, as the mark is printed

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

/* ---------------------------- coverage mask ---------------------------- */

/** Round brush: stamp a soft disc of `radius` and keep the strongest coverage. */
function stamp(mask, width, cx, cy, radius) {
  const minX = Math.max(0, Math.floor(cx - radius - 1));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + 1));
  const minY = Math.max(0, Math.floor(cy - radius - 1));
  const maxY = Math.min(width - 1, Math.ceil(cy + radius + 1));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const alpha = clamp(radius + 0.5 - distance);
      if (alpha <= 0) continue;
      const offset = y * width + x;
      if (alpha > mask[offset]) mask[offset] = alpha;
    }
  }
}

/** Walk a polyline, stamping often enough that the discs overlap into a line. */
function strokePolyline(mask, width, points, radius) {
  if (points.length === 1) {
    stamp(mask, width, points[0][0], points[0][1], radius);
    return;
  }

  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(length / 0.4));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      stamp(mask, width, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius);
    }
  }
}

/** Non-zero scanline fill. Edges come out hard here and soften on downsample. */
function fillPolygons(mask, width, polygons) {
  const edges = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const [x0, y0] = polygon[i];
      const [x1, y1] = polygon[(i + 1) % polygon.length];
      if (y0 === y1) continue;
      edges.push([x0, y0, x1, y1]);
      minY = Math.min(minY, y0, y1);
      maxY = Math.max(maxY, y0, y1);
    }
  }
  if (!edges.length) return;

  const from = Math.max(0, Math.floor(minY));
  const to = Math.min(width - 1, Math.ceil(maxY));

  for (let y = from; y <= to; y += 1) {
    const scanY = y + 0.5;
    const crossings = [];
    for (const [x0, y0, x1, y1] of edges) {
      if (scanY < Math.min(y0, y1) || scanY >= Math.max(y0, y1)) continue;
      crossings.push({
        x: x0 + ((scanY - y0) / (y1 - y0)) * (x1 - x0),
        winding: y1 > y0 ? 1 : -1,
      });
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a.x - b.x);

    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i += 1) {
      winding += crossings[i].winding;
      if (winding === 0) continue;
      const spanStart = Math.max(0, Math.round(crossings[i].x));
      const spanEnd = Math.min(width - 1, Math.round(crossings[i + 1].x) - 1);
      for (let x = spanStart; x <= spanEnd; x += 1) mask[y * width + x] = 1;
    }
  }
}

/** Circles are drawn directly rather than approximated with beziers. */
function circle(mask, width, cx, cy, radius, strokeRadius, filled) {
  if (filled) {
    const minX = Math.max(0, Math.floor(cx - radius - 1));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius + 1));
    const minY = Math.max(0, Math.floor(cy - radius - 1));
    const maxY = Math.min(width - 1, Math.ceil(cy + radius + 1));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const alpha = clamp(radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
        const offset = y * width + x;
        if (alpha > mask[offset]) mask[offset] = alpha;
      }
    }
    return;
  }

  const steps = Math.max(48, Math.ceil(radius * 2));
  const points = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  strokePolyline(mask, width, points, strokeRadius);
}

/** The emblem's coverage at `width` pixels, drawn inset by `pad` of the box. */
function renderMask(width, pad) {
  const mask = new Float32Array(width * width);
  const scale = ((1 - pad * 2) * width) / SIZE;
  const offset = (width * pad * 2) / 2;
  const project = ([x, y]) => [x * scale + offset, y * scale + offset];

  for (const shape of shapes()) {
    if (shape.c) {
      const [cx, cy, r] = shape.c;
      const [px, py] = project([cx, cy]);
      circle(mask, width, px, py, r * scale, ((shape.w ?? 0) / 2) * scale, Boolean(shape.fill));
      continue;
    }

    const polylines = flattenPath(shape.d).map((points) => points.map(project));
    if (shape.fill) fillPolygons(mask, width, polylines);
    else for (const points of polylines) strokePolyline(mask, width, points, (shape.w / 2) * scale);
  }

  return mask;
}

/** Box-filter the supersampled mask down to the icon size. */
function downsampleMask(source, sourceWidth, targetWidth) {
  const ratio = sourceWidth / targetWidth;
  const output = new Float32Array(targetWidth * targetWidth);

  for (let y = 0; y < targetWidth; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      let total = 0;
      for (let sy = 0; sy < ratio; sy += 1) {
        for (let sx = 0; sx < ratio; sx += 1) {
          total += source[(y * ratio + sy) * sourceWidth + x * ratio + sx];
        }
      }
      output[y * targetWidth + x] = total / (ratio * ratio);
    }
  }

  return output;
}

/**
 * Ink over background. The backdrop is not flat black: it lifts very slightly
 * behind the mark, the way the emblem sits on the poster, which also stops the
 * icon from disappearing into a dark home screen.
 */
function composite(mask, size) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center) / size;
      const glow = clamp(1 - distance / 0.62) ** 2;
      const offset = (y * size + x) * 4;
      const coverage = clamp(mask[y * size + x]);

      for (let channel = 0; channel < 3; channel += 1) {
        const base = BACKGROUND[channel] + glow * [14, 11, 18][channel];
        pixels[offset + channel] = Math.round(base + (INK[channel] - base) * coverage);
      }
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function renderIcon(size, maskable = false) {
  // A maskable icon may be cropped to a circle inscribed in the middle 80%, so
  // the mark is pulled in to sit inside that safe area.
  const pad = maskable ? 0.14 : 0.05;
  const width = size * SUPERSAMPLE;
  return composite(downsampleMask(renderMask(width, pad), width, size), size);
}

/* -------------------------------- PNG -------------------------------- */

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(width, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * width);
  for (let y = 0; y < width; y += 1) {
    rows[y * (stride + 1)] = 0;
    rgba.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- output ------------------------------- */

await mkdir(publicDir, { recursive: true });
await Promise.all([
  writeFile(resolve(publicDir, 'icon-192.png'), encodePng(192, renderIcon(192))),
  writeFile(resolve(publicDir, 'icon-512.png'), encodePng(512, renderIcon(512))),
  writeFile(
    resolve(publicDir, 'icon-maskable-512.png'),
    encodePng(512, renderIcon(512, true)),
  ),
  // iOS does not round the corners of a transparent icon for you, and it does
  // not apply a maskable safe area either — so this one is square and padded
  // like the standard icon.
  writeFile(resolve(publicDir, 'apple-touch-icon.png'), encodePng(180, renderIcon(180))),
  writeFile(resolve(publicDir, 'favicon.svg'), toSvg({ size: 64, rounded: 96 })),
  // The masthead draws the mark on the page's own background, so no backdrop —
  // and trimmed to the ink, so the emblem fills the box the header gives it
  // instead of leaving a margin of nothing between itself and the title.
  writeFile(resolve(publicDir, 'logo.svg'), toSvg({ size: 512, background: null, trim: true })),
]);

console.log('Generated the emblem into public/ (PWA icons, favicon, logo).');
