#!/usr/bin/env node
/* ================================================
   ROAMGUIDE iOS — screenshots.mjs
   App Store screenshots, at the sizes Apple actually accepts.

     node scripts/screenshots.mjs            # real network: real tiles
     node scripts/screenshots.mjs --stub     # stubbed, for a machine with no egress

   Apple asks for 6.9" iPhone shots and will scale them down for smaller
   devices, so that's the size worth getting right. The 6.5" set is
   generated too, since older listings still show it.

   Run this on a machine that can reach openstreetmap.org and wikipedia:
   with --stub the map is a flat colour, which is fine for checking
   layout and no good at all for a store listing.
   ================================================ */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "store", "screenshots");
const STUB = process.argv.includes("--stub");
const BASE = process.env.ROAMGUIDE_URL || "http://localhost:8098";

/* width × height in device pixels, and the CSS viewport that produces it */
const DEVICES = [
  { name: "6.9", css: { width: 440, height: 956 }, scale: 3 },   // 1320 × 2868
  { name: "6.5", css: { width: 414, height: 896 }, scale: 3 },   // 1242 × 2688
];

/* Somewhere with plenty written about it, so the shots show the app
   doing its job rather than an empty list. */
const WHERE = { latitude: 51.5080, longitude: -0.1281, accuracy: 12 };

const SHOTS = [
  { file: "1-nearby", label: "what's around you",
    go: async (p) => {
      await p.click('.nav-tab[data-view="nearby"]');
      await p.click('[data-act="live-start"]');
      await p.waitForSelector(".art-card", { timeout: 20000 });
      await p.waitForTimeout(2500);
    }},
  { file: "2-map", label: "the map",
    go: async (p) => {
      await p.click('.nav-tab[data-view="nearby"]');
      await p.waitForSelector(".map-panel", { timeout: 20000 });
      await p.waitForTimeout(2500);
      await p.locator(".map-panel").scrollIntoViewIfNeeded();
      await p.waitForTimeout(1200);
    }},
  { file: "3-trip", label: "a day, timed",
    go: async (p) => {
      await p.click('.nav-tab[data-view="trip"]');
      await p.waitForSelector(".timeline", { timeout: 10000 });
      await p.waitForTimeout(600);
    }},
  { file: "4-explore", label: "the guidebook",
    go: async (p) => {
      await p.click('.nav-tab[data-view="explore"]');
      await p.waitForSelector(".place-card");
      await p.waitForTimeout(400);
    }},
  { file: "5-practical", label: "practical things",
    go: async (p) => {
      await p.click('.nav-tab[data-view="practical"]');
      await p.waitForTimeout(600);
    }},
];

const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );

  for (const device of DEVICES) {
    const ctx = await browser.newContext({
      viewport: device.css,
      deviceScaleFactor: device.scale,
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      permissions: ["geolocation"],
      geolocation: WHERE,
      colorScheme: "light",
    });

    if (STUB) {
      await ctx.route("**/tile.openstreetmap.org/**", (r) =>
        r.fulfill({ status: 200, contentType: "image/png", body: TILE }));
      await ctx.route("**/en.wikipedia.org/**", (route) => {
        const list = new URL(route.request().url()).searchParams.get("list");
        if (list === "geosearch") return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ query: { geosearch: [
            { pageid: 1, title: "Nelson's Column", lat: 51.5078, lon: -0.1281, dist: 31 },
            { pageid: 2, title: "National Gallery", lat: 51.5089, lon: -0.1283, dist: 101 },
            { pageid: 3, title: "St Martin-in-the-Fields", lat: 51.5089, lon: -0.1266, dist: 149 },
            { pageid: 4, title: "Trafalgar Square", lat: 51.5080, lon: -0.1281, dist: 12 },
          ]}})});
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ query: { pages: {
            1: { pageid: 1, title: "Nelson's Column", extract: "A monument in Trafalgar Square, built to commemorate Nelson's victory at Trafalgar in 1805.", fullurl: "https://en.wikipedia.org/wiki/Nelson%27s_Column" },
            2: { pageid: 2, title: "National Gallery", extract: "An art museum founded in 1824, housing over 2,300 paintings from the mid-13th century to 1900.", fullurl: "https://en.wikipedia.org/wiki/National_Gallery" },
            3: { pageid: 3, title: "St Martin-in-the-Fields", extract: "A Church of England parish church at the north-east corner of Trafalgar Square.", fullurl: "https://en.wikipedia.org/wiki/St_Martin-in-the-Fields" },
            4: { pageid: 4, title: "Trafalgar Square", extract: "A public square in the City of Westminster, built around the area formerly known as Charing Cross.", fullurl: "https://en.wikipedia.org/wiki/Trafalgar_Square" },
          }}})});
      });
    }

    const page = await ctx.newPage();
    await page.goto(`${BASE}/index.html`);
    await page.waitForSelector(".place-card");

    for (const shot of SHOTS) {
      await shot.go(page);
      const file = join(OUT, `${device.name}-${shot.file}.png`);
      await page.screenshot({ path: file });
      console.log(`${device.css.width * device.scale}×${device.css.height * device.scale}  ${shot.file}  — ${shot.label}`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nWritten to store/screenshots/.${STUB ? "\nSTUBBED: the map is a flat colour. Re-run without --stub on a networked machine before submitting." : ""}`);
}

main();
