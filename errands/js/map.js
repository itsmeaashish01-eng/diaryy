/* ================================================
   ERRANDS — map.js
   One Leaflet map on OpenStreetMap tiles, moved between the two tabs
   rather than rebuilt, so your zoom survives switching back and forth.

   Pins are circle markers — no image files to load — and every pin's
   label is a DOM node, never an HTML string: names come from
   OpenStreetMap, and anyone can edit OpenStreetMap.

   If Leaflet didn't load (no network, a blocked CDN) the lists still
   work; the map slot says why it's empty.
   ================================================ */
(function (ER) {
  "use strict";
  const { h } = ER.util;

  const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  let box = null, map = null, layer = null, framedFor = "";

  const available = () => typeof window !== "undefined" && Boolean(window.L);

  function ensure() {
    if (map || !available()) return map;
    box = h("div", { class: "map-canvas" });
    map = window.L.map(box, { scrollWheelZoom: false }).setView([39.2873, -76.6191], 13);
    window.L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB, crossOrigin: true }).addTo(map);
    layer = window.L.layerGroup().addTo(map);
    return map;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  }

  /* points: [{ lat, lon, label, sub, tone, n }] — tone picks the colour
     ("home", "pick", "other", "sc", "dest"); n is the list number. */
  function show(host, home, points, frameKey) {
    if (!host) return;
    if (!ensure()) {
      host.replaceChildren(h("p", { class: "map-empty muted small" },
        "The map needs the network (it loads Leaflet and OpenStreetMap tiles). The list below works without it."));
      return;
    }
    if (box.parentNode !== host) host.replaceChildren(box);
    setTimeout(() => map.invalidateSize(), 0);

    const L = window.L;
    layer.clearLayers();
    const tone = {
      home: cssVar("--map-home"), pick: cssVar("--map-pick"), other: cssVar("--map-other"),
      sc: cssVar("--map-sc"), dest: cssVar("--map-dest"),
    };

    const bounds = [[home.lat, home.lon]];
    L.circleMarker([home.lat, home.lon], {
      radius: 9, color: "#fff", weight: 3, fillColor: tone.home, fillOpacity: 1,
    }).bindPopup(h("div", {}, h("strong", {}, "Home"), h("br"), home.label)).addTo(layer);

    for (const p of points) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      // Numbered pins are div icons: the number is the only text in them,
      // and they go away cleanly with the layer (permanent tooltips don't).
      const m = p.n
        ? L.marker([p.lat, p.lon], { icon: L.divIcon({
          className: "pin-num pin-" + (p.tone || "other"), html: String(Number(p.n)),
          iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] }) })
        : L.circleMarker([p.lat, p.lon], {
          radius: 6, color: "#fff", weight: 2, fillColor: tone[p.tone] || tone.other, fillOpacity: 0.95,
        });
      m.bindPopup(h("div", {}, h("strong", {}, (p.n ? p.n + ". " : "") + p.label),
        p.sub ? h("div", { class: "small" }, p.sub) : null));
      m.addTo(layer);
      if (p.tone !== "other") bounds.push([p.lat, p.lon]);
    }

    // Frame the pins once per tab and radius; after that the view is yours.
    if (frameKey !== framedFor) {
      framedFor = frameKey;
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      else map.setView(bounds[0], 14);
    }
  }

  function refit() { framedFor = ""; }

  ER.map = { available, show, refit };
})(window.ER);
