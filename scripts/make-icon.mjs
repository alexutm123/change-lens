// Рисует иконку расширения 128×128 без внешних зависимостей.
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outFile = path.join(root, 'extension', 'media', 'icon.png');

const SIZE = 128;
const SS = 3; // суперсэмплинг для сглаживания
const W = SIZE * SS;

/** @type {Float32Array} RGBA 0..1 */
const pixels = new Float32Array(W * W * 4);

function blend(x, y, [r, g, b], alpha = 1) {
  const i = (y * W + x) * 4;
  const dstA = pixels[i + 3];
  const outA = alpha + dstA * (1 - alpha);
  if (outA === 0) return;
  pixels[i] = (r / 255) * alpha + pixels[i] * dstA * (1 - alpha);
  pixels[i + 1] = (g / 255) * alpha + pixels[i + 1] * dstA * (1 - alpha);
  pixels[i + 2] = (b / 255) * alpha + pixels[i + 2] * dstA * (1 - alpha);
  pixels[i + 3] = outA;
}

function roundRect(x0, y0, w, h, radius, color, alpha = 1) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
      if (dx * dx + dy * dy > radius * radius) continue;
      blend(x, y, color, alpha);
    }
  }
}

// Фон: синий градиент со скруглением.
const R = 26 * SS;
for (let y = 0; y < W; y += 1) {
  const t = y / (W - 1);
  const color = [Math.round(77 + (46 - 77) * t), Math.round(107 + (63 - 107) * t), Math.round(254 + (216 - 254) * t)];
  for (let x = 0; x < W; x += 1) {
    const dx = Math.max(R - x, 0, x - (W - 1 - R));
    const dy = Math.max(R - y, 0, y - (W - 1 - R));
    if (dx * dx + dy * dy > R * R) continue;
    blend(x, y, color, 1);
  }
}

const bar = (x, y, w, h, color, alpha = 1) => roundRect(x * SS, y * SS, w * SS, h * SS, (h / 2) * SS, color, alpha);

// Три «строки кода»: нейтральная, добавленная, удалённая.
bar(22, 30, 84, 13, [255, 255, 255], 0.55);
bar(34, 56, 72, 13, [63, 185, 80], 1);
bar(22, 82, 56, 13, [248, 81, 73], 1);

// Даунсэмплинг.
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
        a += pixels[i + 3];
      }
    }
    const n = SS * SS;
    const alpha = a / n;
    const target = (y * SIZE + x) * 4;
    rgba[target] = alpha > 0 ? Math.round((r / n / alpha) * 255) : 0;
    rgba[target + 1] = alpha > 0 ? Math.round((g / n / alpha) * 255) : 0;
    rgba[target + 2] = alpha > 0 ? Math.round((b / n / alpha) * 255) : 0;
    rgba[target + 3] = Math.round(alpha * 255);
  }
}

// --- PNG ---
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0;
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, png);
console.log(`icon: ${outFile} (${png.length} байт)`);
