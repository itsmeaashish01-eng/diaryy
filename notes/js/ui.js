/* ================================================
   INKWELL — ui.js
   The chrome: the shelf, menus, sheets, toasts, progress.

   Everything here is presentational. It renders what it is given and
   reports back through callbacks; it never reaches into the store or
   the page model. app.js owns those.
   ================================================ */

import { escapeHtml, formatDate, formatBytes } from "./util.js";
import { COVERS, PAPERS, PAGE_SIZES } from "./paper.js";

/* ---------- toast ---------- */

let toastTimer = null;

export function toast(message, { error = false, ms = 3200 } = {}) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("is-error", error);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-on"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-on");
    setTimeout(() => { el.hidden = true; }, 240);
  }, ms);
}

/* ---------- progress ---------- */

const progressEl = () => document.getElementById("progress");

export function showProgress(label) {
  document.getElementById("progressLabel").textContent = label;
  document.getElementById("progressFill").style.width = "0%";
  progressEl().hidden = false;
}

export function setProgress(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progressFill").style.width = `${pct}%`;
  if (label) document.getElementById("progressLabel").textContent = label;
}

export function hideProgress() { progressEl().hidden = true; }

/* ---------- sheets ---------- */

/* One modal, reused. Returns a promise that resolves with whatever the
   sheet's own buttons pass to `close`, or null if it was dismissed. */
export function sheet(html, wire) {
  const scrim = document.getElementById("scrim");
  const box = document.getElementById("sheet");
  box.innerHTML = html;
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add("is-on"));

  return new Promise((resolve) => {
    let done = false;
    const close = (value = null) => {
      if (done) return;
      done = true;
      scrim.classList.remove("is-on");
      setTimeout(() => { scrim.hidden = true; box.innerHTML = ""; }, 200);
      document.removeEventListener("keydown", onKey);
      scrim.removeEventListener("pointerdown", onScrim);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    const onScrim = (e) => { if (e.target === scrim) close(null); };

    document.addEventListener("keydown", onKey);
    scrim.addEventListener("pointerdown", onScrim);
    box.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => close(b.dataset.close || null)));

    wire?.(box, close);
    box.querySelector("[autofocus]")?.focus();
  });
}

export function confirmSheet({ title, body, confirm = "Delete", danger = true }) {
  return sheet(`
    <h2 class="sheet-title">${escapeHtml(title)}</h2>
    <p class="sheet-body">${escapeHtml(body)}</p>
    <div class="sheet-actions">
      <button class="btn" data-close="">Cancel</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-close="yes" autofocus>${escapeHtml(confirm)}</button>
    </div>`).then((v) => v === "yes");
}

/* ---------- new notebook ---------- */

export function newNotebookSheet() {
  const covers = COVERS.map((c, i) =>
    `<button class="cover-swatch${i === 0 ? " is-on" : ""}" data-cover="${c.id}"
       style="background:${c.css}" title="${escapeHtml(c.label)}" aria-label="${escapeHtml(c.label)}"></button>`).join("");

  const papers = Object.values(PAPERS).map((p, i) =>
    `<button class="chip${i === 1 ? " is-on" : ""}" data-paper="${p.id}">${escapeHtml(p.label)}</button>`).join("");

  const sizes = Object.values(PAGE_SIZES).map((s, i) =>
    `<button class="chip${i === 0 ? " is-on" : ""}" data-size="${s.id}">${escapeHtml(s.label)}</button>`).join("");

  return sheet(`
    <h2 class="sheet-title">New notebook</h2>
    <label class="field">
      <span>Title</span>
      <input id="nbTitle" value="Untitled notebook" autofocus maxlength="80" />
    </label>
    <p class="field-label">Cover</p>
    <div class="swatch-row" id="coverRow">${covers}</div>
    <p class="field-label">Paper</p>
    <div class="chip-row" id="paperRow">${papers}</div>
    <p class="field-label">Page size</p>
    <div class="chip-row" id="sizeRow">${sizes}</div>
    <div class="sheet-actions">
      <button class="btn" data-close="">Cancel</button>
      <button class="btn btn-primary" id="nbCreate">Create</button>
    </div>`, (box, close) => {
    const pick = (rowId, attr) => {
      const row = box.querySelector(`#${rowId}`);
      row.addEventListener("click", (e) => {
        const b = e.target.closest(`[data-${attr}]`);
        if (!b) return;
        row.querySelectorAll("button").forEach((x) => x.classList.remove("is-on"));
        b.classList.add("is-on");
      });
      return () => row.querySelector(".is-on")?.dataset[attr];
    };
    const cover = pick("coverRow", "cover");
    const paper = pick("paperRow", "paper");
    const size = pick("sizeRow", "size");

    const submit = () => close({
      title: box.querySelector("#nbTitle").value.trim() || "Untitled notebook",
      cover: cover(), paper: paper(), size: size(),
    });
    box.querySelector("#nbCreate").addEventListener("click", submit);
    box.querySelector("#nbTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  });
}

/* ---------- shelf ---------- */

export function renderShelf(grid, notebooks, counts, { onOpen, onMenu }) {
  grid.innerHTML = notebooks.map((nb) => {
    const cover = COVERS.find((c) => c.id === nb.cover) || COVERS[0];
    const n = counts.get(nb.id) ?? 0;
    return `
      <article class="book" data-id="${nb.id}">
        <button class="book-cover" style="background:${cover.css}" aria-label="Open ${escapeHtml(nb.title)}">
          <span class="book-spine" aria-hidden="true"></span>
          <span class="book-cover-title">${escapeHtml(nb.title)}</span>
        </button>
        <div class="book-foot">
          <div>
            <p class="book-title">${escapeHtml(nb.title)}</p>
            <p class="book-sub">${n} page${n === 1 ? "" : "s"} · ${escapeHtml(formatDate(nb.updatedAt))}</p>
          </div>
          <button class="icon-btn book-menu" aria-label="Notebook options">⋯</button>
        </div>
      </article>`;
  }).join("");

  grid.querySelectorAll(".book").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector(".book-cover").addEventListener("click", () => onOpen(id));
    el.querySelector(".book-menu").addEventListener("click", (e) => {
      e.stopPropagation();
      onMenu(id, e.currentTarget);
    });
  });
}

/* ---------- page thumbnails ---------- */

export function renderRail(list, pages, currentIndex, { onGo, onReorder }) {
  list.innerHTML = pages.map((p, i) => `
    <button class="rail-item${i === currentIndex ? " is-on" : ""}" data-index="${i}" draggable="true">
      <span class="rail-thumb" data-page="${p.id}"></span>
      <span class="rail-no">${i + 1}</span>
    </button>`).join("");

  let dragFrom = null;
  list.querySelectorAll(".rail-item").forEach((el) => {
    const i = Number(el.dataset.index);
    el.addEventListener("click", () => onGo(i));
    el.addEventListener("dragstart", () => { dragFrom = i; el.classList.add("is-dragging"); });
    el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragFrom != null && dragFrom !== i) onReorder(dragFrom, i);
      dragFrom = null;
    });
  });
}

/* ---------- menus ---------- */

/* One open menu at a time, closed by anything that isn't it. Wired once
   at startup rather than per menu, so a new menu in the HTML works
   without another listener. */
export function wireMenus() {
  const close = (menu) => {
    menu.hidden = true;
    menu.previousElementSibling?.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[aria-haspopup='true']");
    const inside = e.target.closest(".menu");

    document.querySelectorAll(".menu:not([hidden])").forEach((m) => {
      if (m !== btn?.nextElementSibling && m !== inside) close(m);
    });

    if (btn) {
      const menu = btn.nextElementSibling;
      const show = menu.hidden;
      menu.hidden = !show;
      btn.setAttribute("aria-expanded", String(show));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".menu:not([hidden])").forEach(close);
  });
}

export function closeMenus() {
  document.querySelectorAll(".menu:not([hidden])").forEach((m) => {
    m.hidden = true;
    m.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

/* ---------- storage line ---------- */

export function renderStorage(el, usage) {
  if (!usage) {
    el.textContent = "Everything is stored on this device.";
    return;
  }
  const pct = usage.quota ? Math.round((usage.used / usage.quota) * 100) : 0;
  el.textContent = `${formatBytes(usage.used)} used on this device` +
    (usage.quota ? ` — about ${pct}% of what the browser will give this app.` : ".");
}
