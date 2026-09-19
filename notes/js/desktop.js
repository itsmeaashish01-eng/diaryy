/* ================================================
   INKWELL — desktop.js
   The things a Mac expects and a phone has never heard of.

   A note app that is only ever driven by a finger gets away with a
   toolbar and nothing else. On a Mac the same app feels broken without
   the conventions of the platform: a right-click menu, ⌘V to drop a
   screenshot on the page, a cursor that tells you what the tool will
   do, and the space bar to shove the canvas around.

   Kept here rather than in app.js because none of it needs the app's
   state — these take what they're given and hand back a result, which
   also means the awkward parts can be tested without a browser.
   ================================================ */

/* ---------- cursors ---------- */

/* The eraser's cursor is the eraser: a circle the size of the thing it
   will remove. Drawing it as an SVG data URI is the only way to get a
   cursor that changes size, and browsers cap cursor images at 128px —
   past that the whole declaration is ignored and you get an arrow, so
   this clamps and falls back to a crosshair rather than losing it. */
export function cursorFor(tool, { size = 20, zoom = 1, dragging = false } = {}) {
  if (tool === "hand") return dragging ? "grabbing" : "grab";
  if (tool === "text") return "text";
  if (tool === "lasso") return "crosshair";

  const px = Math.round(size * zoom);

  if (tool === "eraser") {
    if (px < 6 || px > 120) return "crosshair";
    return circleCursor(px, "rgba(0,0,0,.55)", "rgba(255,255,255,.75)");
  }

  // Pen and highlighter: a crosshair once the nib is too small to see,
  // a dot at the tip when it is big enough to be worth showing.
  if (px < 8 || px > 120) return "crosshair";
  return circleCursor(px, "rgba(0,0,0,.6)", "rgba(255,255,255,.55)");
}

function circleCursor(px, stroke, halo) {
  const r = px / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px + 4}" height="${px + 4}">` +
    `<circle cx="${r + 2}" cy="${r + 2}" r="${r}" fill="none" stroke="${halo}" stroke-width="3"/>` +
    `<circle cx="${r + 2}" cy="${r + 2}" r="${r}" fill="none" stroke="${stroke}" stroke-width="1"/>` +
    `</svg>`;
  // The two numbers after the URL are the hotspot: the middle, so the
  // circle sits around the point it will act on rather than beside it.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(r + 2)} ${Math.round(r + 2)}, crosshair`;
}

/* ---------- clipboard ---------- */

/* What did they just paste? A screenshot, a photo, some text, or
   nothing we can use. Safari and Chrome disagree about whether an image
   arrives as a file or as an item, so both are checked. */
export function readClipboard(event) {
  const dt = event.clipboardData;
  if (!dt) return { kind: "none" };

  const files = [...(dt.files || [])];
  const items = [...(dt.items || [])];

  const image = files.find((f) => f.type.startsWith("image/"))
    || items.filter((i) => i.kind === "file" && i.type.startsWith("image/"))
            .map((i) => i.getAsFile()).find(Boolean);
  if (image) return { kind: "image", file: image };

  const video = files.find((f) => f.type.startsWith("video/"));
  if (video) return { kind: "video", file: video };

  const other = files[0];
  if (other) return { kind: "file", file: other };

  const text = dt.getData("text/plain");
  if (text && text.trim()) return { kind: "text", text };

  return { kind: "none" };
}

/* ---------- context menu ---------- */

/* One menu, built on demand at the pointer, resolving to the id of
   whatever was chosen (or null). Kept off the main menu machinery in
   ui.js on purpose: that one hangs off a button and is positioned by
   CSS, and this one has to appear wherever the pointer is and stay on
   screen when that is the bottom-right corner. */
export function contextMenu(x, y, items) {
  document.querySelector(".ctx-menu")?.remove();

  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = items.map((it) =>
    it.sep
      ? '<div class="menu-sep"></div>'
      : `<button role="menuitem" data-id="${it.id}"${it.danger ? ' class="danger"' : ""}${it.disabled ? " disabled" : ""}>` +
        `${escapeText(it.label)}${it.hint ? `<span class="ctx-hint">${escapeText(it.hint)}</span>` : ""}</button>`,
  ).join("");

  document.body.appendChild(menu);

  // Place it, then pull it back inside the window if it overhangs.
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;

  return new Promise((resolve) => {
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      menu.remove();
      document.removeEventListener("pointerdown", onAway, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onAway);
      resolve(id);
    };
    const onAway = (e) => { if (!e || !menu.contains(e.target)) finish(null); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); finish(null); } };

    menu.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-id]");
      if (b && !b.disabled) finish(b.dataset.id);
    });
    // Capture phase, so a click that lands on the page underneath closes
    // the menu instead of drawing a stroke through it.
    document.addEventListener("pointerdown", onAway, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onAway);
  });
}

function escapeText(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- platform ---------- */

/* Used only to label shortcuts in menus: ⌘ on a Mac, Ctrl everywhere
   else. Getting this wrong is small and looks careless. */
export const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

export const modLabel = () => (isMac() ? "⌘" : "Ctrl+");

/* A pointing device that hovers — a mouse or a trackpad — as opposed to
   a finger. Decides whether cursors and hover states are worth setting
   up at all. A Mac says yes, an iPhone says no, and an iPad with a
   Magic Keyboard says yes, which is correct. */
export const hasHover = () =>
  typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
