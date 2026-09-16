/* ================================================
   ROAMGUIDE — live.js
   Where you actually are, and what's around you.

   Geolocation needs a secure context: https, or localhost. Opened from
   a file:// path most browsers refuse it outright, which is worth
   saying plainly rather than spinning forever on "locating…".

   Nothing here phones home. The coordinates stay in the tab; the
   guidebook is already on the device, so working out what you're
   standing next to is arithmetic, not a lookup.
   ================================================ */
(function (RG) {
  "use strict";
  const geo = RG.geo;

  /* Close enough that the guide should speak up by itself. GPS in a
     street of tall buildings is routinely 20–50 m out, so anything
     tighter than this would keep missing. */
  const ARRIVAL_M = 120;

  /* Beyond this from every city in the guidebook, "nearby" has nothing
     honest to say. */
  const CITY_RANGE_KM = 40;

  const state = {
    supported: Boolean(typeof navigator !== "undefined" && navigator.geolocation),
    secure: typeof window === "undefined" ? false
      : (window.isSecureContext !== false),
    watching: false,
    fix: null,        // { lat, lon, accuracy, heading, at }
    error: null,      // { code, message }
    watchId: null,
  };

  const listeners = [];
  const onChange = (fn) => listeners.push(fn);
  const emit = () => listeners.forEach((fn) => fn(state));

  /* Why we can't, in words someone can act on. */
  function blockedReason() {
    if (!state.supported) return "This browser has no location services.";
    if (!state.secure) {
      return "Location needs a secure page. Opened from a file this is blocked — " +
        "serve the folder over http://localhost, or use the published copy.";
    }
    return null;
  }

  function start() {
    const blocked = blockedReason();
    if (blocked) {
      state.error = { code: "blocked", message: blocked };
      emit();
      return false;
    }
    if (state.watching) return true;

    state.watching = true;
    state.error = null;
    emit();

    state.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        state.fix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          at: Date.now(),
        };
        state.error = null;
        emit();
      },
      (err) => {
        const messages = {
          1: "Location permission was refused. Your browser's address bar has the switch to change that.",
          2: "Your position isn't available right now — indoors or underground, usually.",
          3: "Locating timed out. Somewhere with sky helps.",
        };
        state.error = {
          code: err.code,
          message: messages[err.code] || err.message || "Couldn't get a fix.",
        };
        emit();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 }
    );
    return true;
  }

  function stop() {
    if (state.watchId != null && state.supported) {
      navigator.geolocation.clearWatch(state.watchId);
    }
    state.watchId = null;
    state.watching = false;
    emit();
  }

  const toggle = () => (state.watching ? (stop(), false) : start());

  // ---- bearings ----
  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                   "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

  /* Initial great-circle bearing from a to b, in degrees clockwise from north. */
  function bearing(a, b) {
    if (!a || !b) return null;
    const rad = (d) => (d * Math.PI) / 180;
    const dLon = rad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
              Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function compass(deg) {
    if (deg == null) return "";
    return COMPASS[Math.round(deg / 22.5) % 16];
  }

  // ---- what's around you ----
  /* Places sorted by how far away they are, each with the distance, the
     compass point, and whether you're close enough to be standing at it. */
  function nearby(places, fix, limit) {
    if (!fix) return [];
    const here = { lat: fix.lat, lon: fix.lon };
    return places
      .filter((p) => p && p.lat != null)
      .map((p) => {
        const km = geo.distanceKm(here, p);
        return {
          place: p,
          km,
          metres: km * 1000,
          bearing: bearing(here, p),
          // Don't claim arrival more precisely than the fix allows.
          arrived: km * 1000 <= Math.max(ARRIVAL_M, fix.accuracy || 0),
        };
      })
      .sort((a, b) => a.km - b.km)
      .slice(0, limit || 12);
  }

  /* Which city's guidebook applies where you're standing — or none,
     which is the honest answer nearly everywhere on earth. */
  function cityAt(fix, cities) {
    if (!fix) return { city: null, km: null };
    let best = null, bestKm = Infinity;
    cities.forEach((c) => {
      const km = geo.distanceKm({ lat: fix.lat, lon: fix.lon }, c.center);
      if (km != null && km < bestKm) { bestKm = km; best = c; }
    });
    return { city: bestKm <= CITY_RANGE_KM ? best : null, nearest: best, km: bestKm };
  }

  /* How much to trust the fix, in words. A 2 km "accuracy" from wifi
     triangulation is not the same claim as 8 m from GPS, and the guide
     shouldn't present them the same way. */
  function quality(fix) {
    if (!fix) return null;
    const m = fix.accuracy;
    if (!Number.isFinite(m)) return { level: "unknown", text: "Accuracy unknown" };
    if (m <= 25) return { level: "good", text: `Good fix, ±${Math.round(m)} m` };
    if (m <= 150) return { level: "warning", text: `Rough fix, ±${Math.round(m)} m` };
    return { level: "serious", text: `Very rough, ±${Math.round(m / 1000 * 10) / 10} km — probably from wifi, not GPS` };
  }

  RG.live = {
    ARRIVAL_M, CITY_RANGE_KM, state, onChange,
    start, stop, toggle, blockedReason,
    bearing, compass, nearby, cityAt, quality,
  };
})(window.RG);
