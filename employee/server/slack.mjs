/* ================================================
   THE AI EMPLOYEE — server/slack.mjs
   The employee, in the channel where the work is discussed.

   Two directions:

     - it answers.  A slash command (/employee, /employee money) comes in
       signed by Slack; this verifies the signature, works out what was
       asked, and builds the reply.
     - it speaks first.  The morning read, posted to an incoming webhook
       on a schedule, so the day starts with the short list rather than
       with nine screens.

   Everything here is a pure function of the record plus a clock, which
   is what lets the suite check the replies without a socket or a token.
   ================================================ */

import { createHmac, timingSafeEqual } from "node:crypto";

/* ---- 1. is this really Slack? ---------------------------------------
   Slack signs every request: v0, the timestamp, and the raw body. The
   body must be the bytes as received — parse it first and the signature
   will never match again.                                            */

export const MAX_SKEW_SECONDS = 300;

export function verify(signingSecret, { timestamp, body, signature }, now) {
  if (!signingSecret) return { ok: false, reason: "no signing secret configured" };
  if (!timestamp || !signature) return { ok: false, reason: "unsigned request" };

  const age = Math.abs(Math.floor((now || Date.now()) / 1000) - Number(timestamp));
  if (!Number.isFinite(age)) return { ok: false, reason: "bad timestamp" };
  /* A replayed request from an hour ago is not a request. */
  if (age > MAX_SKEW_SECONDS) return { ok: false, reason: "timestamp too old" };

  const expected = "v0=" + createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  /* Compare in constant time, and only when the lengths already match —
     timingSafeEqual throws on a length mismatch. */
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}

/* ---- 2. what was asked ----------------------------------------------- */

export const COMMANDS = ["brief", "money", "chase", "quiet", "pipeline", "help"];

export function parseCommand(text) {
  const word = String(text || "").trim().toLowerCase().split(/\s+/)[0] || "brief";
  const aliases = {
    "": "brief", morning: "brief", today: "brief", read: "brief",
    invoices: "money", cash: "money", paid: "money",
    owed: "chase", late: "chase", overdue: "chase",
    updates: "quiet", silent: "quiet",
    leads: "pipeline", growth: "pipeline", deals: "pipeline",
    "?": "help",
  };
  const name = aliases[word] || word;
  return COMMANDS.includes(name) ? name : "unknown";
}

/* ---- 3. the reply -----------------------------------------------------
   Slack's mrkdwn is not markdown: &, < and > carry meaning, so anything
   coming out of the record is escaped before it goes in a message.   */

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const DOT = { red: ":red_circle:", amber: ":large_orange_circle:", blue: ":large_blue_circle:" };

function section(text) {
  return { type: "section", text: { type: "mrkdwn", text } };
}
function context(text) {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}

/* The morning read, as the channel sees it. Sections are capped because
   a message nobody scrolls to the end of is a message nobody read. */
export function briefBlocks(AE, db, now, opts) {
  const o = opts || {};
  const limit = Number(o.itemsPerSection) || 4;
  const b = AE.brief.build(db, now);
  const blocks = [
    { type: "header", text: { type: "plain_text", text: "The morning read", emoji: true } },
    context(`*${esc(b.dateLabel)}* · ${esc(db.settings.businessName || "")}`),
    section(`*${esc(b.headline)}*`),
  ];

  if (!b.sections.length) {
    blocks.push(section("_Nothing needs you. Everything on the books is on schedule._"));
    return blocks;
  }

  for (const sec of b.sections) {
    blocks.push({ type: "divider" });
    const lines = sec.items.slice(0, limit).map(
      (it) => `${DOT[it.severity] || DOT.blue} ${esc(it.text)}${it.meta ? `\n   _${esc(it.meta)}_` : ""}`
    );
    if (sec.items.length > limit) {
      lines.push(`_…and ${sec.items.length - limit} more._`);
    }
    blocks.push(section(`*${esc(sec.title)}*\n${lines.join("\n")}`));
  }
  return blocks;
}

function moneyBlocks(AE, db, now) {
  const U = AE.util;
  const cur = db.settings.currency;
  const t = AE.money.totals(db, now);
  const chasing = AE.money.needsChasing(db, now);
  const blocks = [
    { type: "header", text: { type: "plain_text", text: "Money", emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Outstanding*\n${U.money(t.outstanding, cur)}` },
        { type: "mrkdwn", text: `*Overdue*\n${U.money(t.overdue, cur)}` },
        { type: "mrkdwn", text: `*Not yet invoiced*\n${U.money(t.uninvoiced, cur)}` },
        { type: "mrkdwn", text: `*Paid this month*\n${U.money(t.paidMonth, cur)}` },
      ],
    },
  ];
  if (t.avgDaysToPay != null) {
    blocks.push(context(`Clients usually take *${U.plural(t.avgDaysToPay, "day")}* to pay.`));
  }
  if (chasing.length) {
    blocks.push({ type: "divider" });
    blocks.push(section("*To chase*\n" + chasing.map((row) => {
      const name = db.clients.find((c) => c.id === row.invoice.clientId);
      return `${DOT.red} ${esc(name ? name.name : "—")} — ${esc(row.invoice.number)} · ${U.money(row.state.amount, cur)} _(${esc(row.state.label)})_`;
    }).join("\n")));
  }
  return blocks;
}

function chaseBlocks(AE, db, now) {
  const U = AE.util;
  const cur = db.settings.currency;
  const invoices = AE.money.needsChasing(db, now);
  const leads = AE.growth.needsTouch(db, now);
  const promises = db.promises.filter((p) => !p.kept && (!p.due || U.daysUntil(p.due, now) <= 0));

  const blocks = [{ type: "header", text: { type: "plain_text", text: "Worth chasing", emoji: true } }];
  if (!invoices.length && !leads.length && !promises.length) {
    blocks.push(section("_Nothing is waiting on a nudge._"));
    return blocks;
  }
  if (invoices.length) {
    blocks.push(section("*Money*\n" + invoices.map((r) =>
      `${DOT.red} ${esc(r.invoice.number)} · ${U.money(r.state.amount, cur)} — ${esc(r.state.label)}`).join("\n")));
  }
  if (promises.length) {
    blocks.push(section("*Promises you made*\n" + promises.map((p) => {
      const c = db.clients.find((x) => x.id === p.clientId);
      return `${DOT.amber} ${esc(p.text)}\n   _${esc(c ? c.name : "")} · on a ${esc(p.source || "call")}_`;
    }).join("\n")));
  }
  if (leads.length) {
    blocks.push(section("*Conversations going quiet*\n" + leads.map((r) =>
      `${DOT.amber} ${esc(r.lead.name)} — ${esc(r.health.reason)}`).join("\n")));
  }
  return blocks;
}

function quietBlocks(AE, db, now) {
  const U = AE.util;
  const due = AE.brief.updateDue(db, now);
  const blocks = [{ type: "header", text: { type: "plain_text", text: "Clients owed an update", emoji: true } }];
  if (!due.length) {
    blocks.push(section(`_Everyone has heard from you inside ${U.plural(db.settings.updateEveryDays, "day")}._`));
    return blocks;
  }
  for (const row of due) {
    blocks.push(section(
      `*${esc(row.client.name)}* — ${row.daysSince == null ? "no update logged yet" : `last heard from you ${esc(U.plural(row.daysSince, "day"))} ago`}\n` +
      `   _${esc(U.plural(row.projects.length, "live project"))}_`
    ));
  }
  return blocks;
}

function pipelineBlocks(AE, db, now) {
  const U = AE.util;
  const cur = db.settings.currency;
  const p = AE.growth.pipeline(db, now);
  const blocks = [
    { type: "header", text: { type: "plain_text", text: "Pipeline", emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Open*\n${U.money(p.openValue, cur)} across ${U.plural(p.open, "conversation")}` },
        { type: "mrkdwn", text: `*Weighted*\n${U.money(p.weighted, cur)}` },
        { type: "mrkdwn", text: `*Gone quiet*\n${p.stalled}` },
        { type: "mrkdwn", text: `*Win rate*\n${p.winRate == null ? "—" : p.winRate + "%"}` },
      ],
    },
  ];
  const needing = AE.growth.needsTouch(db, now);
  if (needing.length) {
    blocks.push(section("*Needs a touch*\n" + needing.map((r) =>
      `${DOT.amber} ${esc(r.lead.name)} — ${esc(r.health.reason)} · ${U.money(r.lead.value, cur)}`).join("\n")));
  }
  return blocks;
}

function helpBlocks() {
  return [
    { type: "header", text: { type: "plain_text", text: "What I can tell you", emoji: true } },
    section([
      "`/employee` — the morning read: what needs a decision or has a deadline",
      "`/employee money` — outstanding, overdue, and what hasn't been invoiced",
      "`/employee chase` — invoices, promises and proposals waiting on a nudge",
      "`/employee quiet` — clients who haven't heard from you",
      "`/employee pipeline` — what's open and what's gone cold",
    ].join("\n")),
    context("The record lives in the app — this reads it, it doesn't change it."),
  ];
}

/* One entry point: a command name in, a Slack message payload out. */
export function reply(AE, db, command, now, opts) {
  const blocks =
    command === "money" ? moneyBlocks(AE, db, now) :
    command === "chase" ? chaseBlocks(AE, db, now) :
    command === "quiet" ? quietBlocks(AE, db, now) :
    command === "pipeline" ? pipelineBlocks(AE, db, now) :
    command === "help" ? helpBlocks() :
    command === "unknown" ? [section("I don't know that one. Try `/employee help`.")] :
    briefBlocks(AE, db, now, opts);

  return {
    response_type: (opts && opts.responseType) || "ephemeral",
    text: fallbackText(AE, db, command, now),   // notifications and screen readers
    blocks,
  };
}

/* The one-line version Slack shows in a notification, and the whole
   message for anything that can't render blocks. */
export function fallbackText(AE, db, command, now) {
  if (command === "help") return "What the employee can tell you.";
  if (command === "unknown") return "Unknown command — try /employee help.";
  const U = AE.util;
  const cur = db.settings.currency;
  if (command === "money") {
    const t = AE.money.totals(db, now);
    return `${U.money(t.outstanding, cur)} outstanding, ${U.money(t.overdue, cur)} overdue.`;
  }
  if (command === "pipeline") {
    const p = AE.growth.pipeline(db, now);
    return `${U.money(p.openValue, cur)} open, ${p.stalled} gone quiet.`;
  }
  if (command === "quiet") {
    const due = AE.brief.updateDue(db, now);
    return due.length ? `${U.plural(due.length, "client")} owed an update.` : "Every client is up to date.";
  }
  if (command === "chase") {
    const n = AE.money.needsChasing(db, now).length + AE.growth.needsTouch(db, now).length;
    return n ? `${U.plural(n, "thing")} worth chasing.` : "Nothing waiting on a nudge.";
  }
  return AE.brief.build(db, now).headline;
}

/* ---- 4. speaking first ------------------------------------------------ */

/* Posting to an incoming webhook. Slack ignores response_type there, and
   a webhook message is always visible to the channel. */
export async function post(webhookUrl, payload, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const res = await doFetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: payload.text, blocks: payload.blocks }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Slack responded ${res.status}: ${body.slice(0, 200)}`);
  return body;
}

/* Whether this is worth waking a channel for. A quiet day should not
   produce a daily "nothing to report" that trains everyone to ignore it. */
export function worthPosting(AE, db, now, opts) {
  const b = AE.brief.build(db, now);
  const min = (opts && opts.minSeverity) || "amber";
  if (min === "any") return b.counts.total > 0;
  if (min === "red") return b.counts.red > 0;
  return b.counts.red + b.counts.amber > 0;
}
