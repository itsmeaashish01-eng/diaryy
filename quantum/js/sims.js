/* ================================================
   QUANTUM LADDER — sims.js
   The interactive simulations. Each one is mounted into a container:

     const sim = QSims.mount("wavepacket", el, { preset: "barrier" });
     sim.destroy();

   They draw on canvas with colours read from the page's CSS tokens, so
   they follow the light/dark theme. Wavefunctions are drawn with their
   phase as hue: the colour of the filled |ψ|² curve is arg ψ.
   ================================================ */
(function (root) {
  "use strict";
  const P = root.QPhys;
  const TAU = 2 * Math.PI;
  const reduceMotion = () => root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- theme ------------------------------------------------------- */
  function theme() {
    const cs = getComputedStyle(document.documentElement);
    const get = (n) => cs.getPropertyValue(n).trim();
    return {
      ink: get("--ink"), muted: get("--ink-2"), faint: get("--ink-3"), grid: get("--rule"),
      paper: get("--paper"), panel: get("--panel"), accent: get("--accent"), accent2: get("--accent-2"),
      pot: get("--pot"), good: get("--good"), bad: get("--bad"),
      phaseL: parseFloat(get("--phase-l")) || 50, phaseS: parseFloat(get("--phase-s")) || 70,
      heat: [get("--heat-0"), get("--heat-1"), get("--heat-2"), get("--heat-3")],
      mono: get("--font-mono") || "monospace", sans: get("--font-body") || "sans-serif",
    };
  }
  const phaseColor = (T, re, im, alpha = 1) => {
    const hue = ((Math.atan2(im, re) / TAU) * 360 + 360) % 360;
    return `hsla(${hue.toFixed(0)},${T.phaseS}%,${T.phaseL}%,${alpha})`;
  };
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }

  /* ---- UI scaffolding ---------------------------------------------- */
  let uid = 0;
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  }

  function scaffold(container, name, caption) {
    container.innerHTML = "";
    const wrap = el("div", { class: "sim" });
    const head = el("div", { class: "sim-head" },
      el("span", { class: "sim-tag", text: "Simulation" }),
      el("span", { class: "sim-name", text: name }));
    const stage = el("div", { class: "sim-stage" });
    const controls = el("div", { class: "sim-controls" });
    const readout = el("div", { class: "sim-readout" });
    wrap.append(head, stage, controls, readout);
    if (caption) wrap.append(el("p", { class: "sim-caption", text: caption }));
    container.append(wrap);
    return { wrap, stage, controls, readout };
  }

  function slider(parent, { label, min, max, step, value, fmt = (v) => v }, onInput) {
    const id = `sim-${++uid}`;
    const out = el("output", { for: id, text: fmt(value) });
    const input = el("input", { id, type: "range", min, max, step, value });
    input.addEventListener("input", () => { out.textContent = fmt(+input.value); onInput(+input.value); });
    parent.append(el("label", { class: "ctl", for: id }, el("span", { class: "ctl-label" }, label, " ", out), input));
    return {
      input,
      set(v) { input.value = v; out.textContent = fmt(+input.value); },
      range(lo, hi, st) { input.min = lo; input.max = hi; if (st) input.step = st; },
    };
  }

  function select(parent, { label, options, value }, onChange) {
    const id = `sim-${++uid}`;
    const s = el("select", { id });
    for (const [v, l] of options) s.append(el("option", { value: v, text: l }));
    if (value != null) s.value = value;
    s.addEventListener("change", () => onChange(s.value));
    parent.append(el("label", { class: "ctl", for: id }, el("span", { class: "ctl-label", text: label }), s));
    return s;
  }

  function button(parent, label, onClick, cls = "") {
    const b = el("button", { type: "button", class: `btn ${cls}`.trim(), text: label, onclick: onClick });
    parent.append(b);
    return b;
  }

  function toggle(parent, label, value, onChange) {
    const id = `sim-${++uid}`;
    const c = el("input", { id, type: "checkbox" });
    c.checked = !!value;
    c.addEventListener("change", () => onChange(c.checked));
    parent.append(el("label", { class: "ctl ctl-check", for: id }, c, el("span", { text: label })));
    return c;
  }

  function stat(parent, label) {
    const v = el("b", { text: "–" });
    parent.append(el("div", { class: "stat" }, el("span", { text: label }), v));
    return (text) => { v.textContent = text; };
  }

  // A canvas that keeps itself sharp and sized to its box.
  function canvas(stage, aspect, draw) {
    const cv = el("canvas", { role: "img" });
    stage.append(cv);
    const ctx = cv.getContext("2d");
    const size = { w: 0, h: 0 };
    let ready = false; // the caller's `const cvs = canvas(…)` isn't bound until we return
    function fit() {
      const w = stage.clientWidth || 600;
      const h = Math.round(w / (typeof aspect === "function" ? aspect(w) : aspect));
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size.w = w; size.h = h;
      if (ready) draw();
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(stage);
    fit();
    ready = true;
    return { cv, ctx, size, fit, dispose: () => ro && ro.disconnect() };
  }

  function loop(tick) {
    let raf = 0, running = false;
    const frame = () => { if (!running) return; tick(); raf = requestAnimationFrame(frame); };
    return {
      get running() { return running; },
      start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
      stop() { running = false; cancelAnimationFrame(raf); },
    };
  }

  // Watch the theme so canvases repaint when it flips.
  const themeListeners = new Set();
  if (root.matchMedia) root.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => themeListeners.forEach((f) => f()));
  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined")
    new MutationObserver(() => themeListeners.forEach((f) => f())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  function onTheme(f) { themeListeners.add(f); return () => themeListeners.delete(f); }

  function axes(ctx, T, box, { xLabel, yLabel } = {}) {
    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.h + 0.5); ctx.lineTo(box.x + box.w, box.y + box.h + 0.5);
    ctx.stroke();
    ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`;
    if (xLabel) { ctx.textAlign = "right"; ctx.fillText(xLabel, box.x + box.w, box.y + box.h + 14); }
    if (yLabel) { ctx.textAlign = "left"; ctx.fillText(yLabel, box.x, box.y + 10); }
  }

  // Filled |ψ|² with phase hue, one thin strip per sample.
  function drawDensity(ctx, T, xs, re, im, sx, sy, base) {
    const n = xs.length;
    for (let i = 0; i < n - 1; i++) {
      const r = re[i], m = im[i], d = r * r + m * m;
      const x0 = sx(xs[i]), x1 = sx(xs[i + 1]);
      if (x1 < 0) continue;
      const y = sy(d);
      ctx.fillStyle = phaseColor(T, r, m, 0.9);
      ctx.fillRect(x0, y, Math.max(1, x1 - x0 + 0.6), base - y);
    }
    ctx.strokeStyle = T.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = re[i] * re[i] + im[i] * im[i];
      const X = sx(xs[i]), Y = sy(d);
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
  }

  function phaseLegend(ctx, T, x, y) {
    const w = 64, h = 7;
    for (let i = 0; i < w; i++) {
      const a = (i / w) * TAU - Math.PI;
      ctx.fillStyle = phaseColor(T, Math.cos(a), Math.sin(a));
      ctx.fillRect(x + i, y, 1.2, h);
    }
    ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = "left";
    ctx.fillText("−π", x, y + h + 10);
    ctx.textAlign = "right"; ctx.fillText("π", x + w, y + h + 10);
    ctx.textAlign = "center"; ctx.fillText("arg ψ", x + w / 2, y - 3);
  }

  const f2 = (v, d = 2) => (Math.abs(v) < 5e-4 && d <= 3 ? "0" : v.toFixed(d));

  /* =================================================================
     1. PHASOR — two amplitudes adding
     ================================================================= */
  function phasor(container) {
    const ui = scaffold(container, "Adding two amplitudes",
      "Arrows are complex amplitudes. The dashed arrow is their sum; its squared length is the probability. The right panel shows P for every relative phase.");
    let a1 = 0.6, a2 = 0.5, rel = Math.PI / 3, glob = 0;
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 1.05 : 2.1), draw);
    const run = loop(() => { glob = (glob + 0.02) % TAU; draw(); });
    slider(ui.controls, { label: "|ψ₁|", min: 0, max: 1, step: 0.01, value: a1, fmt: (v) => v.toFixed(2) }, (v) => { a1 = v; draw(); });
    slider(ui.controls, { label: "|ψ₂|", min: 0, max: 1, step: 0.01, value: a2, fmt: (v) => v.toFixed(2) }, (v) => { a2 = v; draw(); });
    slider(ui.controls, { label: "Relative phase", min: 0, max: 360, step: 1, value: 60, fmt: (v) => `${v}°` }, (v) => { rel = (v * Math.PI) / 180; draw(); });
    const b = button(ui.controls, "Spin global phase", () => { run.running ? run.stop() : run.start(); b.textContent = run.running ? "Stop spinning" : "Spin global phase"; });
    const sP = stat(ui.readout, "P = |ψ₁+ψ₂|²"), sC = stat(ui.readout, "Classical |ψ₁|²+|ψ₂|²"), sI = stat(ui.readout, "Interference term");

    function draw() {
      const T = theme(), { ctx, size } = cvs, { w, h } = size;
      ctx.clearRect(0, 0, w, h);
      const stacked = w < 520;
      const side = stacked ? Math.min(w, h * 0.55) : Math.min(w / 2, h);
      const cx = stacked ? w / 2 : side / 2, cy = stacked ? side / 2 : h / 2;
      const R = side * 0.4;
      // plane
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - R * 1.15, cy); ctx.lineTo(cx + R * 1.15, cy); ctx.moveTo(cx, cy - R * 1.15); ctx.lineTo(cx, cy + R * 1.15); ctx.stroke();
      ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`; ctx.textAlign = "left";
      ctx.fillText("Re", cx + R * 1.15 - 14, cy - 5); ctx.fillText("Im", cx + 5, cy - R * 1.15 + 10);
      const z1 = [a1 * Math.cos(glob), a1 * Math.sin(glob)];
      const z2 = [a2 * Math.cos(glob + rel), a2 * Math.sin(glob + rel)];
      const s = [z1[0] + z2[0], z1[1] + z2[1]];
      const scale = 1 / Math.max(1, a1 + a2);
      const px = (v) => cx + v * R * scale, py = (v) => cy - v * R * scale;
      arrow(ctx, px(0), py(0), px(z1[0]), py(z1[1]), T.accent, 2.5);
      arrow(ctx, px(z1[0]), py(z1[1]), px(s[0]), py(s[1]), T.accent2, 2.5);
      ctx.setLineDash([5, 4]);
      arrow(ctx, px(0), py(0), px(s[0]), py(s[1]), T.ink, 1.5);
      ctx.setLineDash([]);
      ctx.fillStyle = T.accent; ctx.fillText("ψ₁", px(z1[0] / 2) + 6, py(z1[1] / 2) - 6);
      ctx.fillStyle = T.accent2; ctx.fillText("ψ₂", px(z1[0] + z2[0] / 2) + 6, py(z1[1] + z2[1] / 2) - 6);

      // P(Δθ) graph
      const gx = stacked ? 36 : side + 36, gy = stacked ? side + 14 : 24;
      const gw = (stacked ? w : w - side) - 56, gh = (stacked ? h - side : h) - 52;
      const Pmax = (a1 + a2) ** 2 || 1;
      const box = { x: gx, y: gy, w: gw, h: gh };
      axes(ctx, T, box, { xLabel: "relative phase  0 → 2π", yLabel: "P" });
      const cl = a1 * a1 + a2 * a2;
      ctx.strokeStyle = T.faint; ctx.setLineDash([3, 3]); ctx.beginPath();
      ctx.moveTo(gx, gy + gh - (cl / Pmax) * gh); ctx.lineTo(gx + gw, gy + gh - (cl / Pmax) * gh); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const d = (i / 200) * TAU, p = cl + 2 * a1 * a2 * Math.cos(d);
        const xx = gx + (i / 200) * gw, yy = gy + gh - (p / Pmax) * gh;
        i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
      const P0 = s[0] ** 2 + s[1] ** 2;
      ctx.fillStyle = T.ink; ctx.beginPath();
      ctx.arc(gx + (rel / TAU) * gw, gy + gh - (P0 / Pmax) * gh, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = "right";
      ctx.fillText("no interference", gx + gw, gy + gh - (cl / Pmax) * gh - 4);
      sP(P0.toFixed(3)); sC(cl.toFixed(3)); sI((P0 - cl >= 0 ? "+" : "") + (P0 - cl).toFixed(3));
    }
    const off = onTheme(draw);
    return { destroy() { run.stop(); cvs.dispose(); off(); } };
  }

  function arrow(ctx, x0, y0, x1, y1, color, lw) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (L < 4) return;
    const hl = Math.min(10, L / 3);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hl * Math.cos(a - 0.4), y1 - hl * Math.sin(a - 0.4));
    ctx.lineTo(x1 - hl * Math.cos(a + 0.4), y1 - hl * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }

  /* =================================================================
     2. UNCERTAINTY — a packet and its momentum distribution
     ================================================================= */
  function uncertainty(container) {
    const ui = scaffold(container, "Position vs momentum",
      "Top: ψ(x), height |ψ|², hue = phase. Bottom: the momentum distribution |φ(p)|², computed by Fourier transform (ħ = 1).");
    let shape = "gauss", sigma = 1, k0 = 2;
    const x = P.linspace(-12, 12, 480);
    let re, im, mom, stats;
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 1.1 : 2), draw);
    select(ui.controls, { label: "State", options: [["gauss", "Gaussian"], ["square", "Square pulse"], ["two", "Two peaks"], ["sech", "Sech (soliton)"]], value: shape }, (v) => { shape = v; compute(); });
    slider(ui.controls, { label: "Width σ", min: 0.3, max: 3, step: 0.05, value: sigma, fmt: (v) => v.toFixed(2) }, (v) => { sigma = v; compute(); });
    slider(ui.controls, { label: "Mean momentum k₀", min: -4, max: 4, step: 0.1, value: k0, fmt: (v) => v.toFixed(1) }, (v) => { k0 = v; compute(); });
    const sx = stat(ui.readout, "Δx"), sp = stat(ui.readout, "Δp"), spp = stat(ui.readout, "Δx·Δp  (≥ 0.5)");

    function compute() {
      re = new Float64Array(x.length); im = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) {
        const X = x[i];
        let a;
        if (shape === "gauss") a = Math.exp(-(X * X) / (4 * sigma * sigma));
        else if (shape === "square") { const half = sigma * Math.sqrt(3); a = 0.5 * (Math.tanh((X + half) / 0.08) - Math.tanh((X - half) / 0.08)); }
        else if (shape === "two") { const s = sigma * 0.5, d = sigma * 2.2; a = Math.exp(-((X - d) ** 2) / (4 * s * s)) + Math.exp(-((X + d) ** 2) / (4 * s * s)); }
        else a = 1 / Math.cosh(X / sigma);
        re[i] = a * Math.cos(k0 * X); im[i] = a * Math.sin(k0 * X);
      }
      P.normalize(x, re, im);
      const wide = P.momentumDistribution(x, re, im, k0 - 30, k0 + 30, 600);
      const dp = P.spread(wide.p, wide.prob);
      const rho = re.map((r, i) => r * r + im[i] * im[i]);
      const dx = P.spread(x, rho);
      mom = P.momentumDistribution(x, re, im, -10, 10, 320);
      stats = { dx: dx.sd, dp: dp.sd, mx: dx.mean };
      draw();
    }

    function draw() {
      if (!re) return;
      const T = theme(), { ctx, size } = cvs, { w, h } = size;
      ctx.clearRect(0, 0, w, h);
      const pad = 14, top = { x: pad, y: 18, w: w - 2 * pad, h: h * 0.5 - 34 };
      const bot = { x: pad, y: h * 0.5 + 14, w: w - 2 * pad, h: h * 0.5 - 34 };
      const rhoMax = Math.max(...re.map((r, i) => r * r + im[i] * im[i])) * 1.1;
      const sX = (v) => top.x + ((v + 12) / 24) * top.w;
      const sY = (d) => top.y + top.h - (d / rhoMax) * top.h;
      axes(ctx, T, top, { xLabel: "x", yLabel: "|ψ(x)|²" });
      drawDensity(ctx, T, x, re, im, sX, sY, top.y + top.h);
      phaseLegend(ctx, T, w - pad - 70, top.y + 6);
      // ±Δx bracket
      bracket(ctx, T, sX(stats.mx), stats.dx * (top.w / 24), top.y + top.h + 4);

      axes(ctx, T, bot, { xLabel: "p", yLabel: "|φ(p)|²" });
      const pm = Math.max(...mom.prob) * 1.1;
      const pX = (v) => bot.x + ((v + 10) / 20) * bot.w, pY = (v) => bot.y + bot.h - (v / pm) * bot.h;
      ctx.fillStyle = T.accent2; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(pX(-10), pY(0));
      for (let j = 0; j < mom.p.length; j++) ctx.lineTo(pX(mom.p[j]), pY(mom.prob[j]));
      ctx.lineTo(pX(10), pY(0)); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = T.accent2; ctx.lineWidth = 2; ctx.beginPath();
      for (let j = 0; j < mom.p.length; j++) { const X = pX(mom.p[j]), Y = pY(mom.prob[j]); j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke();
      ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = "center";
      for (let t = -10; t <= 10; t += 5) ctx.fillText(String(t), pX(t), bot.y + bot.h + 12);
      for (let t = -10; t <= 10; t += 5) ctx.fillText(String(t), sX(t), top.y + top.h + 22);
      sx(stats.dx.toFixed(3)); sp(stats.dp.toFixed(3));
      const prod = stats.dx * stats.dp;
      spp(`${prod.toFixed(3)}${prod < 0.52 ? "  · minimum" : ""}`);
    }

    // ±Δx marked under the axis
    function bracket(ctx, T, cx, half, y) {
      ctx.strokeStyle = T.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - half, y - 3); ctx.lineTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.lineTo(cx + half, y - 3); ctx.stroke();
    }

    compute();
    const off = onTheme(draw);
    return { destroy() { cvs.dispose(); off(); } };
  }

  /* =================================================================
     3. DOUBLE SLIT — building fringes one particle at a time
     ================================================================= */
  function wavelengthColor(nm) {
    // Approximate visible spectrum → CSS colour
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = (440 - nm) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
    else r = 1;
    return `rgb(${Math.round(255 * r)},${Math.round(255 * g)},${Math.round(255 * b)})`;
  }

  function doubleslit(container) {
    const ui = scaffold(container, "Double slit",
      "Each dot is one photon. Fringes appear only statistically. Switch on the which-path detector and they vanish.");
    let lambda = 550, d = 6, a = 1.5, which = false, rate = 20;
    const bins = 160, range = 0.25; // sinθ ∈ [−range, range]
    let hits = [], hist = new Float64Array(bins), total = 0;
    const rand = Math.random;
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 1.2 : 2.2), draw);
    const run = loop(() => { fire(rate); draw(); });
    slider(ui.controls, { label: "Wavelength", min: 400, max: 700, step: 5, value: lambda, fmt: (v) => `${v} nm` }, (v) => { lambda = v; clear(); });
    slider(ui.controls, { label: "Slit separation d", min: 2, max: 20, step: 0.5, value: d, fmt: (v) => `${v} µm` }, (v) => { d = v; clear(); });
    slider(ui.controls, { label: "Slit width a", min: 0.5, max: 4, step: 0.1, value: a, fmt: (v) => `${v.toFixed(1)} µm` }, (v) => { a = v; clear(); });
    slider(ui.controls, { label: "Photons per frame", min: 1, max: 200, step: 1, value: rate }, (v) => { rate = v; });
    toggle(ui.controls, "Which-path detector", which, (v) => { which = v; clear(); });
    const playBtn = button(ui.controls, "Pause", () => { run.running ? run.stop() : run.start(); playBtn.textContent = run.running ? "Pause" : "Run"; });
    button(ui.controls, "Fire one", () => { fire(1); draw(); });
    button(ui.controls, "Clear", () => clear());
    const sN = stat(ui.readout, "Photons detected"), sF = stat(ui.readout, "Fringe spacing Δ(sinθ) = λ/d");

    const I = (s) => P.slitIntensity(s, lambda * 1e-3, d, a, which);
    function fire(n) {
      for (let k = 0; k < n; k++) {
        for (let tries = 0; tries < 200; tries++) {
          const s = (rand() * 2 - 1) * range;
          if (rand() < I(s)) {
            hits.push([s, rand()]);
            if (hits.length > 6000) hits.shift();
            const bi = Math.floor(((s + range) / (2 * range)) * bins);
            hist[Math.min(bins - 1, bi)]++;
            total++;
            break;
          }
        }
      }
    }
    function clear() { hits = []; hist = new Float64Array(bins); total = 0; draw(); }

    function draw() {
      const T = theme(), { ctx, size } = cvs, { w, h } = size;
      ctx.clearRect(0, 0, w, h);
      const col = wavelengthColor(lambda);
      const narrow = w < 520;
      const sch = narrow ? 0 : w * 0.22; // schematic width
      // schematic: source, slits, rays
      if (!narrow) {
        const my = h / 2;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(18, my, 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = T.ink; ctx.lineWidth = 3;
        const wx = sch * 0.6, gap = Math.min(h * 0.3, 8 + d * 4), sw = 3 + a * 2;
        ctx.beginPath();
        ctx.moveTo(wx, 10); ctx.lineTo(wx, my - gap / 2 - sw / 2);
        ctx.moveTo(wx, my - gap / 2 + sw / 2); ctx.lineTo(wx, my + gap / 2 - sw / 2);
        ctx.moveTo(wx, my + gap / 2 + sw / 2); ctx.lineTo(wx, h - 10);
        ctx.stroke();
        ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
        for (let r = 12; r < wx - 20; r += 10) { ctx.beginPath(); ctx.arc(18, my, r, -0.5, 0.5); ctx.stroke(); }
        for (const yy of [my - gap / 2, my + gap / 2]) for (let r = 8; r < sch * 0.4; r += 10) { ctx.beginPath(); ctx.arc(wx, yy, r, -1, 1); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (which) { ctx.fillStyle = T.bad; ctx.font = `11px ${T.mono}`; ctx.textAlign = "center"; ctx.fillText("detector on", wx, h - 2); }
      }
      // screen with hits (vertical: sinθ along y)
      const sx0 = sch + 8, scrW = narrow ? w * 0.42 : w * 0.3;
      ctx.fillStyle = T.panel; ctx.fillRect(sx0, 8, scrW, h - 16);
      ctx.fillStyle = col;
      const Y = (s) => 8 + ((s + range) / (2 * range)) * (h - 16);
      for (const [s, u] of hits) ctx.fillRect(sx0 + u * (scrW - 2), Y(s), 1.6, 1.6);
      // histogram + theory
      const hx = sx0 + scrW + 14, hw = w - hx - 10;
      const maxH = Math.max(1, ...hist);
      ctx.fillStyle = T.faint;
      for (let i = 0; i < bins; i++) {
        const y0 = 8 + (i / bins) * (h - 16), bh = (h - 16) / bins;
        ctx.fillRect(hx, y0, (hist[i] / maxH) * hw * 0.95, Math.max(1, bh - 0.3));
      }
      // theory scaled to histogram area
      let thMax = 0; const samples = 400, th = [];
      for (let i = 0; i <= samples; i++) { const s = -range + (2 * range * i) / samples; const v = I(s); th.push([s, v]); thMax = Math.max(thMax, v); }
      let binMean = 0; for (let i = 0; i < bins; i++) { const s = -range + (2 * range * (i + 0.5)) / bins; binMean += I(s); }
      const expectedPerUnit = total / binMean; // hits per unit intensity per bin
      const scaleX = total > 30 ? (expectedPerUnit / maxH) * hw * 0.95 : (hw * 0.95) / thMax;
      ctx.strokeStyle = T.ink; ctx.lineWidth = 1.4; ctx.beginPath();
      th.forEach(([s, v], i) => { const X = hx + v * scaleX, YY = Y(s); i ? ctx.lineTo(X, YY) : ctx.moveTo(X, YY); });
      ctx.stroke();
      ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = "left";
      ctx.fillText("sinθ = +0.25", hx, 18); ctx.fillText("−0.25", hx, h - 12);
      sN(total.toLocaleString()); sF((lambda * 1e-3 / d).toFixed(4));
    }
    fire(400);
    if (!reduceMotion()) run.start(); else playBtn.textContent = "Run";
    const off = onTheme(draw);
    return { destroy() { run.stop(); cvs.dispose(); off(); } };
  }

  /* =================================================================
     4. WAVE PACKET — time-dependent Schrödinger equation
     ================================================================= */
  function wavepacket(container, opts = {}) {
    const ui = scaffold(container, "Wave packet evolution",
      "Crank–Nicolson integration of iħ∂ψ/∂t = Hψ (ħ = m = 1). Fill hue is the phase of ψ; the grey shape is V(x) and the dashed line the packet's mean energy ⟨E⟩.");
    const L = 70, N = 1400;
    const x = P.linspace(-L, L, N), h = x[1] - x[0], dt = 0.01;
    let preset = opts.preset || "barrier", V0 = 2.5, width = 1, k0 = 2, sig = 3, x0 = -22;
    let V, step, re, im, t = 0, absorbed = { l: 0, r: 0 }, E0 = 0;
    const edge = 12, mask = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const d = Math.min(x[i] + L, L - x[i]);
      mask[i] = d < edge ? Math.exp(-0.02 * ((edge - d) / edge) ** 2) : 1;
    }
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 1.2 : 2.3), draw);
    const run = loop(() => { for (let k = 0; k < 6; k++) advance(); draw(); });
    const presetSel = select(ui.controls, { label: "Potential", options: [["free", "Free particle"], ["barrier", "Barrier"], ["step", "Step"], ["well", "Well"], ["harmonic", "Harmonic trap"]], value: preset }, (v) => { preset = v; configure(); reset(); });
    const hS = slider(ui.controls, { label: "Height V₀", min: -4, max: 6, step: 0.1, value: V0, fmt: (v) => v.toFixed(1) }, (v) => { V0 = v; reset(); });
    const wS = slider(ui.controls, { label: "Width", min: 0.2, max: 6, step: 0.1, value: width, fmt: (v) => v.toFixed(1) }, (v) => { width = v; reset(); });
    slider(ui.controls, { label: "Momentum k₀", min: 0.5, max: 3.5, step: 0.05, value: k0, fmt: (v) => v.toFixed(2) }, (v) => { k0 = v; reset(); });
    slider(ui.controls, { label: "Packet width σ", min: 0.8, max: 6, step: 0.1, value: sig, fmt: (v) => v.toFixed(1) }, (v) => { sig = v; reset(); });
    const playBtn = button(ui.controls, "Play", () => { run.running ? run.stop() : run.start(); playBtn.textContent = run.running ? "Pause" : "Play"; }, "primary");
    button(ui.controls, "Reset", () => reset());
    const sT = stat(ui.readout, "Time t"), sE = stat(ui.readout, "⟨E⟩"), sR = stat(ui.readout, "Reflected"), sTr = stat(ui.readout, "Transmitted"), sTh = stat(ui.readout, "Plane-wave T at ⟨E⟩"), sN = stat(ui.readout, "Norm (incl. absorbed)");

    function configure() {
      const on = preset !== "free";
      hS.input.disabled = !on; wS.input.disabled = !on || preset === "step" || preset === "harmonic";
      if (preset === "well" && V0 > 0) { V0 = 2; hS.set(V0); }
      if (preset === "harmonic") { hS.range(0.2, 3, 0.1); if (V0 < 0.2 || V0 > 3) { V0 = 1; hS.set(V0); } }
      else hS.range(preset === "well" ? 0 : -4, 6, 0.1);
    }
    function buildV() {
      if (preset === "free") return new Float64Array(N);
      if (preset === "barrier") return P.potentials.barrier(x, { at: 0, width, height: V0 });
      if (preset === "step") return P.potentials.step(x, { at: 0, height: V0 });
      if (preset === "well") return P.potentials.well(x, { at: 0, width: width * 3, height: Math.abs(V0) });
      // gentle trap: ω chosen so the packet oscillates within view
      const om = 0.05 * V0;
      return x.map((xi) => 0.5 * om * om * xi * xi);
    }
    function reset() {
      V = buildV();
      step = P.makePropagator(x, V, dt);
      ({ re, im } = P.gaussianPacket(x, x0, sig, k0));
      t = 0; absorbed = { l: 0, r: 0 };
      E0 = P.moments(x, V, re, im).E;
      draw();
    }
    function advance() {
      step(re, im);
      // absorbing edges: tally what leaves on each side
      for (let i = 0; i < N; i++) {
        if (mask[i] === 1) continue;
        const before = re[i] * re[i] + im[i] * im[i];
        re[i] *= mask[i]; im[i] *= mask[i];
        const lost = (before - (re[i] * re[i] + im[i] * im[i])) * h;
        if (x[i] < 0) absorbed.l += lost; else absorbed.r += lost;
      }
      t += dt;
    }

    function draw() {
      if (!re) return;
      const T = theme(), { ctx, size } = cvs, { w, h: H } = size;
      ctx.clearRect(0, 0, w, H);
      const view = 55;
      const box = { x: 10, y: 16, w: w - 20, h: H - 40 };
      const sX = (v) => box.x + ((v + view) / (2 * view)) * box.w;
      const peak0 = 1 / (Math.sqrt(2 * Math.PI) * sig);
      const yTop = peak0 * 1.25;
      const Vs = preset === "harmonic" ? 6 : Math.max(3, Math.abs(V0) * 1.4, E0 * 1.6);
      const eY = (e) => box.y + box.h * 0.55 - (e / Vs) * box.h * 0.5;
      // potential
      ctx.fillStyle = T.pot; ctx.beginPath(); ctx.moveTo(sX(-view), eY(0));
      for (let i = 0; i < N; i += 2) if (Math.abs(x[i]) <= view) ctx.lineTo(sX(x[i]), Math.max(box.y, Math.min(box.y + box.h, eY(V[i]))));
      ctx.lineTo(sX(view), eY(0)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = T.faint; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(box.x, eY(0)); ctx.lineTo(box.x + box.w, eY(0)); ctx.stroke();
      // energy line
      ctx.setLineDash([6, 4]); ctx.strokeStyle = T.accent; ctx.beginPath(); ctx.moveTo(box.x, eY(E0)); ctx.lineTo(box.x + box.w, eY(E0)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.accent; ctx.font = `10px ${T.mono}`; ctx.textAlign = "left"; ctx.fillText(`⟨E⟩ = ${E0.toFixed(2)}`, box.x + 4, eY(E0) - 4);
      // density
      const base = box.y + box.h;
      const sY = (d) => base - (d / yTop) * box.h;
      const lo = Math.floor(((-view + L) / (2 * L)) * (N - 1)), hi = Math.ceil(((view + L) / (2 * L)) * (N - 1));
      drawDensity(ctx, T, x.subarray(lo, hi), re.subarray(lo, hi), im.subarray(lo, hi), sX, sY, base);
      phaseLegend(ctx, T, w - 84, 20);
      ctx.fillStyle = T.muted; ctx.textAlign = "center";
      for (let v = -50; v <= 50; v += 25) ctx.fillText(String(v), sX(v), base + 14);

      // readouts
      const mid = N >> 1;
      const splitAt = preset === "barrier" || preset === "step" || preset === "well" ? (preset === "well" ? Math.round((1.5 * width + L) / (2 * L) * (N - 1)) : Math.round((width / 2 + L) / (2 * L) * (N - 1))) : mid;
      const left = P.norm2(x, re, im, 0, splitAt) + absorbed.l;
      const right = P.norm2(x, re, im, splitAt, N) + absorbed.r;
      sT(t.toFixed(1)); sE(E0.toFixed(3));
      sR(`${(left * 100).toFixed(1)}%`); sTr(`${(right * 100).toFixed(1)}%`);
      if (preset === "barrier" && V0 > 0) sTh(`${(P.exact.transmission(E0, V0, width) * 100).toFixed(1)}%`);
      else sTh("–");
      sN((left + right).toFixed(4));
    }
    configure(); reset();
    const off = onTheme(draw);
    return { destroy() { run.stop(); cvs.dispose(); off(); } };
  }

  /* =================================================================
     5. EIGENSTATES — any 1-D potential, plus superposition and PT
     ================================================================= */
  const AIRY = [2.33810741, 4.08794944, 5.52055983, 6.78670809, 7.94413359, 9.02265085];
  const EIGEN_PRESETS = {
    box: { label: "Infinite well", range: [0, 1], param: { label: "Width L", min: 0.5, max: 2, step: 0.05, value: 1 },
      grid: (p) => [0, p], V: (x) => P.potentials.box(x), exact: (n, p) => P.exact.box(n + 1, p) },
    harmonic: { label: "Harmonic oscillator", param: { label: "Frequency ω", min: 0.4, max: 2, step: 0.05, value: 1 },
      grid: () => [-7, 7], V: (x, p) => P.potentials.harmonic(x, { omega: p }), exact: (n, p) => P.exact.harmonic(n, p) },
    finite: { label: "Finite well", param: { label: "Depth V₀", min: 2, max: 30, step: 0.5, value: 10 },
      grid: () => [-4, 4], V: (x, p) => P.potentials.finite(x, { width: 2, depth: p }), exact: null },
    double: { label: "Double well", param: { label: "Barrier height", min: 0, max: 10, step: 0.25, value: 4 },
      grid: () => [-4, 4], V: (x, p) => P.potentials.double(x, { sep: 1.5, height: p }), exact: null },
    linear: { label: "Bouncing ball (V = gx, wall at 0)", param: { label: "Slope g", min: 0.3, max: 3, step: 0.05, value: 1 },
      grid: () => [0, 14], V: (x, p) => P.potentials.linear(x, { slope: p }), exact: (n, p) => AIRY[n] * Math.cbrt((p * p) / 2) },
  };
  const PERTURB = {
    x: { label: "λx (uniform field)", f: (x) => x, lam: [-0.5, 0.5, 0.01] },
    x3: { label: "λx³ (anharmonic)", f: (x) => x * x * x, lam: [-0.05, 0.05, 0.001] },
    x4: { label: "λx⁴ (quartic)", f: (x) => x ** 4, lam: [0, 0.3, 0.005] },
  };

  function eigen(container, opts = {}) {
    const ui = scaffold(container, "Stationary states",
      "Energy levels (horizontal lines) with each eigenfunction ψₙ drawn on its level, computed numerically by finite differences. Tick levels to superpose them and watch the state evolve.");
    let preset = opts.preset || "box";
    let param = EIGEN_PRESETS[preset].param.value;
    let pKind = "x4", lam = opts.perturb ? 0.05 : 0;
    const count = 6;
    let grid, V, V0, states, base0;
    const chosen = new Set(opts.superpose || []);
    let t = 0;
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 0.95 : 1.9), draw);
    const run = loop(() => { t += dtFrame(); draw(); });

    select(ui.controls, { label: "Potential", options: Object.entries(EIGEN_PRESETS).map(([k, v]) => [k, v.label]), value: preset }, (v) => {
      preset = v; const pp = EIGEN_PRESETS[v].param; pS.range(pp.min, pp.max, pp.step); param = pp.value; pS.set(param); compute();
    });
    const pp0 = EIGEN_PRESETS[preset].param;
    const pS = slider(ui.controls, { label: "Parameter", min: pp0.min, max: pp0.max, step: pp0.step, value: param, fmt: (v) => v.toFixed(2) }, (v) => { param = v; compute(); });
    let lamS;
    if (opts.perturb) {
      select(ui.controls, { label: "Perturbation", options: Object.entries(PERTURB).map(([k, v]) => [k, v.label]), value: pKind }, (v) => {
        pKind = v; const [a, b, s] = PERTURB[v].lam; lamS.range(a, b, s); lam = Math.min(b, Math.max(a, 0.5 * (a + b) || s * 10)); lamS.set(lam); compute();
      });
      const [a, b, s] = PERTURB[pKind].lam;
      lamS = slider(ui.controls, { label: "Strength λ", min: a, max: b, step: s, value: lam, fmt: (v) => v.toFixed(3) }, (v) => { lam = v; compute(); });
    }
    const checks = el("div", { class: "level-checks", role: "group", "aria-label": "Superpose levels" });
    ui.controls.append(checks);
    const playBtn = button(ui.controls, "Play", () => { run.running ? run.stop() : run.start(); playBtn.textContent = run.running ? "Pause" : "Play"; }, "primary");
    const table = el("div", { class: "sim-table" });
    ui.readout.replaceWith(table);

    function compute() {
      const def = EIGEN_PRESETS[preset];
      const [a, b] = def.grid(param);
      const all = P.linspace(a, b, 402);
      grid = all.slice(1, 401);
      V0 = def.V(grid, param);
      const pert = opts.perturb && lam ? grid.map((xi) => lam * PERTURB[pKind].f(xi)) : null;
      V = pert ? V0.map((v, i) => v + pert[i]) : V0;
      states = P.eigenstates(grid, V, count);
      base0 = pert ? P.eigenstates(grid, V0, count) : null;
      renderChecks(); renderTable(pert);
      draw();
    }
    function renderChecks() {
      checks.innerHTML = "";
      checks.append(el("span", { class: "ctl-label", text: "Superpose" }));
      for (let n = 0; n < count; n++) {
        const id = `sim-${++uid}`;
        const c = el("input", { id, type: "checkbox" });
        c.checked = chosen.has(n);
        c.addEventListener("change", () => { c.checked ? chosen.add(n) : chosen.delete(n); t = 0; draw(); });
        checks.append(el("label", { for: id, class: "chip" }, c, el("span", { text: `n=${preset === "box" ? n + 1 : n}` })));
      }
    }
    function renderTable(pert) {
      const def = EIGEN_PRESETS[preset];
      const rows = states.map((s, n) => {
        const cells = [preset === "box" ? n + 1 : n, s.E.toFixed(4)];
        if (pert) {
          const e0 = base0[n].E;
          const first = P.integrate(grid, base0[n].psi.map((p, i) => p * p * pert[i]));
          cells.push(e0.toFixed(4), (e0 + first).toFixed(4), (s.E - e0 - first).toExponential(1));
        } else if (def.exact) cells.push(def.exact(n, param).toFixed(4), (s.E - def.exact(n, param)).toExponential(1));
        return cells;
      });
      const head = pert ? ["n", "Exact (numerical)", "Unperturbed", "1st-order PT", "Error of PT"] : def.exact ? ["n", "Numerical Eₙ", "Analytic Eₙ", "Difference"] : ["n", "Numerical Eₙ"];
      table.innerHTML = "";
      const tbl = el("table");
      tbl.append(el("thead", {}, el("tr", {}, ...head.map((h) => el("th", { text: h })))));
      const tb = el("tbody");
      for (const r of rows) tb.append(el("tr", {}, ...r.map((c) => el("td", { text: String(c) }))));
      tbl.append(tb);
      table.append(tbl);
    }
    function dtFrame() {
      const idx = [...chosen].sort((a, b) => a - b);
      if (idx.length < 2) return 0.02;
      let gap = Infinity;
      for (let i = 1; i < idx.length; i++) gap = Math.min(gap, states[idx[i]].E - states[idx[i - 1]].E);
      return (TAU / gap) / 240; // slowest beat takes ~4 s
    }

    function draw() {
      if (!states) return;
      const T = theme(), { ctx, size } = cvs, { w, h } = size;
      ctx.clearRect(0, 0, w, h);
      const box = { x: 44, y: 12, w: w - 56, h: h - 34 };
      const xa = grid[0], xb = grid[grid.length - 1];
      const Emax = states[count - 1].E, Emin = Math.min(0, ...V);
      const span = Emax - Emin;
      const eTop = Emax + span * 0.18;
      const sX = (v) => box.x + ((v - xa) / (xb - xa)) * box.w;
      const sE = (e) => box.y + box.h - ((e - Emin) / (eTop - Emin)) * box.h;
      const gap = span / count;
      // potential
      ctx.fillStyle = T.pot; ctx.beginPath(); ctx.moveTo(sX(xa), box.y + box.h);
      for (let i = 0; i < grid.length; i++) ctx.lineTo(sX(grid[i]), Math.max(box.y, sE(V[i])));
      ctx.lineTo(sX(xb), box.y + box.h); ctx.closePath(); ctx.fill();
      if (preset === "box" || preset === "linear") {
        ctx.fillStyle = T.ink;
        ctx.fillRect(sX(xa) - 4, box.y, 4, box.h);
        if (preset === "box") ctx.fillRect(sX(xb), box.y, 4, box.h);
      }
      ctx.strokeStyle = T.ink; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < grid.length; i++) { const Y = Math.max(box.y, sE(V[i])); i ? ctx.lineTo(sX(grid[i]), Y) : ctx.moveTo(sX(grid[i]), Y); }
      ctx.stroke();

      const sup = [...chosen];
      if (sup.length) {
        // time-evolved superposition, drawn large at the bottom
        const n = grid.length, re = new Float64Array(n), im = new Float64Array(n), c = 1 / Math.sqrt(sup.length);
        for (const k of sup) {
          const ph = -states[k].E * t, cr = c * Math.cos(ph), ci = c * Math.sin(ph), psi = states[k].psi;
          for (let i = 0; i < n; i++) { re[i] += cr * psi[i]; im[i] += ci * psi[i]; }
        }
        // faint levels
        ctx.globalAlpha = 0.35; levels(T, ctx, box, sX, sE, gap, false); ctx.globalAlpha = 1;
        let dmax = 0; for (let i = 0; i < n; i++) dmax = Math.max(dmax, re[i] * re[i] + im[i] * im[i]);
        const scale = (box.h * 0.8) / (dmax * 1.3 || 1);
        const base = box.y + box.h;
        drawDensity(ctx, T, grid, re, im, sX, (d) => base - d * scale, base);
        phaseLegend(ctx, T, w - 84, 20);
        const ex = P.moments(grid, V, re, im);
        ctx.fillStyle = T.ink; ctx.font = `11px ${T.mono}`; ctx.textAlign = "left";
        ctx.fillText(`t = ${t.toFixed(2)}   ⟨x⟩ = ${ex.x.toFixed(3)}   ⟨E⟩ = ${ex.E.toFixed(3)}`, box.x + 6, box.y + 12);
      } else {
        levels(T, ctx, box, sX, sE, gap, true);
      }
      // energy axis ticks
      ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = "right";
      for (const s of states) ctx.fillText(s.E.toFixed(2), box.x - 5, sE(s.E) + 3);
      ctx.save(); ctx.translate(12, box.y + box.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("energy", 0, 0); ctx.restore();
    }
    function levels(T, ctx, box, sX, sE, gap, withPsi) {
      states.forEach((s, n) => {
        const y = sE(s.E);
        ctx.strokeStyle = T.faint; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke(); ctx.setLineDash([]);
        if (!withPsi) return;
        let pm = 0; for (const v of s.psi) pm = Math.max(pm, Math.abs(v));
        const amp = (gap * 0.42) / pm;
        const yy = (v) => sE(s.E + v * amp);
        ctx.fillStyle = n % 2 ? T.accent2 : T.accent; ctx.globalAlpha = 0.18;
        ctx.beginPath(); ctx.moveTo(sX(grid[0]), y);
        for (let i = 0; i < grid.length; i++) ctx.lineTo(sX(grid[i]), yy(s.psi[i]));
        ctx.lineTo(sX(grid[grid.length - 1]), y); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = n % 2 ? T.accent2 : T.accent; ctx.lineWidth = 1.6; ctx.beginPath();
        for (let i = 0; i < grid.length; i++) { const X = sX(grid[i]), Y = yy(s.psi[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
        ctx.stroke();
      });
    }
    compute();
    if (chosen.size && !reduceMotion()) { run.start(); playBtn.textContent = "Pause"; }
    const off = onTheme(draw);
    return { destroy() { run.stop(); cvs.dispose(); off(); } };
  }

  /* =================================================================
     6. BLOCH SPHERE — a qubit, gates and measurement
     ================================================================= */
  function bloch(container) {
    const ui = scaffold(container, "Bloch sphere",
      "Drag the sphere to turn it. Gates rotate the state; the trail shows the path. Measuring collapses the state; the ×1000 run measures fresh copies and compares counts with ½(1 + n̂·m̂).");
    let psi = [1, 0, 0, 0], trail = [], anim = null;
    let yaw = -0.6, pitch = 0.35, axis = "z";
    let counts = null;
    const rand = Math.random;
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 1 : 1.9), draw);
    const run = loop(tick);
    const gates = el("div", { class: "btn-row", role: "group", "aria-label": "Gates" });
    ui.controls.append(gates);
    for (const g of ["X", "Y", "Z", "H", "S", "T"]) button(gates, g, () => gate(g), "gate");
    button(gates, "Rx(π/4)", () => rot({ x: 1, y: 0, z: 0 }, Math.PI / 4), "gate");
    button(gates, "Ry(π/4)", () => rot({ x: 0, y: 1, z: 0 }, Math.PI / 4), "gate");
    button(gates, "Reset |0⟩", () => { psi = [1, 0, 0, 0]; trail = []; counts = null; sync(); draw(); });
    const thS = slider(ui.controls, { label: "θ", min: 0, max: 180, step: 1, value: 0, fmt: (v) => `${v}°` }, () => setFromSliders());
    const phS = slider(ui.controls, { label: "φ", min: 0, max: 360, step: 1, value: 0, fmt: (v) => `${v}°` }, () => setFromSliders());
    select(ui.controls, { label: "Measure along", options: [["z", "z"], ["x", "x"], ["y", "y"]], value: axis }, (v) => { axis = v; counts = null; draw(); });
    button(ui.controls, "Measure once", () => measureOnce(), "primary");
    button(ui.controls, "Measure 1000 copies", () => measureMany(1000));
    const sAmp = stat(ui.readout, "State"), sVec = stat(ui.readout, "Bloch vector"), sP = stat(ui.readout, "P(+) along x · y · z"), sC = stat(ui.readout, "Last result");

    const unit = { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } };
    function setFromSliders() {
      psi = P.fromBloch((+thS.input.value * Math.PI) / 180, (+phS.input.value * Math.PI) / 180);
      trail = []; counts = null; sync(false); draw();
    }
    function sync(sliders = true) {
      const b = P.blochVector(psi);
      if (sliders) {
        const th = Math.acos(Math.max(-1, Math.min(1, b.z))), ph = (Math.atan2(b.y, b.x) + TAU) % TAU;
        thS.set(Math.round((th * 180) / Math.PI)); phS.set(Math.round((ph * 180) / Math.PI) % 360);
      }
      const c = (r, i) => `${r.toFixed(2)}${i >= 0 ? "+" : "−"}${Math.abs(i).toFixed(2)}i`;
      sAmp(`${c(psi[0], psi[1])} |0⟩ + ${c(psi[2], psi[3])} |1⟩`);
      sVec(`(${f2(b.x)}, ${f2(b.y)}, ${f2(b.z)})`);
      sP(["x", "y", "z"].map((k) => P.probUp(psi, unit[k]).toFixed(2)).join(" · "));
    }
    function gate(g) { const [n, a] = P.gateAxes[g]; animate(n, a, () => P.apply(P.gates[g], anim.start)); }
    function rot(n, a) { animate(n, a, null); }
    function animate(n, angle, exact) {
      // a gate pressed mid-animation: land the previous one first
      if (anim) psi = anim.finish ? anim.finish() : P.apply(P.rotationAbout(anim.n, anim.angle), anim.start);
      const steps = reduceMotion() ? 1 : 40;
      anim = { n, angle, k: 0, steps, start: psi.slice(), inc: P.rotationAbout(n, angle / steps), finish: exact };
      counts = null;
      trail = [P.blochVector(psi)];
      run.start();
    }
    function tick() {
      if (!anim) { run.stop(); return; }
      psi = P.apply(anim.inc, psi);
      trail.push(P.blochVector(psi));
      if (++anim.k >= anim.steps) { if (anim.finish) psi = anim.finish(); anim = null; sync(); }
      draw();
    }
    function measureOnce() {
      const p = P.probUp(psi, unit[axis]), up = rand() < p;
      const b = { x: 0, y: 0, z: 0 }; b[axis] = up ? 1 : -1;
      psi = P.fromBloch(Math.acos(b.z), Math.atan2(b.y, b.x));
      trail = []; counts = null;
      sC(`${up ? "+" : "−"}ħ/2 along ${axis} (p was ${p.toFixed(2)})`);
      sync(); draw();
    }
    function measureMany(n) {
      const p = P.probUp(psi, unit[axis]);
      let up = 0; for (let i = 0; i < n; i++) if (rand() < p) up++;
      counts = { up, n, p };
      sC(`${up} up / ${n - up} down along ${axis}; predicted ${(p * n).toFixed(0)} up`);
      draw();
    }
    // drag to rotate
    let drag = null;
    cvs.cv.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY, yaw, pitch]; cvs.cv.setPointerCapture(e.pointerId); });
    cvs.cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      yaw = drag[2] + (e.clientX - drag[0]) * 0.01;
      pitch = Math.max(-1.4, Math.min(1.4, drag[3] + (e.clientY - drag[1]) * 0.01));
      draw();
    });
    cvs.cv.addEventListener("pointerup", () => { drag = null; });
    cvs.cv.style.touchAction = "none"; cvs.cv.style.cursor = "grab";

    function draw() {
      const T = theme(), { ctx, size } = cvs, { w, h } = size;
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 520;
      const R = Math.min(narrow ? w * 0.36 : w * 0.22, h * 0.4);
      const cx = narrow ? w / 2 : w * 0.3, cy = h / 2;
      // physics axes (x, y, z) → screen, with z up
      const proj = (v) => {
        const X = v.x * Math.cos(yaw) - v.y * Math.sin(yaw);
        const Yd = v.x * Math.sin(yaw) + v.y * Math.cos(yaw); // depth
        const Z = v.z * Math.cos(pitch) + Yd * Math.sin(pitch);
        const D = Yd * Math.cos(pitch) - v.z * Math.sin(pitch);
        return { X: cx + X * R, Y: cy - Z * R, D };
      };
      ctx.fillStyle = T.panel; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1; ctx.stroke();
      const circle = (f) => {
        ctx.beginPath();
        for (let i = 0; i <= 72; i++) { const p = proj(f((i / 72) * TAU)); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
        ctx.stroke();
      };
      ctx.strokeStyle = T.faint;
      circle((a) => ({ x: Math.cos(a), y: Math.sin(a), z: 0 }));
      circle((a) => ({ x: Math.cos(a), y: 0, z: Math.sin(a) }));
      circle((a) => ({ x: 0, y: Math.cos(a), z: Math.sin(a) }));
      const lab = [["x", { x: 1.2, y: 0, z: 0 }], ["y", { x: 0, y: 1.2, z: 0 }], ["|0⟩", { x: 0, y: 0, z: 1.18 }], ["|1⟩", { x: 0, y: 0, z: -1.22 }]];
      ctx.strokeStyle = T.muted;
      for (const [, v] of lab.slice(0, 3)) { const a = proj({ x: -v.x, y: -v.y, z: -v.z }), b = proj(v); ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke(); }
      ctx.fillStyle = T.muted; ctx.font = `12px ${T.mono}`; ctx.textAlign = "center";
      for (const [t, v] of lab) { const p = proj(v); ctx.fillText(t, p.X, p.Y + 4); }
      // measurement axis highlight
      const m = unit[axis], ma = proj({ x: -m.x * 1.05, y: -m.y * 1.05, z: -m.z * 1.05 }), mb = proj({ x: m.x * 1.05, y: m.y * 1.05, z: m.z * 1.05 });
      ctx.strokeStyle = T.accent2; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(ma.X, ma.Y); ctx.lineTo(mb.X, mb.Y); ctx.stroke(); ctx.setLineDash([]);
      // trail
      if (trail.length > 1) {
        ctx.strokeStyle = T.accent; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath();
        trail.forEach((v, i) => { const p = proj(v); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); });
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      const b = P.blochVector(psi), tip = proj(b), o = proj({ x: 0, y: 0, z: 0 });
      arrow(ctx, o.X, o.Y, tip.X, tip.Y, T.accent, 3);
      ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(tip.X, tip.Y, 5, 0, TAU); ctx.fill();

      // measurement statistics panel
      const px = narrow ? 16 : w * 0.58, py = narrow ? h - 64 : h * 0.22, pw = narrow ? w - 32 : w * 0.36;
      const p = P.probUp(psi, unit[axis]);
      ctx.fillStyle = T.ink; ctx.font = `12px ${T.sans}`; ctx.textAlign = "left";
      if (!narrow) ctx.fillText(`Measuring spin along ${axis}`, px, py - 12);
      const bar = (y, label, frac, col) => {
        ctx.fillStyle = T.panel; ctx.fillRect(px + 34, y, pw - 34, 16);
        ctx.fillStyle = col; ctx.fillRect(px + 34, y, (pw - 34) * frac, 16);
        ctx.fillStyle = T.ink; ctx.font = `11px ${T.mono}`; ctx.fillText(label, px, y + 12);
        ctx.textAlign = "right"; ctx.fillText(frac.toFixed(3), px + pw - 4, y + 12); ctx.textAlign = "left";
      };
      bar(py, "P(+)", p, T.accent); bar(py + 22, "P(−)", 1 - p, T.accent2);
      if (counts) {
        ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`;
        const f = counts.up / counts.n;
        ctx.fillText(`observed ${f.toFixed(3)} ± ${Math.sqrt(counts.p * (1 - counts.p) / counts.n).toFixed(3)}`, px + 34, py + 56);
        ctx.strokeStyle = T.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + 34 + (pw - 34) * f, py - 3); ctx.lineTo(px + 34 + (pw - 34) * f, py + 19); ctx.stroke();
      }
    }
    sync(); draw();
    const off = onTheme(draw);
    return { destroy() { run.stop(); cvs.dispose(); off(); } };
  }

  /* =================================================================
     7. HYDROGEN — |ψ_nlm|² in the x–z plane
     ================================================================= */
  function hydrogen(container) {
    const ui = scaffold(container, "Hydrogen orbitals",
      "Probability density |ψₙₗₘ|² in a slice through the z-axis (distances in Bohr radii a₀). The lower strip is the radial probability r²|Rₙₗ|².");
    let n = 2, l = 1, m = 0, gamma = 0.5;
    const res = 170;
    let img = null;
    const off2 = document.createElement("canvas"); off2.width = res; off2.height = res;
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 0.8 : 1.6), draw);
    select(ui.controls, { label: "n", options: [1, 2, 3, 4, 5].map((v) => [v, String(v)]), value: n }, (v) => { n = +v; fixQ(); compute(); });
    const lS = select(ui.controls, { label: "ℓ", options: [[0, "0 (s)"]], value: l }, (v) => { l = +v; fixQ(); compute(); });
    const mS = select(ui.controls, { label: "m", options: [[0, "0"]], value: m }, (v) => { m = +v; compute(); });
    slider(ui.controls, { label: "Contrast", min: 0.2, max: 1, step: 0.05, value: gamma, fmt: (v) => v.toFixed(2) }, (v) => { gamma = v; compute(); });
    const sName = stat(ui.readout, "Orbital"), sE = stat(ui.readout, "Energy"), sN = stat(ui.readout, "Radial · angular nodes"), sR = stat(ui.readout, "⟨r⟩");
    const letters = "spdfg";
    function fixQ() {
      if (l > n - 1) l = n - 1;
      lS.innerHTML = "";
      for (let k = 0; k < n; k++) lS.append(el("option", { value: k, text: `${k} (${letters[k]})` }));
      lS.value = l;
      if (Math.abs(m) > l) m = 0;
      mS.innerHTML = "";
      for (let k = -l; k <= l; k++) mS.append(el("option", { value: k, text: String(k) }));
      mS.value = m;
    }
    function extent() { return 3 * n * n + 6; }
    function compute() {
      const E = extent(), ctx = off2.getContext("2d");
      img = ctx.createImageData(res, res);
      const T = theme(), stops = T.heat.map(hexToRgb);
      const vals = new Float64Array(res * res);
      let max = 0;
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
        const X = ((i + 0.5) / res * 2 - 1) * E, Z = (1 - (j + 0.5) / res * 2) * E;
        const r = Math.hypot(X, Z), th = Math.atan2(Math.abs(X), Z);
        const v = P.hydrogenDensity(n, l, m, r, th);
        vals[j * res + i] = v; if (v > max) max = v;
      }
      for (let k = 0; k < vals.length; k++) {
        const u = Math.pow(vals[k] / max, gamma), c = ramp(stops, u);
        img.data[4 * k] = c[0]; img.data[4 * k + 1] = c[1]; img.data[4 * k + 2] = c[2]; img.data[4 * k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const mean = (3 * n * n - l * (l + 1)) / 2;
      sName(`${n}${letters[l]}${l ? `, m = ${m}` : ""}`);
      sE(`${P.exact.hydrogen(n).toFixed(3)} eV`);
      sN(`${n - l - 1} · ${l}`);
      sR(`${mean.toFixed(1)} a₀`);
      draw();
    }
    function ramp(stops, u) {
      const s = Math.min(stops.length - 1.0001, u * (stops.length - 1)), i = Math.floor(s), f = s - i;
      return [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f));
    }
    function draw() {
      if (!img) return;
      const T = theme(), { ctx, size } = cvs, { w, h } = size;
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 520;
      const side = narrow ? Math.min(w - 20, h * 0.66) : Math.min(h - 20, w * 0.5);
      const ix = narrow ? (w - side) / 2 : 10, iy = 10;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off2, ix, iy, side, side);
      ctx.strokeStyle = T.grid; ctx.strokeRect(ix + 0.5, iy + 0.5, side - 1, side - 1);
      ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = "left";
      ctx.fillText("z ↑", ix + side / 2 + 4, iy + 12);
      ctx.fillText(`±${extent()} a₀`, ix + 4, iy + side - 6);
      // radial probability
      const bx = narrow ? 16 : ix + side + 28, by = narrow ? iy + side + 22 : iy + 20;
      const bw = narrow ? w - 32 : w - bx - 16, bh = narrow ? h - by - 24 : side - 60;
      const E = extent(), N = 300;
      let pm = 0; const pr = [];
      for (let i = 0; i <= N; i++) { const r = (i / N) * E, R = P.radial(n, l, r), v = r * r * R * R; pr.push(v); pm = Math.max(pm, v); }
      axes(ctx, T, { x: bx, y: by, w: bw, h: bh }, { xLabel: `r (a₀) → ${E}`, yLabel: "r²|R|²" });
      ctx.fillStyle = T.accent; ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.moveTo(bx, by + bh);
      pr.forEach((v, i) => ctx.lineTo(bx + (i / N) * bw, by + bh - (v / pm) * bh * 0.9));
      ctx.lineTo(bx + bw, by + bh); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.beginPath();
      pr.forEach((v, i) => { const X = bx + (i / N) * bw, Y = by + bh - (v / pm) * bh * 0.9; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    fixQ(); compute();
    const off = onTheme(compute);
    return { destroy() { cvs.dispose(); off(); } };
  }

  /* =================================================================
     8. BELL TEST — CHSH with a quantum source and a local model
     ================================================================= */
  function bellTest(container) {
    const ui = scaffold(container, "Bell test (CHSH)",
      "Pairs are measured with Alice at a or a′ and Bob at b or b′, chosen at random. Curves are the predicted correlation E vs. angle difference; dots are what the runs measured.");
    const deg = Math.PI / 180;
    let ang = { a: 0, a2: 90, b: 45, b2: 135 };
    let tally = fresh();
    const rand = Math.random;
    const cvs = canvas(ui.stage, (w) => (w < 520 ? 1 : 2.2), draw);
    const run = loop(() => { pairs(400); draw(); });
    for (const [k, label] of [["a", "Alice a"], ["a2", "Alice a′"], ["b", "Bob b"], ["b2", "Bob b′"]])
      slider(ui.controls, { label, min: 0, max: 180, step: 1, value: ang[k], fmt: (v) => `${v}°` }, (v) => { ang[k] = v; tally = fresh(); draw(); });
    button(ui.controls, "Run 4,000 pairs", () => { pairs(4000); draw(); }, "primary");
    const playBtn = button(ui.controls, "Stream", () => { run.running ? run.stop() : run.start(); playBtn.textContent = run.running ? "Stop" : "Stream"; });
    button(ui.controls, "Optimal angles", () => { ang = { a: 0, a2: 90, b: 45, b2: 135 }; tally = fresh(); container.querySelectorAll("input[type=range]").forEach((r, i) => { const v = [0, 90, 45, 135][i]; r.value = v; r.dispatchEvent(new Event("input")); }); });
    button(ui.controls, "Clear", () => { tally = fresh(); draw(); });
    const sQ = stat(ui.readout, "Quantum S (measured)"), sQt = stat(ui.readout, "Quantum S (theory)"), sL = stat(ui.readout, "Local model S (measured)"), sN = stat(ui.readout, "Pairs per model");

    function fresh() { return { quantum: [[0, 0], [0, 0], [0, 0], [0, 0]], local: [[0, 0], [0, 0], [0, 0], [0, 0]], n: 0 }; }
    const settings = () => [[ang.a, ang.b], [ang.a, ang.b2], [ang.a2, ang.b], [ang.a2, ang.b2]];
    function pairs(k) {
      const S = settings();
      for (let i = 0; i < k; i++) {
        const j = Math.floor(rand() * 4), [a, b] = S[j];
        for (const model of ["quantum", "local"]) {
          const [A, B] = P.bell.samplePair(model, a * deg, b * deg, rand);
          tally[model][j][0] += A * B; tally[model][j][1]++;
        }
      }
      tally.n += k;
    }
    function Es(model) { return tally[model].map(([s, c]) => (c ? s / c : NaN)); }
    const chsh = (E) => E[0] - E[1] + E[2] + E[3];

    function draw() {
      const T = theme(), { ctx, size } = cvs, { w, h } = size;
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 520;
      const box = { x: 40, y: 14, w: (narrow ? w : w * 0.62) - 52, h: (narrow ? h * 0.62 : h) - 40 };
      const sX = (d) => box.x + (d / 180) * box.w, sY = (e) => box.y + ((1 - e) / 2) * box.h;
      axes(ctx, T, box, { xLabel: "angle difference (°)", yLabel: "E" });
      ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(box.x, sY(0)); ctx.lineTo(box.x + box.w, sY(0)); ctx.stroke();
      ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = "right";
      for (const e of [1, 0, -1]) ctx.fillText(String(e), box.x - 5, sY(e) + 3);
      ctx.textAlign = "center";
      for (const d of [0, 45, 90, 135, 180]) ctx.fillText(String(d), sX(d), box.y + box.h + 13);
      const curve = (f, col, dash) => {
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
        for (let i = 0; i <= 180; i++) { const Y = sY(f(0, i * deg)); i ? ctx.lineTo(sX(i), Y) : ctx.moveTo(sX(i), Y); }
        ctx.stroke(); ctx.setLineDash([]);
      };
      curve(P.bell.quantumE, T.accent, []);
      curve(P.bell.localE, T.accent2, [6, 4]);
      const S = settings(), q = Es("quantum"), lo = Es("local");
      S.forEach(([a, b], j) => {
        const d = Math.abs(a - b);
        for (const [E, col] of [[q[j], T.accent], [lo[j], T.accent2]]) {
          if (Number.isNaN(E)) continue;
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sX(d), sY(E), 4.5, 0, TAU); ctx.fill();
        }
      });
      // legend
      ctx.textAlign = "left"; ctx.font = `11px ${T.sans}`;
      ctx.fillStyle = T.accent; ctx.fillRect(box.x + box.w - 150, box.y + 4, 14, 3); ctx.fillText("quantum −cos Δ", box.x + box.w - 132, box.y + 9);
      ctx.fillStyle = T.accent2; ctx.fillRect(box.x + box.w - 150, box.y + 20, 14, 3); ctx.fillText("local hidden variables", box.x + box.w - 132, box.y + 25);
      // |S| gauge
      const gx = narrow ? 40 : w * 0.66, gy = narrow ? box.y + box.h + 30 : 30, gw = narrow ? w - 60 : w * 0.3;
      const scale = (v) => gx + (v / 3) * gw;
      const Sq = Math.abs(chsh(q)), Sl = Math.abs(chsh(lo)), St = Math.abs(chsh(S.map(([a, b]) => P.bell.quantumE(a * deg, b * deg))));
      const row = (y, v, col, label) => {
        ctx.fillStyle = T.panel; ctx.fillRect(gx, y, gw, 14);
        if (!Number.isNaN(v)) { ctx.fillStyle = col; ctx.fillRect(gx, y, scale(Math.min(3, v)) - gx, 14); }
        ctx.fillStyle = T.ink; ctx.font = `11px ${T.mono}`; ctx.fillText(`${label} ${Number.isNaN(v) ? "–" : v.toFixed(3)}`, gx, y - 3);
      };
      row(gy + 14, Sq, T.accent, "|S| quantum");
      row(gy + 50, Sl, T.accent2, "|S| local");
      for (const [v, lab] of [[2, "2 · classical limit"], [2 * Math.SQRT2, "2√2"]]) {
        ctx.strokeStyle = v === 2 ? T.bad : T.ink; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(scale(v), gy + 8); ctx.lineTo(scale(v), gy + 70); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = T.muted; ctx.font = `10px ${T.mono}`; ctx.textAlign = v === 2 ? "right" : "left";
        ctx.fillText(lab, scale(v) + (v === 2 ? -3 : 3), gy + 82);
        ctx.textAlign = "left";
      }
      sQ(Number.isNaN(Sq) ? "–" : Sq.toFixed(3)); sQt(St.toFixed(3)); sL(Number.isNaN(Sl) ? "–" : Sl.toFixed(3)); sN(tally.n.toLocaleString());
    }
    pairs(2000); draw();
    const off = onTheme(draw);
    return { destroy() { run.stop(); cvs.dispose(); off(); } };
  }

  const registry = {
    phasor: { make: phasor, title: "Adding two amplitudes", level: 0 },
    uncertainty: { make: uncertainty, title: "Position vs momentum", level: 1 },
    doubleslit: { make: doubleslit, title: "Double slit", level: 1 },
    wavepacket: { make: wavepacket, title: "Wave packet evolution", level: 2 },
    eigen: { make: eigen, title: "Stationary states", level: 2 },
    bloch: { make: bloch, title: "Bloch sphere", level: 3 },
    hydrogen: { make: hydrogen, title: "Hydrogen orbitals", level: 3 },
    bell: { make: bellTest, title: "Bell test (CHSH)", level: 4 },
  };

  root.QSims = {
    registry,
    mount(id, container, opts) { return registry[id].make(container, opts || {}); },
    refreshTheme() { themeListeners.forEach((f) => f()); },
  };
})(typeof window !== "undefined" ? window : globalThis);
