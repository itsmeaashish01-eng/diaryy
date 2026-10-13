/* ================================================
   ANGIO ATLAS — render.js
   Draws one frame of the simulated injection onto a canvas: vessels,
   contrast, capillary blush, catheter, labels and the orientation frame.

   Two looks, the same data:
     "dsa"  — a subtracted-angiogram style: contrast is dark on grey, and
              overlapping vessels darken each other as they would on a
              projection. It is a rendering of the teaching model, and the
              canvas says so on every frame.
     "anat" — vessels drawn in their territory colours, contrast in bright
              cream, for learning which branch is which.
   ================================================ */
(function (AG) {
  "use strict";

  const GROUP_COLOR = {
    CCA: "#8a8f98", ICA: "#e2574c", COW: "#f2c14e", ACA: "#f08a3c", MCA: "#d04f8f",
    PCA: "#9a6bdc", VB: "#4f8fe0", ECA: "#3fae6e", VEN: "#6f8fb0",
  };
  const HEAD = { c: [0, -10, 22], r: [72, 98, 76] };
  const CENTER = [0, -8, -18];

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const RGB = Object.fromEntries(Object.entries(GROUP_COLOR).map(([k, v]) => [k, hexToRgb(v)]));

  /* state: { g, sim, t, view, zoom, panX, panY, look, ghost, blush,
              labelMode, hoverId, selectedId, catheter }
     -> hit-test data for the app. */
  function draw(canvas, state) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { g, sim, view } = state;
    const dsa = state.look === "dsa";
    const scale = (Math.min(W, H) / 250) * state.zoom;
    const ox = W / 2 + state.panX, oy = H / 2 + state.panY;

    // Project every node once.
    const N = g.nodes.length;
    const sx = new Float32Array(N), sy = new Float32Array(N), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const c = AG.view.toCamera(view, g.nodes[i].p, CENTER);
      sx[i] = ox + c[0] * scale; sy[i] = oy - c[1] * scale; sz[i] = c[2];
    }
    const proj = (p) => {
      const c = AG.view.toCamera(view, p, CENTER);
      return [ox + c[0] * scale, oy - c[1] * scale, c[2]];
    };

    /* background */
    ctx.fillStyle = dsa ? "#d6d6d1" : "#10151c";
    ctx.fillRect(0, 0, W, H);

    // Faint skull outline, so a rotated view still reads as a head.
    const outline = AG.view.ellipsoidOutline(view, HEAD.c, HEAD.r).map(proj);
    ctx.beginPath();
    outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = dsa ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const frame = sim ? sim.at(state.t) : null;
    const c = frame ? frame.c : null;

    /* capillary blush, under the vessels */
    if (frame && state.blush) {
      sim.beds.forEach((b, i) => {
        const k = frame.blush[i];
        if (k < 0.01) return;
        // Spread along the distal branch, so neighbouring beds merge into
        // a parenchymal haze rather than separate blobs.
        const rad = (8 + 18 * Math.sqrt(b.weight)) * scale;
        const a = Math.min(0.4, 0.11 * k);
        for (const p of b.spread) {
          const [x, y] = proj(p);
          const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
          grd.addColorStop(0, dsa ? `rgba(20,20,20,${a})` : `rgba(255,190,120,${a})`);
          grd.addColorStop(1, dsa ? "rgba(20,20,20,0)" : "rgba(255,190,120,0)");
          ctx.fillStyle = grd;
          ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      });
    }

    /* vessels, far to near */
    const order = g.vessels.map((v) => {
      const mid = v.nodes[v.nodes.length >> 1];
      return [sz[mid], v];
    }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const visible = new Set();
    const sel = state.selectedId, hov = state.hoverId;

    for (const v of order) {
      const sum = sim ? sim.perVessel[v.id] : null;
      const fills = sum && sum.reached > 0;
      const showGhost = state.ghost && (!dsa || !fills);
      const isSel = v.id === sel || (sel && v.key === g.byId[sel].key && v.side === g.byId[sel].side && v.name === g.byId[sel].name);
      const isHov = v.id === hov;

      if (isSel || isHov) {
        polyline(ctx, v, sx, sy);
        ctx.strokeStyle = isSel ? "rgba(0,200,255,0.55)" : "rgba(0,200,255,0.3)";
        ctx.lineWidth = Math.max(5, 2 * v.r * scale + 6);
        ctx.stroke();
      }

      if (showGhost) {
        polyline(ctx, v, sx, sy);
        const rgb = RGB[v.group] || [128, 128, 128];
        const faint = v.kind === "context" || v.kind === "vein";
        ctx.strokeStyle = dsa ? "rgba(90,90,90,0.22)" : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${faint ? 0.3 : 0.55})`;
        ctx.lineWidth = Math.max(0.8, (dsa ? 0.5 : faint ? 0.8 : 1.3) * v.r * scale);
        ctx.stroke();
        visible.add(v.id);
      }

      if (!c || !fills) continue;
      // Runs of edges with the same look become one path.
      let runKey = null, started = false;
      const flush = () => { if (started) { ctx.stroke(); started = false; } };
      for (const ei of v.edges) {
        const k = c[ei];
        const e = g.edges[ei];
        if (k < 0.015) { flush(); runKey = null; continue; }
        const w = Math.max(0.9, Math.round(1.6 * e.r * scale * 2) / 2);
        const a = dsa ? Math.min(0.94, 1 - Math.exp(-k * (1.2 + 0.9 * e.r))) : Math.min(1, k * 1.1);
        const aq = Math.round(a * 20) / 20;
        const key = `${w}|${aq}`;
        if (key !== runKey) {
          flush();
          ctx.beginPath();
          ctx.moveTo(sx[e.a], sy[e.a]);
          ctx.lineWidth = w;
          // Solid tones, not alpha: overlapping round caps between runs
          // would otherwise bead along the vessel.
          ctx.strokeStyle = dsa ? grey(214 - 202 * aq) : mixCream(v.group, aq);
          runKey = key;
          started = true;
        }
        ctx.lineTo(sx[e.b], sy[e.b]);
      }
      flush();
      visible.add(v.id);
    }

    /* catheter and tip */
    if (state.catheter) {
      const pts = state.catheter.map((n) => [sx[n], sy[n]]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = dsa ? "rgba(40,40,40,0.75)" : "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
      const [tx, ty] = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(tx, ty, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#00b8f0";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = dsa ? "#fff" : "#10151c";
      ctx.stroke();
    }

    /* labels */
    const placed = drawLabels(ctx, state, { sx, sy, proj, W, H, visible, frame });

    /* frame furniture: orientation letters, scale bar, mode banner */
    const o = AG.view.orientation(view);
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.fillStyle = dsa ? "#333" : "#c9d3de";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(o.top, W / 2, 46);
    ctx.fillText(o.bottom, W / 2, H - 16);
    ctx.fillText(o.left, 16, H / 2);
    ctx.fillText(o.right, W - 16, H / 2);

    const bar = 20 * scale;   // 20 mm
    ctx.strokeStyle = dsa ? "#333" : "#c9d3de";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W - 24 - bar, H - 22); ctx.lineTo(W - 24, H - 22);
    ctx.stroke();
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("20 mm (schematic)", W - 24 - bar / 2, H - 34);

    return { sx, sy, visible, placed, scale };
  }

  const grey = (l) => { const n = Math.round(l); return `rgb(${n},${n},${n})`; };
  // Contrast in the anatomical look: territory colour washed toward cream.
  function mixCream(group, a) {
    const g = RGB[group] || [128, 128, 128], c = [255, 246, 214];
    const k = 0.35 + 0.65 * a;
    return `rgb(${[0, 1, 2].map((i) => Math.round(g[i] + (c[i] - g[i]) * k)).join(",")})`;
  }

  function polyline(ctx, v, sx, sy) {
    ctx.beginPath();
    v.nodes.forEach((n, i) => (i ? ctx.lineTo(sx[n], sy[n]) : ctx.moveTo(sx[n], sy[n])));
  }

  /* Which vessels get a label now, and where. */
  function drawLabels(ctx, state, { proj, W, H, visible, frame }) {
    const { g, sim } = state;
    const dsa = state.look === "dsa";
    const sel = state.selectedId ? g.byId[state.selectedId] : null;
    const hov = state.hoverId ? g.byId[state.hoverId] : null;
    const maxPri = state.zoom < 1.25 ? 1 : state.zoom < 2.1 ? 2 : 3;
    const seen = new Set();
    const items = [];
    ctx.font = "12px system-ui, sans-serif";

    for (const v of g.vessels) {
      if (!v.label) continue;
      const forced = (sel && sel.name === v.name && sel.side === v.side) || (hov && hov.name === v.name && hov.side === v.side);
      if (!forced) {
        if (state.labelMode === "off") continue;
        if (v.label.pri > maxPri) continue;
        if (!visible.has(v.id)) continue;
        if (state.labelMode === "filled") {
          const s = sim && sim.perVessel[v.id];
          if (!s || !(s.reached > 0) || s.tFirst > state.t) continue;
        }
      }
      const key = `${v.side}|${v.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = proj(AG.model.pointAlong(g, v, v.label.at));
      if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue;
      const text = v.tag;
      items.push({ id: v.id, x: p[0], y: p[1], w: ctx.measureText(text).width + 10, h: 17,
        pri: v.label.pri, force: forced ? 1 : 0, text });
    }
    const head = proj([0, -10, 10]);
    const placed = AG.labels.layout(items, { cx: head[0], cy: head[1], width: W, height: H });
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const p of placed) {
      const it = byId[p.id];
      const v = g.byId[p.id];
      const tx = p.bx < p.x ? p.bx + p.w : p.bx;   // leader meets the near edge
      const ty = p.by + p.h / 2;
      ctx.strokeStyle = dsa ? "rgba(0,60,110,0.8)" : "rgba(200,220,240,0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = dsa ? "#00508c" : "#e8f0f8"; ctx.fill();
      const strong = it.force;
      ctx.fillStyle = strong ? "#00a6d6" : dsa ? "rgba(255,255,255,0.92)" : "rgba(16,21,28,0.88)";
      roundRect(ctx, p.bx, p.by, p.w, p.h, 4);
      ctx.fill();
      ctx.fillStyle = strong ? "#fff" : dsa ? "#123" : (AG.render.GROUP_COLOR[v.group] || "#ddd");
      ctx.fillText(it.text, p.bx + 5, p.by + p.h / 2 + 0.5);
    }
    return placed;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Nearest vessel to a screen point, within tol pixels. */
  function hitTest(g, hit, x, y, tol = 7) {
    if (!hit) return null;
    const vessel = nearestVessel(g, hit, x, y, tol);
    // A vessel right under the pointer beats a label box drawn over it.
    if (vessel && vessel.d < 3) return vessel.id;
    for (const p of hit.placed) {
      if (x >= p.bx && x <= p.bx + p.w && y >= p.by && y <= p.by + p.h) return p.id;
    }
    return vessel ? vessel.id : null;
  }
  function nearestVessel(g, hit, x, y, tol) {
    let best = null, bestD = tol;
    for (const v of g.vessels) {
      if (!hit.visible.has(v.id)) continue;
      for (const ei of v.edges) {
        const e = g.edges[ei];
        const d = segDist(x, y, hit.sx[e.a], hit.sy[e.a], hit.sx[e.b], hit.sy[e.b]);
        if (d < bestD) { bestD = d; best = v.id; }
      }
    }
    return best ? { id: best, d: bestD } : null;
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }

  AG.render = { draw, hitTest, GROUP_COLOR, CENTER };
})(window.AG);
