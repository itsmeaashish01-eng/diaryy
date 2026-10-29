/* ================================================
   ERRANDS — store.js
   Everything you've told the app, kept in localStorage under
   `errandsData`: home, the shopping list, the prices you've recorded,
   and the last store and charger lookups so the page has something to
   show before the network answers (or when it doesn't).
   ================================================ */
(function (ER) {
  "use strict";
  const KEY = "errandsData";
  const { uid } = ER.util;

  const STARTER = [
    "Milk, 1 gal", "Eggs, dozen large", "Bread, sandwich loaf", "Bananas, 1 lb",
    "Chicken breast, 1 lb", "Rice, 2 lb bag", "Apples, 1 lb", "Coffee, 12 oz",
  ];

  function fresh() {
    const P = ER.places;
    const seedStores = P.withDistance(P.SEED.stores, P.DEFAULT_HOME);
    return {
      version: 1,
      home: Object.assign({}, P.DEFAULT_HOME),
      items: STARTER.map((name) => ({ id: uid(), name, qty: 1 })),
      prices: {},
      compare: defaultCompare(seedStores),
      customStores: [],
      stores: { list: seedStores, fetchedAt: null, source: "seed" },
      chargers: { list: P.withDistance(P.SEED.chargers, P.DEFAULT_HOME), fetchedAt: null, source: "seed", sources: {} },
      settings: {
        storeRadiusMi: 2, chargerRadiusMi: 10, cornerStores: false,
        teslaOnly: true, chargerKind: "all", nrelKey: "",
      },
      tab: "groceries",
    };
  }

  let state = null;

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    const base = fresh();
    if (!saved || typeof saved !== "object") { state = base; return state; }
    // Shallow-merge so a setting added later picks up its default.
    state = Object.assign(base, saved, { settings: Object.assign(base.settings, saved.settings) });
    if (!Array.isArray(state.items)) state.items = [];
    if (!Array.isArray(state.compare)) state.compare = [];
    if (!Array.isArray(state.customStores)) state.customStores = [];
    if (!state.prices || typeof state.prices !== "object") state.prices = {};
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }   // private mode or full: the session still works
  }

  const get = () => state || load();

  /* Every store the app knows: what the last lookup found plus the ones
     you added by hand. */
  function allStores() {
    const s = get();
    return s.stores.list.concat(s.customStores);
  }

  const storeById = (id) => allStores().find((x) => x.id === id) || null;

  /* Nearest first, one per chain — the useful starting comparison. */
  function defaultCompare(list) {
    const seen = new Set(), out = [];
    for (const st of list) {
      if (st.kind === "convenience") continue;
      const k = (st.brand || st.name).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(st.id);
      if (out.length === 4) break;
    }
    return out;
  }

  /* A fresh store lookup replaces the list. Prices and comparison picks
     made against a built-in store follow it to its live counterpart, so
     nothing you typed is orphaned by going online. */
  function setStores(list, source) {
    const s = get();
    const old = s.stores.list;
    const moved = {};
    for (const o of old) {
      if (!String(o.id).startsWith("seed:")) continue;
      const twin = ER.places.matchSeed(o, list);
      if (twin) moved[o.id] = twin.id;
    }
    for (const [from, to] of Object.entries(moved)) {
      if (s.prices[from]) {
        s.prices[to] = Object.assign({}, s.prices[from], s.prices[to] || {});
        delete s.prices[from];
      }
    }
    // Stores that dropped out of range keep their prices but leave the
    // comparison only if they're gone from the list entirely.
    s.stores = { list, fetchedAt: new Date().toISOString(), source };
    const known = new Set(allStores().map((x) => x.id));
    s.compare = s.compare.map((id) => moved[id] || id).filter((id) => known.has(id));
    s.compare = Array.from(new Set(s.compare));
    if (!s.compare.length) s.compare = defaultCompare(list);
    save();
  }

  function setChargers(list, source, sources) {
    get().chargers = { list, fetchedAt: new Date().toISOString(), source, sources: sources || {} };
    save();
  }

  function setPrice(storeId, itemId, price) {
    const s = get();
    if (price == null) {
      if (s.prices[storeId]) delete s.prices[storeId][itemId];
    } else {
      s.prices[storeId] = s.prices[storeId] || {};
      s.prices[storeId][itemId] = { price, date: ER.util.today() };
    }
    save();
  }

  function addItem(name, qty) {
    const s = get();
    const item = { id: uid(), name: String(name).trim(), qty: Number(qty) > 0 ? Number(qty) : 1 };
    s.items.push(item);
    save();
    return item;
  }

  function removeItem(id) {
    const s = get();
    s.items = s.items.filter((i) => i.id !== id);
    for (const sid of Object.keys(s.prices)) delete s.prices[sid][id];
    save();
  }

  function addCustomStore(name, address) {
    const s = get();
    const st = { id: "mine:" + uid(), name: String(name).trim(), brand: "", address: String(address || "").trim(),
      lat: null, lon: null, km: null, kind: "custom" };
    s.customStores.push(st);
    s.compare.push(st.id);
    save();
    return st;
  }

  function removeCustomStore(id) {
    const s = get();
    s.customStores = s.customStores.filter((x) => x.id !== id);
    s.compare = s.compare.filter((x) => x !== id);
    delete s.prices[id];
    save();
  }

  function exportJSON() {
    const s = get();
    return JSON.stringify({ version: s.version, home: s.home, items: s.items, prices: s.prices,
      compare: s.compare, customStores: s.customStores, settings: s.settings }, null, 2);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.items) || typeof data.prices !== "object") {
      throw new Error("That file isn't an Errands backup.");
    }
    const s = get();
    Object.assign(s, {
      home: data.home || s.home, items: data.items, prices: data.prices || {},
      compare: Array.isArray(data.compare) ? data.compare : s.compare,
      customStores: Array.isArray(data.customStores) ? data.customStores : [],
      settings: Object.assign(s.settings, data.settings || {}),
    });
    save();
  }

  function reset() { state = fresh(); save(); return state; }

  ER.store = {
    load, save, get, allStores, storeById, defaultCompare, setStores, setChargers,
    setPrice, addItem, removeItem, addCustomStore, removeCustomStore,
    exportJSON, importJSON, reset,
  };
})(window.ER);
