#!/usr/bin/env node
/* ================================================
   PRICE WATCH — watch-runner.mjs

   The unattended half of Price Watch. Checks what's due, records the
   prices, runs the alert rules, pushes what fired to your phone.

   Two ways to drive it:

     one pass, then exit  — for cron or GitHub Actions
       node tracker/server/watch-runner.mjs --file tracker/data/watches.json

     stay running         — for a laptop or a Pi that's on anyway
       node tracker/server/watch-runner.mjs --file tracker/data/watches.json --loop

   It reuses the browser app's own provider, statistics and rule code
   rather than reimplementing it, so the two halves can't drift apart on
   what they decide is a good price.

   Options:
     --file <path>   watchlist to read and update (required)
     --loop          keep running, waking every minute to see what's due
     --dry-run       check and score, but send nothing and save nothing
     --force         ignore each watch's interval and check everything
     --once <id>     check only this one watch, whatever its interval
     --summary <p>   append a markdown report to this file (point it at
                     $GITHUB_STEP_SUMMARY to see prices on the run page)

   Environment:
     NTFY_TOPIC      ntfy topic to push to
     NTFY_SERVER     default https://ntfy.sh
     WEBHOOK_URL     Discord / Slack / custom webhook
     WEBHOOK_STYLE   discord | slack | plain   (default discord)
     PROXY_BASE      price-proxy address, for sources that need one
   ================================================ */

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { exec } from "node:child_process";

/* The app's modules are plain browser scripts that hang themselves off
   `window`. Point `window` at the Node global and they load unchanged. */
globalThis.window = globalThis;
const require = createRequire(import.meta.url);
require("../js/util.js");
require("../js/providers.js");
require("../js/analytics.js");
require("../js/alerts.js");
const PT = globalThis.PT;

const MAX_POINTS = 1500;
const LOOP_TICK_MS = 60 * 1000;

// ---- arguments ----
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const file = opt("--file", "");
const dryRun = flag("--dry-run");
const loop = flag("--loop");
const onlyId = opt("--once", "");
const summaryPath = opt("--summary", "");
let force = flag("--force");

if (!file) {
  console.error("Missing --file <watchlist.json>");
  process.exit(2);
}

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg) => console.log(loop ? `[${stamp()}] ${msg}` : msg);

/* Recording prices with nowhere to send an alert is a half-configured
   setup that looks like a working one. Say so, every run. */
const canNotify = Boolean(process.env.NTFY_TOPIC || process.env.WEBHOOK_URL);
if (!canNotify && !dryRun) {
  log("⚠ No alert channel configured — prices will be recorded, but nothing will reach you.");
  log("  Set NTFY_TOPIC (or WEBHOOK_URL). On GitHub: Settings → Secrets and variables → Actions.");
}

// ---- the "command" source -------------------------------------------
/* Runs a local program and reads {"price":…,"currency":"…"} off its
   stdout. This is the hook for anything with no API of its own — a
   browser-driven fetcher, a shell one-liner, someone else's CLI.

   It executes whatever the watchlist says, so treat that file the way
   you'd treat a shell script: your own, not one you pasted in. */
function runCommand(w) {
  const cmd = w.config && w.config.command;
  if (!cmd) return Promise.reject(new Error('This watch has no "command" set'));
  const timeoutMs = Number(w.config.timeoutMs) || 120000;

  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = String(stdout || "").trim();
      // The fetcher's own error JSON is more useful than exec's exit code.
      const lastLine = out.split("\n").filter(Boolean).pop() || "";
      let parsed = null;
      try { parsed = JSON.parse(lastLine); } catch (e) { /* not JSON */ }

      if (parsed && parsed.error) return reject(new Error(parsed.error));
      if (err && !parsed) {
        const why = String(stderr || err.message).trim().split("\n").pop();
        return reject(new Error(why || `command exited ${err.code}`));
      }
      if (!parsed) {
        return reject(new Error(`command printed no JSON (last line: ${lastLine.slice(0, 120) || "empty"})`));
      }
      const price = Number(parsed.price);
      if (!Number.isFinite(price) || price <= 0) {
        return reject(new Error(`command returned no usable price: ${lastLine.slice(0, 120)}`));
      }
      resolve({ price, currency: parsed.currency || w.currency, meta: parsed.meta });
    });
  });
}

// ---- notifications ----
async function pushNtfy(title, message, severity) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return "no topic configured";
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const res = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic, title, message,
      priority: severity === "good" ? 4 : 3,
      tags: severity === "good" ? ["moneybag"] : ["warning"],
    }),
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
  return "sent";
}

async function pushWebhook(title, message) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return "no webhook configured";
  const style = process.env.WEBHOOK_STYLE || "discord";
  const payload =
    style === "slack" ? { text: `*${title}*\n${message}` }
    : style === "plain" ? { title, message, at: new Date().toISOString() }
    : { content: `**${title}**\n${message}` };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  return "sent";
}

async function deliver(alert) {
  const title = `${alert.kindLabel}: ${alert.watchLabel}`;
  const out = [];
  for (const [name, fn] of [["ntfy", pushNtfy], ["webhook", pushWebhook]]) {
    try { out.push(`${name}: ${await fn(title, alert.message, alert.severity)}`); }
    catch (e) { out.push(`${name}: FAILED — ${e.message}`); }
  }
  return out;
}

const KIND_LABEL = {
  flight: "Flight", train: "Train", bus: "Bus", hotel: "Hotel",
  ferry: "Ferry", car: "Car hire", stock: "Stock", crypto: "Crypto",
  fx: "Currency", other: "Watch",
};

// ---- one pass --------------------------------------------------------
async function pass() {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(data.watches)) {
    console.error(`${file} has no "watches" array — is it a Price Watch export?`);
    process.exit(2);
  }
  data.alerts = Array.isArray(data.alerts) ? data.alerts : [];

  const ctx = {
    proxyBase: (process.env.PROXY_BASE || "").trim(),
    currency: (data.settings && data.settings.currency) || "USD",
  };

  const now = Date.now();
  let checked = 0, skipped = 0, failed = 0, fired = 0;
  let soonest = null, soonestLabel = "";
  const rows = [];

  for (const w of data.watches) {
    const label = w.label || w.id;
    const note = (why) => {
      skipped++;
      // In loop mode this would repeat every minute forever; say it once per pass only.
      if (!loop) log(`· ${label} — ${why}`);
    };

    if (onlyId && w.id !== onlyId) { skipped++; continue; }
    if (!w.active) { note("paused"); continue; }
    if (w.provider === "manual") { note("manual entry, nothing to check automatically"); continue; }

    const dueAt = (w.lastCheck || 0) + Math.max(1, w.intervalMin || 60) * 60000;
    if (!force && !onlyId && now < dueAt) {
      skipped++;
      if (soonest === null || dueAt < soonest) { soonest = dueAt; soonestLabel = label; }
      if (!loop) log(`· ${label} — not due for ${Math.round((dueAt - now) / 60000)} min`);
      continue;
    }

    let result;
    try {
      result = w.provider === "command"
        ? await runCommand(w)
        : await PT.providers.check(w, ctx);
    } catch (e) {
      failed++;
      w.errorCount = (w.errorCount || 0) + 1;
      w.lastError = { message: String(e.message || e), t: Date.now() };
      w.lastCheck = Date.now();
      log(`✕ ${label} — ${e.message || e}`);
      rows.push({ label, price: "—", verdict: "failed", note: String(e.message || e).slice(0, 90) });
      continue;
    }

    w.history = Array.isArray(w.history) ? w.history : [];
    w.history.push({ t: Date.now(), p: result.price, ...(result.meta ? { meta: result.meta } : {}) });
    if (w.history.length > MAX_POINTS) w.history = w.history.slice(-MAX_POINTS);
    w.lastCheck = Date.now();
    w.errorCount = 0;
    w.lastError = null;
    if (result.currency && !w.currency) w.currency = result.currency;
    checked++;

    const s = PT.analytics.summarize(w);
    const v = PT.analytics.verdict(w, s);
    const money = PT.util.fmtMoney(result.price, w.currency);
    log(`✓ ${label} — ${money} · ${v.verdict.label}${v.score == null ? "" : ` ${v.score}/100`}`);
    rows.push({
      label,
      price: money,
      verdict: `${v.verdict.label}${v.score == null ? ` ${v.n}/${v.needed}` : ` ${v.score}/100`}`,
      note: `${w.history.length} reading${w.history.length === 1 ? "" : "s"}` +
        (s.min != null ? ` · low ${PT.util.fmtMoney(s.min, w.currency)}` : ""),
    });

    const alerts = PT.alerts.evaluate(w, result.price, s, v);
    if (!alerts.length) continue;

    w.lastAlertAt = w.lastAlertAt || {};
    for (const a of alerts) {
      fired++;
      a.kindLabel = KIND_LABEL[w.kind] || "Watch";
      w.lastAlertAt[a.ruleType] = a.t;
      data.alerts.unshift(a);
      log(`  🔔 ${a.message}`);
      if (dryRun) log("     (dry run — not sent)");
      else for (const line of await deliver(a)) log(`     ${line}`);
    }
  }

  data.alerts = data.alerts.slice(0, 300);

  if (dryRun) {
    log(`Dry run — nothing written. checked ${checked}, skipped ${skipped}, failed ${failed}, alerts ${fired}`);
  } else if (checked || failed) {
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    log(`checked ${checked}, skipped ${skipped}, failed ${failed}, alerts ${fired} — ${file} updated`);
  } else if (!loop) {
    log(`Nothing was due. skipped ${skipped}`);
  }
  if (summaryPath) writeSummary(rows, { checked, skipped, failed, fired });
  return { checked, failed, fired, soonest, soonestLabel };
}

/* A run page that shows only log lines makes "is this thing working?"
   a scrolling exercise. A table answers it at a glance. */
function writeSummary(rows, totals) {
  const lines = [
    `## Price Watch — ${new Date().toUTCString()}`,
    "",
    `Checked **${totals.checked}**, skipped ${totals.skipped}, failed ${totals.failed}, alerts fired **${totals.fired}**.`,
    "",
  ];
  if (!canNotify) {
    lines.push(
      "> [!WARNING]",
      "> No alert channel is configured, so prices are being recorded but nothing will reach your phone.",
      "> Add an `NTFY_TOPIC` secret under Settings → Secrets and variables → Actions.",
      ""
    );
  }
  if (rows.length) {
    lines.push("| Watch | Price | Signal | |", "|---|---|---|---|");
    for (const r of rows) {
      lines.push(`| ${r.label} | ${r.price} | ${r.verdict} | ${r.note} |`);
    }
  } else {
    lines.push("_Nothing was due this run._");
  }
  try {
    appendFileSync(summaryPath, lines.join("\n") + "\n");
  } catch (e) {
    log(`could not write summary: ${e.message}`);
  }
}

// ---- go --------------------------------------------------------------
if (loop) {
  log(`Watching ${file}. Checking each watch on its own interval; Ctrl-C to stop.`);
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; log("Stopping."); process.exit(0); });
  /* A long-running process that prints nothing for an hour looks broken.
     When a pass finds nothing due, say so and say when the next one lands —
     throttled, so an idle night isn't a wall of text. */
  const QUIET_LOG_MS = 15 * 60 * 1000;
  let lastQuietLog = 0;

  // First pass immediately so you can see it working, then on the tick.
  for (;;) {
    try {
      const r = await pass();
      if (!r.checked && !r.failed) {
        const due = Date.now() - lastQuietLog > QUIET_LOG_MS || lastQuietLog === 0;
        if (due) {
          lastQuietLog = Date.now();
          log(
            r.soonest
              ? `nothing due — next is ${r.soonestLabel} in ${Math.max(1, Math.round((r.soonest - Date.now()) / 60000))} min`
              : "nothing to check — every watch is paused, manual, or has no automatic source"
          );
        }
      } else {
        lastQuietLog = 0;
      }
    } catch (e) {
      log(`pass failed: ${e.message || e}`);
    }
    force = false;
    if (stopping) break;
    await new Promise((r) => setTimeout(r, LOOP_TICK_MS));
  }
} else {
  await pass();
  // A failed source is worth surfacing in the log, but it must not fail the
  // run: one dead endpoint shouldn't stop the other watches next hour.
  process.exit(0);
}
