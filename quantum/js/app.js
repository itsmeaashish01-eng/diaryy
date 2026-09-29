/* ================================================
   QUANTUM LADDER — app.js
   Routing, rendering and progress. Routes are bare hash tokens
   (#home, #lesson-box, #lab, #lab-bell, #gym, #gym-tunnel) so a link
   to any page is just a word after the #.
   ================================================ */
(function (root) {
  "use strict";
  const { levels, lessons, byId } = root.QCourse;
  const EX = root.QEx;
  const SIMS = root.QSims;
  const $ = (s, r = document) => r.querySelector(s);

  /* ---- progress (per browser; the page works without it) ---------- */
  const KEY = "quantum-ladder:v1";
  const blank = () => ({ solved: {}, seen: {}, gym: { tried: 0, right: 0, streak: 0, best: 0 }, last: null });
  let state = blank();
  try { state = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* private mode */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* ignore */ } }

  const exKey = (lesson, i) => `${lesson.id}:${i}`;
  function lessonProgress(l) {
    const n = l.exercises.length;
    const done = l.exercises.filter((_, i) => state.solved[exKey(l, i)]).length;
    return { n, done, complete: n > 0 && done === n };
  }
  function levelProgress(n) {
    const ls = lessons.filter((l) => l.level === n);
    const total = ls.reduce((a, l) => a + l.exercises.length, 0);
    const done = ls.reduce((a, l) => a + lessonProgress(l).done, 0);
    return { total, done, lessons: ls };
  }

  /* ---- helpers ------------------------------------------------------ */
  function h(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }
  function typeset(node) {
    const MJ = root.MathJax;
    if (MJ && MJ.typesetPromise) MJ.typesetPromise([node]).catch(() => {});
  }
  let activeSims = [];
  function clearSims() { activeSims.forEach((s) => s && s.destroy && s.destroy()); activeSims = []; }
  function mountSim(id, container, opts) {
    try { activeSims.push(SIMS.mount(id, container, opts)); }
    catch (err) { container.textContent = `This simulation couldn't start: ${err.message}`; }
  }

  /* ---- sidebar outline ---------------------------------------------- */
  function renderOutline(current) {
    const nav = $("#outline");
    nav.innerHTML = "";
    for (const lv of levels) {
      const lp = levelProgress(lv.n);
      const list = h("ol", { class: "outline-lessons" });
      for (const l of lp.lessons) {
        const p = lessonProgress(l);
        list.append(h("li", {},
          h("a", { href: `#lesson-${l.id}`, class: `outline-link${current === l.id ? " is-current" : ""}${p.complete ? " is-done" : ""}`, "aria-current": current === l.id ? "page" : null },
            h("span", { class: "tick", "aria-hidden": "true", text: p.complete ? "✓" : state.seen[l.id] ? "◐" : "○" }),
            h("span", { text: l.title }))));
      }
      nav.append(h("section", { class: "outline-level" },
        h("h3", {}, h("span", { class: "rung-n", text: `n = ${lv.n}` }), " ", lv.name),
        h("div", { class: "meter", role: "img", "aria-label": `${lp.done} of ${lp.total} exercises solved` },
          h("i", { style: `width:${lp.total ? (100 * lp.done) / lp.total : 0}%` })),
        list));
    }
  }

  /* ---- views --------------------------------------------------------- */
  function viewHome(main) {
    const next = nextLesson();
    const solved = Object.keys(state.solved).length;
    const totalEx = lessons.reduce((a, l) => a + l.exercises.length, 0);
    const ladder = h("div", { class: "ladder", role: "list" });
    for (const lv of [...levels].reverse()) {
      const lp = levelProgress(lv.n);
      ladder.append(h("a", { class: "rung", role: "listitem", href: `#lesson-${lp.lessons[0].id}` },
        h("span", { class: "rung-e", text: `${["½", "³⁄₂", "⁵⁄₂", "⁷⁄₂", "⁹⁄₂"][lv.n]} ħω` }),
        h("span", { class: "rung-line" }, h("i", { style: `width:${lp.total ? (100 * lp.done) / lp.total : 0}%` })),
        h("span", { class: "rung-text" },
          h("b", { text: lv.name }),
          h("small", { text: `${lv.who} · ${lp.lessons.length} lessons` }))));
    }
    const teaser = h("div", { class: "teaser" });
    main.append(
      h("section", { class: "hero" },
        h("div", { class: "hero-copy" },
          h("p", { class: "eyebrow", text: "A course in quantum mechanics" }),
          h("h1", {}, "From ", h("em", { text: "why is light lumpy?" }), " to quantum field theory"),
          h("p", { class: "lede", text: "Twenty-eight lessons in five levels, with the mathematics taught alongside the physics. Every idea has something to play with: eight live simulations solve the Schrödinger equation in your browser, and every lesson ends with problems that check your working." }),
          h("div", { class: "hero-actions" },
            h("a", { class: "btn primary", href: `#lesson-${next.id}`, text: state.last ? `Continue: ${next.title}` : "Start with complex numbers" }),
            h("a", { class: "btn", href: "#gym", text: "Math Gym" }),
            h("a", { class: "btn", href: "#lab", text: "Open the Lab" })),
          h("p", { class: "progress-line" }, `${solved} of ${totalEx} lesson problems solved · Gym: ${state.gym.right}/${state.gym.tried}, best streak ${state.gym.best}`)),
        h("div", { class: "hero-ladder" },
          h("p", { class: "eyebrow", text: "The ladder  ·  â† climbs, â lowers" }),
          ladder)),
      h("section", { class: "home-demo" },
        h("div", { class: "demo-text" },
          h("h2", { text: "Try it now: tunnelling" }),
          h("p", { html: String.raw`A wave packet with less energy than the barrier still gets partly through. Press <b>Play</b>. Colour is the phase of \(\psi\); the transmitted fraction is compared with the exact plane-wave formula. The full explanation is in <a href="#lesson-tunnelling">Level 2 · Tunnelling</a>.` })),
        teaser),
      h("section", { class: "levels-grid" },
        ...levels.map((lv) => h("article", { class: "level-card" },
          h("p", { class: "eyebrow", text: `Level ${lv.n} · ${lv.who}` }),
          h("h3", { text: lv.name }),
          h("p", { text: lv.blurb }),
          h("ol", {}, ...levelProgress(lv.n).lessons.map((l) => h("li", {}, h("a", { href: `#lesson-${l.id}`, text: l.title }))))))));
    mountSim("wavepacket", teaser, { preset: "barrier" });
  }

  function nextLesson() {
    if (state.last && byId[state.last]) {
      const l = byId[state.last];
      if (!lessonProgress(l).complete) return l;
    }
    return lessons.find((l) => !lessonProgress(l).complete) || lessons[0];
  }

  function viewLesson(main, id) {
    const l = byId[id];
    if (!l) return viewMissing(main);
    state.seen[l.id] = true; state.last = l.id; save();
    const idx = lessons.indexOf(l), prev = lessons[idx - 1], next = lessons[idx + 1];
    const lv = levels[l.level];
    const article = h("article", { class: "lesson" },
      h("p", { class: "eyebrow" }, h("a", { href: "#home", text: "Course" }), `  ·  Level ${lv.n}: ${lv.name}  ·  ${l.minutes} min`),
      h("h1", { text: l.title }),
      h("div", { class: "prose", html: l.body }));
    main.append(article);
    if (l.sim) {
      const box = h("div", { class: "sim-slot" });
      article.append(box);
      mountSim(l.sim.id, box, l.sim);
    }
    if (l.exercises.length) {
      const ex = h("section", { class: "exercises" }, h("h2", { text: "Check your understanding" }),
        h("p", { class: "hint", html: "Numeric answers take expressions: <code>sqrt(2)/2</code>, <code>3pi^2/2</code>, <code>1.2e-10</code>." }));
      l.exercises.forEach((e, i) => ex.append(exerciseCard(l, e, i)));
      article.append(ex);
    }
    if (l.gym && l.gym.length) {
      article.append(h("section", { class: "gym-links" },
        h("h2", { text: "More practice" }),
        h("p", { text: "Fresh numbers every time, with a worked solution:" }),
        h("div", { class: "chips" }, ...l.gym.map((g) => h("a", { class: "chip", href: `#gym-${g}`, text: EX.byId[g].topic + ": " + labelFor(g) })))));
    }
    article.append(h("nav", { class: "pager", "aria-label": "Lessons" },
      prev ? h("a", { href: `#lesson-${prev.id}`, class: "btn" }, "← ", prev.title) : h("span"),
      next ? h("a", { href: `#lesson-${next.id}`, class: "btn primary" }, next.title, " →") : h("a", { href: "#gym", class: "btn primary", text: "Finished the course: go to the Gym →" })));
  }

  const GYM_LABELS = {
    "complex-modulus": "modulus of a product", "phasor-interference": "two-path interference", "eigen-2x2": "2×2 eigenvalues",
    normalize: "normalizing a state", expectation: "mean and spread", photoelectric: "photoelectric effect", "de-broglie": "de Broglie wavelength",
    heisenberg: "uncertainty bound", "box-energy": "box energies", "box-transition": "box transitions", oscillator: "oscillator levels",
    tunnel: "tunnelling estimate", "spin-prob": "spin measurement", "sigma-z": "⟨σz⟩", "hydrogen-line": "hydrogen spectral lines",
    perturb: "first-order shift", variational: "variational bound", "chsh-corr": "Bell correlations", purity: "purity of ρ", fermions: "filling fermions",
  };
  const labelFor = (g) => GYM_LABELS[g] || g;

  function exerciseCard(l, e, i) {
    const key = exKey(l, i);
    const card = h("div", { class: `exercise${state.solved[key] ? " is-solved" : ""}` });
    const fb = h("div", { class: "feedback", role: "status", "aria-live": "polite" });
    const why = h("div", { class: "why", html: e.why, hidden: true });
    card.append(h("p", { class: "q", html: `<span class="qn">${i + 1}</span> ${e.q}` }));
    const solved = () => { state.solved[key] = true; save(); card.classList.add("is-solved"); renderOutline(l.id); };
    if (e.kind === "mc") {
      const opts = h("div", { class: "options", role: "group" });
      e.options.forEach((o, j) => {
        const b = h("button", { type: "button", class: "option", html: o });
        b.addEventListener("click", () => {
          opts.querySelectorAll(".option").forEach((x) => x.classList.remove("right", "wrong"));
          if (j === e.answer) { b.classList.add("right"); fb.textContent = "Correct."; fb.className = "feedback ok"; why.hidden = false; solved(); }
          else { b.classList.add("wrong"); fb.textContent = "Not that one. Try again."; fb.className = "feedback no"; }
        });
        opts.append(b);
      });
      card.append(opts);
    } else {
      const id = `ans-${key.replace(/[^a-z0-9]/gi, "-")}`;
      const input = h("input", { id, type: "text", inputmode: "decimal", autocomplete: "off", spellcheck: "false", placeholder: "Your answer" });
      const check = () => {
        const r = EX.checkAnswer(input.value, e.answer, e.tol);
        if (r.error) { fb.textContent = r.error; fb.className = "feedback no"; return; }
        if (r.ok) { fb.textContent = `Correct: ${fmtNum(r.value)}.`; fb.className = "feedback ok"; why.hidden = false; solved(); }
        else { fb.textContent = `You entered ${fmtNum(r.value)}. Not quite; check your working.`; fb.className = "feedback no"; }
      };
      input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") check(); });
      card.append(h("div", { class: "answer-row" },
        h("label", { for: id, class: "sr-only", text: "Answer" }), input,
        h("button", { type: "button", class: "btn primary", text: "Check", onclick: check }),
        h("button", { type: "button", class: "btn quiet", text: "Show solution", onclick: () => { why.hidden = false; fb.textContent = `Answer: ${fmtNum(e.answer)}`; fb.className = "feedback"; typeset(why); } })));
    }
    card.append(fb, why);
    if (state.solved[key]) why.hidden = false;
    return card;
  }
  const fmtNum = (v) => (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(parseFloat(v.toPrecision(5))));

  function viewLab(main, simId) {
    const reg = SIMS.registry;
    if (simId && reg[simId]) {
      const lessonsUsing = lessons.filter((l) => l.sim && l.sim.id === simId);
      const slot = h("div", { class: "sim-slot" });
      main.append(h("article", { class: "lesson" },
        h("p", { class: "eyebrow" }, h("a", { href: "#lab", text: "Lab" }), `  ·  Level ${reg[simId].level}`),
        h("h1", { text: reg[simId].title }),
        slot,
        lessonsUsing.length ? h("p", { class: "hint" }, "Explained in: ", ...lessonsUsing.flatMap((l, i) => [i ? ", " : "", h("a", { href: `#lesson-${l.id}`, text: l.title })])) : null));
      mountSim(simId, slot, {});
      return;
    }
    const grid = h("div", { class: "lab-grid" });
    const blurbs = {
      phasor: "Two complex amplitudes and the probability of their sum. Interference, from scratch.",
      uncertainty: "Pick a wave packet and see its momentum distribution. Δx·Δp never drops below ½.",
      doubleslit: "Photons land one at a time and fringes build up. Add a which-path detector.",
      wavepacket: "Solve the time-dependent Schrödinger equation: barriers, steps, wells, traps.",
      eigen: "Energy levels and eigenfunctions of any 1-D potential. Superpose them and press play.",
      bloch: "A qubit on the Bloch sphere. Apply gates, then measure along x, y or z.",
      hydrogen: "Orbitals up to n = 5, sliced through the z-axis, with their radial distributions.",
      bell: "Run a CHSH experiment against a local hidden-variable model and watch |S| pass 2.",
    };
    for (const [id, r] of Object.entries(reg)) {
      grid.append(h("a", { class: "lab-card", href: `#lab-${id}` },
        h("span", { class: "eyebrow", text: `Level ${r.level}` }),
        h("b", { text: r.title }),
        h("span", { text: blurbs[id] })));
    }
    main.append(h("section", { class: "lab" },
      h("p", { class: "eyebrow", text: "Simulations" }),
      h("h1", { text: "The Lab" }),
      h("p", { class: "lede", text: "Every simulation from the course on its own page. The numerics are real: finite differences, Crank–Nicolson time-stepping, exact special functions. Each one is checked against analytic answers in the test suite." }),
      grid));
  }

  /* ---- Math Gym ------------------------------------------------------ */
  let gymFilter = "all";
  function viewGym(main, genId) {
    const topics = [...new Set(EX.gym.map((g) => g.topic))];
    const pool = () => (genId && EX.byId[genId] ? [EX.byId[genId]] : EX.gym.filter((g) => gymFilter === "all" || g.topic === gymFilter));
    const card = h("div", { class: "gym-card" });
    const score = h("p", { class: "gym-score", role: "status" });
    const showScore = () => { score.textContent = `${state.gym.right} right of ${state.gym.tried} · streak ${state.gym.streak} · best ${state.gym.best}`; };

    function newProblem() {
      const list = pool();
      const g = list[Math.floor(Math.random() * list.length)];
      const seed = (Math.random() * 2 ** 32) >>> 0;
      const p = g.make(root.QPhys.rng(seed));
      let counted = false;
      card.innerHTML = "";
      const fb = h("div", { class: "feedback", role: "status", "aria-live": "polite" });
      const steps = h("div", { class: "why", html: p.steps, hidden: true });
      const input = h("input", { id: "gym-answer", type: "text", inputmode: "decimal", autocomplete: "off", spellcheck: "false", placeholder: p.unit ? `Answer in ${p.unit}` : "Answer" });
      const check = () => {
        const r = EX.checkAnswer(input.value, p.answer, p.tol);
        if (r.error) { fb.textContent = r.error; fb.className = "feedback no"; return; }
        if (!counted) {
          counted = true; state.gym.tried++;
          if (r.ok) { state.gym.right++; state.gym.streak++; state.gym.best = Math.max(state.gym.best, state.gym.streak); }
          else state.gym.streak = 0;
          save(); showScore();
        }
        if (r.ok) { fb.textContent = `Correct: ${fmtNum(r.value)}${p.unit ? " " + p.unit : ""}.`; fb.className = "feedback ok"; steps.hidden = false; }
        else { fb.textContent = `You entered ${fmtNum(r.value)}. Not within ${Math.round(p.tol * 1000) / 10}% of the answer. Try again, or show the solution.`; fb.className = "feedback no"; }
      };
      input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") check(); });
      card.append(
        h("p", { class: "eyebrow", text: `${g.topic} · Level ${g.level}` }),
        h("div", { class: "q gym-q", html: p.q }),
        h("div", { class: "answer-row" },
          h("label", { for: "gym-answer", class: "sr-only", text: "Answer" }), input,
          p.unit ? h("span", { class: "unit", text: p.unit }) : null,
          h("button", { type: "button", class: "btn primary", text: "Check", onclick: check }),
          h("button", { type: "button", class: "btn quiet", text: "Show solution", onclick: () => {
            if (!counted) { counted = true; state.gym.tried++; state.gym.streak = 0; save(); showScore(); }
            steps.hidden = false; fb.textContent = `Answer: ${fmtNum(p.answer)}${p.unit ? " " + p.unit : ""}`; fb.className = "feedback";
          } }),
          h("button", { type: "button", class: "btn", text: "New problem →", onclick: newProblem })),
        fb, steps);
      typeset(card);
    }

    const chips = h("div", { class: "chips", role: "group", "aria-label": "Topic" });
    const mk = (val, label) => {
      const b = h("button", { type: "button", class: `chip${!genId && gymFilter === val ? " is-on" : ""}`, text: label, "aria-pressed": String(!genId && gymFilter === val) });
      b.addEventListener("click", () => { gymFilter = val; if (genId) { location.hash = "gym"; return; } chips.querySelectorAll(".chip").forEach((c) => { c.classList.remove("is-on"); c.setAttribute("aria-pressed", "false"); }); b.classList.add("is-on"); b.setAttribute("aria-pressed", "true"); newProblem(); });
      chips.append(b);
    };
    mk("all", "Everything");
    topics.forEach((t) => mk(t, t));

    main.append(h("section", { class: "gym" },
      h("p", { class: "eyebrow", text: "Practice" }),
      h("h1", { text: "Math Gym" }),
      h("p", { class: "lede", text: `${EX.gym.length} problem generators, from complex arithmetic to Bell correlations. Each problem has new numbers and a worked solution. Answers within the stated tolerance count; constants are CODATA values.` }),
      genId && EX.byId[genId] ? h("p", { class: "hint" }, `Drilling: ${labelFor(genId)}. `, h("a", { href: "#gym", text: "Show all topics" })) : chips,
      score, card,
      h("details", { class: "constants" },
        h("summary", { text: "Constants and shortcuts" }),
        h("div", { class: "prose", html: String.raw`<ul>
<li>\(h = 6.62607015\times10^{-34}\ \mathrm{J\,s}\), \(\hbar = 1.054571817\times10^{-34}\ \mathrm{J\,s}\)</li>
<li>\(hc = 1239.84\ \mathrm{eV\,nm}\), \(\hbar c = 197.327\ \mathrm{eV\,nm}\)</li>
<li>\(m_e = 9.1093837\times10^{-31}\ \mathrm{kg}\), \(m_ec^2 = 511.0\ \mathrm{keV}\), \(e = 1.602176634\times10^{-19}\ \mathrm C\)</li>
<li>\(h^2/8m_e = 0.3760\ \mathrm{eV\,nm^2}\), \(\sqrt{2m_e\cdot 1\,\mathrm{eV}}/\hbar = 5.123\ \mathrm{nm^{-1}}\)</li>
<li>Rydberg energy \(13.606\ \mathrm{eV}\), Bohr radius \(a_0 = 0.0529\ \mathrm{nm}\)</li></ul>` }))));
    showScore();
    newProblem();
  }

  function viewMissing(main) {
    main.append(h("section", { class: "lesson" }, h("h1", { text: "That page isn't here" }),
      h("p", {}, "The link may be from an older version of the course. ", h("a", { href: "#home", text: "Go to the course map" }), ".")));
  }

  /* ---- router ------------------------------------------------------- */
  function route() {
    const token = (location.hash || "#home").slice(1);
    const main = $("#main");
    clearSims();
    main.innerHTML = "";
    let current = null, tab = "home";
    if (token.startsWith("lesson-")) { current = token.slice(7); tab = "course"; viewLesson(main, current); }
    else if (token === "lab" || token.startsWith("lab-")) { tab = "lab"; viewLab(main, token.slice(4)); }
    else if (token === "gym" || token.startsWith("gym-")) { tab = "gym"; viewGym(main, token.slice(4)); }
    else if (token === "home" || token === "") viewHome(main);
    else viewMissing(main);
    document.querySelectorAll(".topnav a").forEach((a) => a.classList.toggle("is-on", a.dataset.tab === tab));
    renderOutline(current);
    const ol = $("#outline-wrap");
    if (ol && root.matchMedia("(max-width: 900px)").matches) ol.open = false;
    typeset(main);
    root.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }

  root.QApp = { typesetAll: () => typeset($("#main")), route };
  root.addEventListener("hashchange", route);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", route); else route();
})(window);
