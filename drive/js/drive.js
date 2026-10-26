/* ================================================
   LANE COACH — drive.js
   Drive mode: your car rolls toward the maneuver in traffic and you
   steer between lanes. logic.js runs the road and the other cars; this
   file runs the clock, the controls and what goes on screen.
   ================================================ */
window.LC = window.LC || {};

(function (LC) {
  "use strict";
  const L = LC.logic, D = LC.draw;
  const $ = (id) => document.getElementById(id);

  const PX_PER_FT = 0.44;         // how much road fits on screen
  const RESULT_DELAY = 1.3;       // seconds to coast before the verdict

  const state = {
    sc: null,
    sim: null,
    running: false,
    raf: 0,
    last: 0,
    fit: null,
    nav: null,
    toastTimer: 0,
    opts: { traffic: "busy", timeScale: 2 },
    attempt: 0,
    shownResult: false,
    onPrefs: null,
  };

  function scenarioById(id) {
    return LC.scenarios.find((s) => s.id === id) || LC.scenarios[0];
  }

  /* ---- setup --------------------------------------------------------- */

  function load(id) {
    stop();
    const sc = scenarioById(id);
    state.sc = sc;
    state.attempt = 0;
    $("drive-scenario").value = sc.id;
    $("drive-region-chip").textContent = sc.region;
    $("drive-title").textContent = sc.title;
    $("drive-place").textContent = sc.place;
    $("drive-goal").textContent = goalText(sc);
    $("drive-intro-title").textContent = sc.title;
    $("drive-intro-text").textContent = goalText(sc);
    D.sign($("drive-sign"), sc);
    fresh();
  }

  function goalText(sc) {
    const n = sc.nav;
    const where = sc.startLane === 0 ? "the far-left lane"
      : sc.startLane === sc.lanes.length - 1 ? "the far-right lane"
      : `lane ${sc.startLane + 1} of ${sc.lanes.length}`;
    const what = n.maneuver === "straight"
      ? `Stay on ${n.road} — don't get carried off by an exit.`
      : `Follow the navigation to ${n.exit ? "Exit " + n.exit + ", " : ""}${n.road}${n.toward ? " toward " + n.toward : ""}.`;
    return `${what} You start in ${where}.`;
  }

  function fresh() {
    const sc = state.sc;
    // The same traffic on every retry, so a second attempt is a chance
    // to do better, not a different puzzle. A new drill gets new traffic.
    const seed = LC.scenarios.indexOf(sc) * 97 + 13;
    state.sim = L.createSim(sc, { traffic: state.opts.traffic, timeScale: state.opts.timeScale, seed });
    state.fit = D.fit(sc, -400, state.sim.finish + 1800);
    state.nav = D.navCard($("drive-nav"), sc, { cues: true, distanceFt: navDistance() });
    state.shownResult = false;
    $("drive-result").hidden = true;
    $("drive-intro").hidden = false;
    $("drive-start").textContent = "Start";
    $("drive-pause").disabled = true;
    hud();
    draw();
  }

  function navDistance() {
    const st = state.sim;
    if (!st || st.maneuver == null) return null;
    return Math.max(0, st.maneuver - st.s);
  }

  /* ---- the loop ------------------------------------------------------ */

  function start() {
    if (state.sim.result || state.sim.s > 0) fresh();
    $("drive-intro").hidden = true;
    state.attempt++;
    resume();
  }

  function resume() {
    if (state.running) return;
    state.running = true;
    state.last = performance.now();
    $("drive-start").textContent = "Restart";
    $("drive-pause").disabled = false;
    $("drive-pause").textContent = "Pause";
    state.raf = requestAnimationFrame(tick);
  }

  function stop() {
    state.running = false;
    cancelAnimationFrame(state.raf);
  }

  function pause() {
    if (!state.sim || state.sim.result) return;
    if (state.running) {
      stop();
      $("drive-pause").textContent = "Resume";
      toast("Paused — press Space or Resume.");
    } else if (state.sim.s > 0) {
      resume();
    }
  }

  function tick(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    const st = state.sim;
    L.step(st, dt);
    if (st.lastRequest) {
      if (!st.lastRequest.ok && st.lastRequest.message) toast(st.lastRequest.message);
      st.lastRequest = null;
    }
    state.nav.setDistance(navDistance());
    hud();
    draw();
    if (st.result && st.t - st.result.t > RESULT_DELAY && !state.shownResult) {
      state.shownResult = true;
      showResult();
      stop();
      return;
    }
    state.raf = requestAnimationFrame(tick);
  }

  function draw() {
    const canvas = $("drive-canvas");
    const { ctx, w, h } = D.prepare(canvas);
    if (!w || !h || !state.sim) return;
    const st = state.sim, sc = st.sc;
    const span = h / PX_PER_FT;
    const sBottom = st.s - span * 0.2;
    const v = D.makeView(w, h, sBottom, sBottom + span, state.fit);

    const lat = (s) => {
      // The player's sideways position is worked out for the current s;
      // for nearby s (the heading), shift it along with the lane.
      return L.playerLateral(st) + (L.lateral(sc, st.lane, s) - L.lateral(sc, st.lane, st.s));
    };
    const here = L.playerLateral(st);
    const target = L.onRoute(sc, st.lane) ? st.lane : L.nearestRouteLane(sc, st.lane);
    D.scene(ctx, v, sc, {
      player: { s: st.s, lat },
      cars: st.cars.map((c) => ({ s: c.s, lat: (s) => L.lateral(sc, c.lane, s, c.b) })),
      route: st.result && !st.result.ok ? null : { s: st.s, lat: here, lane: target },
      carFt: L.CAR_FT,
    });
  }

  /* ---- controls ------------------------------------------------------ */

  function change(dir) {
    const st = state.sim;
    if (!st || st.result) return;
    if (!state.running) {
      if (st.s === 0 && !$("drive-intro").hidden) start();
      else return;
    }
    const r = L.requestChange(st, dir);
    if (!r.ok && r.message) toast(r.message);
  }

  function pace(delta) {
    const st = state.sim;
    if (!st || st.result) return;
    const p = L.setPace(st, Math.round((st.pace + delta) * 100) / 100);
    toast(p < 1 ? "Easing off — let the gap come to you." : p > 1 ? "A touch faster." : "Back to cruising speed.");
  }

  function toast(text) {
    const t = $("drive-toast");
    t.textContent = text;
    t.classList.add("is-on");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  function hud() {
    const st = state.sim;
    const mph = Math.round((st.v / state.opts.timeScale) * 3600 / L.FT_PER_MILE);
    $("drive-speed").textContent = `${mph} mph`;
    const s = $("drive-status");
    const on = L.onRoute(st.sc, st.lane);
    s.className = "hud-status " + (on ? "is-on" : "is-off");
    if (on) s.textContent = "✓ In a lane for your route";
    else {
      const goal = L.nearestRouteLane(st.sc, st.lane);
      const n = Math.abs(goal - st.lane);
      s.textContent = `Move ${goal < st.lane ? "left" : "right"} ${n} lane${n > 1 ? "s" : ""}`;
    }
  }

  function showResult() {
    const st = state.sim, r = st.result, sc = st.sc;
    const v = $("drive-verdict");
    v.className = "verdict is-" + (r.ok ? "best" : "wrong");
    if (r.ok) {
      v.textContent = "✓ You made it";
      $("drive-outcome").textContent = `You're on ${r.branch.label}.`;
      $("drive-grade").textContent = r.grade;
    } else {
      v.textContent = r.how === "late" ? "✗ Too late to get over" : "✗ Missed it";
      $("drive-outcome").textContent = (r.how === "late"
        ? "The line to your lane turned solid before you got there — the right call now is to stay put, not swerve. "
        : "") + r.branch.miss;
      $("drive-grade").textContent = "";
    }
    const bits = [`${st.stats.changes} lane change${st.stats.changes === 1 ? "" : "s"}`];
    if (st.stats.blocked) bits.push(`${st.stats.blocked} blocked by a car alongside`);
    if (st.stats.refused) bits.push(`${st.stats.refused} refused at a solid or missing line`);
    $("drive-stats").textContent = bits.join(" · ");
    $("drive-lesson").textContent = sc.lesson;
    $("drive-result").hidden = false;
    $("drive-retry").focus();
  }

  function nextDrill() {
    const i = LC.scenarios.indexOf(state.sc);
    load(LC.scenarios[(i + 1) % LC.scenarios.length].id);
  }

  /* ---- wiring -------------------------------------------------------- */

  function init(opts) {
    state.onPrefs = opts.onPrefs;
    if (opts.traffic) state.opts.traffic = opts.traffic;
    if (opts.timeScale) state.opts.timeScale = opts.timeScale;
    $("drive-traffic").value = state.opts.traffic;
    $("drive-pace").value = String(state.opts.timeScale);

    const sel = $("drive-scenario");
    LC.scenarios.forEach((sc) => {
      const o = document.createElement("option");
      o.value = sc.id;
      o.textContent = `${sc.region} — ${sc.title}`;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => load(sel.value));

    const prefs = () => state.onPrefs && state.onPrefs({ traffic: state.opts.traffic, timeScale: state.opts.timeScale });
    $("drive-traffic").addEventListener("change", (e) => { state.opts.traffic = e.target.value; prefs(); stop(); fresh(); });
    $("drive-pace").addEventListener("change", (e) => { state.opts.timeScale = Number(e.target.value); prefs(); stop(); fresh(); });

    $("drive-start").addEventListener("click", () => { stop(); fresh(); start(); });
    $("drive-go").addEventListener("click", start);
    $("drive-pause").addEventListener("click", pause);
    $("drive-retry").addEventListener("click", () => { fresh(); start(); });
    $("drive-next").addEventListener("click", nextDrill);
    $("drive-left").addEventListener("click", () => change(-1));
    $("drive-right").addEventListener("click", () => change(1));
    $("drive-slower").addEventListener("click", () => pace(-0.05));
    $("drive-faster").addEventListener("click", () => pace(0.05));

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.running) pause();
    });

    load(LC.scenarios[0].id);
  }

  function key(e) {
    switch (e.key) {
      case "ArrowLeft": case "a": case "A": change(-1); return true;
      case "ArrowRight": case "d": case "D": change(1); return true;
      case "ArrowDown": case "s": case "S": pace(-0.05); return true;
      case "ArrowUp": case "w": case "W": pace(0.05); return true;
      case " ":
        if (!state.running && !$("drive-intro").hidden) start();
        else pause();
        return true;
      case "r": case "R": stop(); fresh(); start(); return true;
      default: return false;
    }
  }

  /* Leaving the tab pauses; coming back redraws at the right size. */
  function hide() { if (state.running) pause(); }

  LC.drive = { init, load, draw, key, hide };
})(window.LC);
