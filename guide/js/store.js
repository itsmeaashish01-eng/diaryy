/* ================================================
   ROAMGUIDE — store.js
   localStorage persistence, schema, migrations, CRUD.
   Key: "roamGuideData"

   Everything a traveller adds lives here: trips, the order of a day,
   what's been seen, what it cost. The built-in guidebook stays in
   catalog.js — this file never copies it, it only points at it, so a
   later edit to the catalogue reaches trips already planned.
   ================================================ */
(function (RG) {
  "use strict";
  const { uid, toMinutes, isoDay, addDays } = RG.util;

  const KEY = "roamGuideData";
  const SCHEMA_VERSION = 1;

  function defaults() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        theme: "auto",        // "auto" follows the system until the user picks
        units: "km",          // "km" | "mi"
        dayStart: "09:00",
        dayEnd: "21:00",
        pace: "steady",       // "relaxed" | "steady" | "packed"
        walkKmh: 4.5,
        maxWalkKm: 1.8,       // further than this and the planner puts you on transit
        showLocal: true,      // show names in the local script alongside English
      },
      trips: [],
      activeTripId: null,
      saved: [],              // place ids bookmarked out of Explore
      visited: {},            // placeId -> { date, note, rating }
      customPlaces: [],       // places the traveller added themselves
      seeded: false,
    };
  }

  /* How long a stop actually takes you, relative to the catalogue's
     estimate. Someone who reads every label needs more than the person
     photographing the façade and moving on. */
  const PACE = {
    relaxed: { factor: 1.3, label: "Relaxed", note: "Longer at each stop, fewer of them" },
    steady:  { factor: 1.0, label: "Steady",  note: "The catalogue's own estimates" },
    packed:  { factor: 0.75, label: "Packed", note: "Highlights only, keep moving" },
  };

  let data = defaults();
  const listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function emit(reason) { listeners.forEach((fn) => fn(reason)); }

  // ---- load / save ----
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = migrate(JSON.parse(raw));
    } catch (e) {
      console.warn("RoamGuide: could not read saved data, starting fresh.", e);
      data = defaults();
    }
    return data;
  }

  let saveTimer = null;
  function save(immediate) {
    clearTimeout(saveTimer);
    const write = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {
        console.error("RoamGuide: save failed (storage full?)", e);
      }
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 400);
  }

  function migrate(obj) {
    const base = defaults();
    if (!obj || typeof obj !== "object") return base;
    const merged = Object.assign(base, obj);
    // Shallow-merge settings so options added later appear for existing users.
    merged.settings = Object.assign({}, base.settings, obj.settings || {});
    merged.trips = (obj.trips || []).map(normalizeTrip);
    merged.saved = Array.isArray(obj.saved) ? obj.saved.slice() : [];
    merged.visited = obj.visited && typeof obj.visited === "object" ? obj.visited : {};
    merged.customPlaces = (obj.customPlaces || []).map(normalizeCustom);
    if (!merged.trips.some((t) => t.id === merged.activeTripId)) {
      merged.activeTripId = merged.trips.length ? merged.trips[0].id : null;
    }
    merged.version = SCHEMA_VERSION;
    return merged;
  }

  function normalizeTrip(t) {
    const trip = Object.assign(blankTrip(), t);
    trip.days = (t.days || []).map((d) => ({
      date: d.date || null,
      startMin: d.startMin == null ? null : d.startMin,
      note: d.note || "",
      stops: (d.stops || []).map((s) => ({
        id: s.id || uid(),
        placeId: s.placeId,
        at: s.at == null ? null : s.at,   // pinned start, minutes past midnight
        note: s.note || "",
        done: Boolean(s.done),
      })),
    }));
    trip.expenses = (t.expenses || []).map((e) => Object.assign({ id: uid() }, e));
    return trip;
  }

  function normalizeCustom(p) {
    return Object.assign({
      id: uid(), city: null, name: "", cat: "sight",
      lat: null, lon: null, min: 60, tags: [], custom: true,
    }, p, { custom: true });
  }

  function blankTrip() {
    return {
      id: uid(),
      name: "",
      cityId: null,
      startDate: isoDay(0),
      days: [],
      budget: { daily: null, currency: null },
      expenses: [],
      notes: "",
      createdAt: Date.now(),
    };
  }

  // ---- trips ----
  const trips = () => data.trips;
  const trip = (id) => data.trips.find((t) => t.id === id) || null;
  const activeTrip = () => trip(data.activeTripId);

  function addTrip(patch) {
    const t = Object.assign(blankTrip(), patch);
    t.id = (patch && patch.id) || uid();
    if (!t.days.length) t.days = [blankDay(t.startDate)];
    data.trips.push(normalizeTrip(t));
    data.activeTripId = t.id;
    save(true);
    emit("trip:add");
    return trip(t.id);
  }

  function blankDay(date) {
    return { date: date || null, startMin: null, note: "", stops: [] };
  }

  function updateTrip(id, patch) {
    const t = trip(id);
    if (!t) return null;
    Object.assign(t, patch);
    // Moving the start date drags the whole trip with it, keeping days contiguous.
    if (patch && patch.startDate) reflowDates(t);
    save();
    emit("trip:update");
    return t;
  }

  function reflowDates(t) {
    t.days.forEach((d, i) => { d.date = addDays(t.startDate, i); });
  }

  function removeTrip(id) {
    const i = data.trips.findIndex((t) => t.id === id);
    if (i < 0) return;
    data.trips.splice(i, 1);
    if (data.activeTripId === id) {
      data.activeTripId = data.trips.length ? data.trips[0].id : null;
    }
    save(true);
    emit("trip:remove");
  }

  function setActiveTrip(id) {
    data.activeTripId = id;
    save(true);
    emit("trip:active");
  }

  // ---- days ----
  function addDay(tripId) {
    const t = trip(tripId);
    if (!t) return null;
    const last = t.days[t.days.length - 1];
    const date = last && last.date ? addDays(last.date, 1) : t.startDate;
    const d = blankDay(date);
    t.days.push(d);
    save(true);
    emit("day:add");
    return d;
  }

  function removeDay(tripId, index) {
    const t = trip(tripId);
    if (!t || !t.days[index]) return;
    t.days.splice(index, 1);
    reflowDates(t);
    save(true);
    emit("day:remove");
  }

  function updateDay(tripId, index, patch) {
    const t = trip(tripId);
    if (!t || !t.days[index]) return null;
    Object.assign(t.days[index], patch);
    save();
    emit("day:update");
    return t.days[index];
  }

  // ---- stops ----
  /* Add a place to a day. Returns the stop, or null if that place is
     already on that day — the same temple twice in one afternoon is
     nearly always a misclick, and silently allowing it makes the
     schedule below it nonsense. */
  function addStop(tripId, dayIndex, placeId, patch) {
    const t = trip(tripId);
    if (!t) return null;
    if (!t.days[dayIndex]) return null;
    const day = t.days[dayIndex];
    if (day.stops.some((s) => s.placeId === placeId)) return null;
    const stop = Object.assign(
      { id: uid(), placeId, at: null, note: "", done: false },
      patch || {}
    );
    day.stops.push(stop);
    save(true);
    emit("stop:add");
    return stop;
  }

  function removeStop(tripId, dayIndex, stopId) {
    const t = trip(tripId);
    const day = t && t.days[dayIndex];
    if (!day) return;
    const i = day.stops.findIndex((s) => s.id === stopId);
    if (i < 0) return;
    day.stops.splice(i, 1);
    save(true);
    emit("stop:remove");
  }

  function updateStop(tripId, dayIndex, stopId, patch) {
    const t = trip(tripId);
    const day = t && t.days[dayIndex];
    if (!day) return null;
    const s = day.stops.find((x) => x.id === stopId);
    if (!s) return null;
    Object.assign(s, patch);
    save();
    emit("stop:update");
    return s;
  }

  /* Move a stop up or down within its day. */
  function moveStop(tripId, dayIndex, stopId, delta) {
    const t = trip(tripId);
    const day = t && t.days[dayIndex];
    if (!day) return;
    const i = day.stops.findIndex((s) => s.id === stopId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= day.stops.length) return;
    const [s] = day.stops.splice(i, 1);
    day.stops.splice(j, 0, s);
    save(true);
    emit("stop:move");
  }

  /* Move a stop to another day, keeping its note and pinned time. */
  function moveStopToDay(tripId, fromDay, stopId, toDay) {
    const t = trip(tripId);
    if (!t || !t.days[fromDay] || !t.days[toDay] || fromDay === toDay) return;
    const src = t.days[fromDay];
    const i = src.stops.findIndex((s) => s.id === stopId);
    if (i < 0) return;
    const [s] = src.stops.splice(i, 1);
    if (!t.days[toDay].stops.some((x) => x.placeId === s.placeId)) {
      t.days[toDay].stops.push(s);
    }
    save(true);
    emit("stop:move");
  }

  function reorderStops(tripId, dayIndex, idsInOrder) {
    const t = trip(tripId);
    const day = t && t.days[dayIndex];
    if (!day) return;
    const byId = new Map(day.stops.map((s) => [s.id, s]));
    const next = [];
    idsInOrder.forEach((id) => { if (byId.has(id)) { next.push(byId.get(id)); byId.delete(id); } });
    // Anything the caller forgot keeps its place at the end rather than vanishing.
    byId.forEach((s) => next.push(s));
    day.stops = next;
    save(true);
    emit("stop:move");
  }

  // ---- saved & visited ----
  const isSaved = (placeId) => data.saved.includes(placeId);

  function toggleSaved(placeId) {
    const i = data.saved.indexOf(placeId);
    if (i < 0) data.saved.push(placeId);
    else data.saved.splice(i, 1);
    save(true);
    emit("saved");
    return i < 0;
  }

  const savedIds = () => data.saved.slice();
  const visitedAll = () => data.visited;
  const isVisited = (placeId) => Boolean(data.visited[placeId]);

  function markVisited(placeId, patch) {
    if (data.visited[placeId] && patch === null) {
      delete data.visited[placeId];
    } else {
      data.visited[placeId] = Object.assign(
        { date: isoDay(0), note: "", rating: null },
        data.visited[placeId] || {},
        patch || {}
      );
    }
    save(true);
    emit("visited");
    return data.visited[placeId] || null;
  }

  // ---- custom places ----
  const customPlaces = () => data.customPlaces;

  function addCustomPlace(p) {
    const full = normalizeCustom(p);
    data.customPlaces.push(full);
    save(true);
    emit("place:add");
    return full;
  }

  function updateCustomPlace(id, patch) {
    const p = data.customPlaces.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    save();
    emit("place:update");
    return p;
  }

  function removeCustomPlace(id) {
    const i = data.customPlaces.findIndex((p) => p.id === id);
    if (i < 0) return;
    data.customPlaces.splice(i, 1);
    // Don't leave dangling stops pointing at a place that no longer exists.
    data.trips.forEach((t) => t.days.forEach((d) => {
      d.stops = d.stops.filter((s) => s.placeId !== id);
    }));
    delete data.visited[id];
    data.saved = data.saved.filter((s) => s !== id);
    save(true);
    emit("place:remove");
  }

  /* One lookup for both the guidebook and anything added on the road. */
  function place(id) {
    const custom = data.customPlaces.find((p) => p.id === id);
    if (custom) {
      const city = custom.city ? RG.catalog.cityById(custom.city) : null;
      return Object.assign({ cityName: city ? city.name : "" }, custom);
    }
    return RG.catalog.placeById(id);
  }

  /* Everything browsable in one list: the guidebook plus your own pins. */
  function allPlaces() {
    const mine = data.customPlaces.map((p) => {
      const city = p.city ? RG.catalog.cityById(p.city) : null;
      return Object.assign({ cityName: city ? city.name : "Your pins" }, p);
    });
    return RG.catalog.allPlaces().concat(mine);
  }

  // ---- expenses ----
  function addExpense(tripId, e) {
    const t = trip(tripId);
    if (!t) return null;
    const full = Object.assign(
      { id: uid(), date: isoDay(0), amount: 0, cat: "other", note: "" }, e
    );
    t.expenses.push(full);
    save(true);
    emit("expense");
    return full;
  }

  function removeExpense(tripId, id) {
    const t = trip(tripId);
    if (!t) return;
    t.expenses = t.expenses.filter((e) => e.id !== id);
    save(true);
    emit("expense");
  }

  // ---- settings ----
  const settings = () => data.settings;

  function setSettings(patch) {
    Object.assign(data.settings, patch);
    save(true);
    emit("settings");
  }

  /* Planner options assembled from settings, so geo and plan don't each
     have to know how a preference is spelled. */
  function planOpts() {
    const s = data.settings;
    return {
      walkKmh: Number(s.walkKmh) || 4.5,
      maxWalkKm: Number(s.maxWalkKm) || 1.8,
      paceFactor: (PACE[s.pace] || PACE.steady).factor,
      dayStart: toMinutes(s.dayStart) == null ? 540 : toMinutes(s.dayStart),
      dayEnd: toMinutes(s.dayEnd) == null ? 1260 : toMinutes(s.dayEnd),
    };
  }

  // ---- import / export ----
  function exportAll() {
    return JSON.parse(JSON.stringify(data));
  }

  function importAll(obj, mode) {
    const incoming = migrate(obj);
    if (mode === "merge") {
      const ids = new Set(data.trips.map((t) => t.id));
      incoming.trips.forEach((t) => {
        if (ids.has(t.id)) t.id = uid();
        data.trips.push(t);
      });
      const customIds = new Set(data.customPlaces.map((p) => p.id));
      incoming.customPlaces.forEach((p) => {
        if (!customIds.has(p.id)) data.customPlaces.push(p);
      });
      incoming.saved.forEach((s) => { if (!data.saved.includes(s)) data.saved.push(s); });
      Object.assign(data.visited, incoming.visited);
    } else {
      data = incoming;
    }
    save(true);
    emit("import");
  }

  function raw() { return data; }

  RG.store = {
    KEY, PACE, load, save, raw, blankTrip, blankDay,
    trips, trip, activeTrip, addTrip, updateTrip, removeTrip, setActiveTrip,
    addDay, removeDay, updateDay,
    addStop, removeStop, updateStop, moveStop, moveStopToDay, reorderStops,
    isSaved, toggleSaved, savedIds, visitedAll, isVisited, markVisited,
    customPlaces, addCustomPlace, updateCustomPlace, removeCustomPlace,
    place, allPlaces,
    addExpense, removeExpense,
    settings, setSettings, planOpts, exportAll, importAll, onChange,
  };
})(window.RG);
