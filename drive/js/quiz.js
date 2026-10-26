/* ================================================
   LANE COACH — quiz.js
   Lane quiz: the picture freezes a little before the maneuver, you
   pick a lane, and the car drives your choice so you can see where it
   leads. Your first answer to each scenario is the one that counts.
   ================================================ */
window.LC = window.LC || {};

(function (LC) {
  "use strict";
  const L = LC.logic, D = LC.draw;
  const $ = (id) => document.getElementById(id);

  const ANIM_MS = 2600;

  const state = {
    list: [],
    idx: 0,
    picked: null,     // lane index once answered
    first: {},        // scenario id -> first verdict
    cues: true,
    anim: null,       // { start, raf }
    progress: 0,      // 0..1 through the replay
    onDrive: null,
    summary: false,   // showing the end-of-quiz score
  };

  const current = () => state.list[state.idx];

  function camera(sc) {
    const sBottom = sc.quizAt - 380;
    let sTop = Math.max(L.settledAt(sc) + 700, sc.quizAt + 2600);
    // Keep a cross street in frame: it's where a frontage-road exit ends up.
    for (const d of sc.decor || []) if (d.type === "cross") sTop = Math.max(sTop, d.at + 500);
    return { sBottom, sTop, fit: D.fit(sc, sBottom, sTop) };
  }

  function draw() {
    const sc = current();
    if (!sc) return;
    const canvas = $("quiz-canvas");
    const { ctx, w, h } = D.prepare(canvas);
    if (!w || !h) return;
    const cam = camera(sc);
    const v = D.makeView(w, h, cam.sBottom, cam.sTop, cam.fit);
    const start = sc.startLane;

    const o = { pinLabels: true };
    let s = sc.quizAt;
    let lat = (x) => L.lateral(sc, start, x);

    if (state.picked != null) {
      const pick = state.picked;
      const verdict = sc.lanes[pick].quiz;
      const end = cam.sTop - 240 / v.px;
      const t = state.progress;
      s = sc.quizAt + (end - sc.quizAt) * L.smooth(t);
      lat = (x) => {
        const a = L.lateral(sc, start, x), b = L.lateral(sc, pick, x);
        return a + (b - a) * L.smooth((x - sc.quizAt) / 650);
      };
      o.marks = sc.lanes
        .map((l, i) => (l.quiz === "best" && i !== pick ? { lane: i, tone: "best", from: sc.quizAt } : null))
        .filter(Boolean);
      o.marks.push({ lane: pick, tone: verdict, from: sc.quizAt });
      o.revealRoute = true;
    }
    o.player = { s, lat };

    if (state.cues || state.picked != null) {
      const here = lat(s);
      // Before you answer the line points at the nearest lane that works;
      // afterwards it shows the best one, which is what you came to learn.
      const target = state.picked != null && !L.onRoute(sc, state.picked)
        ? nearestBest(sc, state.picked)
        : state.picked != null ? state.picked : L.nearestRouteLane(sc, start);
      o.route = { s, lat: here, lane: target };
    }
    D.scene(ctx, v, sc, o);
    state.view = v;
  }

  function nearestBest(sc, i) {
    let best = -1;
    sc.lanes.forEach((l, j) => {
      if (l.quiz === "best" && (best < 0 || Math.abs(j - i) < Math.abs(best - i))) best = j;
    });
    return best;
  }

  function play() {
    if (state.anim) cancelAnimationFrame(state.anim.raf);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { state.progress = 1; draw(); return; }
    const t0 = performance.now();
    const tick = (now) => {
      state.progress = Math.min(1, (now - t0) / ANIM_MS);
      draw();
      if (state.progress < 1) state.anim = { raf: requestAnimationFrame(tick) };
      else state.anim = null;
    };
    state.anim = { raf: requestAnimationFrame(tick) };
  }

  /* ---- rendering the panel ------------------------------------------ */

  function chip(text) {
    const s = document.createElement("span");
    s.className = "skill";
    s.textContent = text;
    return s;
  }

  function render() {
    const sc = current();
    if (state.anim) cancelAnimationFrame(state.anim.raf);
    state.anim = null;
    state.picked = null;
    state.progress = 0;
    state.summary = false;

    $("quiz-region-chip").textContent = sc.region;
    $("quiz-count").textContent = `Scenario ${state.idx + 1} of ${state.list.length}`;
    $("quiz-title").textContent = sc.title;
    $("quiz-place").textContent = sc.place;
    $("quiz-prompt").textContent = sc.prompt;
    const skills = $("quiz-skills");
    skills.textContent = "";
    sc.skills.forEach((k) => skills.appendChild(chip(k)));
    $("quiz-max").textContent = String(sc.lanes.length);

    const at = L.maneuverAt(sc);
    D.navCard($("quiz-nav"), sc, { cues: state.cues, distanceFt: at == null ? null : at - sc.quizAt });
    D.sign($("quiz-sign"), sc);

    const lanes = $("quiz-lanes");
    lanes.textContent = "";
    sc.lanes.forEach((lane, i) => {
      const b = document.createElement("button");
      b.className = "lane-btn";
      b.type = "button";
      b.dataset.lane = String(i);
      const side = i === 0 ? " (far left)" : i === sc.lanes.length - 1 ? " (far right)" : "";
      b.setAttribute("aria-label", `Lane ${i + 1} of ${sc.lanes.length}${side}${i === sc.startLane ? ", your lane now" : ""}`);
      b.appendChild(D.arrow(lane.arrows));
      const label = document.createElement("span");
      label.textContent = `Lane ${i + 1}`;
      b.appendChild(label);
      if (i === sc.startLane) {
        const you = document.createElement("span");
        you.className = "you";
        you.textContent = "you";
        b.appendChild(you);
      }
      b.addEventListener("click", () => answer(i));
      lanes.appendChild(b);
    });

    $("quiz-feedback").hidden = true;
    renderProgress();
    draw();
  }

  function renderProgress() {
    const bar = $("quiz-progress");
    bar.textContent = "";
    state.list.forEach((sc, i) => {
      const d = document.createElement("button");
      d.type = "button";
      const v = state.first[sc.id];
      d.className = "dot" + (v ? " is-" + v : "") + (i === state.idx ? " is-here" : "");
      d.setAttribute("aria-label", `Scenario ${i + 1}: ${sc.title}${v ? ", answered " + L.VERDICTS[v].label : ""}`);
      d.addEventListener("click", () => { state.idx = i; render(); });
      bar.appendChild(d);
    });

    const done = state.list.filter((sc) => state.first[sc.id]);
    const right = done.filter((sc) => state.first[sc.id] !== "wrong").length;
    $("quiz-score").textContent = done.length
      ? `${right} of ${done.length} right on the first try`
      : "Your first answer to each scenario is scored.";
  }

  function answer(i) {
    const sc = current();
    if (state.picked === i) return;
    state.picked = i;
    const j = L.judge(sc, i);
    if (!state.first[sc.id]) state.first[sc.id] = j.verdict;

    const fb = $("quiz-feedback");
    const verdict = $("quiz-verdict");
    verdict.className = "verdict is-" + j.verdict;
    verdict.textContent = `${j.mark} Lane ${i + 1}: ${j.label}`;
    $("quiz-why").textContent = j.why;
    const bestText = j.best.map((b) => b + 1).join(" or ");
    if (j.verdict !== "best") $("quiz-why").textContent += ` Best: lane ${bestText}.`;
    $("quiz-lesson").textContent = sc.lesson;
    $("quiz-tip").textContent = sc.tip;
    const note = $("quiz-note");
    note.hidden = !sc.note;
    note.textContent = sc.note || "";
    $("quiz-next").textContent = state.idx < state.list.length - 1 ? "Next scenario →" : "See your score →";
    fb.hidden = false;

    document.querySelectorAll("#quiz-lanes .lane-btn").forEach((b) => {
      const k = Number(b.dataset.lane);
      b.classList.toggle("is-picked", k === i);
      b.classList.remove("is-best", "is-ok", "is-wrong");
      if (k === i) b.classList.add("is-" + j.verdict);
      else if (sc.lanes[k].quiz === "best") b.classList.add("is-best");
    });

    D.navCard($("quiz-nav"), sc, { cues: true, distanceFt: navDistance(sc) });
    renderProgress();
    play();
    if (window.matchMedia("(max-width: 900px)").matches) fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function navDistance(sc) {
    const at = L.maneuverAt(sc);
    return at == null ? null : at - sc.quizAt;
  }

  function next() {
    if (state.idx < state.list.length - 1) {
      state.idx++;
      render();
    } else {
      showSummary();
    }
  }

  function showSummary() {
    const done = state.list.filter((sc) => state.first[sc.id]);
    const right = done.filter((sc) => state.first[sc.id] !== "wrong").length;
    const verdict = $("quiz-verdict");
    verdict.className = "verdict is-best";
    verdict.textContent = `Finished: ${right} of ${state.list.length} right on the first try`;
    $("quiz-why").textContent = right === state.list.length
      ? "A clean sweep. Try the Drive mode with busy traffic next — knowing the lane is half of it; getting there is the other half."
      : "Tap any dot above to revisit a scenario, or reset to start over. The ones you missed are worth driving in Drive mode.";
    $("quiz-next").textContent = "Start over";
    state.summary = true;
  }

  function reset() {
    state.first = {};
    state.idx = 0;
    render();
  }

  function setList(region) {
    const all = LC.scenarios;
    state.list = region === "all" ? all.slice() : all.filter((s) => s.region === region);
    if (!state.list.length) state.list = all.slice();
    state.idx = 0;
    render();
  }

  function init(opts) {
    state.cues = opts.cues !== false;
    state.onDrive = opts.onDrive;
    $("quiz-cues").checked = state.cues;
    $("quiz-cues").addEventListener("change", (e) => {
      state.cues = e.target.checked;
      if (opts.onPrefs) opts.onPrefs({ cues: state.cues });
      const picked = state.picked;
      render();
      if (picked != null) answer(picked);
    });
    $("quiz-region").addEventListener("change", (e) => setList(e.target.value));
    $("quiz-next").addEventListener("click", () => (state.summary ? reset() : next()));
    $("quiz-replay").addEventListener("click", play);
    $("quiz-retry").addEventListener("click", () => render());
    $("quiz-reset").addEventListener("click", reset);
    $("quiz-drive").addEventListener("click", () => state.onDrive && state.onDrive(current().id));

    $("quiz-canvas").addEventListener("click", (e) => {
      if (!state.view) return;
      const r = e.currentTarget.getBoundingClientRect();
      const i = D.laneAt(current(), state.view, e.clientX - r.left, e.clientY - r.top);
      if (i >= 0) answer(i);
    });

    setList("all");
  }

  /* Keys only while the quiz is on screen; app.js routes them here. */
  function key(e) {
    const sc = current();
    const n = Number(e.key);
    if (n >= 1 && n <= sc.lanes.length) { answer(n - 1); return true; }
    if (state.picked != null && (e.key === "Enter" || e.key === "ArrowRight")) { $("quiz-next").click(); return true; }
    if (e.key === "r" || e.key === "R") { render(); return true; }
    return false;
  }

  LC.quiz = { init, draw, key };
})(window.LC);
