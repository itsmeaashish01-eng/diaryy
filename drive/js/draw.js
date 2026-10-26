/* ================================================
   LANE COACH — draw.js
   Everything you see: the top-down road on a canvas, the navigation
   card, lane arrows and the overhead sign. The quiz and the drive both
   draw through here, so a lane looks the same in each.

   The canvas is a dark "car screen" in both page themes. Lane lines
   follow US practice because they carry meaning: dashed you may cross,
   wide dotted means the lane is ending, solid means stay put, and the
   left edge of any one-way road is yellow.
   ================================================ */
window.LC = window.LC || {};

(function (LC) {
  "use strict";
  const L = LC.logic;
  const SVGNS = "http://www.w3.org/2000/svg";

  const C = {
    ground: "#15171c",
    grid: "rgba(255,255,255,0.035)",
    shoulder: "#272a31",
    asphalt: "#383c45",
    cross: "#2b2f37",
    dash: "rgba(232,235,240,0.85)",
    white: "#e4e7ec",
    yellow: "#e2bf45",
    route: "#3d8bff",
    routeGlow: "rgba(61,139,255,0.22)",
    car: "#f4f5f7",
    npc: "#878d97",
    glass: "#1d2129",
    label: "#e9ecf1",
    labelBg: "rgba(17,19,24,0.86)",
    best: "rgba(52,199,89,0.30)",
    ok: "rgba(255,179,64,0.32)",
    wrong: "rgba(255,69,58,0.32)",
  };
  const DASH_FT = 40, GAP_FT = 60;

  /* ---- the view ------------------------------------------------------ */

  /* Sideways extent of everything between s0 and s1, in lane widths, so
     a scenario can be framed once and the camera needn't swing about. */
  function fit(sc, s0, s1) {
    let min = Infinity, max = -Infinity;
    for (let k = 0; k <= 60; k++) {
      const s = s0 + ((s1 - s0) * k) / 60;
      sc.lanes.forEach((_, i) => {
        for (const b of L.branchesOf(sc, i)) {
          const x = L.lateral(sc, i, s, b);
          if (x < min) min = x;
          if (x > max) max = x;
        }
      });
    }
    for (const d of sc.decor || []) {
      if (d.type !== "parallel") continue;
      min = Math.min(min, d.lat);
      max = Math.max(max, d.lat + d.lanes - 1);
    }
    return { min: min - 0.9, max: max + 0.9 };
  }

  /* On a wide screen the road sits right of the navigation card, the
     way a car's map keeps clear of its own overlay. On a phone there
     isn't room, and the card floats over the road instead. */
  const CARD_INSET = 356;

  function makeView(w, h, sBottom, sTop, f) {
    const span = f.max - f.min;
    const inset = w >= 700 && (w - CARD_INSET) / span >= 34 ? CARD_INSET : 0;
    const room = w - inset;
    const lw = Math.max(18, Math.min(62, room / span));
    const x0 = inset + (room - span * lw) / 2;
    const px = h / (sTop - sBottom);
    return {
      w, h, sBottom, sTop, lw, px,
      x: (lat) => x0 + (lat - f.min) * lw,
      y: (s) => h - (s - sBottom) * px,
      latAt: (x) => f.min + (x - x0) / lw,
      sAt: (y) => sBottom + (h - y) / px,
    };
  }

  /* Size a canvas for crisp lines on a retina screen, and hand back the
     CSS-pixel size to draw in. */
  function prepare(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /* ---- the road ------------------------------------------------------ */

  function samples(v) {
    const ds = (v.sTop - v.sBottom) / 140;
    const out = [];
    for (let s = v.sBottom - ds * 2; s <= v.sTop + ds * 2; s += ds) out.push(s);
    return out;
  }

  function polyline(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  }

  /* A lane edge is shared when the neighbour on that side sits exactly
     one lane over — measured on this fork, so a ramp that has peeled
     away gets edges of its own. */
  function shared(sc, i, b, side, s) {
    const j = i + side;
    if (j < 0 || j >= sc.lanes.length) return false;
    const me = L.lateral(sc, i, s, b);
    return L.branchesOf(sc, j).some((bb) => Math.abs((L.lateral(sc, j, s, bb) - me) * side - 1) < 0.15);
  }

  function edgeStyle(sc, i, b, side, s) {
    if (!shared(sc, i, b, side, s)) return side < 0 ? "yellow" : "white";
    if (side > 0) return null; // the neighbour draws it, as its left edge
    // Whether you may cross is a lane-level question, so the line agrees
    // with what the drive will let you do.
    if (!L.adjacentAt(sc, i - 1, i, s + L.SOLID_FT)) return "solid";
    if (sc.lanes[i].exitOnly !== !!sc.lanes[i - 1].exitOnly) return "wide";
    return "dash";
  }

  function strokeRun(ctx, v, pts, style, s0) {
    if (!style || pts.length < 2) return;
    const lw = v.lw;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    if (style === "yellow" || style === "white" || style === "solid") {
      ctx.strokeStyle = style === "yellow" ? C.yellow : C.white;
      ctx.lineWidth = Math.max(1.4, lw * 0.05);
    } else {
      // Anchored to the road but never finer than the eye can follow.
      const dash = style === "wide"
        ? [Math.max(4, DASH_FT * 0.5 * v.px), Math.max(5, GAP_FT * 0.5 * v.px)]
        : [Math.max(9, DASH_FT * v.px), Math.max(13, GAP_FT * v.px)];
      const period = dash[0] + dash[1];
      ctx.setLineDash(dash);
      // Anchor the dashes to the road, not the screen, so they scroll.
      ctx.lineDashOffset = ((s0 * v.px) % period + period) % period;
      ctx.strokeStyle = C.dash;
      ctx.lineWidth = style === "wide" ? Math.max(2.6, lw * 0.11) : Math.max(1.2, lw * 0.045);
    }
    polyline(ctx, pts);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawEdges(ctx, v, sc, ss) {
    sc.lanes.forEach((_, i) => {
      for (const b of L.branchesOf(sc, i)) {
        for (const side of [-1, 1]) {
          let run = [], style, s0;
          ss.forEach((s) => {
            const st = edgeStyle(sc, i, b, side, s);
            const p = [v.x(L.lateral(sc, i, s, b) + side * 0.5), v.y(s)];
            if (st !== style) {
              if (run.length) { run.push(p); strokeRun(ctx, v, run, style, s0); }
              run = [p]; style = st; s0 = s;
            } else run.push(p);
          });
          strokeRun(ctx, v, run, style, s0);
        }
      }
    });
  }

  function drawDecor(ctx, v, sc) {
    for (const d of sc.decor || []) {
      if (d.type === "cross") {
        const y = v.y(d.at), half = v.lw * 0.75;
        if (y < -half || y > v.h + half) continue;
        ctx.fillStyle = C.cross;
        ctx.fillRect(0, y - half, v.w, half * 2);
        ctx.strokeStyle = C.yellow;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, y - 1.5); ctx.lineTo(v.w, y - 1.5);
        ctx.moveTo(0, y + 1.5); ctx.lineTo(v.w, y + 1.5);
        ctx.stroke();
        pill(ctx, d.label, v.w - 14 - measure(ctx, d.label) / 2, y, "muted");
      } else if (d.type === "parallel") {
        const left = v.x(d.lat - 0.5), right = v.x(d.lat + d.lanes - 0.5);
        ctx.fillStyle = C.shoulder;
        ctx.fillRect(left - v.lw * 0.12, 0, right - left + v.lw * 0.24, v.h);
        ctx.fillStyle = C.asphalt;
        ctx.fillRect(left, 0, right - left, v.h);
        const line = (x, style) => strokeRun(ctx, v, [[x, v.h + 10], [x, -10]], style, v.sBottom);
        line(left, "yellow");
        line(right, "white");
        for (let k = 1; k < d.lanes; k++) line(v.x(d.lat - 0.5 + k), "dash");
        if (d.toll) line(right + 4, "white"); // the painted buffer
        ctx.save();
        ctx.translate((left + right) / 2, v.h * 0.62);
        ctx.rotate(-Math.PI / 2);
        pill(ctx, d.label, 0, 0, "muted");
        ctx.restore();
      }
    }
  }

  function measure(ctx, text) {
    ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
    return ctx.measureText(text).width;
  }

  function pill(ctx, text, cx, cy, tone) {
    const w = measure(ctx, text) + 16, h = 22;
    // Keep it on screen; a label is no use half off the edge.
    const room = ctx.canvas.width / (ctx.getTransform().a || 1);
    if (!ctx.getTransform().b) cx = Math.max(w / 2 + 4, Math.min(room - w / 2 - 4, cx));
    ctx.fillStyle = C.labelBg;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 11);
    ctx.fill();
    if (tone === "route") {
      ctx.strokeStyle = C.route;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = tone === "muted" ? "#b9bec8" : C.label;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy + 0.5);
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

  function drawLabels(ctx, v, sc, o) {
    const settled = L.settledAt(sc);
    const placed = [];
    Object.entries(sc.branches).forEach(([id, b]) => {
      const lanes = sc.lanes.map((_, i) => i).filter((i) => L.branchesOf(sc, i).includes(id));
      if (!lanes.length) return;
      const last = (b.moves || [])[b.moves ? b.moves.length - 1 : 0];
      let s = last ? last.at + last.len + 250 : settled + 250;
      if (o.pinLabels) s = Math.min(s, v.sTop - 260 / v.px);
      const lat = lanes.reduce((sum, i) => sum + L.lateral(sc, i, s, id), 0) / lanes.length;
      const x = v.x(lat), half = measure(ctx, b.label) / 2 + 10;
      let y = v.y(s);
      // Step down past any label already there, rather than overprint it.
      for (let tries = 0; tries < 4; tries++) {
        const hit = placed.some((p) => Math.abs(p.y - y) < 26 && x - half < p.x + p.half && x + half > p.x - p.half);
        if (!hit) break;
        y += 28;
      }
      if (y < 14 || y > v.h - 14) return;
      placed.push({ x, y, half });
      pill(ctx, b.label, x, y, o.revealRoute && b.onRoute ? "route" : "plain");
    });
  }

  function car(ctx, x, y, angle, w, h, player) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (player) {
      ctx.fillStyle = "rgba(61,139,255,0.22)";
      roundRect(ctx, -w * 0.85, -h * 0.75, w * 1.7, h * 1.5, w * 0.8);
      ctx.fill();
    }
    ctx.fillStyle = player ? C.car : C.npc;
    roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.32);
    ctx.fill();
    ctx.fillStyle = C.glass;
    roundRect(ctx, -w * 0.38, -h * 0.28, w * 0.76, h * 0.2, 3);   // windshield
    ctx.fill();
    roundRect(ctx, -w * 0.36, h * 0.22, w * 0.72, h * 0.12, 2);   // rear glass
    ctx.fill();
    ctx.restore();
  }

  /* Heading from how the lane is drifting, so a car on a ramp leans
     into it instead of crabbing sideways. */
  function heading(v, latFn, s) {
    const d = 40;
    const dx = v.x(latFn(s + d)) - v.x(latFn(s - d));
    const dy = v.y(s - d) - v.y(s + d);
    return Math.atan2(dx, dy);
  }

  /* o: { player: {s, lat(s)}, cars: [{s, lat(s)}], route: {s, lat, lane},
          marks: [{lane, tone, from}], pinLabels, revealRoute } */
  function scene(ctx, v, sc, o) {
    o = o || {};
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, v.w, v.h);

    // A faint grid in road units, so the ground visibly moves.
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const every = 400;
    for (let s = Math.ceil(v.sBottom / every) * every; s < v.sTop; s += every) {
      ctx.moveTo(0, v.y(s)); ctx.lineTo(v.w, v.y(s));
    }
    ctx.stroke();

    drawDecor(ctx, v, sc);

    const ss = samples(v);
    const paths = [];
    sc.lanes.forEach((_, i) => {
      for (const b of L.branchesOf(sc, i)) {
        paths.push({ i, b, pts: ss.map((s) => [v.x(L.lateral(sc, i, s, b)), v.y(s)]) });
      }
    });
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    for (const p of paths) {
      ctx.strokeStyle = C.shoulder;
      ctx.lineWidth = v.lw * 1.28;
      polyline(ctx, p.pts);
      ctx.stroke();
    }
    for (const p of paths) {
      ctx.strokeStyle = C.asphalt;
      ctx.lineWidth = v.lw + 1.5;
      polyline(ctx, p.pts);
      ctx.stroke();
    }

    for (const m of o.marks || []) {
      const pts = ss.filter((s) => s >= m.from).map((s) => [v.x(L.lateral(sc, m.lane, s)), v.y(s)]);
      if (pts.length < 2) continue;
      ctx.strokeStyle = C[m.tone];
      ctx.lineWidth = v.lw * 0.86;
      polyline(ctx, pts);
      ctx.stroke();
    }

    drawEdges(ctx, v, sc, ss);

    if (o.route) {
      const r = o.route;
      const pts = ss.filter((s) => s >= r.s).map((s) => {
        const target = L.lateral(sc, r.lane, s);
        const lat = r.lat + (target - r.lat) * L.smooth((s - r.s) / 700);
        return [v.x(lat), v.y(s)];
      });
      pts.unshift([v.x(r.lat), v.y(r.s)]);
      ctx.lineCap = "round";
      ctx.strokeStyle = C.routeGlow;
      ctx.lineWidth = v.lw * 0.7;
      polyline(ctx, pts);
      ctx.stroke();
      ctx.strokeStyle = C.route;
      ctx.lineWidth = Math.max(4, v.lw * 0.26);
      polyline(ctx, pts);
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    drawLabels(ctx, v, sc, o);

    // In the drive, a car's drawn length matches the length the sim uses
    // to decide what's alongside you, so a gap you can see is a gap.
    const cw = v.lw * 0.5;
    const ch = o.carFt ? o.carFt * v.px : Math.max(22, v.lw * 0.92);
    for (const c of o.cars || []) {
      const y = v.y(c.s);
      if (y < -ch || y > v.h + ch) continue;
      car(ctx, v.x(c.lat(c.s)), y, heading(v, c.lat, c.s), cw, ch, false);
    }
    if (o.player) {
      const p = o.player;
      car(ctx, v.x(p.lat(p.s)), v.y(p.s), heading(v, p.lat, p.s), cw, ch, true);
    }
  }

  /* Which lane is under a tap, or -1. */
  function laneAt(sc, v, x, y) {
    const s = v.sAt(y), lat = v.latAt(x);
    let best = -1, dist = 0.6;
    sc.lanes.forEach((_, i) => {
      for (const b of L.branchesOf(sc, i)) {
        const d = Math.abs(L.lateral(sc, i, s, b) - lat);
        if (d < dist) { dist = d; best = i; }
      }
    });
    return best;
  }

  /* ---- arrows -------------------------------------------------------- */

  const TIPS = {
    up: { tip: [12, 2], ctl: [12, 8] },
    right: { tip: [21.5, 7], ctl: [12, 5] },
    left: { tip: [2.5, 7], ctl: [12, 5] },
    "bear-right": { tip: [19, 2.5], ctl: [12, 6] },
    "bear-left": { tip: [5, 2.5], ctl: [12, 6] },
  };

  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, val] of Object.entries(attrs || {})) el.setAttribute(k, val);
    return el;
  }

  /* A lane-use arrow: one shaft that splits into each direction the lane
     allows. `faded` lists directions to draw dimmed (the road you're not
     taking, on a maneuver icon). */
  function arrow(kinds, faded) {
    faded = faded || [];
    const root = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: "arrow" });
    const junction = [12, 14];
    const order = kinds.slice().sort((a, b) => faded.includes(b) - faded.includes(a));
    root.appendChild(svg("path", { d: `M12 22.5 L${junction[0]} ${junction[1]}`, class: "arrow-shaft" }));
    for (const k of order) {
      const { tip, ctl } = TIPS[k];
      const tx = tip[0] - ctl[0], ty = tip[1] - ctl[1];
      const len = Math.hypot(tx, ty), ux = tx / len, uy = ty / len;
      const back = [tip[0] - ux * 5.4, tip[1] - uy * 5.4];
      const h1 = [back[0] - uy * 4.2, back[1] + ux * 4.2];
      const h2 = [back[0] + uy * 4.2, back[1] - ux * 4.2];
      const g = svg("g", { class: faded.includes(k) ? "arrow-dim" : "arrow-on" });
      g.appendChild(svg("path", {
        d: `M${junction[0]} ${junction[1]} Q${ctl[0]} ${ctl[1]} ${back[0].toFixed(2)} ${back[1].toFixed(2)}`,
        class: "arrow-shaft",
      }));
      g.appendChild(svg("path", {
        d: `M${tip[0]} ${tip[1]} L${h1[0].toFixed(2)} ${h1[1].toFixed(2)} L${h2[0].toFixed(2)} ${h2[1].toFixed(2)} Z`,
        class: "arrow-head",
      }));
      root.appendChild(g);
    }
    return root;
  }

  const MANEUVERS = {
    "keep-right": { kinds: ["bear-left", "bear-right"], faded: ["bear-left"], verb: "Keep right to" },
    "keep-left": { kinds: ["bear-left", "bear-right"], faded: ["bear-right"], verb: "Keep left to" },
    "exit-right": { kinds: ["up", "right"], faded: ["up"], verb: "Take exit to" },
    "exit-left": { kinds: ["up", "left"], faded: ["up"], verb: "Take left exit to" },
    straight: { kinds: ["up"], faded: [], verb: "Continue on" },
  };

  /* ---- the navigation card ------------------------------------------ */

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Builds the card once and hands back a setter for the distance, which
     is the only thing that changes while you drive. */
  function navCard(root, sc, opts) {
    opts = opts || {};
    root.textContent = "";
    const nav = sc.nav;
    const m = MANEUVERS[nav.maneuver];

    const main = el("div", "nav-main");
    const icon = el("div", "nav-icon");
    icon.appendChild(arrow(m.kinds, m.faded));
    main.appendChild(icon);

    const text = el("div", "nav-text");
    const dist = el("div", "nav-dist");
    text.appendChild(dist);
    const road = el("div", "nav-road");
    if (nav.exit) road.appendChild(el("span", "exit-badge", "EXIT " + nav.exit));
    road.appendChild(el("span", "", nav.road));
    text.appendChild(road);
    road.prepend(el("span", "nav-verb", m.verb + " "));
    if (nav.toward) text.appendChild(el("div", "nav-toward", "toward " + nav.toward));
    main.appendChild(text);
    root.appendChild(main);

    if (nav.then) root.appendChild(el("div", "nav-then", nav.then));

    if (opts.cues !== false) {
      const strip = el("div", "nav-lanes");
      strip.setAttribute("role", "img");
      const on = sc.lanes.map((_, i) => L.onRoute(sc, i));
      strip.setAttribute("aria-label", "Lane guidance: " + sc.lanes.map((_, i) => `lane ${i + 1} ${on[i] ? "recommended" : "not on route"}`).join(", "));
      sc.lanes.forEach((lane, i) => {
        const cell = el("span", "lane-ic" + (on[i] ? " is-on" : ""));
        cell.appendChild(arrow(lane.arrows));
        strip.appendChild(cell);
      });
      root.appendChild(strip);
    }

    const set = (ft) => {
      dist.textContent = nav.distanceText && ft == null ? nav.distanceText : L.formatDistance(ft);
    };
    set(opts.distanceFt);
    return { setDistance: set };
  }

  /* ---- the overhead sign -------------------------------------------- */

  function shieldKind(t) {
    if (/^(35|35E|35W|30|20|635|820|45)$/.test(t)) return "interstate";
    if (t === "75") return "us";
    if (/^\d+$/.test(t)) return "state";
    if (t === "TEXpress") return "toll";
    return "plain";
  }

  function shield(t) {
    const kind = shieldKind(t);
    const s = el("span", "shield shield-" + kind, t);
    s.setAttribute("aria-label", { interstate: "Interstate ", us: "US ", state: "State Highway ", toll: "", plain: "" }[kind] + t);
    return s;
  }

  function sign(root, sc) {
    root.textContent = "";
    const n = sc.lanes.length;
    const grid = el("div", "sign-grid");
    grid.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;

    for (const p of sc.sign.panels) {
      const panel = el("div", "sign-panel");
      panel.style.gridColumn = `${p.lanes[0] + 1} / span ${p.lanes.length}`;
      panel.style.gridRow = "1";
      if (p.exit || p.left) {
        const tab = el("div", "sign-tab" + (p.left ? " is-left" : ""), p.left ? "LEFT" : "EXIT " + p.exit);
        panel.appendChild(tab);
      }
      const head = el("div", "sign-head");
      if (p.shield) head.appendChild(shield(p.shield));
      if (p.dir) head.appendChild(el("span", "sign-dir", p.dir));
      panel.appendChild(head);
      for (const line of p.lines || []) panel.appendChild(el("div", "sign-line", line));
      grid.appendChild(panel);
    }

    sc.lanes.forEach((lane, i) => {
      const cell = el("div", "sign-arrow");
      cell.style.gridColumn = String(i + 1);
      cell.style.gridRow = "2";
      cell.appendChild(arrow(lane.arrows));
      grid.appendChild(cell);
    });

    // EXIT ONLY plaques span each run of exit-only lanes.
    const only = (sc.sign.exitOnly || []).slice().sort((a, b) => a - b);
    for (let k = 0; k < only.length; ) {
      let end = k;
      while (end + 1 < only.length && only[end + 1] === only[end] + 1) end++;
      const plaque = el("div", "sign-only", "EXIT ONLY");
      plaque.style.gridColumn = `${only[k] + 1} / span ${end - k + 1}`;
      plaque.style.gridRow = "3";
      grid.appendChild(plaque);
      k = end + 1;
    }
    root.appendChild(grid);
  }

  LC.draw = { fit, makeView, prepare, scene, laneAt, arrow, navCard, sign, MANEUVERS };
})(window.LC);
