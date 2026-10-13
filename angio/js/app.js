/* ================================================
   ANGIO ATLAS — app.js
   Wires the page together: the six-vessel picker, Inject, playback and
   scrubbing, view presets, rotate/zoom/pan, hover and click on vessels,
   the branch list, and the three content tabs.

   The simulation is a pure function of time (model.js), so playback,
   scrubbing and restart all just set t and redraw.

   The address bar carries the state (#inj=L_VA&view=towne&t=2.4), so a
   view can be bookmarked or shared, and tests can open a known frame.
   ================================================ */
(function (AG) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const g = AG.model.buildGraph(AG.anatomy);

  const STANDARD_VIEW = { ICA: "ap", ECA: null, VA: "towne" };   // ECA: lateral of its side

  const st = {
    inj: "R_ICA", sim: null, t: 0, playing: false, speed: 0.5,
    view: AG.view.fromPreset("ap"), zoom: 1, panX: 0, panY: 0,
    look: "dsa", labelMode: "filled", ghost: true, blush: true,
    hoverId: null, selectedId: null,
    A: { ...AG.model.DEFAULTS },
    hit: null, dirty: true,
  };

  /* ---- simulation ----------------------------------------------------- */
  function resimulate() {
    st.sim = AG.model.simulate(g, st.inj, st.A);
    st.t = Math.min(st.t, st.sim.end);
    buildPhaseStrip();
    refreshList();
    showDetails();
    st.dirty = true;
  }

  function catheterNodes() {
    const inj = AG.model.INJECTIONS.find((i) => i.id === st.inj);
    const s = inj.side;
    const chain = inj.type === "VA" ? [`${s}.va_v1`] : inj.type === "ICA" ? [`${s}.cca`, `${s}.ica_c1a`] : [`${s}.cca`, `${s}.eca0`];
    return chain.flatMap((id) => g.byId[id].nodes);
  }

  function selectInjection(id, { keepView } = {}) {
    st.inj = id;
    st.t = 0;
    setPlaying(false);
    const inj = AG.model.INJECTIONS.find((i) => i.id === id);
    if (!keepView) {
      const v = STANDARD_VIEW[inj.type] || (inj.side === "R" ? "rlat" : "llat");
      setView(v);
    }
    document.querySelectorAll("#vessel-grid button").forEach((b) => {
      const on = b.dataset.inj === id;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("on", on);
    });
    $("inj-note").textContent = `Catheter tip: ${tipText(inj)}. Typical run ${inj.note.replace(/^e\.g\. /, "")}.`;
    resimulate();
  }
  function tipText(inj) {
    const side = inj.side === "R" ? "right" : "left";
    return inj.type === "ICA" ? `${side} cervical ICA (C1), above the bifurcation`
      : inj.type === "ECA" ? `${side} proximal ECA, just above the bifurcation`
      : `${side} vertebral artery, V2 segment`;
  }

  /* ---- playback ------------------------------------------------------- */
  function setPlaying(on) {
    st.playing = on;
    $("play").textContent = on ? "⏸" : "▶";
    $("play").setAttribute("aria-label", on ? "Pause" : "Play");
    st.last = performance.now();
  }
  function inject() {
    st.t = 0;
    setPlaying(true);
    st.dirty = true;
  }

  function loop(now) {
    if (st.playing) {
      const dt = Math.min(0.1, (now - st.last) / 1000);
      st.last = now;
      st.t += dt * st.speed;
      if (st.t >= st.sim.end) { st.t = st.sim.end; setPlaying(false); }
      st.dirty = true;
    }
    if (st.dirty) { frame(); st.dirty = false; }
    requestAnimationFrame(loop);
  }

  function frame() {
    st.hit = AG.render.draw($("view"), {
      g, sim: st.sim, t: st.t, view: st.view, zoom: st.zoom, panX: st.panX, panY: st.panY,
      look: st.look, ghost: st.ghost, blush: st.blush, labelMode: st.labelMode,
      hoverId: st.hoverId, selectedId: st.selectedId, catheter: catheterNodes(),
    });
    $("scrub").value = String(Math.round((st.t / st.sim.end) * 1000));
    const ph = currentPhase();
    $("time").textContent = `t = ${st.t.toFixed(2)} s of ${st.sim.end.toFixed(0)} s · ${ph}`;
    const viewName = st.view.preset ? AG.view.PRESETS[st.view.preset].name : "Custom rotation";
    $("statusbar").textContent = "";
    $("statusbar").append(
      tag("span", "chip chip-sim", "Simulated"),
      tag("strong", "", st.sim.inj.name),
      tag("span", "mono", `t = ${st.t.toFixed(2)} s`),
      tag("span", "", ph),
      tag("span", "muted", viewName));
    updateHash();
  }
  function currentPhase() {
    const p = st.sim.phases.find((x) => st.t >= x.from && st.t < x.to) || st.sim.phases[st.sim.phases.length - 1];
    return st.t < AG.model.T_START ? "pre-contrast" : `${p.name} phase`;
  }
  function tag(name, cls, text) {
    const n = document.createElement(name);
    if (cls) n.className = cls;
    n.textContent = text;
    return n;
  }

  function buildPhaseStrip() {
    const strip = $("phase-strip");
    strip.textContent = "";
    for (const p of st.sim.phases) {
      const d = tag("div", `ph ph-${p.name.split(" ")[0].toLowerCase()}`, p.name.replace(" (venous drainage not modelled)", "*"));
      d.style.width = `${((p.to - p.from) / st.sim.end) * 100}%`;
      d.title = p.name;
      strip.append(d);
    }
  }

  /* ---- views ---------------------------------------------------------- */
  function setView(key) {
    st.view = AG.view.fromPreset(key);
    st.zoom = 1; st.panX = 0; st.panY = 0;
    document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", b.dataset.view === key));
    $("preset-hint").textContent = AG.view.PRESETS[key].hint;
    st.dirty = true;
  }

  /* ---- canvas interaction -------------------------------------------- */
  function bindCanvas() {
    const cv = $("view");
    const pointers = new Map();
    let moved = 0, pinch = null;

    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, shift: e.shiftKey });
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: st.zoom };
      }
    });
    cv.addEventListener("pointermove", (e) => {
      const rect = cv.getBoundingClientRect();
      if (!pointers.has(e.pointerId)) { hover(e.clientX - rect.left, e.clientY - rect.top, e); return; }
      const p = pointers.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        st.zoom = clampZoom(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
      } else if (p.shift || e.shiftKey) {
        st.panX += dx; st.panY += dy;
      } else {
        st.view = AG.view.rotate(st.view, -dx * 0.01, -dy * 0.01);
        document.querySelectorAll("#presets button").forEach((b) => b.classList.remove("on"));
        $("preset-hint").textContent = "Custom rotation — orientation letters at the edges show which way the patient faces.";
      }
      $("tooltip").hidden = true;
      st.dirty = true;
    });
    const up = (e) => {
      const rect = cv.getBoundingClientRect();
      if (pointers.has(e.pointerId) && moved < 5 && pointers.size === 1) {
        const id = AG.render.hitTest(g, st.hit, e.clientX - rect.left, e.clientY - rect.top);
        select(id);
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); pinch = null; });
    cv.addEventListener("pointerleave", () => { if (!pointers.size) { st.hoverId = null; $("tooltip").hidden = true; st.dirty = true; } });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2 - st.panX;
      const my = e.clientY - rect.top - rect.height / 2 - st.panY;
      const z = clampZoom(st.zoom * Math.exp(-e.deltaY * 0.0015));
      // Keep the point under the cursor where it is.
      st.panX -= mx * (z / st.zoom - 1);
      st.panY -= my * (z / st.zoom - 1);
      st.zoom = z;
      st.dirty = true;
    }, { passive: false });
  }
  const clampZoom = (z) => Math.max(0.5, Math.min(6, z));

  function hover(x, y, e) {
    const id = AG.render.hitTest(g, st.hit, x, y);
    if (id !== st.hoverId) { st.hoverId = id; st.dirty = true; }
    const tip = $("tooltip");
    if (!id) { tip.hidden = true; return; }
    const v = g.byId[id];
    tip.textContent = "";
    tip.append(tag("strong", "", v.fullName), tag("div", "small", fillText(v)), tag("div", "small muted", firstSentence(v.desc)));
    tip.hidden = false;
    const wrap = $("view").getBoundingClientRect();
    tip.style.left = `${Math.min(x + 14, wrap.width - 260)}px`;
    tip.style.top = `${Math.max(4, y - 10)}px`;
  }
  const firstSentence = (s) => (s || "").split(/(?<=\.)\s/)[0];

  function fillText(v) {
    const s = st.sim.perVessel[v.id];
    if (!s || !(s.reached > 0)) return `Does not opacify on a ${st.sim.inj.name.toLowerCase()} injection.`;
    const how = s.reversed ? "retrograde (reflux / washback)" : v.kind === "vein" ? "venous phase" : "antegrade";
    const pct = Math.round(s.f * 100);
    return `Opacifies ${how} from t ≈ ${s.tFirst.toFixed(2)} s · ${pct}% of injected density${s.f < 0.99 ? " (mixing — see Assumptions)" : ""}.`;
  }

  /* ---- selection, details, list -------------------------------------- */
  function select(id) {
    st.selectedId = id || null;
    showDetails();
    document.querySelectorAll("#branch-list button").forEach((b) => b.classList.toggle("on", id && b.dataset.key === keyOf(g.byId[id])));
    st.dirty = true;
  }
  const keyOf = (v) => `${v.side}|${v.name}`;

  function parentOf(v) {
    const first = v.nodes[0];
    const p = g.vessels.find((o) => o !== v && o.nodes.indexOf(first) > 0);
    return p ? p.fullName : "— (start of the drawn tree)";
  }

  function showDetails() {
    const box = $("details");
    box.textContent = "";
    box.append(tag("h2", "", "Selected branch"));
    if (!st.selectedId) {
      box.append(tag("p", "muted", "Click a vessel or a label, or pick from the list."));
      return;
    }
    const v = g.byId[st.selectedId];
    const dl = document.createElement("dl");
    const row = (k, val) => { dl.append(tag("dt", "", k), tag("dd", "", val)); };
    box.append(tag("h3", "", v.fullName));
    row("Side", v.side === "R" ? "Right" : v.side === "L" ? "Left" : "Midline");
    row(v.kind === "vein" ? "Drains from" : "Arises from", parentOf(v));
    row("Supplies / notes", v.desc || "—");
    row("In this run", fillText(v));
    row("Anatomy source", "Schematic teaching model (original, not patient-derived). Course and calibre are approximate.");
    box.append(dl);
    const clear = tag("button", "btn btn-small", "Clear selection");
    clear.type = "button";
    clear.addEventListener("click", () => select(null));
    box.append(clear);
  }

  const GROUP_NAME = { CCA: "Common carotid", ICA: "Internal carotid", COW: "Communicating arteries", ACA: "Anterior cerebral",
    MCA: "Middle cerebral", PCA: "Posterior cerebral", VB: "Vertebrobasilar", ECA: "External carotid", VEN: "Veins and sinuses" };

  function refreshList() {
    const q = $("search").value.trim().toLowerCase();
    const list = $("branch-list");
    list.textContent = "";
    const seen = new Set();
    const byGroup = {};
    for (const v of g.vessels) {
      if (!v.label) continue;
      const k = keyOf(v);
      if (seen.has(k)) continue;
      seen.add(k);
      const hay = `${v.fullName} ${v.tag} ${v.short} ${GROUP_NAME[v.group]}`.toLowerCase();
      if (q && !q.split(/\s+/).every((w) => hay.includes(w))) continue;
      (byGroup[v.group] = byGroup[v.group] || []).push(v);
    }
    for (const [grp, vs] of Object.entries(byGroup)) {
      const li = tag("li", "grp", GROUP_NAME[grp] || grp);
      list.append(li);
      for (const v of vs) {
        const s = st.sim.perVessel[v.id];
        const state = !s || !(s.reached > 0) ? "none" : s.f > 0.9 ? "full" : "part";
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.key = keyOf(v);
        b.className = st.selectedId && keyOf(g.byId[st.selectedId]) === b.dataset.key ? "on" : "";
        const dot = tag("span", `dot dot-${state}`, "");
        dot.title = state === "none" ? "Does not fill in this run" : state === "full" ? "Fills" : "Fills partially (mixing or reflux)";
        const sw = tag("span", "sw", "");
        sw.style.background = AG.render.GROUP_COLOR[v.group];
        b.append(sw, tag("span", "nm", v.fullName), dot);
        b.addEventListener("click", () => select(v.id));
        const item = document.createElement("li");
        item.append(b);
        list.append(item);
      }
    }
    if (!list.children.length) list.append(tag("li", "muted", "No branch matches."));
  }

  /* ---- controls ------------------------------------------------------- */
  function bindControls() {
    const grid = $("vessel-grid");
    const order = ["R_ICA", "L_ICA", "R_ECA", "L_ECA", "R_VA", "L_VA"];
    for (const id of order) {
      const inj = AG.model.INJECTIONS.find((i) => i.id === id);
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.dataset.inj = id;
      b.className = "vbtn";
      b.append(tag("span", "side", inj.side === "R" ? "Right" : "Left"), tag("span", "type", inj.type === "VA" ? "Vertebral" : inj.type));
      b.title = inj.name;
      b.addEventListener("click", () => selectInjection(id));
      grid.append(b);
    }
    $("inject").addEventListener("click", inject);
    $("play").addEventListener("click", () => {
      if (!st.playing && st.t >= st.sim.end) st.t = 0;
      setPlaying(!st.playing);
    });
    $("restart").addEventListener("click", () => { st.t = 0; setPlaying(false); st.dirty = true; });
    $("scrub").addEventListener("input", (e) => { st.t = (+e.target.value / 1000) * st.sim.end; setPlaying(false); st.dirty = true; });
    $("speed").addEventListener("change", (e) => { st.speed = +e.target.value; });
    $("look").addEventListener("change", (e) => { st.look = e.target.value; st.dirty = true; });
    $("labels").addEventListener("change", (e) => { st.labelMode = e.target.value; st.dirty = true; });
    $("ghost").addEventListener("change", (e) => { st.ghost = e.target.checked; st.dirty = true; });
    $("blush").addEventListener("change", (e) => { st.blush = e.target.checked; st.dirty = true; });
    $("search").addEventListener("input", refreshList);

    const presets = $("presets");
    for (const [k, p] of Object.entries(AG.view.PRESETS)) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-small"; b.dataset.view = k; b.textContent = p.name;
      b.addEventListener("click", () => setView(k));
      presets.append(b);
    }

    const sliders = [["acom", "acomCross"], ["pcom", "pcomFwd"], ["pcomr", "pcomRev"], ["vb", "vbMix"], ["reflux", "vaReflux"]];
    const syncAssumptions = () => {
      for (const [id, key] of sliders) { $(`a-${id}`).value = st.A[key]; $(`o-${id}`).textContent = Math.round(st.A[key] * 100) + "%"; }
      $("a-fetal").checked = st.A.fetalPCA;
      $("a-pcom").disabled = st.A.fetalPCA;
    };
    for (const [id, key] of sliders) {
      $(`a-${id}`).addEventListener("input", (e) => { st.A[key] = +e.target.value; syncAssumptions(); resimulate(); });
    }
    $("a-fetal").addEventListener("change", (e) => { st.A.fetalPCA = e.target.checked; syncAssumptions(); resimulate(); });
    $("a-reset").addEventListener("click", () => { st.A = { ...AG.model.DEFAULTS }; syncAssumptions(); resimulate(); });
    syncAssumptions();

    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea") || $("pane-sim").hidden) return;
      if (e.key === " ") { e.preventDefault(); $("play").click(); }
      else if (e.key === "Home") { $("restart").click(); }
      else if (e.key === "ArrowRight") { st.t = Math.min(st.sim.end, st.t + 0.1); setPlaying(false); st.dirty = true; }
      else if (e.key === "ArrowLeft") { st.t = Math.max(0, st.t - 0.1); setPlaying(false); st.dirty = true; }
    });
    window.addEventListener("resize", () => { st.dirty = true; });

    // Coverage panel
    for (const [what, kind, note] of AG.anatomy.COVERAGE) {
      const li = document.createElement("li");
      li.append(tag("strong", "", what), document.createTextNode(` — ${kind}. ${note}`));
      $("coverage").append(li);
    }
    for (const m of AG.anatomy.MISSING) $("missing").append(tag("li", "", m));
  }

  /* ---- tabs ----------------------------------------------------------- */
  function bindTabs() {
    let dsaMounted = false;
    const tabs = ["sim", "dsa", "3d"];
    for (const t of tabs) {
      $(`tab-${t}`).addEventListener("click", () => {
        for (const o of tabs) {
          $(`tab-${o}`).setAttribute("aria-selected", o === t ? "true" : "false");
          $(`pane-${o}`).hidden = o !== t;
        }
        if (t === "dsa" && !dsaMounted) { AG.dsa.mount($("pane-dsa")); dsaMounted = true; }
        if (t !== "sim") setPlaying(false);
        st.dirty = true;
      });
    }
  }

  /* ---- address bar ---------------------------------------------------- */
  let hashTimer = 0;
  function updateHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const p = new URLSearchParams();
      p.set("inj", st.inj);
      if (st.view.preset) p.set("view", st.view.preset);
      p.set("t", st.t.toFixed(2));
      if (st.look !== "dsa") p.set("look", st.look);
      if (st.labelMode !== "filled") p.set("labels", st.labelMode);
      if (st.selectedId) p.set("sel", st.selectedId);
      history.replaceState(null, "", `#${p}`);
    }, 250);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const inj = p.get("inj");
    if (inj && AG.model.INJECTIONS.some((i) => i.id === inj)) selectInjection(inj);
    else selectInjection("R_ICA");
    if (p.get("view") && AG.view.PRESETS[p.get("view")]) setView(p.get("view"));
    if (p.get("look") === "anat" || p.get("look") === "dsa") { st.look = p.get("look"); $("look").value = st.look; }
    if (["all", "off", "filled"].includes(p.get("labels"))) { st.labelMode = p.get("labels"); $("labels").value = st.labelMode; }
    const t = parseFloat(p.get("t"));
    if (t >= 0) st.t = Math.min(t, st.sim.end);
    if (p.get("sel") && g.byId[p.get("sel")]) select(p.get("sel"));
  }

  bindControls();
  bindCanvas();
  bindTabs();
  readHash();
  st.last = performance.now();
  requestAnimationFrame(loop);

  // For tests and the console.
  AG.app = { st, g, selectInjection, inject, setView, select };
})(window.AG);
