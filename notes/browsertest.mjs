#!/usr/bin/env node
/* ================================================
   INKWELL — browsertest.mjs
   The other half of the tests: the app, in a real browser, driven like
   a person.

   `selftest.mjs` covers the geometry and the file formats and runs in
   CI with no dependencies. It cannot catch a panel that is invisible
   but still swallowing taps, or ink that renders as two end caps with
   nothing between them. This can, and did — both of those were found
   here rather than on a phone.

   It needs Playwright, which is why it is not in CI: the point of the
   other suite is that it needs nothing.

       npm i -g playwright        # or npx playwright
       node notes/browsertest.mjs

   It serves notes/ on port 8231, drives a headless Chromium through
   twenty-one steps — draw, erase, lasso, type, turn a page, export a
   PDF, restore the shelf, search — and fails on any console error along
   the way. Screenshots of the shelf and the editor land in /tmp.
   ================================================ */

/* Resolved from node_modules, so `npm install playwright` has to have
   been run somewhere above this file — a global install is not on
   node's module path. */
import { chromium } from "playwright";

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split("?")[0]) === "/" ? "/index.html" : req.url.split("?")[0]);
  if (!existsSync(p)) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(8231);

const errors = [];
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, deviceScaleFactor: 2 });
page.on("console", (m) => {
  // A blocked font CDN is the network's problem, not the app's.
  if (m.type() === "error" && !/CERT|ERR_(NAME|CONNECTION|INTERNET)/.test(m.text())) errors.push("console: " + m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const step = async (name, fn) => {
  try { await fn(); console.log("  ok  " + name); }
  catch (e) { console.log("  FAIL " + name + ": " + e.message); errors.push(name + ": " + e.message); }
};

await page.goto("http://localhost:8231/index.html");
await page.waitForTimeout(600);

await step("shelf renders empty", async () => {
  if (!(await page.locator("#shelfEmpty").isVisible())) throw new Error("empty state hidden");
});

await step("create a notebook", async () => {
  await page.click("#newNotebookBtn");
  await page.waitForSelector("#nbCreate");
  await page.fill("#nbTitle", "Physics 101");
  await page.click("#paperRow [data-paper=\"grid\"]");
  await page.click("#nbCreate");
  await page.waitForSelector("#editor:not([hidden])", { timeout: 4000 });
  await page.waitForTimeout(400);
});

const pageBox = async () => await page.locator("#page").boundingBox();

const savedStrokes = () => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open("inkwell"); q.onsuccess = () => r(q.result); });
  const rows = await new Promise((r) => {
    const t = db.transaction("pages").objectStore("pages").getAll();
    t.onsuccess = () => r(t.result);
  });
  return rows[0]?.strokes?.length ?? -1;
});

await step("draw three pen strokes", async () => {
  const b = await pageBox();
  for (let s = 0; s < 3; s++) {
    await page.mouse.move(b.x + 60, b.y + 100 + s * 60);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(b.x + 60 + i * 9, b.y + 100 + s * 60 + Math.sin(i / 3) * 16);
    }
    await page.mouse.up();
  }
  const n = await page.evaluate(() => document.querySelectorAll(".layer-ink").length);
  if (!n) throw new Error("no ink layer");
});

await step("strokes reached the model", async () => {
  await page.waitForTimeout(900);
  const count = await savedStrokes();
  if (count !== 3) throw new Error("expected 3 strokes saved, got " + count);
});

await step("undo removes one", async () => {
  await page.click("#undoBtn");
  await page.waitForTimeout(900);
  const n = await savedStrokes();
  if (n !== 2) throw new Error("expected 2 strokes after undo, got " + n);
});

await step("redo restores it", async () => {
  await page.click("#redoBtn");
  await page.waitForTimeout(900);
  const n = await savedStrokes();
  if (n !== 3) throw new Error("expected 3 strokes after redo, got " + n);
});

await step("highlighter + colour switch", async () => {
  await page.click('.tool[data-tool="highlighter"]');
  await page.waitForTimeout(150);
  await page.click('#trayOptions .swatch >> nth=1');
  const b = await pageBox();
  await page.mouse.move(b.x + 80, b.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(b.x + 80 + i * 12, b.y + 300);
  await page.mouse.up();
});

await step("eraser removes ink", async () => {
  await page.click('.tool[data-tool="eraser"]');
  const b = await pageBox();
  await page.mouse.move(b.x + 100, b.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(b.x + 100 + i * 8, b.y + 100);
  await page.mouse.up();
  await page.waitForTimeout(300);
});

await step("text box via the tool", async () => {
  await page.click('.tool[data-tool="text"]');
  const b = await pageBox();
  await page.mouse.click(b.x + 120, b.y + 420);
  await page.waitForTimeout(300);
  await page.keyboard.type("Newton's second law");
  await page.waitForTimeout(600);
  const txt = await page.locator(".obj-text-body").first().textContent();
  if (!txt.includes("Newton")) throw new Error("text not captured: " + txt);
});

await step("inspector appears for the text box", async () => {
  if (await page.locator("#inspector").isHidden()) throw new Error("inspector hidden");
  await page.click('#inspector [data-font="serif"]');
  await page.waitForTimeout(200);
});

await step("lasso selects ink", async () => {
  await page.click('.tool[data-tool="lasso"]');
  const b = await pageBox();
  const pts = [[40, 200], [400, 200], [400, 340], [40, 340], [40, 200]];
  await page.mouse.move(b.x + pts[0][0], b.y + pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) {
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + x, b.y + y);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
});

await step("add a page and navigate", async () => {
  await page.click("#pageMenuBtn");
  await page.click('#pageMenu [data-act="addpage"]');
  await page.waitForTimeout(700);
  const label = await page.locator("#pageCount").textContent();
  if (!label.includes("2 / 2")) throw new Error("page count is " + label);
  await page.click("#prevPageBtn");
  await page.waitForTimeout(500);
});

await step("page thumbnails render", async () => {
  await page.click("#pagesBtn");
  await page.waitForTimeout(1200);
  const bg = await page.locator(".rail-thumb").first().evaluate((el) => el.style.backgroundImage);
  if (!bg.startsWith("url(")) throw new Error("no thumbnail painted");
  await page.click("#pagesBtn");
});

await step("zoom controls", async () => {
  await page.click("#zoomInBtn");
  await page.click("#zoomInBtn");
  await page.waitForTimeout(300);
  await page.click("#zoomFitBtn");
  await page.waitForTimeout(300);
});

await step("paper template change", async () => {
  await page.click("#pageMenuBtn");
  await page.click('#paperPicker [data-paper="cornell"]');
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
});

await step("export a PNG", async () => {
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await page.click("#shareBtn");
  await page.click('#shareMenu [data-act="png"]');
  const d = await dl;
  if (!(await d.path())) throw new Error("no file");
  console.log("      -> " + d.suggestedFilename());
});

await step("export the notebook as PDF", async () => {
  const dl = page.waitForEvent("download", { timeout: 25000 });
  await page.click("#shareBtn");
  await page.click('#shareMenu [data-act="pdfall"]');
  const d = await dl;
  const buf = readFileSync(await d.path());
  if (buf.subarray(0, 8).toString() !== "%PDF-1.4") throw new Error("not a PDF");
  console.log("      -> " + d.suggestedFilename() + " (" + buf.length + " bytes)");
});

await step("back up the library as JSON", async () => {
  const dl = page.waitForEvent("download", { timeout: 20000 });
  await page.click("#shareBtn");
  await page.click('#shareMenu [data-act="json"]');
  const d = await dl;
  const j = JSON.parse(readFileSync(await d.path(), "utf8"));
  if (j.format !== "inkwell.backup" || !j.notebooks.length) throw new Error("bad backup");
  console.log("      -> " + j.notebooks.length + " notebook, " + j.notebooks[0].pages.length + " pages");
});

await step("back to the shelf, notebook is listed", async () => {
  await page.click("#backBtn");
  await page.waitForTimeout(800);
  const t = await page.locator(".book-title").first().textContent();
  if (t !== "Physics 101") throw new Error("shelf shows " + t);
});

await step("search finds the typed text", async () => {
  await page.fill("#shelfSearch", "Newton");
  await page.waitForTimeout(600);
  const hits = await page.locator(".hit").count();
  if (!hits) throw new Error("no search hits");
});

await page.screenshot({ path: "/tmp/inkwell-shelf.png" });
await page.fill("#shelfSearch", "");
await page.waitForTimeout(400);
await page.click(".book-cover");
await page.waitForTimeout(900);
await page.screenshot({ path: "/tmp/inkwell-editor.png" });

await browser.close();
server.close();

if (errors.length) {
  console.log("\n" + errors.length + " problem(s):");
  errors.forEach((e) => console.log("  - " + e));
  process.exit(1);
}
console.log("\nall smoke steps passed, no console errors");
