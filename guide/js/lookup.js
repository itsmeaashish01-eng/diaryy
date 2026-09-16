/* ================================================
   ROAMGUIDE — lookup.js
   The guide for everywhere else.

   The curated guidebook covers a handful of cities. This covers the
   rest of the planet: Wikipedia holds around two million articles with
   coordinates attached — churches, bridges, statues, stations, streets,
   the house someone was born in — and you can ask it what is within a
   few hundred metres of where you are standing.

   That is what makes this a walking guide anywhere rather than a
   guidebook to six cities.

   Two honest limits:

     - It needs a connection. A sandboxed viewer that blocks outbound
       requests can't run it, and neither can a dead signal. Both are
       reported as what they are.
     - Coverage follows Wikipedia's, which is dense in European and
       Japanese cities and thin in a residential suburb. Empty means
       nobody has written it up, not that nothing is there.

   Wikipedia sets CORS headers for `origin=*`: no key, no account, no
   proxy, and nothing sent but a coordinate.
   ================================================ */
(function (RG) {
  "use strict";

  const API = "https://en.wikipedia.org/w/api.php";
  const TIMEOUT_MS = 12000;

  /* The API takes at most 20 extracts per request, and 20 things within
     earshot is already more than anyone reads while walking. */
  const MAX_RESULTS = 20;

  /* Same patch of ground, same answer — so standing still, or drifting
     a few metres on a poor fix, doesn't re-ask. */
  const cache = new Map();
  const keyFor = (lat, lon, radius) => `${lat.toFixed(3)},${lon.toFixed(3)},${radius}`;

  const available = () => typeof fetch === "function";

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

  /* Everything written up near a coordinate, nearest first, each with the
     paragraph that says what it is and a picture where there is one.

     Two requests: what's here, then everything about all of it at once.
     Fetching the articles one at a time would be twenty round trips on
     hotel wifi. */
  async function around(lat, lon, radius) {
    const r = Math.min(Math.max(radius || 500, 10), 10000);
    const key = keyFor(lat, lon, r);
    if (cache.has(key)) return cache.get(key);

    if (!available()) throw new Error("This browser can't make the request.");

    let found;
    try {
      const data = await getJSON({
        action: "query", list: "geosearch",
        gscoord: `${lat}|${lon}`, gsradius: String(r), gslimit: String(MAX_RESULTS),
      });
      found = (data.query && data.query.geosearch) || [];
    } catch (e) {
      throw new Error(describeFailure(e));
    }

    if (!found.length) {
      cache.set(key, []);
      return [];
    }

    const byId = new Map();
    found.forEach((h) => byId.set(h.pageid, {
      pageid: h.pageid,
      title: h.title,
      metres: Math.round(h.dist),
      lat: h.lat,
      lon: h.lon,
      extract: "",
      thumb: null,
      url: `https://en.wikipedia.org/?curid=${h.pageid}`,
    }));

    /* Second request: the opening paragraph and a thumbnail for all of
       them. If this half fails we still have titles and distances, which
       is a usable guide — so don't throw the whole thing away. */
    try {
      const data = await getJSON({
        action: "query",
        pageids: found.map((h) => h.pageid).join("|"),
        prop: "extracts|pageimages|info",
        exintro: "1", explaintext: "1", exlimit: String(MAX_RESULTS),
        piprop: "thumbnail", pithumbsize: "400", pilimit: String(MAX_RESULTS),
        inprop: "url",
      });
      const pages = (data.query && data.query.pages) || {};
      Object.keys(pages).forEach((id) => {
        const page = pages[id];
        const entry = byId.get(page.pageid);
        if (!entry) return;
        entry.extract = trimExtract(page.extract || "");
        entry.thumb = page.thumbnail ? page.thumbnail.source : null;
        if (page.fullurl) entry.url = page.fullurl;
      });
    } catch (e) {
      // Titles and distances survive; the detail didn't.
    }

    const out = found.map((h) => byId.get(h.pageid));
    cache.set(key, out);
    return out;
  }

  /* Wikipedia's opening paragraph is often three sentences of what a
     thing is followed by a wall of parenthetical pronunciation. Keep the
     part that answers "what am I looking at". */
  function trimExtract(text) {
    let t = String(text || "").trim();
    // Drop the pronunciation and native-name clutter right after the name.
    t = t.replace(/\s*\([^)]{40,}\)/, "");
    t = t.replace(/\s+/g, " ").trim();
    const LIMIT = 460;
    if (t.length <= LIMIT) return t;
    // Cut at a sentence end rather than mid-word.
    const cut = t.slice(0, LIMIT);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    return (stop > 200 ? cut.slice(0, stop + 1) : cut.trimEnd() + "…");
  }

  /* The full article text for one thing, when the opening paragraph has
     you interested. */
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
     surface as a TypeError with no detail, by design, so a page can't
     probe what it isn't allowed to reach. Say what's likely rather than
     repeating "Failed to fetch" at someone standing in the street. */
  function describeFailure(e) {
    const msg = String((e && e.message) || e);
    if (/abort/i.test(msg)) {
      return "Wikipedia took too long to answer — a weak signal, most likely.";
    }
    if (/Failed to fetch|NetworkError|Load failed|blocked/i.test(msg)) {
      return "Couldn't reach Wikipedia. Either there's no connection, or this " +
        "copy of the app is running somewhere that blocks outside requests — " +
        "the claude.ai preview does. Host it yourself and this works.";
    }
    return msg;
  }

  RG.lookup = { around, summary, available, describeFailure, trimExtract, MAX_RESULTS };
})(window.RG);
