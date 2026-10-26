/* ================================================
   LANE COACH — logic.js
   The road and the rules, with no drawing in them, so the selftest can
   drive every scenario without a browser. Hangs off window.LC.

   A road is described along its length in feet (s) and across it in
   lane widths (lateral). Lane i starts at lateral i; a lane's branch
   says how it drifts sideways as s grows: a split, a ramp peeling off,
   an on-ramp joining. Everything else — what you see, which lane
   changes are legal, whether you made your exit — falls out of that.
   ================================================ */
window.LC = window.LC || {};

(function (LC) {
  "use strict";

  // Before lanes separate, the dashed line turns solid. Crossing it is
  // the classic last-second swerve across the gore, so the sim refuses.
  const SOLID_FT = 400;
  // Cars are drawn larger than life so they read on a phone; "alongside"
  // is measured in the same exaggerated feet so it matches what you see.
  const CAR_FT = 90;
  const ALONGSIDE_FT = CAR_FT + 12;
  const CHANGE_SECONDS = 1.4;
  const FT_PER_MILE = 5280;

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

  /* ---- geometry ----------------------------------------------------- */

  /* How far a branch has drifted sideways at s. Moves are absolute
     targets, eased in over their length, so a ramp that swings out and
     then straightens is two moves rather than a curve to describe. */
  function offset(branch, s) {
    let prev = branch.start || 0;
    let v = prev;
    for (const m of branch.moves || []) {
      v += (m.to - prev) * smooth((s - m.at) / m.len);
      prev = m.to;
    }
    return v;
  }

  const branchesOf = (sc, i) => {
    const g = sc.lanes[i].go;
    return Array.isArray(g) ? g : [g];
  };
  const onRoute = (sc, i) => branchesOf(sc, i).some((b) => sc.branches[b].onRoute);

  /* An option lane forks. Whoever is in it takes the fork that's on
     their route, which is what a driver following the nav would do. */
  function routeBranch(sc, i) {
    const bs = branchesOf(sc, i);
    return bs.find((b) => sc.branches[b].onRoute) || bs[0];
  }

  const lateral = (sc, i, s, b) => i + offset(sc.branches[b || routeBranch(sc, i)], s);

  /* Lanes a and b are side by side at s if any fork of one sits exactly
     one lane width from any fork of the other, on the correct side. */
  function adjacentAt(sc, a, b, s) {
    const side = Math.sign(b - a);
    for (const ba of branchesOf(sc, a)) {
      for (const bb of branchesOf(sc, b)) {
        const gap = (lateral(sc, b, s, bb) - lateral(sc, a, s, ba)) * side;
        if (Math.abs(gap - 1) < 0.15) return true;
      }
    }
    return false;
  }

  /* Can you move from lane a to lane b at s, ignoring traffic? */
  function canChange(sc, a, b, s) {
    if (b < 0 || b >= sc.lanes.length) return { ok: false, reason: "edge" };
    if (!adjacentAt(sc, a, b, s)) return { ok: false, reason: "apart" };
    if (!adjacentAt(sc, a, b, s + SOLID_FT)) return { ok: false, reason: "solid" };
    return { ok: true };
  }

  /* Where the maneuver happens: the first point an on-route branch
     starts to leave. A route that just carries on has none. */
  function maneuverAt(sc) {
    if (sc.nav && sc.nav.at != null) return sc.nav.at;
    let at = null;
    for (const b of Object.values(sc.branches)) {
      if (!b.onRoute || !b.moves) continue;
      let prev = b.start || 0;
      for (const m of b.moves) {
        // An on-ramp joining isn't the maneuver; leaving is.
        if (Math.abs(m.to) > Math.abs(prev)) {
          if (at == null || m.at < at) at = m.at;
          break;
        }
        prev = m.to;
      }
    }
    return at;
  }

  /* The point by which every branch has settled: past here, whichever
     road you're on is the one you chose. */
  function settledAt(sc) {
    let end = 0;
    for (const b of Object.values(sc.branches)) {
      for (const m of b.moves || []) end = Math.max(end, m.at + m.len);
    }
    return end;
  }
  const finishAt = (sc) => settledAt(sc) + 300;

  /* 0.4 mi above a fifth of a mile, round feet below — how US
     navigation counts down. */
  function formatDistance(ft) {
    if (ft == null) return "";
    if (ft <= 30) return "Now";
    if (ft >= FT_PER_MILE * 0.2) return (ft / FT_PER_MILE).toFixed(1) + " mi";
    return (Math.round(ft / 50) * 50).toLocaleString("en-US") + " ft";
  }

  /* Which on-route lane is nearest lane i — where the route line
     points you, and where the bot in the selftest heads. */
  function nearestRouteLane(sc, i) {
    let best = -1;
    sc.lanes.forEach((_, j) => {
      if (onRoute(sc, j) && (best < 0 || Math.abs(j - i) < Math.abs(best - i))) best = j;
    });
    return best;
  }

  /* Can lane `from` still reach a lane on the route, given the lines
     as they are at s? Once it can't, the outcome is decided. */
  function reachable(sc, from, s) {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const i = queue.shift();
      if (onRoute(sc, i)) return true;
      for (const j of [i - 1, i + 1]) {
        if (!seen.has(j) && canChange(sc, i, j, s).ok) { seen.add(j); queue.push(j); }
      }
    }
    return false;
  }

  /* ---- the quiz ------------------------------------------------------ */

  const VERDICTS = {
    best: { label: "Best choice", mark: "✓" },
    ok: { label: "Works, but…", mark: "◐" },
    wrong: { label: "Not this lane", mark: "✗" },
  };

  function judge(sc, i) {
    const lane = sc.lanes[i];
    return {
      verdict: lane.quiz,
      label: VERDICTS[lane.quiz].label,
      mark: VERDICTS[lane.quiz].mark,
      why: lane.why,
      onRoute: onRoute(sc, i),
      best: sc.lanes.map((l, j) => (l.quiz === "best" ? j : -1)).filter((j) => j >= 0),
    };
  }

  /* ---- the driving simulation --------------------------------------- */

  // Small seeded generator, so a scenario's traffic is the same on every
  // retry: the second attempt is a chance to do better, not a new puzzle.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TRAFFIC = {
    off: null,
    light: { min: 700, max: 1500 },
    busy: { min: 360, max: 760 },
  };

  function makeTraffic(sc, vSet, level, seed, startLane) {
    const gaps = TRAFFIC[level];
    if (!gaps) return [];
    const r = rng(seed);
    const cars = [];
    const end = finishAt(sc) + 600;
    sc.lanes.forEach((lane, i) => {
      // A lane still on its on-ramp at the start has nobody on it yet.
      if (Math.abs(offset(sc.branches[routeBranch(sc, i)], 0)) > 0.1) return;
      // Left lanes run a little faster than right lanes, so gaps drift
      // past you instead of sitting still — which is what makes waiting
      // for one a real decision.
      const vd = vSet * (1.08 - 0.05 * i) * (0.97 + r() * 0.06);
      const bs = branchesOf(sc, i);
      for (let s = -1400 + r() * gaps.min; s < end; s += gaps.min + r() * (gaps.max - gaps.min)) {
        if (i === startLane && Math.abs(s) < 380) continue;
        cars.push({ lane: i, s, v: vd, vd, b: bs[Math.floor(r() * bs.length)] });
      }
    });
    return cars;
  }

  const MESSAGES = {
    edge: "There's no lane on that side.",
    apart: "That lane isn't connected to yours here.",
    solid: "Solid white line — too close to the split to change lanes safely.",
    blocked: "Car alongside — ease off (↓) to drop in behind it, or wait for a gap.",
    busy: "Finish this lane change first.",
  };

  function createSim(sc, opts) {
    const o = Object.assign({ mph: 65, timeScale: 2, traffic: "busy", seed: 7 }, opts);
    const vSet = (o.mph * FT_PER_MILE / 3600) * o.timeScale;
    const lane = sc.startLane;
    return {
      sc,
      s: 0,
      t: 0,
      lane,
      from: lane,
      change: 1,
      pending: 0,
      cruise: vSet,
      pace: 1,
      vSet,
      v: vSet,
      cars: makeTraffic(sc, vSet, o.traffic, o.seed, lane),
      finish: finishAt(sc),
      maneuver: maneuverAt(sc),
      result: null,
      stats: { changes: 0, blocked: 0, refused: 0, readyAt: onRoute(sc, lane) ? 0 : null },
    };
  }

  function playerLateral(st) {
    const { sc, s } = st;
    const to = lateral(sc, st.lane, s);
    if (st.change >= 1) return to;
    const from = lateral(sc, st.from, s);
    return from + (to - from) * smooth(st.change);
  }

  function alongside(st, lane) {
    return st.cars.some((c) => c.lane === lane && Math.abs(c.s - st.s) < ALONGSIDE_FT);
  }

  /* dir is -1 for left, +1 for right. Returns { ok, reason, message }. */
  function requestChange(st, dir) {
    if (st.result) return { ok: false, reason: "done" };
    if (st.change < 1) {
      if (st.pending) return { ok: false, reason: "busy", message: MESSAGES.busy };
      st.pending = dir;
      return { ok: true, queued: true };
    }
    const target = st.lane + dir;
    const lines = canChange(st.sc, st.lane, target, st.s);
    if (!lines.ok) {
      st.stats.refused++;
      return { ok: false, reason: lines.reason, message: MESSAGES[lines.reason] };
    }
    if (alongside(st, target)) {
      st.stats.blocked++;
      return { ok: false, reason: "blocked", message: MESSAGES.blocked };
    }
    st.from = st.lane;
    st.lane = target;
    st.change = 0;
    st.stats.changes++;
    if (!onRoute(st.sc, target)) st.stats.readyAt = null;
    return { ok: true };
  }

  /* Ease off or speed up a little, as you would to drop in behind a car
     in the next lane. Kept within a band so it stays a lane-change
     drill rather than a racing game. */
  function setPace(st, pace) {
    st.pace = Math.max(0.8, Math.min(1.15, pace));
    st.vSet = st.cruise * st.pace;
    return st.pace;
  }

  /* Each car keeps its distance from whatever is ahead in its lane —
     the player included, as if on adaptive cruise. Nobody rear-ends
     anybody, so the only skill being tested is lane choice and timing. */
  function follow(st, dt) {
    const byLane = new Map();
    const add = (lane, v) => {
      if (!byLane.has(lane)) byLane.set(lane, []);
      byLane.get(lane).push(v);
    };
    const me = { s: st.s, v: st.v, player: true };
    st.cars.forEach((c) => add(c.lane, c));
    add(st.lane, me);
    if (st.change < 1) add(st.from, me);

    for (const list of byLane.values()) {
      list.sort((a, b) => b.s - a.s);
      for (let k = 0; k < list.length; k++) {
        const car = list[k];
        let target = car.player ? st.vSet : car.vd;
        const leader = list[k - 1];
        if (leader && leader !== car) {
          const gap = leader.s - car.s;
          if (gap < 280) target = Math.min(target, leader.v * (gap < 170 ? 0.9 : 1));
        }
        car.vTarget = car.vTarget == null ? target : Math.min(car.vTarget, target);
      }
    }
    const ease = Math.min(1, dt * 1.6);
    for (const c of st.cars) {
      c.v += (c.vTarget - c.v) * ease;
      c.vTarget = null;
    }
    st.v += ((me.vTarget == null ? st.vSet : me.vTarget) - st.v) * ease;
  }

  function step(st, dt) {
    st.t += dt;
    follow(st, dt);
    st.s += st.v * dt;
    for (const c of st.cars) c.s += c.v * dt;

    if (st.change < 1) {
      st.change = Math.min(1, st.change + dt / CHANGE_SECONDS);
      if (st.change >= 1) {
        if (onRoute(st.sc, st.lane) && st.stats.readyAt == null) st.stats.readyAt = st.s;
        if (st.pending) {
          const dir = st.pending;
          st.pending = 0;
          st.lastRequest = requestChange(st, dir);
        }
      }
    }

    if (!st.result) {
      if (st.s >= st.finish) st.result = outcome(st, "arrived");
      else if (st.change >= 1 && !reachable(st.sc, st.lane, st.s)) st.result = outcome(st, "late");
      if (st.result) st.result.t = st.t;
    }
    return st;
  }

  function outcome(st, how) {
    const { sc } = st;
    const branch = sc.branches[routeBranch(sc, st.lane)];
    if (onRoute(sc, st.lane)) {
      const ready = st.stats.readyAt;
      if (st.maneuver == null) {
        return { ok: true, how, branch, lead: null, grade: "You kept to a lane that stays on your route." };
      }
      const lead = ready != null ? st.maneuver - ready : null;
      return { ok: true, how, branch, lead, grade: gradeLead(lead) };
    }
    return { ok: false, how, branch };
  }

  /* How early you were in position. Half a mile is the habit worth
     building; the last thousand feet is where crashes happen. */
  function gradeLead(lead) {
    if (lead == null) return "You were in position from the start.";
    if (lead >= FT_PER_MILE / 2) return `In position ${formatDistance(lead)} before the maneuver — calm and early.`;
    if (lead >= 1000) return `In position ${formatDistance(lead)} before the maneuver. Fine, but half a mile is calmer.`;
    return `In position only ${formatDistance(Math.max(lead, 0))} before the maneuver. In real traffic that's a last-second move — start earlier.`;
  }

  LC.logic = {
    SOLID_FT, CAR_FT, ALONGSIDE_FT, FT_PER_MILE, MESSAGES, VERDICTS,
    smooth, offset, branchesOf, onRoute, routeBranch, lateral, adjacentAt,
    canChange, maneuverAt, settledAt, finishAt, formatDistance,
    nearestRouteLane, reachable, judge,
    createSim, requestChange, setPace, step, playerLateral, gradeLead,
  };
})(window.LC);
