/**
 * The Dark Bombastic Evening emblem, as vector art.
 *
 * The festival mark is white line work on black: a symmetrical mask built from
 * scrollwork, two heavy-lashed eyes looking out of it, and a four-pointed star
 * on the brow between them. It is drawn here once, in a 512x512 box, and used
 * for every icon the app ships — the PWA icons and the favicon are rasterised
 * from this file by gen-icons.mjs, and public/logo.svg is written straight out
 * of it for the masthead.
 *
 * Only the left half is authored. Anything with `mirror` left at its default is
 * drawn twice, the second time flipped about x = 256, which is what keeps the
 * two halves of the face identical. Elements that sit on the centre line — the
 * crown, the star, the stem — set `mirror: false`.
 *
 * Paths use absolute M/L/C/Z only; that is all the little parser in this file
 * and the one in gen-icons.mjs understand, and it is enough for line art.
 */

export const SIZE = 512;
export const AXIS = SIZE; // mirror about x = AXIS / 2

/**
 * Stroke widths, in the 512 box. Three weights only: the silhouette, the
 * secondary scrollwork that echoes it, and the fine detail inside the eyes.
 * Holding to three keeps the mark legible when it is downsampled to 32px.
 */
const HEAVY = 5.4;
const MEDIUM = 3.2;
const FINE = 2.2;

export const ART = [
  // ---------- the silhouette ----------
  // Bottom point, out through the widest part of the cheek, up past the temple,
  // and over into the curl that finishes the horn.
  {
    d:
      'M 256 432 C 214 420 166 394 136 356 C 106 318 92 272 98 226 ' +
      'C 104 180 132 150 172 140 C 188 136 196 126 192 114 ' +
      'C 187 103 171 102 165 112 C 159 122 166 133 177 134',
    w: HEAVY,
  },
  // The inner line that runs with it — an ornate border is never one stroke.
  {
    d:
      'M 256 414 C 218 403 176 379 150 345 C 124 311 112 271 118 232 ' +
      'C 124 194 148 168 182 157',
    w: FINE,
  },
  // Leaves on the outside of the arc, where the silhouette is widest.
  {
    d: 'M 99 214 C 84 205 77 190 82 174 C 93 183 100 198 99 214 Z',
    fill: true,
  },
  {
    d: 'M 110 292 C 93 292 80 284 75 269 C 90 267 104 276 110 292 Z',
    fill: true,
  },

  // ---------- the brow sweeps, temple to crown ----------
  { d: 'M 178 136 C 204 120 230 113 256 112', w: MEDIUM },
  { d: 'M 190 154 C 212 140 234 133 256 131', w: FINE },
  // Leaves riding the upper sweep.
  {
    d: 'M 208 122 C 220 108 236 102 252 105 C 239 117 224 124 208 122 Z',
    fill: true,
  },
  {
    d: 'M 176 138 C 181 122 192 111 208 108 C 202 125 191 136 176 138 Z',
    fill: true,
  },
  // A tendril curling back off the horn, outside the silhouette.
  {
    d: 'M 165 112 C 149 107 136 115 134 129 C 133 139 141 147 149 144',
    w: FINE,
  },

  // ---------- the crown, on the centre line ----------
  {
    d: 'M 256 76 C 263 92 265 102 256 116 C 247 102 249 92 256 76 Z',
    fill: true,
    mirror: false,
  },
  { c: [256, 66, 4.5], fill: true, mirror: false },

  // ---------- the star between the eyes ----------
  {
    d:
      'M 256 202 C 259 236 264 244 288 250 C 264 256 259 264 256 298 ' +
      'C 253 264 248 256 224 250 C 248 244 253 236 256 202 Z',
    fill: true,
    mirror: false,
  },

  // ---------- the eye ----------
  // Upper lid, from the inner corner out to the temple; then the lower lid back.
  { d: 'M 238 272 C 216 236 168 226 134 254', w: HEAVY },
  { d: 'M 134 254 C 152 292 200 302 238 272', w: MEDIUM },
  // Iris, pupil, and the glint that makes it a look rather than a stare.
  { c: [186, 262, 23], w: MEDIUM },
  { c: [186, 262, 10], fill: true },
  { c: [196, 252, 4], fill: true },
  // Lashes, radiating off the upper lid.
  { d: 'M 219 245 C 222 227 219 212 209 199', w: FINE },
  { d: 'M 200 235 C 199 216 191 203 179 194', w: FINE },
  { d: 'M 178 228 C 171 211 160 200 146 195', w: FINE },
  { d: 'M 157 231 C 145 219 131 212 115 210', w: FINE },
  { d: 'M 141 243 C 127 237 112 235 97 238', w: FINE },
  // The brow above them.
  { d: 'M 111 234 C 142 200 192 196 230 221', w: MEDIUM },

  // ---------- scrollwork under the eye ----------
  {
    d:
      'M 226 300 C 198 312 174 332 162 358 C 154 374 163 388 178 384 ' +
      'C 190 381 191 366 179 362',
    w: MEDIUM,
  },
  { d: 'M 216 316 C 192 328 174 344 164 366', w: FINE },
  {
    d: 'M 208 340 C 193 352 177 357 160 353 C 175 340 191 336 208 340 Z',
    fill: true,
  },
  // The vine that carries the scroll down to the point.
  { d: 'M 178 384 C 200 396 224 408 244 424', w: FINE },
  {
    d: 'M 250 402 C 236 400 224 392 218 380 C 233 380 245 388 250 402 Z',
    fill: true,
  },

  // ---------- the point ----------
  {
    d: 'M 256 388 C 263 404 264 416 256 432 C 248 416 249 404 256 388 Z',
    fill: true,
    mirror: false,
  },
];

/* ------------------------------------------------------------------ */
/* Path plumbing — a parser small enough to be shared by both outputs. */
/* ------------------------------------------------------------------ */

function tokenize(d) {
  return d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
}

/** Reflect a path about the vertical centre line, so the left half draws both. */
export function mirrorPath(d) {
  const tokens = tokenize(d);
  const out = [];
  let isX = true;

  for (const token of tokens) {
    if (/[A-Za-z]/.test(token)) {
      out.push(token);
      isX = true;
      continue;
    }
    const value = parseFloat(token);
    out.push(String(isX ? Number((AXIS - value).toFixed(2)) : value));
    isX = !isX;
  }

  return out.join(' ');
}

/** Flatten a path to polylines, for the rasteriser. */
export function flattenPath(d, steps = 28) {
  const tokens = tokenize(d);
  const subpaths = [];
  let current = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = '';
  let i = 0;
  const next = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];

    if (command === 'M') {
      x = next();
      y = next();
      startX = x;
      startY = y;
      current = [[x, y]];
      subpaths.push(current);
      // A second coordinate pair after M is an implicit lineto, per SVG.
      command = 'L';
    } else if (command === 'L') {
      x = next();
      y = next();
      current.push([x, y]);
    } else if (command === 'C') {
      const x1 = next();
      const y1 = next();
      const x2 = next();
      const y2 = next();
      const x3 = next();
      const y3 = next();
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const u = 1 - t;
        current.push([
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else if (command === 'Z' || command === 'z') {
      current.push([startX, startY]);
      x = startX;
      y = startY;
      command = '';
    } else {
      i += 1;
    }
  }

  return subpaths;
}

/** Every shape, with mirrored copies expanded — the drawing order for both outputs. */
export function shapes() {
  const out = [];

  for (const shape of ART) {
    out.push(shape);
    if (shape.mirror === false) continue;

    if (shape.c) {
      out.push({ ...shape, c: [AXIS - shape.c[0], shape.c[1], shape.c[2]] });
    } else {
      out.push({ ...shape, d: mirrorPath(shape.d) });
    }
  }

  return out;
}

/**
 * The tightest square box that still holds every stroke, centred on the art.
 *
 * The 512 box the emblem is authored in carries margin on all four sides — room
 * an installed icon wants, and dead space anywhere the mark is set beside type.
 * This measures the ink itself (curves flattened, stroke width counted at the
 * ends) so a caller can hand the emblem a viewBox with nothing to spare.
 */
export function inkBox() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes()) {
    // A stroke is centred on its path, so it reaches half a width past it; the
    // round caps and joins put no more than that anywhere. Fills stop at the path.
    const reach = shape.fill ? 0 : shape.w / 2;

    if (shape.c) {
      const [cx, cy, r] = shape.c;
      minX = Math.min(minX, cx - r - reach);
      maxX = Math.max(maxX, cx + r + reach);
      minY = Math.min(minY, cy - r - reach);
      maxY = Math.max(maxY, cy + r + reach);
      continue;
    }

    for (const subpath of flattenPath(shape.d)) {
      for (const [x, y] of subpath) {
        minX = Math.min(minX, x - reach);
        maxX = Math.max(maxX, x + reach);
        minY = Math.min(minY, y - reach);
        maxY = Math.max(maxY, y + reach);
      }
    }
  }

  // Square, so the mark keeps its proportions in a square box and no
  // preserveAspectRatio letterboxing puts the margin back.
  const side = Math.max(maxX - minX, maxY - minY);
  const round = (n) => Number(n.toFixed(2));
  return {
    x: round((minX + maxX) / 2 - side / 2),
    y: round((minY + maxY) / 2 - side / 2),
    side: round(side),
  };
}

/**
 * The emblem as SVG markup, sized to `size` and inset by `pad` (a fraction of
 * the box) so callers can leave room for a maskable icon's safe area.
 *
 * `trim` swaps the authored 512 box for the ink's own bounds, which is what the
 * masthead wants: there the mark is set beside type and has to fill the space it
 * is given rather than float in the middle of it.
 */
export function toSvg({ size = SIZE, background = '#08070a', ink = '#f7f4ef', pad = 0, rounded = 0, trim = false } = {}) {
  const scale = 1 - pad * 2;
  const body = shapes()
    .map((shape) => {
      if (shape.c) {
        const [cx, cy, r] = shape.c;
        return shape.fill
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink}"/>`
          : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="${shape.w}"/>`;
      }
      return shape.fill
        ? `<path d="${shape.d}" fill="${ink}"/>`
        : `<path d="${shape.d}" fill="none" stroke="${ink}" stroke-width="${shape.w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('\n    ');

  const backdrop = background
    ? `<rect width="${SIZE}" height="${SIZE}" rx="${rounded}" fill="${background}"/>\n  `
    : '';
  const open = scale === 1
    ? '<g>'
    : `<g transform="translate(${(SIZE * pad * 2) / 2} ${(SIZE * pad * 2) / 2}) scale(${scale.toFixed(4)})">`;

  const box = trim ? inkBox() : { x: 0, y: 0, side: SIZE };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.side} ${box.side}" width="${size}" height="${size}" role="img" aria-label="Dark Bombastic Evening">
  ${backdrop}${open}
    ${body}
  </g>
</svg>
`;
}
