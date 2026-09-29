#!/usr/bin/env node
/* ================================================
   QUANTUM LADDER — selftest.mjs
   The parts that can be checked without a browser.

     node quantum/selftest.mjs

   Every simulation is only as good as its numerics, so this holds them
   to the textbook: box and oscillator levels, unitarity of the time
   stepper, Fourier widths, hydrogen normalization, Tsirelson's bound.
   Then the course itself: every exercise has an answer its own checker
   accepts, every generator's worked answer passes, every lesson points
   at a simulation that exists.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ctx = createContext({ Math, Float64Array, Number, String, Object, Array, Set, Map, JSON, Error, console, parseFloat, parseInt, isFinite });
ctx.globalThis = ctx;
for (const f of ["physics.js", "exercises.js", "curriculum.js"]) runInContext(readFileSync(join(HERE, "js", f), "utf8"), ctx, { filename: f });
const { QPhys: P, QEx: EX, QCourse: C } = ctx;

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) passed++;
  else { failed++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/* ---- eigenstates ---------------------------------------------------- */
{
  const x = P.linspace(0, 1, 602).slice(1, 601);
  const s = P.eigenstates(x, P.potentials.box(x), 5);
  s.forEach((st, n) => check(`box E${n + 1}`, near(st.E, P.exact.box(n + 1, 1), 2e-4), `${st.E} vs ${P.exact.box(n + 1, 1)}`));
  check("box ψ normalized", near(P.integrate(x, s[2].psi.map((v) => v * v)), 1, 1e-9));
  const overlap = P.integrate(x, s[0].psi.map((v, i) => v * s[1].psi[i]));
  check("box ψ1 ⟂ ψ2", Math.abs(overlap) < 1e-6, String(overlap));
  // nodes: ψ_n has n−1 interior sign changes
  s.forEach((st, n) => {
    let flips = 0;
    for (let i = 1; i < st.psi.length; i++) if (st.psi[i] * st.psi[i - 1] < 0) flips++;
    check(`box ψ${n + 1} has ${n} nodes`, flips === n, `got ${flips}`);
  });
}
{
  const x = P.linspace(-8, 8, 802);
  for (const om of [0.5, 1, 2]) {
    const s = P.eigenstates(x, P.potentials.harmonic(x, { omega: om }), 5);
    s.forEach((st, n) => check(`oscillator ω=${om} E${n}`, near(st.E, P.exact.harmonic(n, om), 1e-3), `${st.E}`));
  }
}
{
  // bouncing ball: Airy zeros
  const g = 1, x = P.linspace(0, 14, 1202).slice(1, 1201);
  const s = P.eigenstates(x, P.potentials.linear(x, { slope: g }), 3);
  const airy = [2.33810741, 4.08794944, 5.52055983];
  s.forEach((st, n) => check(`linear E${n}`, near(st.E, airy[n] * Math.cbrt(0.5), 2e-3), `${st.E}`));
}

/* ---- time evolution --------------------------------------------------- */
{
  const x = P.linspace(-60, 60, 1500), V = P.potentials.box(x);
  const w = P.gaussianPacket(x, -10, 2, 1.5);
  const step = P.makePropagator(x, V, 0.01);
  const m0 = P.moments(x, V, w.re, w.im);
  for (let i = 0; i < 400; i++) step(w.re, w.im);
  const m1 = P.moments(x, V, w.re, w.im);
  check("Crank–Nicolson keeps norm", near(m1.norm, 1, 1e-9), String(m1.norm));
  check("free packet conserves ⟨E⟩", near(m1.E, m0.E, 1e-6));
  check("free packet moves at ⟨p⟩", near(m1.x - m0.x, m0.p * 4, 2e-3), `${m1.x - m0.x} vs ${m0.p * 4}`);
  const spreadWant = 2 * Math.sqrt(1 + (4 / (2 * 4)) ** 2);
  check("free packet spreads as σ√(1+(t/2σ²)²)", near(m1.dx, spreadWant, 5e-3), `${m1.dx} vs ${spreadWant}`);
}
{
  // Barrier: packet transmission lands near the plane-wave value when the
  // packet is broad (narrow in energy).
  const x = P.linspace(-150, 150, 4000), V0 = 1, a = 1;
  const V = P.potentials.barrier(x, { at: 0, width: a, height: V0 });
  const k0 = 1.2, w = P.gaussianPacket(x, -60, 15, k0);
  const step = P.makePropagator(x, V, 0.02);
  for (let i = 0; i < 6000; i++) step(w.re, w.im);
  const right = P.norm2(x, w.re, w.im, 2000, 4000);
  // on a grid the barrier is as wide as the cells it covers
  const aEff = V.filter((v) => v > 0).length * (x[1] - x[0]);
  // average the exact T over the packet's energy distribution
  let num = 0, den = 0;
  for (let k = k0 - 0.2; k <= k0 + 0.2; k += 0.002) {
    const wt = Math.exp(-((k - k0) ** 2) * 2 * 15 * 15);
    num += wt * P.exact.transmission(k * k / 2, V0, aEff); den += wt;
  }
  check("barrier transmission matches theory", near(right, num / den, 0.02), `${right} vs ${num / den}`);
}

/* ---- Fourier ---------------------------------------------------------- */
{
  const x = P.linspace(-20, 20, 800);
  for (const s of [0.5, 1, 2]) {
    const w = P.gaussianPacket(x, 0, s, 1);
    const m = P.momentumDistribution(x, w.re, w.im, -15, 17, 800);
    const sp = P.spread(m.p, m.prob);
    check(`Gaussian σx=${s}: Parseval`, near(sp.total, 1, 1e-4), String(sp.total));
    check(`Gaussian σx=${s}: σp = 1/2σx`, near(sp.sd, 1 / (2 * s), 1e-3), String(sp.sd));
    check(`Gaussian σx=${s}: ⟨p⟩ = k0`, near(sp.mean, 1, 1e-4));
  }
}

/* ---- hydrogen ---------------------------------------------------------- */
{
  const r = P.linspace(0, 150, 15000);
  for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 0], [3, 2], [4, 3], [5, 2]]) {
    const norm = P.integrate(r, r.map((rr) => P.radial(n, l, rr) ** 2 * rr * rr));
    check(`R${n}${l} normalized`, near(norm, 1, 1e-4), String(norm));
    const mean = P.integrate(r, r.map((rr) => P.radial(n, l, rr) ** 2 * rr ** 3));
    check(`⟨r⟩ for ${n}${l}`, near(mean, (3 * n * n - l * (l + 1)) / 2, 1e-3), String(mean));
  }
  const th = P.linspace(0, Math.PI, 4000);
  for (const [l, m] of [[0, 0], [1, 1], [2, -1], [3, 2], [4, 0]]) {
    const norm = P.integrate(th, th.map((t) => 2 * Math.PI * P.ylmSquared(l, m, t) * Math.sin(t)));
    check(`Y${l}${m} normalized`, near(norm, 1, 1e-4), String(norm));
  }
  check("hydrogen E1 = −13.606 eV", near(P.exact.hydrogen(1), -13.6057, 1e-4));
}

/* ---- qubits and Bell ---------------------------------------------------- */
{
  const zero = [1, 0, 0, 0];
  const b = P.blochVector(P.apply(P.gates.H, zero));
  check("H|0⟩ points along +x", near(b.x, 1, 1e-12) && Math.abs(b.z) < 1e-12);
  // every named gate equals its rotation up to a global phase
  for (const [g, [n, a]] of Object.entries(P.gateAxes)) {
    const st = P.fromBloch(1.1, 0.7);
    const u = P.blochVector(P.apply(P.gates[g], st)), v = P.blochVector(P.apply(P.rotationAbout(n, a), st));
    check(`gate ${g} = rotation`, near(u.x, v.x, 1e-9) && near(u.y, v.y, 1e-9) && near(u.z, v.z, 1e-9));
  }
  const st = P.fromBloch(Math.PI / 3, 0);
  check("P(+z) = cos²(θ/2)", near(P.probUp(st, { x: 0, y: 0, z: 1 }), 0.75, 1e-12));
  const opt = [0, Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4];
  check("Tsirelson: |S| = 2√2", near(Math.abs(P.bell.chsh(P.bell.quantumE, ...opt)), 2 * Math.SQRT2, 1e-12));
  // the local model never beats 2, whatever the angles
  const rnd = P.rng(7);
  let worst = 0;
  for (let i = 0; i < 2000; i++) {
    const ang = [rnd(), rnd(), rnd(), rnd()].map((v) => v * Math.PI);
    worst = Math.max(worst, Math.abs(P.bell.chsh(P.bell.localE, ...ang)));
  }
  check("local model obeys |S| ≤ 2", worst <= 2 + 1e-9, String(worst));
  // sampled quantum pairs agree with −cos(a−b)
  let sum = 0; const N = 40000;
  for (let i = 0; i < N; i++) { const [A, B] = P.bell.samplePair("quantum", 0, Math.PI / 3, rnd); sum += A * B; }
  check("sampled E(0, 60°) ≈ −½", Math.abs(sum / N + 0.5) < 0.02, String(sum / N));
  let lsum = 0;
  for (let i = 0; i < N; i++) { const [A, B] = P.bell.samplePair("local", 0, Math.PI / 3, rnd); lsum += A * B; }
  check("sampled local E matches its formula", Math.abs(lsum / N - P.bell.localE(0, Math.PI / 3)) < 0.02);
}

/* ---- expression reader --------------------------------------------------- */
{
  const cases = [["2+3*4", 14], ["(2+3)*4", 20], ["2^3^2", 512], ["-2^2", -4], ["sqrt(2)/2", Math.SQRT1_2],
    ["3pi^2/2", 1.5 * Math.PI ** 2], ["1.2e-10", 1.2e-10], ["2(3+1)", 8], ["π", Math.PI], ["e^(i)".replace("i", "1"), Math.E],
    ["√2", Math.SQRT2], ["cos(0) + ln(e)", 2], ["1/3", 1 / 3], ["2 × 3", 6], ["sin pi", 0]];
  for (const [src, want] of cases) {
    let got; try { got = EX.evaluate(src); } catch (e) { got = e.message; }
    check(`evaluate "${src}"`, typeof got === "number" && Math.abs(got - want) < 1e-12 * Math.max(1, Math.abs(want)), String(got));
  }
  for (const bad of ["", "2+", "foo", "(1", "1)", "alert(1)", "1/0"]) {
    let threw = false; try { EX.evaluate(bad); } catch (_) { threw = true; }
    check(`rejects "${bad}"`, threw);
  }
  check("tolerance: 0.3333 ≈ 1/3 at 1%", EX.isClose(0.3333, 1 / 3, 0.01));
  check("tolerance: 0.34 ≉ 1/3 at 1%", !EX.isClose(0.34, 1 / 3, 0.01));
  check("zero answers accept 0", EX.checkAnswer("0", 0, 0.001).ok);
}

/* ---- the course ------------------------------------------------------------ */
{
  const sims = ["phasor", "uncertainty", "doubleslit", "wavepacket", "eigen", "bloch", "hydrogen", "bell"];
  const ids = new Set();
  check("five levels", C.levels.length === 5);
  for (const l of C.lessons) {
    check(`lesson id unique: ${l.id}`, !ids.has(l.id)); ids.add(l.id);
    check(`${l.id}: level exists`, C.levels.some((v) => v.n === l.level));
    check(`${l.id}: has body`, typeof l.body === "string" && l.body.length > 300);
    check(`${l.id}: has exercises`, l.exercises.length >= 2);
    if (l.sim) check(`${l.id}: sim ${l.sim.id} exists`, sims.includes(l.sim.id));
    for (const g of l.gym || []) check(`${l.id}: gym ${g} exists`, !!EX.byId[g]);
    // TeX delimiters balance
    const opens = (l.body.match(/\\\(/g) || []).length, closes = (l.body.match(/\\\)/g) || []).length;
    check(`${l.id}: \\( \\) balance`, opens === closes, `${opens} vs ${closes}`);
    const dO = (l.body.match(/\\\[/g) || []).length, dC = (l.body.match(/\\\]/g) || []).length;
    check(`${l.id}: \\[ \\] balance`, dO === dC);
    l.exercises.forEach((e, i) => {
      const tag = `${l.id} #${i + 1}`;
      if (e.kind === "mc") {
        check(`${tag}: answer index valid`, Number.isInteger(e.answer) && e.answer >= 0 && e.answer < e.options.length);
      } else {
        check(`${tag}: numeric answer finite`, Number.isFinite(e.answer));
        // the answer typed to 4 significant figures must be accepted
        const typed = e.answer === 0 ? "0" : e.answer.toPrecision(4);
        check(`${tag}: 4 s.f. accepted`, EX.checkAnswer(typed, e.answer, e.tol).ok, typed);
      }
      check(`${tag}: has explanation`, typeof e.why === "string" && e.why.length > 0);
    });
    // lessons ordered by level
  }
  const lv = C.lessons.map((l) => l.level);
  check("lessons ordered by level", lv.every((v, i) => i === 0 || v >= lv[i - 1]));
  // every level reachable
  for (const v of C.levels) check(`level ${v.n} has lessons`, C.lessons.some((l) => l.level === v.n));
}

/* ---- gym generators ----------------------------------------------------------- */
for (const g of EX.gym) {
  for (let seed = 1; seed <= 40; seed++) {
    const p = g.make(P.rng(seed * 7919));
    if (!Number.isFinite(p.answer)) { check(`${g.id} seed ${seed}: finite`, false, String(p.answer)); continue; }
    const typed = p.answer === 0 ? "0" : p.answer.toPrecision(4);
    const ok = EX.checkAnswer(typed, p.answer, p.tol).ok;
    const texOk = (p.q.match(/\\\(/g) || []).length === (p.q.match(/\\\)/g) || []).length
      && (p.steps.match(/\\\(/g) || []).length === (p.steps.match(/\\\)/g) || []).length;
    if (!ok || !texOk || !p.q || !p.steps) { check(`${g.id} seed ${seed}`, false, `${typed} ok=${ok} tex=${texOk}`); break; }
    passed++;
  }
}
// spot-check generator answers against independent formulas
{
  const r = P.rng(3);
  const p = EX.byId["box-energy"].make(r);
  const m = /width \\\(([\d.]+)\\,\\mathrm\{nm\}\\\)\. Find \\\(E_\{(\d)\}/.exec(p.q);
  check("box-energy prompt parses", !!m);
  if (m) check("box-energy uses h²/8mL²", near(p.answer, (+m[2]) ** 2 * 0.376 / (+m[1]) ** 2, 2e-3), `${p.answer}`);
  const q = EX.byId["hydrogen-line"].make(P.rng(11));
  const hm = /from \\\(n = (\d)\\\) to \\\(n = (\d)\\\)/.exec(q.q);
  if (hm) check("hydrogen-line Rydberg formula", near(q.answer, 1239.84 / (13.6057 * (1 / hm[2] ** 2 - 1 / hm[1] ** 2)), 1e-3));
}

console.log(`${failed ? "✗" : "✓"} Quantum Ladder: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
