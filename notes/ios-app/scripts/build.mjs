#!/usr/bin/env node
/* ================================================
   INKWELL iOS — build.mjs
   Assemble www/ — the app as it ships inside the native shell.

   The website and the app are the same code. These are the differences
   the App Store requires, and each one is here for a stated reason:

     - pdf.js is bundled instead of fetched from a CDN. Apple is wary of
       apps that download executable code at runtime, and an app that
       needs a network to open a PDF is not an offline app.
     - The typefaces are bundled for the same reason. A note app that
       changes typeface on a plane is not finished.
     - The service worker goes. It exists to make a website behave like
       an installed app; inside the shell the files are already local,
       and a registration that fails is noise in the console that looks
       like a bug to whoever reviews this.

   Everything else — the ink engine, the store, the exporters — is byte
   for byte what the website runs.
   ================================================ */

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");        // notes/ios-app
const APP = join(ROOT, "..");         // notes
const WWW = join(ROOT, "www");

const COPY = ["index.html", "style.css", "manifest.webmanifest", "js", "icons"];

function main() {
  rmSync(WWW, { recursive: true, force: true });
  mkdirSync(WWW, { recursive: true });

  for (const name of COPY) {
    const from = join(APP, name);
    if (!existsSync(from)) throw new Error(`missing ${name} — is this being run from notes/ios-app?`);
    cpSync(from, join(WWW, name), { recursive: true });
  }

  vendorPdfJs();
  vendorFonts();
  rewriteIndex();

  console.log("www/ assembled — run `npm run ios:sync` next (on a Mac).");
}

/* pdf.js out of node_modules. js/pdfin.js looks for vendor/pdfjs first
   and only falls back to the CDN if it isn't there, so this is the
   whole of the change. */
function vendorPdfJs() {
  const dist = join(ROOT, "node_modules", "pdfjs-dist", "build");
  if (!existsSync(dist)) {
    throw new Error("pdfjs-dist isn't installed — run `npm install` in notes/ios-app first.");
  }
  const to = join(WWW, "vendor", "pdfjs");
  mkdirSync(to, { recursive: true });
  for (const f of ["pdf.min.js", "pdf.worker.min.js"]) {
    const from = join(dist, f);
    if (!existsSync(from)) throw new Error(`pdfjs-dist is missing ${f} — check the pinned version.`);
    cpSync(from, join(to, f));
  }
}

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
    if (!existsSync(from)) throw new Error(`missing ${file} — run \`npm install\` in notes/ios-app first.`);
    cpSync(from, join(to, file));
    // Relative to this stylesheet, which sits beside the files.
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
    .replace(/ *<link rel="preconnect" href="https:\/\/fonts\.[^"]+"[^>]*\/>\n/g, "")
    .replace(
      /<link href="https:\/\/fonts\.googleapis\.com[^"]+" rel="stylesheet" \/>/,
      '<link rel="stylesheet" href="vendor/fonts/fonts.css" />',
    );

  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) {
    throw new Error("a Google Fonts reference survived the rewrite — check build.mjs against index.html");
  }

  html = html.replace(/\n *<script>\s*\/\* Registering here[\s\S]*?<\/script>/, "");
  if (/serviceWorker/.test(html)) {
    throw new Error("the service-worker block survived the rewrite — check build.mjs");
  }

  writeFileSync(file, html);

  // sw.js was never copied, but a stale one left in www/ from an older
  // build would still be served. Belt and braces.
  rmSync(join(WWW, "sw.js"), { force: true });
}

main();
