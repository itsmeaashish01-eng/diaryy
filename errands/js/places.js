/* ================================================
   ERRANDS — places.js
   Where things are: grocery stores and Tesla chargers around home.

   Two live sources, both free and both callable straight from a page:
     - OpenStreetMap, through the Overpass API, for stores and chargers.
     - The US Department of Energy's station locator (NREL's AFDC API)
       for chargers, which knows Tesla's network by name. It wants an
       API key; DEMO_KEY works for a handful of lookups an hour, and a
       free personal key lifts that.

   Neither one knows shelf prices. Nothing free does — the chains keep
   those behind their own sites — so prices are something you record
   (basket.js) and this file only says where the stores are and how to
   open each one's own search for an item.

   When nothing is reachable the app falls back to SEED below: a short,
   hand-checked list around the default address, marked as such.
   ================================================ */
(function (ER) {
  "use strict";
  const { distanceKm } = ER.util;

  /* 301 W Lombard St sits on the block between Howard and Eutaw, a few
     minutes' walk from Camden Yards. The coordinate is refined by the
     geocoder the first time the app is online. */
  const DEFAULT_HOME = {
    label: "301 W Lombard St, Baltimore, MD 21201",
    lat: 39.2873,
    lon: -76.6191,
    exact: false,
  };

  /* Checked October 2026 against Tesla's Find Us pages and the stores'
     own listings. Coordinates are to the block, not the door — good
     enough for "which is nearer", which is all they're used for. */
  const SEED = {
    stores: [
      { id: "seed:wholefoods-harbor-east", name: "Whole Foods Market", brand: "Whole Foods Market",
        address: "711 S Central Ave (Harbor East)", lat: 39.2829, lon: -76.5998, kind: "supermarket" },
      { id: "seed:harristeeter-mchenry", name: "Harris Teeter", brand: "Harris Teeter",
        address: "McHenry Row, Whetstone Way (Locust Point)", lat: 39.2747, lon: -76.5962, kind: "supermarket" },
      { id: "seed:safeway-canton", name: "Safeway", brand: "Safeway",
        address: "2610 Boston St (Canton)", lat: 39.2818, lon: -76.5797, kind: "supermarket" },
      { id: "seed:target-canton", name: "Target", brand: "Target",
        address: "Canton Crossing, Boston St", lat: 39.2768, lon: -76.5676, kind: "department_store" },
      { id: "seed:streets-market", name: "Streets Market", brand: "Streets Market",
        address: "Charles St & Saratoga St (Downtown)", lat: 39.2913, lon: -76.6148, kind: "supermarket" },
      { id: "seed:lexington-market", name: "Lexington Market", brand: "",
        address: "400 W Lexington St", lat: 39.2917, lon: -76.6211, kind: "marketplace" },
      { id: "seed:cross-street-market", name: "Cross Street Market", brand: "",
        address: "1065 S Charles St (Federal Hill)", lat: 39.2770, lon: -76.6137, kind: "marketplace" },
    ],
    chargers: [
      { id: "seed:sc-mchenry-row", name: "Baltimore, MD – McHenry Row Supercharger", kind: "supercharger",
        address: "1641 Whetstone Way, Baltimore, MD 21230", lat: 39.2745, lon: -76.5965,
        stalls: 8, kw: 72, hours: "24/7", tesla: true, source: "Built-in list", note: "In the McHenry Row east garage, by Harris Teeter" },
      { id: "seed:sc-boston-st", name: "Baltimore, MD – Boston Street Supercharger", kind: "supercharger",
        address: "3501 Boston St, Baltimore, MD 21224", lat: 39.2765, lon: -76.5680,
        stalls: 12, kw: 250, hours: "24/7", tesla: true, source: "Built-in list", note: "Canton Crossing" },
    ],
  };

  /* ---- geocoding ------------------------------------------------------ */

  /* Nominatim is OpenStreetMap's own geocoder. Its usage policy asks for
     no more than one request a second and no autocomplete, so this is
     only ever called when you press the button. */
  async function geocode(address) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q="
      + encodeURIComponent(address);
    const rows = await ER.util.fetchJSON(url, { headers: { Accept: "application/json" } }, 15000);
    const r = Array.isArray(rows) && rows[0];
    if (!r) return null;
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { label: address, lat, lon, exact: true };
  }

  /* ---- OpenStreetMap via Overpass -------------------------------------- */

  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  function storeQuery(home, radiusM, withCorner) {
    const at = `(around:${Math.round(radiusM)},${home.lat},${home.lon})`;
    return `[out:json][timeout:25];(
  nwr${at}["shop"~"^(supermarket|grocery|greengrocer|wholesale)$"];
  nwr${at}["amenity"="marketplace"];
  nwr${at}["shop"="department_store"]["brand"~"^(Target|Walmart)$"];
  ${withCorner ? `nwr${at}["shop"="convenience"];` : ""}
);out center tags;`;
  }

  function chargerQuery(home, radiusM) {
    const at = `(around:${Math.round(radiusM)},${home.lat},${home.lon})`;
    return `[out:json][timeout:25];nwr${at}["amenity"="charging_station"];out center tags;`;
  }

  async function overpass(query) {
    let lastErr = null;
    for (const url of OVERPASS) {
      try {
        return await ER.util.fetchJSON(url, {
          method: "POST",
          // A form body keeps this a "simple" request: no CORS preflight.
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
        }, 30000);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Overpass unreachable");
  }

  const pos = (el) =>
    el.type === "node" ? { lat: el.lat, lon: el.lon }
      : el.center ? { lat: el.center.lat, lon: el.center.lon } : null;

  function addressOf(t) {
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const town = [t["addr:city"], t["addr:state"]].filter(Boolean).join(", ");
    return [street, town].filter(Boolean).join(", ");
  }

  function parseStores(json, home) {
    const out = [];
    for (const el of (json && json.elements) || []) {
      const t = el.tags || {};
      const p = pos(el);
      if (!p) continue;
      const name = t.name || t.brand;
      if (!name) continue;   // an unnamed shop can't be told apart from the next one
      out.push({
        id: `osm:${el.type}/${el.id}`,
        name,
        brand: t.brand || "",
        address: addressOf(t),
        lat: p.lat, lon: p.lon,
        kind: t.shop || t.amenity || "shop",
        hours: t.opening_hours || "",
        website: t.website || t["contact:website"] || t["brand:website"] || "",
        km: home ? distanceKm(home, p) : null,
      });
    }
    return out.sort((a, b) => a.km - b.km);
  }

  /* Tesla shows up in OSM under several tags, depending on who mapped it. */
  function isTesla(t) {
    const words = [t.brand, t.operator, t.network, t.name, t["brand:wikidata"] === "Q478214" ? "tesla" : ""]
      .filter(Boolean).join(" ");
    return /tesla/i.test(words)
      || Object.keys(t).some((k) => /^socket:tesla_(supercharger|destination)/.test(k));
  }

  /* "250 kW", "250kW", "11 kW;22 kW" -> the largest number of kW. */
  function kwOf(...vals) {
    let best = null;
    for (const v of vals) {
      for (const m of String(v || "").matchAll(/(\d+(?:\.\d+)?)\s*kw/gi)) {
        const n = Number(m[1]);
        if (best == null || n > best) best = n;
      }
    }
    return best;
  }

  function chargerKind(t, kw) {
    const name = `${t.name || ""} ${t.network || ""}`;
    if (t["socket:tesla_supercharger"] || /supercharger/i.test(name)) return "supercharger";
    if (t["socket:tesla_destination"] || /destination/i.test(name)) return "destination";
    if (kw != null) return kw >= 50 ? "supercharger" : "destination";
    return "tesla";
  }

  function parseChargers(json, home) {
    const out = [];
    for (const el of (json && json.elements) || []) {
      const t = el.tags || {};
      const p = pos(el);
      if (!p) continue;
      const tesla = isTesla(t);
      const kw = kwOf(t["socket:tesla_supercharger:output"], t["socket:nacs:output"],
        t["socket:tesla_destination:output"], t["charging_station:output"],
        t["socket:type2_combo:output"], t["socket:chademo:output"], t["socket:type1:output"]);
      const stalls = Number(t.capacity || t["socket:tesla_supercharger"] || t["socket:nacs"]
        || t["socket:tesla_destination"]) || null;
      out.push({
        id: `osm:${el.type}/${el.id}`,
        name: t.name || (tesla ? "Tesla charger" : t.operator || t.network || "Charging station"),
        tesla,
        kind: tesla ? chargerKind(t, kw) : (kw != null && kw >= 50 ? "fast" : "level2"),
        address: addressOf(t),
        lat: p.lat, lon: p.lon,
        stalls, kw,
        hours: t.opening_hours === "24/7" ? "24/7" : t.opening_hours || "",
        access: t.access && t.access !== "yes" ? t.access : "",
        fee: t.fee || "",
        network: t.network || t.operator || "",
        source: "OpenStreetMap",
        km: home ? distanceKm(home, p) : null,
      });
    }
    return out.sort((a, b) => a.km - b.km);
  }

  /* ---- DOE / NREL station locator ------------------------------------ */

  function nrelURL(home, radiusMi, key) {
    const q = new URLSearchParams({
      api_key: key || "DEMO_KEY",
      latitude: String(home.lat),
      longitude: String(home.lon),
      radius: String(Math.round(radiusMi * 10) / 10),
      fuel_type: "ELEC",
      ev_network: "Tesla,Tesla Destination",
      status: "E",
      limit: "60",
    });
    return "https://developer.nrel.gov/api/alt-fuel-stations/v1/nearest.json?" + q.toString();
  }

  function parseNREL(json, home) {
    const out = [];
    for (const s of (json && json.fuel_stations) || []) {
      const lat = Number(s.latitude), lon = Number(s.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const dest = /destination/i.test(s.ev_network || "");
      const dc = Number(s.ev_dc_fast_num) || 0;
      const l2 = Number(s.ev_level2_evse_num) || 0;
      out.push({
        id: `nrel:${s.id}`,
        name: s.station_name || (dest ? "Tesla Destination" : "Tesla Supercharger"),
        tesla: true,
        kind: dest || (!dc && l2) ? "destination" : "supercharger",
        address: [s.street_address, s.city, s.state].filter(Boolean).join(", "),
        lat, lon,
        stalls: dc || l2 || null,
        kw: null,
        hours: /24 hours/i.test(s.access_days_time || "") ? "24/7" : s.access_days_time || "",
        access: s.access_code === "private" ? "private" : "",
        fee: "",
        network: s.ev_network || "Tesla",
        source: "US DOE station locator",
        km: home ? distanceKm(home, { lat, lon }) : null,
      });
    }
    return out.sort((a, b) => a.km - b.km);
  }

  /* The same Supercharger usually appears in both sources. Keep one,
     taking OSM's power figure and DOE's stall count when they differ —
     the DOE list is fed by Tesla itself; OSM is where the kW tends to be. */
  function mergeChargers(a, b) {
    const out = a.map((c) => Object.assign({}, c));
    for (const c of b) {
      const twin = out.find((o) => o.tesla === c.tesla && distanceKm(o, c) < 0.12
        && (o.kind === c.kind || o.kind === "tesla"));
      if (!twin) { out.push(Object.assign({}, c)); continue; }
      if (c.stalls) twin.stalls = c.stalls;
      if (twin.kw == null) twin.kw = c.kw;
      if (twin.kind === "tesla") twin.kind = c.kind;
      if (!twin.address) twin.address = c.address;
      if (!twin.hours) twin.hours = c.hours;
      twin.source = `${twin.source} + ${c.source}`;
    }
    return out.sort((x, y) => x.km - y.km);
  }

  /* When live results replace the seed list, prices recorded against a
     seed store move to the real one it stands for: same brand or name,
     a couple of hundred metres away at most. */
  function matchSeed(seedStore, live) {
    const key = (s) => (s.brand || s.name).toLowerCase().replace(/[^a-z]/g, "");
    let best = null;
    for (const s of live) {
      const d = distanceKm(seedStore, s);
      if (d > 0.4) continue;
      if (key(s) !== key(seedStore) && !key(s).includes(key(seedStore))) continue;
      if (!best || d < best.d) best = { s, d };
    }
    return best ? best.s : null;
  }

  function withDistance(list, home) {
    return list.map((x) => Object.assign({}, x, { km: distanceKm(home, x) }))
      .sort((a, b) => a.km - b.km);
  }

  /* ---- each store's own search ---------------------------------------- */

  /* Where a chain's search URL is stable it's used directly; otherwise a
     site-restricted web search does the same job without guessing at
     paths that move with every redesign. */
  const CHAINS = [
    { test: /walmart/i, url: (q) => `https://www.walmart.com/search?q=${q}` },
    { test: /target/i, url: (q) => `https://www.target.com/s?searchTerm=${q}` },
    { test: /safeway/i, url: (q) => `https://www.safeway.com/shop/search-results.html?q=${q}` },
    { test: /harris\s*teeter/i, url: (q) => `https://www.harristeeter.com/search?query=${q}` },
    { test: /whole\s*foods/i, url: (q) => `https://www.wholefoodsmarket.com/search?text=${q}` },
    { test: /trader\s*joe/i, url: (q) => `https://www.traderjoes.com/home/search?q=${q}&section=products` },
    { test: /aldi/i, url: (q) => `https://www.aldi.us/results?q=${q}` },
    { test: /giant/i, site: "giantfood.com" },
    { test: /lidl/i, site: "lidl.com" },
    { test: /weis/i, site: "weismarkets.com" },
    { test: /shoprite/i, site: "shoprite.com" },
    { test: /food\s*lion/i, site: "foodlion.com" },
    { test: /save\s*a\s*lot/i, site: "savealot.com" },
    { test: /h\s*mart/i, site: "hmart.com" },
    { test: /cvs/i, site: "cvs.com" },
    { test: /walgreens/i, site: "walgreens.com" },
  ];

  function searchLink(store, item) {
    const q = encodeURIComponent(item);
    const who = `${store.brand || ""} ${store.name || ""}`;
    const chain = CHAINS.find((c) => c.test.test(who));
    if (chain && chain.url) return chain.url(q);
    const site = chain ? `site:${chain.site} ` : `"${store.name}" Baltimore `;
    return "https://www.google.com/search?q=" + encodeURIComponent(site + item + " price");
  }

  /* Instacart lists several local stores' prices side by side for one
     search — often a little above the shelf price, but a fast first look. */
  const instacartLink = (item) => `https://www.instacart.com/store/s?k=${encodeURIComponent(item)}`;

  function directionsLinks(home, place) {
    const dest = `${place.lat},${place.lon}`;
    return {
      google: `https://www.google.com/maps/dir/?api=1&origin=${home.lat},${home.lon}&destination=${dest}`,
      apple: `https://maps.apple.com/?saddr=${home.lat},${home.lon}&daddr=${dest}`,
    };
  }

  async function liveStores(home, radiusM, withCorner) {
    return parseStores(await overpass(storeQuery(home, radiusM, withCorner)), home);
  }

  /* Both sources are asked at once; either one alone is still an answer. */
  async function liveChargers(home, radiusM, nrelKey) {
    const [osm, doe] = await Promise.allSettled([
      overpass(chargerQuery(home, radiusM)).then((j) => parseChargers(j, home)),
      ER.util.fetchJSON(nrelURL(home, radiusM / 1609.344, nrelKey), {}, 20000).then((j) => parseNREL(j, home)),
    ]);
    if (osm.status === "rejected" && doe.status === "rejected") throw osm.reason;
    const list = mergeChargers(osm.status === "fulfilled" ? osm.value : [],
      doe.status === "fulfilled" ? doe.value : []);
    return {
      list,
      sources: {
        osm: osm.status === "fulfilled" ? "ok" : String(osm.reason && osm.reason.message || "failed"),
        doe: doe.status === "fulfilled" ? "ok" : String(doe.reason && doe.reason.message || "failed"),
      },
    };
  }

  ER.places = {
    DEFAULT_HOME, SEED, geocode,
    storeQuery, chargerQuery, parseStores, parseChargers, isTesla, kwOf,
    nrelURL, parseNREL, mergeChargers, matchSeed, withDistance,
    searchLink, instacartLink, directionsLinks, liveStores, liveChargers,
  };
})(window.ER);
