/* ================================================
   PRICE WATCH — store.js
   localStorage persistence, schema, migrations, CRUD.
   Key: "priceWatchData"
   ================================================ */
(function (PT) {
  "use strict";
  const { uid, DAY } = PT.util;

  const KEY = "priceWatchData";
  const SCHEMA_VERSION = 1;

  /* Keep memory and localStorage bounded. Beyond MAX_POINTS we thin out
     older history rather than throwing it away, so long-running watches
     keep their shape (and their all-time low) without growing forever. */
  const MAX_POINTS = 1500;
  const KEEP_DENSE_MS = 14 * DAY;

  const KINDS = {
    flight:  { label: "Flight",  icon: "✈",  travel: true },
    train:   { label: "Train",   icon: "🚆", travel: true },
    bus:     { label: "Bus",     icon: "🚌", travel: true },
    hotel:   { label: "Hotel",   icon: "🏨", travel: true },
    ferry:   { label: "Ferry",   icon: "⛴",  travel: true },
    car:     { label: "Car hire",icon: "🚗", travel: true },
    stock:   { label: "Stock",   icon: "📈", travel: false },
    crypto:  { label: "Crypto",  icon: "₿",  travel: false },
    fx:      { label: "Currency",icon: "💱", travel: false },
    other:   { label: "Other",   icon: "◆",  travel: false },
  };

  function defaults() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        theme: "light",
        currency: "USD",
        defaultIntervalMin: 60,
        sound: true,
        // Where CORS-blocked requests get routed. See tracker/server/price-proxy.mjs
        proxyBase: "",
        notify: {
          browser: true,
          ntfy: { enabled: false, server: "https://ntfy.sh", topic: "" },
          webhook: { enabled: false, url: "", style: "discord", noCors: false },
        },
        quietHours: { enabled: false, from: 23, to: 7 },
      },
      watches: [],
      alerts: [],
      seeded: false,
    };
  }

  let data = defaults();
  const listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function emit(reason) { listeners.forEach((fn) => fn(reason)); }

  // ---- load / save ----
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = migrate(parsed);
      }
    } catch (e) {
      console.warn("Price Watch: could not read saved data, starting fresh.", e);
      data = defaults();
    }
    return data;
  }

  let saveTimer = null;
  function save(immediate) {
    // Writes are chatty during a poll sweep; coalesce them.
    clearTimeout(saveTimer);
    const doWrite = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {
        console.error("Price Watch: save failed (storage full?)", e);
      }
    };
    if (immediate) doWrite();
    else saveTimer = setTimeout(doWrite, 400);
  }

  function migrate(obj) {
    const base = defaults();
    if (!obj || typeof obj !== "object") return base;
    // Shallow-merge settings so new options appear for existing users.
    const merged = Object.assign(base, obj);
    merged.settings = Object.assign({}, base.settings, obj.settings || {});
    merged.settings.notify = Object.assign(
      {}, base.settings.notify, (obj.settings && obj.settings.notify) || {}
    );
    merged.settings.notify.ntfy = Object.assign(
      {}, base.settings.notify.ntfy,
      (obj.settings && obj.settings.notify && obj.settings.notify.ntfy) || {}
    );
    merged.settings.notify.webhook = Object.assign(
      {}, base.settings.notify.webhook,
      (obj.settings && obj.settings.notify && obj.settings.notify.webhook) || {}
    );
    merged.watches = (obj.watches || []).map(normalizeWatch);
    merged.alerts = obj.alerts || [];
    merged.version = SCHEMA_VERSION;
    return merged;
  }

  function normalizeWatch(w) {
    return Object.assign(blankWatch(), w, {
      history: Array.isArray(w.history) ? w.history : [],
      rules: Array.isArray(w.rules) ? w.rules : [],
    });
  }

  function blankWatch() {
    return {
      id: uid(),
      label: "",
      kind: "flight",
      provider: "demo",
      config: {},          // provider-specific fields
      trip: {},            // from / to / depart / ret / pax / cabin — travel only
      position: null,      // { qty, cost } — markets only
      currency: "USD",
      direction: "down",   // "down" = want it cheaper (travel), "up" = want it higher
      rules: [],           // [{ id, type, value }]
      intervalMin: 60,
      active: true,
      createdAt: Date.now(),
      history: [],         // [{ t, p, meta }]
      lastCheck: null,
      nextCheck: null,
      errorCount: 0,
      lastError: null,
      lastAlertAt: {},     // ruleType -> timestamp, for cooldown
      cooldownMin: 180,
      notes: "",
    };
  }

  // ---- watches ----
  const all = () => data.watches;
  const get = (id) => data.watches.find((w) => w.id === id) || null;

  function addWatch(w) {
    const full = Object.assign(blankWatch(), w);
    full.id = w.id || uid();
    data.watches.push(full);
    save(true);
    emit("watch:add");
    return full;
  }

  function updateWatch(id, patch) {
    const w = get(id);
    if (!w) return null;
    Object.assign(w, patch);
    save();
    emit("watch:update");
    return w;
  }

  function removeWatch(id) {
    const i = data.watches.findIndex((w) => w.id === id);
    if (i < 0) return;
    data.watches.splice(i, 1);
    data.alerts = data.alerts.filter((a) => a.watchId !== id);
    save(true);
    emit("watch:remove");
  }

  /* Record a price reading. Returns the stored point, or null if the price
     is unusable. Repeated identical prices are still recorded — a flat line
     is real information for "has this moved at all?" */
  function addPoint(id, price, meta) {
    const w = get(id);
    if (!w || !Number.isFinite(price)) return null;
    const point = { t: Date.now(), p: price };
    if (meta && Object.keys(meta).length) point.meta = meta;
    w.history.push(point);
    thin(w);
    w.lastCheck = point.t;
    w.errorCount = 0;
    w.lastError = null;
    save();
    return point;
  }

  /* Downsample history older than KEEP_DENSE_MS by dropping every other
     point, but never the running minimum or maximum. */
  function thin(w) {
    if (w.history.length <= MAX_POINTS) return;
    const cutoff = Date.now() - KEEP_DENSE_MS;
    let extremes = new Set();
    let min = Infinity, max = -Infinity, minI = -1, maxI = -1;
    w.history.forEach((pt, i) => {
      if (pt.p < min) { min = pt.p; minI = i; }
      if (pt.p > max) { max = pt.p; maxI = i; }
    });
    extremes.add(minI); extremes.add(maxI);
    let drop = 0;
    w.history = w.history.filter((pt, i) => {
      if (pt.t >= cutoff || extremes.has(i)) return true;
      drop++;
      return drop % 2 === 0; // keep every second old point
    });
    // Still oversized (very long-lived watch): hard-trim the oldest.
    if (w.history.length > MAX_POINTS) {
      w.history = w.history.slice(w.history.length - MAX_POINTS);
    }
  }

  function recordError(id, message) {
    const w = get(id);
    if (!w) return;
    w.errorCount = (w.errorCount || 0) + 1;
    w.lastError = { message: String(message), t: Date.now() };
    w.lastCheck = Date.now();
    save();
  }

  // ---- alerts ----
  function pushAlert(alert) {
    data.alerts.unshift(alert);
    if (data.alerts.length > 300) data.alerts.length = 300;
    save(true);
    emit("alert");
    return alert;
  }

  const alerts = () => data.alerts;
  const unreadCount = () => data.alerts.filter((a) => !a.read).length;

  function markAlertsRead() {
    data.alerts.forEach((a) => { a.read = true; });
    save();
    emit("alert:read");
  }

  function clearAlerts() {
    data.alerts = [];
    save(true);
    emit("alert:clear");
  }

  // ---- settings ----
  const settings = () => data.settings;

  function setSettings(patch) {
    Object.assign(data.settings, patch);
    save(true);
    emit("settings");
  }

  // ---- import / export ----
  function exportAll() {
    return JSON.parse(JSON.stringify(data));
  }

  function importAll(obj, mode) {
    const incoming = migrate(obj);
    if (mode === "merge") {
      const byId = new Set(data.watches.map((w) => w.id));
      incoming.watches.forEach((w) => {
        if (byId.has(w.id)) w.id = uid();
        data.watches.push(w);
      });
      data.alerts = incoming.alerts.concat(data.alerts).slice(0, 300);
    } else {
      data = incoming;
    }
    save(true);
    emit("import");
  }

  function raw() { return data; }

  PT.store = {
    KEY, KINDS, load, save, raw, blankWatch,
    all, get, addWatch, updateWatch, removeWatch,
    addPoint, recordError,
    pushAlert, alerts, unreadCount, markAlertsRead, clearAlerts,
    settings, setSettings, exportAll, importAll, onChange,
  };
})(window.PT);
