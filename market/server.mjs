#!/usr/bin/env node
/* ================================================
   MARKET LENS — server.mjs
   Runs the app on your own computer.

     node market/server.mjs            then open http://localhost:8787
       --port 9000                     use another port
       --no-open                       don't open the browser

   Listens on 127.0.0.1 only, so nothing outside this machine can reach
   it. No dependencies beyond Node 18+.
   ================================================ */

import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { analyze } from "./lib/analyze.mjs";
import { CACHE_DIR } from "./lib/sources.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const PORT = Number(opt("--port", process.env.PORT || 8787));
const REPORT_FILE = join(CACHE_DIR, "last-report.json");
const SETTINGS_FILE = join(CACHE_DIR, "settings.json");

const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};

// ---- settings (kept out of the repo, in .cache) ----
function loadSettings() {
  try { return JSON.parse(readFileSync(SETTINGS_FILE, "utf8")); } catch { return {}; }
}
function applySettings(s) {
  if (s.contactEmail) process.env.MARKET_CONTACT_EMAIL = s.contactEmail;
}
applySettings(loadSettings());

// ---- one analysis at a time ----
const job = { running: false, log: [], error: null, startedAt: null, finishedAt: null };

function startJob(params) {
  job.running = true;
  job.log = [];
  job.error = null;
  job.startedAt = Date.now();
  job.finishedAt = null;
  analyze(params, (line) => { job.log.push(line); console.log(line); })
    .then((report) => {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(REPORT_FILE, JSON.stringify(report));
    })
    .catch((e) => {
      job.error = e.message;
      console.error("analysis failed:", e);
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = Date.now();
    });
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 100_000) { reject(new Error("request too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("body is not JSON")); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      return send(res, 200, readFileSync(join(HERE, file)), type);
    }
    if (req.method === "GET" && url.pathname === "/api/watchlist") {
      return send(res, 200, readFileSync(join(HERE, "data", "watchlist.json"), "utf8"));
    }
    if (req.method === "GET" && url.pathname === "/api/report") {
      return existsSync(REPORT_FILE) ? send(res, 200, readFileSync(REPORT_FILE, "utf8")) : send(res, 404, { error: "no report yet" });
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      return send(res, 200, job);
    }
    if (req.method === "GET" && url.pathname === "/api/settings") {
      const s = loadSettings();
      return send(res, 200, { contactEmail: s.contactEmail || "" });
    }
    // Only this page may start work or change settings — a POST from any
    // other site open in your browser is refused.
    if (req.method === "POST") {
      const origin = req.headers.origin || "";
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return send(res, 403, { error: "forbidden" });
      if (!/application\/json/.test(req.headers["content-type"] || "")) return send(res, 415, { error: "send JSON" });
    }
    if (req.method === "POST" && url.pathname === "/api/run") {
      if (job.running) return send(res, 409, { error: "an analysis is already running" });
      const body = await readBody(req);
      const wl = JSON.parse(readFileSync(join(HERE, "data", "watchlist.json"), "utf8"));
      const names = Object.fromEntries(wl.symbols.map((s) => [s.symbol, s.name]));
      startJob({
        symbols: Array.isArray(body.symbols) && body.symbols.length ? body.symbols.slice(0, 60) : wl.symbols.map((s) => s.symbol),
        horizon: body.horizon || wl.horizonDays,
        budget: body.budget ?? wl.budget,
        names,
      });
      return send(res, 202, { started: true });
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readBody(req);
      const email = String(body.contactEmail || "").trim().slice(0, 200);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: "that doesn't look like an email address" });
      const s = { ...loadSettings(), contactEmail: email };
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
      applySettings(s);
      if (!email) delete process.env.MARKET_CONTACT_EMAIL;
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

function openBrowser(link) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", link]]
    : process.platform === "darwin" ? ["open", [link]]
    : ["xdg-open", [link]];
  try {
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch { /* no browser to open; the URL is printed anyway */ }
}

server.listen(PORT, "127.0.0.1", () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  Market Lens is running at ${link}\n  (Ctrl+C to stop)\n`);
  if (!flag("--no-open")) openBrowser(link);
});
