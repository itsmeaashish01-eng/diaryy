/* ================================================
   ROAMGUIDE — geo.js
   Distance, walking and transit estimates, route ordering, and the
   projection the mini-map draws with. No network, no map tiles.
   ================================================ */
(function (RG) {
  "use strict";

  const R_KM = 6371;
  const rad = (d) => (d * Math.PI) / 180;

  /* Great-circle distance in km. Over a city it is within a few metres of
     anything fancier, and it needs no projection to be chosen first. */
  function distanceKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* Streets are not straight lines. 1.25 is the usual detour factor for a
     dense old city centre — enough that a plan built on it doesn't run
     half an hour late by lunchtime. */
  const DETOUR = 1.25;

  /* How you'd actually get between two stops, given how far apart they are.

     Transit carries a fixed overhead (finding the stop, waiting, walking
     off the other end) which is why it loses to walking over short hops
     even though it moves faster once you're on it. */
  function leg(from, to, opts) {
    const o = opts || {};
    const straight = distanceKm(from, to);
    if (straight == null) return { mode: "unknown", km: null, minutes: 0 };

    const km = straight * DETOUR;
    const walkKmh = o.walkKmh || 4.5;
    const walkMin = (km / walkKmh) * 60;

    const maxWalk = o.maxWalkKm == null ? 1.8 : o.maxWalkKm;
    if (km <= maxWalk || o.transit === false) {
      return { mode: "walk", km, minutes: Math.round(walkMin) };
    }

    const transitKmh = o.transitKmh || 18;
    const overhead = o.transitOverheadMin == null ? 12 : o.transitOverheadMin;
    const transitMin = overhead + (km / transitKmh) * 60;

    if (transitMin >= walkMin) {
      return { mode: "walk", km, minutes: Math.round(walkMin) };
    }
    return { mode: "transit", km, minutes: Math.round(transitMin) };
  }

  /* Total travel minutes for a list of stops in the order given. */
  function routeMinutes(points, opts) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += leg(points[i - 1], points[i], opts).minutes;
    }
    return total;
  }

  function routeKm(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const d = distanceKm(points[i - 1], points[i]);
      if (d != null) total += d * DETOUR;
    }
    return total;
  }

  /* Order stops so the day involves less walking.

     Nearest-neighbour for a first pass, then 2-opt to undo the crossings
     it always leaves behind. Both are cheap at the size of a real day —
     nobody schedules forty stops — and the result is deterministic, so
     pressing "tidy the order" twice doesn't shuffle the day around.

     `fixedFirst` keeps stop one where it is: that's usually the hotel, or
     the timed ticket the rest of the day hangs off. */
  function optimiseOrder(points, opts) {
    const o = opts || {};
    const n = points.length;
    if (n < 3) return points.slice();

    const cost = (a, b) => {
      const d = distanceKm(a, b);
      return d == null ? 0 : d;
    };

    // ---- nearest neighbour ----
    const remaining = points.slice();
    const order = [remaining.shift()];       // stop one anchors the walk
    while (remaining.length) {
      const last = order[order.length - 1];
      let best = 0, bestCost = Infinity;
      remaining.forEach((p, i) => {
        const c = cost(last, p);
        if (c < bestCost) { bestCost = c; best = i; }
      });
      order.push(remaining.splice(best, 1)[0]);
    }

    // ---- 2-opt ----
    const start = o.fixedFirst === false ? 0 : 1;
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 60) {
      improved = false;
      for (let i = start; i < order.length - 1; i++) {
        for (let k = i + 1; k < order.length; k++) {
          const a = order[i - 1], b = order[i];
          const c = order[k], d = order[k + 1];
          const before = cost(a, b) + (d ? cost(c, d) : 0);
          const after = cost(a, c) + (d ? cost(b, d) : 0);
          if (after + 1e-9 < before) {
            const slice = order.slice(i, k + 1).reverse();
            order.splice(i, slice.length, ...slice);
            improved = true;
          }
        }
      }
    }
    return order;
  }

  /* Project lat/lon onto a box for the mini-map.

     Equirectangular with the longitude axis squeezed by cos(latitude), so
     a city block stays roughly square instead of stretching east-west the
     further from the equator you are. Good enough for "which way is it,
     and how far" — which is all the map claims to answer. */
  function projector(points, width, height, pad) {
    const p = pad == null ? 18 : pad;
    const pts = points.filter((q) => q && q.lat != null && q.lon != null);
    if (!pts.length) {
      return { project: () => ({ x: width / 2, y: height / 2 }), scaleKmPerPx: 0 };
    }

    const lats = pts.map((q) => q.lat), lons = pts.map((q) => q.lon);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const kx = Math.cos(rad(midLat)) || 1;

    let minX = Math.min(...lons) * kx, maxX = Math.max(...lons) * kx;
    let minY = Math.min(...lats), maxY = Math.max(...lats);

    // A single marker, or several at the same spot, has no extent to fit.
    const MIN_SPAN = 0.004;               // ~450 m, so one pin isn't zoomed to the street
    if (maxX - minX < MIN_SPAN) { const c = (minX + maxX) / 2; minX = c - MIN_SPAN / 2; maxX = c + MIN_SPAN / 2; }
    if (maxY - minY < MIN_SPAN) { const c = (minY + maxY) / 2; minY = c - MIN_SPAN / 2; maxY = c + MIN_SPAN / 2; }

    const w = width - p * 2, h = height - p * 2;
    // One scale for both axes, or the map lies about direction.
    const scale = Math.min(w / (maxX - minX), h / (maxY - minY));
    const offX = p + (w - (maxX - minX) * scale) / 2;
    const offY = p + (h - (maxY - minY) * scale) / 2;

    function project(q) {
      const x = offX + (q.lon * kx - minX) * scale;
      // SVG y grows downward; north should be up.
      const y = offY + (maxY - q.lat) * scale;
      return { x, y };
    }

    // How many km one pixel covers — the scale bar needs it.
    const kmPerDegLat = 111.32;
    return { project, scaleKmPerPx: kmPerDegLat / scale };
  }

  RG.geo = { distanceKm, leg, routeMinutes, routeKm, optimiseOrder, projector, DETOUR };
})(window.RG);
