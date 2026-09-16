/* ================================================
   ROAMGUIDE — map.js
   A drawn map, not a loaded one: inline SVG from the coordinates we
   already have. No tiles, no keys, no requests — so it works on a plane
   and it works offline, which is when a map is least replaceable.

   It shows relative position, distance and the order you'd walk them.
   It does not show streets, so every marker also links out to
   OpenStreetMap for the version with roads on it.
   ================================================ */
(function (RG) {
  "use strict";
  const U = RG.util;
  const esc = U.esc;

  /* A scale bar reads properly only at a round number. */
  function niceScale(kmPerPx, maxPx) {
    const targetKm = kmPerPx * maxPx;
    const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50];
    let pick = steps[0];
    steps.forEach((s) => { if (s <= targetKm) pick = s; });
    return { km: pick, px: pick / kmPerPx };
  }

  /* points: [{ lat, lon, label, n, cat, done }]
     opts:   { width, height, route, units, you } — `you` is a live fix
             { lat, lon, accuracy }, drawn as a blue dot with its error
             circle, and included in the area the map fits. */
  function svg(points, opts) {
    const o = opts || {};
    const width = o.width || 640;
    const height = o.height || 360;
    const pts = (points || []).filter((p) => p && p.lat != null && p.lon != null);
    const you = o.you && o.you.lat != null ? o.you : null;

    if (!pts.length && !you) {
      return `<div class="map-empty">Nothing with coordinates to draw yet.</div>`;
    }

    // The fix has to be inside the fitted area or "you are here" points
    // off the edge of the picture.
    const proj = RG.geo.projector(you ? pts.concat([you]) : pts, width, height, 26);
    const xy = pts.map((p) => Object.assign({}, p, proj.project(p)));

    let route = "";
    if (o.route !== false && xy.length > 1) {
      const d = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      route = `<path d="${d}" class="map-route" fill="none" />`;
    }

    const markers = xy.map((p, i) => {
      const label = p.n == null ? String(i + 1) : String(p.n);
      const cls = "map-pin" + (p.done ? " is-done" : "") + (p.dim ? " is-dim" : "");
      return `<g class="${cls}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
        <title>${esc(p.label || "")}</title>
        <circle r="13" class="map-pin-halo" />
        <circle r="10" class="map-pin-dot" />
        <text y="4" text-anchor="middle" class="map-pin-label">${esc(label)}</text>
      </g>`;
    }).join("");

    /* The accuracy circle is drawn to the same scale as everything else,
       so a 2 km wifi fix looks like the vague claim it is instead of
       borrowing the authority of a dot. */
    let hereMark = "";
    if (you) {
      const h = proj.project(you);
      const rPx = Number.isFinite(you.accuracy) && proj.scaleKmPerPx > 0
        ? (you.accuracy / 1000) / proj.scaleKmPerPx : 0;
      hereMark = `<g class="map-you" transform="translate(${h.x.toFixed(1)},${h.y.toFixed(1)})">
        <title>You are here${Number.isFinite(you.accuracy) ? `, to within ${Math.round(you.accuracy)} m` : ""}</title>
        ${rPx > 4 ? `<circle r="${Math.min(rPx, width).toFixed(1)}" class="map-you-halo" />` : ""}
        <circle r="7" class="map-you-ring" />
        <circle r="4" class="map-you-dot" />
      </g>`;
    }

    const bar = niceScale(proj.scaleKmPerPx, Math.min(140, width / 4));
    const barPx = Math.max(24, Math.min(bar.px, width / 3));
    const barLabel = U.fmtDistance(bar.km, o.units);

    return `<svg class="map-svg" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="Sketch map of ${pts.length} ${pts.length === 1 ? "place" : "places"}${you ? ", with your position" : ""}"
      preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="${width}" height="${height}" class="map-bg" />
      ${route}
      ${markers}
      ${hereMark}
      <g class="map-scale" transform="translate(16,${height - 16})">
        <line x1="0" y1="0" x2="${barPx.toFixed(1)}" y2="0" />
        <line x1="0" y1="-4" x2="0" y2="4" />
        <line x1="${barPx.toFixed(1)}" y1="-4" x2="${barPx.toFixed(1)}" y2="4" />
        <text x="${(barPx / 2).toFixed(1)}" y="-8" text-anchor="middle">${esc(barLabel)}</text>
      </g>
      <g class="map-north" transform="translate(${width - 22},22)">
        <path d="M0,-11 L5,7 L0,3 L-5,7 Z" />
        <text y="20" text-anchor="middle">N</text>
      </g>
    </svg>`;
  }

  /* ---------------------------------------------------------------
     Links out to a map that has streets, traffic and a blue dot

     The drawn map above answers "which way, and how far". Actual
     turn-by-turn is a job for the map app already on the phone, so
     hand off to it rather than pretending to do it here.

     Both Google and Apple take a documented URL that opens the native
     app when it's installed and the website when it isn't, so no app
     detection and no fallback chain is needed.
     --------------------------------------------------------------- */

  /* Apple Maps exists on Apple hardware and nowhere else, so offering it
     first anywhere else would send people to a page that can't help. */
  function prefersApple() {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
      /Mac OS X/.test(ua);
  }

  const coord = (p) => `${p.lat},${p.lon}`;

  function googlePlace(place) {
    if (!place || place.lat == null) return null;
    const q = encodeURIComponent(place.name || coord(place));
    return `https://www.google.com/maps/search/?api=1&query=${coord(place)}&query_place_id=&z=17#${q}`;
  }

  function applePlace(place) {
    if (!place || place.lat == null) return null;
    return `https://maps.apple.com/?ll=${coord(place)}&q=${encodeURIComponent(place.name || "Here")}&z=17`;
  }

  /* mode: "walk" | "transit" | "drive" */
  function googleDirections(from, to, mode) {
    if (!to || to.lat == null) return null;
    const travel = mode === "transit" ? "transit" : mode === "drive" ? "driving" : "walking";
    const origin = from && from.lat != null ? `&origin=${coord(from)}` : "";
    return `https://www.google.com/maps/dir/?api=1${origin}&destination=${coord(to)}&travelmode=${travel}`;
  }

  function appleDirections(from, to, mode) {
    if (!to || to.lat == null) return null;
    const flag = mode === "transit" ? "r" : mode === "drive" ? "d" : "w";
    const saddr = from && from.lat != null ? `saddr=${coord(from)}&` : "";
    return `https://maps.apple.com/?${saddr}daddr=${coord(to)}&dirflg=${flag}`;
  }

  /* The pair of buttons, in the order that suits the device. */
  function directionLinks(from, to, mode) {
    const g = { label: "Google Maps", url: googleDirections(from, to, mode) };
    const a = { label: "Apple Maps", url: appleDirections(from, to, mode) };
    const o = {
      label: "OpenStreetMap",
      url: from && from.lat != null ? osmDirections(from, to) : osmLink(to),
    };
    return (prefersApple() ? [a, g, o] : [g, a, o]).filter((x) => x.url);
  }

  // ---- OpenStreetMap ----
  function osmLink(place) {
    if (!place || place.lat == null) return null;
    return `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`;
  }

  function osmDirections(from, to) {
    if (!from || !to || from.lat == null || to.lat == null) return null;
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot` +
      `&route=${from.lat},${from.lon};${to.lat},${to.lon}`;
  }

  /* A .geojson of the day, for anything that reads maps properly —
     phone map apps, a GPS, a printout. */
  function toGeoJSON(points, name) {
    const feats = (points || [])
      .filter((p) => p && p.lat != null)
      .map((p, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          name: p.label || `Stop ${i + 1}`,
          order: i + 1,
          category: p.cat || null,
          time: p.time || null,
        },
      }));
    const line = feats.length > 1 ? [{
      type: "Feature",
      geometry: { type: "LineString", coordinates: feats.map((f) => f.geometry.coordinates) },
      properties: { name: (name || "Route") + " — order of the day" },
    }] : [];
    return { type: "FeatureCollection", name: name || "RoamGuide", features: feats.concat(line) };
  }

  RG.map = {
    svg, osmLink, osmDirections, toGeoJSON, niceScale,
    googlePlace, applePlace, googleDirections, appleDirections,
    directionLinks, prefersApple,
  };
})(window.RG);
