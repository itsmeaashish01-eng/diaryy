/* ================================================
   QUANTUM LADDER — exercises.js
   Two things: a small, safe expression reader so an answer can be typed
   the way it's worked out ("sqrt(2)/2", "3pi^2/2", "1.2e-10"), and the
   generators behind the Math Gym — each one makes a fresh problem with
   its own numbers and a worked solution.
   ================================================ */
(function (root) {
  "use strict";
  const P = root.QPhys;

  /* ---- expression reader ------------------------------------------- */
  const FUNCS = {
    sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    exp: Math.exp, ln: Math.log, log: Math.log10, abs: Math.abs,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  };
  const CONSTS = { pi: Math.PI, "π": Math.PI, e: Math.E };

  function tokenize(src) {
    const s = String(src).replace(/×|·/g, "*").replace(/−/g, "-").replace(/√/g, "sqrt").trim();
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (num) { out.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
      const id = /^([a-zA-Z]+|π)/.exec(s.slice(i));
      if (id) { out.push({ t: "id", v: id[0].toLowerCase() }); i += id[0].length; continue; }
      if ("+-*/^()".includes(ch)) { out.push({ t: ch }); i++; continue; }
      throw new Error(`Can't read "${ch}"`);
    }
    // Implicit multiplication: 2pi, 3(…), (…)(…), pi sqrt(2)
    const joined = [];
    for (let k = 0; k < out.length; k++) {
      const a = joined[joined.length - 1], b = out[k];
      const endsValue = a && (a.t === "num" || a.t === ")" || (a.t === "id" && !(a.v in FUNCS)));
      const startsValue = b.t === "num" || b.t === "(" || b.t === "id";
      if (endsValue && startsValue) joined.push({ t: "*" });
      joined.push(b);
    }
    return joined;
  }

  function evaluate(src) {
    const tk = tokenize(src);
    if (!tk.length) throw new Error("Type an answer first");
    let pos = 0;
    const peek = () => tk[pos], eat = (t) => {
      if (!tk[pos] || tk[pos].t !== t) throw new Error(`Expected "${t}"`);
      return tk[pos++];
    };
    function expr() {
      let v = term();
      while (peek() && (peek().t === "+" || peek().t === "-")) v = tk[pos++].t === "+" ? v + term() : v - term();
      return v;
    }
    function term() {
      let v = unary();
      while (peek() && (peek().t === "*" || peek().t === "/")) v = tk[pos++].t === "*" ? v * unary() : v / unary();
      return v;
    }
    function unary() {
      if (peek() && peek().t === "-") { pos++; return -unary(); }
      if (peek() && peek().t === "+") { pos++; return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      if (peek() && peek().t === "^") { pos++; return Math.pow(base, unary()); }
      return base;
    }
    function atom() {
      const t = peek();
      if (!t) throw new Error("The expression ends too early");
      if (t.t === "num") { pos++; return t.v; }
      if (t.t === "(") { pos++; const v = expr(); eat(")"); return v; }
      if (t.t === "id") {
        pos++;
        if (t.v in FUNCS) {
          if (peek() && peek().t === "(") { pos++; const v = expr(); eat(")"); return FUNCS[t.v](v); }
          return FUNCS[t.v](power());
        }
        if (t.v in CONSTS) return CONSTS[t.v];
        throw new Error(`Unknown name "${t.v}"`);
      }
      throw new Error(`Unexpected "${t.t}"`);
    }
    const v = expr();
    if (pos !== tk.length) throw new Error("Couldn't read the end of that");
    if (!Number.isFinite(v)) throw new Error("That doesn't come out to a finite number");
    return v;
  }

  // Relative tolerance, with an absolute floor so "0" can be right.
  function isClose(got, want, tol = 0.01) {
    if (Math.abs(want) < 1e-9) return Math.abs(got) < Math.max(tol, 1e-6);
    return Math.abs(got - want) <= tol * Math.abs(want);
  }

  function checkAnswer(input, want, tol) {
    try {
      const v = evaluate(input);
      return { ok: isClose(v, want, tol), value: v };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /* ---- formatting for prompts and solutions ------------------------ */
  function fmt(v, sig = 4) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e5) return String(parseFloat(v.toPrecision(sig)));
    const [m, e] = v.toExponential(sig - 1).split("e");
    return `${parseFloat(m)}\\times 10^{${parseInt(e, 10)}}`;
  }
  const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
  const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const HC = 1239.84198; // eV·nm

  /* ---- generators ---------------------------------------------------
     Each make(rand) returns { q, answer, tol, unit, steps }. q and steps
     are HTML with inline TeX in \( … \). */
  const gym = [
    {
      id: "complex-modulus", topic: "Complex numbers", level: 0,
      make(r) {
        const a = int(r, -6, 6) || 2, b = int(r, -6, 6) || 3, c = int(r, 1, 5), d = int(r, -5, 5) || 1;
        const m = Math.hypot(a, b) * Math.hypot(c, d);
        return {
          q: `Let \\(z_1 = ${a} ${b < 0 ? "-" : "+"} ${Math.abs(b)}i\\) and \\(z_2 = ${c} ${d < 0 ? "-" : "+"} ${Math.abs(d)}i\\). Find \\(|z_1 z_2|\\).`,
          answer: m, tol: 0.005, unit: "",
          steps: `Moduli multiply: \\(|z_1 z_2| = |z_1||z_2| = \\sqrt{${a * a + b * b}}\\,\\sqrt{${c * c + d * d}} = \\sqrt{${(a * a + b * b) * (c * c + d * d)}} \\approx ${fmt(m)}\\). No need to multiply the numbers out first.`,
        };
      },
    },
    {
      id: "phasor-interference", topic: "Complex numbers", level: 0,
      make(r) {
        const deg = pick(r, [0, 30, 45, 60, 90, 120, 135, 150, 180]);
        const phi = (deg * Math.PI) / 180;
        const ans = 2 + 2 * Math.cos(phi);
        return {
          q: `Two paths arrive with equal amplitude and a phase difference of \\(${deg}^\\circ\\). Find \\(|1 + e^{i\\varphi}|^2\\).`,
          answer: ans, tol: 0.005, unit: "",
          steps: `\\(|1+e^{i\\varphi}|^2 = (1+e^{i\\varphi})(1+e^{-i\\varphi}) = 2 + 2\\cos\\varphi = 2 + 2\\cos ${deg}^\\circ = ${fmt(ans)}\\). This is interference in one line: 4 when in phase, 0 when opposite.`,
        };
      },
    },
    {
      id: "eigen-2x2", topic: "Linear algebra", level: 0,
      make(r) {
        const a = int(r, -4, 6), d = int(r, -4, 6), b = int(r, 1, 4);
        const tr = a + d, det = a * d - b * b;
        const disc = Math.sqrt(((a - d) / 2) ** 2 + b * b);
        const hi = tr / 2 + disc;
        return {
          q: `Find the larger eigenvalue of the Hermitian matrix \\(\\begin{pmatrix} ${a} & ${b} \\\\ ${b} & ${d} \\end{pmatrix}\\).`,
          answer: hi, tol: 0.005, unit: "",
          steps: `Solve \\(\\lambda^2 - (\\mathrm{tr})\\lambda + \\det = 0\\) with \\(\\mathrm{tr} = ${tr}\\), \\(\\det = ${det}\\): \\(\\lambda = \\tfrac{${tr}}{2} \\pm \\sqrt{(\\tfrac{${a - d}}{2})^2 + ${b * b}}\\), so \\(\\lambda_{\\max} \\approx ${fmt(hi)}\\). Hermitian matrices always give real roots, because the square root is of a sum of squares.`,
        };
      },
    },
    {
      id: "normalize", topic: "Linear algebra", level: 0,
      make(r) {
        const a = int(r, 1, 5), b = int(r, 1, 5), c = int(r, 0, 4);
        const A = 1 / Math.sqrt(a * a + b * b + c * c);
        return {
          q: `\\(|\\psi\\rangle = A\\,(${a}|0\\rangle + ${b}i\\,|1\\rangle ${c ? `- ${c}|2\\rangle` : ""})\\). Find the positive real \\(A\\) that normalizes it.`,
          answer: A, tol: 0.005, unit: "",
          steps: `\\(\\langle\\psi|\\psi\\rangle = A^2(${a}^2 + |${b}i|^2 ${c ? `+ ${c}^2` : ""}) = ${a * a + b * b + c * c}A^2 = 1\\), so \\(A = 1/\\sqrt{${a * a + b * b + c * c}} \\approx ${fmt(A)}\\). The \\(i\\) drops out because \\(|i|^2 = 1\\).`,
        };
      },
    },
    {
      id: "expectation", topic: "Probability", level: 0,
      make(r) {
        const vals = [int(r, -2, 0), int(r, 1, 2), int(r, 3, 5)];
        let w = [int(r, 1, 5), int(r, 1, 5), int(r, 1, 5)];
        const s = w.reduce((x, y) => x + y, 0);
        const p = w.map((x) => x / s);
        const mean = vals.reduce((acc, v, i) => acc + v * p[i], 0);
        const m2 = vals.reduce((acc, v, i) => acc + v * v * p[i], 0);
        const sd = Math.sqrt(m2 - mean * mean);
        return {
          q: `A measurement gives \\(${vals.join(", ")}\\) with probabilities \\(${w.map((x) => `\\tfrac{${x}}{${s}}`).join(", ")}\\). Find the standard deviation \\(\\Delta A\\).`,
          answer: sd, tol: 0.005, unit: "",
          steps: `\\(\\langle A\\rangle = ${fmt(mean)}\\), \\(\\langle A^2\\rangle = ${fmt(m2)}\\), so \\(\\Delta A = \\sqrt{\\langle A^2\\rangle - \\langle A\\rangle^2} = ${fmt(sd)}\\).`,
        };
      },
    },
    {
      id: "photoelectric", topic: "Early quantum", level: 1,
      make(r) {
        const lam = pick(r, [180, 200, 220, 250, 280, 300, 350]);
        const W = pick(r, [2.1, 2.3, 2.9, 3.7, 4.1, 4.3, 4.7]); // Cs, Na, Ca-ish, Mg, Al, Zn, Cu
        const K = HC / lam - W;
        if (K <= 0) return this.make(r);
        return {
          q: `Light of wavelength \\(${lam}\\,\\mathrm{nm}\\) hits a metal with work function \\(${W}\\,\\mathrm{eV}\\). What is the maximum kinetic energy of an ejected electron, in eV?`,
          answer: K, tol: 0.01, unit: "eV",
          steps: `Photon energy \\(E = hc/\\lambda = 1239.84\\,\\mathrm{eV\\,nm} / ${lam}\\,\\mathrm{nm} = ${fmt(HC / lam)}\\,\\mathrm{eV}\\). Einstein: \\(K_{\\max} = E - W = ${fmt(K)}\\,\\mathrm{eV}\\).`,
        };
      },
    },
    {
      id: "de-broglie", topic: "Early quantum", level: 1,
      make(r) {
        const V = pick(r, [10, 25, 54, 100, 150, 500, 1000]);
        const lam = P.C.h / Math.sqrt(2 * P.C.me * P.C.e * V) * 1e9;
        return {
          q: `An electron is accelerated from rest through \\(${V}\\,\\mathrm{V}\\). Find its de Broglie wavelength in nm.`,
          answer: lam, tol: 0.01, unit: "nm",
          steps: `\\(p = \\sqrt{2 m_e e V}\\), \\(\\lambda = h/p = \\dfrac{${fmt(P.C.h)}}{\\sqrt{2(${fmt(P.C.me)})(${fmt(P.C.e)})(${V})}} = ${fmt(lam)}\\,\\mathrm{nm}\\). Shortcut: \\(\\lambda \\approx 1.226/\\sqrt{V}\\,\\mathrm{nm}\\).${V === 54 ? " (54 V is Davisson and Germer's number: the wavelength matches nickel's atomic spacing.)" : ""}`,
        };
      },
    },
    {
      id: "heisenberg", topic: "Uncertainty", level: 1,
      make(r) {
        const dx = pick(r, [0.05, 0.1, 0.2, 0.5, 1, 10]);
        const dv = P.C.hbar / (2 * P.C.me * dx * 1e-9);
        return {
          q: `An electron is confined to \\(\\Delta x = ${dx}\\,\\mathrm{nm}\\). What is the smallest possible \\(\\Delta v\\), in m/s?`,
          answer: dv, tol: 0.01, unit: "m/s",
          steps: `\\(\\Delta x\\,\\Delta p \\ge \\hbar/2\\) gives \\(\\Delta v \\ge \\dfrac{\\hbar}{2 m_e \\Delta x} = ${fmt(dv)}\\,\\mathrm{m/s}\\). For an atom (\\(\\sim 0.1\\) nm) that's hundreds of km/s, which is why electrons can't sit still in atoms.`,
        };
      },
    },
    {
      id: "box-energy", topic: "Wave mechanics", level: 2,
      make(r) {
        const L = pick(r, [0.2, 0.3, 0.5, 1, 2]);
        const n = int(r, 1, 4);
        const E = (n * n * P.C.h * P.C.h) / (8 * P.C.me * (L * 1e-9) ** 2) / P.C.e;
        return {
          q: `An electron is in an infinite square well of width \\(${L}\\,\\mathrm{nm}\\). Find \\(E_{${n}}\\) in eV.`,
          answer: E, tol: 0.01, unit: "eV",
          steps: `\\(E_n = \\dfrac{n^2 h^2}{8 m_e L^2}\\). For an electron, \\(h^2/8m_e = 0.3760\\,\\mathrm{eV\\,nm^2}\\), so \\(E_{${n}} = ${n * n} \\times 0.3760 / ${L}^2 = ${fmt(E)}\\,\\mathrm{eV}\\).`,
        };
      },
    },
    {
      id: "box-transition", topic: "Wave mechanics", level: 2,
      make(r) {
        const L = pick(r, [0.5, 0.8, 1, 1.2]);
        const n = int(r, 1, 3);
        const e1 = (P.C.h * P.C.h) / (8 * P.C.me * (L * 1e-9) ** 2) / P.C.e;
        const dE = ((n + 1) ** 2 - n * n) * e1;
        const lam = HC / dE;
        return {
          q: `A dye molecule behaves like an electron in a \\(${L}\\,\\mathrm{nm}\\) box. What wavelength (nm) of light drives the \\(n=${n} \\to ${n + 1}\\) transition?`,
          answer: lam, tol: 0.01, unit: "nm",
          steps: `\\(\\Delta E = (${(n + 1) ** 2} - ${n * n})\\,E_1\\) with \\(E_1 = 0.3760/${L}^2 = ${fmt(e1)}\\,\\mathrm{eV}\\), so \\(\\Delta E = ${fmt(dE)}\\,\\mathrm{eV}\\) and \\(\\lambda = 1239.84/\\Delta E = ${fmt(lam)}\\,\\mathrm{nm}\\).`,
        };
      },
    },
    {
      id: "oscillator", topic: "Wave mechanics", level: 2,
      make(r) {
        const hw = pick(r, [0.12, 0.26, 0.36, 0.5]);
        const n = int(r, 0, 5);
        const E = hw * (n + 0.5);
        return {
          q: `A molecular vibration has \\(\\hbar\\omega = ${hw}\\,\\mathrm{eV}\\). What is the energy of level \\(n = ${n}\\), in eV?`,
          answer: E, tol: 0.005, unit: "eV",
          steps: `\\(E_n = \\hbar\\omega\\,(n + \\tfrac12) = ${hw} \\times ${n + 0.5} = ${fmt(E)}\\,\\mathrm{eV}\\). Even \\(n=0\\) has energy: the zero-point motion that uncertainty forces on it.`,
        };
      },
    },
    {
      id: "tunnel", topic: "Wave mechanics", level: 2,
      make(r) {
        const V = pick(r, [5, 8, 10]);
        const E = pick(r, [1, 2, 3, 4]);
        const a = pick(r, [0.1, 0.2, 0.3, 0.5]);
        const kappa = Math.sqrt(2 * P.C.me * (V - E) * P.C.e) / P.C.hbar;
        const T = Math.exp(-2 * kappa * a * 1e-9);
        return {
          q: `Estimate \\(T \\approx e^{-2\\kappa a}\\) for an electron with \\(E = ${E}\\,\\mathrm{eV}\\) meeting a barrier of height \\(${V}\\,\\mathrm{eV}\\) and width \\(${a}\\,\\mathrm{nm}\\).`,
          answer: T, tol: 0.03, unit: "",
          steps: `\\(\\kappa = \\sqrt{2m_e(V-E)}/\\hbar = 5.123\\sqrt{${V - E}}\\,\\mathrm{nm^{-1}} = ${fmt(kappa * 1e-9)}\\,\\mathrm{nm^{-1}}\\), so \\(T \\approx e^{-2 \\times ${fmt(kappa * 1e-9)} \\times ${a}} = ${fmt(T)}\\). Double the width and T is squared, which is why scanning tunnelling microscopes can see single atoms.`,
        };
      },
    },
    {
      id: "spin-prob", topic: "Spin", level: 3,
      make(r) {
        const th = pick(r, [30, 45, 60, 90, 120, 135]);
        const ph = pick(r, [0, 45, 90, 180]);
        const t = (th * Math.PI) / 180, f = (ph * Math.PI) / 180;
        const p = 0.5 * (1 + Math.sin(t) * Math.cos(f));
        return {
          q: `A spin-½ state points along \\(\\theta = ${th}^\\circ,\\ \\varphi = ${ph}^\\circ\\) on the Bloch sphere. What is the probability of \\(+\\hbar/2\\) when \\(S_x\\) is measured?`,
          answer: p, tol: 0.005, unit: "",
          steps: `\\(P(+\\hat n') = \\tfrac12(1 + \\vec r\\cdot\\hat n')\\). Here \\(\\vec r\\cdot\\hat x = \\sin\\theta\\cos\\varphi = ${fmt(Math.sin(t) * Math.cos(f))}\\), so \\(P = ${fmt(p)}\\).`,
        };
      },
    },
    {
      id: "sigma-z", topic: "Spin", level: 3,
      make(r) {
        const a = int(r, 1, 4), b = int(r, 1, 4);
        const ez = (a * a - b * b) / (a * a + b * b);
        return {
          q: `Compute \\(\\langle\\sigma_z\\rangle\\) for \\(|\\psi\\rangle \\propto ${a}|{\\uparrow}\\rangle + ${b}e^{i\\pi/3}|{\\downarrow}\\rangle\\).`,
          answer: ez, tol: 0.005, unit: "",
          steps: `Normalize: probabilities are \\(${a * a}/${a * a + b * b}\\) and \\(${b * b}/${a * a + b * b}\\); the phase doesn't matter for \\(\\sigma_z\\). \\(\\langle\\sigma_z\\rangle = (${a * a} - ${b * b})/${a * a + b * b} = ${fmt(ez)}\\).`,
        };
      },
    },
    {
      id: "hydrogen-line", topic: "Atoms", level: 3,
      make(r) {
        const nf = int(r, 1, 3), ni = nf + int(r, 1, 3);
        const dE = P.C.Ry * (1 / (nf * nf) - 1 / (ni * ni));
        const lam = HC / dE;
        const series = ["Lyman", "Balmer", "Paschen"][nf - 1];
        return {
          q: `Find the wavelength (nm) of the photon emitted when hydrogen drops from \\(n = ${ni}\\) to \\(n = ${nf}\\).`,
          answer: lam, tol: 0.01, unit: "nm",
          steps: `\\(\\Delta E = 13.606\\,(1/${nf}^2 - 1/${ni}^2) = ${fmt(dE)}\\,\\mathrm{eV}\\), \\(\\lambda = 1239.84/\\Delta E = ${fmt(lam)}\\,\\mathrm{nm}\\). This is a ${series} line.`,
        };
      },
    },
    {
      id: "perturb", topic: "Approximation methods", level: 3,
      make(r) {
        const lam = pick(r, [0.02, 0.05, 0.1, 0.2]);
        const n = int(r, 0, 3);
        const first = lam * (n + 0.5);
        return {
          q: `Oscillator with \\(\\hbar=m=\\omega=1\\), perturbed by \\(H' = \\lambda x^2\\), \\(\\lambda = ${lam}\\). Find the first-order energy shift of level \\(n = ${n}\\).`,
          answer: first, tol: 0.005, unit: "",
          steps: `\\(E^{(1)}_n = \\lambda\\langle n|x^2|n\\rangle = \\lambda(n+\\tfrac12) = ${fmt(first)}\\). Exact: the frequency becomes \\(\\sqrt{1+2\\lambda}\\), giving \\(${fmt((n + 0.5) * (Math.sqrt(1 + 2 * lam) - 1))}\\), and the gap is the second-order term \\(-\\lambda^2(n+\\tfrac12)/2\\).`,
        };
      },
    },
    {
      id: "variational", topic: "Approximation methods", level: 3,
      make(r) {
        const w = pick(r, [0.5, 1, 2, 3]);
        return {
          q: `Trial function \\(e^{-\\alpha x^2}\\) for \\(V = \\tfrac12\\omega^2x^2\\), \\(\\omega = ${w}\\) (\\(\\hbar=m=1\\)). \\(\\langle H\\rangle(\\alpha) = \\alpha/2 + \\omega^2/(8\\alpha)\\). Find the minimum value.`,
          answer: w / 2, tol: 0.005, unit: "",
          steps: `\\(d\\langle H\\rangle/d\\alpha = \\tfrac12 - \\omega^2/(8\\alpha^2) = 0 \\Rightarrow \\alpha = \\omega/2\\). Then \\(\\langle H\\rangle = \\omega/4 + \\omega/4 = ${fmt(w / 2)}\\), the exact ground state, because the trial family contains it.`,
        };
      },
    },
    {
      id: "chsh-corr", topic: "Entanglement", level: 4,
      make(r) {
        const a = pick(r, [0, 15, 30, 45]), b = a + pick(r, [22.5, 30, 45, 60, 90, 135]);
        const E = -Math.cos(((b - a) * Math.PI) / 180);
        return {
          q: `Two spins share the singlet state. Alice measures along \\(${a}^\\circ\\), Bob along \\(${b}^\\circ\\) (same plane). Find the correlation \\(E(a,b) = \\langle A B\\rangle\\).`,
          answer: E, tol: 0.01, unit: "",
          steps: `For the singlet \\(E(a,b) = -\\hat a\\cdot\\hat b = -\\cos(${b - a}^\\circ) = ${fmt(E)}\\).`,
        };
      },
    },
    {
      id: "purity", topic: "Entanglement", level: 4,
      make(r) {
        const p = pick(r, [0.5, 0.6, 0.7, 0.8, 0.9]);
        const c = pick(r, [0, 0.1, 0.2, 0.3]);
        const cc = Math.min(c, Math.sqrt(p * (1 - p)));
        const pur = p * p + (1 - p) ** 2 + 2 * cc * cc;
        return {
          q: `A qubit has \\(\\rho = \\begin{pmatrix} ${p} & ${fmt(cc)} \\\\ ${fmt(cc)} & ${fmt(1 - p)} \\end{pmatrix}\\). Find its purity \\(\\mathrm{Tr}\\,\\rho^2\\).`,
          answer: pur, tol: 0.005, unit: "",
          steps: `\\(\\mathrm{Tr}\\,\\rho^2 = \\sum_{ij}|\\rho_{ij}|^2 = ${p}^2 + ${fmt(1 - p)}^2 + 2(${fmt(cc)})^2 = ${fmt(pur)}\\). It's 1 only for a pure state and ½ for the maximally mixed qubit.`,
        };
      },
    },
    {
      id: "fermions", topic: "Many particles", level: 4,
      make(r) {
        const N = pick(r, [2, 3, 4, 5, 6]);
        // N non-interacting spin-½ fermions in a box, energies in units of E1
        let E = 0;
        for (let k = 0; k < N; k++) E += (Math.floor(k / 2) + 1) ** 2;
        return {
          q: `\\(${N}\\) non-interacting spin-½ fermions share a 1-D infinite well with levels \\(E_n = n^2 E_1\\). What is the ground-state energy, in units of \\(E_1\\)?`,
          answer: E, tol: 0.001, unit: "E₁",
          steps: `Pauli allows two per level (spin up and down). Fill from the bottom: ${Array.from({ length: N }, (_, k) => `\\(${(Math.floor(k / 2) + 1) ** 2}\\)`).join(" + ")} \\(= ${E}\\,E_1\\). Bosons would all sit in \\(n=1\\): \\(${N}\\,E_1\\).`,
        };
      },
    },
  ];

  root.QEx = { evaluate, isClose, checkAnswer, fmt, gym, byId: Object.fromEntries(gym.map((g) => [g.id, g])) };
})(typeof window !== "undefined" ? window : globalThis);
