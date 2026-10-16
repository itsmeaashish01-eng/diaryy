#!/usr/bin/env node
/**
 * Bundle the app into one self-contained HTML file.
 *
 *   node build-single.js            -> dist/strokerounds-standalone.html  (full document)
 *   node build-single.js --artifact -> dist/strokerounds-artifact.html    (body fragment)
 *
 * The standalone file opens from disk or any host with no other files.
 * The artifact variant drops the document wrapper for hosts that supply
 * their own <head>. Neither can register a service worker, so both set
 * STROKEROUNDS_SINGLE_FILE and skip the offline cache; the installable
 * PWA is still the folder itself.
 */

const fs = require("fs");
const path = require("path");

const root = __dirname;
const artifact = process.argv.includes("--artifact");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const html = read("index.html");
const css = read("css/style.css");
const js = ["js/store.js", "js/scores.js", "js/note.js", "js/app.js"]
  .map((f) => `/* ---- ${f} ---- */\n${read(f)}`)
  .join("\n\n");

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
  '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500' +
  '&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />';

// Body markup, minus the four <script src> tags the bundle replaces.
const body = html
  .slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script src="js\/[^"]+"><\/script>\s*/g, "")
  .trim();

const bundle = `<script>window.STROKEROUNDS_SINGLE_FILE = true;</script>
<script>
${js}
</script>`;

let out;
if (artifact) {
  out = `<title>StrokeRounds</title>
${FONTS}
<style>
${css}
</style>

${body}

${bundle}
`;
} else {
  out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0b1220" />
<title>StrokeRounds — Attending Rounding List</title>
${FONTS}
<style>
${css}
</style>
</head>
<body>
${body}
${bundle}
</body>
</html>
`;
}

const dest = path.join(root, "dist");
fs.mkdirSync(dest, { recursive: true });
const file = path.join(dest, artifact ? "strokerounds-artifact.html" : "strokerounds-standalone.html");
fs.writeFileSync(file, out);
console.log(`${path.relative(root, file)} — ${(out.length / 1024).toFixed(1)} KB`);
