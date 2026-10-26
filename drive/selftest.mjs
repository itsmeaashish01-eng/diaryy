#!/usr/bin/env node
/* ================================================
   LANE COACH — selftest.mjs
   The parts that can be checked without a browser.

     node drive/selftest.mjs

   Loads the scenarios and the road logic into a sandbox with just
   enough window to satisfy them, then checks that every drill holds
   together: the quiz's "best" lanes really reach the route, the wrong
   ones really don't, and a patient driver can finish every drive —
   with traffic on — while one who never moves misses the exit.

   draw.js, quiz.js, drive.js and app.js are left out: they need a DOM
   and a canvas, and what they do is show what logic.js decides.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const win = {};
const ctx = createContext({ window: win, console, Math, JSON });
for (const f of ["logic.js", "scenarios.js"]) {
  runInContext(readFileSync(join(HERE, "js", f), "utf8"), ctx, { filename: `drive/js/${f}` });
}
const { logic: L, scenarios: SCENARIOS } = win.LC;

/* ---- the harness -------------------------------------------------- */
let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || "value"}: expected ${b}, got ${a}`);
}
const ok = (cond, what) => { if (!cond) throw new Error(what || "expected true"); };

/* ---- formatting and geometry -------------------------------------- */

check("distances count down the way US navigation does", () => {
  eq(L.formatDistance(5280), "1.0 mi", "a mile");
  eq(L.formatDistance(2640), "0.5 mi", "half a mile");
  eq(L.formatDistance(1056), "0.2 mi", "a fifth of a mile is still miles");
  eq(L.formatDistance(800), "800 ft", "under that, feet");
  eq(L.formatDistance(1020), "1,000 ft", "rounded to 50 ft, with a comma");
  eq(L.formatDistance(10), "Now", "at the gore");
});

check("a branch eases from where it was to where it's going", () => {
  const b = { start: 3, moves: [{ at: 100, to: 0, len: 100 }, { at: 400, to: 2, len: 200 }] };
  eq(L.offset(b, 0), 3, "before the first move");
  eq(L.offset(b, 150), 1.5, "halfway through the join");
  eq(L.offset(b, 300), 0, "joined");
  eq(L.offset(b, 700), 2, "left again");
  eq(L.offset({}, 1e6), 0, "a branch with no moves stays put");
});

/* ---- every scenario's data holds together ------------------------- */

const ids = new Set();
for (const sc of SCENARIOS) {
  const name = sc.id;

  check(`${name}: has the fields the pages read`, () => {
    ok(!ids.has(sc.id), "ids are unique");
    ids.add(sc.id);
    for (const k of ["title", "region", "place", "prompt", "lesson", "tip"]) {
      ok(typeof sc[k] === "string" && sc[k].length > 0, `${k} is filled in`);
    }
    ok(["Denton", "Fort Worth", "Dallas", "DFW"].includes(sc.region), `known region, got ${sc.region}`);
    ok(sc.nav && sc.nav.maneuver && sc.nav.road, "nav names a maneuver and a road");
    ok(sc.startLane >= 0 && sc.startLane < sc.lanes.length, "start lane exists");
  });

  check(`${name}: every lane feeds a real branch and has an explanation`, () => {
    sc.lanes.forEach((lane, i) => {
      for (const b of L.branchesOf(sc, i)) ok(sc.branches[b], `lane ${i}: branch "${b}" exists`);
      ok(["best", "ok", "wrong"].includes(lane.quiz), `lane ${i}: verdict is best/ok/wrong`);
      ok(lane.why && lane.why.length > 20, `lane ${i}: says why`);
      ok(lane.arrows && lane.arrows.length, `lane ${i}: has an arrow`);
    });
    for (const [id, b] of Object.entries(sc.branches)) {
      ok(b.label, `branch ${id}: has a label`);
      if (!b.onRoute) ok(b.miss, `branch ${id}: off-route, so it says what missing means`);
    }
  });

  check(`${name}: the quiz agrees with the road`, () => {
    const best = sc.lanes.filter((l) => l.quiz === "best");
    ok(best.length >= 1, "at least one best lane");
    sc.lanes.forEach((lane, i) => {
      if (lane.quiz === "best") ok(L.onRoute(sc, i), `lane ${i} is "best" but never reaches the route`);
      if (lane.quiz === "wrong") ok(!L.onRoute(sc, i), `lane ${i} is "wrong" but it's on the route`);
    });
  });

  check(`${name}: the sign covers each lane once`, () => {
    const seen = new Set();
    for (const p of sc.sign.panels) {
      for (const i of p.lanes) {
        ok(i >= 0 && i < sc.lanes.length, `panel lane ${i} exists`);
        ok(!seen.has(i), `lane ${i} is under only one panel`);
        seen.add(i);
      }
      // A grid column span can only cover neighbours.
      p.lanes.forEach((i, k) => k && ok(i === p.lanes[k - 1] + 1, "panel lanes are contiguous"));
    }
  });

  check(`${name}: the quiz picture is taken before the maneuver`, () => {
    const at = L.maneuverAt(sc);
    if (at == null) return;
    ok(sc.quizAt < at - L.SOLID_FT, `quizAt ${sc.quizAt} leaves room before ${at}`);
    ok(L.reachable(sc, sc.startLane, sc.quizAt), "from the quiz moment the route is still reachable");
  });
}

/* ---- the drive ---------------------------------------------------- */

/* A careful driver: heads for the nearest route lane, one change at a
   time. When the lane beside is occupied it eases off to drop in behind
   that car, and picks the pace back up once it's in position. */
function drive(sc, opts, policy) {
  const st = L.createSim(sc, opts);
  for (let i = 0; i < 20000 && !st.result; i++) {
    if (policy === "careful" && st.change >= 1) {
      if (L.onRoute(sc, st.lane)) L.setPace(st, 1);
      else {
        const goal = L.nearestRouteLane(sc, st.lane);
        const r = L.requestChange(st, Math.sign(goal - st.lane));
        if (r.reason === "blocked") L.setPace(st, 0.85);
      }
    }
    L.step(st, 1 / 30);
  }
  return st;
}

for (const sc of SCENARIOS) {
  check(`${sc.id}: a careful driver makes it with no traffic`, () => {
    const st = drive(sc, { traffic: "off" }, "careful");
    ok(st.result, "the drive finished");
    ok(st.result.ok, `should succeed, ended ${st.result.how} on ${st.result.branch.label}`);
  });

  check(`${sc.id}: a careful driver makes it in busy traffic`, () => {
    for (const seed of [7, 11, 23]) {
      const st = drive(sc, { traffic: "busy", seed }, "careful");
      ok(st.result && st.result.ok,
        `seed ${seed}: ended ${st.result && st.result.how} on ${st.result && st.result.branch.label}`);
    }
  });

  if (!L.onRoute(sc, sc.startLane)) {
    check(`${sc.id}: staying in the start lane misses the route`, () => {
      const st = drive(sc, { traffic: "off" }, "frozen");
      ok(st.result && !st.result.ok, "should fail");
      ok(st.result.branch.miss, "and say what that costs");
    });
  }
}

check("the solid line near a split refuses a lane change", () => {
  const sc = SCENARIOS.find((s) => s.id === "denton-split");
  const at = L.maneuverAt(sc);
  ok(L.canChange(sc, 1, 2, at - 1500).ok, "well before: fine");
  eq(L.canChange(sc, 1, 2, at - 100).reason, "solid", "right before the split: solid");
  eq(L.canChange(sc, 1, 2, at + 900).reason, "apart", "after it: the roads have separated");
  eq(L.canChange(sc, 0, -1, 0).reason, "edge", "no lane left of the left lane");
});

check("an on-ramp isn't connected until it joins", () => {
  const sc = SCENARIOS.find((s) => s.id === "short-merge");
  eq(L.canChange(sc, 3, 2, 0).reason, "apart", "still on the ramp");
  ok(L.canChange(sc, 3, 2, 1300).ok, "joined");
});

check("an option lane follows the fork on your route", () => {
  const sc = SCENARIOS.find((s) => s.id === "option-lane");
  eq(L.routeBranch(sc, 3), "exit", "option lane exits for this driver");
  ok(L.onRoute(sc, 3), "and counts as on the route");
});

check("a car alongside blocks the change, and the change is counted", () => {
  const sc = SCENARIOS.find((s) => s.id === "mixmaster");
  const st = L.createSim(sc, { traffic: "off" });
  st.cars.push({ lane: 2, s: st.s + 20, v: st.v, vd: st.v, b: "thru" });
  eq(L.requestChange(st, 1).reason, "blocked", "blocked");
  eq(st.stats.blocked, 1, "counted");
  st.cars.length = 0;
  ok(L.requestChange(st, 1).ok, "clear now");
  eq(st.lane, 2, "moved");
});

check("a second press during a lane change is queued, not lost", () => {
  const sc = SCENARIOS.find((s) => s.id === "denton-split");
  const st = L.createSim(sc, { traffic: "off" });
  ok(L.requestChange(st, 1).ok, "first change");
  ok(L.requestChange(st, 1).queued, "second queued");
  for (let i = 0; i < 200; i++) L.step(st, 1 / 30);
  eq(st.lane, 2, "both happened");
});

check("the drive grades how early you got into position", () => {
  ok(/calm and early/.test(L.gradeLead(3000)), "over half a mile");
  ok(/half a mile is calmer/.test(L.gradeLead(1500)), "in between");
  ok(/last-second/.test(L.gradeLead(300)), "too late");
});

/* ---- report -------------------------------------------------------- */
if (failures.length) {
  console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log("  ✗ " + f + "\n");
  process.exit(1);
}
console.log(`✓ ${passed} checks passed`);
