#!/usr/bin/env node
/* ================================================
   INKWELL — selftest.mjs
   The parts that can be wrong without anyone noticing.

   No browser, no network, no dependencies — it runs in CI in a second.
   What it covers is deliberately the quiet stuff:

     - the stroke geometry, where an off-by-one in the outline shows up
       as ink that looks slightly wrong and never as an error;
     - the PDF writer, where a byte offset in the cross-reference table
       being wrong produces a file that opens in one reader and not in
       another;
     - the ZIP reader, against an archive this file builds itself, so a
       change to it is caught without a .docx checked into the repo;
     - the page geometry that decides where a dropped photo lands.

   What it cannot cover is how any of it feels under a pen. That needs a
   phone and a hand.
   ================================================ */

import { deflateRawSync } from "node:zlib";

import {
  clamp, dist, distToSegment, pointInPolygon, bboxOf, withAlpha, boxesOverlap, formatBytes,
} from "./js/util.js";
import {
  smooth, simplify, thin, radiusAt, outline, makeStroke, strokeHit, strokeInLasso,
  translateStroke, snapToShape,
} from "./js/strokes.js";
import { buildPDF, pageToPoints } from "./js/pdfout.js";
import { unzip, readDocx, readPptx, paragraphsFrom } from "./js/office.js";
import { PAGE_SIZES, PAPERS, drawPaper, newPage } from "./js/paper.js";
import { resizeObject, rotateObject, objectHit, fitOnPage, fileKind, MIN_SIZE } from "./js/objects.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (err) { failures.push(`${name}: ${err.message}`); }
}

async function checkAsync(name, fn) {
  try { await fn(); passed++; }
  catch (err) { failures.push(`${name}: ${err.message}`); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg || "not near"}: ${a} vs ${b} (tol ${tol})`);
}

/* ================================================
   util
   ================================================ */

check("clamp holds the bounds", () => {
  assert(clamp(5, 0, 3) === 3);
  assert(clamp(-5, 0, 3) === 0);
  assert(clamp(1.5, 0, 3) === 1.5);
});

check("distToSegment clamps to the ends", () => {
  // Past the end of the segment, the nearest point is the endpoint —
  // not the infinite line, which would report zero here.
  near(distToSegment(10, 0, 0, 0, 5, 0), 5, 1e-9, "beyond the end");
  near(distToSegment(2, 3, 0, 0, 5, 0), 3, 1e-9, "perpendicular");
  near(distToSegment(0, 0, 4, 4, 4, 4), Math.hypot(4, 4), 1e-9, "degenerate segment");
});

check("pointInPolygon handles a concave shape", () => {
  // A C, open to the right. The gap must read as outside.
  const c = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10]];
  assert(pointInPolygon(1, 5, c), "inside the spine");
  assert(!pointInPolygon(7, 5, c), "the gap is outside");
  assert(pointInPolygon(5, 1, c), "inside the top arm");
});

check("bboxOf pads on every side", () => {
  const b = bboxOf([[0, 0], [10, 4]], 2);
  assert(b.x === -2 && b.y === -2, `origin ${b.x},${b.y}`);
  assert(b.w === 14 && b.h === 8, `size ${b.w}x${b.h}`);
});

check("boxesOverlap is symmetric and exclusive", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 5, y: 5, w: 10, h: 10 };
  const c = { x: 40, y: 40, w: 2, h: 2 };
  assert(boxesOverlap(a, b) && boxesOverlap(b, a));
  assert(!boxesOverlap(a, c) && !boxesOverlap(c, a));
});

check("withAlpha expands shorthand hex", () => {
  assert(withAlpha("#fff", 0.5) === "rgba(255, 255, 255, 0.5)", withAlpha("#fff", 0.5));
  assert(withAlpha("#1f2529", 1) === "rgba(31, 37, 41, 1)", withAlpha("#1f2529", 1));
});

check("formatBytes reads like a file manager", () => {
  assert(formatBytes(0) === "0 B");
  assert(formatBytes(1024) === "1.0 KB", formatBytes(1024));
  assert(formatBytes(5 * 1024 * 1024) === "5.0 MB", formatBytes(5 * 1024 * 1024));
});

/* ================================================
   strokes
   ================================================ */

check("smoothing keeps both endpoints", () => {
  const pts = [[0, 0, .5], [3, 9, .5], [6, 1, .5], [9, 8, .5], [12, 0, .5]];
  const out = smooth(pts);
  assert(out.length === pts.length, "length changed");
  assert(out[0][0] === 0 && out[0][1] === 0, "first moved");
  assert(out.at(-1)[0] === 12 && out.at(-1)[1] === 0, "last moved");
});

check("smoothing actually reduces the wobble", () => {
  const zigzag = Array.from({ length: 40 }, (_, i) => [i, i % 2 ? 6 : 0, .5]);
  const spread = (pts) => pts.reduce((sum, p, i) =>
    i ? sum + Math.abs(p[1] - pts[i - 1][1]) : 0, 0);
  assert(spread(smooth(zigzag)) < spread(zigzag) * 0.75, "not smoothed enough");
});

check("simplify drops the middle of a straight line", () => {
  const line = Array.from({ length: 50 }, (_, i) => [i * 2, 0, .5]);
  const out = simplify(line, 0.6);
  assert(out.length === 2, `kept ${out.length} points`);
});

check("simplify keeps a corner", () => {
  const bend = [...Array.from({ length: 20 }, (_, i) => [i, 0, .5]),
                ...Array.from({ length: 20 }, (_, i) => [19, i, .5])];
  const out = simplify(bend, 0.6);
  assert(out.length >= 3, "the corner was flattened away");
  assert(out.some((p) => p[0] === 19 && p[1] === 0), "the corner point is gone");
});

check("thin removes crowded points but keeps the last one", () => {
  const crowded = Array.from({ length: 30 }, (_, i) => [i * 0.05, 0, .5]);
  const out = thin(crowded, 0.34);
  assert(out.length < crowded.length, "nothing was thinned");
  assert(out.at(-1)[0] === crowded.at(-1)[0], "the pen-lift point was dropped");
});

check("pressure widens the pen and not the highlighter", () => {
  const light = radiusAt(10, 0.05, "pen");
  const heavy = radiusAt(10, 1, "pen");
  assert(heavy > light, "pressure did nothing");
  assert(light > 0.8, "light pressure vanishes");     // a floor, not zero
  assert(heavy <= 5.001, "wider than the nib");
  assert(radiusAt(30, 0.1, "highlighter") === radiusAt(30, 1, "highlighter"), "marker varies");
});

check("outline of a dot is a closed ring around it", () => {
  const poly = outline([[50, 50, 1]], 10, "pen");
  assert(poly.length >= 8, "too few points for a circle");
  for (const [x, y] of poly) near(Math.hypot(x - 50, y - 50), 5, 0.001, "not on the circle");
});

check("outline straddles the spine and closes", () => {
  const pts = Array.from({ length: 20 }, (_, i) => [i * 5, 100, 0.5]);
  const poly = outline(pts, 8, "pen");
  const ys = poly.map((p) => p[1]);
  assert(Math.max(...ys) > 100, "no ink below the spine");
  assert(Math.min(...ys) < 100, "no ink above the spine");
  // Both caps present: the outline reaches past each end of the spine.
  const xs = poly.map((p) => p[0]);
  assert(Math.min(...xs) < 0, "no start cap");
  assert(Math.max(...xs) > 95, "no end cap");
});

check("a two-point stroke has a body, not just two caps", () => {
  // The straight-line case: a highlighter swipe, or any stroke that
  // simplifies down to its endpoints. Get the end directions wrong and
  // the offsets collapse onto the spine, leaving a round cap at each
  // end and nothing in between.
  const poly = outline([[0, 100, 0.5], [200, 100, 0.5]], 30, "highlighter");
  // A straight run has no vertices between its ends, so the check is on
  // the offsets at the ends: both sides must be a full half-width off
  // the spine, not sitting on it.
  const ends = poly.filter(([x]) => x >= 0 && x <= 200);
  assert(ends.some(([, y]) => y >= 114), "no outline below the spine");
  assert(ends.some(([, y]) => y <= 86), "no outline above the spine");
});

check("the outline of a straight stroke encloses a real area", () => {
  // Shoelace: a polygon pinched to zero width comes out at nearly zero
  // however many points it has.
  const poly = outline([[0, 0, 0.5], [100, 0, 0.5]], 20, "highlighter");
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  area = Math.abs(area / 2);
  // 100 long by 20 wide, plus two half-caps, is a shade over 2000.
  assert(area > 1800, `area is only ${area.toFixed(1)}`);
});

check("a committed stroke carries a bbox that contains it", () => {
  const s = makeStroke({
    tool: "pen", color: "#000", size: 6, opacity: 1,
    points: Array.from({ length: 30 }, (_, i) => [i * 3, 40 + Math.sin(i / 3) * 20, 0.5]),
  });
  assert(s.points.length > 1, "simplified to nothing");
  for (const [x, y] of s.points) {
    assert(x >= s.bbox.x && x <= s.bbox.x + s.bbox.w, `x ${x} outside bbox`);
    assert(y >= s.bbox.y && y <= s.bbox.y + s.bbox.h, `y ${y} outside bbox`);
  }
});

check("the eraser catches what it touches and nothing else", () => {
  const s = makeStroke({
    tool: "pen", color: "#000", size: 8, opacity: 1,
    points: Array.from({ length: 20 }, (_, i) => [100 + i * 4, 200, 0.5]),
  });
  assert(strokeHit(s, 140, 200, 5), "missed a direct hit");
  assert(strokeHit(s, 140, 206, 3), "missed a graze");         // 6 away, +half width
  assert(!strokeHit(s, 140, 260, 5), "caught something far away");
  assert(!strokeHit(s, 400, 200, 5), "caught something past the end");
});

check("the lasso takes whole strokes only", () => {
  const inside = makeStroke({ tool: "pen", color: "#000", size: 3, opacity: 1, points: [[10, 10, .5], [20, 20, .5]] });
  const straddling = makeStroke({ tool: "pen", color: "#000", size: 3, opacity: 1, points: [[20, 20, .5], [200, 200, .5]] });
  const box = [[0, 0], [50, 0], [50, 50], [0, 50]];
  assert(strokeInLasso(inside, box), "missed one entirely inside");
  assert(!strokeInLasso(straddling, box), "took one that hangs out");
});

check("translating a stroke moves its bbox with it", () => {
  const s = makeStroke({ tool: "pen", color: "#000", size: 4, opacity: 1, points: [[0, 0, .5], [10, 10, .5]] });
  const moved = translateStroke(s, 25, -5);
  near(moved.bbox.x, s.bbox.x + 25, 0.001, "bbox x");
  near(moved.bbox.y, s.bbox.y - 5, 0.001, "bbox y");
  near(moved.points[0][0], s.points[0][0] + 25, 0.11, "point x");
});

check("shape snapping recognises a line, a box and a circle", () => {
  const line = Array.from({ length: 30 }, (_, i) => [i * 4, 100 + (i % 2), 0.5]);
  assert(snapToShape(line)?.kind === "line", "line not recognised");

  const circle = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    return [200 + Math.cos(a) * 60 + (i % 3), 200 + Math.sin(a) * 60, 0.5];
  });
  assert(snapToShape(circle)?.kind === "ellipse", "circle not recognised");

  const box = [];
  for (let i = 0; i <= 20; i++) box.push([i * 5, 0, .5]);
  for (let i = 0; i <= 20; i++) box.push([100, i * 5, .5]);
  for (let i = 20; i >= 0; i--) box.push([i * 5, 100, .5]);
  for (let i = 20; i >= 0; i--) box.push([0, i * 5, .5]);
  assert(snapToShape(box)?.kind === "rect", "rectangle not recognised");
});

check("shape snapping leaves a deliberate squiggle alone", () => {
  const squiggle = Array.from({ length: 60 }, (_, i) => [
    100 + i * 3, 100 + Math.sin(i / 2) * 45, 0.5,
  ]);
  assert(snapToShape(squiggle) === null, "a squiggle was turned into a shape");
});

/* ================================================
   pdfout
   ================================================ */

/* Not a real JPEG — the writer never decodes one, it only embeds the
   bytes and states their length. A marker pair is enough to prove the
   stream survives intact. */
const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 0xff, 0xd9]);

check("the PDF has the right shape", () => {
  const bytes = buildPDF([
    { jpeg: FAKE_JPEG, pixelWidth: 100, pixelHeight: 140, width: 595, height: 842 },
    { jpeg: FAKE_JPEG, pixelWidth: 100, pixelHeight: 140, width: 595, height: 842 },
  ], { title: "Two pages" });

  const text = Buffer.from(bytes).toString("latin1");
  assert(text.startsWith("%PDF-1.4"), "no header");
  assert(text.trimEnd().endsWith("%%EOF"), "no trailer marker");
  assert(text.includes("/Count 2"), "page count wrong");
  assert((text.match(/\/Type \/Page[^s]/g) || []).length === 2, "not two page objects");
  assert(text.includes("/Filter /DCTDecode"), "image filter missing");
  assert(text.includes("/MediaBox [0 0 595 842]"), "page box wrong");
});

check("every xref offset lands on its own object", () => {
  const bytes = buildPDF([
    { jpeg: FAKE_JPEG, pixelWidth: 10, pixelHeight: 10, width: 200, height: 300 },
    { jpeg: FAKE_JPEG, pixelWidth: 10, pixelHeight: 10, width: 200, height: 300 },
    { jpeg: FAKE_JPEG, pixelWidth: 10, pixelHeight: 10, width: 200, height: 300 },
  ], { title: "Offsets" });
  const text = Buffer.from(bytes).toString("latin1");

  const startxref = Number(/startxref\s+(\d+)/.exec(text)[1]);
  assert(text.slice(startxref, startxref + 4) === "xref", "startxref doesn't point at the table");

  const table = text.slice(startxref);
  const rows = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  const size = Number(/\/Size (\d+)/.exec(text)[1]);
  assert(rows.length === size - 1, `${rows.length} rows for /Size ${size}`);

  rows.forEach((at, i) => {
    const n = i + 1;
    const head = text.slice(at, at + String(n).length + 6);
    assert(head === `${n} 0 obj`, `object ${n} is at ${at}, found "${head}"`);
  });
});

check("a title with brackets doesn't break the string", () => {
  const bytes = buildPDF(
    [{ jpeg: FAKE_JPEG, pixelWidth: 10, pixelHeight: 10, width: 200, height: 300 }],
    { title: "Notes (2024) \\ draft" },
  );
  const text = Buffer.from(bytes).toString("latin1");
  assert(text.includes("/Title (Notes \\(2024\\) \\\\ draft)"), "brackets not escaped");
});

check("an empty document is refused rather than written badly", () => {
  let threw = false;
  try { buildPDF([]); } catch { threw = true; }
  assert(threw, "buildPDF([]) should throw");
});

check("A4 comes out the right size in points", () => {
  const { width, height } = pageToPoints({ w: PAGE_SIZES.a4.w, h: PAGE_SIZES.a4.h });
  near(width, 595.2, 1, "A4 width in points");
  near(height, 841.9, 1, "A4 height in points");
});

/* ================================================
   office — built here, read back here
   ================================================ */

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ -1) >>> 0;
}

/* A real ZIP, written the way Word writes one: deflated entries, sizes
   in both the local header and the central directory. */
function makeZip(entries) {
  const locals = [];
  const central = [];
  let at = 0;

  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);                 // deflate
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc32(raw), 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(at, 42);
    central.push(dir, nameBuf);

    at += 30 + nameBuf.length + data.length;
  }

  const body = Buffer.concat(locals);
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(body.length, 16);

  const out = Buffer.concat([body, dirBuf, end]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

const DOCX_XML = `<?xml version="1.0"?>
<w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>Meeting notes</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Budget &amp; timing </w:t></w:r><w:r><w:t>agreed</w:t></w:r></w:p>
<w:p><w:r><w:t>Line one</w:t></w:r><w:br/><w:r><w:t>line two</w:t></w:r></w:p>
<w:p/>
</w:body></w:document>`;

const PPTX_XML = (title, body) => `<?xml version="1.0"?>
<p:sld xmlns:a="x"><p:cSld><p:spTree>
<a:p><a:r><a:t>${title}</a:t></a:r></a:p>
<a:p><a:r><a:t>${body}</a:t></a:r></a:p>
<a:p/>
</p:spTree></p:cSld></p:sld>`;

await checkAsync("the ZIP reader finds every entry", async () => {
  const zip = await unzip(makeZip({ "a.txt": "first", "nested/b.txt": "second" }));
  assert(zip.has("a.txt") && zip.has("nested/b.txt"), `names: ${zip.names()}`);
  assert(await zip.text("a.txt") === "first");
  assert(await zip.text("nested/b.txt") === "second");
  assert(await zip.text("missing.txt") === null, "a missing entry should be null, not a throw");
});

await checkAsync("a non-ZIP is rejected with something readable", async () => {
  let message = "";
  // A standalone ArrayBuffer, not Buffer#buffer — small Buffers share
  // a pool, and handing the whole pool over tests nothing.
  try { await unzip(new TextEncoder().encode("this is not a zip file at all").buffer); }
  catch (err) { message = err.message; }
  assert(/ZIP|docx|pptx/i.test(message), `unhelpful message: ${message}`);
});

await checkAsync("a .docx comes back as paragraphs", async () => {
  const zip = makeZip({ "word/document.xml": DOCX_XML });
  const doc = await readDocx(zip);
  const paras = doc.sections[0].paragraphs;
  assert(doc.kind === "docx");
  assert(paras[0] === "Meeting notes", `first: ${JSON.stringify(paras[0])}`);
  assert(paras[1] === "Budget & timing agreed", `runs not joined: ${JSON.stringify(paras[1])}`);
  assert(paras[2] === "Line one\nline two", `soft break lost: ${JSON.stringify(paras[2])}`);
  assert(paras.length === 3, `trailing empty paragraph kept: ${paras.length}`);
});

await checkAsync("a .pptx comes back slide by slide, in order", async () => {
  // Deliberately out of lexical order: slide10 must not sort before slide2.
  const deck = await readPptx(makeZip({
    "ppt/slides/slide10.xml": PPTX_XML("Tenth", "last"),
    "ppt/slides/slide2.xml": PPTX_XML("Second", "middle"),
    "ppt/slides/slide1.xml": PPTX_XML("First", "opening"),
  }));
  assert(deck.sections.length === 3, `${deck.sections.length} slides`);
  assert(deck.sections[0].title === "Slide 1");
  assert(deck.sections[1].title === "Slide 2");
  assert(deck.sections[2].title === "Slide 10", "slide 10 sorted as a string");
  assert(deck.sections[0].paragraphs[0] === "First");
});

check("XML entities are decoded once, not twice", () => {
  const paras = paragraphsFrom("<w:p><w:t>&amp;lt;tag&amp;gt; &lt;b&gt; &#65;</w:t></w:p>", { para: "w:p", text: "w:t" });
  assert(paras[0] === "&lt;tag&gt; <b> A", JSON.stringify(paras[0]));
});

/* ================================================
   paper and objects
   ================================================ */

check("every paper template draws without reaching for anything it hasn't got", () => {
  // A context that records instead of drawing. If drawPaper starts using
  // a call this doesn't have, that is worth knowing here rather than as
  // a blank page on someone's phone.
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, prop) => {
      if (["fillStyle", "strokeStyle", "lineWidth"].includes(prop)) return "";
      return (...args) => { calls.push(prop); void args; };
    },
    set: () => true,
  });

  for (const p of Object.keys(PAPERS)) {
    calls.length = 0;
    drawPaper(ctx, { paper: p, w: 1240, h: 1754 });
    assert(calls.includes("save") && calls.includes("restore"), `${p}: unbalanced save/restore`);
    if (p !== "plain") {
      assert(calls.includes("stroke") || calls.includes("fill"), `${p}: drew nothing`);
    }
  }
});

check("a new page is empty and the right size", () => {
  const p = newPage("nb1", 3, { paper: "grid", size: "a4land" });
  assert(p.notebookId === "nb1" && p.index === 3);
  assert(p.w === PAGE_SIZES.a4land.w && p.h === PAGE_SIZES.a4land.h, "wrong dimensions");
  assert(p.strokes.length === 0 && p.objects.length === 0);
  assert(p.background === null);
});

check("resize from the north-west handle moves the origin", () => {
  const o = { x: 100, y: 100, w: 200, h: 100, type: "text" };
  const out = resizeObject(o, "nw", 20, 10, false);
  assert(out.x === 120 && out.y === 110, `origin ${out.x},${out.y}`);
  assert(out.w === 180 && out.h === 90, `size ${out.w}x${out.h}`);
});

check("a corner resize with ratio locked keeps the shape", () => {
  const o = { x: 0, y: 0, w: 200, h: 100, type: "image" };
  const out = resizeObject(o, "se", 100, 5, true);
  near(out.w / out.h, 2, 0.001, "aspect drifted");
});

check("resize refuses to go below the minimum", () => {
  const o = { x: 50, y: 50, w: 100, h: 100, type: "text" };
  const out = resizeObject(o, "nw", 500, 500, false);
  assert(out.w === MIN_SIZE && out.h === MIN_SIZE, `${out.w}x${out.h}`);
  // And the box must not run away past where the pointer dragged it.
  assert(out.x === 50 + 100 - MIN_SIZE, `x ran to ${out.x}`);
});

check("rotation snaps near the square angles and not elsewhere", () => {
  const o = { x: 0, y: 0, w: 100, h: 100 };
  assert(rotateObject(o, 50, -50).rot === 0, "not snapped to 0");
  assert(rotateObject(o, 150, 50).rot === 90, "not snapped to 90");
  const free = rotateObject(o, 100, -20).rot;
  assert(free > 5 && free < 85, `snapped when it shouldn't have: ${free}`);
});

check("hit testing follows a rotated object", () => {
  const o = { x: 0, y: 0, w: 200, h: 40, rot: 90 };
  // Rotated a quarter turn about its centre (100, 20), the long axis
  // is now vertical and runs from y = -80 to y = 120.
  assert(objectHit(o, 100, 100), "missed the rotated body");
  assert(!objectHit(o, 100, 180), "hit past the end of the rotated body");
  assert(!objectHit(o, 190, 20), "hit where the box no longer is");
});

check("a big photo is scaled to sit on the page", () => {
  const page = { w: 1240, h: 1754 };
  const box = fitOnPage(4032, 3024, page);
  assert(box.w <= page.w * 0.62 + 1, `too wide: ${box.w}`);
  near(box.w / box.h, 4032 / 3024, 0.01, "aspect changed");
  assert(box.x >= 20 && box.x + box.w <= page.w - 20, "off the side of the page");
});

check("a small photo is not blown up", () => {
  const box = fitOnPage(120, 90, { w: 1240, h: 1754 });
  assert(box.w === 120 && box.h === 90, `${box.w}x${box.h}`);
});

check("file kinds are named from the extension when the mime is empty", () => {
  assert(fileKind("", "notes.docx") === "Word document");
  assert(fileKind("", "deck.pptx") === "Presentation");
  assert(fileKind("application/pdf", "x") === "PDF");
  assert(fileKind("", "archive.zip") === "ZIP");
});

/* ================================================ */

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ Inkwell: ${passed} checks passed`);
