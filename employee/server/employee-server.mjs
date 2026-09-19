#!/usr/bin/env node
/* ================================================
   THE AI EMPLOYEE — employee-server.mjs

   A small companion server for the two things the page can't do alone:

     1. Hold the business somewhere other than one browser, so a phone
        and a laptop see the same record.
     2. Be reachable by Slack, so the employee can answer in the channel
        where the work is actually discussed.

   It runs the same modules the page runs (see modules.mjs) — there is no
   second implementation of any of the nine jobs here.

   Run it:      node employee/server/employee-server.mjs
   Post today:  node employee/server/employee-server.mjs --post

   No dependencies. Node 18 or newer.

   Environment:
     PORT                  default 8788
     HOST                  default 127.0.0.1
     EMPLOYEE_TOKEN        shared secret for /api/*. Without one the
                           server refuses to listen on anything but
                           localhost — this file is someone's whole
                           business, including what they are owed.
     DATA_FILE             default employee/server/data/business.json
     SLACK_SIGNING_SECRET  from the Slack app's Basic Information page;
                           without it slash commands are refused
     SLACK_WEBHOOK_URL     incoming webhook, for --post
     ALLOW_ORIGIN          CORS origin for the page (default: echo it)
   ================================================ */

import http from "node:http";
import { loadModules } from "./modules.mjs";
import { BusinessStore, DEFAULT_FILE } from "./store-file.mjs";
import * as slack from "./slack.mjs";

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const TOKEN = String(process.env.EMPLOYEE_TOKEN || "");
const DATA_FILE = process.env.DATA_FILE || DEFAULT_FILE;
const SIGNING_SECRET = String(process.env.SLACK_SIGNING_SECRET || "");
const WEBHOOK_URL = String(process.env.SLACK_WEBHOOK_URL || "");

const { AE } = loadModules();
const store = new BusinessStore(DATA_FILE, AE);

const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/* ---- plumbing --------------------------------------------------------- */

function send(res, status, body, headers) {
  const payload = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, Object.assign({
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  }, headers || {}));
  res.end(payload);
}

/* The page may be opened from a file:// URL, which sends "Origin: null".
   Echoing the origin keeps that working without turning the API into
   something any site can read — the token is what actually guards it. */
function corsHeaders(req) {
  const allow = process.env.ALLOW_ORIGIN || req.headers.origin || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, If-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Vary": "Origin",
  };
}

function readBody(req, limitBytes) {
  const limit = limitBytes || 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      /* A whole business is small. Anything bigger is a mistake or an
         attempt to fill the disk. */
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { code: "TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* Constant-time-ish token check. The token is compared as bytes so a
   wrong one can't be found a character at a time. */
function authorised(req) {
  if (!TOKEN) return true;   // only reachable on localhost, see boot()
  const header = String(req.headers.authorization || "");
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---- routes ------------------------------------------------------------ */

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return send(res, 204, "", cors);

  if (url.pathname === "/health") {
    return send(res, 200, { ok: true, version: store.read().version }, cors);
  }

  /* ---- Slack: signed, and never behind the API token ---------------- */
  if (url.pathname === "/slack/commands" && req.method === "POST") {
    let raw;
    try {
      raw = await readBody(req, 128 * 1024);
    } catch (err) {
      return send(res, 413, { error: "body too large" }, cors);
    }
    const check = slack.verify(SIGNING_SECRET, {
      timestamp: req.headers["x-slack-request-timestamp"],
      signature: req.headers["x-slack-signature"],
      body: raw,
    }, Date.now());

    if (!check.ok) {
      console.warn(`slack: refused (${check.reason})`);
      /* Say no without saying why — the reason is for the log, not for
         whoever is knocking. */
      return send(res, 401, { error: "unauthorised" }, cors);
    }

    const params = new URLSearchParams(raw);
    const command = slack.parseCommand(params.get("text"));
    let envelope;
    try {
      envelope = store.read();
    } catch (err) {
      return send(res, 200, {
        response_type: "ephemeral",
        text: `I can't read the business file: ${err.message}`,
      }, cors);
    }
    console.log(`slack: /${params.get("command") || "employee"} ${command} from ${params.get("user_name") || "?"}`);
    return send(res, 200, slack.reply(AE, envelope.data, command, new Date()), cors);
  }

  /* ---- the record ---------------------------------------------------- */
  if (url.pathname.startsWith("/api/")) {
    if (!authorised(req)) return send(res, 401, { error: "bad or missing token" }, cors);

    /* Cheap, and behind the token on purpose: this is what the app's
       "Test" button calls, so a wrong token has to fail here rather
       than at the next push. /health stays open for uptime checks. */
    if (url.pathname === "/api/ping" && req.method === "GET") {
      try {
        return send(res, 200, { ok: true, version: store.read().version }, cors);
      } catch (err) {
        return send(res, 500, { error: err.message }, cors);
      }
    }

    if (url.pathname === "/api/business" && req.method === "GET") {
      try {
        const envelope = store.read();
        return send(res, 200, envelope, Object.assign({ ETag: `"${envelope.version}"` }, cors));
      } catch (err) {
        return send(res, 500, { error: err.message }, cors);
      }
    }

    if (url.pathname === "/api/business" && req.method === "PUT") {
      let raw;
      try {
        raw = await readBody(req);
      } catch (err) {
        return send(res, 413, { error: "body too large" }, cors);
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return send(res, 400, { error: "body is not JSON" }, cors);
      }
      /* If-Match is the honest way to say "I last saw version N". A
         client that sends nothing is saying "overwrite regardless",
         which the app never does but curl might. */
      const match = req.headers["if-match"];
      const expected = match == null ? null : String(match).replace(/"/g, "");
      /* The envelope { data: … } or the record itself — but only if it
         really is one. A body that isn't a business must not be allowed
         to become an empty one. */
      const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
                     parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
      const problem = AE.store.validate(record);
      if (problem) return send(res, 400, { error: problem }, cors);

      try {
        const envelope = store.write(record, expected, new Date());
        console.log(`api: saved version ${envelope.version}`);
        return send(res, 200, envelope, Object.assign({ ETag: `"${envelope.version}"` }, cors));
      } catch (err) {
        if (err.code === "INVALID") return send(res, 400, { error: err.message }, cors);
        if (err.code === "CONFLICT") {
          return send(res, 409, {
            error: err.message,
            current: { version: err.current.version, updatedAt: err.current.updatedAt },
          }, cors);
        }
        return send(res, 500, { error: err.message }, cors);
      }
    }

    if (url.pathname === "/api/brief" && req.method === "GET") {
      try {
        const envelope = store.read();
        const brief = AE.brief.build(envelope.data, new Date());
        if (url.searchParams.get("format") === "text") {
          const lines = [brief.dateLabel, brief.headline, ""];
          for (const sec of brief.sections) {
            lines.push(`${sec.title}:`);
            for (const item of sec.items) lines.push(`  - ${item.text}${item.meta ? ` (${item.meta})` : ""}`);
            lines.push("");
          }
          return send(res, 200, lines.join("\n"), cors);
        }
        return send(res, 200, brief, cors);
      } catch (err) {
        return send(res, 500, { error: err.message }, cors);
      }
    }

    return send(res, 404, { error: "no such endpoint" }, cors);
  }

  return send(res, 404, { error: "not found" }, cors);
}

/* ---- speaking first ----------------------------------------------------- */

async function postBrief(force) {
  if (!WEBHOOK_URL) {
    console.error("SLACK_WEBHOOK_URL is not set — nothing to post to.");
    process.exitCode = 1;
    return;
  }
  const envelope = store.read();
  const now = new Date();
  if (!force && !slack.worthPosting(AE, envelope.data, now)) {
    /* A daily "nothing to report" trains everyone to ignore the channel.
       Silence is the correct message on a quiet day. */
    console.log("Nothing urgent enough to post. Use --post --force to send it anyway.");
    return;
  }
  const payload = slack.reply(AE, envelope.data, "brief", now, { responseType: "in_channel" });
  await slack.post(WEBHOOK_URL, payload);
  console.log("Posted the morning read to Slack.");
}

/* ---- boot ---------------------------------------------------------------- */

function boot() {
  const argv = process.argv.slice(2);
  if (argv.includes("--post")) return postBrief(argv.includes("--force"));

  if (!TOKEN && !LOCAL_HOSTS.has(HOST)) {
    console.error(
      `Refusing to listen on ${HOST} without EMPLOYEE_TOKEN.\n` +
      "This file holds a whole business, including what every client owes.\n" +
      "Set a token, or bind to 127.0.0.1."
    );
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("unhandled:", err);
      if (!res.headersSent) send(res, 500, { error: "server error" }, corsHeaders(req));
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`The AI Employee — http://${HOST}:${PORT}`);
    console.log(`  data      ${DATA_FILE}`);
    console.log(`  api       ${TOKEN ? "token required" : "open (localhost only)"}`);
    console.log(`  slack     ${SIGNING_SECRET ? "slash commands ready at /slack/commands" : "no signing secret — commands refused"}`);
    console.log(`  webhook   ${WEBHOOK_URL ? "set (--post will send)" : "not set"}`);
  });
  return server;
}

/* Only when run directly, so the suite can import the pieces. */
if (process.argv[1] && process.argv[1].endsWith("employee-server.mjs")) boot();

export { handle, boot, postBrief, store, AE };
