/* ================================================
   INKWELL — export.js
   Getting a page back out: as a picture, as a PDF, as a backup.

   The screen draws a page across three canvases and a layer of DOM
   elements. Export has to put all of that onto one canvas, in the right
   order, at whatever resolution was asked for. That means drawing the
   text boxes a second way — with fillText and a word wrapper rather
   than by letting the browser lay them out — which is the price of
   having them be real editable elements the rest of the time.

   Always exported light. A page with a dark background is for reading
   at night, not for printing or for sending to someone.
   ================================================ */

import { drawStroke } from "./canvas.js";
import { drawPaper } from "./paper.js";
import { FONTS, fileGlyph, fileKind } from "./objects.js";
import { buildPDF, pageToPoints } from "./pdfout.js";
import { formatBytes, escapeHtml } from "./util.js";
import * as store from "./store.js";

/* One page, flattened. `scale` multiplies the page's own units: 1 is
   150 dpi, 2 is 300. */
export async function renderPage(page, { scale = 1, thumb = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(page.w * scale);
  canvas.height = Math.round(page.h * scale);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, page.w, page.h);

  if (page.background?.blobId) {
    const img = await loadImage(await store.blobURL(page.background.blobId));
    if (img) ctx.drawImage(img, 0, 0, page.w, page.h);
  }

  drawPaper(ctx, { paper: page.paper, w: page.w, h: page.h, ink: "#d8e0e6", accent: "#eec7bf" });

  const objects = page.objects || [];
  // Same order as the live page: media under the ink, text over it.
  for (const o of objects.filter((o) => o.type === "image" || o.type === "video")) {
    await drawMedia(ctx, o, thumb);
  }

  for (const s of page.strokes || []) drawStroke(ctx, s);

  for (const o of objects.filter((o) => o.type === "text" || o.type === "file")) {
    if (o.type === "text") drawText(ctx, o);
    else drawFileCard(ctx, o);
  }

  return canvas;
}

function withRotation(ctx, o, body) {
  ctx.save();
  if (o.rot) {
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate((o.rot * Math.PI) / 180);
    ctx.translate(-(o.x + o.w / 2), -(o.y + o.h / 2));
  }
  body();
  ctx.restore();
}

async function drawMedia(ctx, o, thumb) {
  const url = await store.blobURL(o.blobId);
  if (!url) return;

  let img = null;
  if (o.type === "image") img = await loadImage(url);
  // A video has no single right frame, so the first one stands in. In a
  // thumbnail it isn't worth the seek.
  else if (!thumb) img = await loadVideoFrame(url);

  withRotation(ctx, o, () => {
    if (img) {
      roundedClip(ctx, o, o.radius || 0);
      // `cover`, matching object-fit on screen: fill the box, crop the
      // overflow, never distort.
      const s = Math.max(o.w / img.width, o.h / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, o.x + (o.w - dw) / 2, o.y + (o.h - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = "#e6e2da";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = "#8b8578";
      ctx.font = `${Math.min(o.w, o.h) * 0.3}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", o.x + o.w / 2, o.y + o.h / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    if (o.type === "video") {
      // A still frame in a PDF should still read as "this was a video".
      ctx.fillStyle = "rgba(20,22,25,.55)";
      ctx.beginPath();
      ctx.arc(o.x + o.w / 2, o.y + o.h / 2, Math.min(o.w, o.h) * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.min(o.w, o.h) * 0.13}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", o.x + o.w / 2 + Math.min(o.w, o.h) * 0.015, o.y + o.h / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  });
}

function roundedClip(ctx, o, r) {
  ctx.save();
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) ctx.roundRect(o.x, o.y, o.w, o.h, r);
  else ctx.rect(o.x, o.y, o.w, o.h);
  ctx.clip();
}

/* The word wrapper. contenteditable does this for us on screen; here it
   has to be done by hand, and the two will not agree to the pixel. They
   agree closely enough that a paragraph breaks in the same places. */
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    if (!para) { lines.push(""); continue; }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (ctx.measureText(next).width > maxWidth && line.trim()) {
        lines.push(line.replace(/\s+$/, ""));
        line = word.replace(/^\s+/, "");
      } else {
        line = next;
      }
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines;
}

function drawText(ctx, o) {
  if (!o.text?.trim()) return;
  withRotation(ctx, o, () => {
    if (o.bg && o.bg !== "none") {
      ctx.fillStyle = o.bg;
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
    const pad = 8;
    ctx.font = `${o.size}px ${FONTS[o.font]?.css || FONTS.sans.css}`;
    ctx.fillStyle = o.color;
    ctx.textBaseline = "top";
    ctx.textAlign = o.align === "center" ? "center" : o.align === "right" ? "right" : "left";

    const lines = wrapText(ctx, o.text, o.w - pad * 2);
    const lh = o.size * 1.4;
    const x = o.align === "center" ? o.x + o.w / 2 : o.align === "right" ? o.x + o.w - pad : o.x + pad;
    lines.forEach((line, i) => ctx.fillText(line, x, o.y + pad + i * lh));

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });
}

function drawFileCard(ctx, o) {
  withRotation(ctx, o, () => {
    ctx.fillStyle = "#f2efe8";
    ctx.strokeStyle = "#d9d3c7";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(o.x, o.y, o.w, o.h, 10); else ctx.rect(o.x, o.y, o.w, o.h);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#6c6558";
    ctx.font = "44px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(fileGlyph(o.mime, o.name), o.x + 22, o.y + o.h / 2);

    ctx.fillStyle = "#2b3138";
    ctx.font = "26px system-ui, sans-serif";
    const [name] = wrapText(ctx, o.name, o.w - 110);
    ctx.fillText(name, o.x + 84, o.y + o.h / 2 - 15);

    ctx.fillStyle = "#8a8377";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText(`${fileKind(o.mime, o.name)} · ${formatBytes(o.size)}`, o.x + 84, o.y + o.h / 2 + 18);
    ctx.textBaseline = "alphabetic";
  });
}

/* ---------- loaders ---------- */

export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* Seek a hair past zero: at exactly 0 some encoders have not produced a
   frame yet and the canvas comes out blank. Bail after three seconds —
   a missing poster frame is not worth hanging an export over. */
export function loadVideoFrame(url, at = 0.12) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; v.src = ""; resolve(value); } };
    const timer = setTimeout(() => done(null), 3000);

    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => { try { v.currentTime = at; } catch { done(null); } };
    v.onseeked = () => {
      clearTimeout(timer);
      const c = document.createElement("canvas");
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 360;
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      done(c);
    };
    v.onerror = () => { clearTimeout(timer); done(null); };
    v.src = url;
  });
}

/* ---------- the exports themselves ---------- */

export async function pageToPNG(page, scale = 2) {
  const canvas = await renderPage(page, { scale });
  return new Promise((r) => canvas.toBlob(r, "image/png"));
}

export async function pagesToPDF(pages, { title, scale = 1.35, quality = 0.86, onProgress } = {}) {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const canvas = await renderPage(page, { scale });
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    const { width, height } = pageToPoints(page);
    out.push({
      jpeg: new Uint8Array(await blob.arrayBuffer()),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      width, height,
    });
    onProgress?.(i + 1, pages.length);
  }
  return new Blob([buildPDF(out, { title })], { type: "application/pdf" });
}

/* The lossless one. Blobs go in as base64 because JSON has no way to
   carry bytes — which roughly a third inflates the file, and is still
   the right trade for the only format that restores a notebook as
   notebooks rather than as pictures. */
export async function backupJSON({ onProgress } = {}) {
  const notebooks = await store.listNotebooks();
  const out = { format: "inkwell.backup", version: 1, exportedAt: Date.now(), notebooks: [], blobs: {} };
  const wanted = new Set();

  for (const nb of notebooks) {
    const pages = await store.pagesOf(nb.id);
    out.notebooks.push({ ...nb, pages });
    for (const p of pages) for (const id of store.blobsReferencedBy(p)) wanted.add(id);
  }

  let n = 0;
  for (const id of wanted) {
    const rec = await store.get("blobs", id);
    if (!rec) continue;
    out.blobs[id] = { name: rec.name, type: rec.type, data: await blobToBase64(rec.blob) };
    onProgress?.(++n, wanted.size);
  }

  return new Blob([JSON.stringify(out)], { type: "application/json" });
}

export async function restoreJSON(file, { merge = true } = {}) {
  const data = JSON.parse(await file.text());
  if (data.format !== "inkwell.backup") throw new Error("That isn't an Inkwell backup file.");

  if (!merge) {
    for (const nb of await store.listNotebooks()) await store.deleteNotebook(nb.id);
  }

  // Blobs first: a page that references one that hasn't landed yet
  // would render as a grey box until the next reload.
  for (const [id, b] of Object.entries(data.blobs || {})) {
    await store.put("blobs", {
      id, name: b.name, type: b.type,
      blob: base64ToBlob(b.data, b.type),
      size: 0, addedAt: Date.now(),
    });
  }

  let count = 0;
  for (const nb of data.notebooks || []) {
    const { pages, ...book } = nb;
    await store.put("notebooks", book);
    for (const p of pages || []) await store.put("pages", p);
    count++;
  }
  return count;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const safeName = (s) => escapeHtml(s).replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "notes";
