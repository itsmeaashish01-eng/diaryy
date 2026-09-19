/* ================================================
   INKWELL — canvas.js
   The ink renderer.

   Three canvases stacked, and each exists for a reason:

     paper   the sheet — rules, grid, and any PDF page behind the note.
             Redrawn only when the page or the zoom changes.
     ink     every committed stroke. Redrawn on undo, erase, page turn.
     live    the stroke currently under the pen, and nothing else.

   The split is what keeps writing fast. Without it, every pointer move
   would redraw a page that might hold four thousand strokes; with it,
   the pen only ever repaints its own last few millimetres.

   Drawing happens in page units (see paper.js). The transform on each
   context maps those to device pixels, so nothing above this file has
   to think about devicePixelRatio or zoom.
   ================================================ */

import { outline } from "./strokes.js";
import { drawPaper } from "./paper.js";
import { withAlpha } from "./util.js";

/* Rendering the canvas backing store at the full zoom level keeps ink
   crisp when you zoom in to write small — but at 6× on a 3× screen that
   is an 18× canvas, which is tens of millions of pixels and enough to
   have the tab killed on a phone. 3× is the point past which more
   resolution stops being visible on any screen this runs on. */
const MAX_RENDER_SCALE = 3;

export class PageView {
  constructor(root) {
    this.root = root;                 // the .page element
    this.paper = root.querySelector(".layer-paper");
    this.ink = root.querySelector(".layer-ink");
    this.live = root.querySelector(".layer-live");
    this.page = null;
    this.zoom = 1;
    this.renderScale = 0;             // 0 = nothing sized yet
    this.dark = false;
    this.bgImage = null;              // decoded background, cached per page
  }

  get dpr() { return Math.min(window.devicePixelRatio || 1, 3); }

  setPage(page) {
    this.page = page;
    this.bgImage = null;
    this.resize(true);
  }

  setZoom(zoom) {
    this.zoom = zoom;
    if (!this.page) return;
    this.root.style.width = `${this.page.w * zoom}px`;
    this.root.style.height = `${this.page.h * zoom}px`;
    const wanted = Math.min(zoom, MAX_RENDER_SCALE);
    // Re-sizing three canvases and redrawing everything is not free, so
    // it only happens when the zoom has moved enough to be visible.
    if (Math.abs(wanted - this.renderScale) > 0.15) this.resize();
  }

  setDark(dark) {
    this.dark = dark;
    this.drawPaper();
  }

  /* Size the backing stores and set each context's transform so that one
     unit drawn is one page unit. */
  resize(force = false) {
    if (!this.page) return;
    const s = Math.min(this.zoom, MAX_RENDER_SCALE);
    if (!force && Math.abs(s - this.renderScale) < 0.001) return;
    this.renderScale = s;

    const px = s * this.dpr;
    for (const c of [this.paper, this.ink, this.live]) {
      c.width = Math.round(this.page.w * px);
      c.height = Math.round(this.page.h * px);
      const ctx = c.getContext("2d");
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    this.root.style.width = `${this.page.w * this.zoom}px`;
    this.root.style.height = `${this.page.h * this.zoom}px`;

    this.drawPaper();
    this.drawInk();
  }

  clear(ctx, canvas) {
    const t = ctx.getTransform();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    void t;
  }

  /* ---------- paper ---------- */

  drawPaper() {
    if (!this.page) return;
    const ctx = this.paper.getContext("2d");
    this.clear(ctx, this.paper);

    ctx.fillStyle = this.dark ? "#1d2126" : "#fffdf8";
    ctx.fillRect(0, 0, this.page.w, this.page.h);

    if (this.bgImage) {
      // A page imported from a PDF. It sits under the rules so that an
      // annotated form still shows its own lines, not ours on top.
      ctx.drawImage(this.bgImage, 0, 0, this.page.w, this.page.h);
    }

    drawPaper(ctx, {
      paper: this.page.paper,
      w: this.page.w,
      h: this.page.h,
      ink: this.dark ? "#333a42" : "#d8e0e6",
      accent: this.dark ? "#5e4a48" : "#eec7bf",
    });
  }

  /* The background arrives as a decoded bitmap from app.js, which owns
     the blob store. Setting it redraws the paper; clearing it likewise. */
  setBackground(image) {
    this.bgImage = image || null;
    this.drawPaper();
  }

  /* ---------- ink ---------- */

  drawInk() {
    if (!this.page) return;
    const ctx = this.ink.getContext("2d");
    this.clear(ctx, this.ink);
    for (const s of this.page.strokes) drawStroke(ctx, s);
  }

  /* One stroke onto the committed layer, without redrawing the rest.
     This is what makes a long page stay responsive: the cost of the
     hundredth stroke is the same as the cost of the first. */
  commitStroke(stroke) {
    drawStroke(this.ink.getContext("2d"), stroke);
    this.clearLive();
  }

  drawLive(stroke) {
    const ctx = this.live.getContext("2d");
    this.clear(ctx, this.live);
    if (stroke) drawStroke(ctx, stroke);
  }

  clearLive() {
    const ctx = this.live.getContext("2d");
    this.clear(ctx, this.live);
  }

  /* The eraser's own cursor, and the lasso's dotted path. Both belong on
     the live layer: they are transient, and putting them there means
     they cost nothing to remove. */
  drawCursor(x, y, radius) {
    const ctx = this.live.getContext("2d");
    this.clear(ctx, this.live);
    ctx.save();
    ctx.lineWidth = 1.5 / this.renderScale;
    ctx.strokeStyle = this.dark ? "rgba(255,255,255,.75)" : "rgba(40,45,50,.65)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawLasso(points) {
    const ctx = this.live.getContext("2d");
    this.clear(ctx, this.live);
    if (points.length < 2) return;
    ctx.save();
    ctx.lineWidth = 2 / this.renderScale;
    ctx.setLineDash([8 / this.renderScale, 6 / this.renderScale]);
    ctx.strokeStyle = "#3b82f6";
    ctx.fillStyle = "rgba(59,130,246,.08)";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/* One stroke. Highlighter uses `multiply` so that crossing two marks
   darkens rather than paints over, which is what a real highlighter
   does and what makes overlapping highlights readable. */
export function drawStroke(ctx, stroke) {
  const poly = outline(stroke.points, stroke.size, stroke.tool);
  if (poly.length < 3) return;

  ctx.save();
  if (stroke.tool === "highlighter") {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = withAlpha(stroke.color, stroke.opacity ?? 0.38);
  } else {
    ctx.fillStyle = stroke.opacity != null && stroke.opacity < 1
      ? withAlpha(stroke.color, stroke.opacity)
      : stroke.color;
  }

  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
