/* ================================================
   THE AI EMPLOYEE — util.js
   Dates, money, ids, small text helpers.

   Everything here is pure: same input, same answer, no storage and no
   DOM. That is what lets selftest.mjs run the reasoning of this app in
   node without pretending to be a browser.
   ================================================ */
(function (AE) {
  "use strict";

  /* ---- ids ---------------------------------------------------------- */
  let seq = 0;
  function uid(prefix) {
    seq += 1;
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + seq.toString(36);
  }

  /* ---- dates --------------------------------------------------------
     The app thinks in local days, not UTC instants. An invoice due
     "today" is due today where the person works, so every day-level
     comparison goes through isoDay() rather than Date arithmetic.     */

  function isoDay(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /* A "YYYY-MM-DD" string back to noon local time. Noon, not midnight,
     so a daylight-saving shift can't tip the date over a boundary. */
  function dayDate(iso) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }

  function addDays(iso, n) {
    const d = dayDate(iso);
    if (!d) return "";
    d.setDate(d.getDate() + n);
    return isoDay(d);
  }

  /* Whole days from a to b, both read as local days. Negative = a is
     later than b. */
  function daysBetween(a, b) {
    const da = dayDate(isoDay(a));
    const db = dayDate(isoDay(b));
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  }

  /* Days until `iso` from `now`. 0 = today, negative = past due. */
  function daysUntil(iso, now) {
    return daysBetween(now || new Date(), iso);
  }

  function isPast(iso, now) {
    return iso ? daysUntil(iso, now) < 0 : false;
  }

  /* "in 3 days" / "2 days ago" / "today" — the phrasing the briefing
     uses, so overdue reads as overdue at a glance. */
  function relDay(iso, now) {
    if (!iso) return "no date";
    const n = daysUntil(iso, now);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "yesterday";
    if (n > 1) return `in ${n} days`;
    return `${Math.abs(n)} days ago`;
  }

  function fmtDay(iso, opts) {
    const d = dayDate(iso);
    if (!d) return "—";
    return d.toLocaleDateString(undefined, opts || { month: "short", day: "numeric" });
  }

  function fmtDayLong(iso) {
    return fmtDay(iso, { weekday: "long", month: "long", day: "numeric" });
  }

  /* Datetime for the schedule, which does care about the hour. */
  function fmtTime(isoDateTime) {
    const d = new Date(isoDateTime);
    if (isNaN(d)) return "—";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  /* Monday of the week containing `d`. The week is the unit the client
     update and the workload view both report on. */
  function weekStart(d) {
    const x = dayDate(isoDay(d));
    const dow = (x.getDay() + 6) % 7; // Monday = 0
    x.setDate(x.getDate() - dow);
    return isoDay(x);
  }

  /* ---- money --------------------------------------------------------
     Amounts are held as numbers of whole currency units and rounded to
     cents only when they are combined, so a 3-way split of an invoice
     can't quietly lose a penny per line.                              */

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function sum(list, pick) {
    let total = 0;
    for (const item of list || []) total += Number((pick ? pick(item) : item) || 0);
    return round2(total);
  }

  function money(amount, currency) {
    const n = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      }).format(n);
    } catch (err) {
      return `${currency || "USD"} ${round2(n)}`;
    }
  }

  /* ---- text ---------------------------------------------------------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function titleCase(s) {
    return String(s || "").replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many || one + "s"}`;
  }

  /* Trim to a length without cutting a word in half. */
  function clip(s, len) {
    const str = String(s || "").trim();
    if (str.length <= len) return str;
    const cut = str.slice(0, len);
    const sp = cut.lastIndexOf(" ");
    return (sp > len * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, "") + "…";
  }

  function byKey(list, key) {
    const map = new Map();
    for (const item of list || []) map.set(item[key], item);
    return map;
  }

  /* Stable sort by a computed number, ascending. */
  function sortBy(list, pick) {
    return (list || []).slice().sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (av === bv) return 0;
      return av < bv ? -1 : 1;
    });
  }

  AE.util = {
    uid, isoDay, dayDate, addDays, daysBetween, daysUntil, isPast,
    relDay, fmtDay, fmtDayLong, fmtTime, weekStart,
    round2, sum, money,
    esc, titleCase, plural, clip, byKey, sortBy,
  };
})(window.AE = window.AE || {});
