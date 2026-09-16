/* ================================================
   ROAMGUIDE — sw.js
   The service worker. What makes this an app rather than a page you
   happened to bookmark: it opens with no signal, from the home screen,
   with the guidebook intact.

   Three different jobs, three different rules:

     - The app itself (HTML, CSS, JS, the guidebook, Leaflet) is cached
       on install and served from cache first. It changes only when a new
       version is deployed, and it must work on a plane.
     - Map tiles are cached as you see them, capped. Walk an area with
       signal and the streets stay on the map after it drops, which is
       exactly when a map matters.
     - Wikipedia is never cached. "What's around me" is a question about
       right now, and a stale answer from another city would be worse
       than an honest failure.
   ================================================ */

/* Bump this to roll out a new version; the old caches are cleared on
   activate. */
const VERSION = "roamguide-v1";
const SHELL = `${VERSION}-shell`;
const TILES = `${VERSION}-tiles`;

/* Everything needed to open the app with the radio off. */
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./js/util.js",
  "./js/geo.js",
  "./js/catalog.js",
  "./js/cities/kyoto.js",
  "./js/cities/lisbon.js",
  "./js/cities/mexico-city.js",
  "./js/cities/istanbul.js",
  "./js/cities/rome.js",
  "./js/cities/marrakesh.js",
  "./js/store.js",
  "./js/plan.js",
  "./js/map.js",
  "./js/live.js",
  "./js/livemap.js",
  "./js/install.js",
  "./js/lookup.js",
  "./js/ui.js",
  "./js/app.js",
];

/* Leaflet comes from a CDN, so it's fetched no-cors and stored opaque.
   Worth doing: without it the map falls back to the drawing every time
   you open the app offline. */
const CDN_FILES = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
];

const MAX_TILES = 400;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Own files must all land or the install is a lie.
    await cache.addAll(SHELL_FILES);
    // The CDN and the fonts are nice-to-have: a failure here shouldn't
    // stop the app installing.
    await Promise.all(CDN_FILES.map((url) =>
      cache.add(new Request(url, { mode: "no-cors" })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n !== SHELL && n !== TILES).map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ---- Wikipedia: always live, never cached ----
  if (url.hostname.endsWith("wikipedia.org")) return;

  // ---- map tiles: cache as you go, capped ----
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(tileFirst(req));
    return;
  }

  // ---- navigation: the app shell, so it opens offline ----
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (e) {
        const cache = await caches.open(SHELL);
        return (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // ---- everything else: cache first, refresh in the background ----
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) {
      // Update for next time without making this load wait for it.
      fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && url.origin === self.location.origin) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});

/* Tiles: serve what we have, otherwise fetch and keep it. The cache is
   trimmed oldest-first so a long walk can't fill the phone. */
async function tileFirst(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) {
      cache.put(req, res.clone());
      trim(cache);
    }
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_TILES) {
      // keys() is insertion-ordered, so the front is the oldest.
      await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => cache.delete(k)));
    }
  } finally {
    trimming = false;
  }
}
