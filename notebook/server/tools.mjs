/* ================================================
   MARGINALIA — server/tools.mjs
   Finding out what else is installed, without stopping to do it.

   Two small jobs that were, in the first version of this application,
   done the obviously wrong way: looking for ffmpeg, a browser and an
   OCR engine with synchronous spawns, on every health check.

   Synchronous spawning stops Node's event loop dead. Not the request —
   the loop. While `which ffmpeg` runs, this server cannot serve the
   page, the stylesheet, the model list or anything else. Probing a
   machine that actually has these tools means launching ffmpeg three
   times and tesseract once, and asking Windows `where` about half a
   dozen browsers: seconds, all told, and it was on the path of every
   page load and then again every thirty seconds.

   So: everything here is asynchronous, everything is remembered for
   the life of the process, and callers that can't wait are given
   whatever is known so far instead of being blocked. What is installed
   does not change while the app is running, and if you install ffmpeg
   halfway through the afternoon, restarting the server is the price.
   ================================================ */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

/* ---- remembering ---------------------------------------------------- */
/*
   once() turns an expensive async function into one that runs at most
   once, however many callers arrive and whenever they arrive. It also
   exposes `known()`, which returns the answer if there is one and null
   if the work hasn't finished — that is what lets a health check answer
   immediately and still be useful.
*/

export function once(fn) {
  let value = null;
  let inFlight = null;
  const run = () => {
    if (value) return Promise.resolve(value);
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(fn)
        .then((result) => { value = result; inFlight = null; return result; })
        .catch((e) => { inFlight = null; throw e; });
    }
    return inFlight;
  };
  run.known = () => value;
  run.started = () => Boolean(value || inFlight);
  /* Kick it off without waiting, and without an unhandled rejection if
     it goes wrong — a failed probe just means "not found". */
  run.warm = () => { run().catch(() => {}); };
  run.forget = () => { value = null; inFlight = null; };
  return run;
}

/* ---- running a program ---------------------------------------------- */

export function exec(cmd, args = [], { timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === "number" ? error.code : error ? 1 : 0,
        out: String(stdout || ""),
        err: String(stderr || ""),
      });
    });
  });
}

/* ---- finding a program ---------------------------------------------- */
/*
   A path is checked on disk; a bare name is looked up on the PATH.
   Results are cached by name, because the same browser is asked about
   by three different callers and Windows `where` is not quick.
*/

const found = new Map();

export function which(cmd) {
  if (!cmd) return Promise.resolve(null);
  if (found.has(cmd)) return found.get(cmd);
  const promise = (async () => {
    if (cmd.includes("/") || cmd.includes("\\")) return existsSync(cmd) ? cmd : null;
    const finder = process.platform === "win32" ? "where" : "which";
    const { ok, out } = await exec(finder, [cmd], { timeout: 5000 });
    const first = out.trim().split(/\r?\n/)[0];
    return ok && first ? first : null;
  })();
  found.set(cmd, promise);
  return promise;
}

/* The first of several that exists. Asked all at once rather than in
   turn: five processes in parallel cost about what one does. */
export async function firstOf(candidates) {
  const results = await Promise.all(candidates.filter(Boolean).map((c) => which(c).catch(() => null)));
  const hit = results.findIndex(Boolean);
  return hit >= 0 ? results[hit] : null;
}
