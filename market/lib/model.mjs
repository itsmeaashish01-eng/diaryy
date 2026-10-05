/* ================================================
   MARKET LENS — lib/model.mjs
   The parts that learn from price history.

   features()     what a stock's chart looks like on a given day —
                  momentum over several windows, volatility, distance
                  from its high, trend, strength against the S&P 500
   train()        a logistic regression, fitted on every stock you asked
                  about at once ("pooled"), learning which of those
                  shapes were followed by a rise over the horizon
   walkForward()  the honest test: fit on the past, score on a later
                  stretch the model never saw, with a gap between them
                  so tomorrow's answer can't leak into today's lesson
   monteCarlo()   thousands of possible futures, stitched from the
                  stock's own past months, to get a range rather than
                  a single guess

   It's re-learned from scratch on every run, so it always reflects the
   latest prices. Nothing here is magic: markets are close to a coin flip
   over a few months, and the walk-forward numbers say exactly how much
   better than a coin flip this managed on data it hadn't seen.
   ================================================ */

export const FEATURES = [
  "r21", "r63", "r126", "mom12_1", "vol63", "volTrend", "sma50_200", "dd252", "rsi14", "rel126",
];

const LOOKBACK = 253;

function rsi(c, t, n = 14) {
  let up = 0, down = 0;
  for (let i = t - n + 1; i <= t; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) up += d; else down -= d;
  }
  if (up + down === 0) return 50;
  return (100 * up) / (up + down);
}

function stdev(a) {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1));
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/* -> { dates, close, at(t) } where at(t) is the feature vector on day t,
   or null when there isn't a year of history behind it yet. */
export function featureSeries(rows, bench) {
  const dates = rows.map((r) => r.date);
  const c = rows.map((r) => r.close);
  const lr = c.map((x, i) => (i ? Math.log(x / c[i - 1]) : 0));
  const benchAt = new Map();
  if (bench) bench.rows.forEach((r, i) => benchAt.set(r.date, i));

  function at(t) {
    if (t < LOOKBACK || t >= c.length) return null;
    const L = (k) => Math.log(c[t] / c[t - k]);
    let hi = 0;
    for (let i = t - 251; i <= t; i++) hi = Math.max(hi, c[i]);
    const sma = (k) => mean(c.slice(t - k + 1, t + 1));
    const v63 = stdev(lr.slice(t - 62, t + 1)) * Math.sqrt(252);
    const v21 = stdev(lr.slice(t - 20, t + 1)) * Math.sqrt(252);
    let rel = 0;
    if (bench) {
      const j = benchAt.get(dates[t]);
      if (j != null && j >= 126) rel = L(126) - Math.log(bench.rows[j].close / bench.rows[j - 126].close);
    }
    return {
      r21: L(21),
      r63: L(63),
      r126: L(126),
      mom12_1: Math.log(c[t - 21] / c[t - 252]),
      vol63: v63,
      volTrend: v63 ? v21 / v63 - 1 : 0,
      sma50_200: sma(50) / sma(200) - 1,
      dd252: c[t] / hi - 1,
      rsi14: (rsi(c, t) - 50) / 50,
      rel126: rel,
    };
  }
  return { dates, close: c, logReturns: lr, at };
}

/* Training rows for one stock: every 5th trading day (neighbouring days
   are nearly the same example), labelled with whether the price was
   higher `horizon` trading days later — and whether it beat the index. */
export function samples(sym, fs, horizon, bench, step = 5) {
  const out = [];
  const benchAt = new Map();
  if (bench) bench.rows.forEach((r, i) => benchAt.set(r.date, i));
  for (let t = LOOKBACK; t + horizon < fs.close.length; t += step) {
    const f = fs.at(t);
    const fwd = Math.log(fs.close[t + horizon] / fs.close[t]);
    let beat = null;
    if (bench) {
      const j = benchAt.get(fs.dates[t]);
      const k = benchAt.get(fs.dates[t + horizon]);
      if (j != null && k != null) beat = fwd > Math.log(bench.rows[k].close / bench.rows[j].close) ? 1 : 0;
    }
    out.push({ sym, date: fs.dates[t], x: FEATURES.map((k) => f[k]), y: fwd > 0 ? 1 : 0, beat });
  }
  return out;
}

// ---------------------------------------------------------------- logistic regression

const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export function train(X, y, { l2 = 1.0, iters = 400, lr = 0.5 } = {}) {
  const n = X.length, d = X[0].length;
  const mu = Array(d).fill(0), sd = Array(d).fill(0);
  for (const r of X) r.forEach((v, j) => (mu[j] += v / n));
  for (const r of X) r.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / n));
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  // Clip standardised values: one crash day shouldn't own a weight.
  const Z = X.map((r) => r.map((v, j) => Math.max(-4, Math.min(4, (v - mu[j]) / sd[j]))));

  const w = Array(d).fill(0);
  const base = y.reduce((s, v) => s + v, 0) / n;
  let b = Math.log((base + 1e-6) / (1 - base + 1e-6));
  for (let it = 0; it < iters; it++) {
    const gw = Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(b + Z[i].reduce((s, v, j) => s + v * w[j], 0));
      const e = p - y[i];
      gb += e;
      for (let j = 0; j < d; j++) gw[j] += e * Z[i][j];
    }
    b -= (lr * gb) / n;
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + (l2 * w[j]) / n);
  }
  return {
    w, b, mu, sd, base,
    predict(x) {
      const z = x.map((v, j) => Math.max(-4, Math.min(4, (v - mu[j]) / sd[j])));
      return sigmoid(b + z.reduce((s, v, j) => s + v * w[j], 0));
    },
  };
}

export function auc(pred, y) {
  const pairs = pred.map((p, i) => [p, y[i]]).sort((a, b) => a[0] - b[0]);
  let rankSum = 0, pos = 0;
  // Tied predictions share the average of their ranks.
  for (let i = 0; i < pairs.length; ) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[i][0]) j++;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) if (pairs[k][1]) { rankSum += rank; pos++; }
    i = j + 1;
  }
  const neg = pairs.length - pos;
  if (!pos || !neg) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/* Fit on the first ~75% of dates, skip a gap as long as the horizon,
   score on the rest. Reports how this compares with always guessing
   the training base rate — the "skill". */
export function walkForward(rows, label, horizonDays) {
  const usable = rows.filter((r) => r[label] != null);
  const dates = [...new Set(usable.map((r) => r.date))].sort();
  if (dates.length < 60) return null;
  const cut = dates[Math.floor(dates.length * 0.75)];
  const gapMs = horizonDays * 1.45 * 86400e3;
  const trainRows = usable.filter((r) => Date.parse(r.date) < Date.parse(cut) - gapMs);
  const testRows = usable.filter((r) => r.date >= cut);
  if (trainRows.length < 100 || testRows.length < 30) return null;

  const m = train(trainRows.map((r) => r.x), trainRows.map((r) => r[label]));
  const p = testRows.map((r) => m.predict(r.x));
  const y = testRows.map((r) => r[label]);
  const brier = mean(p.map((v, i) => (v - y[i]) ** 2));
  const brierBase = mean(y.map((v) => (m.base - v) ** 2));
  const hits = p.filter((v, i) => (v >= 0.5 ? 1 : 0) === y[i]).length;
  return {
    trainedThrough: trainRows.reduce((m, r) => (r.date > m ? r.date : m), ""),
    testedFrom: cut,
    testSamples: testRows.length,
    accuracy: hits / testRows.length,
    baseRateAccuracy: Math.max(mean(y), 1 - mean(y)),
    auc: auc(p, y),
    brier,
    brierBase,
    skill: 1 - brier / brierBase, // > 0 means better than the base rate
  };
}

/* How far to trust the model's spread from the base rate, from what the
   walk-forward test showed. No demonstrated skill still keeps a little
   of the signal (a quarter), never all of it. */
export function trustFromSkill(wf) {
  if (!wf) return 0.25;
  const fromSkill = 0.25 + 12 * Math.max(0, wf.skill);
  const fromAuc = 0.25 + 3 * Math.max(0, wf.auc - 0.5);
  return Math.min(1, Math.max(0.25, 0.5 * fromSkill + 0.5 * fromAuc));
}

// ---------------------------------------------------------------- Monte Carlo

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);

/* Block bootstrap: futures built from real month-long stretches of the
   last three years, so fat tails and volatility clusters come along.
   The stock's own average drift is halved toward a long-run market
   ~7%/yr — three hot years shouldn't be projected forward at face value. */
export function monteCarlo(logReturns, horizon, { paths = 3000, seedKey = "x", block = 21 } = {}) {
  const hist = logReturns.slice(-756).slice(1);
  if (hist.length < 120) return null;
  const histMean = mean(hist);
  const drift = 0.5 * histMean + 0.5 * (0.07 / 252);
  const demeaned = hist.map((r) => r - histMean + drift);
  const rnd = mulberry32(hash(seedKey));
  const out = new Float64Array(paths);
  for (let p = 0; p < paths; p++) {
    let s = 0, n = 0;
    while (n < horizon) {
      const start = Math.floor(rnd() * (demeaned.length - block));
      for (let k = 0; k < block && n < horizon; k++, n++) s += demeaned[start + k];
    }
    out[p] = Math.exp(s) - 1;
  }
  const sorted = [...out].sort((a, b) => a - b);
  const q = (f) => sorted[Math.floor(f * (sorted.length - 1))];
  return {
    pUp: sorted.filter((v) => v > 0).length / paths,
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
    expected: mean(sorted),
    annualVol: stdev(hist) * Math.sqrt(252),
  };
}
