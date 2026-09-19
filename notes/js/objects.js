/* ================================================
   INKWELL — objects.js
   Everything on a page that isn't ink.

   Photos, video, text boxes and attached files are DOM elements rather
   than canvas drawings, and that is a deliberate choice:

     - a <video> can't be a rectangle on a canvas; it has to be a real
       element to play, scrub and go full screen;
     - a text box wants to be contenteditable, with the system keyboard,
       selection, dictation and autocorrect that come with it — all of
       which would have to be rebuilt from nothing on a canvas;
     - dragging and resizing a DOM element is a CSS transform, which the
       compositor animates on its own thread, rather than a full repaint
       of the page for every pointer move.

   The cost is that export has to draw them a second way — see
   export.js, which paints each object onto a canvas.
   ================================================ */

import { uid, clamp, escapeHtml, formatBytes } from "./util.js";

export const MIN_SIZE = 40;   // page units; below this the handles overlap

/* ---------- factories ---------- */

export function makeImage({ blobId, w, h, x, y, name = "" }) {
  return { id: uid("o"), type: "image", blobId, name, x, y, w, h, rot: 0, radius: 6, shadow: true };
}

export function makeVideo({ blobId, w, h, x, y, name = "" }) {
  return { id: uid("o"), type: "video", blobId, name, x, y, w, h, rot: 0, radius: 8 };
}

export function makeText({ x, y, w = 420, h = 120, text = "", font = "sans", size = 30, color = "#2b3138", align = "left" }) {
  return { id: uid("o"), type: "text", x, y, w, h, rot: 0, text, font, size, color, align, bg: "none" };
}

/* An attached document — a PDF you didn't flatten into pages, a .docx,
   anything else. It shows as a card you can tap to open with whatever
   the device uses for that type. The file itself is in the blob store,
   so it travels with the backup. */
export function makeFile({ blobId, name, mime, size, x, y }) {
  return { id: uid("o"), type: "file", blobId, name, mime, size, x, y, w: 380, h: 110, rot: 0 };
}

export const FONTS = {
  sans:  { label: "Sans",       css: "'DM Sans', system-ui, sans-serif" },
  serif: { label: "Serif",      css: "'Fraunces', Georgia, serif" },
  mono:  { label: "Mono",       css: "ui-monospace, 'SF Mono', Menlo, monospace" },
  hand:  { label: "Handwritten", css: "'Bradley Hand', 'Segoe Print', cursive" },
};

/* ---------- rendering ---------- */

/* Builds (or updates) the element for one object. `urls` maps blob ids
   to object URLs; app.js resolves those because it owns the store. */
export function renderObject(obj, el, { urls, zoom, editable = true }) {
  const fresh = !el;
  if (fresh) {
    el = document.createElement("div");
    el.className = `obj obj-${obj.type}`;
    el.dataset.id = obj.id;
  }

  el.style.left = `${obj.x * zoom}px`;
  el.style.top = `${obj.y * zoom}px`;
  el.style.width = `${obj.w * zoom}px`;
  el.style.height = `${obj.h * zoom}px`;
  el.style.transform = obj.rot ? `rotate(${obj.rot}deg)` : "";

  if (obj.type === "image") {
    let img = el.querySelector("img");
    if (!img) { img = document.createElement("img"); img.draggable = false; el.appendChild(img); }
    const url = urls.get(obj.blobId);
    if (url && img.getAttribute("src") !== url) img.src = url;
    img.alt = obj.name || "Inserted photo";
    img.style.borderRadius = `${obj.radius || 0}px`;
    el.classList.toggle("has-shadow", !!obj.shadow);
  }

  if (obj.type === "video") {
    let v = el.querySelector("video");
    if (!v) {
      v = document.createElement("video");
      v.controls = true;
      v.playsInline = true;      // without this iOS takes over the screen
      v.preload = "metadata";
      el.appendChild(v);
    }
    const url = urls.get(obj.blobId);
    if (url && v.getAttribute("src") !== url) v.src = url;
    v.style.borderRadius = `${obj.radius || 0}px`;
  }

  if (obj.type === "text") {
    let t = el.querySelector(".obj-text-body");
    if (!t) {
      t = document.createElement("div");
      t.className = "obj-text-body";
      el.appendChild(t);
    }
    t.contentEditable = editable ? "plaintext-only" : "false";
    // Safari has only supported plaintext-only since 17; where it is not
    // recognised the attribute falls back to "true", which is rich text.
    // Either behaves; this just avoids pasted markup where it can.
    if (t.contentEditable !== "plaintext-only" && editable) t.contentEditable = "true";
    t.spellcheck = true;
    if (t.textContent !== obj.text) t.textContent = obj.text;
    t.style.fontFamily = FONTS[obj.font]?.css || FONTS.sans.css;
    t.style.fontSize = `${obj.size * zoom}px`;
    t.style.lineHeight = "1.4";
    t.style.color = obj.color;
    t.style.textAlign = obj.align;
    t.dataset.placeholder = "Type…";
    el.style.background = obj.bg && obj.bg !== "none" ? obj.bg : "";
  }

  if (obj.type === "file") {
    el.innerHTML = `
      <div class="file-card">
        <div class="file-icon">${fileGlyph(obj.mime, obj.name)}</div>
        <div class="file-meta">
          <p class="file-name">${escapeHtml(obj.name)}</p>
          <p class="file-sub">${escapeHtml(fileKind(obj.mime, obj.name))} · ${formatBytes(obj.size)}</p>
        </div>
        <button class="file-open" type="button" aria-label="Open ${escapeHtml(obj.name)}">Open</button>
      </div>`;
  }

  return el;
}

function ext(name = "") {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function fileGlyph(mime = "", name = "") {
  const e = ext(name);
  if (mime.includes("pdf") || e === "pdf") return "▤";
  if (/word|document/.test(mime) || ["doc", "docx", "rtf", "odt"].includes(e)) return "▥";
  if (/presentation|powerpoint/.test(mime) || ["ppt", "pptx", "key", "odp"].includes(e)) return "▦";
  if (/sheet|excel/.test(mime) || ["xls", "xlsx", "csv", "numbers"].includes(e)) return "▧";
  if (mime.startsWith("audio/")) return "♪";
  return "▢";
}

export function fileKind(mime = "", name = "") {
  const e = ext(name);
  if (mime.includes("pdf") || e === "pdf") return "PDF";
  if (/word|document/.test(mime) || ["doc", "docx"].includes(e)) return "Word document";
  if (/presentation|powerpoint/.test(mime) || ["ppt", "pptx"].includes(e)) return "Presentation";
  if (/sheet|excel/.test(mime) || ["xls", "xlsx"].includes(e)) return "Spreadsheet";
  if (mime.startsWith("audio/")) return "Audio";
  return e ? e.toUpperCase() : "File";
}

/* ---------- geometry ---------- */

/* Objects can be rotated, so a hit test has to rotate the point back
   into the object's own frame before comparing it to the box. */
export function objectHit(obj, x, y) {
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  let px = x - cx, py = y - cy;
  if (obj.rot) {
    const a = (-obj.rot * Math.PI) / 180;
    const rx = px * Math.cos(a) - py * Math.sin(a);
    const ry = px * Math.sin(a) + py * Math.cos(a);
    px = rx; py = ry;
  }
  return Math.abs(px) <= obj.w / 2 && Math.abs(py) <= obj.h / 2;
}

/* Corner drag. `keepRatio` is on for photos and video — letting someone
   squash a face by accident is not a feature — and off for text boxes
   and file cards, where the width is the thing you want to change. */
export function resizeObject(obj, handle, dx, dy, keepRatio) {
  const out = { ...obj };
  const ratio = obj.w / obj.h;

  if (handle.includes("e")) out.w = obj.w + dx;
  if (handle.includes("s")) out.h = obj.h + dy;
  if (handle.includes("w")) { out.w = obj.w - dx; out.x = obj.x + dx; }
  if (handle.includes("n")) { out.h = obj.h - dy; out.y = obj.y + dy; }

  if (keepRatio && handle.length === 2) {
    // Corner handles keep the aspect; the driving axis is whichever the
    // pointer moved further along, so the box follows the hand.
    if (Math.abs(dx) > Math.abs(dy)) out.h = out.w / ratio;
    else out.w = out.h * ratio;
    if (handle.includes("n")) out.y = obj.y + obj.h - out.h;
    if (handle.includes("w")) out.x = obj.x + obj.w - out.w;
  }

  if (out.w < MIN_SIZE) { if (handle.includes("w")) out.x = obj.x + obj.w - MIN_SIZE; out.w = MIN_SIZE; }
  if (out.h < MIN_SIZE) { if (handle.includes("n")) out.y = obj.y + obj.h - MIN_SIZE; out.h = MIN_SIZE; }

  return out;
}

export function rotateObject(obj, x, y, snap = true) {
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
  deg = ((deg % 360) + 360) % 360;
  // Within a few degrees of square, go square. Nobody wants a photo at
  // 1.4°, and hitting 0 exactly by hand is impossible.
  if (snap) for (const s of [0, 90, 180, 270, 360]) if (Math.abs(deg - s) < 5) deg = s % 360;
  return { ...obj, rot: Math.round(deg * 10) / 10 };
}

/* Dropped photos are scaled to sit comfortably on the page rather than
   at whatever pixel size the camera produced — a 4032-wide photo pasted
   at full size would be three times the width of the sheet. */
export function fitOnPage(natW, natH, page, fraction = 0.62) {
  const maxW = page.w * fraction;
  const maxH = page.h * fraction;
  const scale = Math.min(maxW / natW, maxH / natH, 1);
  const w = Math.max(MIN_SIZE, Math.round(natW * scale));
  const h = Math.max(MIN_SIZE, Math.round(natH * scale));
  return {
    w, h,
    x: clamp(Math.round((page.w - w) / 2), 20, page.w - w - 20),
    y: clamp(Math.round((page.h - h) / 2), 20, Math.max(20, page.h - h - 20)),
  };
}
