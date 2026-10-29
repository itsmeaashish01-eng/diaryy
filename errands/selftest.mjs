#!/usr/bin/env node
/* ================================================
   ERRANDS — selftest.mjs
   The parts that can be checked without a browser or a network.

     node errands/selftest.mjs

   Loads the modules into a sandbox with a fake localStorage, then checks
   the basket sums, the readers for OpenStreetMap and DOE answers (fed
   recorded-shape fixtures, not live calls), and the built-in list.
   app.js and map.js are left out: they need a DOM.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function sandbox() {
  const stored = new Map();
  const localStorage = {
    getItem: (k) => (stored.has(k) ? stored.get(k) : null),
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
  };
  const win = { localStorage };
  const ctx = createContext({
    window: win, localStorage, console, setTimeout, clearTimeout,
    URLSearchParams, AbortController, Date, Math, JSON, encodeURIComponent,
  });
  for (const n of ["util", "places", "basket", "store"]) {
    runInContext(readFileSync(join(HERE, "js", `${n}.js`), "utf8"), ctx, { filename: `errands/js/${n}.js` });
  }
  return win.ER;
}

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; return; }
  failed++;
  console.log(`  ✕ ${name}${detail ? " — " + detail : ""}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const ER = sandbox();
const { util, places, basket, store } = ER;
const home = places.DEFAULT_HOME;

/* ---- util ---- */
check("parsePrice reads plain and $ prices", util.parsePrice("3.49") === 3.49 && util.parsePrice("$4") === 4);
check("parsePrice reads a comma decimal", util.parsePrice("2,99") === 2.99);
check("parsePrice refuses junk rather than reading 0", util.parsePrice("") === null && util.parsePrice("abc") === null
  && util.parsePrice("-1") === null && util.parsePrice("1.234") === null);
check("one degree of latitude is about 111 km", near(util.distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111.19, 0.05));
check("miles under 0.2 read in feet", util.fmtMiles(0.1) === "328 ft" && util.fmtMiles(3.2187) === "2.0 mi");

/* ---- basket ---- */
const items = [
  { id: "milk", name: "Milk", qty: 1 },
  { id: "eggs", name: "Eggs", qty: 2 },
  { id: "bread", name: "Bread", qty: 1 },
];
const recent = "2026-10-28";
const P = (price, date = recent) => ({ price, date });
const now = Date.parse("2026-10-29T12:00:00Z");

{
  const prices = {
    A: { milk: P(3.49), eggs: P(4.00), bread: P(2.50) },   // 3.49 + 8.00 + 2.50 = 13.99
    B: { milk: P(3.29), eggs: P(4.50), bread: P(2.00) },   // 3.29 + 9.00 + 2.00 = 14.29
  };
  const r = basket.compare(items, ["A", "B"], prices, now);
  check("totals multiply by quantity", near(r.perStore.A.total, 13.99) && near(r.perStore.B.total, 14.29),
    `${r.perStore.A.total} / ${r.perStore.B.total}`);
  check("whole-list verdict picks the cheaper store", r.verdict.basis === "all" && r.verdict.best === "A");
  check("difference to the dearest store", near(r.verdict.vsWorst, 0.30));
  // Split: milk B 3.29, eggs A 8.00, bread B 2.00 = 13.29, saves 0.70
  check("split takes each item's cheapest store", r.split.picks.milk === "B" && r.split.picks.eggs === "A" && r.split.picks.bread === "B");
  check("split saving is worked out", r.verdict.split && near(r.verdict.split.total, 13.29) && near(r.verdict.split.saves, 0.70));
  check("spread is per line, quantity included", near(r.perItem.eggs.spread, 1.00));
}

{
  // B is missing bread: it must not "win" by leaving the dearest item out.
  const prices = {
    A: { milk: P(3.49), eggs: P(4.00), bread: P(2.50) },
    B: { milk: P(3.00), eggs: P(3.90) },
  };
  const r = basket.compare(items, ["A", "B"], prices, now);
  check("a store missing an item isn't in the whole-list ranking", r.complete.length === 1 && r.complete[0] === "A");
  check("the verdict goes to the complete store", r.verdict.best === "A" && r.verdict.basis === "all");
  check("a split can still use a store that is missing an item",
    r.verdict.split && r.verdict.split.stores.length === 2);
  check("missing items are named", r.perStore.B.missing.join() === "Bread");
}

{
  // Nobody has everything: compare on what they share.
  const prices = { A: { milk: P(3.49), eggs: P(4.00) }, B: { milk: P(3.19), bread: P(2.00) } };
  const r = basket.compare(items, ["A", "B"], prices, now);
  check("with no complete store, compare on common items", r.verdict && r.verdict.basis === "common"
    && r.verdict.commonCount === 1 && r.verdict.best === "B");
}

{
  const r = basket.compare(items, ["A", "B"], {}, now);
  check("no prices, no verdict — and blanks aren't zero", r.verdict === null && r.perItem.milk.min === null);
}

{
  const prices = { A: { milk: P(3.00) }, B: { milk: P(3.00) } };
  const r = basket.compare([items[0]], ["B", "A"], prices, now);
  check("a tie goes to the earlier (nearer) store", r.split.picks.milk === "B" && r.perItem.milk.cheapest.length === 2);
}

{
  const prices = { A: { milk: P(3.00, "2026-08-01") } };
  const r = basket.compare([items[0]], ["A"], prices, now);
  check("prices older than 30 days are counted as stale", r.perStore.A.stale === 1);
}

{
  const { rows, skipped } = basket.parsePasted("Milk, 1 gal 3.49\nEggs, dozen — $4.19\nbananas\t0.59\nnothing here\n\n2 lb rice 5");
  check("pasted lines read name then price", rows.length === 4 && rows[0].name === "Milk, 1 gal" && rows[0].price === 3.49
    && rows[1].name === "Eggs, dozen" && rows[1].price === 4.19 && rows[2].name === "bananas" && rows[3].name === "2 lb rice",
    JSON.stringify(rows));
  check("a line with no price is skipped, not guessed", skipped.length === 1 && skipped[0] === "nothing here");
  check("names match ignoring case and punctuation", basket.normName("Eggs (Dozen)") === basket.normName("eggs dozen"));
}

/* ---- OpenStreetMap readers ---- */
{
  const json = { elements: [
    { type: "node", id: 1, lat: 39.2829, lon: -76.5998, tags: { shop: "supermarket", name: "Whole Foods Market", brand: "Whole Foods Market",
      "addr:housenumber": "711", "addr:street": "South Central Avenue", "addr:city": "Baltimore" } },
    { type: "way", id: 2, center: { lat: 39.2913, lon: -76.6148 }, tags: { shop: "supermarket", name: "Streets Market" } },
    { type: "node", id: 3, lat: 39.29, lon: -76.62, tags: { shop: "supermarket" } },          // unnamed: dropped
    { type: "relation", id: 4, tags: { shop: "supermarket", name: "No position" } },          // no centre: dropped
  ] };
  const list = places.parseStores(json, home);
  check("stores: named ones with a position are kept", list.length === 2, String(list.length));
  check("stores: sorted nearest first", list[0].name === "Streets Market");
  check("stores: ways use their centre and get an osm id", list[0].id === "osm:way/2");
  check("stores: address assembled from addr:* tags", list[1].address === "711 South Central Avenue, Baltimore");
  check("store query asks for supermarkets around home",
    /around:3219,39\.2873,-76\.6191/.test(places.storeQuery(home, 3219, false))
    && !/convenience/.test(places.storeQuery(home, 3219, false)) && /convenience/.test(places.storeQuery(home, 3219, true)));
}

{
  const json = { elements: [
    { type: "node", id: 10, lat: 39.2745, lon: -76.5965, tags: { amenity: "charging_station", name: "Tesla Supercharger McHenry Row",
      brand: "Tesla, Inc.", capacity: "8", "socket:tesla_supercharger": "8", "socket:tesla_supercharger:output": "72 kW", opening_hours: "24/7" } },
    { type: "node", id: 11, lat: 39.285, lon: -76.61, tags: { amenity: "charging_station", operator: "Tesla",
      "socket:tesla_destination": "2", "socket:tesla_destination:output": "11 kW", access: "customers" } },
    { type: "node", id: 12, lat: 39.288, lon: -76.615, tags: { amenity: "charging_station", network: "ChargePoint",
      "socket:type1": "2", "socket:type1:output": "6.6 kW" } },
    { type: "node", id: 13, lat: 39.29, lon: -76.60, tags: { amenity: "charging_station", "brand:wikidata": "Q478214", capacity: "12",
      "charging_station:output": "250 kW" } },
  ] };
  const list = places.parseChargers(json, home);
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const sc = byId["osm:node/10"], dest = byId["osm:node/11"], cp = byId["osm:node/12"], wd = byId["osm:node/13"];
  check("chargers: Supercharger recognised with stalls and kW", sc.tesla && sc.kind === "supercharger" && sc.stalls === 8 && sc.kw === 72 && sc.hours === "24/7");
  check("chargers: Destination charger recognised, access noted", dest.tesla && dest.kind === "destination" && dest.access === "customers");
  check("chargers: other networks kept but not called Tesla", !cp.tesla && cp.kind === "level2" && cp.network === "ChargePoint");
  check("chargers: Tesla by Wikidata id, fast by power", wd.tesla && wd.kind === "supercharger" && wd.stalls === 12 && wd.kw === 250);
  check("kW reader takes the biggest figure", places.kwOf("11 kW;22 kW", "7kW") === 22 && places.kwOf("") === null);
}

/* ---- DOE / NREL reader ---- */
{
  const url = places.nrelURL(home, 10, "");
  check("DOE query: Tesla networks, open stations, DEMO_KEY by default",
    url.startsWith("https://developer.nrel.gov/") && /ev_network=Tesla%2CTesla\+Destination/.test(url)
    && /api_key=DEMO_KEY/.test(url) && /status=E/.test(url) && /radius=10/.test(url), url);
  const json = { fuel_stations: [
    { id: 152087, station_name: "Tesla Supercharger", ev_network: "Tesla", latitude: 39.27452, longitude: -76.59648,
      street_address: "1641 Whetstone Way", city: "Baltimore", state: "MD", ev_dc_fast_num: 8, ev_level2_evse_num: null,
      access_days_time: "24 hours daily", access_code: "public" },
    { id: 200001, station_name: "Hotel garage", ev_network: "Tesla Destination", latitude: 39.286, longitude: -76.617,
      street_address: "1 Example St", city: "Baltimore", state: "MD", ev_dc_fast_num: null, ev_level2_evse_num: 4,
      access_days_time: "Guests only", access_code: "private" },
  ] };
  const list = places.parseNREL(json, home);
  const sc = list.find((c) => c.id === "nrel:152087");
  const dest = list.find((c) => c.id === "nrel:200001");
  check("DOE: Supercharger with stall count and 24/7", sc.kind === "supercharger" && sc.stalls === 8 && sc.hours === "24/7");
  check("DOE: Destination, private access kept", dest.kind === "destination" && dest.stalls === 4 && dest.access === "private");

  // The same McHenry Row site from both sources becomes one entry.
  const osm = places.parseChargers({ elements: [{ type: "node", id: 10, lat: 39.2745, lon: -76.5965,
    tags: { amenity: "charging_station", name: "Tesla Supercharger", brand: "Tesla", "socket:tesla_supercharger:output": "72 kW" } }] }, home);
  const merged = places.mergeChargers(osm, list);
  const mc = merged.filter((c) => c.kind === "supercharger");
  check("merge: one site, not two", mc.length === 1, String(mc.length));
  check("merge: kW from OSM, stalls from DOE", mc[0].kw === 72 && mc[0].stalls === 8 && /\+/.test(mc[0].source));
  check("merge: unmatched stations kept", merged.length === 2);
}

/* ---- links ---- */
{
  const wf = { name: "Whole Foods Market", brand: "Whole Foods Market" };
  const giant = { name: "Giant", brand: "Giant" };
  const corner = { name: "Joe's Market", brand: "" };
  check("direct chain search, item encoded", places.searchLink(wf, "milk & eggs") === "https://www.wholefoodsmarket.com/search?text=milk%20%26%20eggs");
  check("site search where the chain's path isn't stable", /google\.com\/search\?q=site%3Agiantfood\.com/.test(places.searchLink(giant, "milk")));
  check("independent store: name search", places.searchLink(corner, "milk").includes(encodeURIComponent('"Joe\'s Market"')));
  const d = places.directionsLinks(home, { lat: 39.27, lon: -76.59 });
  check("directions start from home", d.google.includes("origin=39.2873,-76.6191") && d.apple.includes("daddr=39.27,-76.59"));
}

/* ---- built-in list ---- */
{
  const inBaltimore = (p) => p.lat > 39.19 && p.lat < 39.38 && p.lon > -76.72 && p.lon < -76.52;
  check("built-in stores are in Baltimore", places.SEED.stores.every(inBaltimore));
  check("built-in chargers are in Baltimore", places.SEED.chargers.every(inBaltimore));
  check("built-in chargers are within 5 miles of the default home",
    places.SEED.chargers.every((c) => util.distanceKm(home, c) < 5 * util.KM_PER_MI));
  check("built-in ids are unique", new Set([...places.SEED.stores, ...places.SEED.chargers].map((x) => x.id)).size
    === places.SEED.stores.length + places.SEED.chargers.length);
  check("built-in chargers carry every field the list shows",
    places.SEED.chargers.every((c) => c.tesla === true && c.kind && c.source && c.stalls && c.address));
}

/* ---- store: going online keeps your prices ---- */
{
  const s = store.load();
  check("fresh state has a starter list and stores to compare", s.items.length > 0 && s.compare.length >= 2);
  const milk = s.items[0];
  store.setPrice("seed:wholefoods-harbor-east", milk.id, 3.99);
  check("fresh state compares the built-in Whole Foods", s.compare.includes("seed:wholefoods-harbor-east"));
  const live = places.parseStores({ elements: [
    { type: "node", id: 99, lat: 39.28295, lon: -76.59985, tags: { shop: "supermarket", name: "Whole Foods Market", brand: "Whole Foods Market" } },
    { type: "node", id: 98, lat: 39.2747, lon: -76.5962, tags: { shop: "supermarket", name: "Harris Teeter", brand: "Harris Teeter" } },
  ] }, home);
  store.setStores(live, "live");
  const after = store.get();
  check("a seed store's prices move to its live twin", after.prices["osm:node/99"] && after.prices["osm:node/99"][milk.id].price === 3.99
    && !after.prices["seed:wholefoods-harbor-east"]);
  check("the comparison follows too", after.compare.includes("osm:node/99") && !after.compare.some((id) => id.startsWith("seed:")));
  const round = JSON.parse(store.exportJSON());
  check("backup carries items and prices", round.items.length === after.items.length && round.prices["osm:node/99"]);
  store.removeItem(milk.id);
  check("removing an item removes its prices", !store.get().prices["osm:node/99"][milk.id]);
}

console.log(`errands selftest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
