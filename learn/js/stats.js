/* ================================================
   CODE CLINIC — stats.js
   The numbers behind the research track: descriptive statistics, 2×2
   tables, stratified estimates, a handful of tests, Kaplan–Meier and the
   log-rank test — plus the simulated cohort the lessons analyse.

   Written as one self-contained function so it can be shipped into the
   exercise runner as source: when an exercise asks you to write a
   Kaplan–Meier estimator, this is the reference yours is checked
   against. selftest.mjs pins its answers to published values and to
   scipy / statsmodels / lifelines output.

   Every distribution function here is a standard numerical recipe
   (Lanczos log-gamma, series / continued-fraction incomplete gamma and
   beta), accurate to well past the decimal places anyone reports.
   ================================================ */
window.CC = window.CC || {};

function codeClinicStats() {
  "use strict";

  const EPS = 1e-15, FPMIN = 1e-300, MAXIT = 500;

  /* The course's one cohort. Chosen from thousands of seeds for a
     cohort that tells the confounding story cleanly: a crude effect that
     looks decisive, an adjusted one near the simulated truth (OR ≈ 0.78),
     and nothing else — sex, diabetes — out of balance by chance. Every
     number the lessons quote is computed from it. */
  const SEED = 2553;
  const Z975 = 1.959963984540054;

  /* ---- describing one variable --------------------------------------- */

  const isNum = (x) => typeof x === "number" && Number.isFinite(x);
  const nums = (xs) => (xs || []).filter(isNum);

  function mean(xs) {
    const v = nums(xs);
    if (!v.length) return NaN;
    return v.reduce((s, x) => s + x, 0) / v.length;
  }

  /* Sample variance (n − 1): the one every paper means by SD. */
  function variance(xs) {
    const v = nums(xs);
    if (v.length < 2) return NaN;
    const m = mean(v);
    return v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1);
  }
  const sd = (xs) => Math.sqrt(variance(xs));

  /* Linear interpolation between order statistics — R's default (type 7),
     numpy's default, and what Excel's QUARTILE.INC does. */
  function quantile(xs, p) {
    const v = nums(xs).sort((a, b) => a - b);
    if (!v.length) return NaN;
    const h = (v.length - 1) * p;
    const lo = Math.floor(h), hi = Math.ceil(h);
    return v[lo] + (h - lo) * (v[hi] - v[lo]);
  }
  const median = (xs) => quantile(xs, 0.5);

  function summary(xs) {
    const all = xs || [];
    const v = nums(all);
    return {
      n: v.length,
      missing: all.length - v.length,
      mean: mean(v), sd: sd(v),
      median: median(v), q1: quantile(v, 0.25), q3: quantile(v, 0.75),
      min: v.length ? Math.min(...v) : NaN,
      max: v.length ? Math.max(...v) : NaN,
    };
  }

  /* ---- special functions ------------------------------------------------ */

  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  function gammaln(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaln(1 - x);
    const z = x - 1;
    let a = LANCZOS[0];
    const t = z + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Regularised lower incomplete gamma P(a, x), by series.
  function gser(a, x) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < MAXIT; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  // Regularised upper incomplete gamma Q(a, x), by continued fraction.
  function gcf(a, x) {
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < MAXIT; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  }
  function gammaP(a, x) {
    if (x <= 0) return 0;
    return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
  }
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    return x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
  }

  function erfc(x) {
    return x >= 0 ? gammaQ(0.5, x * x) : 2 - gammaQ(0.5, x * x);
  }
  const normalCdf = (z) => 0.5 * erfc(-z / Math.SQRT2);
  /* Two-sided p-value for a z statistic. */
  const zP = (z) => erfc(Math.abs(z) / Math.SQRT2);

  /* Upper tail of chi-square with df degrees of freedom. */
  const chiSquareP = (x, df) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));

  function betacf(a, b, x) {
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  /* Regularised incomplete beta I_x(a, b). */
  function betaI(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }

  /* Two-sided p-value for Student's t with df degrees of freedom. */
  const tP = (t, df) => betaI(df / 2, 0.5, df / (df + t * t));

  /* The t you multiply a standard error by for a (1 − alpha) interval.
     Found by bisection on tP, which is monotone — 80 halvings is far past
     double precision. */
  function tCritical(df, alpha) {
    const a = alpha == null ? 0.05 : alpha;
    let lo = 0, hi = 1e4;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (tP(mid, df) > a) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ---- comparing two groups ---------------------------------------------- */

  /* Welch's t-test: no assumption that the two groups share a variance,
     which is the safer default and what R's t.test does unless told. */
  function welchT(xs, ys) {
    const a = nums(xs), b = nums(ys);
    const m1 = mean(a), m2 = mean(b), v1 = variance(a), v2 = variance(b);
    const n1 = a.length, n2 = b.length;
    const se2 = v1 / n1 + v2 / n2;
    const se = Math.sqrt(se2);
    const t = (m1 - m2) / se;
    const df = (se2 * se2) / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
    const tc = tCritical(df);
    return { t, df, p: tP(t, df), diff: m1 - m2, ci: [m1 - m2 - tc * se, m1 - m2 + tc * se], se };
  }

  /* Average ranks, ties sharing the mean of the ranks they span. */
  function ranks(values) {
    const idx = values.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(values.length);
    const ties = [];
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      if (j > i) ties.push(j - i + 1);
      i = j + 1;
    }
    return { r, ties };
  }

  /* Mann–Whitney U (Wilcoxon rank-sum), normal approximation with tie and
     continuity corrections — scipy's method="asymptotic". */
  function mannWhitney(xs, ys) {
    const a = nums(xs), b = nums(ys);
    const n1 = a.length, n2 = b.length, n = n1 + n2;
    const { r, ties } = ranks(a.concat(b));
    const r1 = r.slice(0, n1).reduce((s, x) => s + x, 0);
    const u1 = r1 - (n1 * (n1 + 1)) / 2;
    const u2 = n1 * n2 - u1;
    const mu = (n1 * n2) / 2;
    const tieTerm = ties.reduce((s, t) => s + (t * t * t - t), 0);
    const sigma = Math.sqrt(((n1 * n2) / 12) * ((n + 1) - tieTerm / (n * (n - 1))));
    const u = Math.max(u1, u2);
    const z = sigma > 0 ? (u - mu - 0.5) / sigma : 0;
    return { u1, u2, z, p: Math.min(1, 2 * (1 - normalCdf(z))) };
  }

  /* ---- 2×2 tables --------------------------------------------------------- */
  /*
                    outcome   no outcome
       exposed         a          b
       unexposed       c          d
  */

  const lnfact = (n) => gammaln(n + 1);
  function hyperP(a, b, c, d) {
    return Math.exp(lnfact(a + b) + lnfact(c + d) + lnfact(a + c) + lnfact(b + d)
      - lnfact(a) - lnfact(b) - lnfact(c) - lnfact(d) - lnfact(a + b + c + d));
  }

  /* Fisher's exact test, two-sided: every table with the same margins that
     is no more likely than the one observed. */
  function fisherExact(a, b, c, d) {
    const r1 = a + b, c1 = a + c, n = a + b + c + d;
    const pObs = hyperP(a, b, c, d);
    let p = 0;
    for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) {
      const px = hyperP(x, r1 - x, c1 - x, n - r1 - c1 + x);
      if (px <= pObs * (1 + 1e-7)) p += px;
    }
    return Math.min(1, p);
  }

  function twoByTwo(a, b, c, d) {
    const n1 = a + b, n0 = c + d, n = n1 + n0;
    const p1 = a / n1, p0 = c / n0;
    /* A zero cell makes a ratio infinite and its log-SE undefined. Adding
       a half to every cell (Haldane–Anscombe) is the usual fix — and the
       result says when it was applied. */
    const corrected = [a, b, c, d].some((x) => x === 0);
    const k = corrected ? 0.5 : 0;
    const A = a + k, B = b + k, C = c + k, D = d + k;

    const rr = (A / (A + B)) / (C / (C + D));
    const seLnRR = Math.sqrt(1 / A - 1 / (A + B) + 1 / C - 1 / (C + D));
    const or = (A * D) / (B * C);
    const seLnOR = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D);
    const rd = p1 - p0;
    const seRD = Math.sqrt((p1 * (1 - p1)) / n1 + (p0 * (1 - p0)) / n0);

    const m1 = a + c, m0 = b + d;
    const expected = [(n1 * m1) / n, (n1 * m0) / n, (n0 * m1) / n, (n0 * m0) / n];
    const chi2 = (n * (a * d - b * c) ** 2) / (n1 * n0 * m1 * m0);
    const smallExpected = expected.some((e) => e < 5);

    return {
      n, riskExposed: p1, riskUnexposed: p0,
      rr, rrCI: [rr * Math.exp(-Z975 * seLnRR), rr * Math.exp(Z975 * seLnRR)],
      or, orCI: [or * Math.exp(-Z975 * seLnOR), or * Math.exp(Z975 * seLnOR)],
      rd, rdCI: [rd - Z975 * seRD, rd + Z975 * seRD],
      nnt: rd === 0 ? Infinity : 1 / Math.abs(rd),
      chi2, p: chiSquareP(chi2, 1),
      fisherP: smallExpected ? fisherExact(a, b, c, d) : null,
      expected, smallExpected, corrected,
    };
  }

  /* Mantel–Haenszel pooled odds ratio and risk ratio across strata, with
     the Robins–Breslow–Greenland and Greenland–Robins variances. With one
     stratum both reduce exactly to the crude estimates above. */
  function mantelHaenszel(strata) {
    let R = 0, S = 0, PR = 0, PSQR = 0, QS = 0;
    let rrNum = 0, rrDen = 0, rrVarNum = 0;
    for (const s of strata) {
      const { a, b, c, d } = s;
      const n = a + b + c + d;
      if (!n) continue;
      const r = (a * d) / n, q = (b * c) / n;
      const P = (a + d) / n, Q = (b + c) / n;
      R += r; S += q;
      PR += P * r; PSQR += P * q + Q * r; QS += Q * q;
      const n1 = a + b, n0 = c + d, m1 = a + c;
      rrNum += (a * n0) / n;
      rrDen += (c * n1) / n;
      rrVarNum += (m1 * n1 * n0 - a * c * n) / (n * n);
    }
    const or = R / S;
    const varLnOR = PR / (2 * R * R) + PSQR / (2 * R * S) + QS / (2 * S * S);
    const seOR = Math.sqrt(varLnOR);
    const rr = rrNum / rrDen;
    const seRR = Math.sqrt(rrVarNum / (rrNum * rrDen));
    return {
      or, orCI: [or * Math.exp(-Z975 * seOR), or * Math.exp(Z975 * seOR)],
      rr, rrCI: [rr * Math.exp(-Z975 * seRR), rr * Math.exp(Z975 * seRR)],
    };
  }

  /* Pearson's chi-square for any r × c table of counts. */
  function chiSquareTable(rows) {
    const rt = rows.map((r) => r.reduce((s, x) => s + x, 0));
    const ct = rows[0].map((_, j) => rows.reduce((s, r) => s + r[j], 0));
    const n = rt.reduce((s, x) => s + x, 0);
    let chi2 = 0, small = false;
    rows.forEach((r, i) => r.forEach((o, j) => {
      const e = (rt[i] * ct[j]) / n;
      if (e < 5) small = true;
      if (e > 0) chi2 += ((o - e) * (o - e)) / e;
    }));
    const df = (rows.length - 1) * (ct.length - 1);
    return { chi2, df, p: chiSquareP(chi2, df), smallExpected: small };
  }

  /* ---- survival ------------------------------------------------------------ */

  /* Kaplan–Meier. rows are { time, event } with event 1 for the outcome and
     0 for censored. Events at a time are counted before censorings at the
     same time — the convention every package uses, because someone
     censored on day 30 was still at risk on day 30.

     The interval is Greenwood's variance on the log(−log) scale, which
     keeps the band inside 0–1 (lifelines' default; R's survfit uses
     conf.type = "log" unless asked). The median is the first time the
     curve is at or below 0.5. */
  function kaplanMeier(rows) {
    const data = (rows || [])
      .filter((r) => r && isNum(r.time) && r.time >= 0)
      .map((r) => ({ time: r.time, event: r.event ? 1 : 0 }))
      .sort((p, q) => p.time - q.time);
    let atRisk = data.length;
    let s = 1, greenwood = 0;
    const steps = [];
    for (let i = 0; i < data.length;) {
      const t = data[i].time;
      let d = 0, c = 0;
      while (i < data.length && data[i].time === t) {
        if (data[i].event) d++; else c++;
        i++;
      }
      if (d > 0) {
        s *= 1 - d / atRisk;
        if (atRisk > d) greenwood += d / (atRisk * (atRisk - d));
      }
      let lower = null, upper = null;
      if (s > 0 && s < 1) {
        const se = Math.sqrt(greenwood) / Math.abs(Math.log(s));
        lower = Math.pow(s, Math.exp(Z975 * se));
        upper = Math.pow(s, Math.exp(-Z975 * se));
      } else if (s === 1) { lower = 1; upper = 1; }
      else { lower = 0; upper = 0; }
      steps.push({ time: t, atRisk, events: d, censored: c, survival: s, lower, upper });
      atRisk -= d + c;
    }
    const hit = steps.find((st) => st.events > 0 && st.survival <= 0.5);
    return { steps, median: hit ? hit.time : null, n: data.length, events: data.reduce((x, r) => x + r.event, 0) };
  }

  /* Survival at time t, reading the step function. */
  function survivalAt(km, t) {
    let s = 1;
    for (const st of km.steps) {
      if (st.time > t) break;
      s = st.survival;
    }
    return s;
  }

  /* Number still at risk at time t (for the table under a KM plot). */
  function atRiskAt(rows, t) {
    return (rows || []).filter((r) => r.time >= t).length;
  }

  /* The log-rank test for two groups: at every event time, how many events
     would group A have had if the hazard were the same in both? */
  function logRank(groupA, groupB) {
    const all = [];
    (groupA || []).forEach((r) => all.push({ time: r.time, event: r.event ? 1 : 0, g: 0 }));
    (groupB || []).forEach((r) => all.push({ time: r.time, event: r.event ? 1 : 0, g: 1 }));
    all.sort((p, q) => p.time - q.time);
    let nA = (groupA || []).length, nB = (groupB || []).length;
    let O = 0, E = 0, V = 0, OB = 0;
    for (let i = 0; i < all.length;) {
      const t = all[i].time;
      let dA = 0, dB = 0, cA = 0, cB = 0;
      while (i < all.length && all[i].time === t) {
        const r = all[i];
        if (r.event) { if (r.g === 0) dA++; else dB++; }
        else if (r.g === 0) cA++; else cB++;
        i++;
      }
      const d = dA + dB, n = nA + nB;
      if (d > 0 && n > 0) {
        const e = (d * nA) / n;
        O += dA; OB += dB; E += e;
        if (n > 1) V += (d * (nA / n) * (1 - nA / n) * (n - d)) / (n - 1);
      }
      nA -= dA + cA;
      nB -= dB + cB;
    }
    const chi2 = V > 0 ? ((O - E) ** 2) / V : 0;
    const totalEvents = O + OB;
    return { chi2, p: chiSquareP(chi2, 1), observed: [O, OB], expected: [E, totalEvents - E] };
  }

  /* ---- a reproducible cohort ------------------------------------------------- */

  /* mulberry32: small, fast, and the same sequence on every machine, which
     is what makes a seed mean something. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r, mu, sigma) {
    let u = 0;
    while (u === 0) u = r();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  const expit = (x) => 1 / (1 + Math.exp(-x));
  const clampInt = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));

  /*
     MOVE-EARLY — a simulated cohort. Nobody in it exists.

     600 adults admitted to medical wards. The exposure is an early
     mobility programme (EMP) started within 48 hours. Two outcomes:
     readmission within 30 days, and time to death or readmission over a
     year of follow-up.

     It is built to teach one thing above all: frailer patients are less
     likely to be mobilised early *and* more likely to do badly, so the
     crude comparison flatters the programme. Adjusting for frailty pulls
     the estimate back toward the modest effect the simulation actually
     contains (a conditional odds ratio of about 0.78).
  */
  function makeCohort(opts) {
    const o = opts || {};
    const n = o.n || 600;
    const r = rng(o.seed == null ? SEED : o.seed);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const age = clampInt(normal(r, 72, 11), 40, 99);
      const sex = r() < 0.52 ? "F" : "M";
      const cfs = clampInt(3 + (age - 65) / 10 + normal(r, 0, 1.3), 1, 8);
      const diabetes = r() < 0.3 ? 1 : 0;
      const emp = r() < expit(0.35 - 0.55 * (cfs - 4)) ? 1 : 0;
      const readmit30 = r() < expit(-1.75 + 0.35 * (cfs - 4) + 0.25 * diabetes + 0.01 * (age - 72) - 0.25 * emp) ? 1 : 0;
      const hazard = 0.0021 * Math.exp(0.3 * (cfs - 4) + 0.2 * diabetes + 0.02 * (age - 72) - 0.3 * emp);
      const tEvent = -Math.log(1 - r()) / hazard;
      const tLost = -Math.log(1 - r()) / 0.0004;
      const end = Math.min(tEvent, tLost, 365);
      const los = Math.max(1, Math.round(Math.exp(normal(r, Math.log(6) + 0.08 * (cfs - 4), 0.5))));
      rows.push({
        id: `P${String(i + 1).padStart(3, "0")}`,
        age, sex, cfs, diabetes, emp, los, readmit30,
        time: Math.max(1, Math.ceil(end)),
        event: tEvent <= Math.min(tLost, 365) ? 1 : 0,
      });
    }
    return rows;
  }

  /* The same cohort as it might arrive from a ward spreadsheet: sex typed
     four ways, ages missing or impossible, yes/no as anything at all, a
     few rows entered twice, and the odd negative follow-up time. */
  function makeMessyCSV(opts) {
    const o = opts || {};
    const rows = makeCohort(o);
    const r = rng((o.seed == null ? SEED : o.seed) + 7);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const out = [];
    for (const row of rows) {
      const sex = row.sex === "F" ? pick(["F", "f", "Female", "female", " F"]) : pick(["M", "m", "Male", "male", "M "]);
      let age = String(row.age);
      const u = r();
      if (u < 0.03) age = "";
      else if (u < 0.05) age = "NA";
      else if (u < 0.055) age = "999";
      const emp = row.emp ? pick(["yes", "Yes", "Y", "1"]) : pick(["no", "No", "N", "0"]);
      let time = String(row.time);
      if (r() < 0.01) time = String(-row.time);
      out.push([row.id, age, sex, row.cfs, row.diabetes, emp, row.los, row.readmit30, time, row.event]);
      if (r() < 0.012) out.push(out[out.length - 1].slice());
    }
    const header = "id,age,sex,cfs,diabetes,emp,los,readmit30,time,event";
    return [header].concat(out.map((c) => c.join(","))).join("\n");
  }

  /* The reference cleaning rules the data lesson asks you to write. One
     row of strings in; a tidy row out, or null if it can't be trusted. */
  function cleanRecord(raw) {
    const sexWord = String(raw.sex == null ? "" : raw.sex).trim().toLowerCase();
    const sex = sexWord === "f" || sexWord === "female" ? "F" : sexWord === "m" || sexWord === "male" ? "M" : null;
    const ageText = String(raw.age == null ? "" : raw.age).trim();
    let age = ageText === "" || ageText.toUpperCase() === "NA" ? null : Number(ageText);
    if (age != null && !(Number.isFinite(age) && age >= 18 && age <= 110)) age = null;
    const empWord = String(raw.emp == null ? "" : raw.emp).trim().toLowerCase();
    const emp = ["yes", "y", "1", "true"].includes(empWord) ? 1 : ["no", "n", "0", "false"].includes(empWord) ? 0 : null;
    const time = Number(raw.time);
    if (!Number.isFinite(time) || time <= 0) return null;
    if (sex == null || emp == null) return null;
    return {
      id: String(raw.id).trim(), age, sex,
      cfs: Number(raw.cfs), diabetes: Number(raw.diabetes), emp,
      los: Number(raw.los), readmit30: Number(raw.readmit30),
      time, event: Number(raw.event),
    };
  }

  /* The CSV this course produces has no quoted fields, so a split on
     commas is honest here. The data lesson explains why real files need
     more than this. */
  function parseSimpleCSV(text) {
    const lines = String(text).trim().split(/\r?\n/);
    const head = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((l) => {
      const cells = l.split(",");
      const o = {};
      head.forEach((h, i) => { o[h] = cells[i] == null ? "" : cells[i]; });
      return o;
    });
  }

  function cleanCohort(text) {
    const seen = new Set();
    const out = [];
    for (const raw of parseSimpleCSV(text)) {
      const row = cleanRecord(raw);
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
    return out;
  }

  return {
    isNum, mean, variance, sd, quantile, median, summary,
    gammaln, gammaP, gammaQ, erfc, normalCdf, zP, chiSquareP, betaI, tP, tCritical, Z975,
    welchT, mannWhitney, ranks,
    fisherExact, twoByTwo, mantelHaenszel, chiSquareTable,
    kaplanMeier, survivalAt, atRiskAt, logRank,
    SEED, rng, normal, makeCohort, makeMessyCSV, cleanRecord, parseSimpleCSV, cleanCohort,
  };
}

window.CC.stats = codeClinicStats();
window.CC.stats.source = codeClinicStats.toString();
