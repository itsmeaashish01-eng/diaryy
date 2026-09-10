/* ================================================
   PRICE WATCH — util.js
   Small shared helpers. Everything hangs off window.PT
   ================================================ */
window.PT = window.PT || {};

(function (PT) {
  "use strict";

  // ---- ids & time ----
  const uid = () =>
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  /* Days between now and an ISO date string (may be negative if past) */
  function daysUntil(isoDate) {
    if (!isoDate) return null;
    const t = Date.parse(isoDate + (isoDate.length === 10 ? "T12:00:00" : ""));
    if (Number.isNaN(t)) return null;
    return Math.round((t - Date.now()) / DAY);
  }

  /* "3m ago", "in 2h", "just now" */
  function relTime(ts) {
    if (!ts) return "never";
    const diff = ts - Date.now();
    const abs = Math.abs(diff);
    const fut = diff > 0;
    let n, unit;
    if (abs < MIN) return fut ? "in a moment" : "just now";
    if (abs < HOUR) { n = Math.round(abs / MIN); unit = "m"; }
    else if (abs < DAY) { n = Math.round(abs / HOUR); unit = "h"; }
    else { n = Math.round(abs / DAY); unit = "d"; }
    return fut ? `in ${n}${unit}` : `${n}${unit} ago`;
  }

  function fmtDateTime(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function fmtDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short", day: "numeric",
    });
  }

  /* Today as YYYY-MM-DD, offset by n days */
  function isoDay(offsetDays) {
    const d = new Date(Date.now() + (offsetDays || 0) * DAY);
    return d.toISOString().slice(0, 10);
  }

  // ---- numbers ----
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function fmtMoney(value, currency) {
    if (value == null || Number.isNaN(value)) return "—";
    const cur = currency || "USD";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: value >= 1000 ? 0 : 2,
        minimumFractionDigits: 0,
      }).format(value);
    } catch (e) {
      // Unknown / non-ISO currency code — fall back to a plain number
      return `${cur} ${value.toFixed(2)}`;
    }
  }

  function fmtPct(p, withSign) {
    if (p == null || Number.isNaN(p)) return "—";
    const s = withSign && p > 0 ? "+" : "";
    return `${s}${p.toFixed(Math.abs(p) < 10 ? 1 : 0)}%`;
  }

  function parseNum(v) {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // ---- DOM ----
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* Read a nested value out of an object by dot/bracket path.
     Supports "data.offers.0.price.total" and "data[0].price" alike. */
  function dig(obj, path) {
    if (!path) return obj;
    const parts = String(path)
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean);
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  /* fetch() with a hard timeout, so a hung endpoint can't wedge the poller */
  async function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 15000);
    try {
      return await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}));
    } finally {
      clearTimeout(timer);
    }
  }

  /* Hand the viewer a file.

     In an ordinary browser that's a blob link. Inside a hosted viewer,
     links like that are inert — the platform mediates saves — so use that
     route when it's there and report what actually happened rather than
     claiming success. Returns "saved" | "declined" | "unavailable". */
  async function downloadJSON(filename, data) {
    const json = JSON.stringify(data, null, 2);
    const hosted = Boolean(window.claude && typeof window.claude.use === "function");

    if (hosted) {
      let saver = null;
      try { saver = await window.claude.use("downloads"); } catch (e) { saver = null; }
      if (!saver || typeof saver.save !== "function") return "unavailable";
      try {
        await saver.save({ filename, data: json });
        return "saved";
      } catch (e) {
        return e && e.code === "declined" ? "declined" : "unavailable";
      }
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "saved";
  }

  /* Deterministic PRNG so the demo provider replays the same walk per watch */
  function seededRandom(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  PT.util = {
    uid, MIN, HOUR, DAY, daysUntil, relTime, fmtDateTime, fmtDate, isoDay,
    clamp, fmtMoney, fmtPct, parseNum, $, $$, esc, debounce, dig,
    fetchWithTimeout, downloadJSON, seededRandom,
  };
})(window.PT);
