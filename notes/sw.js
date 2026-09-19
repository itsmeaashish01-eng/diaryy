/* ================================================
   INKWELL — sw.js
   The service worker, so the website works with no connection.

   It caches the app — the HTML, the CSS, the modules, the icons — and
   nothing else. Your notes are in IndexedDB, which the browser keeps
   whether this file exists or not; the cache is only here so that the
   code to read them is available on a train.

   Cache-first, because the app is a fixed set of files and a stale one
   is better than a blank page. A version bump is what ships an update:
   the new worker installs, the old caches are deleted on activate.
   ================================================ */

const VERSION = "inkwell-v1";

const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/store.js",
  "./js/canvas.js",
  "./js/strokes.js",
  "./js/paper.js",
  "./js/objects.js",
  "./js/tools.js",
  "./js/history.js",
  "./js/ui.js",
  "./js/util.js",
  "./js/export.js",
  "./js/pdfout.js",
  "./js/pdfin.js",
  "./js/office.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // One missing file must not fail the whole install, or a typo in
      // this list silently means no offline support at all.
      .then((c) => Promise.allSettled(SHELL.map((url) => c.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        // Cache what we fetch, so a lazily-imported module (pdf.js, the
        // office reader) is there the second time even offline.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"))),
  );
});
