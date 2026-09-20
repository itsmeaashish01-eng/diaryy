/* ================================================
   QUOTE SHELL — util.js
   Numbers, money, time and randomness. No DOM in here, so the
   simulation and the strategy can be run head-less by selftest.mjs.
   Everything hangs off window.MK.
   ================================================ */
window.MK = window.MK || {};

(function (MK) {
  "use strict";

  /* ---- maths ---------------------------------------------------- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* Standard normal CDF, Abramowitz & Stegun 26.2.17. Accurate to
     ~7.5e-8, which is four decimal places more than a cent needs. */
  function normCdf(x) {
    const s = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-z * z);
    return 0.5 * (1 + s * y);
  }

  /* Seeded RNG. The whole terminal is reproducible from one number,
     which is what makes the maths testable at all. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const next = () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    /* Box–Muller, one draw kept per call — the cached-pair version
       breaks determinism when callers interleave. */
    next.gauss = () => {
      const u = Math.max(next(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    };
    return next;
  }

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  function quantile(xs, q) {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const i = clamp(q, 0, 1) * (s.length - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? s[lo] : lerp(s[lo], s[hi], i - lo);
  }

  /* Bucket values into `bins` equal slices of [lo, hi]. */
  function histogram(xs, lo, hi, bins) {
    const out = new Array(bins).fill(0);
    if (hi <= lo) return out;
    for (const x of xs) {
      const i = clamp(Math.floor(((x - lo) / (hi - lo)) * bins), 0, bins - 1);
      out[i]++;
    }
    return out;
  }

  /* A fixed-length history. Panels read `.items`; nothing here grows
     without bound over a session left open all day. */
  function ring(cap) {
    return {
      cap,
      items: [],
      push(v) {
        this.items.push(v);
        if (this.items.length > cap) this.items.splice(0, this.items.length - cap);
        return v;
      },
      last(n) {
        return n == null ? this.items[this.items.length - 1]
                         : this.items.slice(-n);
      },
      get length() { return this.items.length; },
    };
  }

  /* ---- money & formatting --------------------------------------- */
  const money = (v, dp) => {
    const n = Number(v) || 0;
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0,
    });
  };
  const signedMoney = (v, dp) => (v >= 0 ? "+" : "") + money(v, dp);

  /* Compact for the status strip: $170K, $1.2M */
  function moneyShort(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return (v < 0 ? "-" : "") + "$" + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    if (a >= 1e3) return (v < 0 ? "-" : "") + "$" + Math.round(a / 1e3) + "K";
    return money(v, 0);
  }

  /* A probability as the market writes it: 0.524 → "52¢" */
  const cents = (p) => Math.round(p * 100) + "¢";
  const pct = (p, dp) => (p * 100).toFixed(dp == null ? 1 : dp) + "%";
  const px = (p) => p.toFixed(3);

  /* mm:ss, for the countdown to the next expiry */
  function mmss(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* "3m 20s", for how long a set is held */
  function dur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s";
  }

  const utcClock = (t) => new Date(t).toISOString().slice(11, 19);
  const utcHM = (t) => new Date(t).toISOString().slice(11, 16);

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  MK.util = {
    clamp, lerp, normCdf, rng, mean, quantile, histogram, ring,
    money, signedMoney, moneyShort, cents, pct, px, mmss, dur,
    utcClock, utcHM, esc,
  };
})(window.MK);
