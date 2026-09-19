/* ================================================
   INKWELL — store.js
   Everything you write lives here, on this device, and nowhere else.

   IndexedDB rather than localStorage, for one reason: localStorage holds
   strings and caps out around 5 MB. A single inserted photo blows past
   that. IndexedDB stores Blobs natively — the photo, the video and the
   PDF go in as binary and come back out as object URLs, with no base64
   round trip to triple their size.

   Three stores:
     notebooks  the shelf — title, cover, page order
     pages      one record per page: ink, objects, paper, background
     blobs      photos, video, imported files, rendered PDF pages

   There is no server. Nothing here is uploaded, synced or phoned home.
   The only way data leaves this device is the export button.
   ================================================ */

const DB_NAME = "inkwell";
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("notebooks")) {
        db.createObjectStore("notebooks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pages")) {
        const s = db.createObjectStore("pages", { keyPath: "id" });
        // Deleting a notebook has to find its pages without walking the
        // whole store, and page thumbnails render in notebook order.
        s.createIndex("notebookId", "notebookId", { unique: false });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "id" });
      }
      void e;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Another tab has an older version of the database open."));
  });
  return dbPromise;
}

function tx(db, stores, mode) {
  const t = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("transaction aborted"));
  });
  return { t, done };
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* ---------- generic ---------- */

export async function put(store, value) {
  const db = await openDB();
  const { t, done } = tx(db, [store], "readwrite");
  t.objectStore(store).put(value);
  await done;
  return value;
}

export async function get(store, id) {
  const db = await openDB();
  const { t } = tx(db, [store], "readonly");
  return wrap(t.objectStore(store).get(id));
}

export async function all(store) {
  const db = await openDB();
  const { t } = tx(db, [store], "readonly");
  return wrap(t.objectStore(store).getAll());
}

export async function del(store, id) {
  const db = await openDB();
  const { t, done } = tx(db, [store], "readwrite");
  t.objectStore(store).delete(id);
  await done;
}

/* ---------- notebooks ---------- */

export async function listNotebooks() {
  const books = await all("notebooks");
  return books.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const saveNotebook = (nb) => put("notebooks", { ...nb, updatedAt: Date.now() });

export const getNotebook = (id) => get("notebooks", id);

/* Deleting a notebook deletes its pages and every blob only those pages
   referenced. A photo left behind in `blobs` is invisible but still on
   the disk quota, and a few of those turn into hundreds of megabytes
   nobody can account for. */
export async function deleteNotebook(id) {
  const pages = await pagesOf(id);
  const blobIds = new Set();
  for (const p of pages) for (const b of blobsReferencedBy(p)) blobIds.add(b);

  const db = await openDB();
  const { t, done } = tx(db, ["notebooks", "pages", "blobs"], "readwrite");
  t.objectStore("notebooks").delete(id);
  for (const p of pages) t.objectStore("pages").delete(p.id);
  for (const b of blobIds) t.objectStore("blobs").delete(b);
  await done;
}

/* ---------- pages ---------- */

export async function pagesOf(notebookId) {
  const db = await openDB();
  const { t } = tx(db, ["pages"], "readonly");
  const rows = await wrap(t.objectStore("pages").index("notebookId").getAll(notebookId));
  return rows.sort((a, b) => a.index - b.index);
}

export const getPage = (id) => get("pages", id);

export const savePage = (page) => put("pages", { ...page, updatedAt: Date.now() });

/* Saving a whole notebook's page order in one transaction, so a reorder
   that fails halfway leaves the order it started with rather than two
   pages both claiming to be page 3. */
export async function savePages(pages) {
  const db = await openDB();
  const { t, done } = tx(db, ["pages"], "readwrite");
  const store = t.objectStore("pages");
  for (const p of pages) store.put({ ...p, updatedAt: Date.now() });
  await done;
}

export async function deletePage(page) {
  const db = await openDB();
  const { t, done } = tx(db, ["pages", "blobs"], "readwrite");
  t.objectStore("pages").delete(page.id);
  for (const b of blobsReferencedBy(page)) t.objectStore("blobs").delete(b);
  await done;
}

/* Every place a blob id can hide on a page. Kept in one function so that
   adding an object type can't silently start leaking blobs. */
export function blobsReferencedBy(page) {
  const ids = [];
  if (page.background?.blobId) ids.push(page.background.blobId);
  for (const o of page.objects || []) {
    if (o.blobId) ids.push(o.blobId);
    if (o.posterBlobId) ids.push(o.posterBlobId);
  }
  return ids;
}

/* ---------- blobs ---------- */

export async function putBlob(blob, meta = {}) {
  const id = meta.id || `blob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await put("blobs", { id, blob, type: blob.type, size: blob.size, name: meta.name || "", addedAt: Date.now() });
  return id;
}

export async function getBlob(id) {
  const rec = await get("blobs", id);
  return rec ? rec.blob : null;
}

/* Object URLs are handed out a lot — every image on every page turn —
   and each one pins its blob in memory until revoked. This caches by id
   so re-rendering the same page ten times makes one URL, not ten. */
const urlCache = new Map();

export async function blobURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function releaseURL(id) {
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
}

export function releaseAllURLs() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/* ---------- housekeeping ---------- */

/* How much of the device this library is using. Browsers only ever give
   an estimate, and Safari's is coarser than most, so it is reported as
   one. */
export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const { usage: used, quota } = await navigator.storage.estimate();
  return { used: used || 0, quota: quota || 0 };
}

/* Safari evicts IndexedDB from sites it considers inactive. For a
   notebook app that is data loss, so we ask to be exempt. The user gets
   a prompt on some platforms and nothing at all on others; either way a
   refusal is not an error worth interrupting anyone over. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
