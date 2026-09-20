/* ================================================
   QUOTE SHELL — charts.js
   Every plot on the page, drawn straight onto canvas. No libraries.

   They share one idea: the dollar line. A complete set pays exactly
   $1, so on the plane, in the histogram and along the VWAP the only
   thing that matters is which side of $1 the pair came in on. That
   line is drawn in every one of them, in the same amber, and the
   colour of a mark says where it sat.
   ================================================ */
(function (MK) {
  "use strict";
  const { clamp, lerp, money, moneyShort, cents, pct, px, histogram, mean } = MK.util;

  const C = {
    green: "#2fd47f", red: "#ff4a5c", amber: "#f7c948",
    blue: "#4da6ff", violet: "#a97bff", cyan: "#2fe0d0",
    dim: "#5e6c80", dimmer: "#39434f", line: "#151c26", bg: "#080b11",
  };

  /* What a completed set cost, as a colour. Under 96¢ is a good day;
     over a dollar is a set that will pay out less than it cost. */
  function costColor(c) {
    if (c < 0.96) return C.green;
    if (c < 0.985) return C.amber;
    if (c < 1) return C.blue;
    return C.red;
  }

  /* Size the backing store to the device, so hairlines stay hairlines
     on a retina screen instead of turning into grey mush. */
  function fit(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 300;
    const h = cv.clientHeight || 120;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";
    return { ctx, w, h };
  }

  const line = (ctx, x1, y1, x2, y2, col, dash) => {
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1 + .5, y1 + .5); ctx.lineTo(x2 + .5, y2 + .5); ctx.stroke();
    ctx.restore();
  };
  const label = (ctx, t, x, y, col, align) => {
    ctx.fillStyle = col; ctx.textAlign = align || "left"; ctx.fillText(t, x, y);
  };

  /* ================================================================
     BTC SPOT — five-minute candles, plus the one still forming.
     The open of the live window is drawn as a dashed line because it
     is the strike: everything the market is arguing about is whether
     the close lands above or below it.
     ================================================================ */
  function spot(cv, world) {
    const { ctx, w, h } = fit(cv);
    const st = world.state;
    const pad = { l: 4, r: 52, t: 8, b: 12 };
    const done = st.candles.last(34) || [];
    const ticks = st.ticks.items;
    if (!done.length && ticks.length < 2) return;

    const live = ticks.length
      ? { o: st.openSpot, c: st.spot,
          h: Math.max(...ticks.map((p) => p.p)), l: Math.min(...ticks.map((p) => p.p)),
          winner: st.spot > st.openSpot ? "UP" : "DOWN", live: true }
      : null;
    const all = live ? done.concat([live]) : done;

    const hi = Math.max(...all.map((c) => c.h));
    const lo = Math.min(...all.map((c) => c.l));
    const pd = (hi - lo) * 0.12 || 1;
    const Y = (v) => pad.t + ((hi + pd - v) / (hi - lo + 2 * pd)) * (h - pad.t - pad.b);
    const bw = (w - pad.l - pad.r) / all.length;

    for (const tick of [0, 0.5, 1]) {
      const v = lerp(lo - pd, hi + pd, tick);
      line(ctx, pad.l, Y(v), w - pad.r, Y(v), C.line);
      label(ctx, Math.round(v).toLocaleString("en-US"), w - pad.r + 4, Y(v), C.dimmer);
    }

    all.forEach((c, i) => {
      const x = pad.l + i * bw + bw / 2;
      const up = c.c >= c.o;
      const col = c.live ? C.amber : up ? C.green : C.red;
      ctx.globalAlpha = c.live ? 1 : 0.62;
      line(ctx, Math.round(x), Y(c.h), Math.round(x), Y(c.l), col);
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x - bw * 0.3), y1, Math.max(1, bw * 0.6), Math.max(1, y2 - y1));
      ctx.globalAlpha = 1;
    });

    /* the strike of the live market */
    line(ctx, pad.l, Y(st.openSpot), w - pad.r, Y(st.openSpot), "#4a3a12", [3, 3]);
    label(ctx, "OPEN " + Math.round(st.openSpot).toLocaleString("en-US"), pad.l + 2, Y(st.openSpot) - 7, C.amber);

    /* last price */
    const yl = Y(st.spot);
    line(ctx, pad.l, yl, w - pad.r, yl, "#2a3444", [2, 2]);
    ctx.fillStyle = st.spot >= st.openSpot ? C.green : C.red;
    ctx.fillRect(w - pad.r + 1, yl - 6, pad.r - 2, 12);
    ctx.fillStyle = "#04060a"; ctx.textAlign = "left";
    ctx.fillText(Math.round(st.spot).toLocaleString("en-US"), w - pad.r + 4, yl);
  }

  /* ================================================================
     EQUITY — the session, small enough to sit beside the number.
     ================================================================ */
  function equity(cv, maker) {
    const { ctx, w, h } = fit(cv);
    const wins = maker.state.windows.items;
    if (wins.length < 2) return;
    let run = 0;
    const series = wins.map((r) => (run += r.pnl));
    const lo = Math.min(0, ...series), hi = Math.max(0, ...series);
    const X = (i) => (i / (series.length - 1)) * w;
    const Y = (v) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
    const pos = series[series.length - 1] >= 0;
    const col = pos ? C.green : C.red;

    ctx.beginPath(); ctx.moveTo(0, Y(series[0]));
    series.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pos ? "rgba(47,212,127,.30)" : "rgba(255,74,92,.30)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath();
    series.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
    if (lo < 0 && hi > 0) line(ctx, 0, Y(0), w, Y(0), C.line);
  }

  /* ================================================================
     PAIR COST PLANE
     One dot per completed set: what the UP leg cost against what the
     DOWN leg cost. The anti-diagonal is $1 — every dot below it is a
     set bought for less than it will pay, and the gap is the edge.
     ================================================================ */
  function plane(cv, maker) {
    const { ctx, w, h } = fit(cv);
    const pad = { l: 22, r: 6, t: 6, b: 14 };
    const sets = maker.state.chords.items;
    const lo = 0.02, hi = 0.98;
    const X = (v) => pad.l + ((v - lo) / (hi - lo)) * (w - pad.l - pad.r);
    const Y = (v) => h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b);

    ctx.strokeStyle = C.line;
    for (let g = 0.2; g < 1; g += 0.2) {
      line(ctx, X(g), pad.t, X(g), h - pad.b, C.line);
      line(ctx, pad.l, Y(g), w - pad.r, Y(g), C.line);
    }
    label(ctx, "DOWN", 2, pad.t + 4, C.dimmer);
    label(ctx, "UP →", pad.l, h - 4, C.dimmer);

    /* the dollar line, and the band our quotes aim for */
    ctx.save();
    ctx.fillStyle = "rgba(47,212,127,.05)";
    ctx.beginPath();
    ctx.moveTo(X(lo), Y(lo)); ctx.lineTo(X(hi - lo), Y(lo)); ctx.lineTo(X(lo), Y(hi - lo));
    ctx.closePath(); ctx.fill();
    ctx.restore();
    line(ctx, X(lo), Y(1 - lo), X(1 - lo), Y(lo), C.amber, [4, 3]);
    label(ctx, "UP + DOWN = $1", X(0.52), Y(0.52) - 8, "#7a6428");

    const n = sets.length;
    sets.forEach((s, i) => {
      const age = i / Math.max(1, n - 1);
      ctx.globalAlpha = 0.18 + 0.75 * age;
      ctx.fillStyle = costColor(s.cost);
      const r = clamp(Math.sqrt(s.qty) / 9, 1.1, 4.4);
      ctx.beginPath(); ctx.arc(X(s.upPx), Y(s.downPx), r, 0, 6.2832); ctx.fill();
    });
    ctx.globalAlpha = 1;

    const last = sets[sets.length - 1];
    if (last) {
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X(last.upPx), Y(last.downPx), 6, 0, 6.2832); ctx.stroke();
    }
  }

  /* Distribution of what the sets cost. Anything right of the amber
     line was a set bought for more than a dollar. */
  function planeHist(cv, maker) {
    const { ctx, w, h } = fit(cv);
    const costs = maker.state.pairCosts.items;
    if (!costs.length) return;
    const lo = 0.90, hi = 1.03, bins = 26;
    const bars = histogram(costs.map((c) => clamp(c, lo, hi - 1e-6)), lo, hi, bins);
    const max = Math.max(...bars, 1);
    const bh = (h - 14) / bins;
    bars.forEach((n, i) => {
      const y = 6 + i * bh;
      const c = lo + ((i + 0.5) / bins) * (hi - lo);
      ctx.fillStyle = costColor(c);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, y, (n / max) * (w - 2), Math.max(1, bh - 1));
    });
    ctx.globalAlpha = 1;
    const y1 = 6 + ((1 - lo) / (hi - lo)) * (h - 14);
    line(ctx, 0, y1, w, y1, C.amber, [3, 2]);
    label(ctx, "$1", w - 2, y1 - 6, C.amber, "right");
    label(ctx, "SET COST", 0, h - 4, C.dimmer);
  }

  /* ================================================================
     FILL SIZES — log-spaced buckets of what each fill was worth.
     ================================================================ */
  function fillHist(cv, maker) {
    const { ctx, w, h } = fit(cv);
    const fills = maker.state.fills.last(400) || [];
    if (!fills.length) return;
    const bins = 30;
    const vals = fills.map((f) => Math.log10(Math.max(f.notional, 1)));
    const bars = histogram(vals, 0, 3, bins);
    const max = Math.max(...bars, 1);
    const bw = w / bins;
    bars.forEach((n, i) => {
      const hh = (n / max) * (h - 12);
      ctx.fillStyle = i < 10 ? C.dim : i < 20 ? C.blue : C.violet;
      ctx.fillRect(i * bw, h - 10 - hh, Math.max(1, bw - 1), hh);
    });
    line(ctx, 0, h - 10, w, h - 10, C.line);
    ["$1", "$10", "$100", "$1K"].forEach((t, i) =>
      label(ctx, t, (i / 3) * (w - 14), h - 4, C.dimmer));
  }

  /* ================================================================
     RUNNING VWAP — the cost of the pairs in the live market, in the
     order they were made. Each dot is a set; the line is the volume
     weighted average of everything paired so far.
     ================================================================ */
  function vwap(cv, maker, world) {
    const { ctx, w, h } = fit(cv);
    const pad = { l: 6, r: 44, t: 8, b: 14 };
    const wi = world.state.windowIndex;
    let sets = maker.state.chords.items.filter((s) => s.w === wi);
    const fellBack = sets.length < 2;
    if (fellBack) sets = maker.state.chords.last(40) || [];
    if (!sets.length) {
      label(ctx, "NO SETS IN THIS MARKET YET", pad.l, h / 2, C.dimmer);
      return;
    }

    let vq = 0, vc = 0;
    const series = sets.map((s) => {
      vq += s.qty; vc += s.qty * s.cost;
      return { cost: s.cost, vwap: vc / vq, qty: s.qty };
    });
    const costs = series.map((p) => p.cost).concat(series.map((p) => p.vwap), [1]);
    const lo = Math.min(...costs) - 0.01, hi = Math.max(...costs) + 0.01;
    const X = (i) => pad.l + (i / Math.max(1, series.length - 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + ((hi - v) / (hi - lo || 1)) * (h - pad.t - pad.b);

    /* everything under this line is money the market cannot take back */
    line(ctx, pad.l, Y(1), w - pad.r, Y(1), C.amber, [4, 3]);
    ctx.fillStyle = "rgba(47,212,127,.045)";
    ctx.fillRect(pad.l, Y(1), w - pad.r - pad.l, h - pad.b - Y(1));
    label(ctx, "$1.000", w - pad.r + 3, Y(1), C.amber);

    series.forEach((p, i) => {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = costColor(p.cost);
      ctx.beginPath(); ctx.arc(X(i), Y(p.cost), clamp(Math.sqrt(p.qty) / 7, 1, 3.6), 0, 6.2832); ctx.fill();
    });
    ctx.globalAlpha = 1;

    /* the VWAP itself, drawn as steps — it only moves on a fill */
    ctx.beginPath();
    let py = 0;
    series.forEach((p, i) => {
      const x = X(i), y = Y(p.vwap);
      if (!i) ctx.moveTo(x, y);
      else { ctx.lineTo(x, py); ctx.lineTo(x, y); }
      py = y;
    });
    ctx.strokeStyle = C.amber; ctx.lineWidth = 1.4; ctx.stroke();

    const end = series[series.length - 1];
    ctx.fillStyle = C.amber;
    ctx.fillRect(w - pad.r + 1, Y(end.vwap) - 6, pad.r - 3, 12);
    ctx.fillStyle = "#0a0704"; ctx.textAlign = "left";
    ctx.fillText(end.vwap.toFixed(4).slice(1), w - pad.r + 3, Y(end.vwap));
    label(ctx, fellBack ? "LAST " + sets.length + " SETS · PREVIOUS MARKETS"
                        : sets.length + " SETS THIS MARKET", pad.l, h - 4, C.dimmer);
  }

  /* Locked profit per market, most recent at the top. */
  function vwapBars(cv, maker) {
    const { ctx, w, h } = fit(cv);
    const wins = maker.state.windows.last(14) || [];
    if (!wins.length) return;
    const max = Math.max(...wins.map((r) => Math.abs(r.pnl)), 1);
    const bh = h / wins.length;
    const mid = w * 0.42;
    wins.forEach((r, i) => {
      const y = i * bh;
      const len = (Math.abs(r.pnl) / max) * (r.pnl >= 0 ? w - mid - 2 : mid - 2);
      ctx.fillStyle = r.pnl >= 0 ? C.green : C.red;
      ctx.globalAlpha = 0.35 + 0.65 * (i / wins.length);
      if (r.pnl >= 0) ctx.fillRect(mid, y + 1, len, Math.max(1, bh - 2));
      else ctx.fillRect(mid - len, y + 1, len, Math.max(1, bh - 2));
    });
    ctx.globalAlpha = 1;
    line(ctx, mid, 0, mid, h, C.line);
  }

  /* ================================================================
     QUOTE CYCLE
     The bot is always in one of four states, and the loop it wants is
     flat → one leg → paired → flat. Sitting in a leg is the only
     state with risk in it, so the diagram shows where the time went.
     ================================================================ */
  const CYCLE_NODES = [
    { k: "FLAT", a: -Math.PI / 2, col: "#4da6ff" },
    { k: "UP LEG", a: 0, col: "#2fd47f" },
    { k: "SET", a: Math.PI / 2, col: "#f7c948" },
    { k: "DOWN LEG", a: Math.PI, col: "#ff4a5c" },
  ];

  function cycle(cv, tracker) {
    const { ctx, w, h } = fit(cv);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.33;
    const pos = CYCLE_NODES.map((n) => ({
      ...n, x: cx + Math.cos(n.a) * R * 1.35, y: cy + Math.sin(n.a) * R,
    }));
    const maxEdge = Math.max(1, ...Object.values(tracker.edges));

    pos.forEach((a, i) =>
      pos.forEach((b, j) => {
        if (i === j) return;
        const n = tracker.edges[a.k + ">" + b.k] || 0;
        if (!n) return;
        const t = n / maxEdge;
        ctx.strokeStyle = b.col;
        ctx.globalAlpha = 0.12 + 0.6 * t;
        ctx.lineWidth = 0.6 + 2.6 * t;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const bow = 0.22 * (j > i ? 1 : -1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + (cx - mx) * bow, my + (cy - my) * bow, b.x, b.y);
        ctx.stroke();
      }));
    ctx.globalAlpha = 1;

    pos.forEach((n) => {
      const on = tracker.state === n.k;
      const r = on ? 15 : 11;
      if (on) {
        ctx.fillStyle = n.col; ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 9, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.2832);
      ctx.fillStyle = C.bg; ctx.fill();
      ctx.strokeStyle = n.col; ctx.lineWidth = on ? 1.8 : 1; ctx.stroke();
      ctx.fillStyle = n.col; ctx.textAlign = "center";
      ctx.fillText(String(tracker.visits[n.k] || 0), n.x, n.y);
      ctx.fillStyle = on ? n.col : C.dim;
      ctx.fillText(n.k, n.x, n.y + r + 9);
    });
    ctx.textAlign = "left";
  }

  function cycleBars(cv, tracker) {
    const { ctx, w, h } = fit(cv);
    const total = CYCLE_NODES.reduce((a, n) => a + (tracker.time[n.k] || 0), 0) || 1;
    const bh = h / CYCLE_NODES.length;
    CYCLE_NODES.forEach((n, i) => {
      const share = (tracker.time[n.k] || 0) / total;
      const y = i * bh + 2;
      ctx.fillStyle = "#0c1119";
      ctx.fillRect(38, y, w - 38, bh - 6);
      ctx.fillStyle = n.col;
      ctx.globalAlpha = tracker.state === n.k ? 1 : 0.62;
      ctx.fillRect(38, y, (w - 38) * share, bh - 6);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.dim;
      ctx.fillText(n.k.slice(0, 4), 0, y + (bh - 6) / 2);
      ctx.fillStyle = "#0a0d13";
      ctx.textAlign = "right";
      if (share > 0.14) ctx.fillText(pct(share, 0), 36 + (w - 38) * share - 3, y + (bh - 6) / 2);
      ctx.textAlign = "left";
    });
  }

  MK.charts = {
    fit, line, label, costColor, C, CYCLE_NODES,
    spot, equity, plane, planeHist, fillHist, vwap, vwapBars, cycle, cycleBars,
  };
})(window.MK);
