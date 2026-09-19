/* ================================================
   INKWELL — app.js
   Wiring. The shelf, the editor, and the pointer.

   This file owns the state and hands work to the modules that do it:
   store.js for persistence, canvas.js for drawing, strokes.js for the
   geometry, objects.js for everything that isn't ink, export.js for
   getting it back out again.

   The one part worth reading closely is the pointer handling, because
   it is where a note app is won or lost. Three rules:

     1. The pen always draws. Never waits on a gesture to resolve first
        — a stroke that begins 80 ms late feels broken in a way no
        amount of smoothing recovers.
     2. Two fingers always pan and zoom, whatever tool is in hand.
     3. One finger draws only until a pen has been seen. After that the
        hand resting on the page pans instead, which is what makes
        writing on glass possible at all.
   ================================================ */

import * as store from "./store.js";
import * as ui from "./ui.js";
import { PageView } from "./canvas.js";
import { newPage, PAPERS, PAGE_SIZES, COVERS } from "./paper.js";
import { Tools, TOOL, INK_COLORS, HIGHLIGHT_COLORS, PEN_SIZES, HIGHLIGHTER_SIZES, ERASER_SIZES } from "./tools.js";
import { History, applySnapshot } from "./history.js";
import * as objects from "./objects.js";
import { makeStroke, strokeHit, strokeInLasso, translateStroke, snapToShape } from "./strokes.js";
import { uid, clamp, debounce, escapeHtml, bboxOf, pointInPolygon } from "./util.js";
import * as exporter from "./export.js";

const $ = (id) => document.getElementById(id);

const state = {
  notebook: null,
  pages: [],
  index: 0,
  page: null,
  zoom: 1,
  dark: false,
  urls: new Map(),          // blobId -> object URL, for the current page
  selection: null,          // { strokes:[ids], objects:[ids], bbox }
  activeObject: null,       // id of the object being edited/handled
  dirty: false,
};

const tools = new Tools();
const history = new History();
let view = null;

/* ================================================
   BOOT
   ================================================ */

async function boot() {
  view = new PageView($("page"));
  ui.wireMenus();
  applyTheme(localStorage.getItem("inkwell.dark") === "1");

  try {
    await store.openDB();
  } catch (err) {
    ui.toast("This browser won't let the app store anything — private browsing?", { error: true, ms: 8000 });
    console.error(err);
    return;
  }
  store.requestPersistence();

  wireShelf();
  wireEditor();
  wireTray();
  wireKeyboard();
  renderTray();

  await loadShelf();
  await routeFromHash();
  window.addEventListener("hashchange", routeFromHash);

  // A page turned or a stroke drawn a moment before the tab closes must
  // not be lost. `pagehide` is the one that fires reliably on iOS.
  window.addEventListener("pagehide", () => savePageNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") savePageNow();
  });
}

function applyTheme(dark) {
  state.dark = dark;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem("inkwell.dark", dark ? "1" : "0");
  view?.setDark(dark);
}

async function routeFromHash() {
  const m = /^#\/n\/([\w-]+)(?:\/(\d+))?/.exec(location.hash);
  if (m) {
    if (state.notebook?.id !== m[1]) await openNotebook(m[1], Number(m[2] || 0));
    return;
  }
  if (state.notebook) await closeNotebook();
}

/* ================================================
   SHELF
   ================================================ */

function wireShelf() {
  $("newNotebookBtn").addEventListener("click", createNotebook);
  $("darkToggle").addEventListener("click", () => applyTheme(!state.dark));
  $("shelfSearch").addEventListener("input", debounce(runSearch, 220));

  $("libraryMenu").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    ui.closeMenus();
    if (act === "backup") await doBackup();
    if (act === "restore") $("fileJson").click();
    if (act === "importpdf") { state.pdfTarget = "new"; $("filePdf").click(); }
  });

  $("fileJson").addEventListener("change", onRestoreFile);
}

async function loadShelf() {
  const notebooks = await store.listNotebooks();
  const counts = new Map();
  for (const nb of notebooks) counts.set(nb.id, (await store.pagesOf(nb.id)).length);

  $("shelfEmpty").hidden = notebooks.length > 0;
  ui.renderShelf($("shelfGrid"), notebooks, counts, {
    onOpen: (id) => { location.hash = `#/n/${id}`; },
    onMenu: notebookMenu,
  });

  ui.renderStorage($("storageNote"), await store.usage());
}

async function createNotebook() {
  const choice = await ui.newNotebookSheet();
  if (!choice) return;

  const nb = {
    id: uid("nb"),
    title: choice.title,
    cover: choice.cover || COVERS[0].id,
    paper: choice.paper || "ruled",
    size: choice.size || "a4",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.saveNotebook(nb);
  await store.savePage(newPage(nb.id, 0, { paper: nb.paper, size: nb.size }));
  location.hash = `#/n/${nb.id}`;
}

async function notebookMenu(id, anchor) {
  const nb = await store.getNotebook(id);
  if (!nb) return;
  const picked = await ui.sheet(`
    <h2 class="sheet-title">${escapeHtml(nb.title)}</h2>
    <div class="sheet-list">
      <button class="btn btn-wide" data-close="rename">Rename</button>
      <button class="btn btn-wide" data-close="pdf">Export as PDF</button>
      <button class="btn btn-wide btn-danger" data-close="delete">Delete notebook</button>
    </div>
    <div class="sheet-actions"><button class="btn" data-close="">Cancel</button></div>`);
  void anchor;

  if (picked === "rename") {
    const name = await ui.sheet(`
      <h2 class="sheet-title">Rename</h2>
      <label class="field"><span>Title</span><input id="rnTitle" value="${escapeHtml(nb.title)}" autofocus maxlength="80" /></label>
      <div class="sheet-actions">
        <button class="btn" data-close="">Cancel</button>
        <button class="btn btn-primary" id="rnOk">Save</button>
      </div>`, (box, close) => {
      const go = () => close(box.querySelector("#rnTitle").value.trim());
      box.querySelector("#rnOk").addEventListener("click", go);
      box.querySelector("#rnTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
    if (name) { await store.saveNotebook({ ...nb, title: name }); await loadShelf(); }
  }

  if (picked === "pdf") {
    const pages = await store.pagesOf(id);
    await exportPDF(pages, nb.title);
  }

  if (picked === "delete") {
    const sure = await ui.confirmSheet({
      title: `Delete "${nb.title}"?`,
      body: "Every page in it, and every photo and video on those pages, goes with it. This cannot be undone — back up first if you're not sure.",
      confirm: "Delete notebook",
    });
    if (sure) {
      await store.deleteNotebook(id);
      await loadShelf();
      ui.toast("Notebook deleted.");
    }
  }
}

/* Search is over typed text: text boxes, file names, notebook titles.
   Handwriting is not searchable and this does not pretend otherwise —
   see the README on why recognition is a different project. */
async function runSearch() {
  const q = $("shelfSearch").value.trim().toLowerCase();
  const box = $("searchResults");
  const grid = $("shelfGrid");

  if (q.length < 2) {
    box.hidden = true;
    grid.hidden = false;
    return;
  }

  const hits = [];
  for (const nb of await store.listNotebooks()) {
    const pages = await store.pagesOf(nb.id);
    if (nb.title.toLowerCase().includes(q)) {
      hits.push({ nb, index: 0, snippet: "Notebook title" });
    }
    pages.forEach((p, i) => {
      for (const o of p.objects || []) {
        const text = o.type === "text" ? o.text : o.type === "file" ? o.name : "";
        const at = (text || "").toLowerCase().indexOf(q);
        if (at >= 0) {
          hits.push({ nb, index: i, snippet: text.slice(Math.max(0, at - 30), at + 60) });
          return;
        }
      }
    });
  }

  grid.hidden = true;
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits.slice(0, 60).map((h) => `
        <button class="hit" data-id="${h.nb.id}" data-index="${h.index}">
          <span class="hit-book">${escapeHtml(h.nb.title)}</span>
          <span class="hit-page">page ${h.index + 1}</span>
          <span class="hit-text">${escapeHtml(h.snippet)}</span>
        </button>`).join("")
    : `<p class="shelf-empty">Nothing matched “${escapeHtml(q)}”. Only typed text is searchable — handwriting isn't.</p>`;

  box.querySelectorAll(".hit").forEach((b) =>
    b.addEventListener("click", () => { location.hash = `#/n/${b.dataset.id}/${b.dataset.index}`; }));
}

/* ================================================
   NOTEBOOK / PAGES
   ================================================ */

async function openNotebook(id, index = 0) {
  const nb = await store.getNotebook(id);
  if (!nb) { location.hash = ""; return; }

  state.notebook = nb;
  state.pages = await store.pagesOf(id);
  if (!state.pages.length) {
    const p = newPage(id, 0, { paper: nb.paper, size: nb.size });
    await store.savePage(p);
    state.pages = [p];
  }

  document.body.dataset.view = "editor";
  $("shelf").hidden = true;
  $("editor").hidden = false;
  $("titleField").value = nb.title;

  await goToPage(clamp(index, 0, state.pages.length - 1), { fit: true });
  renderRail();
}

async function closeNotebook() {
  await savePageNow();
  releasePageURLs();
  state.notebook = null;
  state.pages = [];
  state.page = null;
  history.reset();
  document.body.dataset.view = "shelf";
  $("editor").hidden = true;
  $("shelf").hidden = false;
  await loadShelf();
}

async function goToPage(index, { fit = false } = {}) {
  await savePageNow();
  releasePageURLs();

  state.index = clamp(index, 0, state.pages.length - 1);
  state.page = state.pages[state.index];
  state.selection = null;
  state.activeObject = null;
  history.reset();

  view.setPage(state.page);
  view.setDark(state.dark);

  await loadPageBlobs();
  if (fit) fitZoom(); else setZoom(state.zoom);
  renderObjects();
  renderOverlay();
  updateChrome();
  location.replace(`#/n/${state.notebook.id}/${state.index}`);
}

/* Object URLs for everything the current page shows, resolved up front
   so renderObjects stays synchronous. */
async function loadPageBlobs() {
  state.urls = new Map();
  for (const o of state.page.objects || []) {
    if (o.blobId) {
      const url = await store.blobURL(o.blobId);
      if (url) state.urls.set(o.blobId, url);
    }
  }
  if (state.page.background?.blobId) {
    const url = await store.blobURL(state.page.background.blobId);
    view.setBackground(url ? await exporter.loadImage(url) : null);
  } else {
    view.setBackground(null);
  }
}

function releasePageURLs() {
  // Only the ones this page pinned; the cache is shared with thumbnails.
  for (const id of state.urls.keys()) store.releaseURL(id);
  state.urls = new Map();
}

function updateChrome() {
  $("pageCount").textContent = `${state.index + 1} / ${state.pages.length}`;
  $("prevPageBtn").disabled = state.index === 0;
  $("nextPageBtn").disabled = state.index === state.pages.length - 1;
  $("undoBtn").disabled = !history.canUndo;
  $("redoBtn").disabled = !history.canRedo;
  $("clearBgItem").hidden = !state.page?.background;
  $("zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;
}

history.addEventListener("change", updateChrome);

/* ================================================
   ZOOM AND PAN
   ================================================ */

function setZoom(z, anchor) {
  const stage = $("stage");
  const before = state.zoom;
  state.zoom = clamp(z, 0.2, 8);

  // Keep whatever was under the fingers (or the centre) in place, rather
  // than zooming towards the top-left corner.
  const a = anchor || { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
  const ratio = state.zoom / before;
  const sx = (stage.scrollLeft + a.x) * ratio - a.x;
  const sy = (stage.scrollTop + a.y) * ratio - a.y;

  view.setZoom(state.zoom);
  renderObjects();
  renderOverlay();
  stage.scrollLeft = sx;
  stage.scrollTop = sy;
  $("zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;
}

function fitZoom() {
  const stage = $("stage");
  const pad = 32;
  const z = Math.min(
    (stage.clientWidth - pad) / state.page.w,
    (stage.clientHeight - pad) / state.page.h,
  );
  setZoom(clamp(z, 0.2, 2));
  requestAnimationFrame(() => { $("stage").scrollTop = 0; });
}

/* ================================================
   OBJECTS ON THE PAGE
   ================================================ */

function renderObjects() {
  const media = $("mediaLayer");
  const layer = $("objectLayer");
  const seen = new Set();

  for (const o of state.page.objects || []) {
    const host = o.type === "image" || o.type === "video" ? media : layer;
    let el = host.querySelector(`[data-id="${o.id}"]`);
    const built = objects.renderObject(o, el, { urls: state.urls, zoom: state.zoom });
    if (!el) { host.appendChild(built); wireObject(built, o.id); }
    seen.add(o.id);
  }

  for (const el of [...media.children, ...layer.children]) {
    if (!seen.has(el.dataset.id)) el.remove();
  }
}

function objectById(id) { return (state.page.objects || []).find((o) => o.id === id); }

function replaceObject(id, next) {
  const i = state.page.objects.findIndex((o) => o.id === id);
  if (i >= 0) state.page.objects[i] = next;
  markDirty();
}

function wireObject(el, id) {
  el.addEventListener("pointerdown", (e) => {
    // A marking tool draws over a photo rather than picking it up —
    // the rule every pen app follows, and the one that makes writing a
    // caption across the corner of an image possible. Things are picked
    // up with the hand or the text tool, or looped with the lasso.
    if (tools.active !== TOOL.HAND && tools.active !== TOOL.TEXT) return;
    e.stopPropagation();
    selectObject(id);
  });

  const body = el.querySelector(".obj-text-body");
  if (body) {
    body.addEventListener("input", debounce(() => {
      const o = objectById(id);
      if (!o) return;
      o.text = body.textContent;
      // A text box grows to fit rather than clipping, which is the one
      // behaviour people reliably expect and no one thinks to ask for.
      const needed = body.scrollHeight / state.zoom + 16;
      if (needed > o.h) { o.h = Math.round(needed); el.style.height = `${o.h * state.zoom}px`; }
      markDirty();
    }, 350));
    body.addEventListener("focus", () => selectObject(id));
  }

  el.querySelector(".file-open")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const o = objectById(id);
    const url = await store.blobURL(o.blobId);
    if (url) window.open(url, "_blank", "noopener");
  });
}

function selectObject(id) {
  state.activeObject = id;
  state.selection = null;
  renderOverlay();
  renderInspector();
}

function clearSelection() {
  state.activeObject = null;
  state.selection = null;
  renderOverlay();
  renderInspector();
}

/* ================================================
   SELECTION OVERLAY
   ================================================ */

function renderOverlay() {
  const layer = $("overlayLayer");
  layer.innerHTML = "";

  if (state.activeObject) {
    const o = objectById(state.activeObject);
    if (!o) { state.activeObject = null; return; }
    layer.appendChild(objectFrame(o));
    return;
  }

  if (state.selection?.bbox) {
    const b = state.selection.bbox;
    const frame = document.createElement("div");
    frame.className = "sel-frame sel-ink";
    Object.assign(frame.style, {
      left: `${b.x * state.zoom}px`, top: `${b.y * state.zoom}px`,
      width: `${b.w * state.zoom}px`, height: `${b.h * state.zoom}px`,
    });
    frame.addEventListener("pointerdown", startInkDrag);
    layer.appendChild(frame);
  }
}

const HANDLES = ["nw", "ne", "se", "sw"];

function objectFrame(o) {
  const frame = document.createElement("div");
  frame.className = "sel-frame";
  Object.assign(frame.style, {
    left: `${o.x * state.zoom}px`, top: `${o.y * state.zoom}px`,
    width: `${o.w * state.zoom}px`, height: `${o.h * state.zoom}px`,
    transform: o.rot ? `rotate(${o.rot}deg)` : "",
  });

  const move = document.createElement("div");
  move.className = "sel-move";
  move.addEventListener("pointerdown", (e) => startObjectDrag(e, o.id, "move"));
  frame.appendChild(move);

  for (const h of HANDLES) {
    const el = document.createElement("div");
    el.className = `sel-handle sel-${h}`;
    el.addEventListener("pointerdown", (e) => startObjectDrag(e, o.id, h));
    frame.appendChild(el);
  }

  const rot = document.createElement("div");
  rot.className = "sel-rotate";
  rot.title = "Rotate";
  rot.addEventListener("pointerdown", (e) => startObjectDrag(e, o.id, "rotate"));
  frame.appendChild(rot);

  return frame;
}

/* Object drags run on the overlay's own pointer capture, so they keep
   working when the pointer leaves the page — which it does constantly
   when you drag a photo towards the edge. */
function startObjectDrag(e, id, mode) {
  e.preventDefault();
  e.stopPropagation();
  const start = objectById(id);
  if (!start) return;

  history.record(state.page);
  const origin = toPage(e.clientX, e.clientY);
  const before = { ...start };
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    const at = toPage(ev.clientX, ev.clientY);
    const dx = at.x - origin.x, dy = at.y - origin.y;
    let next;

    if (mode === "move") {
      next = { ...before, x: Math.round(before.x + dx), y: Math.round(before.y + dy) };
    } else if (mode === "rotate") {
      next = objects.rotateObject(before, at.x, at.y);
    } else {
      const ratio = before.type === "image" || before.type === "video";
      next = objects.resizeObject(before, mode, dx, dy, ratio && !ev.altKey);
    }

    replaceObject(id, next);
    renderObjects();
    renderOverlay();
  };

  const onUp = () => {
    el.releasePointerCapture?.(e.pointerId);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    saveSoon();
  };

  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}

/* Dragging a lasso selection moves every stroke inside it. */
function startInkDrag(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!state.selection) return;

  history.record(state.page);
  const origin = toPage(e.clientX, e.clientY);
  const ids = new Set(state.selection.strokes);
  const before = state.page.strokes.map((s) => (ids.has(s.id) ? { ...s, points: s.points.map((p) => p.slice()) } : s));
  const startBox = { ...state.selection.bbox };
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    const at = toPage(ev.clientX, ev.clientY);
    const dx = at.x - origin.x, dy = at.y - origin.y;
    state.page.strokes = before.map((s) => (ids.has(s.id) ? translateStroke(s, dx, dy) : s));
    state.selection.bbox = { ...startBox, x: startBox.x + dx, y: startBox.y + dy };
    view.drawInk();
    renderOverlay();
  };

  const onUp = () => {
    el.releasePointerCapture?.(e.pointerId);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    markDirty();
    saveSoon();
  };

  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
}

/* ================================================
   INSPECTOR — the panel for whatever is selected
   ================================================ */

function renderInspector() {
  const el = $("inspector");
  const o = state.activeObject ? objectById(state.activeObject) : null;

  if (!o && !state.selection) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;

  if (state.selection) {
    el.innerHTML = `
      <span class="insp-label">${state.selection.strokes.length} stroke${state.selection.strokes.length === 1 ? "" : "s"}</span>
      <button class="insp-btn" data-act="ink-duplicate">Duplicate</button>
      <button class="insp-btn" data-act="ink-delete">Delete</button>
      <button class="insp-btn" data-act="deselect">Done</button>`;
  } else if (o.type === "text") {
    el.innerHTML = `
      ${Object.entries(objects.FONTS).map(([k, f]) =>
        `<button class="insp-btn${o.font === k ? " is-on" : ""}" data-font="${k}">${escapeHtml(f.label)}</button>`).join("")}
      <span class="insp-sep"></span>
      <button class="insp-btn" data-size="-4">A−</button>
      <span class="insp-label">${o.size}</span>
      <button class="insp-btn" data-size="4">A+</button>
      <span class="insp-sep"></span>
      ${["left", "center", "right"].map((a) =>
        `<button class="insp-btn${o.align === a ? " is-on" : ""}" data-align="${a}">${a === "left" ? "⬅" : a === "center" ? "⬌" : "➡"}</button>`).join("")}
      <span class="insp-sep"></span>
      <input type="color" class="insp-color" value="${o.color}" data-color aria-label="Text colour" />
      <button class="insp-btn danger" data-act="delete">Delete</button>`;
  } else {
    el.innerHTML = `
      ${o.type === "image" ? `
        <button class="insp-btn${o.shadow ? " is-on" : ""}" data-act="shadow">Shadow</button>
        <button class="insp-btn" data-act="round">Corners</button>
        <span class="insp-sep"></span>` : ""}
      <button class="insp-btn" data-act="front">Bring forward</button>
      <button class="insp-btn" data-act="back">Send back</button>
      <button class="insp-btn" data-act="duplicate">Duplicate</button>
      <button class="insp-btn danger" data-act="delete">Delete</button>`;
  }

  el.onclick = (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const current = state.activeObject ? objectById(state.activeObject) : null;

    if (btn.dataset.font) { history.record(state.page); replaceObject(current.id, { ...current, font: btn.dataset.font }); }
    if (btn.dataset.size) { history.record(state.page); replaceObject(current.id, { ...current, size: clamp(current.size + Number(btn.dataset.size), 12, 120) }); }
    if (btn.dataset.align) { history.record(state.page); replaceObject(current.id, { ...current, align: btn.dataset.align }); }

    switch (btn.dataset.act) {
      case "delete": deleteObject(current.id); return;
      case "duplicate": duplicateObject(current.id); return;
      case "shadow": history.record(state.page); replaceObject(current.id, { ...current, shadow: !current.shadow }); break;
      case "round": history.record(state.page); replaceObject(current.id, { ...current, radius: current.radius >= 28 ? 0 : (current.radius || 0) + 8 }); break;
      case "front": reorderObject(current.id, +1); return;
      case "back": reorderObject(current.id, -1); return;
      case "ink-delete": deleteSelectedInk(); return;
      case "ink-duplicate": duplicateSelectedInk(); return;
      case "deselect": clearSelection(); return;
      default: break;
    }
    renderObjects();
    renderOverlay();
    renderInspector();
    saveSoon();
  };

  el.oninput = (e) => {
    if (!e.target.matches("[data-color]")) return;
    const current = objectById(state.activeObject);
    replaceObject(current.id, { ...current, color: e.target.value });
    renderObjects();
    saveSoon();
  };
}

function deleteObject(id) {
  history.record(state.page);
  const o = objectById(id);
  state.page.objects = state.page.objects.filter((x) => x.id !== id);
  if (o?.blobId) store.del("blobs", o.blobId);
  clearSelection();
  renderObjects();
  markDirty();
  saveSoon();
}

function duplicateObject(id) {
  history.record(state.page);
  const o = objectById(id);
  const copy = { ...o, id: uid("o"), x: o.x + 24, y: o.y + 24 };
  // Two objects must not share a blob: deleting one would take the
  // other's photo with it.
  if (o.blobId) {
    store.getBlob(o.blobId).then(async (blob) => {
      if (!blob) return;
      copy.blobId = await store.putBlob(blob, { name: o.name });
      renderObjects();
      await loadPageBlobs();
      renderObjects();
      saveSoon();
    });
  }
  state.page.objects.push(copy);
  selectObject(copy.id);
  renderObjects();
  markDirty();
  saveSoon();
}

function reorderObject(id, dir) {
  history.record(state.page);
  const arr = state.page.objects;
  const i = arr.findIndex((o) => o.id === id);
  const j = clamp(i + dir, 0, arr.length - 1);
  arr.splice(j, 0, arr.splice(i, 1)[0]);
  markDirty();
  renderObjects();
  saveSoon();
}

function deleteSelectedInk() {
  history.record(state.page);
  const ids = new Set(state.selection.strokes);
  state.page.strokes = state.page.strokes.filter((s) => !ids.has(s.id));
  clearSelection();
  view.drawInk();
  markDirty();
  saveSoon();
}

function duplicateSelectedInk() {
  history.record(state.page);
  const ids = new Set(state.selection.strokes);
  const copies = state.page.strokes
    .filter((s) => ids.has(s.id))
    .map((s) => ({ ...translateStroke(s, 30, 30), id: uid("s") }));
  state.page.strokes.push(...copies);
  state.selection = {
    strokes: copies.map((s) => s.id),
    bbox: { ...state.selection.bbox, x: state.selection.bbox.x + 30, y: state.selection.bbox.y + 30 },
  };
  view.drawInk();
  renderOverlay();
  renderInspector();
  markDirty();
  saveSoon();
}

/* ================================================
   THE POINTER
   ================================================ */

const pointers = new Map();
let gesture = null;     // { kind, ... } — one at a time, by construction

function toPage(clientX, clientY) {
  const r = $("page").getBoundingClientRect();
  return { x: (clientX - r.left) / state.zoom, y: (clientY - r.top) / state.zoom };
}

function wireStage() {
  const stage = $("stage");

  stage.addEventListener("pointerdown", onPointerDown, { passive: false });
  stage.addEventListener("pointermove", onPointerMove, { passive: false });
  stage.addEventListener("pointerup", onPointerUp);
  // No pointerleave: the stage captures the pointer, and a stroke drawn
  // out to the edge of the page would otherwise be cut off the moment
  // the pointer crossed the boundary.
  stage.addEventListener("pointercancel", onPointerUp);

  // Trackpad pinch arrives as a wheel event with ctrlKey set; a plain
  // wheel scrolls, which the stage already does on its own.
  stage.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    setZoom(state.zoom * (1 - e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });

  // Safari's own pinch would zoom the whole interface out from under the
  // page's zoom. The app handles it, so the browser must not.
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    stage.addEventListener(t, (e) => e.preventDefault()));

  stage.addEventListener("dragover", (e) => { e.preventDefault(); stage.classList.add("is-dropping"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("is-dropping"));
  stage.addEventListener("drop", async (e) => {
    e.preventDefault();
    stage.classList.remove("is-dropping");
    for (const file of e.dataTransfer.files) await insertFile(file);
  });
}

function onPointerDown(e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Two fingers down: whatever was being drawn was the heel of a hand,
  // not a stroke. Drop it and start the pinch.
  if (pointers.size === 2) {
    abandonStroke();
    const [a, b] = [...pointers.values()];
    gesture = {
      kind: "pinch",
      startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      startZoom: state.zoom,
      startMid: mid(a, b),
      startScroll: { x: $("stage").scrollLeft, y: $("stage").scrollTop },
    };
    return;
  }
  if (pointers.size > 2) return;

  const onObject = e.target.closest(".obj, .sel-frame");
  const drawable = tools.shouldDraw(e.pointerType);
  const tool = tools.active;

  if (tool === TOOL.HAND || !drawable) { startPan(e); return; }

  if (onObject && tool !== TOOL.ERASER && tool !== TOOL.LASSO) return;   // the object's own handler runs

  e.preventDefault();
  $("stage").setPointerCapture?.(e.pointerId);
  const at = toPage(e.clientX, e.clientY);

  if (tool === TOOL.PEN || tool === TOOL.HIGHLIGHTER) return startStroke(e, at);
  if (tool === TOOL.ERASER) return startErase(e, at);
  if (tool === TOOL.LASSO) return startLasso(at);
  if (tool === TOOL.TEXT) return placeTextBox(at);
}

function onPointerMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gesture) return;

  if (gesture.kind === "pinch") {
    if (pointers.size < 2) return;
    e.preventDefault();
    const [a, b] = [...pointers.values()];
    const stage = $("stage");
    const r = stage.getBoundingClientRect();
    const m = mid(a, b);
    const ratio = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / gesture.startDist;

    state.zoom = clamp(gesture.startZoom * ratio, 0.2, 8);
    view.setZoom(state.zoom);
    renderObjects();
    renderOverlay();
    $("zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;

    // Hold the point between the fingers still, and let the fingers
    // drag the page as they move.
    const k = state.zoom / gesture.startZoom;
    stage.scrollLeft = (gesture.startScroll.x + gesture.startMid.x - r.left) * k - (m.x - r.left);
    stage.scrollTop = (gesture.startScroll.y + gesture.startMid.y - r.top) * k - (m.y - r.top);
    return;
  }

  e.preventDefault();
  const at = toPage(e.clientX, e.clientY);

  if (gesture.kind === "pan") {
    const stage = $("stage");
    stage.scrollLeft = gesture.startScroll.x - (e.clientX - gesture.startClient.x);
    stage.scrollTop = gesture.startScroll.y - (e.clientY - gesture.startClient.y);
    return;
  }

  if (gesture.kind === "stroke") {
    // Coalesced events are the ones the browser held back between
    // frames. On a 120 Hz Pencil that is most of them, and using only
    // the last gives visibly faceted curves on fast strokes.
    const events = e.getCoalescedEvents?.() || [e];
    for (const ev of events) {
      const p = toPage(ev.clientX, ev.clientY);
      gesture.points.push([p.x, p.y, pressureOf(ev)]);
    }
    view.drawLive({ ...gesture.style, points: gesture.points });
    return;
  }

  if (gesture.kind === "erase") {
    eraseAt(at);
    view.drawCursor(at.x, at.y, tools.state.eraser.size / 2);
    return;
  }

  if (gesture.kind === "lasso") {
    gesture.points.push([at.x, at.y]);
    view.drawLasso(gesture.points);
  }
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  if (!gesture) return;

  if (gesture.kind === "pinch") {
    if (pointers.size === 0) { gesture = null; view.resize(); }
    return;
  }
  if (pointers.size > 0) return;

  if (gesture.kind === "stroke") finishStroke();
  else if (gesture.kind === "erase") { view.clearLive(); finishEdit(); }
  else if (gesture.kind === "lasso") finishLasso();

  gesture = null;
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/* A mouse and a finger both report 0 or a flat 0.5. Treating a real 0
   as "no pressure" would make every mouse stroke a hairline. */
function pressureOf(e) {
  if (e.pointerType === "pen" && e.pressure > 0) return e.pressure;
  return 0.5;
}

function startPan(e) {
  gesture = {
    kind: "pan",
    startClient: { x: e.clientX, y: e.clientY },
    startScroll: { x: $("stage").scrollLeft, y: $("stage").scrollTop },
  };
}

function startStroke(e, at) {
  clearSelection();
  const t = tools.current;
  gesture = {
    kind: "stroke",
    style: { tool: t.tool, color: t.color, size: t.size, opacity: t.opacity },
    points: [[at.x, at.y, pressureOf(e)]],
    startedAt: performance.now(),
  };
  view.drawLive({ ...gesture.style, points: gesture.points });
}

function finishStroke() {
  const g = gesture;
  view.clearLive();
  if (!g || g.points.length === 0) return;

  let points = g.points;

  /* Held still at the end — the pen has stopped but not lifted — turns a
     rough shape into a clean one. The dwell is measured by how little
     the last stretch moved, which is more reliable than a timer on a
     device that batches pointer events. */
  if (tools.state.shapeSnap && g.points.length > 8) {
    const tail = g.points.slice(-6);
    const spread = bboxOf(tail);
    if (Math.hypot(spread.w, spread.h) < 6 && performance.now() - g.startedAt > 350) {
      const shape = snapToShape(g.points);
      if (shape) { points = shape.points; ui.toast(`Snapped to ${shape.kind}`, { ms: 1200 }); }
    }
  }

  history.record(state.page);
  const stroke = makeStroke({ ...g.style, points });
  state.page.strokes.push(stroke);
  view.commitStroke(stroke);
  finishEdit();
}

function abandonStroke() {
  if (gesture?.kind === "stroke") { view.clearLive(); gesture = null; }
}

function startErase(e, at) {
  history.record(state.page);
  gesture = { kind: "erase", removed: false };
  eraseAt(at);
  view.drawCursor(at.x, at.y, tools.state.eraser.size / 2);
}

function eraseAt(at) {
  const r = tools.state.eraser.size / 2;
  const before = state.page.strokes.length;
  state.page.strokes = state.page.strokes.filter((s) => !strokeHit(s, at.x, at.y, r));
  if (state.page.strokes.length !== before) {
    gesture.removed = true;
    view.drawInk();
    markDirty();
  }
}

function startLasso(at) {
  clearSelection();
  gesture = { kind: "lasso", points: [[at.x, at.y]] };
}

function finishLasso() {
  const poly = gesture.points;
  view.clearLive();
  if (poly.length < 4) { clearSelection(); return; }

  const strokes = state.page.strokes.filter((s) => strokeInLasso(s, poly));
  const objs = (state.page.objects || []).filter((o) =>
    pointInPolygon(o.x + o.w / 2, o.y + o.h / 2, poly));

  if (!strokes.length && !objs.length) { ui.toast("Nothing inside the loop.", { ms: 1600 }); return; }

  // A loop around a single photo is almost certainly aimed at the photo.
  if (!strokes.length && objs.length === 1) { selectObject(objs[0].id); return; }

  const pts = strokes.flatMap((s) => s.points);
  state.selection = { strokes: strokes.map((s) => s.id), bbox: bboxOf(pts, 12) };
  state.activeObject = null;
  renderOverlay();
  renderInspector();
}

function finishEdit() {
  markDirty();
  saveSoon();
  updateChrome();
}

/* ================================================
   THE PEN TRAY
   ================================================ */

function wireTray() {
  $("tray").addEventListener("click", (e) => {
    const b = e.target.closest(".tool");
    if (!b) return;
    tools.active = b.dataset.tool;
    if (b.dataset.tool !== TOOL.LASSO) clearSelection();
  });

  $("zoomInBtn").addEventListener("click", () => setZoom(state.zoom * 1.25));
  $("zoomOutBtn").addEventListener("click", () => setZoom(state.zoom / 1.25));
  $("zoomFitBtn").addEventListener("click", fitZoom);

  tools.addEventListener("change", renderTray);
}

function renderTray() {
  document.querySelectorAll(".tool").forEach((b) =>
    b.classList.toggle("is-on", b.dataset.tool === tools.active));

  // The stylesheet uses this to take objects out of the hit-testing
  // while a marking tool is in hand, so the pen reaches the page
  // underneath them.
  $("page").dataset.tool = tools.active;

  const box = $("trayOptions");
  const t = tools.active;

  if (t === TOOL.PEN || t === TOOL.HIGHLIGHTER) {
    const key = t === TOOL.PEN ? "pen" : "highlighter";
    const palette = t === TOOL.PEN ? INK_COLORS : HIGHLIGHT_COLORS;
    const sizes = t === TOOL.PEN ? PEN_SIZES : HIGHLIGHTER_SIZES;
    const cur = tools.state[key];

    box.innerHTML = `
      ${sizes.map((s) => `
        <button class="nib${cur.size === s ? " is-on" : ""}" data-size="${s}" title="${s}" aria-label="Width ${s}">
          <span style="width:${Math.min(s, 22)}px;height:${Math.min(s, 22)}px"></span>
        </button>`).join("")}
      <span class="tray-sep"></span>
      ${palette.map((c) => `
        <button class="swatch${cur.color === c ? " is-on" : ""}" data-color="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("")}
      ${tools.state.recent.filter((c) => !palette.includes(c)).slice(0, 3).map((c) => `
        <button class="swatch${cur.color === c ? " is-on" : ""}" data-color="${c}" style="background:${c}" aria-label="Recent colour"></button>`).join("")}
      <input type="color" class="swatch swatch-custom" value="${cur.color}" data-custom aria-label="Any colour" />
      ${t === TOOL.PEN ? `
        <span class="tray-sep"></span>
        <button class="chip${tools.state.shapeSnap ? " is-on" : ""}" data-act="snap" title="Hold still at the end of a stroke to clean it up">Shapes</button>` : ""}`;

    box.onclick = (e) => {
      const size = e.target.closest("[data-size]");
      const color = e.target.closest("[data-color]");
      const snap = e.target.closest("[data-act='snap']");
      if (size) tools.set(key, { size: Number(size.dataset.size) });
      if (color) tools.set(key, { color: color.dataset.color });
      if (snap) tools.toggle("shapeSnap");
    };
    box.oninput = (e) => { if (e.target.matches("[data-custom]")) tools.set(key, { color: e.target.value }); };
    return;
  }

  if (t === TOOL.ERASER) {
    box.innerHTML = `
      ${ERASER_SIZES.map((s) => `
        <button class="nib${tools.state.eraser.size === s ? " is-on" : ""}" data-size="${s}" aria-label="Eraser ${s}">
          <span class="nib-hollow" style="width:${Math.min(s / 2, 24)}px;height:${Math.min(s / 2, 24)}px"></span>
        </button>`).join("")}
      <span class="tray-sep"></span>
      <button class="chip" data-act="clearink">Erase all ink on this page</button>`;
    box.onclick = (e) => {
      const size = e.target.closest("[data-size]");
      if (size) tools.set("eraser", { size: Number(size.dataset.size) });
      if (e.target.closest("[data-act='clearink']")) clearInk();
    };
    box.oninput = null;
    return;
  }

  if (t === TOOL.TEXT) {
    box.innerHTML = `<span class="tray-hint">Tap the page to put a text box there.</span>`;
    box.onclick = null; box.oninput = null;
    return;
  }

  if (t === TOOL.LASSO) {
    box.innerHTML = `<span class="tray-hint">Draw a loop around what you want to move, copy or delete.</span>`;
    box.onclick = null; box.oninput = null;
    return;
  }

  box.innerHTML = `<span class="tray-hint">Drag to move around the page. Two fingers work in any tool.</span>`;
  box.onclick = null; box.oninput = null;
}

async function clearInk() {
  if (!state.page.strokes.length) return;
  const sure = await ui.confirmSheet({
    title: "Erase all ink on this page?",
    body: "Photos, text boxes and the paper stay. The handwriting goes. Undo will bring it back.",
    confirm: "Erase the ink",
  });
  if (!sure) return;
  history.record(state.page);
  state.page.strokes = [];
  view.drawInk();
  finishEdit();
}

/* ================================================
   EDITOR CHROME
   ================================================ */

function wireEditor() {
  wireStage();

  $("backBtn").addEventListener("click", () => { location.hash = ""; });
  $("prevPageBtn").addEventListener("click", () => goToPage(state.index - 1));
  $("nextPageBtn").addEventListener("click", () => goToPage(state.index + 1));
  $("undoBtn").addEventListener("click", doUndo);
  $("redoBtn").addEventListener("click", doRedo);
  $("pagesBtn").addEventListener("click", () => {
    const rail = $("pagesRail");
    rail.hidden = !rail.hidden;
    if (!rail.hidden) renderRail();
  });
  $("railAddBtn").addEventListener("click", () => addPage());

  $("titleField").addEventListener("input", debounce(async () => {
    if (!state.notebook) return;
    state.notebook.title = $("titleField").value.trim() || "Untitled notebook";
    await store.saveNotebook(state.notebook);
  }, 500));

  $("insertMenu").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    ui.closeMenus();
    if (act === "photo") $("filePhoto").click();
    if (act === "camera") $("fileCamera").click();
    if (act === "video") $("fileVideo").click();
    if (act === "office") $("fileOffice").click();
    if (act === "pdfpages") { state.pdfTarget = "here"; $("filePdf").click(); }
    if (act === "attach") $("fileAny").click();
    if (act === "textbox") placeTextBox({ x: state.page.w * 0.15, y: state.page.h * 0.2 });
  });

  $("pageMenu").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    const paper = e.target.closest("[data-paper]")?.dataset.paper;
    if (paper) {
      history.record(state.page);
      state.page.paper = paper;
      view.drawPaper();
      renderPaperPicker();
      finishEdit();
      return;
    }
    if (!act) return;
    ui.closeMenus();
    if (act === "addpage") await addPage();
    if (act === "duplicate") await duplicatePage();
    if (act === "clearbg") await clearBackground();
    if (act === "deletepage") await removePage();
  });

  $("shareMenu").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    ui.closeMenus();
    await savePageNow();
    if (act === "png") await exportPNG();
    if (act === "pdfpage") await exportPDF([state.page], `${state.notebook.title} p${state.index + 1}`);
    if (act === "pdfall") await exportPDF(state.pages, state.notebook.title);
    if (act === "json") await doBackup();
  });

  renderPaperPicker();

  $("filePhoto").addEventListener("change", (e) => insertFiles(e.target.files));
  $("fileCamera").addEventListener("change", (e) => insertFiles(e.target.files));
  $("fileVideo").addEventListener("change", (e) => insertFiles(e.target.files));
  $("fileAny").addEventListener("change", (e) => insertFiles(e.target.files));
  $("fileOffice").addEventListener("change", (e) => insertOffice(e.target.files[0]));
  $("filePdf").addEventListener("change", (e) => insertPDF(e.target.files[0]));

  window.addEventListener("resize", debounce(() => { if (state.page) view.resize(true); }, 200));
}

function renderPaperPicker() {
  const box = $("paperPicker");
  box.innerHTML = Object.values(PAPERS).map((p) => `
    <button class="chip${state.page?.paper === p.id ? " is-on" : ""}" data-paper="${p.id}">${escapeHtml(p.label)}</button>`).join("");
}

function renderRail() {
  if ($("pagesRail").hidden) return;
  ui.renderRail($("railList"), state.pages, state.index, {
    onGo: (i) => goToPage(i),
    onReorder: async (from, to) => {
      const arr = state.pages;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      arr.forEach((p, i) => { p.index = i; });
      await store.savePages(arr);
      state.index = arr.findIndex((p) => p.id === state.page.id);
      renderRail();
      updateChrome();
    },
  });
  drawThumbs();
}

/* Thumbnails are drawn one at a time and only while the rail is open.
   Rendering forty pages at once on a page turn is what makes other note
   apps stutter when you open the page list. */
async function drawThumbs() {
  for (const slot of $("railList").querySelectorAll(".rail-thumb")) {
    const page = state.pages.find((p) => p.id === slot.dataset.page);
    if (!page || slot.dataset.done) continue;
    const canvas = await exporter.renderPage(page, { scale: 0.11, thumb: true });
    slot.style.backgroundImage = `url(${canvas.toDataURL("image/jpeg", 0.7)})`;
    slot.dataset.done = "1";
    if ($("pagesRail").hidden) return;
  }
}

async function addPage(after = state.index) {
  const p = newPage(state.notebook.id, after + 1, {
    paper: state.page?.paper || state.notebook.paper,
    size: state.page?.size || state.notebook.size,
  });
  state.pages.splice(after + 1, 0, p);
  state.pages.forEach((x, i) => { x.index = i; });
  await store.savePages(state.pages);
  await goToPage(after + 1);
  renderRail();
}

async function duplicatePage() {
  const copy = structuredClone(state.page);
  copy.id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  copy.index = state.index + 1;
  // Blobs are shared by reference on a duplicate, which would make
  // deleting one page strip the other's photos. Copy them.
  for (const o of copy.objects || []) {
    if (!o.blobId) continue;
    const blob = await store.getBlob(o.blobId);
    if (blob) o.blobId = await store.putBlob(blob, { name: o.name });
  }
  if (copy.background?.blobId) {
    const blob = await store.getBlob(copy.background.blobId);
    if (blob) copy.background.blobId = await store.putBlob(blob, { name: "page background" });
  }
  state.pages.splice(state.index + 1, 0, copy);
  state.pages.forEach((x, i) => { x.index = i; });
  await store.savePages(state.pages);
  await goToPage(state.index + 1);
  renderRail();
  ui.toast("Page duplicated.");
}

async function removePage() {
  if (state.pages.length === 1) {
    const sure = await ui.confirmSheet({
      title: "Clear this page?",
      body: "It's the only page in the notebook, so it will be emptied rather than removed.",
      confirm: "Clear it",
    });
    if (!sure) return;
    history.record(state.page);
    state.page.strokes = [];
    state.page.objects = [];
    state.page.background = null;
    view.setBackground(null);
    view.drawInk();
    renderObjects();
    finishEdit();
    return;
  }

  const sure = await ui.confirmSheet({
    title: `Delete page ${state.index + 1}?`,
    body: "Everything on it goes, including photos and video. This one is not undoable.",
    confirm: "Delete page",
  });
  if (!sure) return;

  const gone = state.page;
  state.pages.splice(state.index, 1);
  state.pages.forEach((x, i) => { x.index = i; });
  state.dirty = false;                      // don't resurrect it on save
  await store.deletePage(gone);
  await store.savePages(state.pages);
  await goToPage(Math.min(state.index, state.pages.length - 1));
  renderRail();
}

async function clearBackground() {
  if (!state.page.background) return;
  history.record(state.page);
  const id = state.page.background.blobId;
  state.page.background = null;
  view.setBackground(null);
  await store.del("blobs", id);
  finishEdit();
}

/* ================================================
   INSERTING THINGS
   ================================================ */

function placeTextBox(at) {
  history.record(state.page);
  const t = tools.state.text;
  const o = objects.makeText({
    x: Math.round(clamp(at.x, 20, state.page.w - 440)),
    y: Math.round(clamp(at.y, 20, state.page.h - 140)),
    color: t.color, size: t.size, font: t.font, align: t.align,
  });
  state.page.objects.push(o);
  renderObjects();
  selectObject(o.id);
  markDirty();
  saveSoon();
  // The keyboard should be up already — placing a text box and then
  // having to tap it again is the kind of thing that makes an app feel
  // like a toy.
  requestAnimationFrame(() => {
    $("objectLayer").querySelector(`[data-id="${o.id}"] .obj-text-body`)?.focus();
  });
}

async function insertFiles(list) {
  for (const file of list) await insertFile(file);
  // Clearing the inputs matters: without it, picking the same photo
  // twice in a row fires no change event the second time.
  ["filePhoto", "fileCamera", "fileVideo", "fileAny"].forEach((id) => { $(id).value = ""; });
}

async function insertFile(file) {
  if (!file) return;
  try {
    if (file.type.startsWith("image/")) return await insertImage(file);
    if (file.type.startsWith("video/")) return await insertVideo(file);
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const how = await ui.sheet(`
        <h2 class="sheet-title">${escapeHtml(file.name)}</h2>
        <p class="sheet-body">A PDF can come in as pages you write on, or stay as an attachment you tap to open.</p>
        <div class="sheet-list">
          <button class="btn btn-wide btn-primary" data-close="pages">Add its pages to this notebook</button>
          <button class="btn btn-wide" data-close="attach">Attach it to this page</button>
        </div>
        <div class="sheet-actions"><button class="btn" data-close="">Cancel</button></div>`);
      if (how === "pages") { state.pdfTarget = "here"; return await insertPDF(file); }
      if (how === "attach") return await attachFile(file);
      return;
    }
    if (/\.(docx|pptx)$/i.test(file.name)) return await insertOffice(file);
    return await attachFile(file);
  } catch (err) {
    console.error(err);
    ui.toast(err.message || "That file couldn't be read.", { error: true, ms: 6000 });
  }
}

async function insertImage(file) {
  const blobId = await store.putBlob(file, { name: file.name });
  const url = await store.blobURL(blobId);
  const img = await exporter.loadImage(url);
  if (!img) { await store.del("blobs", blobId); throw new Error("That image couldn't be decoded."); }

  history.record(state.page);
  const box = objects.fitOnPage(img.naturalWidth, img.naturalHeight, state.page);
  const o = objects.makeImage({ blobId, name: file.name, ...box });
  state.page.objects.push(o);
  state.urls.set(blobId, url);
  renderObjects();
  selectObject(o.id);
  finishEdit();
}

async function insertVideo(file) {
  const blobId = await store.putBlob(file, { name: file.name });
  const url = await store.blobURL(blobId);

  // Ask the file how big its picture is, so the box on the page is the
  // right shape before anyone drags it.
  const dims = await new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve({ w: v.videoWidth || 640, h: v.videoHeight || 360 });
    v.onerror = () => resolve({ w: 640, h: 360 });
    v.src = url;
  });

  history.record(state.page);
  const box = objects.fitOnPage(dims.w, dims.h, state.page, 0.55);
  const o = objects.makeVideo({ blobId, name: file.name, ...box });
  state.page.objects.push(o);
  state.urls.set(blobId, url);
  renderObjects();
  selectObject(o.id);
  finishEdit();
  ui.toast("Video added. It plays in place, and it's stored on this device.", { ms: 4200 });
}

async function attachFile(file) {
  const blobId = await store.putBlob(file, { name: file.name });
  history.record(state.page);
  const o = objects.makeFile({
    blobId, name: file.name, mime: file.type, size: file.size,
    x: Math.round(state.page.w * 0.12),
    y: Math.round(clamp(state.page.h * 0.2 + state.page.objects.length * 130, 20, state.page.h - 140)),
  });
  state.page.objects.push(o);
  renderObjects();
  selectObject(o.id);
  finishEdit();
}

/* Word and PowerPoint come in as text boxes, plus the original file as
   an attachment so nothing is lost. See office.js for what survives the
   trip and what doesn't. */
async function insertOffice(file) {
  if (!file) return;
  $("fileOffice").value = "";
  try {
    ui.showProgress(`Reading ${file.name}…`);
    const { readOffice } = await import("./office.js");
    const doc = await readOffice(file);
    ui.hideProgress();

    history.record(state.page);
    let y = 90;
    let pageIndex = state.index;
    let target = state.page;

    for (const section of doc.sections) {
      const text = [section.title, ...section.paragraphs].filter(Boolean).join("\n");
      if (!text.trim()) continue;

      // Roughly how tall this will be once wrapped, so long documents
      // spill onto new pages instead of off the bottom of one.
      const lines = Math.ceil(text.length / 52) + text.split("\n").length;
      const height = Math.min(lines * 40 + 24, target.h - 160);

      if (y + height > target.h - 80) {
        await store.savePage(target);
        await addPage(pageIndex);
        pageIndex = state.index;
        target = state.page;
        y = 90;
      }

      target.objects.push(objects.makeText({
        x: 90, y, w: target.w - 180, h: height, text,
        size: 28, font: "sans", color: "#2b3138",
      }));
      y += height + 28;
    }

    await attachFile(file);
    renderObjects();
    finishEdit();
    ui.toast(
      `${doc.kind === "pptx" ? "Slides" : "Document"} imported as text. Formatting isn't kept — the original is attached.`,
      { ms: 6000 },
    );
  } catch (err) {
    ui.hideProgress();
    console.error(err);
    ui.toast(err.message || "That file couldn't be read.", { error: true, ms: 7000 });
  }
}

async function insertPDF(file) {
  if (!file) return;
  $("filePdf").value = "";
  const target = state.pdfTarget || "here";
  state.pdfTarget = null;

  try {
    ui.showProgress("Opening the PDF…");
    const { importPDF } = await import("./pdfin.js");

    let notebook = state.notebook;
    let startIndex;

    if (target === "new" || !notebook) {
      notebook = {
        id: uid("nb"),
        title: file.name.replace(/\.pdf$/i, "").slice(0, 80) || "Imported PDF",
        cover: "slate", paper: "plain", size: "a4",
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await store.saveNotebook(notebook);
      startIndex = 0;
    } else {
      await savePageNow();
      startIndex = state.index + 1;
    }

    const { pages, truncated, total } = await importPDF(file, notebook.id, startIndex, {
      onProgress: (n, t) => ui.setProgress(n, t, `Rendering page ${n} of ${t}…`),
    });

    if (target === "new" || notebook !== state.notebook) {
      pages.forEach((p, i) => { p.index = i; });
      await store.savePages(pages);
      ui.hideProgress();
      location.hash = `#/n/${notebook.id}`;
    } else {
      state.pages.splice(startIndex, 0, ...pages);
      state.pages.forEach((p, i) => { p.index = i; });
      await store.savePages(state.pages);
      ui.hideProgress();
      await goToPage(startIndex);
      renderRail();
    }

    ui.toast(
      truncated
        ? `Imported the first ${pages.length} of ${total} pages.`
        : `${pages.length} page${pages.length === 1 ? "" : "s"} imported — write straight onto them.`,
      { ms: 5000 },
    );
  } catch (err) {
    ui.hideProgress();
    console.error(err);
    ui.toast(err.message || "That PDF couldn't be opened.", { error: true, ms: 7000 });
  }
}

/* ================================================
   EXPORT
   ================================================ */

async function exportPNG() {
  ui.showProgress("Rendering the page…");
  try {
    const blob = await exporter.pageToPNG(state.page, 2);
    ui.hideProgress();
    exporter.download(blob, `${exporter.safeName(state.notebook.title)}-p${state.index + 1}.png`);
  } catch (err) {
    ui.hideProgress();
    ui.toast(err.message || "The page couldn't be rendered.", { error: true });
  }
}

async function exportPDF(pages, title) {
  if (!pages.length) return;
  ui.showProgress("Building the PDF…");
  try {
    const blob = await exporter.pagesToPDF(pages, {
      title,
      onProgress: (n, t) => ui.setProgress(n, t, `Page ${n} of ${t}…`),
    });
    ui.hideProgress();
    exporter.download(blob, `${exporter.safeName(title)}.pdf`);
    ui.toast("Exported. The PDF is a picture of each page — the .json backup is the one that restores notes.", { ms: 6000 });
  } catch (err) {
    ui.hideProgress();
    console.error(err);
    ui.toast(err.message || "The PDF couldn't be built.", { error: true });
  }
}

async function doBackup() {
  ui.showProgress("Packing everything up…");
  try {
    const blob = await exporter.backupJSON({
      onProgress: (n, t) => ui.setProgress(n, t, `Attachment ${n} of ${t}…`),
    });
    ui.hideProgress();
    const stamp = new Date().toISOString().slice(0, 10);
    exporter.download(blob, `inkwell-backup-${stamp}.json`);
    ui.toast("Backed up. Keep it somewhere that isn't this device.", { ms: 6000 });
  } catch (err) {
    ui.hideProgress();
    console.error(err);
    ui.toast(err.message || "The backup failed.", { error: true });
  }
}

async function onRestoreFile(e) {
  const file = e.target.files[0];
  $("fileJson").value = "";
  if (!file) return;

  const how = await ui.sheet(`
    <h2 class="sheet-title">Restore from backup</h2>
    <p class="sheet-body">Add these notebooks alongside the ones already here, or replace the library with them?</p>
    <div class="sheet-list">
      <button class="btn btn-wide btn-primary" data-close="merge">Add alongside</button>
      <button class="btn btn-wide btn-danger" data-close="replace">Replace everything</button>
    </div>
    <div class="sheet-actions"><button class="btn" data-close="">Cancel</button></div>`);
  if (!how) return;

  ui.showProgress("Restoring…");
  try {
    const n = await exporter.restoreJSON(file, { merge: how === "merge" });
    ui.hideProgress();
    await loadShelf();
    ui.toast(`Restored ${n} notebook${n === 1 ? "" : "s"}.`);
  } catch (err) {
    ui.hideProgress();
    console.error(err);
    ui.toast(err.message || "That file couldn't be restored.", { error: true, ms: 7000 });
  }
}

/* ================================================
   UNDO, SAVE, KEYBOARD
   ================================================ */

function doUndo() {
  const snap = history.undo(state.page);
  if (!snap) return;
  applySnapshot(state.page, snap);
  afterHistory();
}

function doRedo() {
  const snap = history.redo(state.page);
  if (!snap) return;
  applySnapshot(state.page, snap);
  afterHistory();
}

async function afterHistory() {
  clearSelection();
  await loadPageBlobs();
  view.drawPaper();
  view.drawInk();
  renderObjects();
  renderPaperPicker();
  markDirty();
  saveSoon();
  updateChrome();
}

function markDirty() {
  state.dirty = true;
  if (state.page) state.page.updatedAt = Date.now();
}

const saveSoon = debounce(() => savePageNow(), 700);

async function savePageNow() {
  saveSoon.cancel();
  if (!state.dirty || !state.page || !state.notebook) return;
  state.dirty = false;
  try {
    await store.savePage(state.page);
    await store.saveNotebook(state.notebook);
    // The thumbnail for this page is now wrong.
    $("railList").querySelector(`[data-page="${state.page.id}"]`)?.removeAttribute("data-done");
  } catch (err) {
    state.dirty = true;
    console.error(err);
    ui.toast("Couldn't save — the device may be out of space.", { error: true, ms: 8000 });
  }
}

function wireKeyboard() {
  document.addEventListener("keydown", (e) => {
    const typing = e.target.matches("input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']");
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === "z") {
      if (typing) return;
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); savePageNow(); return; }
    if (typing || document.body.dataset.view !== "editor") return;

    const byNumber = { 1: TOOL.PEN, 2: TOOL.HIGHLIGHTER, 3: TOOL.ERASER, 4: TOOL.LASSO, 5: TOOL.TEXT, 6: TOOL.HAND };
    if (byNumber[e.key]) { tools.active = byNumber[e.key]; return; }

    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goToPage(state.index - 1); }
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goToPage(state.index + 1); }
    if (e.key === "Escape") clearSelection();
    if ((e.key === "Backspace" || e.key === "Delete")) {
      if (state.activeObject) { e.preventDefault(); deleteObject(state.activeObject); }
      else if (state.selection) { e.preventDefault(); deleteSelectedInk(); }
    }
    if (e.key === "0" && mod) { e.preventDefault(); fitZoom(); }
  });
}

boot();
