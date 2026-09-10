/* ================================================
   PRICE WATCH — chart.js
   Inline SVG price charts. No libraries.

   One series per chart (the price), so there is no legend — the card title
   names it. Grid and axes are hairline-recessive; only two points get a
   direct label (the cheapest reading and the latest). Colours come from
   CSS custom properties so light and dark are each chosen, not flipped.
   ================================================ */
(function (PT) {
  "use strict";
  const { esc, fmtMoney, fmtDate, fmtDateTime } = PT.util;

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ---- scales ---- */
  const scaleLinear = (d0, d1, r0, r1) => (v) =>
    d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

  function niceTicks(min, max, count) {
    const span = (max - min) || Math.abs(max) || 1;
    const step0 = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
      out.push(Math.round(v * 1e6) / 1e6);
    }
    return out;
  }

  /* ================================================================
     SPARKLINE — the thumbnail on each card.
     preserveAspectRatio="none" + non-scaling-stroke lets it stretch to
     any card width while the stroke stays a true 2px.
     ================================================================ */
  function sparkline(history, opts) {
    opts = opts || {};
    const W = 200, H = 44, pad = 4;
    const pts = history || [];
    if (pts.length < 2) {
      return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
                   role="img" aria-label="Not enough readings to chart yet"></svg>`;
    }
    const values = pts.map((p) => p.p);
    const lo = Math.min(...values), hi = Math.max(...values);
    const x = scaleLinear(pts[0].t, pts[pts.length - 1].t, pad, W - pad);
    const y = scaleLinear(lo, hi, H - pad, pad);

    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)},${y(p.p).toFixed(2)}`).join(" ");
    const area = `${d} L${x(pts[pts.length - 1].t).toFixed(2)},${H} L${x(pts[0].t).toFixed(2)},${H} Z`;

    const last = pts[pts.length - 1];
    const minPt = pts[values.indexOf(lo)];

    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
                 role="img" aria-label="Price trend, ${pts.length} readings">
      <path d="${area}" class="spark-area" />
      <path d="${d}" class="spark-line" vector-effect="non-scaling-stroke" />
      <circle cx="${x(minPt.t).toFixed(2)}" cy="${y(minPt.p).toFixed(2)}" r="3" class="spark-min" />
      <circle cx="${x(last.t).toFixed(2)}" cy="${y(last.p).toFixed(2)}" r="3.5" class="spark-last" />
    </svg>`;
  }

  /* ================================================================
     DETAIL CHART — rendered at true pixel size into a container, with a
     crosshair + tooltip on hover and touch.
     ================================================================ */
  function detail(container, watch, opts) {
    opts = opts || {};
    const history = (watch.history || []).slice();
    container.innerHTML = "";

    if (history.length < 2) {
      container.innerHTML =
        `<p class="chart-empty">Two readings are needed before there's a line to draw.
         ${watch.provider === "manual" ? "Log another price." : "The next check will add one."}</p>`;
      return () => {};
    }

    const W = Math.max(280, container.clientWidth || 640);
    const H = opts.height || 260;
    const P = { t: 18, r: 18, b: 28, l: 58 };
    const plotW = W - P.l - P.r;
    const plotH = H - P.t - P.b;

    const values = history.map((p) => p.p);
    let lo = Math.min(...values), hi = Math.max(...values);

    // Make room for the target line if it sits outside the observed range.
    const targetRule = (watch.rules || []).find(
      (r) => (r.type === "below" || r.type === "above") && Number.isFinite(Number(r.value))
    );
    const target = targetRule ? Number(targetRule.value) : null;
    if (target != null) { lo = Math.min(lo, target); hi = Math.max(hi, target); }

    const padY = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
    const yMin = lo - padY, yMax = hi + padY;

    const x = scaleLinear(history[0].t, history[history.length - 1].t, P.l, P.l + plotW);
    const y = scaleLinear(yMin, yMax, P.t + plotH, P.t);

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "detail-chart");
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Price history for ${watch.label}: ${history.length} readings, ` +
      `low ${fmtMoney(Math.min(...values), watch.currency)}, high ${fmtMoney(Math.max(...values), watch.currency)}.`
    );

    const add = (tag, attrs, text) => {
      const e = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    };

    // --- y grid (hairline, recessive) + labels
    niceTicks(yMin, yMax, 4).forEach((v) => {
      const yy = y(v);
      add("line", { x1: P.l, x2: P.l + plotW, y1: yy, y2: yy, class: "grid" });
      add("text", { x: P.l - 8, y: yy + 4, class: "axis-label", "text-anchor": "end" },
        fmtMoney(v, watch.currency));
    });

    // --- x labels: first, last and two in between
    const nX = Math.min(4, history.length);
    for (let i = 0; i < nX; i++) {
      const pt = history[Math.round((i / (nX - 1)) * (history.length - 1))];
      add("text", {
        x: x(pt.t), y: H - 8, class: "axis-label",
        "text-anchor": i === 0 ? "start" : i === nX - 1 ? "end" : "middle",
      }, fmtDate(pt.t));
    }

    // --- baseline
    add("line", { x1: P.l, x2: P.l + plotW, y1: P.t + plotH, y2: P.t + plotH, class: "axis" });

    // --- target reference line
    if (target != null) {
      add("line", {
        x1: P.l, x2: P.l + plotW, y1: y(target), y2: y(target), class: "target-line",
      });
      // Anchored left: the right edge belongs to the latest-price label.
      add("text", {
        x: P.l + 6, y: y(target) - 6, class: "target-label", "text-anchor": "start",
      }, `target ${fmtMoney(target, watch.currency)}`);
    }

    // --- the series
    const dLine = history
      .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)},${y(p.p).toFixed(2)}`)
      .join(" ");
    add("path", {
      d: `${dLine} L${x(history[history.length - 1].t).toFixed(2)},${P.t + plotH} L${x(history[0].t).toFixed(2)},${P.t + plotH} Z`,
      class: "series-area",
    });
    add("path", { d: dLine, class: "series-line" });

    // --- selective direct labels: the cheapest reading and the latest one
    const minIdx = values.indexOf(Math.min(...values));
    const minPt = history[minIdx];
    add("circle", { cx: x(minPt.t), cy: y(minPt.p), r: 5, class: "pt-min" });
    add("text", {
      x: x(minPt.t), y: y(minPt.p) + 20, class: "pt-label pt-label-min",
      "text-anchor": minIdx === 0 ? "start" : minIdx === history.length - 1 ? "end" : "middle",
    }, `low ${fmtMoney(minPt.p, watch.currency)}`);

    const lastPt = history[history.length - 1];
    if (lastPt !== minPt) {
      add("circle", { cx: x(lastPt.t), cy: y(lastPt.p), r: 5, class: "pt-last" });
      add("text", {
        x: x(lastPt.t) - 8, y: y(lastPt.p) - 10, class: "pt-label", "text-anchor": "end",
      }, fmtMoney(lastPt.p, watch.currency));
    }

    // --- hover layer
    const cross = add("line", {
      x1: 0, x2: 0, y1: P.t, y2: P.t + plotH, class: "crosshair", opacity: 0,
    });
    const dot = add("circle", { cx: 0, cy: 0, r: 5, class: "hover-dot", opacity: 0 });

    container.appendChild(svg);

    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;
    container.appendChild(tip);

    function nearest(clientX) {
      const rect = svg.getBoundingClientRect();
      const px = clientX - rect.left;
      let best = 0, bestD = Infinity;
      history.forEach((p, i) => {
        const d = Math.abs(x(p.t) - px);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }

    function show(clientX) {
      const i = nearest(clientX);
      const p = history[i];
      const px = x(p.t), py = y(p.p);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px);
      cross.setAttribute("opacity", 1);
      dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      dot.setAttribute("opacity", 1);

      const prev = i > 0 ? history[i - 1].p : null;
      const delta = prev != null ? p.p - prev : null;
      tip.hidden = false;
      tip.innerHTML =
        `<strong>${esc(fmtMoney(p.p, watch.currency))}</strong>` +
        (delta != null
          ? ` <span class="${delta < 0 ? "d-down" : delta > 0 ? "d-up" : ""}">${delta > 0 ? "+" : ""}${delta.toFixed(2)}</span>`
          : "") +
        `<br><span class="tip-time">${esc(fmtDateTime(p.t))}</span>` +
        (p.meta && p.meta.simulated ? `<br><span class="tip-time">simulated</span>` : "");

      const tw = tip.offsetWidth || 120;
      tip.style.left = Math.max(0, Math.min(W - tw, px - tw / 2)) + "px";
      tip.style.top = Math.max(0, py - 56) + "px";
    }

    function hide() {
      cross.setAttribute("opacity", 0);
      dot.setAttribute("opacity", 0);
      tip.hidden = true;
    }

    const onMove = (e) => show(e.clientX);
    const onTouch = (e) => { if (e.touches[0]) show(e.touches[0].clientX); };
    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("mouseleave", hide);
    svg.addEventListener("touchstart", onTouch, { passive: true });
    svg.addEventListener("touchmove", onTouch, { passive: true });
    svg.addEventListener("touchend", hide);

    return function destroy() {
      svg.removeEventListener("mousemove", onMove);
      svg.removeEventListener("mouseleave", hide);
      svg.removeEventListener("touchstart", onTouch);
      svg.removeEventListener("touchmove", onTouch);
      svg.removeEventListener("touchend", hide);
    };
  }

  /* The same numbers as a table — the accessible route to the data, and
     genuinely handier when you want to read exact figures. */
  function table(watch, limit) {
    const h = (watch.history || []).slice(-(limit || 40)).reverse();
    if (!h.length) return `<p class="muted">No readings yet.</p>`;
    const rows = h.map((p, i) => {
      const prev = h[i + 1];
      const d = prev ? p.p - prev.p : null;
      const cls = d == null ? "" : d < 0 ? "d-down" : d > 0 ? "d-up" : "";
      return `<tr>
        <td>${esc(fmtDateTime(p.t))}</td>
        <td class="num">${esc(fmtMoney(p.p, watch.currency))}</td>
        <td class="num ${cls}">${d == null ? "—" : (d > 0 ? "+" : "") + d.toFixed(2)}</td>
      </tr>`;
    }).join("");
    return `<table class="history-table">
      <caption class="sr-only">Recorded prices for ${esc(watch.label)}</caption>
      <thead><tr><th>When</th><th class="num">Price</th><th class="num">Change</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  PT.chart = { sparkline, detail, table, niceTicks };
})(window.PT);
