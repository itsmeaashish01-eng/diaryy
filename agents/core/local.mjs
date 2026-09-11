/* ================================================
   AGENTS — core/local.mjs
   For agents that watch a file of yours rather than something on the
   internet: your goals, your reading list, your training log, your notes.

   Shared so that "3 days ago" means the same thing in every one of them,
   and so a missing or malformed file fails with a sentence you can act
   on rather than a stack trace.
   ================================================ */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

export const DAY = 86400000;

export const isoDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/* Parse a YYYY-MM-DD as midday UTC. Midnight lands on the previous day
   in western timezones, which turns "due today" into "overdue". */
export function parseDay(s) {
  if (!s) return null;
  const t = Date.parse(String(s).length === 10 ? `${s}T12:00:00Z` : s);
  return Number.isNaN(t) ? null : t;
}

/* Whole days from now until `s`. Negative means it's behind you. */
export function daysUntil(s) {
  const t = parseDay(s);
  return t == null ? null : Math.round((t - Date.now()) / DAY);
}

export function daysSince(s) {
  const d = daysUntil(s);
  return d == null ? null : -d;
}

export function readJSON(path, what) {
  if (!existsSync(path)) {
    throw new Error(`no ${what} at ${path} — see agents/README.md for the shape it expects`);
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (!data || typeof data !== "object") throw new Error("it isn't an object");
    return data;
  } catch (e) {
    throw new Error(`could not read ${path}: ${e.message}`);
  }
}

/* Deadline thresholds. Telling you every hour that something is due in
   30 days is noise; telling you once as you cross 30, then 14, then 7,
   is a reminder. The bucket becomes part of the observation key, so each
   threshold is announced exactly once. */
export const DEADLINE_BUCKETS = [90, 30, 14, 7, 3, 1, 0];

export function deadlineBucket(days) {
  if (days == null) return null;
  if (days < 0) return "overdue";
  for (const b of DEADLINE_BUCKETS) {
    if (days <= b && (b === 0 || days > nextDown(b))) return String(b);
  }
  return null;
}
const nextDown = (b) => {
  const i = DEADLINE_BUCKETS.indexOf(b);
  return i >= 0 && i + 1 < DEADLINE_BUCKETS.length ? DEADLINE_BUCKETS[i + 1] : -1;
};

/* Same idea for "it's been a while": round down to a step so a growing
   silence is reported at intervals rather than every single run. */
export const staleBucket = (days, step = 7) => Math.floor(days / step) * step;

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + "s"}`;
}

/* Walk a directory of notes. Depth-limited and extension-filtered, so
   pointing it at the wrong folder reads a few files, not your disk. */
export function listFiles(dir, { exts = [".md", ".txt"], maxDepth = 3, maxFiles = 2000 } = {}) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > maxDepth || out.length >= maxFiles) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      if (e.name.startsWith(".")) continue;              // .git, .obsidian, …
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (exts.includes(extname(e.name).toLowerCase())) {
        try { out.push({ path: full, name: e.name, mtime: statSync(full).mtimeMs }); }
        catch { /* vanished between readdir and stat */ }
      }
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => b.mtime - a.mtime);
}

/* ISO week, as "2026-W37". Several agents want to say something once a
   week rather than once an hour, and a week number makes that a key
   rather than a timer. */
export function isoWeek(t = Date.now()) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  // Thursday decides the year an ISO week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
