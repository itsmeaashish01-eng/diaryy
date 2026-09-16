/* ================================================
   ROAMGUIDE — livemap.js
   A real map, with streets on it.

   The drawn SVG map answers "which way and how far" with no network at
   all, which is the right answer on a plane and the wrong one when you
   are standing on a corner trying to work out which street to take.
   This is the other one: OpenStreetMap tiles under the markers, pan and
   zoom, tap a pin to see what it is.

   It needs the network, so it is not a replacement. When Leaflet or the
   tiles can't be reached the Nearby view falls back to the drawn map
   rather than showing a grey rectangle.

   The map is created once and kept. Re-rendering the view around it
   would otherwise tear down the map on every GPS fix, throwing away
   your zoom and any pan you'd done — so the element is detached, held,
   and put back after each render.
   ================================================ */
(function (RG) {
  "use strict";
  const esc = RG.util.esc;

  const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  let container = null;    // the div Leaflet owns, kept across renders
  let map = null;
  let youMarker = null;
  let youCircle = null;
  let pins = [];
  let framed = false;      // only auto-fit once; after that the view is yours
  let tilesFailed = 0;
  let troubleFn = null;    // told once, when the tiles clearly aren't coming

  /* A blank Leaflet canvas with pins floating on it is worse than the
     drawn map — it looks broken and it has lost the scale bar and the
     compass. So the view is told to switch back, once. */
  const TILE_FAIL_LIMIT = 6;
  function onTileTrouble(fn) { troubleFn = fn; }

  const available = () => typeof window !== "undefined" && Boolean(window.L);

  function ensure() {
    if (map) return map;
    if (!available()) return null;

    container = document.createElement("div");
    container.className = "live-map";

    map = window.L.map(container, {
      zoomControl: true,
      attributionControl: true,
      // A guide you read one-handed while walking: let the page scroll
      // when a finger drags over the map, and zoom on a deliberate pinch.
      scrollWheelZoom: true,
      tap: true,
    }).setView([0, 0], 2);

    const layer = window.L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: ATTRIB,
      // OSM's tile servers are donated infrastructure. Keep the footprint
      // small: no retina doubling, no prefetching beyond the viewport.
      detectRetina: false,
      crossOrigin: true,
    });
    layer.on("tileerror", () => {
      tilesFailed++;
      if (tilesFailed === TILE_FAIL_LIMIT && troubleFn) troubleFn();
    });
    layer.addTo(map);

    return map;
  }

  /* Put the map into whatever container the current render produced. */
  function mount(host) {
    const m = ensure();
    if (!m || !host) return false;
    if (container.parentNode !== host) {
      host.innerHTML = "";
      host.appendChild(container);
    }
    // Leaflet measures on creation; moving it needs a nudge to re-measure.
    setTimeout(() => { try { m.invalidateSize(); } catch (e) {} }, 0);
    return true;
  }

  /* Draw the current fix and what's around it.
     `points` are { lat, lon, title, metres, extract, url } — whatever the
     Nearby list is showing. */
  function update(fix, points) {
    const m = ensure();
    if (!m || !fix) return;
    const L = window.L;

    // ---- you ----
    const here = [fix.lat, fix.lon];
    if (!youMarker) {
      youCircle = L.circle(here, { radius: fix.accuracy || 0, className: "lm-accuracy",
                                   stroke: false, fillOpacity: 0.12 }).addTo(m);
      youMarker = L.circleMarker(here, {
        radius: 7, className: "lm-you", weight: 3, fillOpacity: 1,
      }).addTo(m).bindPopup("You are here");
    } else {
      youMarker.setLatLng(here);
      youCircle.setLatLng(here);
      youCircle.setRadius(fix.accuracy || 0);
    }

    // ---- everything around you ----
    pins.forEach((p) => m.removeLayer(p));
    pins = (points || []).map((pt, i) => {
      const marker = L.marker([pt.lat, pt.lon], {
        title: pt.title,
        // A numbered pin matches the numbering in the list beside it.
        icon: L.divIcon({
          className: "lm-pin-wrap",
          html: `<span class="lm-pin">${i + 1}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      });
      marker.bindPopup(popupHTML(pt, i + 1));
      marker.addTo(m);
      return marker;
    });

    // ---- framing ----
    // Fit everything once. After that the view belongs to whoever is
    // holding the phone — re-fitting on every fix would yank it back
    // mid-pinch.
    if (!framed) {
      const all = [here].concat((points || []).map((p) => [p.lat, p.lon]));
      if (all.length > 1) m.fitBounds(all, { padding: [40, 40], maxZoom: 17 });
      else m.setView(here, 16);
      framed = true;
    }
  }

  function popupHTML(pt, n) {
    const dist = pt.metres < 1000
      ? `${Math.round(pt.metres / 10) * 10} m away`
      : `${(pt.metres / 1000).toFixed(1)} km away`;
    return `<div class="lm-popup">
      <strong>${n}. ${esc(pt.title)}</strong>
      <span class="lm-popup-dist">${esc(dist)}</span>
      ${pt.extract ? `<p>${esc(String(pt.extract).slice(0, 180))}${String(pt.extract).length > 180 ? "…" : ""}</p>` : ""}
      <p class="lm-popup-links">
        ${pt.url ? `<a href="${esc(pt.url)}" target="_blank" rel="noopener">Article ↗</a>` : ""}
        <a href="${esc(RG.map.googleDirections(null, pt, "walk"))}" target="_blank" rel="noopener">Walk there ↗</a>
      </p>
    </div>`;
  }

  /* Put the map back on you, after you've panned away. */
  function recenter(fix) {
    if (!map || !fix) return;
    map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), 16));
  }

  /* Whether the tiles are actually arriving. A handful of errors is a
     patchy connection; a lot of them means we're drawing a grey box and
     should say so. */
  const tilesBroken = () => tilesFailed >= TILE_FAIL_LIMIT;

  RG.livemap = {
    available, mount, update, recenter, tilesBroken, onTileTrouble, popupHTML,
  };
})(window.RG);
