/* ================================================
   THE AI EMPLOYEE — server/modules.mjs
   One brain, two front ends.

   The nine jobs are decided in employee/js/*.js, which are plain browser
   scripts that hang themselves off a global. Rather than reimplement any
   of that server-side — where it would drift, and where the second copy
   is always the one with the bug — this loads those same files in a VM
   sandbox with just enough window to satisfy them.

   So the morning read Slack posts at 8am is the morning read the page
   shows, character for character, because it is the same function.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = join(HERE, "..");

/* ui.js and app.js are left out: they need a DOM, and what they do is
   render what these decide. */
export const MODULE_FILES = [
  "util.js", "store.js", "margin.js", "qa.js",
  "money.js", "growth.js", "brief.js", "install.js", "sync.js",
];

/* A browser, for a very small value of "browser". localStorage is a Map,
   so a sandbox is a throwaway workspace and two of them never collide. */
export function loadModules() {
  const stored = new Map();
  const localStorage = {
    getItem: (k) => (stored.has(k) ? stored.get(k) : null),
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
  };
  const win = {
    localStorage,
    navigator: { userAgent: "node", maxTouchPoints: 0 },
    addEventListener() {},
  };
  const ctx = createContext({
    window: win, localStorage, navigator: win.navigator,
    console, Date, Intl, JSON, Math, setTimeout, clearTimeout,
  });
  for (const file of MODULE_FILES) {
    runInContext(readFileSync(join(APP_DIR, "js", file), "utf8"), ctx, { filename: file });
  }
  return { AE: runInContext("window.AE", ctx), localStorage };
}
