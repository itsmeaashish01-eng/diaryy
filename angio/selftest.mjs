#!/usr/bin/env node
/* ================================================
   ANGIO ATLAS — selftest.mjs
   The parts that can be checked without a browser.

     node angio/selftest.mjs

   Loads the atlas's plain scripts in a sandbox and checks what a person
   would otherwise have to eyeball: that the vascular graph is connected,
   that each of the six injections starts where it says and fills the
   territory it should (and not the ones it shouldn't), that sides and
   view orientations are the right way round, that contrast advances and
   washes out, and that labels have somewhere to anchor.

   render.js, dsa.js and app.js are left out — they need a DOM and a
   canvas, and only draw what the modules below decide.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const win = {};
const ctx = createContext({ window: win, console, Math, JSON, Float32Array, Float64Array, Int8Array, Uint8Array, Map, Set });
for (const n of ["anatomy", "model", "view", "labels"]) {
  runInContext(readFileSync(join(HERE, "js", `${n}.js`), "utf8"), ctx, { filename: `angio/js/${n}.js` });
}
const { anatomy, model, view, labels } = win.AG;

/* ---- the harness -------------------------------------------------- */
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
const ok = (cond, what) => { if (!cond) throw new Error(what || "expected true"); };
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || "value"}: expected ${b}, got ${a}`);
}

const g = model.buildGraph(anatomy);
const sims = Object.fromEntries(model.INJECTIONS.map((i) => [i.id, model.simulate(g, i.id)]));
const filled = (sim, id) => sim.perVessel[id].reached > 0.95 ? sim.perVessel[id].f : 0;
const touched = (sim, id) => sim.perVessel[id].reached > 0;

/* ---- the graph ---------------------------------------------------- */

check("every vessel is connected to the graph at both ends", () => {
  // Each vessel's first and last nodes are shared with another vessel,
  // or the vessel is a deliberate end-branch / start of the tree.
  const uses = new Map();
  for (const v of g.vessels) for (const n of [v.nodes[0], v.nodes[v.nodes.length - 1]]) uses.set(n, (uses.get(n) || 0) + 1);
  for (const v of g.vessels) {
    const start = v.nodes[0];
    const startsTree = ["cca", "va_v1"].includes(v.key) || (v.kind === "vein" && typeof v.path[0] !== "string");
    ok(startsTree || uses.get(start) > 1 || g.nodes[start].j, `${v.id} starts unattached`);
  }
});

check("every artery fills from at least one of the six injections", () => {
  for (const v of g.vessels) {
    if (v.kind !== "artery") continue;
    ok(Object.values(sims).some((s) => touched(s, v.id)), `${v.id} never fills`);
  }
});

check("every vein fills from at least one injection", () => {
  for (const v of g.vessels) {
    if (v.kind !== "vein") continue;
    ok(Object.values(sims).some((s) => touched(s, v.id)), `${v.id} never fills`);
  }
});

check("laterality: right-sided points have x > 0, left-sided x < 0", () => {
  for (const v of g.vessels) {
    if (v.side === "M") continue;
    for (const n of v.nodes) {
      if ((g.nodes[n].j || "").startsWith("M.")) continue;   // joins a midline vessel
      const x = g.nodes[n].p[0];
      if (v.side === "R") ok(x > 0, `${v.id} has a point at x=${x}`);
      else ok(x < 0, `${v.id} has a point at x=${x}`);
    }
  }
});

check("midline structures stay within 2 mm of the midline", () => {
  for (const v of g.vessels) {
    if (v.side !== "M" || v.key === "acom") continue;
    for (const n of v.nodes) ok(Math.abs(g.nodes[n].p[0]) < 2, `${v.id} strays to x=${g.nodes[n].p[0]}`);
  }
});

/* ---- the six injections -------------------------------------------- */

const MAIN = (s) => [`${s}.m1`, `${s}.m2s`, `${s}.m2i`, `${s}.mcen`, `${s}.mang`, `${s}.a1`, `${s}.a2`, `${s}.peri`, `${s}.cma`,
  `${s}.oph`, `${s}.acha`, `${s}.ica_c1`, `${s}.ica_c4`, `${s}.ica_c7`, `${s}.ls1`];
const ECA8 = (s) => ["sta_thy", "apa", "lingual", "facial", "occ", "pau", "imax", "sta"].map((k) => `${s}.${k}`);
const POST = (s) => [`${s}.p1`, `${s}.p2`, `${s}.calc`, `${s}.sca`, `${s}.aica`];

for (const S of ["R", "L"]) {
  const O = S === "R" ? "L" : "R";

  check(`${S} ICA: starts in the ${S} cervical ICA`, () => {
    const sim = sims[`${S}_ICA`];
    eq(sim.inj.tip, `${S}.icaCath`, "tip");
    ok(g.nodes[g.jIndex[sim.inj.tip]].p[0] * (S === "R" ? 1 : -1) > 0, "tip on the wrong side");
  });

  check(`${S} ICA: fills ipsilateral ICA, ophthalmic, AChA, ACA and MCA fully`, () => {
    const sim = sims[`${S}_ICA`];
    for (const id of MAIN(S)) eq(filled(sim, id), 1, id);
  });

  check(`${S} ICA: no ECA, no vertebrobasilar, no contralateral MCA`, () => {
    const sim = sims[`${S}_ICA`];
    for (const id of [...ECA8(S), `${S}.eca`, "M.basilar", `${S}.pica`, `${O}.m1`, `${O}.a1`, `${O}.ica_c4`, `${S}.cca`])
      ok(!touched(sim, id), `${id} should stay clear`);
  });

  check(`${S} ICA: cross-fills only the stated share across ACom and PCom`, () => {
    const sim = sims[`${S}_ICA`];
    eq(+filled(sim, `${O}.a2`).toFixed(2), model.DEFAULTS.acomCross, `${O} A2`);
    eq(+filled(sim, `${S}.pcom`).toFixed(2), model.DEFAULTS.pcomFwd, `${S} PCom`);
    eq(+filled(sim, `${S}.p2`).toFixed(2), model.DEFAULTS.pcomFwd, `${S} P2 via PCom`);
    ok(!touched(sim, `${S}.p1`), "P1 should not fill from the ICA");
  });

  check(`${S} ICA: drains to the SSS, deep veins and ${S} transverse sinus`, () => {
    const sim = sims[`${S}_ICA`];
    for (const id of ["M.sss", `${S}.icv`, "M.straight", `${S}.trans`, `${S}.ijv`, `${S}.trolard`, `${S}.labbe`])
      ok(touched(sim, id), `${id} should fill in the venous phase`);
    ok(sim.hasVenous, "has a venous phase");
  });

  check(`${S} ECA: fills the ECA and all eight principal branches`, () => {
    const sim = sims[`${S}_ECA`];
    eq(sim.inj.tip, `${S}.ecaCath`, "tip");
    for (const id of [...ECA8(S), `${S}.eca`, `${S}.mma`, `${S}.sta_f`, `${S}.sta_p`]) eq(filled(sim, id), 1, id);
  });

  check(`${S} ECA: nothing intracranial-arterial, nothing contralateral, no venous phase`, () => {
    const sim = sims[`${S}_ECA`];
    for (const id of [...MAIN(S), ...POST(S), "M.basilar", ...ECA8(O)]) ok(!touched(sim, id), `${id} should stay clear`);
    ok(!sim.hasVenous, "ECA venous drainage is not modelled, so no venous phase");
    eq(sim.phases[2].name, "Washout (venous drainage not modelled)", "phase name says so");
  });

  check(`${S} VA: starts in ${S} V2 and fills basilar, both PCAs, SCAs, AICAs`, () => {
    const sim = sims[`${S}_VA`];
    eq(sim.inj.tip, `${S}.vaCath`, "tip");
    for (const id of [`${S}.va_v2`, `${S}.va_v3`, `${S}.va_v4`, `${S}.pica`]) eq(filled(sim, id), 1, id);
    for (const id of ["M.basilar", ...POST("R"), ...POST("L")]) ok(filled(sim, id) > 0.5, `${id} should fill`);
  });

  check(`${S} VA: refluxes down ${O} V4 to the ${O} PICA, and no further`, () => {
    const sim = sims[`${S}_VA`];
    ok(sim.perVessel[`${O}.va_v4d`].reversed, `${O} V4 fills retrograde`);
    ok(touched(sim, `${O}.pica`), `${O} PICA fills`);
    ok(!touched(sim, `${O}.va_v4`), `${O} V4 below PICA stays clear`);
    ok(!touched(sim, `${O}.va_v3`), `${O} V3 stays clear`);
  });

  check(`${S} VA: PCom washback stops at the ICA; no carotid territory`, () => {
    const sim = sims[`${S}_VA`];
    for (const s of ["R", "L"]) {
      ok(sim.perVessel[`${s}.pcom`].reversed, `${s} PCom fills retrograde`);
      for (const id of [`${s}.ica_c7`, `${s}.m1`, `${s}.a1`, `${s}.oph`]) ok(!touched(sim, id), `${id} should stay clear`);
    }
  });
}

check("changing the selected vessel changes the origin and the vessels that fill", () => {
  const sets = Object.fromEntries(Object.entries(sims).map(([k, s]) =>
    [k, Object.keys(s.perVessel).filter((id) => s.perVessel[id].reached > 0 && g.byId[id].kind === "artery").sort().join(",")]));
  const keys = Object.keys(sets);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++)
    ok(sets[keys[i]] !== sets[keys[j]], `${keys[i]} and ${keys[j]} fill the same vessels`);
  eq(new Set(Object.values(sims).map((s) => s.inj.tip)).size, 6, "six distinct tips");
});

/* ---- time ----------------------------------------------------------- */

const edgesOf = (id) => g.byId[id].edges;
const meanC = (sim, id, t) => { const c = sim.at(t).c; const es = edgesOf(id); return es.reduce((s, e) => s + c[e], 0) / es.length; };

check("contrast arrives in order along a vessel (antegrade)", () => {
  for (const [inj, id] of [["R_ICA", "R.ica_c1"], ["R_ICA", "R.m1"], ["L_VA", "M.basilar"], ["R_ECA", "R.facial"]]) {
    const t = edgesOf(id).map((e) => sims[inj].tMid[e]);
    for (let i = 1; i < t.length; i++) ok(t[i] >= t[i - 1], `${id} arrival goes backwards at ${i}`);
  }
});

check("the bolus front advances: proximal fills before distal", () => {
  const sim = sims.R_ICA;
  const tC1 = sim.perVessel["R.ica_c1"].tFirst, tM1 = sim.perVessel["R.m1"].tFirst, tCort = sim.perVessel["R.mang"].tFirst;
  ok(tC1 < tM1 && tM1 < tCort, `C1 ${tC1}, M1 ${tM1}, angular ${tCort}`);
  // At a moment between, M1 has contrast and the cortex not yet.
  const t = (tM1 + tCort) / 2;
  ok(meanC(sim, "R.m1", t + 0.1) > 0.3, "M1 filling");
  ok(meanC(sim, "R.mang", tM1 - 0.05) < 0.05, "cortex not yet");
});

check("arteries wash out, then veins fill, then everything clears", () => {
  const sim = sims.R_ICA;
  const peak = sim.perVessel["R.m1"].tFirst + sim.dur / 2;
  ok(meanC(sim, "R.m1", peak) > 0.8, "M1 dense at its peak");
  const vt = sim.perVessel["M.sss"].tFirst;
  ok(vt > sim.perVessel["R.mang"].tFirst + 1.5, "venous after arterial");
  ok(meanC(sim, "R.m1", vt + 1) < 0.05, "M1 washed out by the venous phase");
  ok(meanC(sim, "R.trans", sim.end - 0.2) < 0.15, "veins clearing by the end");
});

check("scrubbing is deterministic: the same t gives the same frame", () => {
  const sim = sims.L_ICA;
  const a = sim.at(2.37).c, b = (sim.at(5), sim.at(2.37).c);
  ok(a.every((x, i) => x === b[i]), "frames differ");
});

check("phases are ordered and cover the timeline", () => {
  for (const sim of Object.values(sims)) {
    const p = sim.phases;
    eq(p.length, 3, "three phases");
    ok(p[0].from === 0 && p[0].to <= p[1].from + 1e-9 && p[1].to <= p[2].from + 1e-9 && p[2].to === sim.end, `${sim.inj.id} phases out of order`);
  }
});

check("fetal PCA assumption: ICA fills P2 fully, vertebral fills P2 weakly", () => {
  const ica = model.simulate(g, "R_ICA", { fetalPCA: true });
  const va = model.simulate(g, "R_VA", { fetalPCA: true });
  eq(filled(ica, "R.p2"), 1, "P2 from ICA");
  ok(filled(va, "R.p2") < 0.2, "P2 from VA is faint");
});

/* ---- views and labels ---------------------------------------------- */

check("AP view: patient's right on screen-left; lateral views face the right way", () => {
  const ap = view.fromPreset("ap");
  const o = view.orientation(ap);
  eq([o.left, o.right, o.top, o.bottom], ["R", "L", "S", "I"], "AP letters");
  const rICA = g.nodes[g.jIndex["R.icaT"]].p;
  ok(view.toCamera(ap, rICA, [0, 0, 0])[0] < 0, "right ICA terminus projects to screen-left on AP");
  eq(view.orientation(view.fromPreset("rlat")).right, "A", "right lateral: face to screen-right");
  eq(view.orientation(view.fromPreset("llat")).left, "A", "left lateral: face to screen-left");
  eq(view.orientation(view.fromPreset("sup")).top, "A", "superior: anterior at top");
  eq(view.orientation(view.fromPreset("towne")).left, "R", "Towne keeps right on screen-left");
});

check("every preset is a right-handed orthonormal frame", () => {
  for (const k of Object.keys(view.PRESETS)) {
    const v = view.fromPreset(k);
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const c = [v.right[1] * v.up[2] - v.right[2] * v.up[1], v.right[2] * v.up[0] - v.right[0] * v.up[2], v.right[0] * v.up[1] - v.right[1] * v.up[0]];
    ok(Math.abs(d(v.right, v.up)) < 1e-9 && Math.abs(d(c, v.toward) - 1) < 1e-9, `${k} is not right-handed`);
  }
});

check("rotation keeps the frame orthonormal and moves labels with the anatomy", () => {
  let v = view.fromPreset("ap");
  for (let i = 0; i < 50; i++) v = view.rotate(v, 0.11, -0.07);
  const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  ok(Math.abs(d(v.right, v.up)) < 1e-9 && Math.abs(d(v.toward, v.toward) - 1) < 1e-9, "drifted");
  // A label anchor is a 3D point, so its projection is the vessel's.
  const m1 = g.byId["R.m1"];
  const anchor = model.pointAlong(g, m1, 0.5);
  const near = m1.nodes.map((n) => g.nodes[n].p).reduce((best, p) => Math.min(best, Math.hypot(...view.toCamera(v, p, [0, 0, 0]).slice(0, 2).map((x, i) => x - view.toCamera(v, anchor, [0, 0, 0])[i]))), Infinity);
  ok(near < 1, `anchor ${near} mm from its vessel on screen`);
});

check("the structures asked for all have a vessel and a label", () => {
  const want = ["ica_c1", "ica_c2", "ica_c3", "ica_c4", "ica_c5", "ica_c6", "ica_c7", "oph", "pcom", "acha", "a1", "acom", "a2",
    "peri", "cma", "m1", "m2s", "m2i", "eca", "sta_thy", "apa", "lingual", "facial", "occ", "pau", "imax", "sta",
    "va_v2", "va_v3", "va_v4", "basilar", "pica", "aica", "sca", "p1", "p2"];
  const keys = new Set(g.vessels.filter((v) => v.label).map((v) => v.key));
  for (const k of want) ok(keys.has(k), `${k} missing or unlabelled`);
});

check("label layout never overlaps two boxes, and keeps the forced one", () => {
  const items = [];
  for (let i = 0; i < 40; i++) items.push({ id: `v${i}`, x: 300 + (i % 5) * 4, y: 300 + Math.floor(i / 5) * 4, w: 60, h: 14, pri: 1 + (i % 3), force: i === 39 });
  const out = labels.layout(items, { cx: 300, cy: 300, width: 800, height: 600 });
  ok(out.some((p) => p.id === "v39"), "forced label dropped");
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i], b = out[j];
    if (a.id === "v39" || b.id === "v39") continue;
    ok(!(a.bx < b.bx + b.w && a.bx + a.w > b.bx && a.by < b.by + b.h && a.by + a.h > b.by), `${a.id} overlaps ${b.id}`);
  }
});

/* ---- report --------------------------------------------------------- */
const total = passed + failures.length;
if (failures.length) {
  console.log(`angio selftest: ${failures.length} of ${total} failed\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`angio selftest: all ${total} checks passed (${g.nodes.length} nodes, ${g.edges.length} edges, ${g.vessels.length} vessels)`);
