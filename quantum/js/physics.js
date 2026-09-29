/* ================================================
   QUANTUM LADDER — physics.js
   The numerics behind every simulation. No DOM here, so selftest.mjs
   can check it against the textbook answers.

   Units: ħ = m = 1 unless a function says otherwise. Complex arrays are
   kept as a pair of Float64Arrays (re, im), which is what the solvers
   want and what the canvas code reads.
   ================================================ */
(function (root) {
  "use strict";

  /* ---- physical constants (SI) — for the "real units" exercises ---- */
  const C = {
    h: 6.62607015e-34,
    hbar: 1.054571817e-34,
    c: 2.99792458e8,
    e: 1.602176634e-19,
    me: 9.1093837015e-31,
    mp: 1.67262192369e-27,
    a0: 5.29177210903e-11,
    Ry: 13.605693122994, // eV
    kB: 1.380649e-23,
  };

  /* ---- small helpers --------------------------------------------- */
  function linspace(a, b, n) {
    const out = new Float64Array(n);
    const step = (b - a) / (n - 1);
    for (let i = 0; i < n; i++) out[i] = a + i * step;
    return out;
  }

  function factorial(n) {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  }

  // Deterministic RNG, so a seeded exercise shows the same numbers twice.
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- potentials on a grid ---------------------------------------- */
  // Every preset takes the grid and a parameter bag and returns V(x).
  const potentials = {
    box: (x) => new Float64Array(x.length),
    harmonic: (x, p) => x.map((xi) => 0.5 * (p.omega ?? 1) ** 2 * xi * xi),
    finite: (x, p) => x.map((xi) => (Math.abs(xi) < (p.width ?? 2) / 2 ? 0 : p.depth ?? 8)),
    double: (x, p) => {
      const a = p.sep ?? 1.5, b = p.height ?? 4;
      return x.map((xi) => b * ((xi * xi - a * a) / (a * a)) ** 2);
    },
    linear: (x, p) => x.map((xi) => (p.slope ?? 1) * (xi - (p.from ?? 0))),
    barrier: (x, p) => x.map((xi) => (Math.abs(xi - (p.at ?? 0)) < (p.width ?? 0.5) / 2 ? p.height ?? 2 : 0)),
    step: (x, p) => x.map((xi) => (xi > (p.at ?? 0) ? p.height ?? 2 : 0)),
    well: (x, p) => x.map((xi) => (Math.abs(xi - (p.at ?? 0)) < (p.width ?? 1) / 2 ? -(p.height ?? 2) : 0)),
  };

  /* ---- stationary states: H = -½ d²/dx² + V, hard walls at the ends ----
     Finite differences make H a symmetric tridiagonal matrix. Its low
     eigenvalues come from bisection on the Sturm sequence (it counts
     eigenvalues below a trial energy, so it never skips or duplicates
     a level) and the eigenvectors from one or two inverse iterations. */
  function sturmCount(d, e2, lam) {
    let count = 0, q = d[0] - lam;
    if (q < 0) count++;
    for (let i = 1; i < d.length; i++) {
      q = d[i] - lam - e2 / (q === 0 ? 1e-300 : q);
      if (q < 0) count++;
    }
    return count;
  }

  function solveTridiagSym(d, off, rhs) {
    // (tridiag with constant off-diagonal) x = rhs, Thomas algorithm.
    const n = d.length, c = new Float64Array(n), y = new Float64Array(n);
    let m = d[0];
    c[0] = off / m; y[0] = rhs[0] / m;
    for (let i = 1; i < n; i++) {
      m = d[i] - off * c[i - 1];
      if (m === 0) m = 1e-300;
      c[i] = off / m;
      y[i] = (rhs[i] - off * y[i - 1]) / m;
    }
    for (let i = n - 2; i >= 0; i--) y[i] -= c[i] * y[i + 1];
    return y;
  }

  function eigenstates(x, V, count) {
    const n = x.length, h = x[1] - x[0];
    const off = -0.5 / (h * h);
    const d = new Float64Array(n);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      d[i] = 1 / (h * h) + V[i];
      lo = Math.min(lo, d[i] - 2 * Math.abs(off));
      hi = Math.max(hi, d[i] + 2 * Math.abs(off));
    }
    const e2 = off * off, out = [];
    for (let k = 0; k < count; k++) {
      let a = lo, b = hi;
      for (let it = 0; it < 90; it++) {
        const mid = 0.5 * (a + b);
        if (sturmCount(d, e2, mid) > k) b = mid; else a = mid;
      }
      const E = 0.5 * (a + b);
      // Inverse iteration, shifted a hair off E so the solve stays finite.
      const shifted = d.map((v) => v - E - 1e-10 * (1 + Math.abs(E)));
      let v = new Float64Array(n).fill(1).map((_, i) => 1 + 0.01 * Math.sin(i * (k + 1)));
      for (let it = 0; it < 3; it++) {
        v = solveTridiagSym(shifted, off, v);
        let s = 0;
        for (let i = 0; i < n; i++) s += v[i] * v[i];
        s = Math.sqrt(s * h);
        for (let i = 0; i < n; i++) v[i] /= s;
      }
      // Sign convention: positive just right of the left wall.
      let first = 0;
      for (let i = 0; i < n; i++) if (Math.abs(v[i]) > 1e-3) { first = v[i]; break; }
      if (first < 0) for (let i = 0; i < n; i++) v[i] = -v[i];
      out.push({ E, psi: v });
    }
    return out;
  }

  function integrate(x, f) {
    const h = x[1] - x[0];
    let s = 0;
    for (let i = 0; i < f.length; i++) s += f[i];
    return s * h;
  }

  /* ---- time evolution: Crank–Nicolson ------------------------------
     (1 + iHΔt/2) ψⁿ⁺¹ = (1 − iHΔt/2) ψⁿ. Unitary to rounding, so the
     norm staying at 1 is a real test and not a formality. */
  function makePropagator(x, V, dt) {
    const n = x.length, h = x[1] - x[0];
    const a = -0.5 / (h * h); // off-diagonal of H
    const hd = V.map((v) => 1 / (h * h) + v); // diagonal of H
    const half = dt / 2;
    // Left matrix M = 1 + i half H: diag 1 + i half hd, off i half a.
    const offRe = 0, offIm = half * a;
    // Precompute the forward-elimination factors for M once.
    const cRe = new Float64Array(n), cIm = new Float64Array(n);
    const mRe = new Float64Array(n), mIm = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let dr = 1, di = half * hd[i];
      if (i > 0) {
        // d_i − off * c_{i−1}
        dr -= offRe * cRe[i - 1] - offIm * cIm[i - 1];
        di -= offRe * cIm[i - 1] + offIm * cRe[i - 1];
      }
      mRe[i] = dr; mIm[i] = di;
      const den = dr * dr + di * di;
      // c_i = off / m_i
      cRe[i] = (offRe * dr + offIm * di) / den;
      cIm[i] = (offIm * dr - offRe * di) / den;
    }
    const rRe = new Float64Array(n), rIm = new Float64Array(n);

    return function step(re, im) {
      // rhs = (1 − i half H) ψ
      for (let i = 0; i < n; i++) {
        const lr = i > 0 ? re[i - 1] : 0, li = i > 0 ? im[i - 1] : 0;
        const ur = i < n - 1 ? re[i + 1] : 0, ui = i < n - 1 ? im[i + 1] : 0;
        const Hr = hd[i] * re[i] + a * (lr + ur);
        const Hi = hd[i] * im[i] + a * (li + ui);
        rRe[i] = re[i] + half * Hi;
        rIm[i] = im[i] - half * Hr;
      }
      // forward sweep: y_i = (r_i − off y_{i−1}) / m_i
      for (let i = 0; i < n; i++) {
        let nr = rRe[i], ni = rIm[i];
        if (i > 0) {
          nr -= offRe * rRe[i - 1] - offIm * rIm[i - 1];
          ni -= offRe * rIm[i - 1] + offIm * rRe[i - 1];
        }
        const den = mRe[i] * mRe[i] + mIm[i] * mIm[i];
        rRe[i] = (nr * mRe[i] + ni * mIm[i]) / den;
        rIm[i] = (ni * mRe[i] - nr * mIm[i]) / den;
      }
      // back substitution: x_i = y_i − c_i x_{i+1}
      re[n - 1] = rRe[n - 1]; im[n - 1] = rIm[n - 1];
      for (let i = n - 2; i >= 0; i--) {
        re[i] = rRe[i] - (cRe[i] * re[i + 1] - cIm[i] * im[i + 1]);
        im[i] = rIm[i] - (cRe[i] * im[i + 1] + cIm[i] * re[i + 1]);
      }
    };
  }

  function gaussianPacket(x, x0, sigma, k0) {
    const n = x.length, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const g = Math.exp(-((x[i] - x0) ** 2) / (4 * sigma * sigma));
      re[i] = g * Math.cos(k0 * x[i]);
      im[i] = g * Math.sin(k0 * x[i]);
    }
    normalize(x, re, im);
    return { re, im };
  }

  function normalize(x, re, im) {
    const h = x[1] - x[0];
    let s = 0;
    for (let i = 0; i < re.length; i++) s += re[i] * re[i] + (im ? im[i] * im[i] : 0);
    s = Math.sqrt(s * h);
    for (let i = 0; i < re.length; i++) { re[i] /= s; if (im) im[i] /= s; }
  }

  function norm2(x, re, im, from = 0, to = re.length) {
    const h = x[1] - x[0];
    let s = 0;
    for (let i = from; i < to; i++) s += re[i] * re[i] + im[i] * im[i];
    return s * h;
  }

  // ⟨x⟩, Δx, ⟨p⟩, ⟨E⟩ of a complex state on the grid.
  function moments(x, V, re, im) {
    const n = x.length, h = x[1] - x[0];
    let P = 0, X = 0, X2 = 0, Pm = 0, K = 0, U = 0;
    for (let i = 0; i < n; i++) {
      const rho = re[i] * re[i] + im[i] * im[i];
      P += rho; X += x[i] * rho; X2 += x[i] * x[i] * rho; U += V[i] * rho;
      if (i > 0 && i < n - 1) {
        // p = −i d/dx ; ⟨p⟩ = ∫ (re ∂im − im ∂re)
        const dre = (re[i + 1] - re[i - 1]) / (2 * h), dim = (im[i + 1] - im[i - 1]) / (2 * h);
        Pm += re[i] * dim - im[i] * dre;
        const lre = (re[i + 1] - 2 * re[i] + re[i - 1]) / (h * h);
        const lim = (im[i + 1] - 2 * im[i] + im[i - 1]) / (h * h);
        K += -0.5 * (re[i] * lre + im[i] * lim);
      }
    }
    P *= h; X *= h; X2 *= h; Pm *= h; K *= h; U *= h;
    const mx = X / P;
    return { norm: P, x: mx, dx: Math.sqrt(Math.max(0, X2 / P - mx * mx)), p: Pm / P, E: (K + U) / P };
  }

  /* ---- momentum space: plain DFT (grids here are ≤ 512 points) ---- */
  function momentumDistribution(x, re, im, pMin, pMax, m) {
    const h = x[1] - x[0], n = x.length;
    const p = linspace(pMin, pMax, m), prob = new Float64Array(m);
    const scale = h / Math.sqrt(2 * Math.PI);
    for (let j = 0; j < m; j++) {
      let sr = 0, si = 0;
      for (let i = 0; i < n; i++) {
        const c = Math.cos(p[j] * x[i]), s = Math.sin(p[j] * x[i]);
        // φ(p) = (2π)^−½ ∫ ψ(x) e^{−ipx} dx
        sr += re[i] * c + im[i] * s;
        si += im[i] * c - re[i] * s;
      }
      prob[j] = (sr * sr + si * si) * scale * scale;
    }
    return { p, prob };
  }

  function spread(grid, prob) {
    const h = grid[1] - grid[0];
    let P = 0, M = 0, M2 = 0;
    for (let i = 0; i < grid.length; i++) { P += prob[i]; M += grid[i] * prob[i]; M2 += grid[i] ** 2 * prob[i]; }
    P *= h; M *= h; M2 *= h;
    const mean = M / P;
    return { total: P, mean, sd: Math.sqrt(Math.max(0, M2 / P - mean * mean)) };
  }

  /* ---- exact results the simulations are compared against ---------- */
  const exact = {
    box: (n, L) => (n * n * Math.PI * Math.PI) / (2 * L * L), // n = 1, 2, …
    harmonic: (n, omega = 1) => omega * (n + 0.5), // n = 0, 1, …
    hydrogen: (n) => -C.Ry / (n * n), // eV
    // Rectangular barrier, E < V0 or E > V0, ħ = m = 1.
    transmission(E, V0, a) {
      if (Math.abs(E - V0) < 1e-12) return 1 / (1 + (V0 * a * a) / 2);
      if (E < V0) {
        const k = Math.sqrt(2 * (V0 - E));
        const s = Math.sinh(k * a);
        return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
      }
      const k = Math.sqrt(2 * (E - V0));
      const s = Math.sin(k * a);
      return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
    },
  };

  /* ---- hydrogen: ψ_nlm, in Bohr radii ------------------------------ */
  function laguerre(k, alpha, x) {
    // generalized Laguerre L_k^α(x) by the three-term recurrence
    if (k === 0) return 1;
    let l0 = 1, l1 = 1 + alpha - x;
    for (let j = 1; j < k; j++) {
      const l2 = ((2 * j + 1 + alpha - x) * l1 - (j + alpha) * l0) / (j + 1);
      l0 = l1; l1 = l2;
    }
    return l1;
  }

  function legendre(l, m, x) {
    // associated Legendre P_l^m(x), m ≥ 0, Condon–Shortley phase included
    let pmm = 1;
    if (m > 0) {
      const s = Math.sqrt((1 - x) * (1 + x));
      let f = 1;
      for (let i = 1; i <= m; i++) { pmm *= -f * s; f += 2; }
    }
    if (l === m) return pmm;
    let pm1 = x * (2 * m + 1) * pmm;
    if (l === m + 1) return pm1;
    let pll = 0;
    for (let ll = m + 2; ll <= l; ll++) {
      pll = (x * (2 * ll - 1) * pm1 - (ll + m - 1) * pmm) / (ll - m);
      pmm = pm1; pm1 = pll;
    }
    return pll;
  }

  function radial(n, l, r) {
    const rho = (2 * r) / n;
    const N = Math.sqrt((2 / n) ** 3 * factorial(n - l - 1) / (2 * n * factorial(n + l)));
    return N * Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho);
  }

  function ylmSquared(l, m, theta) {
    const am = Math.abs(m);
    const N = ((2 * l + 1) / (4 * Math.PI)) * (factorial(l - am) / factorial(l + am));
    const P = legendre(l, am, Math.cos(theta));
    return N * P * P;
  }

  function hydrogenDensity(n, l, m, r, theta) {
    const R = radial(n, l, r);
    return R * R * ylmSquared(l, m, theta);
  }

  /* ---- two-level systems ------------------------------------------- */
  // A complex 2-vector is [ar, ai, br, bi]; a 2×2 is [[re,im]×4] row-major.
  const s2 = Math.SQRT1_2;
  const gates = {
    I: [[1, 0], [0, 0], [0, 0], [1, 0]],
    X: [[0, 0], [1, 0], [1, 0], [0, 0]],
    Y: [[0, 0], [0, -1], [0, 1], [0, 0]],
    Z: [[1, 0], [0, 0], [0, 0], [-1, 0]],
    H: [[s2, 0], [s2, 0], [s2, 0], [-s2, 0]],
    S: [[1, 0], [0, 0], [0, 0], [0, 1]],
    T: [[1, 0], [0, 0], [0, 0], [s2, s2]],
  };

  function rotation(axis, angle) {
    // exp(−i angle σ_axis / 2)
    const c = Math.cos(angle / 2), s = Math.sin(angle / 2);
    if (axis === "x") return [[c, 0], [0, -s], [0, -s], [c, 0]];
    if (axis === "y") return [[c, 0], [-s, 0], [s, 0], [c, 0]];
    return [[c, -s], [0, 0], [0, 0], [c, s]];
  }

  // exp(−i angle n·σ / 2) about a unit vector n = {x, y, z}
  function rotationAbout(n, angle) {
    const c = Math.cos(angle / 2), s = Math.sin(angle / 2);
    return [[c, -s * n.z], [-s * n.y, -s * n.x], [s * n.y, -s * n.x], [c, s * n.z]];
  }

  // Each named gate is, up to a global phase, a rotation of the sphere.
  const gateAxes = {
    X: [{ x: 1, y: 0, z: 0 }, Math.PI], Y: [{ x: 0, y: 1, z: 0 }, Math.PI],
    Z: [{ x: 0, y: 0, z: 1 }, Math.PI], H: [{ x: s2, y: 0, z: s2 }, Math.PI],
    S: [{ x: 0, y: 0, z: 1 }, Math.PI / 2], T: [{ x: 0, y: 0, z: 1 }, Math.PI / 4],
  };

  function apply(M, v) {
    const [ar, ai, br, bi] = v;
    const mul = (m, r, i) => [m[0] * r - m[1] * i, m[0] * i + m[1] * r];
    const a1 = mul(M[0], ar, ai), a2 = mul(M[1], br, bi);
    const b1 = mul(M[2], ar, ai), b2 = mul(M[3], br, bi);
    return [a1[0] + a2[0], a1[1] + a2[1], b1[0] + b2[0], b1[1] + b2[1]];
  }

  function blochVector(v) {
    const [ar, ai, br, bi] = v;
    // ⟨σx⟩ = 2 Re(a* b), ⟨σy⟩ = 2 Im(a* b), ⟨σz⟩ = |a|² − |b|²
    return {
      x: 2 * (ar * br + ai * bi),
      y: 2 * (ar * bi - ai * br),
      z: ar * ar + ai * ai - br * br - bi * bi,
    };
  }

  function fromBloch(theta, phi) {
    return [Math.cos(theta / 2), 0, Math.sin(theta / 2) * Math.cos(phi), Math.sin(theta / 2) * Math.sin(phi)];
  }

  // Probability of "+" when measuring spin along a unit vector n.
  function probUp(v, n) {
    const b = blochVector(v);
    return 0.5 * (1 + b.x * n.x + b.y * n.y + b.z * n.z);
  }

  /* ---- Bell / CHSH --------------------------------------------------- */
  const bell = {
    // Singlet, analysers in one plane at angles a, b (radians).
    quantumE: (a, b) => -Math.cos(a - b),
    // Best-known local model: shared angle λ, A = sgn cos(a−λ), B = −sgn cos(b−λ).
    localE(a, b) {
      let d = Math.abs(a - b) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      return -1 + (2 * d) / Math.PI;
    },
    chsh(E, a, a2, b, b2) {
      return E(a, b) - E(a, b2) + E(a2, b) + E(a2, b2);
    },
    // One simulated pair: returns [A, B] ∈ {±1}.
    samplePair(model, a, b, rand) {
      if (model === "quantum") {
        const A = rand() < 0.5 ? 1 : -1;
        const same = Math.sin((a - b) / 2) ** 2; // P(B = A) for the singlet
        return [A, rand() < same ? A : -A];
      }
      const lam = rand() * 2 * Math.PI;
      return [Math.cos(a - lam) >= 0 ? 1 : -1, Math.cos(b - lam) >= 0 ? -1 : 1];
    },
  };

  /* ---- double slit (Fraunhofer) ------------------------------------- */
  function slitIntensity(sinT, lambda, d, a, which) {
    const beta = (Math.PI * a * sinT) / lambda;
    const sinc = beta === 0 ? 1 : Math.sin(beta) / beta;
    if (which) return sinc * sinc; // path known: two single-slit patterns add
    const alpha = (Math.PI * d * sinT) / lambda;
    return Math.cos(alpha) ** 2 * sinc * sinc;
  }

  root.QPhys = {
    C, linspace, factorial, rng, potentials, eigenstates, integrate,
    makePropagator, gaussianPacket, normalize, norm2, moments,
    momentumDistribution, spread, exact,
    laguerre, legendre, radial, ylmSquared, hydrogenDensity,
    gates, gateAxes, rotation, rotationAbout, apply, blochVector, fromBloch, probUp,
    bell, slitIntensity,
  };
})(typeof window !== "undefined" ? window : globalThis);
