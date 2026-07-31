import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');

const GLYPHS = {
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * clamp(amount));
}

function blendPixel(buffer, width, x, y, color, alpha = 1) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || x >= width || y < 0 || y >= width) return;

  const offset = (y * width + x) * 4;
  const a = clamp(alpha);
  buffer[offset] = mix(buffer[offset], color[0], a);
  buffer[offset + 1] = mix(buffer[offset + 1], color[1], a);
  buffer[offset + 2] = mix(buffer[offset + 2], color[2], a);
  buffer[offset + 3] = 255;
}

function fillRect(buffer, width, x, y, rectWidth, rectHeight, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + rectHeight); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + rectWidth); px += 1) {
      blendPixel(buffer, width, px, py, color);
    }
  }
}

function drawText(buffer, width, text, centerX, top, cell, color) {
  const spacing = cell;
  const glyphWidth = cell * 5;
  const totalWidth = text.length * glyphWidth + (text.length - 1) * spacing;
  let cursor = centerX - totalWidth / 2;

  for (const character of text) {
    const glyph = GLYPHS[character];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === '1') {
          fillRect(buffer, width, cursor + col * cell, top + row * cell, cell, cell, color);
        }
      }
    }
    cursor += glyphWidth + spacing;
  }
}

function renderIcon(size, maskable = false) {
  const scale = 3;
  const width = size * scale;
  const pixels = Buffer.alloc(width * width * 4);
  const center = width / 2;
  const safeScale = maskable ? 0.82 : 1;

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - center) / width;
      const dy = (y - center) / width;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const glow = clamp(1 - distance / 0.7);
      const ember = clamp(1 - Math.sqrt(dx * dx + (dy + 0.34) ** 2) / 0.45);
      const noise = ((x * 17 + y * 31) % 23) / 255;
      const offset = (y * width + x) * 4;

      pixels[offset] = mix(8, 31, glow * 0.52 + ember * 0.24 + noise);
      pixels[offset + 1] = mix(7, 17, glow * 0.42 + noise);
      pixels[offset + 2] = mix(10, 37, glow * 0.62 + noise);
      pixels[offset + 3] = 255;
    }
  }

  const ringRadius = width * 0.365 * safeScale;
  const ringThickness = width * 0.012 * safeScale;
  const gold = [205, 173, 102];
  const warmGold = [234, 199, 118];
  const ink = [13, 10, 15];

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      const ringDistance = Math.abs(distance - ringRadius);
      if (ringDistance <= ringThickness) {
        blendPixel(pixels, width, x, y, gold, 1 - ringDistance / ringThickness);
      }
      if (distance < ringRadius - ringThickness * 2) {
        const innerGlow = clamp(1 - distance / ringRadius);
        blendPixel(pixels, width, x, y, [20, 13, 25], 0.12 + innerGlow * 0.18);
      }
    }
  }

  const flameY = center - ringRadius * 0.7;
  const flameHeight = width * 0.13 * safeScale;
  const flameWidth = width * 0.055 * safeScale;
  for (let y = flameY - flameHeight / 2; y <= flameY + flameHeight / 2; y += 1) {
    for (let x = center - flameWidth; x <= center + flameWidth; x += 1) {
      const nx = (x - center) / flameWidth;
      const ny = (y - flameY) / (flameHeight / 2);
      const taper = ny < 0 ? 1 + ny * 0.72 : 1 - ny * 0.42;
      const inside = nx * nx + ny * ny * 0.72 < taper * taper;
      if (inside) {
        const heat = clamp(1 - Math.hypot(nx, ny * 0.7));
        blendPixel(pixels, width, x, y, warmGold, 0.72 + heat * 0.28);
      }
    }
  }

  const dbeCell = width * 0.031 * safeScale;
  const yearCell = width * 0.024 * safeScale;
  drawText(pixels, width, 'DBE', center, center - width * 0.10 * safeScale, dbeCell, warmGold);
  fillRect(
    pixels,
    width,
    center - width * 0.19 * safeScale,
    center + width * 0.145 * safeScale,
    width * 0.38 * safeScale,
    Math.max(2, width * 0.006 * safeScale),
    gold,
  );
  drawText(pixels, width, '12', center, center + width * 0.19 * safeScale, yearCell, gold);

  // Darken a small central notch so the flame reads crisply at favicon size.
  fillRect(
    pixels,
    width,
    center - width * 0.008 * safeScale,
    flameY + flameHeight * 0.09,
    width * 0.016 * safeScale,
    flameHeight * 0.28,
    ink,
  );

  return downsample(pixels, width, size);
}

function downsample(source, sourceWidth, targetWidth) {
  const ratio = sourceWidth / targetWidth;
  const output = Buffer.alloc(targetWidth * targetWidth * 4);

  for (let y = 0; y < targetWidth; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < ratio; sy += 1) {
        for (let sx = 0; sx < ratio; sx += 1) {
          const sourceOffset = ((y * ratio + sy) * sourceWidth + x * ratio + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            sums[channel] += source[sourceOffset + channel];
          }
        }
      }
      const targetOffset = (y * targetWidth + x) * 4;
      const samples = ratio * ratio;
      for (let channel = 0; channel < 4; channel += 1) {
        output[targetOffset + channel] = Math.round(sums[channel] / samples);
      }
    }
  }

  return output;
}

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

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#08070a"/>
  <circle cx="32" cy="32" r="24" fill="#140d19" stroke="#c9a961" stroke-width="2"/>
  <path d="M32 8c5 7 6 11 0 17-6-6-5-10 0-17Z" fill="#eac776"/>
  <text x="32" y="39" fill="#eac776" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle">DBE</text>
  <path d="M19 43h26" stroke="#c9a961"/>
  <text x="32" y="54" fill="#c9a961" font-family="Arial,sans-serif" font-size="8" font-weight="700" text-anchor="middle">12</text>
</svg>
`;

await mkdir(publicDir, { recursive: true });
await Promise.all([
  writeFile(resolve(publicDir, 'icon-192.png'), encodePng(192, renderIcon(192))),
  writeFile(resolve(publicDir, 'icon-512.png'), encodePng(512, renderIcon(512))),
  writeFile(
    resolve(publicDir, 'icon-maskable-512.png'),
    encodePng(512, renderIcon(512, true)),
  ),
  writeFile(resolve(publicDir, 'apple-touch-icon.png'), encodePng(180, renderIcon(180))),
  writeFile(resolve(publicDir, 'favicon.svg'), favicon),
]);

console.log('Generated PWA icons in public/.');
