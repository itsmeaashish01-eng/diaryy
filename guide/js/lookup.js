/* ================================================
   ROAMGUIDE — lookup.js
   "What is this building?" for anything the guidebook doesn't cover.

   The guidebook travels with the app and covers six cities. Stand in
   front of a building in any of the other several thousand and it has
   nothing to say — so this asks Wikipedia what is within a few hundred
   metres of a coordinate, and reads back the opening paragraph.

   This is the one part of RoamGuide that needs the network, and it is
   deliberately the only part: everything else keeps working with the
   radio off. Two places it won't run, both reported rather than
   silently swallowed:

     - inside a sandboxed viewer that blocks outbound requests
     - with no signal, which is exactly when you're most likely abroad

   Wikipedia's API sets CORS headers for `origin=*`, so no key, no
   account and no proxy. Nothing about you is sent but the coordinate.
   ================================================ */
(function (RG) {
  "use strict";

  const API = "https://en.wikipedia.org/w/api.php";
  const TIMEOUT_MS = 12000;

  /* Same coordinate, same answer, for as long as you're standing there. */
  const cache = new Map();
  const keyFor = (lat, lon, radius) =>
    `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`;

  function available() {
    return typeof fetch === "function";
  }

  async function getJSON(params) {
    const url = API + "?" + new URLSearchParams(
      Object.assign({ format: "json", origin: "*" }, params)
    );
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* Anything Wikipedia knows about within `radius` metres, nearest first.
     Throws with a message worth showing rather than a stack trace. */
  async function around(lat, lon, radius) {
    const r = radius || 400;
    const key = keyFor(lat, lon, r);
    if (cache.has(key)) return cache.get(key);

    if (!available()) throw new Error("This browser can't make the request.");

    let data;
    try {
      data = await getJSON({
        action: "query", list: "geosearch",
        gscoord: `${lat}|${lon}`, gsradius: String(r), gslimit: "10",
      });
    } catch (e) {
      throw new Error(describeFailure(e));
    }

    const hits = ((data.query && data.query.geosearch) || []).map((h) => ({
      pageid: h.pageid,
      title: h.title,
      metres: Math.round(h.dist),
      lat: h.lat,
      lon: h.lon,
    }));
    cache.set(key, hits);
    return hits;
  }

  /* The opening paragraph of an article — the part that actually says
     what a thing is and when it was built. */
  async function summary(pageid) {
    const key = "page:" + pageid;
    if (cache.has(key)) return cache.get(key);

    let data;
    try {
      data = await getJSON({
        action: "query", prop: "extracts|info",
        exintro: "1", explaintext: "1", inprop: "url", pageids: String(pageid),
      });
    } catch (e) {
      throw new Error(describeFailure(e));
    }

    const page = data.query && data.query.pages && data.query.pages[pageid];
    if (!page) throw new Error("Wikipedia has no article under that id.");
    const out = {
      title: page.title,
      extract: (page.extract || "").trim(),
      url: page.fullurl || `https://en.wikipedia.org/?curid=${pageid}`,
    };
    cache.set(key, out);
    return out;
  }

  /* A blocked request and an absent one look identical from here — both
     surface as a TypeError with no detail, by design, so the page can't
     probe what it isn't allowed to reach. Say what's likely rather than
     repeating "Failed to fetch" at someone. */
  function describeFailure(e) {
    const msg = String((e && e.message) || e);
    if (/abort/i.test(msg)) {
      return "Wikipedia took too long to answer — a weak signal, most likely.";
    }
    if (/Failed to fetch|NetworkError|Load failed|blocked/i.test(msg)) {
      return "Couldn't reach Wikipedia. Either there's no connection, or this " +
        "copy of the app is running somewhere that blocks outside requests — " +
        "the published artifact does. Everything else here works offline.";
    }
    return msg;
  }

  RG.lookup = { around, summary, available, describeFailure };
})(window.RG);
