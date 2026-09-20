/* ================================================
   QUOTE SHELL — shell.js
   The graph the terminal is named after.

   Price is the angle. The UP leg runs over the top of the ring from
   0¢ on the left round to 100¢ on the right; the DOWN leg runs back
   underneath. Each chord is one complete set, tying the UP fill to
   the DOWN fill it was paired with.

   That layout has a property worth the whole panel: a chord spans an
   angle of exactly pi times what the set cost. A set costing a full
   dollar is a diameter and passes dead through the middle. Anything
   cheaper misses the centre, and misses it by more the cheaper it
   was. So the hole in the middle of the hairball is the edge — when
   the bot is quoting well it opens up, and when the book turns
   against it the chords close in on the centre and it shuts.
   ================================================ */
(function (MK) {
  "use strict";
  const { clamp } = MK.util;
  const { fit, costColor, C } = MK.charts;

  const upAngle = (p) => Math.PI - Math.PI * p;      // top arc, left→right
  const downAngle = (p) => Math.PI + Math.PI * p;    // bottom arc, back again

  function draw(cv, maker, world, now) {
    const { ctx, w, h } = fit(cv);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 34;
    if (R < 20) return;

    const sets = maker.state.chords.items;
    const q = maker.state.quote;
    const pulse = 0.5 + 0.5 * Math.sin(now / 420);

    /* ---- the ring ------------------------------------------------ */
    ctx.strokeStyle = "#111925"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke();

    for (let p = 0; p <= 1.0001; p += 0.125) {
      for (const [ang, col] of [[upAngle(p), C.green], [downAngle(p), C.red]]) {
        const x1 = cx + Math.cos(ang) * R, y1 = cy + Math.sin(ang) * R;
        const x2 = cx + Math.cos(ang) * (R + 4), y2 = cy + Math.sin(ang) * (R + 4);
        ctx.strokeStyle = "#1b2430";
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (p === 0 || p === 1) {
          const lx = cx + Math.cos(ang) * (R + 15), ly = cy + Math.sin(ang) * (R + 15);
          ctx.fillStyle = col; ctx.globalAlpha = 0.65;
          ctx.textAlign = "center";
          ctx.fillText(Math.round(p * 100) + "¢", lx, ly);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.textAlign = "center";
    /* 50¢ sits at the top and bottom of the ring, where the leg names
       also want to be — so the leg names carry it. */
    ctx.fillStyle = "#2f7a55"; ctx.fillText("UP LEG · 50¢", cx, cy - R - 16);
    ctx.fillStyle = "#8a3641"; ctx.fillText("DOWN LEG · 50¢", cx, cy + R + 18);

    /* ---- volume at each price, as spokes -------------------------- */
    const BINS = 100;
    const upVol = new Float64Array(BINS), downVol = new Float64Array(BINS);
    for (const f of maker.state.fills.items) {
      const i = clamp(Math.round(f.px * (BINS - 1)), 0, BINS - 1);
      (f.leg === "UP" ? upVol : downVol)[i] += f.qty;
    }
    const maxVol = Math.max(1, ...upVol, ...downVol);
    for (let i = 0; i < BINS; i++) {
      for (const [v, angF, col] of [[upVol[i], upAngle, C.green], [downVol[i], downAngle, C.red]]) {
        if (!v) continue;
        const a = angF(i / (BINS - 1));
        const len = 3 + (v / maxVol) * 22;
        const x1 = cx + Math.cos(a) * R, y1 = cy + Math.sin(a) * R;
        const x2 = cx + Math.cos(a) * (R - len), y2 = cy + Math.sin(a) * (R - len);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.1 + 0.45 * (v / maxVol);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    /* ---- the chords ----------------------------------------------- */
    const n = sets.length;
    let sumR = 0, cnt = 0;
    ctx.lineCap = "round";
    sets.forEach((s, i) => {
      const age = i / Math.max(1, n - 1);
      const a1 = upAngle(s.upPx), a2 = downAngle(s.downPx);
      const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
      const x2 = cx + Math.cos(a2) * R, y2 = cy + Math.sin(a2) * R;

      /* Bend each chord toward the centre by exactly as much as the
         geometry of its own cost allows — a true chord for a dollar
         set, held off the middle for a cheap one. */
      const off = Math.abs(Math.cos((Math.PI * s.cost) / 2));
      sumR += off; cnt++;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const pull = 0.82;
      ctx.strokeStyle = costColor(s.cost);
      ctx.globalAlpha = 0.06 + 0.5 * age * age;
      ctx.lineWidth = clamp(Math.sqrt(s.qty) / 11, 0.4, 2.4);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx + (mx - cx) * (1 - pull), cy + (my - cy) * (1 - pull), x2, y2);
      ctx.stroke();

      /* the endpoints, brighter for the fresh ones */
      ctx.globalAlpha = 0.1 + 0.75 * age * age;
      ctx.fillStyle = C.green;
      ctx.beginPath(); ctx.arc(x1, y1, clamp(Math.sqrt(s.qty) / 10, 0.8, 3), 0, 6.2832); ctx.fill();
      ctx.fillStyle = C.red;
      ctx.beginPath(); ctx.arc(x2, y2, clamp(Math.sqrt(s.qty) / 10, 0.8, 3), 0, 6.2832); ctx.fill();
    });
    ctx.globalAlpha = 1;

    /* ---- the edge, as the hole in the middle ---------------------- */
    if (cnt) {
      const rEdge = (sumR / cnt) * R * 0.9;
      ctx.strokeStyle = C.amber; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(rEdge, 1.5), 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    /* ---- what we are quoting right now ---------------------------- */
    if (q && q.upBid) {
      const a1 = upAngle(q.upBid), a2 = downAngle(q.downBid);
      const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
      const x2 = cx + Math.cos(a2) * R, y2 = cy + Math.sin(a2) * R;
      const alive = q.quoting;
      ctx.strokeStyle = alive ? C.amber : C.dim;
      ctx.globalAlpha = alive ? 0.35 + 0.45 * pulse : 0.25;
      ctx.lineWidth = 1.4;
      ctx.setLineDash(alive ? [] : [3, 3]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx + (mx - cx) * 0.18, cy + (my - cy) * 0.18, x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y, col] of [[x1, y1, C.green], [x2, y2, C.red]]) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, 3.2 + 1.8 * pulse * (alive ? 1 : 0), 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ---- the middle ------------------------------------------------ */
    const st = maker.stats();
    const plate = ctx.createRadialGradient(cx, cy + 6, 4, cx, cy + 6, 70);
    plate.addColorStop(0, "rgba(6,9,14,.93)");
    plate.addColorStop(0.62, "rgba(6,9,14,.82)");
    plate.addColorStop(1, "rgba(6,9,14,0)");
    ctx.fillStyle = plate;
    ctx.beginPath(); ctx.arc(cx, cy + 6, 70, 0, 6.2832); ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = C.amber;
    ctx.font = "500 15px 'JetBrains Mono', monospace";
    ctx.fillText("$" + (q ? q.pairCost.toFixed(4).slice(1) : "—"), cx, cy - 8);
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillStyle = C.dim;
    ctx.fillText("QUOTED SET", cx, cy + 6);
    ctx.fillStyle = q && q.edge > 0 ? C.green : C.red;
    ctx.fillText((q ? (q.edge >= 0 ? "+" : "") + (q.edge * 100).toFixed(2) : "—") + "¢ EDGE", cx, cy + 19);
    ctx.fillStyle = C.dimmer;
    ctx.fillText(sets.length + " SETS DRAWN · " + Math.round(st.openSets) + " OPEN", cx, cy + 34);
    ctx.textAlign = "left";
  }

  MK.shell = { draw, upAngle, downAngle };
})(window.MK);
