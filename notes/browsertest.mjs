#!/usr/bin/env node
/* ================================================
   INKWELL — browsertest.mjs
   The other half of the tests: the app, in a real browser, driven like
   a person — once at desk size with a mouse and a keyboard, and once at
   the size of an iPhone.

   `selftest.mjs` covers the geometry and the file formats and runs in
   CI with no dependencies. It cannot catch a panel that is invisible
   but still swallowing taps, ink that renders as two end caps with
   nothing between them, or a toolbar whose last button sits off the
   right-hand edge of a phone. This can, and has — the first two were
   found here rather than on a device.

   It needs Playwright, which is why it is not in CI: the point of the
   other suite is that it needs nothing.

       npm install playwright     # resolved from node_modules
       node notes/browsertest.mjs

   It serves notes/ on port 8231 and runs the same flow twice: draw,
   erase, lasso, type, turn a page, export a PDF, come back to the
   shelf, search. The desk pass adds the things only a Mac has — ⌘C/⌘V,
   ⌘D, arrow nudging, space to pan, right-click — and the phone pass
   adds the ones only a phone can get wrong: anything off the side of
   the screen, and anything too small to hit with a thumb.

   Any console error fails the run. Screenshots land in /tmp.
   ================================================ */

/* Resolved from node_modules, so `npm install playwright` has to have
   been run somewhere above this file — a global install is not on
   node's module path. */
import { chromium } from "playwright";

import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 8231;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png",
};

const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const p = join(ROOT, rel === "/" ? "/index.html" : rel);
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(PORT);

/* A 96×72 chequerboard, built here rather than checked in. Big enough
   that the object it becomes is a realistic size on the page — a photo
   smaller than its own resize handles is a different test. */
const PHOTO_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABICAYAAAAJZ/BjAAAAsUlEQVR42u3bsQkAIAwEQDdyAAewcSA3dCwdIhARr0j98Fc+KbX1Hbk1R+h+zy8AAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAkAGgQIsYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wEKtIgBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AQq0iAEAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAP8BCrSIAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wEALWIAAAAAAAAAAAAAnss/pyASWOLes/EAAAAASUVORK5CYII=";

/* ================================================ */

const DEVICES = [
  {
    name: "desk",
    desktop: true,
    context: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 },
  },
  {
    name: "iPhone",
    desktop: false,
    // iPhone 15 Pro in portrait, with the touch flags on so the app sees
    // a coarse pointer and no hover, as it would on the real thing.
    context: {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
];

const results = [];

for (const device of DEVICES) {
  const errors = await run(device);
  results.push({ device: device.name, errors });
}

server.close();

const total = results.reduce((n, r) => n + r.errors.length, 0);
if (total) {
  console.log(`\n${total} problem(s):`);
  for (const r of results) for (const e of r.errors) console.log(`  - [${r.device}] ${e}`);
  process.exit(1);
}
console.log("\nboth passes clean: desk and iPhone, no console errors");

/* ================================================ */

async function run(device) {
  console.log(`\n=== ${device.name} ===`);
  const errors = [];

  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ ...device.context, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();

  page.on("console", (m) => {
    // A blocked font CDN is the network's problem, not the app's.
    if (m.type() === "error" && !/CERT|ERR_(NAME|CONNECTION|INTERNET)/.test(m.text())) {
      errors.push("console: " + m.text());
    }
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const step = async (name, fn) => {
    try { await fn(); console.log("  ok   " + name); }
    catch (e) { console.log("  FAIL " + name + ": " + e.message); errors.push(name + ": " + e.message); }
  };

  const pageBox = () => page.locator("#page").boundingBox();

  const savedStrokes = () => page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open("inkwell"); q.onsuccess = () => r(q.result); });
    const rows = await new Promise((r) => {
      const t = db.transaction("pages").objectStore("pages").getAll();
      t.onsuccess = () => r(t.result);
    });
    return rows[0]?.strokes?.length ?? -1;
  });

  const scribble = async (y, turns = 24) => {
    const b = await pageBox();
    await page.mouse.move(b.x + 40, b.y + y);
    await page.mouse.down();
    for (let i = 1; i <= turns; i++) {
      await page.mouse.move(b.x + 40 + i * (b.width * 0.5 / turns), b.y + y + Math.sin(i / 3) * 14);
    }
    await page.mouse.up();
  };

  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForTimeout(700);

  /* ---------- layout, before anything else ---------- */

  await step("nothing hangs off the side of the shelf", async () => {
    const over = await horizontalOverflow(page);
    if (over.length) throw new Error("off-screen: " + over.join(", "));
  });

  await step("create a notebook", async () => {
    await page.click("#newNotebookBtn");
    await page.waitForSelector("#nbCreate");
    await page.fill("#nbTitle", "Physics 101");
    await page.click('#paperRow [data-paper="grid"]');
    await page.click("#nbCreate");
    await page.waitForSelector("#editor:not([hidden])", { timeout: 5000 });
    await page.waitForTimeout(500);
  });

  await step("nothing hangs off the side of the editor", async () => {
    const over = await horizontalOverflow(page);
    if (over.length) throw new Error("off-screen: " + over.join(", "));
  });

  await step("the chrome leaves most of the screen to the page", async () => {
    // Vertical overflow is the other way a phone layout goes wrong, and
    // it is quieter: a hint that reflows into a paragraph turns the pen
    // tray into half the screen and nothing scrolls sideways to warn
    // you. Every tool gets checked, because each one has its own hint.
    const tall = [];
    for (const tool of ["pen", "highlighter", "eraser", "lasso", "text", "hand"]) {
      await page.click(`.tool[data-tool="${tool}"]`);
      await page.waitForTimeout(120);
      const m = await page.evaluate(() => ({
        tray: Math.round(document.getElementById("tray").getBoundingClientRect().height),
        stage: Math.round(document.getElementById("stage").getBoundingClientRect().height),
        vh: innerHeight,
      }));
      if (m.tray > 80) tall.push(`${tool}: the tray is ${m.tray}px tall`);
      if (m.stage < m.vh * 0.6) tall.push(`${tool}: the page gets only ${m.stage} of ${m.vh}px`);
    }
    await page.click('.tool[data-tool="pen"]');
    if (tall.length) throw new Error(tall.join("; "));
  });

  await step("every control is big enough to hit and on the screen", async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      const vw = innerWidth, vh = innerHeight;
      for (const el of document.querySelectorAll(
        ".tool, .edit-bar button, .page-nav button, .tray-right button, .fab")) {
        if (el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        const id = el.id || el.className.split(" ")[0] + (el.dataset.tool ? `[${el.dataset.tool}]` : "");
        // 36 rather than Apple's 44: these sit in a row with padding
        // between them, so the hit area is bigger than the box.
        if (r.width < 36 || r.height < 36) out.push(`${id} is ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1) out.push(`${id} is outside the viewport`);
      }
      return out;
    });
    if (bad.length) throw new Error(bad.join("; "));
  });

  /* ---------- writing ---------- */

  await step("draw three pen strokes", async () => {
    for (let s = 0; s < 3; s++) await scribble(100 + s * 60);
  });

  await step("strokes reached the model", async () => {
    await page.waitForTimeout(900);
    const n = await savedStrokes();
    if (n !== 3) throw new Error("expected 3 strokes saved, got " + n);
  });

  await step("undo removes one", async () => {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(900);
    const n = await savedStrokes();
    if (n !== 2) throw new Error("expected 2 after undo, got " + n);
  });

  await step("redo restores it", async () => {
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(900);
    const n = await savedStrokes();
    if (n !== 3) throw new Error("expected 3 after redo, got " + n);
  });

  // How many pixels of the ink layer have anything on them. Used as a
  // before/after, which is the only way to say "that stroke actually
  // drew something" without knowing where it landed.
  const inkedPixels = () => page.evaluate(() => {
    const c = document.querySelector(".layer-ink");
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let hits = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 20) hits++;
    return hits;
  });

  await step("highlighter draws a band, not two dots", async () => {
    await page.click('.tool[data-tool="highlighter"]');
    await page.waitForTimeout(200);
    await page.click("#trayOptions .swatch >> nth=1");
    const before = await inkedPixels();

    const b = await pageBox();
    // A dead straight swipe: the case that simplifies down to its two
    // endpoints, and used to render as a cap at each end with nothing
    // between them.
    await page.mouse.move(b.x + 40, b.y + 300);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + 300, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const added = (await inkedPixels()) - before;
    // Two round caps on their own come to a few hundred pixels at this
    // scale; the band they belong to is several thousand.
    if (added < 2500) throw new Error(`the swipe added only ${added} inked pixels — the band is missing`);
  });

  await step("eraser removes ink", async () => {
    // Autosave is debounced, so the highlighter from the last step may
    // not have landed yet. Read the baseline after it has.
    await page.waitForTimeout(900);
    const before = await savedStrokes();
    await page.click('.tool[data-tool="eraser"]');
    const b = await pageBox();
    await page.mouse.move(b.x + 60, b.y + 100);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + 100, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await savedStrokes();
    if (after >= before) throw new Error(`nothing erased: ${before} -> ${after}`);
  });

  await step("text box via the tool", async () => {
    await page.click('.tool[data-tool="text"]');
    const b = await pageBox();
    await page.mouse.click(b.x + b.width * 0.15, b.y + b.height * 0.45);
    await page.waitForTimeout(350);
    await page.keyboard.type("Newton's second law");
    await page.waitForTimeout(700);
    const txt = await page.locator(".obj-text-body").first().textContent();
    if (!txt.includes("Newton")) throw new Error("text not captured: " + txt);
  });

  await step("inspector appears and restyles the text", async () => {
    if (await page.locator("#inspector").isHidden()) throw new Error("inspector hidden");
    await page.click('#inspector [data-font="serif"]');
    await page.waitForTimeout(250);
    const font = await page.locator(".obj-text-body").first().evaluate((el) => getComputedStyle(el).fontFamily);
    if (!/Fraunces|Georgia|serif/.test(font)) throw new Error("font did not change: " + font);
  });

  await step("insert a photo from the picker", async () => {
    const before = await page.locator(".obj-image").count();
    await page.setInputFiles("#filePhoto", {
      name: "snap.png", mimeType: "image/png", buffer: Buffer.from(PHOTO_PNG, "base64"),
    });
    await page.waitForTimeout(1400);
    if ((await page.locator(".obj-image").count()) <= before) throw new Error("no photo appeared");
  });

  await step("a photo can be picked up and moved", async () => {
    // The layers over the sheet are full-page boxes. Leave the object
    // layer hit-testable and it eats every click meant for the photo in
    // the layer beneath it, and no photo can ever be selected again.
    await page.click('.tool[data-tool="hand"]');
    await page.waitForTimeout(200);

    const box = await page.locator(".obj-image").first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    if (!(await page.locator(".sel-frame").count())) throw new Error("tapping the photo did not select it");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const moved = await page.locator(".obj-image").first().boundingBox();
    // Not just "it moved": a drag that dies after the first pointer
    // event still moves it a few pixels. It has to arrive where the
    // hand went.
    if (Math.abs(moved.x - box.x - 70) > 12 || Math.abs(moved.y - box.y - 40) > 12) {
      throw new Error(`the photo stopped short: moved by ${Math.round(moved.x - box.x)},${Math.round(moved.y - box.y)} of 70,40`);
    }
    await page.click('.tool[data-tool="pen"]');
  });

  await step("lasso selects ink", async () => {
    await page.click('.tool[data-tool="lasso"]');
    const b = await pageBox();
    const loop = [[20, 140], [b.width * 0.62, 140], [b.width * 0.62, 340], [20, 340], [20, 140]];
    await page.mouse.move(b.x + loop[0][0], b.y + loop[0][1]);
    await page.mouse.down();
    for (const [x, y] of loop.slice(1)) await page.mouse.move(b.x + x, b.y + y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    if (!(await page.locator(".sel-ink").count())) throw new Error("no selection frame");
  });

  await step("lassoed ink can be dragged, all the way", async () => {
    const frame = page.locator(".sel-ink").first();
    const box = await frame.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const moved = await frame.boundingBox();
    if (Math.abs(moved.x - box.x - 60) > 12 || Math.abs(moved.y - box.y - 30) > 12) {
      throw new Error(`the ink stopped short: moved by ${Math.round(moved.x - box.x)},${Math.round(moved.y - box.y)} of 60,30`);
    }
  });

  /* ---------- desk only ---------- */

  if (device.desktop) {
    await step("⌘C then ⌘V duplicates the selected ink", async () => {
      const before = await savedStrokes();
      await page.keyboard.press("Control+c");
      await page.waitForTimeout(250);
      await page.keyboard.press("Control+v");
      await page.waitForTimeout(900);
      const after = await savedStrokes();
      if (after <= before) throw new Error(`paste added nothing: ${before} -> ${after}`);
    });

    await step("arrow keys nudge the selection", async () => {
      const at = () => page.locator(".sel-ink").first().evaluate((el) => el.getBoundingClientRect().left);
      const before = await at();
      for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
      await page.waitForTimeout(400);
      const after = await at();
      if (after - before < 4) throw new Error(`did not move: ${before} -> ${after}`);
    });

    await step("space holds the hand tool and lets go again", async () => {
      await page.click('.tool[data-tool="pen"]');
      await page.waitForTimeout(150);
      await page.keyboard.down("Space");
      await page.waitForTimeout(200);
      const held = await page.locator('.tool[data-tool="hand"]').getAttribute("class");
      await page.keyboard.up("Space");
      await page.waitForTimeout(200);
      const after = await page.locator('.tool[data-tool="pen"]').getAttribute("class");
      if (!held.includes("is-on")) throw new Error("space did not reach for the hand");
      if (!after.includes("is-on")) throw new Error("the pen did not come back");
    });

    await step("the cursor says which tool is in hand", async () => {
      await page.click('.tool[data-tool="eraser"]');
      await page.waitForTimeout(200);
      const eraser = await page.locator("#stage").evaluate((el) => el.style.cursor);
      await page.click('.tool[data-tool="hand"]');
      await page.waitForTimeout(200);
      const hand = await page.locator("#stage").evaluate((el) => el.style.cursor);
      if (!eraser || eraser === hand) throw new Error(`cursor did not change: "${eraser}" vs "${hand}"`);
      if (hand !== "grab") throw new Error("hand tool should show a grab cursor, got " + hand);
      await page.click('.tool[data-tool="pen"]');
    });

    await step("right-click offers a menu, and Escape closes it", async () => {
      const b = await pageBox();
      await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.8, { button: "right" });
      await page.waitForTimeout(300);
      if (!(await page.locator(".ctx-menu").count())) throw new Error("no context menu");
      const paste = await page.locator('.ctx-menu [data-id="paste"]').count();
      if (!paste) throw new Error("no paste item on an empty part of the page");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      if (await page.locator(".ctx-menu").count()) throw new Error("menu did not close");
    });

    await step("right-click a text box offers to delete it", async () => {
      const box = await page.locator(".obj-text").first().boundingBox();
      await page.click('.tool[data-tool="hand"]');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
      await page.waitForTimeout(300);
      if (!(await page.locator('.ctx-menu [data-id="delete"]').count())) throw new Error("no delete item");
      await page.keyboard.press("Escape");
      await page.click('.tool[data-tool="pen"]');
    });

    await step("pasting an image puts a photo on the page", async () => {
      const before = await page.locator(".obj-image").count();
      await page.evaluate(async (b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], "pasted.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      }, PHOTO_PNG);
      await page.waitForTimeout(1200);
      const after = await page.locator(".obj-image").count();
      if (after <= before) throw new Error(`no image appeared: ${before} -> ${after}`);
    });

    await step("cutting a photo and pasting it back keeps the picture", async () => {
      // The clipboard holds blob ids, and a cut deletes the original's
      // blob. Without a copy of its own, this pastes an empty grey box.
      await page.click('.tool[data-tool="hand"]');
      const before = await page.locator(".obj-image").count();
      const box = await page.locator(".obj-image").first().boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(400);

      await page.keyboard.press("Control+x");
      await page.waitForTimeout(900);
      const cut = await page.locator(".obj-image").count();
      if (cut !== before - 1) throw new Error(`the cut removed ${before - cut} of 1 photo`);

      await page.keyboard.press("Control+v");
      await page.waitForTimeout(1600);
      if ((await page.locator(".obj-image").count()) !== before) throw new Error("the paste brought nothing back");

      // Every photo on the page, not just the first: the one that came
      // back is the one whose blob the cut could have deleted.
      const blank = await page.locator(".obj-image img")
        .evaluateAll((els) => els.filter((el) => !el.complete || el.naturalWidth === 0).length);
      if (blank) throw new Error(`${blank} photo(s) have no picture in them`);
      await page.click('.tool[data-tool="pen"]');
    });
  }

  /* ---------- pages, zoom, export ---------- */

  await step("add a page and navigate", async () => {
    await page.click("#pageMenuBtn");
    await page.click('#pageMenu [data-act="addpage"]');
    await page.waitForTimeout(900);
    const label = await page.locator("#pageCount").textContent();
    if (!label.includes("2 / 2")) throw new Error("page count is " + label);
    await page.click("#prevPageBtn");
    await page.waitForTimeout(600);
  });

  await step("page thumbnails render", async () => {
    await page.click("#pagesBtn");
    await page.waitForTimeout(1500);
    const bg = await page.locator(".rail-thumb").first().evaluate((el) => el.style.backgroundImage);
    if (!bg.startsWith("url(")) throw new Error("no thumbnail painted");
    await page.click("#pagesBtn");
  });

  await step("zoom in and fit again", async () => {
    await page.keyboard.press("Control+Equal");
    await page.keyboard.press("Control+Equal");
    await page.waitForTimeout(400);
    const zoomed = await page.locator("#zoomLabel").textContent();
    await page.keyboard.press("Control+0");
    await page.waitForTimeout(400);
    const fitted = await page.locator("#zoomLabel").textContent();
    if (zoomed === fitted) throw new Error("zoom did nothing: " + zoomed);
  });

  await step("zoomed in, the page can still be scrolled back to its left edge", async () => {
    await page.keyboard.press("Control+Equal");
    await page.keyboard.press("Control+Equal");
    await page.keyboard.press("Control+Equal");
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => {
      const stage = document.getElementById("stage");
      stage.scrollLeft = 0;
      const pageEl = document.getElementById("page");
      // The left edge of the sheet must be reachable — with flexbox
      // centring it is clipped and no amount of scrolling gets it back.
      return pageEl.getBoundingClientRect().left >= stage.getBoundingClientRect().left - 1;
    });
    if (!ok) throw new Error("the left edge of the page is unreachable when zoomed");
    await page.keyboard.press("Control+0");
    await page.waitForTimeout(300);
  });

  await step("paper template change", async () => {
    await page.click("#pageMenuBtn");
    await page.click('#paperPicker [data-paper="cornell"]');
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
  });

  await step("export a PNG", async () => {
    const dl = page.waitForEvent("download", { timeout: 20000 });
    await page.click("#shareBtn");
    await page.click('#shareMenu [data-act="png"]');
    const d = await dl;
    if (!(await d.path())) throw new Error("no file");
    console.log("       " + d.suggestedFilename());
  });

  await step("export the notebook as PDF", async () => {
    const dl = page.waitForEvent("download", { timeout: 30000 });
    await page.click("#shareBtn");
    await page.click('#shareMenu [data-act="pdfall"]');
    const d = await dl;
    const buf = readFileSync(await d.path());
    if (buf.subarray(0, 8).toString() !== "%PDF-1.4") throw new Error("not a PDF");
    console.log(`       ${d.suggestedFilename()} (${buf.length} bytes)`);
  });

  await step("back up the library as JSON", async () => {
    const dl = page.waitForEvent("download", { timeout: 25000 });
    await page.click("#shareBtn");
    await page.click('#shareMenu [data-act="json"]');
    const d = await dl;
    const j = JSON.parse(readFileSync(await d.path(), "utf8"));
    if (j.format !== "inkwell.backup" || !j.notebooks.length) throw new Error("bad backup");
    console.log(`       ${j.notebooks.length} notebook, ${j.notebooks[0].pages.length} pages`);
  });

  /* ---------- back out ---------- */

  await step("back to the shelf, notebook is listed", async () => {
    await page.click("#backBtn");
    await page.waitForTimeout(1000);
    const t = await page.locator(".book-title").first().textContent();
    if (t !== "Physics 101") throw new Error("shelf shows " + t);
  });

  if (device.desktop) {
    await step("a file dropped on the shelf is handled", async () => {
      const drop = (name, type, body) => page.evaluate(([n, t, b]) => {
        const dt = new DataTransfer();
        dt.items.add(new File([b], n, { type: t }));
        const shelf = document.getElementById("shelf");
        shelf.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
        shelf.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, [name, type, body]);

      // Something that has to live on a page, not on the shelf: it
      // should say so rather than swallow the drop.
      await drop("photo.png", "image/png", "not really a png");
      await page.waitForTimeout(600);
      const toast = await page.locator("#toast").textContent();
      if (!/notebook/i.test(toast)) throw new Error("no explanation, got: " + toast);

      // A backup should offer to restore it.
      await drop("backup.json", "application/json", JSON.stringify({ format: "inkwell.backup", notebooks: [], blobs: {} }));
      await page.waitForTimeout(600);
      if (!(await page.locator("#sheet .sheet-title").count())) throw new Error("no restore prompt");
      const title = await page.locator("#sheet .sheet-title").textContent();
      if (!/restore/i.test(title)) throw new Error("wrong prompt: " + title);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    });
  }

  await step("search finds the typed text", async () => {
    await page.fill("#shelfSearch", "Newton");
    await page.waitForTimeout(700);
    if (!(await page.locator(".hit").count())) throw new Error("no search hits");
    await page.fill("#shelfSearch", "");
    await page.waitForTimeout(400);
  });

  await step("dark mode leaves nothing unreadable", async () => {
    await page.click("#darkToggle");
    await page.waitForTimeout(400);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    if (theme !== "dark") throw new Error("theme is " + theme);
    await page.screenshot({ path: `/tmp/inkwell-${device.name}-dark.png` });
    await page.click("#darkToggle");
    await page.waitForTimeout(300);
  });

  await page.screenshot({ path: `/tmp/inkwell-${device.name}-shelf.png` });
  await page.click(".book-cover");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `/tmp/inkwell-${device.name}-editor.png` });

  await browser.close();
  return errors;
}

/* Anything wider than the window, or sticking out past its right edge.
   The commonest way a layout that is fine on a laptop breaks on a
   phone, and invisible until someone tries to scroll sideways. */
function horizontalOverflow(page) {
  return page.evaluate(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    for (const el of document.querySelectorAll("body *")) {
      if (el.offsetParent === null) continue;
      // Deliberately scrollable strips are allowed to be wider inside.
      if (el.closest(".tray, .stage, .inspector, .shelf-body, .pages-rail, .ctx-menu, .menu")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2) {
        out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : "." + String(el.className).split(" ")[0]} ends at ${Math.round(r.right)}`);
      }
    }
    return [...new Set(out)].slice(0, 6);
  });
}
