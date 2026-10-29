/* ================================================
   ERRANDS — util.js
   Small shared helpers. Everything hangs off window.ER
   ================================================ */
window.ER = window.ER || {};

(function (ER) {
  "use strict";

  const uid = () =>
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  /* Great-circle distance in km. Plenty accurate for "which store is
     closer"; nobody is choosing a supermarket to the metre. */
  function distanceKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  const KM_PER_MI = 1.609344;

  /* The app is pointed at a US address, so distances are in miles. */
  function fmtMiles(km) {
    if (km == null || !Number.isFinite(km)) return "—";
    const mi = km / KM_PER_MI;
    return mi < 0.2 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;
  }

  function fmtMoney(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return "$" + n.toFixed(2);
  }

  /* "3.49", "$3.49", "3,49" -> 3.49. Anything else is "no price", never 0:
     a blank cell must not win "cheapest". */
  function parsePrice(s) {
    if (typeof s === "number") return Number.isFinite(s) && s >= 0 ? s : null;
    const t = String(s == null ? "" : s).trim().replace(/^\$/, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Number(t);
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function daysSince(isoDate, now) {
    const t = Date.parse(isoDate);
    if (!Number.isFinite(t)) return null;
    return Math.floor(((now || Date.now()) - t) / 86400000);
  }

  /* Build DOM without innerHTML. Strings become text nodes, so a store
     name from OpenStreetMap can't turn into markup. */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k in el && k !== "list" && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* fetch with a deadline. Overpass in particular can sit on a request
     for a minute when it's busy; better to try the next mirror. */
  async function fetchJSON(url, opts, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 20000);
    try {
      const res = await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  ER.util = {
    uid, distanceKm, KM_PER_MI, fmtMiles, fmtMoney, parsePrice, today,
    daysSince, h, debounce, downloadFile, fetchJSON,
  };
})(window.ER);
