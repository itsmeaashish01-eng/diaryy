/* ================================================
   ROAMGUIDE — util.js
   Small shared helpers. Everything hangs off window.RG
   ================================================ */
window.RG = window.RG || {};

(function (RG) {
  "use strict";

  // ---- ids & time ----
  const uid = () =>
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  /* Minutes past midnight from "09:30". Returns null on anything else, so
     a malformed opening time reads as "unknown" rather than as midnight. */
  function toMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /* 570 -> "9:30 am". Past midnight (1470) wraps and is marked, because a
     plan that runs to 00:30 should say so rather than silently read as
     half past twelve on the same morning. */
  function fromMinutes(mins) {
    if (mins == null || !Number.isFinite(mins)) return "—";
    const wrapped = ((mins % 1440) + 1440) % 1440;
    const nextDay = mins >= 1440;
    let h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    const ampm = h < 12 ? "am" : "pm";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}${nextDay ? " (+1)" : ""}`;
  }

  /* "1h 20m" / "45m" — durations in plans are read at a glance. */
  function fmtDuration(mins) {
    if (mins == null || !Number.isFinite(mins)) return "—";
    const n = Math.max(0, Math.round(mins));
    if (n < 60) return `${n}m`;
    const h = Math.floor(n / 60), m = n % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function fmtDistance(km, unit) {
    if (km == null || !Number.isFinite(km)) return "—";
    if (unit === "mi") {
      const mi = km * 0.621371;
      return mi < 0.2 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;
    }
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  /* Today as YYYY-MM-DD, offset by n days */
  function isoDay(offsetDays) {
    const d = new Date(Date.now() + (offsetDays || 0) * DAY);
    return d.toISOString().slice(0, 10);
  }

  /* Day of week for a YYYY-MM-DD string, 0 = Sunday.
     Parsed at noon so a timezone west of UTC can't roll it back a day. */
  function weekdayOf(isoDate) {
    if (!isoDate) return null;
    const t = Date.parse(isoDate + "T12:00:00");
    return Number.isNaN(t) ? null : new Date(t).getDay();
  }

  function fmtDayLabel(isoDate) {
    if (!isoDate) return "Unscheduled";
    const t = Date.parse(isoDate + "T12:00:00");
    if (Number.isNaN(t)) return isoDate;
    return new Date(t).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
  }

  function daysUntil(isoDate) {
    if (!isoDate) return null;
    const t = Date.parse(isoDate + "T12:00:00");
    if (Number.isNaN(t)) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.round((t - today.getTime()) / DAY);
  }

  /* "just now" / "40s ago" / "3m ago" — a live fix goes stale fast, and
     a timestamp on its own doesn't say whether it still means anything. */
  function relTimeShort(ts) {
    if (!ts) return "never";
    const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
    return `${Math.round(secs / 3600)}h ago`;
  }

  /* Add n days to a YYYY-MM-DD string and get one back. */
  function addDays(isoDate, n) {
    const t = Date.parse((isoDate || isoDay(0)) + "T12:00:00");
    if (Number.isNaN(t)) return isoDay(n);
    return new Date(t + n * DAY).toISOString().slice(0, 10);
  }

  // ---- numbers & text ----
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function fmtMoney(value, currency) {
    if (value == null || Number.isNaN(value)) return "—";
    const cur = currency || "USD";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
        minimumFractionDigits: 0,
      }).format(value);
    } catch (e) {
      // Unknown / non-ISO code — a plain number beats throwing
      return `${cur} ${value.toFixed(2)}`;
    }
  }

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many || one + "s"}`;
  }

  function parseNum(v) {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  /* Fold accents so "Se Cathedral" finds "Sé" and "Zocalo" finds "Zócalo".
     Travellers type on whatever keyboard they packed. */
  function fold(s) {
    let out = String(s == null ? "" : s).toLowerCase();
    if (out.normalize) out = out.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return out;
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

  /* Hand the viewer a file.

     In an ordinary browser that's a blob link. Inside a hosted viewer,
     links like that are inert — the platform mediates saves — so use that
     route when it's there and report what actually happened rather than
     claiming success. Returns "saved" | "declined" | "unavailable". */
  async function downloadFile(filename, text, mime) {
    const hosted = Boolean(window.claude && typeof window.claude.use === "function");

    if (hosted) {
      let saver = null;
      try { saver = await window.claude.use("downloads"); } catch (e) { saver = null; }
      if (!saver || typeof saver.save !== "function") return "unavailable";
      try {
        await saver.save({ filename, data: text });
        return "saved";
      } catch (e) {
        return e && e.code === "declined" ? "declined" : "unavailable";
      }
    }

    const blob = new Blob([text], { type: mime || "text/plain" });
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

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through to the textarea trick */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand("copy");
      ta.remove();
      return Boolean(ok);
    } catch (e) {
      return false;
    }
  }

  RG.util = {
    uid, MIN, HOUR, DAY,
    toMinutes, fromMinutes, fmtDuration, fmtDistance,
    isoDay, weekdayOf, fmtDayLabel, daysUntil, addDays, relTimeShort,
    clamp, fmtMoney, plural, parseNum, fold,
    $, $$, esc, debounce, downloadFile, copyText,
  };
})(window.RG);
