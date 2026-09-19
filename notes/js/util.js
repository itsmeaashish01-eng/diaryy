/* ================================================
   INKWELL — util.js
   The small things everything else needs. No state, no DOM ownership.
   ================================================ */

/* IDs are local-only, so there is no need for anything cryptographic —
   but collisions inside one notebook would corrupt a page, so this uses
   the clock plus randomness rather than a counter that resets on reload. */
export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

export const lerp = (a, b, t) => a + (b - a) * t;

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/* Debounce for autosave. Trailing edge only: we want the write after the
   user stops, not a write on the first keystroke of every sentence. */
export function debounce(fn, ms = 400) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

/* Anything user-typed that reaches innerHTML goes through here first.
   Note titles are user text and they end up in the shelf markup. */
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* Axis-aligned bounds of a point list, padded by half the stroke width so
   the redraw region covers the ink's outer edge rather than its centre. */
export function bboxOf(points, pad = 0) {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function boxesOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function pointInBox(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/* Shortest distance from a point to a segment — the eraser's hit test and
   the lasso's "did this stroke get caught" test both lean on it. */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* Even-odd ray cast. The lasso is an arbitrary closed polygon, so nothing
   simpler will do. */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function formatBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" });
}

/* A hex colour and an alpha, as the canvas wants it. Highlighter ink and
   selection fills both need transparency without touching globalAlpha,
   which would also fade the stroke's own overlap. */
export function withAlpha(hex, alpha) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const isApple = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
