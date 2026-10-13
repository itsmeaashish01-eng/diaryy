/* ================================================
   ANGIO ATLAS — labels.js
   Where each label goes. Labels are anchored to a 3D point on their
   vessel and laid out again every frame from that point's projection, so
   they follow the anatomy through rotation and zoom instead of sitting at
   a fixed screen position.

   The layout is greedy: most important first, each tries a ring of spots
   around its anchor, preferring the side away from the middle of the
   head (so leader lines fan outward), and takes the first spot that
   overlaps no label already placed. A label with nowhere to go is dropped
   rather than drawn on top of another — except the one the user picked,
   which always shows.
   ================================================ */
(function (AG) {
  "use strict";

  const RINGS = [30, 54, 80];
  const ANGLES = 12;

  /* items: { id, x, y, w, h, pri, force }   (x, y = anchor on screen)
     opts:  { cx, cy (head centre on screen), width, height }
     -> [{ id, x, y (anchor), bx, by, w, h (box) }] */
  function layout(items, opts) {
    const placed = [];
    const boxes = [];
    const sorted = items.slice().sort((a, b) => (b.force - a.force) || (a.pri - b.pri));
    const hits = (b) => boxes.some((o) => b.x < o.x + o.w + 3 && b.x + b.w + 3 > o.x && b.y < o.y + o.h + 2 && b.y + b.h + 2 > o.y);
    const inside = (b) => b.x >= 2 && b.y >= 2 && b.x + b.w <= opts.width - 2 && b.y + b.h <= opts.height - 2;

    for (const it of sorted) {
      const out = Math.atan2(it.y - opts.cy, it.x - opts.cx);
      let chosen = null;
      for (const r of RINGS) {
        // Angles ordered by closeness to "outward".
        const cands = [];
        for (let k = 0; k < ANGLES; k++) {
          const a = out + (k * 2 * Math.PI) / ANGLES;
          const off = Math.abs(((k * 2 * Math.PI) / ANGLES + Math.PI) % (2 * Math.PI) - Math.PI);
          cands.push([off, a]);
        }
        cands.sort((p, q) => p[0] - q[0]);
        for (const [, a] of cands) {
          const px = it.x + Math.cos(a) * r, py = it.y + Math.sin(a) * r;
          // Box sits beside the leader's end, on the side it points to.
          const b = { x: Math.cos(a) >= 0 ? px : px - it.w, y: py - it.h / 2, w: it.w, h: it.h };
          if (inside(b) && !hits(b)) { chosen = b; break; }
        }
        if (chosen) break;
      }
      if (!chosen && it.force) {
        chosen = { x: it.x + 12, y: it.y - it.h - 8, w: it.w, h: it.h };
      }
      if (!chosen) continue;
      boxes.push(chosen);
      placed.push({ id: it.id, x: it.x, y: it.y, bx: chosen.x, by: chosen.y, w: it.w, h: it.h });
    }
    return placed;
  }

  AG.labels = { layout };
})(window.AG);
