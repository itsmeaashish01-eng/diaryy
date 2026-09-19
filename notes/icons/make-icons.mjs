#!/usr/bin/env node
/* ================================================
   INKWELL — make-icons.mjs
   The app icons, drawn in code rather than committed as art nobody can
   edit. Run `node notes/icons/make-icons.mjs` to regenerate them.

   PNG by hand because the alternative is a dependency: the format is a
   signature, a header chunk, a zlib-compressed block of scanlines and a
   checksum, and node has zlib built in. Supersampled 4× and averaged
   down, which is all anti-aliasing is.
   ================================================ */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const SLATE = [47, 59, 71];
const CREAM = [255, 253, 248];
const CLAY = [199, 120, 76];

/* The mark: a nib. A rounded square, a downward wedge with a slit up the
   middle, and a clay dot where the ink sits. */
function sample(x, y, size, padded) {
  const inset = padded ? size * 0.08 : 0;      // maskable icons get cropped
  const s = size - inset * 2;
  const u = (x - inset) / s, v = (y - inset) / s;

  if (u < 0 || u > 1 || v < 0 || v > 1) return padded ? SLATE : null;

  // The plate. Full bleed for maskable, rounded otherwise.
  if (!padded) {
    const r = 0.22;
    const cx = Math.max(r, Math.min(1 - r, u));
    const cy = Math.max(r, Math.min(1 - r, v));
    if (Math.hypot(u - cx, v - cy) > r) return null;
  }

  // Nib: a triangle tapering to a point at the bottom.
  const nibTop = 0.20, nibTip = 0.80, halfWidth = 0.21;
  if (v >= nibTop && v <= nibTip) {
    const t = (v - nibTop) / (nibTip - nibTop);
    // Concave sides — the exponent above 1 is what makes it read as a
    // nib rather than a cup.
    let w = halfWidth * Math.pow(1 - t, 1.55);
    // Rounded shoulders: without this the top is a hard bar.
    if (t < 0.14) w = Math.min(w, halfWidth * Math.sqrt(1 - Math.pow(1 - t / 0.14, 2)));
    const dx = Math.abs(u - 0.5);
    if (dx <= w) {
      // The slit, and the ink hole at the top of it.
      if (dx < 0.020 && v > 0.44) return SLATE;
      if (Math.hypot(u - 0.5, v - 0.44) < 0.050) return CLAY;
      return CREAM;
    }
  }

  // The stroke the nib has just laid down.
  if (v > 0.845 && v < 0.90 && u > 0.24 && u < 0.76) {
    const fade = 1 - Math.abs(u - 0.5) / 0.26;
    if (fade > 0.12) return CREAM;
  }

  return SLATE;
}

function render(size, { padded = false } = {}) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, padded);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      // Pre-averaged over the covered samples, so edges fade rather than
      // darkening towards black.
      px[i] = a ? Math.round(r / (a / 255)) : 0;
      px[i + 1] = a ? Math.round(g / (a / 255)) : 0;
      px[i + 2] = a ? Math.round(b / (a / 255)) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

function png(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;               // filter type 0: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;        // bit depth
  ihdr[9] = 6;        // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const WANTED = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-180.png", size: 180 },
  { file: "icon-maskable-512.png", size: 512, padded: true },
];

for (const { file, size, padded } of WANTED) {
  writeFileSync(join(HERE, file), png(size, render(size, { padded })));
  console.log(`${file}  ${size}×${size}`);
}
