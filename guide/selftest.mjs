#!/usr/bin/env node
/* ================================================
   ROAMGUIDE — selftest.mjs
   The parts that can be checked without a browser.

     node guide/selftest.mjs

   The app's modules are plain scripts that hang themselves off a global,
   so this runs them in a sandbox with just enough window to satisfy them
   and then exercises the reasoning: distances, opening hours, what a day
   actually looks like once the walking is counted, and whether the
   guidebook's own data holds together.

   ui.js and app.js are left out — they need a DOM, and what they do is
   render what the modules below decide.
   ================================================ */

import { readFileSync, readdirSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---- a browser, for a very small value of "browser" ---------------- */
function sandbox() {
  const stored = new Map();
  const localStorage = {
    getItem: (k) => (stored.has(k) ? stored.get(k) : null),
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
  };
  const win = {
    localStorage,
    isSecureContext: true,
    // A fake that hands back a fixed position, so "what's near me" is
    // testable without a GPS or a browser prompt.
    navigator: { geolocation: null, userAgent: "node", maxTouchPoints: 0 },
  };
  const ctx = createContext({
    window: win,
    localStorage,
    navigator: win.navigator,
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    AbortController,
    Intl,
    Date,
    Math,
    JSON,
  });
  const load = (rel) => {
    const src = readFileSync(join(HERE, "js", rel), "utf8");
    runInContext(src, ctx, { filename: `guide/js/${rel}` });
  };
  ["util", "geo", "catalog", "store", "plan", "map", "live", "lookup"]
    .forEach((n) => load(`${n}.js`));
  // Every city registers itself, so the suite reads the directory rather
  // than a list that would quietly go stale as cities are added.
  readdirSync(join(HERE, "js", "cities"))
    .filter((f) => f.endsWith(".js"))
    .sort()
    .forEach((f) => load(join("cities", f)));
  return win.RG;
}

const RG = sandbox();
const { util: U, geo, catalog, store, plan, map, live } = RG;

/* ---- the harness -------------------------------------------------- */
let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || "value"}: expected ${b}, got ${a}`);
}
function near(actual, expected, tol, what) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${what || "value"}: expected ${expected} ±${tol}, got ${actual}`);
  }
}
const ok = (cond, what) => { if (!cond) throw new Error(what || "expected true"); };

/* ---- time and formatting ------------------------------------------ */

check("times parse, and nonsense doesn't", () => {
  eq(U.toMinutes("09:30"), 570, "09:30");
  eq(U.toMinutes("00:00"), 0, "midnight");
  eq(U.toMinutes("23:59"), 1439, "end of day");
  eq(U.toMinutes("9:5"), null, "malformed");
  eq(U.toMinutes("25:00"), null, "hour out of range");
  eq(U.toMinutes(""), null, "empty");
});

check("a plan that runs past midnight says so", () => {
  eq(U.fromMinutes(570), "9:30 am", "morning");
  eq(U.fromMinutes(720), "12:00 pm", "noon");
  eq(U.fromMinutes(0), "12:00 am", "midnight");
  eq(U.fromMinutes(1470), "12:30 am (+1)", "past midnight is marked");
});

check("durations and distances read as English", () => {
  eq(U.fmtDuration(45), "45m");
  eq(U.fmtDuration(60), "1h");
  eq(U.fmtDuration(80), "1h 20m");
  eq(U.fmtDistance(0.4), "400 m");
  eq(U.fmtDistance(2.35), "2.4 km");
  eq(U.fmtDistance(1.60934, "mi"), "1.0 mi");
});

check("dates: a weekday west of UTC doesn't slip back a day", () => {
  eq(U.weekdayOf("2026-09-16"), 3, "Wednesday");
  eq(U.addDays("2026-09-16", 1), "2026-09-17", "next day");
  eq(U.addDays("2026-12-31", 1), "2027-01-01", "over new year");
  eq(U.addDays("2026-02-28", 1), "2026-03-01", "non-leap February");
});

check("accents fold, so a plain keyboard still finds the place", () => {
  ok(U.fold("Sé Cathedral").includes("se cathedral"), "é folds to e");
  ok(U.fold("Zócalo").includes("zocalo"), "ó folds to o");
});

/* ---- geo ----------------------------------------------------------- */

check("distance is right at city scale", () => {
  // Hagia Sophia to the Blue Mosque — about 400 m apart in reality.
  const d = geo.distanceKm({ lat: 41.0086, lon: 28.9802 }, { lat: 41.0054, lon: 28.9768 });
  near(d, 0.42, 0.08, "Sultanahmet hop");
  eq(geo.distanceKm({ lat: 1, lon: 1 }, { lat: 1, lon: 1 }), 0, "same point");
  eq(geo.distanceKm(null, { lat: 1, lon: 1 }), null, "missing point");
});

check("short hops are walked, long ones ride", () => {
  const a = { lat: 41.0086, lon: 28.9802 };
  const near_ = { lat: 41.0054, lon: 28.9768 };
  const far = { lat: 41.0369, lon: 28.9850 };
  eq(geo.leg(a, near_).mode, "walk", "400 m");
  eq(geo.leg(a, far).mode, "transit", "3 km+");
  ok(geo.leg(a, far, { transit: false }).mode === "walk", "transit can be refused");
});

check("transit only wins once it's worth the wait", () => {
  const a = { lat: 35.0, lon: 135.0 };
  const b = { lat: 35.02, lon: 135.0 };     // ~2.2 km, just over the walk limit
  const l = geo.leg(a, b);
  const walkMin = (geo.distanceKm(a, b) * geo.DETOUR / 4.5) * 60;
  ok(l.minutes <= Math.round(walkMin), "whichever is quicker is the one offered");
});

check("reordering a day cuts the walking, and leaves stop one alone", () => {
  // A deliberately terrible order: back and forth across a line.
  const pts = [
    { id: "a", lat: 35.000, lon: 135.000 },
    { id: "d", lat: 35.030, lon: 135.000 },
    { id: "b", lat: 35.010, lon: 135.000 },
    { id: "c", lat: 35.020, lon: 135.000 },
  ];
  const before = geo.routeKm(pts);
  const after = geo.optimiseOrder(pts);
  eq(after[0].id, "a", "first stop is an anchor");
  eq(after.map((p) => p.id), ["a", "b", "c", "d"], "the sensible order");
  ok(geo.routeKm(after) < before, "and it is shorter");
});

check("reordering is stable — twice gives the same answer", () => {
  const pts = [
    { id: "a", lat: 35.00, lon: 135.00 },
    { id: "b", lat: 35.05, lon: 135.02 },
    { id: "c", lat: 35.01, lon: 135.03 },
    { id: "d", lat: 35.03, lon: 135.01 },
  ];
  const once = geo.optimiseOrder(pts).map((p) => p.id);
  const twice = geo.optimiseOrder(geo.optimiseOrder(pts)).map((p) => p.id);
  eq(twice, once, "idempotent");
});

check("the map projects with north up and one scale on both axes", () => {
  const pts = [
    { lat: 35.00, lon: 135.00 },
    { lat: 35.02, lon: 135.00 },
    { lat: 35.00, lon: 135.02 },
  ];
  const proj = geo.projector(pts, 400, 300, 10);
  const south = proj.project(pts[0]), north = proj.project(pts[1]);
  ok(north.y < south.y, "further north is higher up the SVG");
  ok(proj.scaleKmPerPx > 0, "there is a usable scale");

  // Equal ground distances should come out roughly equal on screen.
  const east = proj.project(pts[2]);
  const dy = Math.abs(south.y - north.y);
  const dx = Math.abs(east.x - south.x);
  // 0.02° of longitude at 35°N is ~0.82 of 0.02° of latitude.
  near(dx / dy, Math.cos(35 * Math.PI / 180), 0.05, "aspect holds");
});

check("one marker doesn't divide by zero", () => {
  const proj = geo.projector([{ lat: 35, lon: 135 }], 400, 300, 10);
  const p = proj.project({ lat: 35, lon: 135 });
  ok(Number.isFinite(p.x) && Number.isFinite(p.y), "finite coordinates");
  ok(p.x > 0 && p.x < 400 && p.y > 0 && p.y < 300, "inside the box");
});

/* ---- opening hours -------------------------------------------------- */

const H = catalog.hours;

check("hours: a closed day is closed, and says which day", () => {
  const p = { hours: H.except("09:00-17:00", [1]) };
  const mon = plan.hoursFor(p, 1);
  ok(mon.closed, "Monday is shut");
  ok(/Monday/.test(mon.text), `names the day, got "${mon.text}"`);
  eq(plan.hoursFor(p, 2).closed, false, "Tuesday is open");
});

check("hours: a place open past midnight closes tomorrow", () => {
  const h = plan.hoursFor({ hours: H.daily("20:00-02:00") }, 3);
  eq(h.open, 1200, "opens 8pm");
  eq(h.close, 1560, "closes at 2am the next day, not yesterday");
});

check("hours: unknown stays unknown rather than becoming midnight", () => {
  eq(plan.hoursFor({ hours: H.daily("by appointment") }, 3).known, false, "unparseable");
  eq(plan.hoursFor({}, 3).known, false, "absent");
  eq(plan.hoursFor({ hours: H.daily("09:00-17:00") }, null).known, false, "no date yet");
});

/* ---- building a day -------------------------------------------------- */

const PLACES = {
  hotel: { id: "hotel", name: "Hotel", lat: 35.000, lon: 135.000, min: 0, hours: H.ALWAYS },
  near:  { id: "near",  name: "Near temple", lat: 35.004, lon: 135.000, min: 60, hours: H.daily("09:00-17:00") },
  late:  { id: "late",  name: "Late opener", lat: 35.006, lon: 135.000, min: 60, hours: H.daily("13:00-17:00") },
  shut:  { id: "shut",  name: "Shut today",  lat: 35.008, lon: 135.000, min: 60, hours: H.except("09:00-17:00", [3]) },
  far:   { id: "far",   name: "Across town", lat: 35.060, lon: 135.050, min: 90, hours: H.daily("09:00-17:00") },
};
const ctx = (over) => Object.assign({
  place: (id) => PLACES[id] || null,
  opts: { walkKmh: 4.5, maxWalkKm: 1.8, paceFactor: 1, dayStart: 540, dayEnd: 1260 },
}, over || {});
const day = (stops, date) => ({
  date: date || "2026-09-16",   // a Wednesday
  startMin: null,
  stops: stops.map((s, i) => (typeof s === "string" ? { id: `s${i}`, placeId: s, at: null } : s)),
});

check("a day starts when you do, and each stop follows the last", () => {
  const built = plan.buildDay(day(["near"]), ctx());
  const stops = built.blocks.filter((b) => b.type === "stop");
  eq(stops.length, 1, "one stop");
  eq(stops[0].startMin, 540, "starts at 9");
  eq(stops[0].endMin, 600, "an hour later");
  eq(built.travelMin, 0, "nothing to travel to");
});

check("getting between stops takes time, and the time is counted", () => {
  const built = plan.buildDay(day(["near", "far"]), ctx());
  const travel = built.blocks.filter((b) => b.type === "travel");
  eq(travel.length, 1, "one leg");
  eq(travel[0].mode, "transit", "across town");
  ok(travel[0].minutes > 10, "and it isn't free");
  const stops = built.blocks.filter((b) => b.type === "stop");
  eq(stops[1].startMin, 600 + travel[0].minutes, "second stop starts after the journey");
  eq(built.travelMin, travel[0].minutes, "totalled");
});

check("a place shut that day is flagged, not quietly scheduled", () => {
  const built = plan.buildDay(day(["shut"]), ctx());     // the 16th is a Wednesday
  const w = built.blocks.find((b) => b.type === "stop").warnings;
  eq(w.length, 1, "one warning");
  eq(w[0].level, "critical", "not a suggestion");
  ok(/Wednesday/.test(w[0].text), `says which day, got "${w[0].text}"`);
});

check("arriving before the doors open shows the wait", () => {
  const built = plan.buildDay(day(["late"]), ctx());
  const wait = built.blocks.find((b) => b.type === "wait");
  ok(wait, "a wait block exists");
  eq(wait.minutes, 780 - 540, "four hours until one o'clock");
  const stop = built.blocks.find((b) => b.type === "stop");
  eq(stop.startMin, 780, "and the visit starts when it opens");
  ok(stop.warnings.some((x) => x.level === "warning"), "long waits are worth mentioning");
});

check("not enough time before closing is a warning, not a silent overrun", () => {
  const d = day([{ id: "s0", placeId: "near", at: 990 }]);   // pinned 4:30pm, closes 5
  const built = plan.buildDay(d, ctx());
  const stop = built.blocks.find((b) => b.type === "stop");
  ok(stop.warnings.some((w) => /before it closes/.test(w.text)), "says the visit gets cut short");
});

check("a pinned time you can't make is called out", () => {
  const d = day(["far", { id: "s1", placeId: "near", at: 600 }]);   // 10am, unreachable
  const built = plan.buildDay(d, ctx());
  const pinned = built.blocks.filter((b) => b.type === "stop")[1];
  ok(pinned.warnings.some((w) => w.level === "serious" && /after the/.test(w.text)),
     "warns you'd arrive late");
});

check("pace stretches the day without touching the guidebook", () => {
  const steady = plan.buildDay(day(["near"]), ctx());
  const relaxed = plan.buildDay(day(["near"]), ctx({
    opts: Object.assign({}, ctx().opts, { paceFactor: 1.3 }),
  }));
  ok(relaxed.dwellMin > steady.dwellMin, "relaxed lingers");
  eq(PLACES.near.min, 60, "the catalogue is untouched");
});

check("a day running past your evening is flagged once, at the end", () => {
  const built = plan.buildDay(day(["near", "far", "late"]), ctx({
    opts: Object.assign({}, ctx().opts, { dayEnd: 660 }),   // 11am
  }));
  eq(built.warnings.filter((w) => /past the/.test(w.text)).length, 1, "said once");
});

check("a stop whose place has vanished still renders, so it can be deleted", () => {
  const built = plan.buildDay(day(["ghost"]), ctx());
  const b = built.blocks[0];
  eq(b.type, "stop", "still a block");
  eq(b.missing, true, "marked missing");
});

check("tidying keeps a pinned stop in its slot", () => {
  const d = day([
    "hotel",
    { id: "pinned", placeId: "far", at: 720 },
    "shut",
    "late",
  ]);
  const order = plan.tidyOrder(d, ctx());
  eq(order.length, 4, "nothing lost");
  eq(order[1], "pinned", "the booking holds its place");
  eq(new Set(order).size, 4, "and nothing duplicated");
});

check("tidying a day with nothing to sort leaves it alone", () => {
  const d = day(["near", "far"]);
  eq(plan.tidyOrder(d, ctx()), ["s0", "s1"], "two stops, untouched");
});

/* ---- suggesting a day ------------------------------------------------ */

check("a suggested day never includes somewhere shut", () => {
  const pool = Object.values(PLACES);
  const picks = plan.suggestDay({ id: "x" }, pool, { opts: ctx().opts, weekday: 3 });
  ok(picks.length > 0, "it suggests something");
  ok(!picks.some((p) => p.id === "shut"), "but not the closed one");
});

check("a suggested day fits inside the hours you gave it", () => {
  const pool = Object.values(PLACES);
  const opts = Object.assign({}, ctx().opts, { dayEnd: 720 });   // finish by noon
  const picks = plan.suggestDay({ id: "x" }, pool, { opts, weekday: 3 });
  const built = plan.buildDay(day(picks.map((p) => p.id)), ctx({ opts }));
  ok(built.endMin <= 720, `ends by noon, got ${U.fromMinutes(built.endMin)}`);
});

check("a suggested day skips what you've already planned or seen", () => {
  const pool = Object.values(PLACES);
  const picks = plan.suggestDay({ id: "x" }, pool, {
    opts: ctx().opts, weekday: 3, exclude: new Set(["near", "far"]),
  });
  ok(!picks.some((p) => p.id === "near" || p.id === "far"), "excluded ids stay out");
});

check("a long wait for a late opener is not worth suggesting", () => {
  const evening = { id: "evening", name: "Dinner street", lat: 35.004, lon: 135.0,
                    min: 90, hours: catalog.hours.daily("17:00-23:00") };
  const picks = plan.suggestDay({ id: "x" }, [PLACES.near, evening],
    { opts: ctx().opts, weekday: 3 });
  ok(!picks.some((p) => p.id === "evening"), "five hours of loitering is not a plan");

  // Start late enough that the wait is reasonable and it comes back in.
  const late = plan.suggestDay({ id: "x" }, [PLACES.near, evening], {
    opts: Object.assign({}, ctx().opts, { dayStart: 900 }), weekday: 3,
  });
  ok(late.some((p) => p.id === "evening"), "at three in the afternoon it fits");
});

check("a day trip is left out — it deserves a day, not an afternoon", () => {
  const pool = [
    PLACES.near,
    PLACES.late,
    Object.assign({}, PLACES.far, { id: "trip", tags: ["day-trip"] }),
  ];
  const picks = plan.suggestDay({ id: "x" }, pool, { opts: ctx().opts, weekday: 3 });
  ok(!picks.some((p) => p.id === "trip"), "not suggested by default");
  const asked = plan.suggestDay({ id: "x" }, pool, {
    opts: ctx().opts, weekday: 3, includeDayTrips: true,
  });
  ok(asked.some((p) => p.id === "trip"), "but available when asked for");
});

check("nothing suggestible returns nothing, rather than guessing", () => {
  eq(plan.suggestDay({ id: "x" }, [PLACES.shut], { opts: ctx().opts, weekday: 3 }), []);
  eq(plan.suggestDay({ id: "x" }, [], { opts: ctx().opts, weekday: 3 }), []);
});

/* ---- the store -------------------------------------------------------- */

function freshStore() {
  const s = sandbox().store;
  s.load();
  return s;
}

check("a trip starts with the days you asked for, dated in order", () => {
  const s = freshStore();
  const t = s.addTrip({ name: "Test", cityId: "kyoto", startDate: "2026-09-16",
    days: [s.blankDay("2026-09-16"), s.blankDay("2026-09-17")] });
  eq(t.days.length, 2, "two days");
  eq(t.days[1].date, "2026-09-17", "consecutive");
  eq(s.activeTrip().id, t.id, "and it becomes the active one");
});

check("moving the first day drags the whole trip with it", () => {
  const s = freshStore();
  const t = s.addTrip({ startDate: "2026-09-16",
    days: [s.blankDay("2026-09-16"), s.blankDay("2026-09-17"), s.blankDay("2026-09-18")] });
  s.updateTrip(t.id, { startDate: "2026-10-01" });
  eq(s.trip(t.id).days.map((d) => d.date), ["2026-10-01", "2026-10-02", "2026-10-03"], "all three shift");
});

check("the same place twice on one day is refused, on another is fine", () => {
  const s = freshStore();
  const t = s.addTrip({ days: [s.blankDay("2026-09-16"), s.blankDay("2026-09-17")] });
  ok(s.addStop(t.id, 0, "kyo-fushimi"), "added once");
  eq(s.addStop(t.id, 0, "kyo-fushimi"), null, "refused twice on the same day");
  ok(s.addStop(t.id, 1, "kyo-fushimi"), "but fine the next day");
});

check("stops move within a day and between days, keeping their notes", () => {
  const s = freshStore();
  const t = s.addTrip({ days: [s.blankDay("2026-09-16"), s.blankDay("2026-09-17")] });
  const a = s.addStop(t.id, 0, "kyo-fushimi");
  s.addStop(t.id, 0, "kyo-gion");
  s.updateStop(t.id, 0, a.id, { note: "go early", at: 400 });

  s.moveStop(t.id, 0, a.id, 1);
  eq(s.trip(t.id).days[0].stops[1].id, a.id, "moved down");

  s.moveStopToDay(t.id, 0, a.id, 1);
  eq(s.trip(t.id).days[0].stops.length, 1, "gone from day one");
  const moved = s.trip(t.id).days[1].stops[0];
  eq(moved.note, "go early", "note travelled with it");
  eq(moved.at, 400, "so did the pinned time");
});

check("moving a stop off the end of the day does nothing", () => {
  const s = freshStore();
  const t = s.addTrip({ days: [s.blankDay("2026-09-16")] });
  const a = s.addStop(t.id, 0, "kyo-fushimi");
  s.addStop(t.id, 0, "kyo-gion");
  s.moveStop(t.id, 0, a.id, -1);
  eq(s.trip(t.id).days[0].stops[0].id, a.id, "still first");
});

check("reordering keeps every stop, even ones the caller forgot", () => {
  const s = freshStore();
  const t = s.addTrip({ days: [s.blankDay("2026-09-16")] });
  const a = s.addStop(t.id, 0, "kyo-fushimi");
  const b = s.addStop(t.id, 0, "kyo-gion");
  const c = s.addStop(t.id, 0, "kyo-nishiki");
  s.reorderStops(t.id, 0, [c.id, a.id]);          // b left out
  const ids = s.trip(t.id).days[0].stops.map((x) => x.id);
  eq(ids.length, 3, "nothing dropped");
  eq(ids.slice(0, 2), [c.id, a.id], "the given order held");
});

check("deleting your own pin takes it off every day it was planned into", () => {
  const s = freshStore();
  const t = s.addTrip({ days: [s.blankDay("2026-09-16"), s.blankDay("2026-09-17")] });
  const p = s.addCustomPlace({ name: "The bakery", lat: 35, lon: 135, city: "kyoto" });
  s.addStop(t.id, 0, p.id);
  s.addStop(t.id, 1, p.id);
  s.toggleSaved(p.id);
  s.markVisited(p.id, {});

  s.removeCustomPlace(p.id);
  eq(s.trip(t.id).days[0].stops.length, 0, "day one cleaned up");
  eq(s.trip(t.id).days[1].stops.length, 0, "day two too");
  eq(s.isSaved(p.id), false, "unsaved");
  eq(s.isVisited(p.id), false, "and unvisited");
});

check("your own pins are findable the same way the guidebook's are", () => {
  const s = freshStore();
  const p = s.addCustomPlace({ name: "The bakery", lat: 35, lon: 135, city: "kyoto" });
  eq(s.place(p.id).name, "The bakery", "by id");
  ok(s.allPlaces().some((x) => x.id === p.id), "and in the full list");
  ok(s.allPlaces().some((x) => x.id === "kyo-fushimi"), "alongside the built-ins");
});

check("deleting a trip hands the active slot to another one", () => {
  const s = freshStore();
  const a = s.addTrip({ name: "A", days: [s.blankDay("2026-09-16")] });
  const b = s.addTrip({ name: "B", days: [s.blankDay("2026-09-16")] });
  eq(s.activeTrip().id, b.id, "newest is active");
  s.removeTrip(b.id);
  eq(s.activeTrip().id, a.id, "falls back rather than going null");
  s.removeTrip(a.id);
  eq(s.activeTrip(), null, "and null only when there are none left");
});

check("saved and visited toggle both ways", () => {
  const s = freshStore();
  eq(s.toggleSaved("kyo-gion"), true, "saved");
  eq(s.isSaved("kyo-gion"), true);
  eq(s.toggleSaved("kyo-gion"), false, "unsaved");
  s.markVisited("kyo-gion", { note: "at dusk" });
  eq(s.visitedAll()["kyo-gion"].note, "at dusk", "note kept");
  s.markVisited("kyo-gion", null);
  eq(s.isVisited("kyo-gion"), false, "and clearable");
});

check("saved data survives a round trip through localStorage", () => {
  const RG2 = sandbox();
  RG2.store.load();
  const t = RG2.store.addTrip({ name: "Round trip", cityId: "lisbon",
    days: [RG2.store.blankDay("2026-09-16")] });
  RG2.store.addStop(t.id, 0, "lis-castelo");
  RG2.store.save(true);

  // Same sandbox, so the same localStorage — but a fresh read.
  const reread = RG2.store.load();
  eq(reread.trips.length, 1, "trip came back");
  eq(reread.trips[0].days[0].stops[0].placeId, "lis-castelo", "and its stop");
});

check("a corrupt or half-shaped file becomes defaults, not a crash", () => {
  const s = freshStore();
  s.importAll(null, "replace");
  eq(s.trips().length, 0, "null");
  s.importAll({ trips: [{ name: "half", days: [{ stops: [{ placeId: "x" }] }] }] }, "replace");
  eq(s.trips().length, 1, "a trip missing most of its fields still loads");
  eq(s.trips()[0].days[0].stops[0].done, false, "with the gaps filled in");
  ok(s.settings().pace, "and settings restored");
});

check("importing as a merge keeps what's already there", () => {
  const s = freshStore();
  const mine = s.addTrip({ name: "Mine", days: [s.blankDay("2026-09-16")] });
  s.importAll({ trips: [{ id: mine.id, name: "Theirs", days: [] }] }, "merge");
  eq(s.trips().length, 2, "both trips");
  ok(s.trips()[0].id !== s.trips()[1].id, "the id clash was resolved");
});

check("planner options come out of settings in the units plan.js expects", () => {
  const s = freshStore();
  s.setSettings({ dayStart: "07:30", dayEnd: "22:00", pace: "packed" });
  const o = s.planOpts();
  eq(o.dayStart, 450, "07:30");
  eq(o.dayEnd, 1320, "22:00");
  eq(o.paceFactor, s.PACE.packed.factor, "pace carried through");
});

/* ---- map output ------------------------------------------------------- */

check("the scale bar lands on a round number that fits", () => {
  const s = map.niceScale(0.01, 100);   // up to 1 km of bar
  ok(s.km <= 1 && s.px <= 100, "fits the space");
  ok([0.1, 0.2, 0.25, 0.5, 1].includes(s.km), `round number, got ${s.km}`);
});

check("geojson comes out with points, an order, and a line through them", () => {
  const gj = map.toGeoJSON([
    { lat: 35.0, lon: 135.0, label: "One" },
    { lat: 35.1, lon: 135.1, label: "Two" },
  ], "Day");
  eq(gj.type, "FeatureCollection");
  eq(gj.features.length, 3, "two points and the route");
  eq(gj.features[0].geometry.coordinates, [135.0, 35.0], "longitude first, as the spec wants");
  eq(gj.features[0].properties.order, 1, "numbered");
  eq(gj.features[2].geometry.type, "LineString", "and joined up");
});

check("a single stop gets no route line", () => {
  eq(map.toGeoJSON([{ lat: 35, lon: 135, label: "One" }]).features.length, 1);
});

/* ---- the guidebook itself ---------------------------------------------- */

check("every place has an id, and no id is used twice", () => {
  const ids = catalog.allPlaces().map((p) => p.id);
  eq(ids.filter((x) => !x).length, 0, "all present");
  eq(ids.length, new Set(ids).size, "all unique");
  const cityIds = catalog.cities.map((c) => c.id);
  eq(cityIds.length, new Set(cityIds).size, "cities too");
});

check("every place is somewhere real, and near its city", () => {
  catalog.cities.forEach((c) => {
    c.places.forEach((p) => {
      ok(Number.isFinite(p.lat) && Math.abs(p.lat) <= 90, `${p.id}: latitude`);
      ok(Number.isFinite(p.lon) && Math.abs(p.lon) <= 180, `${p.id}: longitude`);
      // 60 km is generous enough for a day trip like Teotihuacán and tight
      // enough to catch a swapped sign or a transposed pair.
      const d = geo.distanceKm(c.center, p);
      ok(d < 60, `${p.id}: ${Math.round(d)} km from ${c.name} — coordinates look wrong`);
    });
  });
});

check("every place has hours that parse, a category, and a length", () => {
  const cats = Object.keys(catalog.CATEGORIES);
  catalog.allPlaces().forEach((p) => {
    ok(cats.includes(p.cat), `${p.id}: unknown category "${p.cat}"`);
    ok(Array.isArray(p.hours) && p.hours.length === 7, `${p.id}: seven days of hours`);
    p.hours.forEach((h, d) => {
      if (!h) return;                       // closed that day is fine
      const parsed = plan.hoursFor(p, d);
      ok(parsed.known, `${p.id}: unreadable hours "${h}"`);
      ok(parsed.close > parsed.open, `${p.id}: closes before it opens on day ${d}`);
    });
    ok(Number.isFinite(p.min) && p.min > 0, `${p.id}: needs a visit length`);
    ok(p.blurb && p.blurb.length > 10, `${p.id}: needs a description`);
  });
});

check("every city can actually be planned — a full day exists in each", () => {
  catalog.cities.forEach((c) => {
    const picks = plan.suggestDay(c, c.places, {
      opts: { walkKmh: 4.5, maxWalkKm: 1.8, paceFactor: 1, dayStart: 540, dayEnd: 1260 },
      weekday: 3,
    });
    ok(picks.length >= 3, `${c.name}: only ${picks.length} stops fit a Wednesday`);
  });
});

check("every place carries its history, in paragraphs", () => {
  catalog.allPlaces().forEach((p) => {
    ok(p.history, `${p.id}: no history written`);
    ok(p.history.length > 200, `${p.id}: history is a caption, not a history`);
    ok(p.history.includes("\n\n"), `${p.id}: history should break into paragraphs`);
    ok(!/\n\n\n/.test(p.history), `${p.id}: stray blank paragraph`);
    ok(p.history.trim() === p.history, `${p.id}: history has loose whitespace`);
  });
});

check("every city has the practical section filled in", () => {
  catalog.cities.forEach((c) => {
    ["transit", "money", "tipping", "water", "etiquette", "emergency", "power"].forEach((k) => {
      ok(c.basics && c.basics[k], `${c.name}: missing ${k}`);
    });
    ok(c.currency && c.currency.length === 3, `${c.name}: ISO currency code`);
    ok(Number.isFinite(c.dayBudget) && c.dayBudget > 0, `${c.name}: a starting budget`);
  });
});

check("every phrase has an English side, a local side and a way to say it", () => {
  catalog.cities.forEach((c) => {
    ok((c.phrases || []).length >= 3, `${c.name}: needs a few phrase groups`);
    c.phrases.forEach((g) => {
      ok(g.group && g.items.length, `${c.name}/${g.group}: empty group`);
      g.items.forEach((it) => {
        eq(it.length, 3, `${c.name}/${g.group}: "${it[0]}" needs all three parts`);
        it.forEach((part) => ok(part && String(part).trim(), `${c.name}: blank part in "${it[0]}"`));
      });
    });
  });
});

check("currency formatting survives every code the guidebook uses", () => {
  catalog.cities.forEach((c) => {
    const out = U.fmtMoney(1234, c.currency);
    ok(out && out !== "—", `${c.currency}: formats`);
    ok(/1/.test(out), `${c.currency}: has the number in it, got "${out}"`);
  });
});

/* ---- live location ------------------------------------------------------ */

const FIX = (lat, lon, accuracy) => ({ lat, lon, accuracy: accuracy == null ? 10 : accuracy, at: Date.now() });

check("bearings point the right way, and read as compass points", () => {
  const here = { lat: 35.0, lon: 135.0 };
  near(live.bearing(here, { lat: 36.0, lon: 135.0 }), 0, 1, "due north");
  near(live.bearing(here, { lat: 35.0, lon: 136.0 }), 90, 1, "due east");
  near(live.bearing(here, { lat: 34.0, lon: 135.0 }), 180, 1, "due south");
  near(live.bearing(here, { lat: 35.0, lon: 134.0 }), 270, 1, "due west");
  eq(live.compass(0), "N");
  eq(live.compass(45), "NE");
  eq(live.compass(200), "SSW");
  eq(live.compass(359), "N", "wraps");
});

check("what's nearby comes back nearest first, with distance and direction", () => {
  const fix = FIX(35.0116, 135.7681);      // central Kyoto
  const list = live.nearby(catalog.allPlaces(), fix, 5);
  eq(list.length, 5, "five back");
  for (let i = 1; i < list.length; i++) {
    ok(list[i].km >= list[i - 1].km, "sorted by distance");
  }
  ok(list[0].place.city === "kyoto", `nearest is in Kyoto, got ${list[0].place.cityName}`);
  ok(list.every((n) => n.bearing >= 0 && n.bearing < 360), "every bearing is a compass angle");
});

check("standing at a place counts as arrival; across the street does not", () => {
  const p = catalog.placeById("kyo-nishiki");
  eq(live.nearby([p], FIX(p.lat, p.lon), 1)[0].arrived, true, "on top of it");
  // ~700 m north
  eq(live.nearby([p], FIX(p.lat + 0.0063, p.lon), 1)[0].arrived, false, "700 m away");
});

check("a vague fix widens what counts as arrival, rather than claiming precision", () => {
  const p = catalog.placeById("kyo-nishiki");
  const tight = live.nearby([p], FIX(p.lat + 0.0018, p.lon, 10), 1)[0];   // ~200 m
  const loose = live.nearby([p], FIX(p.lat + 0.0018, p.lon, 500), 1)[0];
  eq(tight.arrived, false, "200 m out on a good fix is not arrival");
  eq(loose.arrived, true, "on a ±500 m fix it might well be, and says so");
});

check("the guidebook knows when it has nothing to say about where you are", () => {
  const kyoto = live.cityAt(FIX(35.0116, 135.7681), catalog.cities);
  eq(kyoto.city.id, "kyoto", "in Kyoto");

  const atlantic = live.cityAt(FIX(0, -30), catalog.cities);
  eq(atlantic.city, null, "mid-ocean is not in any city");
  ok(atlantic.nearest, "but it still names the closest");
  ok(atlantic.km > 1000, "and how far off it is");
});

check("accuracy is described honestly at every scale", () => {
  eq(live.quality(FIX(0, 0, 8)).level, "good");
  eq(live.quality(FIX(0, 0, 90)).level, "warning");
  ok(/wifi/.test(live.quality(FIX(0, 0, 3000)).text), "a 3 km fix says where it came from");
  eq(live.quality(null), null, "no fix, no claim");
});

check("with no geolocation at all, it says so rather than hanging", () => {
  ok(live.blockedReason(), "there is a reason");
  eq(live.start(), false, "and starting fails cleanly");
  ok(live.state.error && live.state.error.code === "blocked", "recorded on the state");
});

/* ---- maps hand-off ------------------------------------------------------- */

check("directions open the right place in Google and Apple Maps", () => {
  const from = { lat: 35.0, lon: 135.0 };
  const to = { lat: 35.01, lon: 135.01, name: "Somewhere" };

  const g = map.googleDirections(from, to, "walk");
  ok(g.includes("origin=35,135"), `origin, got ${g}`);
  ok(g.includes("destination=35.01,135.01"), "destination");
  ok(g.includes("travelmode=walking"), "on foot");
  ok(map.googleDirections(from, to, "transit").includes("travelmode=transit"), "by transit");

  const a = map.appleDirections(from, to, "walk");
  ok(a.includes("saddr=35,135") && a.includes("daddr=35.01,135.01"), `apple route, got ${a}`);
  ok(a.includes("dirflg=w"), "apple walking flag");
  ok(map.appleDirections(from, to, "drive").includes("dirflg=d"), "apple driving flag");
});

check("with no fix, directions still open the destination", () => {
  const to = { lat: 35.01, lon: 135.01, name: "Somewhere" };
  const g = map.googleDirections(null, to, "walk");
  ok(!g.includes("origin="), "no origin invented");
  ok(g.includes("destination=35.01,135.01"), "still gets you there");
  const links = map.directionLinks(null, to, "walk");
  eq(links.length, 3, "Google, Apple and OpenStreetMap");
  ok(links.every((l) => l.url && l.label), "each one usable");
});

check("a place with no coordinates offers no directions", () => {
  eq(map.googleDirections(null, { name: "Nowhere" }, "walk"), null);
  eq(map.directionLinks(null, { name: "Nowhere" }, "walk").length, 0);
});

/* ---- Wikipedia lookup ---------------------------------------------------- */

check("a blocked request is explained, not repeated verbatim", () => {
  const msg = RG.lookup.describeFailure(new TypeError("Failed to fetch"));
  ok(/Couldn't reach Wikipedia/.test(msg), `plain English, got "${msg}"`);
  ok(/offline/.test(msg), "and says the rest of the app is fine");
  ok(/took too long/.test(RG.lookup.describeFailure(new Error("The operation was aborted"))),
     "a timeout reads as a timeout");
});

/* ---- report ------------------------------------------------------------ */

if (failures.length) {
  console.error(`\n✕ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f) => console.error("  ✕ " + f + "\n"));
  process.exit(1);
}
console.log(`✓ ${passed} checks passed`);
