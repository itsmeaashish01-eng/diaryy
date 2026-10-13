/* ================================================
   ANGIO ATLAS — model.js
   Turns the schematic anatomy into a vascular graph, and runs the
   teaching model of a contrast injection on it.

   Nothing here is measured physiology. The model is deliberately simple
   and every number in it is written down below, so it can be read,
   argued with and changed:

   1. TRANSIT. Contrast leaves the catheter tip and travels only in the
      direction of normal flow (point order in anatomy.js), at a speed that
      grows with lumen radius: v = clamp(165·r, 90, 420) mm/s. Arrival time
      at every point is the fastest such path (Dijkstra).
   2. BOLUS. At each point the concentration is a smoothed box: on for the
      injection duration, with edges that blur as the bolus travels
      (dispersion), then off again (washout).
   3. DISTRIBUTION. Contrast reaches every branch downstream of the tip
      undiluted, except where unopacified blood joins it. Those places are
      the assumptions in DEFAULTS, each a single factor:
        basilar — the other vertebral's clear blood (vbMix)
        ACom    — cross-filling of the opposite A2 (acomCross)
        PCom    — ICA blood reaching the PCA (pcomFwd), and vertebral
                  contrast washing back up the PCom (pcomRev, stops at
                  the ICA)
        V4      — reflux down the opposite vertebral to its PICA (vaReflux)
   4. CAPILLARY AND VENOUS. Each arterial end-branch blushes (a gamma
      curve) and then hands contrast to a named venous junction after a
      fixed capillary transit; veins carry it on to the jugular at 140 mm/s.

   The result is a pure function of time: scrubbing to t gives exactly the
   frame playback would have shown at t.
   ================================================ */
(function (AG) {
  "use strict";

  const SPACING = 1.5;        // mm between samples along a vessel
  const V_MIN = 90, V_MAX = 420, V_PER_MM = 165;
  const V_VEIN = 140;         // mm/s
  const T_START = 0.3;        // s from "Inject" to contrast leaving the tip
  const T_CAP = 2.6;          // s capillary transit, end-artery to vein
  const REFLUX_SLOW = 0.5;    // reflux runs against the flow

  const DEFAULTS = {
    acomCross: 0.3,
    pcomFwd: 0.35,
    pcomRev: 0.3,
    vbMix: 0.65,
    vaReflux: 0.6,
    p1Mix: 1,
    fetalPCA: false,
  };

  /* The six catheter positions. dur is the injection duration in seconds;
     the volumes in the note are typical diagnostic figures, given only so
     the duration has a reason. */
  const INJECTIONS = [
    { id: "R_ICA", side: "R", type: "ICA", tip: "R.icaCath", dur: 1.6,
      name: "Right internal carotid artery", note: "e.g. 7 mL at 5 mL/s, tip in the cervical ICA" },
    { id: "L_ICA", side: "L", type: "ICA", tip: "L.icaCath", dur: 1.6,
      name: "Left internal carotid artery", note: "e.g. 7 mL at 5 mL/s, tip in the cervical ICA" },
    { id: "R_ECA", side: "R", type: "ECA", tip: "R.ecaCath", dur: 1.2,
      name: "Right external carotid artery", note: "e.g. 5 mL at 4 mL/s, tip in the proximal ECA" },
    { id: "L_ECA", side: "L", type: "ECA", tip: "L.ecaCath", dur: 1.2,
      name: "Left external carotid artery", note: "e.g. 5 mL at 4 mL/s, tip in the proximal ECA" },
    { id: "R_VA", side: "R", type: "VA", tip: "R.vaCath", dur: 1.4,
      name: "Right vertebral artery", note: "e.g. 6 mL at 4 mL/s, tip in V2" },
    { id: "L_VA", side: "L", type: "VA", tip: "L.vaCath", dur: 1.4,
      name: "Left vertebral artery", note: "e.g. 6 mL at 4 mL/s, tip in V2" },
  ];

  const speed = (r) => Math.max(V_MIN, Math.min(V_MAX, V_PER_MM * r));

  /* ---- smooth curves -------------------------------------------------- */
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    }
    return out;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /* ---- the graph ------------------------------------------------------
     Nodes are sample points. A junction is one shared node, so vessels
     that meet are connected by construction rather than by coincidence of
     coordinates. */
  function buildGraph(anatomy) {
    const J = anatomy.junctions();
    const vessels = anatomy.vessels();
    const nodes = [];           // { p, j: junction name or null }
    const jIndex = {};
    const nodeFor = (ref) => {
      if (!(ref in jIndex)) {
        if (!J[ref]) throw new Error(`unknown junction ${ref}`);
        jIndex[ref] = nodes.length;
        nodes.push({ p: J[ref], j: ref });
      }
      return jIndex[ref];
    };
    const edges = [];

    vessels.forEach((v, vi) => {
      const pts = v.path.map((p) => (typeof p === "string" ? J[p] : p));
      if (pts.some((p) => !p)) throw new Error(`${v.id}: unresolved point`);
      const ids = v.path.map((p) => (typeof p === "string" ? nodeFor(p) : -1));
      const seq = [];   // node indices along the vessel
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        if (i === 0) {
          if (ids[0] < 0) { ids[0] = nodes.length; nodes.push({ p: p1, j: null }); }
          seq.push(ids[0]);
        }
        const n = Math.max(1, Math.ceil(dist(p1, p2) / SPACING));
        for (let s = 1; s < n; s++) {
          nodes.push({ p: catmull(p0, p1, p2, p3, s / n), j: null });
          seq.push(nodes.length - 1);
        }
        if (ids[i + 1] < 0) { ids[i + 1] = nodes.length; nodes.push({ p: p2, j: null }); }
        seq.push(ids[i + 1]);
      }
      // Lengths first, so radius can taper with distance along the vessel.
      let total = 0;
      const cum = [0];
      for (let i = 1; i < seq.length; i++) {
        total += dist(nodes[seq[i - 1]].p, nodes[seq[i]].p);
        cum.push(total);
      }
      v.index = vi;
      v.nodes = seq;
      v.length = total;
      v.cum = cum;
      v.edges = [];
      for (let i = 1; i < seq.length; i++) {
        const frac = total ? (cum[i - 1] + cum[i]) / 2 / total : 0;
        const e = {
          i: edges.length, a: seq[i - 1], b: seq[i], v: vi,
          len: cum[i] - cum[i - 1],
          r: v.r + (v.r1 - v.r) * frac,
          first: i === 1, last: i === seq.length - 1,
          vein: v.kind === "vein",
        };
        edges.push(e);
        v.edges.push(e.i);
      }
    });

    // Adjacency, both ways; whether a direction may be used is decided per
    // simulation, because reflux depends on which vessel was injected.
    const outF = nodes.map(() => []);
    const outR = nodes.map(() => []);
    for (const e of edges) { outF[e.a].push(e.i); outR[e.b].push(e.i); }

    const byId = {};
    vessels.forEach((v) => { byId[v.id] = v; });
    return { nodes, edges, vessels, byId, jIndex, outF, outR };
  }

  /* A point a fraction of the way along a vessel, for labels. */
  function pointAlong(g, v, frac) {
    const target = frac * v.length;
    for (let i = 1; i < v.nodes.length; i++) {
      if (v.cum[i] >= target) {
        const span = v.cum[i] - v.cum[i - 1] || 1;
        const t = (target - v.cum[i - 1]) / span;
        const a = g.nodes[v.nodes[i - 1]].p, b = g.nodes[v.nodes[i]].p;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
    return g.nodes[v.nodes[v.nodes.length - 1]].p;
  }

  /* ---- bolus shapes --------------------------------------------------- */
  // Abramowitz & Stegun 7.1.26; good to ~1e-7, plenty for a teaching curve.
  function erf(x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  // A box of width dur starting at 0, with edges blurred by sigma.
  function box(tau, dur, sigma) {
    const k = 1 / (sigma * Math.SQRT2);
    return 0.5 * (erf(tau * k) - erf((tau - dur) * k));
  }
  // Gamma-variate blush, 1 at its peak.
  function gammaCurve(tau, peak, alpha) {
    if (tau <= 0) return 0;
    const x = tau / peak;
    return Math.pow(x, alpha) * Math.exp(alpha * (1 - x));
  }

  /* ---- simulation ----------------------------------------------------- */
  function simulate(g, injectionId, opts) {
    const inj = INJECTIONS.find((x) => x.id === injectionId);
    if (!inj) throw new Error(`unknown injection ${injectionId}`);
    const A = { ...DEFAULTS, ...(opts || {}) };
    if (A.fetalPCA) { A.pcomFwd = 1; A.p1Mix = 0.15; }
    const factor = (k) => (k == null ? 1 : typeof k === "number" ? k : A[k]);

    const other = inj.side === "R" ? "L" : "R";
    const refluxVessel = inj.type === "VA" ? `${other}.va_v4d` : null;

    const N = g.nodes.length;
    const tNode = new Float64Array(N).fill(Infinity);
    const fNode = new Float64Array(N);
    const stopped = new Uint8Array(N);
    const tEdge = new Float64Array(g.edges.length).fill(Infinity);
    const fEdge = new Float64Array(g.edges.length);
    const dirEdge = new Int8Array(g.edges.length);   // 1 forward, -1 reverse

    const start = g.jIndex[inj.tip];
    tNode[start] = T_START;
    fNode[start] = 1;

    // A binary heap would be quicker; with ~6k nodes a sorted frontier is
    // still instant, and it is easier to read.
    const done = new Uint8Array(N);
    const frontier = [start];
    while (frontier.length) {
      let bi = 0;
      for (let i = 1; i < frontier.length; i++) if (tNode[frontier[i]] < tNode[frontier[bi]]) bi = i;
      const u = frontier[bi];
      frontier[bi] = frontier[frontier.length - 1];
      frontier.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (stopped[u]) continue;

      const step = (ei, forward) => {
        const e = g.edges[ei];
        if (e.vein) return;
        const v = g.vessels[e.v];
        let f = fNode[u], s = speed(e.r), stopAt = false;
        if (forward) {
          if (e.first) f *= factor(v.mix);
        } else {
          const may = v.flow === "both" || v.id === refluxVessel;
          if (!may) return;
          if (v.flow === "both") { if (e.last) f *= factor(v.mixRev); }
          else { if (e.last) f *= A.vaReflux; s *= REFLUX_SLOW; }
          if (v.revStop && e.first) stopAt = true;
        }
        if (f <= 0.001) return;
        const w = forward ? e.b : e.a;
        const t = tNode[u] + e.len / s;
        // tEdge is when contrast enters the edge; the earliest entry wins.
        if (tNode[u] < tEdge[ei]) { tEdge[ei] = tNode[u]; fEdge[ei] = f; dirEdge[ei] = forward ? 1 : -1; }
        if (t < tNode[w]) {
          tNode[w] = t; fNode[w] = f;
          stopped[w] = stopAt ? 1 : 0;
          frontier.push(w);
        }
      };
      for (const ei of g.outF[u]) step(ei, true);
      for (const ei of g.outR[u]) step(ei, false);
    }

    // Edge midpoint arrival, used for drawing.
    const tMid = new Float64Array(g.edges.length).fill(Infinity);
    for (const e of g.edges) {
      if (tEdge[e.i] < Infinity) {
        const s = speed(e.r) * (dirEdge[e.i] < 0 && g.vessels[e.v].flow !== "both" ? REFLUX_SLOW : 1);
        tMid[e.i] = tEdge[e.i] + 0.5 * e.len / s;
      }
    }

    /* Capillary beds: one per arterial end-branch that reached contrast. */
    const beds = [];
    for (const v of g.vessels) {
      if (v.drain === undefined || v.kind !== "artery") continue;
      const lastEdge = v.edges[v.edges.length - 1];
      const tEnd = tEdge[lastEdge] < Infinity ? tNode[v.nodes[v.nodes.length - 1]] : Infinity;
      if (!(tEnd < Infinity)) continue;
      const f = fEdge[lastEdge];
      const weight = v.r * v.r;
      beds.push({ vessel: v, tEnd, f, weight, pos: g.nodes[v.nodes[v.nodes.length - 1]].p,
        mid: pointAlong(g, v, 0.75), spread: [0.55, 0.75, 0.95].map((k) => pointAlong(g, v, k)) });
    }

    /* Venous: for each bed that drains somewhere modelled, which vein
       edges it reaches and how long that takes. */
    const venous = venousPaths(g);
    const vContrib = g.edges.map(() => null);
    for (const b of beds) {
      const d = b.vessel.drain;
      if (!d) continue;
      const reach = venous.from[d];
      if (!reach) continue;
      const tIn = b.tEnd + T_CAP;
      for (const [ei, mm] of reach) {
        (vContrib[ei] = vContrib[ei] || []).push([b.f * b.weight, tIn + mm / V_VEIN, mm]);
      }
    }

    const dur = inj.dur;
    const sigmaA = (t) => 0.12 + 0.08 * t;
    const venousSigma = (mm) => 0.4 + 0.002 * mm;

    /* Phase boundaries, derived from the run itself. */
    const bedEnds = beds.map((b) => b.tEnd).sort((a, b) => a - b);
    const lateArt = bedEnds.length ? bedEnds[Math.floor(bedEnds.length * 0.8)] : T_START + 1;
    const arterialEnd = lateArt + dur * 0.8;
    let venousFirst = Infinity, venousClear = 0;
    vContrib.forEach((list) => list && list.forEach(([, t, mm]) => {
      venousFirst = Math.min(venousFirst, t);
      venousClear = Math.max(venousClear, t + dur + 1.2 + 2 * venousSigma(mm));
    }));
    const hasVenous = venousFirst < Infinity;
    const blushEnd = Math.max(...beds.map((b) => b.tEnd), 0) + 4.5;
    const end = Math.ceil(Math.max(blushEnd, venousClear) + 0.3);
    const phases = [
      { name: "Arterial", from: 0, to: arterialEnd },
      { name: hasVenous ? "Capillary" : "Capillary / parenchymal", from: arterialEnd,
        to: hasVenous ? Math.max(arterialEnd + 0.3, venousFirst + 0.6) : end - 1.5 },
      hasVenous
        ? { name: "Venous", from: Math.max(arterialEnd + 0.3, venousFirst + 0.6), to: end }
        : { name: "Washout (venous drainage not modelled)", from: end - 1.5, to: end },
    ];

    /* What is in the vessels at time t. */
    function at(t) {
      const c = new Float32Array(g.edges.length);
      for (const e of g.edges) {
        if (e.vein) {
          const list = vContrib[e.i];
          if (!list) continue;
          let sum = 0;
          for (const [w, ta, mm] of list) sum += w * box(t - ta, dur + 1.2, venousSigma(mm));
          c[e.i] = Math.min(1, 0.85 * sum / venous.norm[e.i]);
        } else if (tMid[e.i] < Infinity) {
          c[e.i] = fEdge[e.i] * box(t - tMid[e.i], dur, sigmaA(tMid[e.i]));
        }
      }
      const blush = beds.map((b) => b.f * gammaCurve(t - b.tEnd - 0.2, 1.3 + 0.4 * dur, 3) *
        Math.min(1, dur / 1.4));
      return { c, blush };
    }

    /* A per-vessel summary, for the tooltip, the list and the tests. */
    const perVessel = {};
    for (const v of g.vessels) {
      let tFirst = Infinity, fMax = 0, reached = 0, reversed = false;
      for (const ei of v.edges) {
        if (v.kind === "vein") {
          if (vContrib[ei]) { reached++; tFirst = Math.min(tFirst, ...vContrib[ei].map((x) => x[1])); fMax = Math.max(fMax, Math.min(1, vContrib[ei].reduce((s, x) => s + x[0], 0) / venous.norm[ei])); }
        } else if (tMid[ei] < Infinity) {
          reached++;
          tFirst = Math.min(tFirst, tMid[ei]);
          fMax = Math.max(fMax, fEdge[ei]);
          if (dirEdge[ei] < 0) reversed = true;
        }
      }
      perVessel[v.id] = {
        reached: reached / v.edges.length,
        tFirst, f: fMax, reversed,
      };
    }

    return { inj, assumptions: A, at, tMid, fEdge, beds, phases, end, perVessel,
      hasVenous, dur };
  }

  /* Venous reachability is the same for every run, so it is worked out
     once per graph: for each drain junction, every vein edge downstream of
     it with the distance in mm; and for each vein edge, the total weight of
     all beds that could drain through it, which is what "fully
     opacified" means for that vein. */
  function venousPaths(g) {
    if (g._venous) return g._venous;
    const from = {};
    const drains = new Set(g.vessels.filter((v) => v.drain).map((v) => v.drain));
    for (const d of drains) {
      const startNode = g.jIndex[d];
      if (startNode == null) continue;
      const distTo = new Map([[startNode, 0]]);
      const reach = [];
      const queue = [startNode];
      while (queue.length) {
        const u = queue.shift();
        for (const ei of g.outF[u]) {
          const e = g.edges[ei];
          if (!e.vein) continue;
          const dd = distTo.get(u) + e.len;
          reach.push([ei, distTo.get(u) + e.len / 2]);
          if (!distTo.has(e.b) || distTo.get(e.b) > dd) { distTo.set(e.b, dd); queue.push(e.b); }
        }
      }
      // Keep the shortest distance per edge.
      const best = new Map();
      for (const [ei, mm] of reach) if (!best.has(ei) || best.get(ei) > mm) best.set(ei, mm);
      from[d] = [...best.entries()];
    }
    const norm = new Float64Array(g.edges.length).fill(Infinity);
    for (const v of g.vessels) {
      if (!v.drain || !from[v.drain]) continue;
      for (const [ei] of from[v.drain]) norm[ei] = (norm[ei] === Infinity ? 0 : norm[ei]) + v.r * v.r;
    }
    g._venous = { from, norm };
    return g._venous;
  }

  AG.model = { buildGraph, simulate, pointAlong, INJECTIONS, DEFAULTS, speed, box, T_START };
})(window.AG);
