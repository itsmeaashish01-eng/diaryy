#!/usr/bin/env node
/* ================================================
   ROAMGUIDE iOS — build.mjs
   Assemble www/ — the web app as it ships inside the native shell.

   The web version and the native one are the same app; this is the
   handful of differences the App Store requires:

     - Leaflet is bundled rather than pulled off a CDN. Apple is wary of
       apps that download their code at runtime, and an app that needs a
       CDN to draw a map isn't an offline app.
     - The service worker goes. It exists to make a website behave like
       an installed app; inside the shell the files are already local,
       and a worker that fails to register is just noise in the console.
     - Everything else — the guidebook, the planner, the maps, the
       Wikipedia lookup — is byte for byte what the website runs.
   ================================================ */

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");            // guide/ios-app
const APP = join(ROOT, "..");             // guide
const WWW = join(ROOT, "www");

const COPY = [
  "index.html", "style.css", "manifest.webmanifest", "js", "icons",
];

function main() {
  rmSync(WWW, { recursive: true, force: true });
  mkdirSync(WWW, { recursive: true });

  COPY.forEach((name) => {
    const from = join(APP, name);
    if (!existsSync(from)) throw new Error(`missing ${name} — is this being run from guide/ios-app?`);
    cpSync(from, join(WWW, name), { recursive: true });
  });

  vendorLeaflet();
  vendorFonts();
  rewriteIndex();

  console.log("www/ assembled — run `npx cap sync ios` next, or `npm run ios:sync`.");
}

/* Leaflet out of node_modules rather than off the network. */
function vendorLeaflet() {
  const dist = join(ROOT, "node_modules", "leaflet", "dist");
  if (!existsSync(dist)) {
    throw new Error("leaflet isn't installed — run `npm install` in guide/ios-app first.");
  }
  const to = join(WWW, "vendor", "leaflet");
  mkdirSync(to, { recursive: true });
  ["leaflet.js", "leaflet.css"].forEach((f) => cpSync(join(dist, f), join(to, f)));
  // Leaflet's CSS references these by relative path; without them the
  // zoom controls lose their icons.
  cpSync(join(dist, "images"), join(to, "images"), { recursive: true });
}

/* The two typefaces, out of node_modules rather than off Google's CDN.
   A web page falls back to Georgia and system-ui when the network is
   gone, which is a fair trade for a page. An app that changes typeface
   the moment you board a plane is not. */
const FONTS = [
  { pkg: "@fontsource/fraunces", file: "fraunces-latin-300-normal.woff2", family: "Fraunces", weight: 300 },
  { pkg: "@fontsource/fraunces", file: "fraunces-latin-500-normal.woff2", family: "Fraunces", weight: 500 },
  { pkg: "@fontsource/fraunces", file: "fraunces-latin-600-normal.woff2", family: "Fraunces", weight: 600 },
  { pkg: "@fontsource/dm-sans", file: "dm-sans-latin-300-normal.woff2", family: "DM Sans", weight: 300 },
  { pkg: "@fontsource/dm-sans", file: "dm-sans-latin-400-normal.woff2", family: "DM Sans", weight: 400 },
  { pkg: "@fontsource/dm-sans", file: "dm-sans-latin-500-normal.woff2", family: "DM Sans", weight: 500 },
  { pkg: "@fontsource/dm-sans", file: "dm-sans-latin-600-normal.woff2", family: "DM Sans", weight: 600 },
];

function vendorFonts() {
  const to = join(WWW, "vendor", "fonts");
  mkdirSync(to, { recursive: true });

  const faces = FONTS.map(({ pkg, file, family, weight }) => {
    const from = join(ROOT, "node_modules", pkg, "files", file);
    if (!existsSync(from)) {
      throw new Error(`missing ${file} — run \`npm install\` in guide/ios-app first.`);
    }
    cpSync(from, join(to, file));
    // Relative to this stylesheet, which sits beside the files — not to
    // the page that links it.
    return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url('./${file}') format('woff2');
}`;
  }).join("\n");

  writeFileSync(join(to, "fonts.css"), `/* Bundled with the app: no network, no CDN. */\n${faces}\n`);
}

function rewriteIndex() {
  const file = join(WWW, "index.html");
  let html = readFileSync(file, "utf8");

  html = html
    .replace(
      /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/[^"]+" \/>/,
      '<link rel="stylesheet" href="vendor/leaflet/leaflet.css" />'
    )
    .replace(
      /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/[^"]+"><\/script>/,
      '<script src="vendor/leaflet/leaflet.js"></script>'
    );

  if (html.includes("cdnjs.cloudflare.com")) {
    throw new Error("a CDN reference survived the rewrite — check build.mjs against index.html");
  }

  // Fonts likewise: bundled, not fetched.
  html = html
    .replace(/ *<link rel="preconnect" href="https:\/\/fonts\.[^"]+"[^>]*\/>\n/g, "")
    .replace(
      /<link href="https:\/\/fonts\.googleapis\.com[^"]+" rel="stylesheet" \/>/,
      '<link rel="stylesheet" href="vendor/fonts/fonts.css" />'
    );
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) {
    throw new Error("a Google Fonts reference survived the rewrite — check build.mjs");
  }

  // Drop the service-worker registration: pointless here, and a failed
  // registration in the console looks like a bug to whoever reviews this.
  html = html.replace(
    /\n *<script>\s*\/\* Registering here[\s\S]*?<\/script>/,
    ""
  );
  if (/serviceWorker/.test(html)) {
    throw new Error("the service-worker block survived the rewrite — check build.mjs");
  }

  writeFileSync(file, html);
}

main();
