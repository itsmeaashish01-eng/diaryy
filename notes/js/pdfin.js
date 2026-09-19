/* ================================================
   INKWELL — pdfin.js
   Bringing a PDF in as pages you can write on.

   Each PDF page is rendered once, at the notebook's own resolution, and
   stored as a JPEG behind a normal Inkwell page. From then on it is a
   page like any other: pen, highlighter, text boxes, photos, all of it,
   and the annotations live in the notebook rather than in the file.

   The honest limitation: the imported page is an image. You can write
   over a paragraph, circle it, cross it out — you cannot retype it and
   have the rest reflow, because at that point the app would need to be
   a word processor that understands PDF's text model. Filling in a form
   by hand works; editing the form's own text does not.

   pdf.js does the rendering. It is the only third-party code in the app
   and it is loaded lazily, so the 300 KB is only fetched by someone who
   actually imports a PDF. The iOS build bundles it instead — see
   ios-app/scripts/build.mjs.
   ================================================ */

import { newPage, PAGE_SIZES } from "./paper.js";
import * as store from "./store.js";

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
const LOCAL = "vendor/pdfjs";

let libPromise = null;

/* Prefer the bundled copy when there is one. Inside the iOS shell there
   is no network at all, and a CDN fetch there would fail silently and
   leave the import spinning. */
async function loadPdfJs() {
  if (libPromise) return libPromise;
  libPromise = (async () => {
    if (globalThis.pdfjsLib) return globalThis.pdfjsLib;

    const bundled = await fetch(`${LOCAL}/pdf.min.js`, { method: "HEAD" })
      .then((r) => r.ok).catch(() => false);
    const base = bundled ? LOCAL : CDN;

    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${base}/pdf.min.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error(
        bundled ? "The bundled PDF engine failed to load."
                : "Couldn't load the PDF engine — this part needs a connection the first time."
      ));
      document.head.appendChild(s);
    });

    const lib = globalThis.pdfjsLib;
    // pdf.js parses on a worker; without this it falls back to the main
    // thread and a long document locks the interface while it renders.
    lib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.js`;
    return lib;
  })();
  return libPromise;
}

/* Returns the pages, ready to be saved. Rendering happens one page at a
   time and each canvas is released before the next: a 200-page document
   at this resolution is comfortably more pixels than a phone will hold
   at once. */
export async function importPDF(file, notebookId, startIndex = 0, { onProgress, maxPages = 400 } = {}) {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, disableAutoFetch: true, disableStream: true }).promise;

  const numPages = doc.numPages;
  const total = Math.min(numPages, maxPages);
  const pages = [];

  for (let n = 1; n <= total; n++) {
    const src = await doc.getPage(n);
    const base = src.getViewport({ scale: 1 });

    // Match the notebook's page width and let the height follow the
    // document's own aspect, so a landscape page in a portrait PDF
    // stays landscape instead of being squashed into A4.
    const target = base.width > base.height ? PAGE_SIZES.a4land : PAGE_SIZES.a4;
    const scale = target.w / base.width;
    const viewport = src.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await src.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    const blobId = await store.putBlob(blob, { name: `${file.name} p${n}` });

    const page = newPage(notebookId, startIndex + n - 1, { paper: "plain", size: target.id });
    page.w = canvas.width;
    page.h = canvas.height;
    page.background = { blobId, source: file.name, sourcePage: n };
    pages.push(page);

    canvas.width = canvas.height = 0;    // let the bitmap go now, not at GC
    src.cleanup();
    onProgress?.(n, total);
  }

  await doc.destroy();
  return { pages, truncated: numPages > total, total: numPages };
}
