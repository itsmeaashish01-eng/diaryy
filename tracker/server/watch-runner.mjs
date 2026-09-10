#!/usr/bin/env node
/* ================================================
   PRICE WATCH — watch-runner.mjs

   The unattended half of Price Watch. One pass: read the watchlist,
   check whatever is due, record the prices, run the alert rules, and
   push anything that fired to your phone. Then exit.

   It has no schedule of its own — something else has to call it every
   hour. The bundled GitHub Actions workflow does that on GitHub's
   machines, so nothing of yours needs to be running.

   It reuses the browser app's own provider, statistics and rule code
   rather than reimplementing it, so the two halves can never drift
   apart in what they decide.

     node tracker/server/watch-runner.mjs --file tracker/data/watches.json

   Options:
     --file <path>   watchlist to read and update (required)
     --dry-run       check and score, but send nothing and save nothing
     --force         ignore each watch's interval and check everything

   Environment:
     NTFY_TOPIC      ntfy topic to push to
     NTFY_SERVER     default https://ntfy.sh
     WEBHOOK_URL     Discord / Slack / custom webhook
     WEBHOOK_STYLE   discord | slack | plain   (default discord)
     PROXY_BASE      price-proxy address, for sources that need one
   ================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

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

// ---- arguments ----
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const file = opt("--file", "");
const dryRun = flag("--dry-run");
const force = flag("--force");

if (!file) {
  console.error("Missing --file <watchlist.json>");
  process.exit(2);
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
      topic,
      title,
      message,
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
  const kind = (PT.providers.byId(alert.provider) && alert.kindLabel) || alert.kindLabel || "Watch";
  const title = `${kind}: ${alert.watchLabel}`;
  const results = [];
  for (const [name, fn] of [["ntfy", pushNtfy], ["webhook", pushWebhook]]) {
    try {
      results.push(`${name}: ${await fn(title, alert.message, alert.severity)}`);
    } catch (e) {
      results.push(`${name}: FAILED — ${e.message}`);
    }
  }
  return results;
}

// ---- main ----
const KIND_LABEL = {
  flight: "Flight", train: "Train", bus: "Bus", hotel: "Hotel",
  ferry: "Ferry", car: "Car hire", stock: "Stock", crypto: "Crypto",
  fx: "Currency", other: "Watch",
};

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

for (const w of data.watches) {
  const label = w.label || w.id;

  if (!w.active) { skipped++; console.log(`· ${label} — paused`); continue; }
  if (w.provider === "manual") {
    skipped++;
    console.log(`· ${label} — manual entry, nothing to check automatically`);
    continue;
  }
  const dueAt = (w.lastCheck || 0) + Math.max(1, w.intervalMin || 60) * 60000;
  if (!force && now < dueAt) {
    skipped++;
    console.log(`· ${label} — not due for ${Math.round((dueAt - now) / 60000)} min`);
    continue;
  }

  let result;
  try {
    result = await PT.providers.check(w, ctx);
  } catch (e) {
    failed++;
    w.errorCount = (w.errorCount || 0) + 1;
    w.lastError = { message: String(e.message || e), t: now };
    w.lastCheck = now;
    console.log(`✕ ${label} — ${e.message || e}`);
    continue;
  }

  w.history = Array.isArray(w.history) ? w.history : [];
  w.history.push({ t: now, p: result.price, ...(result.meta ? { meta: result.meta } : {}) });
  if (w.history.length > MAX_POINTS) w.history = w.history.slice(-MAX_POINTS);
  w.lastCheck = now;
  w.errorCount = 0;
  w.lastError = null;
  if (result.currency && !w.currency) w.currency = result.currency;
  checked++;

  const s = PT.analytics.summarize(w);
  const v = PT.analytics.verdict(w, s);
  const money = PT.util.fmtMoney(result.price, w.currency);
  console.log(`✓ ${label} — ${money} · ${v.verdict.label}${v.score == null ? "" : ` ${v.score}/100`}`);

  const alerts = PT.alerts.evaluate(w, result.price, s, v);
  if (!alerts.length) continue;

  w.lastAlertAt = w.lastAlertAt || {};
  for (const a of alerts) {
    fired++;
    a.kindLabel = KIND_LABEL[w.kind] || "Watch";
    a.provider = w.provider;
    w.lastAlertAt[a.ruleType] = a.t;
    data.alerts.unshift(a);
    console.log(`  🔔 ${a.message}`);
    if (dryRun) {
      console.log("     (dry run — not sent)");
    } else {
      for (const line of await deliver(a)) console.log(`     ${line}`);
    }
  }
}

data.alerts = data.alerts.slice(0, 300);

if (dryRun) {
  console.log(`\nDry run — nothing written. checked ${checked}, skipped ${skipped}, failed ${failed}, alerts ${fired}`);
} else {
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`\nchecked ${checked}, skipped ${skipped}, failed ${failed}, alerts ${fired} — ${file} updated`);
}

// A failed source is worth surfacing in the job log, but it must not fail
// the run: one dead endpoint shouldn't stop the other watches next hour.
process.exit(0);
