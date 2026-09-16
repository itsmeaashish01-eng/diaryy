/* ================================================
   MARGINALIA — server/ocr.mjs
   For the PDFs that are pictures of paper.

   A scan has no text layer. `pdf.mjs` says so rather than pretending,
   and this is what fixes it — by driving whatever the machine already
   has, in order of how well it does the job:

     ocrmypdf     the right tool: reads the scan, writes a new PDF with
                  a text layer underneath the image, leaving the pages
                  looking exactly as they did.
     tesseract    with poppler's pdftoppm to make the images. Same
                  recognition engine underneath, without the tidy PDF.

   Neither is bundled, because an OCR engine is a hundred megabytes and
   most PDFs do not need one. If neither is installed the app says which
   single command would install it, on this platform, and carries on
   being useful for everything else.
   ================================================ */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { extractPdf } from "./pdf.mjs";

const which = (cmd) => {
  if (!cmd) return null;
  if (cmd.includes("/") || cmd.includes("\\")) return existsSync(cmd) ? cmd : null;
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  const first = (probe.stdout || "").trim().split("\n")[0];
  return probe.status === 0 && first ? first : null;
};

export function capabilities() {
  const ocrmypdf = which(process.env.MARGINALIA_OCRMYPDF || "ocrmypdf");
  const tesseract = which(process.env.MARGINALIA_TESSERACT || "tesseract");
  const pdftoppm = which(process.env.MARGINALIA_PDFTOPPM || "pdftoppm");
  const engine = ocrmypdf ? "ocrmypdf" : tesseract && pdftoppm ? "tesseract" : null;
  return {
    ocrmypdf, tesseract, pdftoppm, engine,
    languages: tesseract ? languages(tesseract) : [],
    available: Boolean(engine),
    install: installHint(),
  };
}

function languages(tesseract) {
  const probe = spawnSync(tesseract, ["--list-langs"], { encoding: "utf8", timeout: 15000 });
  return ((probe.stdout || "") + (probe.stderr || ""))
    .split("\n").slice(1).map((s) => s.trim())
    .filter((s) => /^[a-z_]{3,}$/i.test(s));
}

const installHint = () =>
  process.platform === "darwin" ? "brew install ocrmypdf"
  : process.platform === "win32" ? "winget install ocrmypdf  (or: pip install ocrmypdf)"
  : "sudo apt install ocrmypdf   —   or: pip install ocrmypdf";

function run(cmd, args, { onLine, timeout = 1800000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${cmd} took too long`)); }, timeout);
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => {
      const text = d.toString();
      err += text;
      if (onLine) for (const line of text.split("\n")) if (line.trim()) onLine(line.trim());
    });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      /* ocrmypdf uses 2 for "already has text" and other soft refusals;
         those are handled by the caller, not treated as a crash. */
      if (code === 0) resolve({ out, err, code });
      else reject(Object.assign(new Error(`${cmd} exited ${code}: ${err.trim().split("\n").slice(-3).join(" ").slice(0, 400)}`), { code }));
    });
  });
}

/*
   ocr(pdfBuffer, { language, onProgress }) -> { pages, engine, pdf }

   `pages` is the same shape pdf.mjs produces, so the caller can drop it
   straight into the store. `pdf` is the searchable PDF when ocrmypdf
   made one — worth keeping, because it is strictly better than the file
   that came in.
*/
export async function ocr(pdfBuffer, { language = "eng", onProgress = () => {}, signal } = {}) {
  const caps = capabilities();
  if (!caps.available) {
    const e = new Error(
      `no OCR engine on this machine. Install one — ${caps.install} — and this button will work. ` +
      `Or run it yourself: ocrmypdf in.pdf out.pdf, then add out.pdf.`
    );
    e.status = 400;
    e.install = caps.install;
    throw e;
  }

  const dir = mkdtempSync(join(tmpdir(), "marginalia-ocr-"));
  const input = join(dir, "in.pdf");
  writeFileSync(input, pdfBuffer);

  try {
    if (caps.engine === "ocrmypdf") {
      const output = join(dir, "out.pdf");
      onProgress({ step: "starting", engine: "ocrmypdf" });
      try {
        await run(caps.ocrmypdf, [
          "--skip-text",            // leave pages that already have text alone
          "--output-type", "pdf",
          "--language", language,
          "--quiet",
          input, output,
        ], { onLine: (line) => onProgress({ step: "ocr", line }), signal });
      } catch (e) {
        /* Exit 6 means every page already had text: not a failure, just
           nothing to do. */
        if (e.code !== 6) throw e;
      }
      const buffer = existsSync(output) ? readFileSync(output) : pdfBuffer;
      const extracted = extractPdf(buffer);
      onProgress({ step: "done", pages: extracted.pages.length });
      return { pages: extracted.pages, engine: "ocrmypdf", pdf: buffer, warnings: extracted.warnings };
    }

    /* The two-step path: render each page, then recognise it. */
    onProgress({ step: "rendering", engine: "tesseract" });
    await run(caps.pdftoppm, ["-r", "300", "-png", input, join(dir, "page")], { signal });
    const images = readdirSync(dir).filter((f) => /^page-?\d+\.png$/i.test(f)).sort();
    if (!images.length) throw new Error("pdftoppm produced no pages — is this really a PDF?");

    const pages = [];
    for (let i = 0; i < images.length; i++) {
      const { out } = await run(caps.tesseract, [join(dir, images[i]), "stdout", "-l", language], { signal });
      pages.push({ number: i + 1, text: out.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim() });
      onProgress({ step: "ocr", done: i + 1, total: images.length });
    }
    onProgress({ step: "done", pages: pages.length });
    return { pages, engine: "tesseract", pdf: null, warnings: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* Was this worth doing? A scan that comes back with a handful of
   characters per page has been photographed badly, or is in a language
   the engine doesn't have — either way the person should be told rather
   than left with a notebook full of noise. */
export function assess(pages) {
  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  const perPage = pages.length ? chars / pages.length : 0;
  if (perPage < 50) {
    return {
      ok: false,
      note: "OCR found almost nothing. The scan may be too low-resolution, or in a language the engine has no data for " +
            "(tesseract needs its language pack: apt install tesseract-ocr-deu, and so on).",
    };
  }
  if (perPage < 400) {
    return { ok: true, note: `OCR recovered about ${Math.round(perPage)} characters a page, which is thin — check a page or two before trusting it.` };
  }
  return { ok: true, note: `OCR recovered about ${Math.round(perPage)} characters a page.` };
}
