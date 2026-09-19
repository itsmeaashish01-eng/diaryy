/* ================================================
   INKWELL — strokes.js
   What a pen stroke is, and what it looks like.

   Pure functions over plain arrays: no canvas, no DOM, no imports from
   anything that touches either. That is deliberate — it is the part most
   likely to be subtly wrong, and this way `selftest.mjs` can run all of
   it in node with no browser.

   A point is [x, y, pressure]. Pressure is 0..1; a mouse or a finger
   reports 0.5 flat and Apple Pencil reports the real thing.
   ================================================ */

import { clamp, dist, distToSegment, bboxOf, pointInPolygon } from "./util.js";

/* Raw pointer input is noisy — a tremor in the hand, and on some
   digitisers a wobble of a pixel or two that isn't in the hand at all.
   One pass of exponential smoothing takes both out without the lag you
   get from averaging over a window. */
export function smooth(points, factor = 0.42) {
  if (points.length < 3) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const p = points[i];
    out.push([
      prev[0] + (p[0] - prev[0]) * (1 - factor),
      prev[1] + (p[1] - prev[1]) * (1 - factor),
      prev[2] + (p[2] - prev[2]) * (1 - factor),
    ]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/* Ramer–Douglas–Peucker. A fast scribble arrives as several hundred
   points for a line the eye reads as straight; storing all of them makes
   pages that take a visible moment to redraw and a backup file several
   times the size it needs to be. Tolerance is in page units. */
export function simplify(points, tolerance = 0.6) {
  if (points.length < 3) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = -1, index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distToSegment(
        points[i][0], points[i][1],
        points[first][0], points[first][1],
        points[last][0], points[last][1],
      );
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/* Points arriving faster than they move add nothing but noise, and on a
   120 Hz Pencil there are a lot of them. Dropping anything under a
   third of a page unit keeps the stroke identical and the array short. */
export function thin(points, minDist = 0.34) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    if (dist(last[0], last[1], points[i][0], points[i][1]) >= minDist) out.push(points[i]);
  }
  // The last point is where the pen actually lifted; losing it visibly
  // shortens quick strokes.
  const tail = points[points.length - 1];
  const kept = out[out.length - 1];
  if (kept !== tail) out.push(tail);
  return out;
}

/* How hard you press turns into how wide the line is. A straight
   multiply gives a stroke that vanishes at light pressure, so this keeps
   a floor and applies a gentle curve: the middle of the range is where
   most writing happens and it should be where most of the variation is. */
export function radiusAt(size, pressure, tool) {
  const half = size / 2;
  if (tool === "highlighter") return half;          // a marker has one width
  const p = clamp(pressure ?? 0.5, 0, 1);
  const eased = 0.35 + 0.65 * Math.pow(p, 1.35);
  return half * eased;
}

function perpendicular(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

/* The outline of a stroke as a closed polygon: down one side, round the
   end, back up the other. Filling that is what gives ink a nib rather
   than the dead uniform width of a stroked path.

   A dot — pen down and straight back up — has no direction to offset
   along, so it becomes a circle of the right radius instead. */
export function outline(points, size, tool = "pen") {
  if (!points.length) return [];

  const isDot = points.length === 1 ||
    (points.length === 2 && dist(points[0][0], points[0][1], points[1][0], points[1][1]) < 0.01);
  if (isDot) {
    const [x, y, p] = points[0];
    const r = radiusAt(size, p, tool);
    const circle = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      circle.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    return circle;
  }

  const left = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    // At the ends there is no point on one side, so the direction is
    // taken from `cur` to its one neighbour. Falling back to the
    // neighbour on *both* sides instead would ask for the direction
    // from a point to itself, which has none — the offsets collapse
    // onto the spine and the stroke is drawn with no width at all. On a
    // two-point stroke that is the whole stroke: two caps and nothing
    // between them.
    const prev = points[i - 1] || cur;
    const next = points[i + 1] || cur;
    const [nx, ny] = perpendicular(prev[0], prev[1], next[0], next[1]);
    const r = radiusAt(size, cur[2], tool);
    left.push([cur[0] + nx * r, cur[1] + ny * r]);
    right.push([cur[0] - nx * r, cur[1] - ny * r]);
  }

  // Round caps, drawn as half-circles so the join with the offsets is
  // smooth instead of showing a flat chord at every full stop. `base` is
  // the outward direction at that end; the arc sweeps the half turn from
  // the left offset, round the outside, to the right one — which is the
  // same sweep at both ends once `base` points outward at each.
  const capAt = (pt, inward) => {
    const r = radiusAt(size, pt[2], tool);
    const base = Math.atan2(pt[1] - inward[1], pt[0] - inward[0]);
    const arc = [];
    for (let i = 0; i <= 8; i++) {
      const a = base + Math.PI / 2 - (i / 8) * Math.PI;
      arc.push([pt[0] + Math.cos(a) * r, pt[1] + Math.sin(a) * r]);
    }
    return arc;
  };

  const endCap = capAt(points[points.length - 1], points[points.length - 2]);
  const startCap = capAt(points[0], points[1]);

  return [...left, ...endCap, ...right.reverse(), ...startCap];
}

/* Everything a stroke needs to be drawn or hit-tested later. Points are
   thinned and simplified on commit, never while drawing — simplifying a
   live stroke makes it visibly snap as you write. */
export function makeStroke({ tool, color, size, opacity, points }) {
  const cleaned = simplify(thin(smooth(points)), tool === "highlighter" ? 1.1 : 0.55);
  return {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    tool, color, size,
    opacity: opacity ?? (tool === "highlighter" ? 0.38 : 1),
    points: cleaned.map((p) => [round(p[0]), round(p[1]), Math.round(p[2] * 100) / 100]),
    bbox: bboxOf(cleaned, size / 2 + 1),
  };
}

const round = (n) => Math.round(n * 10) / 10;

/* ---------- hit tests ---------- */

/* Does the eraser at (x, y) with this radius touch the stroke? Distance
   to the spine, widened by the stroke's own half-width — so a fat stroke
   is caught from further away than a hairline, which is what the eye
   expects. */
export function strokeHit(stroke, x, y, radius) {
  const reach = radius + stroke.size / 2;
  const b = stroke.bbox;
  if (x < b.x - reach || x > b.x + b.w + reach || y < b.y - reach || y > b.y + b.h + reach) return false;

  const pts = stroke.points;
  if (pts.length === 1) return dist(x, y, pts[0][0], pts[0][1]) <= reach;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= reach) return true;
  }
  return false;
}

/* The lasso takes a stroke if the polygon contains it. "Contains" means
   every point: half-selecting a word and dragging it in two pieces is
   worse than not selecting it. */
export function strokeInLasso(stroke, poly) {
  return stroke.points.every((p) => pointInPolygon(p[0], p[1], poly));
}

export function translateStroke(stroke, dx, dy) {
  return {
    ...stroke,
    points: stroke.points.map((p) => [round(p[0] + dx), round(p[1] + dy), p[2]]),
    bbox: { ...stroke.bbox, x: stroke.bbox.x + dx, y: stroke.bbox.y + dy },
  };
}

/* ---------- shape snapping ---------- */

/* Held still at the end of a stroke, a rough shape becomes a clean one —
   the one GoodNotes trick that is genuinely hard to live without once
   you've had it. Returns replacement points, or null if the stroke does
   not look like any shape we can offer.

   The test is deliberately conservative. Turning a deliberate squiggle
   into a rectangle is far more annoying than failing to straighten a
   line, so anything ambiguous is left as drawn. */
export function snapToShape(points) {
  if (points.length < 4) return null;
  const first = points[0], last = points[points.length - 1];
  const b = bboxOf(points);
  const diag = Math.hypot(b.w, b.h);
  if (diag < 24) return null;

  const closed = dist(first[0], first[1], last[0], last[1]) < diag * 0.22;
  const p = points[0][2];

  if (!closed) {
    // A line, if every point sits close to the chord between the ends.
    const off = points.reduce((m, q) =>
      Math.max(m, distToSegment(q[0], q[1], first[0], first[1], last[0], last[1])), 0);
    if (off < diag * 0.07) return { kind: "line", points: [[first[0], first[1], p], [last[0], last[1], p]] };
    return null;
  }

  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const rx = b.w / 2, ry = b.h / 2;

  // An ellipse, if every point sits near the ellipse inscribed in the
  // bounding box. Scored in normalised radius so a wide oval is judged
  // as fairly as a circle.
  const ellipseErr = points.reduce((m, q) => {
    const nx = (q[0] - cx) / (rx || 1), ny = (q[1] - cy) / (ry || 1);
    return Math.max(m, Math.abs(Math.hypot(nx, ny) - 1));
  }, 0);
  if (ellipseErr < 0.18) {
    const out = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, p]);
    }
    return { kind: "ellipse", points: out };
  }

  // A rectangle, if every point hugs the bounding box's edge.
  const edgeErr = points.reduce((m, q) => {
    const d = Math.min(
      Math.abs(q[0] - b.x), Math.abs(q[0] - (b.x + b.w)),
      Math.abs(q[1] - b.y), Math.abs(q[1] - (b.y + b.h)),
    );
    return Math.max(m, d);
  }, 0);
  if (edgeErr < diag * 0.06 && b.w > 12 && b.h > 12) {
    const c = [[b.x, b.y, p], [b.x + b.w, b.y, p], [b.x + b.w, b.y + b.h, p], [b.x, b.y + b.h, p], [b.x, b.y, p]];
    return { kind: "rect", points: c };
  }

  return null;
}
