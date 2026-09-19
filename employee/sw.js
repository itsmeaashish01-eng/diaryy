/* ================================================
   THE AI EMPLOYEE — sw.js
   The service worker. What makes this an app rather than a bookmark:
   it opens on a train, from the home screen, with the business intact.

   There is nothing to keep fresh from a network here — the record lives
   in localStorage and never leaves the device — so the rule is simple:
   the app is cached on install and served from cache first, and a new
   version arrives when VERSION below changes.

   The fonts are the one exception. They come from Google, so they're
   fetched no-cors and stored opaque: worth having offline, not worth
   failing the install over.
   ================================================ */

const VERSION = "ai-employee-v1";
const SHELL = `${VERSION}-shell`;

/* Everything needed to open with the radio off. */
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./js/util.js",
  "./js/store.js",
  "./js/margin.js",
  "./js/qa.js",
  "./js/money.js",
  "./js/growth.js",
  "./js/brief.js",
  "./js/install.js",
  "./js/ui.js",
  "./js/app.js",
];

const FONT_FILES = [
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,600&family=DM+Sans:wght@300;400;500;600&display=swap",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Our own files must all land, or the install is a lie.
    await cache.addAll(SHELL_FILES);
    await Promise.all(FONT_FILES.map((url) =>
      cache.add(new Request(url, { mode: "no-cors" })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== SHELL).map((n) => caches.delete(n)));
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

  /* A navigation should open the app even with no signal. */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cache = await caches.open(SHELL);
        return (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  /* Everything else: cache first, refreshed in the background so the
     next open has the new version without this one waiting for it. */
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req);
    if (hit) {
      fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      /* Font files arrive from fonts.gstatic.com on first paint; keeping
         them means the app looks like itself offline too. */
      if (res && (res.ok || res.type === "opaque") &&
          (url.origin === self.location.origin || /fonts\.(gstatic|googleapis)\.com$/.test(url.hostname))) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
