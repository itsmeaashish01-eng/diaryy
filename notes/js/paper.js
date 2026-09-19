/* ================================================
   INKWELL — paper.js
   Page sizes and the paper you write on.

   Page coordinates are fixed and device-independent: a page is 1240 ×
   1754 units whether it is drawn on a phone at 390 points wide or
   exported at 300 dpi. Everything stored — every stroke point, every
   image box — is in these units, so a notebook written on an iPhone
   opens on a laptop at the same size relative to the page.

   1240 × 1754 is A4 at 150 dpi. It is a convenient number to export
   from: ×2 gives a 300 dpi print, ÷2 a screen-sized PNG.
   ================================================ */

export const PAGE_SIZES = {
  a4:       { id: "a4",       label: "A4",            w: 1240, h: 1754 },
  a4land:   { id: "a4land",   label: "A4 landscape",  w: 1754, h: 1240 },
  letter:   { id: "letter",   label: "US Letter",     w: 1275, h: 1650 },
  square:   { id: "square",   label: "Square",        w: 1400, h: 1400 },
  // Endless down the page: the height grows as you fill it. Handy for
  // lecture notes, where a page break in the middle of a derivation is
  // just an obstacle.
  scroll:   { id: "scroll",   label: "Tall (scrolling)", w: 1240, h: 3508 },
};

export const PAPERS = {
  plain:   { id: "plain",   label: "Plain" },
  ruled:   { id: "ruled",   label: "Ruled" },
  grid:    { id: "grid",    label: "Grid" },
  dotted:  { id: "dotted",  label: "Dotted" },
  cornell: { id: "cornell", label: "Cornell" },
  music:   { id: "music",   label: "Manuscript" },
};

export const COVERS = [
  { id: "linen",   label: "Linen",   css: "linear-gradient(145deg,#e8ddcd,#cdbca4)" },
  { id: "ink",     label: "Ink",     css: "linear-gradient(145deg,#2f3b47,#1b232c)" },
  { id: "clay",    label: "Clay",    css: "linear-gradient(145deg,#d08a63,#a6552f)" },
  { id: "moss",    label: "Moss",    css: "linear-gradient(145deg,#7f9274,#4e6047)" },
  { id: "plum",    label: "Plum",    css: "linear-gradient(145deg,#8d6a8f,#5b3d60)" },
  { id: "slate",   label: "Slate",   css: "linear-gradient(145deg,#9aa5ad,#5f6b74)" },
];

const LINE = 44;      // ruled line spacing, page units
const GRID = 40;
const DOT = 40;

/* Draws the paper into a context already scaled so that one unit of the
   context is one page unit. Colours come in from the caller because the
   page looks different in dark mode and the exporter always wants the
   light one — a printed page with a dark background is nobody's idea of
   a note. */
export function drawPaper(ctx, { paper = "plain", w, h, ink = "#c8d0d8", accent = "#e0a9a0" }) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  const margin = 70;

  if (paper === "ruled" || paper === "cornell") {
    const top = paper === "cornell" ? margin * 2 : margin;
    ctx.beginPath();
    for (let y = top; y < h - margin / 2; y += LINE) {
      ctx.moveTo(margin, y + 0.5);
      ctx.lineTo(w - margin / 2, y + 0.5);
    }
    ctx.stroke();
  }

  if (paper === "grid") {
    ctx.beginPath();
    for (let x = 0; x <= w; x += GRID) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = 0; y <= h; y += GRID) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
  }

  if (paper === "dotted") {
    for (let x = DOT; x < w; x += DOT) {
      for (let y = DOT; y < h; y += DOT) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (paper === "cornell") {
    // The cue column and the summary box — the whole point of Cornell
    // paper, and the reason it can't just be ruled paper with a margin.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(margin + 250, margin * 2 - LINE);
    ctx.lineTo(margin + 250, h - 300);
    ctx.moveTo(margin, h - 300);
    ctx.lineTo(w - margin / 2, h - 300);
    ctx.moveTo(margin, margin * 2 - LINE);
    ctx.lineTo(w - margin / 2, margin * 2 - LINE);
    ctx.stroke();
  }

  if (paper === "music") {
    ctx.lineWidth = 1.2;
    const staffGap = 12, systemGap = 110;
    for (let top = margin; top < h - systemGap; top += systemGap) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = top + i * staffGap + 0.5;
        ctx.moveTo(margin, y);
        ctx.lineTo(w - margin / 2, y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function newPage(notebookId, index, { paper = "ruled", size = "a4" } = {}) {
  const dims = PAGE_SIZES[size] || PAGE_SIZES.a4;
  return {
    id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    notebookId,
    index,
    size,
    paper,
    w: dims.w,
    h: dims.h,
    strokes: [],
    objects: [],
    background: null,     // { blobId, fit } — a page rendered out of a PDF
    updatedAt: Date.now(),
  };
}
