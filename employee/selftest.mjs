#!/usr/bin/env node
/* ================================================
   THE AI EMPLOYEE — selftest.mjs
   The reasoning, checked without a browser.

     node employee/selftest.mjs

   The modules are plain scripts that hang themselves off a global, so
   this runs them in a sandbox with just enough window to satisfy them
   and then exercises what they decide: which revision round is billable,
   whether a QA pass still counts after the work changed, when an invoice
   turns into a chase, which proposal has gone quiet, and what the
   morning read says about all of it.

   ui.js and app.js are left out — they need a DOM, and what they do is
   render what the modules below decide.
   ================================================ */

import { readFileSync, existsSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { loadModules } from "./server/modules.mjs";
import { BusinessStore } from "./server/store-file.mjs";
import * as slack from "./server/slack.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/* The sandbox lives in server/modules.mjs now: the server runs these
   same files, so there is one loader and no second copy to drift. */
/* ---- a very small test runner -------------------------------------- */
let passed = 0;
const failures = [];
let group = "";

function describe(name, fn) { group = name; fn(); }

/* An async test can't run inline: two of them in flight at once would
   interleave on the same module state, which is how a suite starts
   passing and failing by luck. They're queued and run in order, after
   everything synchronous. */
const queued = [];
function it(name, fn) {
  const where = group;
  if (fn.constructor.name === "AsyncFunction") { queued.push([where, name, fn]); return; }
  try { fn(); passed += 1; }
  catch (err) { failures.push(`${where} → ${name}\n    ${err.message}`); }
}
async function runQueued() {
  for (const [where, name, fn] of queued) {
    try { await fn(); passed += 1; }
    catch (err) { failures.push(`${where} → ${name}\n    ${err.message}`); }
  }
}
function eq(actual, expected, note) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${note || "expected"} ${b}, got ${a}`);
}
function ok(value, note) {
  if (!value) throw new Error(note || `expected truthy, got ${JSON.stringify(value)}`);
}
function near(actual, expected, tol, note) {
  if (Math.abs(Number(actual) - Number(expected)) > (tol || 0.01)) {
    throw new Error(`${note || "expected"} ~${expected}, got ${actual}`);
  }
}

const { AE, localStorage } = loadModules();
const { util: U, store, margin, qa, money, growth, brief, install, sync } = AE;

/* A fixed "now" so nothing here depends on the day it runs. */
const NOW = new Date(2026, 4, 20, 9, 0, 0); // Wed 20 May 2026, local
const TODAY = U.isoDay(NOW);
const day = (n) => U.addDays(TODAY, n);

/* ================================================================== */
describe("util — days", () => {
  it("formats a local day", () => eq(U.isoDay(new Date(2026, 0, 5)), "2026-01-05"));
  it("adds days across a month boundary", () => eq(U.addDays("2026-01-30", 3), "2026-02-02"));
  it("adds days across a year boundary", () => eq(U.addDays("2026-12-30", 3), "2027-01-02"));
  it("counts days between, signed", () => {
    eq(U.daysBetween("2026-05-01", "2026-05-08"), 7);
    eq(U.daysBetween("2026-05-08", "2026-05-01"), -7);
  });
  it("treats a due date as a local day, not a UTC instant", () => {
    // 23:30 local on the due date is still due today, not overdue.
    const late = new Date(2026, 4, 20, 23, 30);
    eq(U.daysUntil(day(0), late), 0);
    eq(U.isPast(day(0), late), false);
  });
  it("phrases relative days", () => {
    eq(U.relDay(day(0), NOW), "today");
    eq(U.relDay(day(1), NOW), "tomorrow");
    eq(U.relDay(day(-3), NOW), "3 days ago");
    eq(U.relDay(day(4), NOW), "in 4 days");
  });
  it("finds Monday of the week", () => eq(U.weekStart(NOW), "2026-05-18"));
  it("rejects a date it cannot read", () => eq(U.isoDay("not a date"), ""));
});

describe("util — money and text", () => {
  it("rounds to cents without drift", () => {
    near(U.round2(0.1 + 0.2), 0.3);
    eq(U.sum([{ a: 10.005 }, { a: 20.004 }], (x) => x.a), 30.01);
  });
  it("clips without cutting a word", () => {
    eq(U.clip("the quick brown fox jumps", 12), "the quick…");
    eq(U.clip("short", 12), "short");
  });
  it("pluralises", () => {
    eq(U.plural(1, "day"), "1 day");
    eq(U.plural(2, "day"), "2 days");
    eq(U.plural(2, "touch", "touches"), "2 touches");
  });
  it("escapes html", () => eq(U.esc('<b>&"</b>'), "&lt;b&gt;&amp;&quot;&lt;/b&gt;"));
});

/* ================================================================== */
describe("store", () => {
  it("starts from defaults when storage is empty", () => {
    const db = store.load();
    eq(db.version, store.SCHEMA_VERSION);
    eq(db.clients.length, 0);
    eq(db.seeded, false);
  });

  it("survives a corrupt file", () => {
    localStorage.setItem(store.KEY, "{not json");
    const db = store.load();
    eq(db.clients.length, 0);
  });

  it("fills in fields a stored file predates", () => {
    const db = store.hydrate({ version: 0, clients: [{ id: "c1", name: "Old" }] });
    eq(db.clients.length, 1);
    eq(db.leads.length, 0);
    eq(db.settings.reminderDays, 3, "missing setting defaulted to");
  });

  it("adds, updates and removes", () => {
    store.reset();
    const client = store.add("clients", { name: "Testco" });
    ok(client.id, "record got an id");
    store.update("clients", client.id, { name: "Testco Ltd" });
    eq(store.find("clients", client.id).name, "Testco Ltd");
    eq(store.remove("clients", client.id), true);
    eq(store.find("clients", client.id), null);
  });

  it("tells subscribers when something moved", () => {
    store.reset();
    let calls = 0;
    const off = store.subscribe(() => { calls += 1; });
    store.add("clients", { name: "Watched" });
    off();
    store.add("clients", { name: "Unwatched" });
    eq(calls, 1);
  });

  it("refuses anything that is not a business record", () => {
    // hydrate() is forgiving, which on the way in means a string, a
    // number or a stray array would quietly become an empty business
    // and overwrite a real one. This is the check that stops that.
    for (const junk of ["a string", 42, null, [1, 2, 3], true]) {
      ok(store.validate(junk), `${JSON.stringify(junk)} should be refused`);
    }
    eq(store.validate(store.defaults()), null, "a real record passes");
    eq(store.validate({ clients: [] }), null, "so does a partial one");
    ok(store.validate({ clients: "nope" }), "a collection that is not a list");
    ok(store.validate({ settings: [] }), "settings that are not an object");
    ok(store.validate({ unrelated: true }), "an object with none of the fields");
  });

  it("will not let a bad import erase a real business", () => {
    store.seed(NOW);
    for (const junk of ['"a string"', "[1,2,3]", "42", "null", '{"unrelated":true}']) {
      let threw = false;
      try { store.importJSON(junk); } catch (err) { threw = true; }
      ok(threw, `importing ${junk} should throw`);
      eq(store.data().clients.length, 3, `and leave the business alone after ${junk}`);
    }
  });

  it("imports the server's envelope as well as a plain export", () => {
    store.seed(NOW);
    const plain = store.exportJSON();
    store.reset();
    store.importJSON(JSON.stringify({ version: 4, updatedAt: "x", data: JSON.parse(plain) }));
    eq(store.data().clients.length, 3, "unwrapped the envelope");
  });

  it("round-trips through export and import", () => {
    store.seed(NOW);
    const json = store.exportJSON();
    store.reset();
    eq(store.data().clients.length, 0);
    store.importJSON(json);
    eq(store.data().clients.length, 3);
    eq(store.data().projects.length, 3);
  });

  it("seeds a business with the usual mess in it", () => {
    const db = store.seed(NOW);
    ok(db.clients.length >= 3, "has clients");
    ok(db.revisions.some((r) => r.scope === "extra"), "has an over-scope revision");
    ok(db.promises.some((p) => !p.kept), "has an open promise");
    ok(db.invoices.some((i) => i.status === "sent" && i.dueAt < TODAY), "has an overdue invoice");
  });
});

/* ================================================================== */
describe("margin — the revision log", () => {
  const db = store.seed(NOW);
  const s = margin.state(db, "pr_north1");

  it("counts rounds against the rounds that were sold", () => {
    eq(s.used, 3);
    eq(s.included, 2);
    eq(s.overRounds, 1);
    eq(s.remaining, 0);
  });

  it("prices the overage at the client's revision rate", () => {
    eq(s.extra.length, 1);
    eq(s.extraValue, 180);
    eq(s.unbilledValue, 180);
  });

  it("falls back to time at the hourly rate when no round price is set", () => {
    const client = { rate: 100, revisionsIncluded: 1, revisionRate: 0 };
    const rev = { round: 2, minutes: 90 };
    eq(margin.amountFor(rev, client), 150);
  });

  it("treats a goodwill round as absorbed, not free by accident", () => {
    const client = { revisionsIncluded: 1, revisionRate: 200 };
    eq(margin.classify({ round: 3, scope: "goodwill" }, client), "goodwill");
    eq(margin.amountFor({ round: 3, scope: "goodwill" }, client), 0);
    eq(margin.classify({ round: 3 }, client), "extra");
  });

  it("works out what the fee really pays per hour", () => {
    // 6800 fee against 600 minutes of revisions = 10 hours logged.
    near(s.effectiveRate, 680);
    eq(s.underwater, false, "680/h beats the 95/h agreed");
  });

  it("spots a job that has gone underwater", () => {
    const local = store.seed(NOW);
    for (let i = 0; i < 40; i += 1) {
      local.revisions.push({ id: "x" + i, projectId: "pr_ferns1", round: 10 + i,
        requestedAt: day(-2), scope: "goodwill", summary: "another tweak", minutes: 60 });
    }
    const m = margin.state(local, "pr_ferns1");
    ok(m.effectiveRate < m.agreedRate, "effective rate fell below the agreed rate");
    eq(m.underwater, true);
  });

  it("numbers the next round itself", () => eq(margin.nextRound(db, "pr_north1"), 4));

  it("hands invoicing a reconciled line", () => {
    const lines = margin.billableLines(db, "pr_north1");
    eq(lines.length, 1);
    eq(lines[0].amount, 180);
    ok(/Revision round 3/.test(lines[0].desc), "line names the round");
  });

  it("ranks projects by what they are owed", () => {
    const rows = margin.unbilledAcross(db);
    eq(rows[0].project.id, "pr_north1");
  });
});

/* ================================================================== */
describe("qa — the pass before it ships", () => {
  it("builds the list from the client file, not a template", () => {
    const db = store.seed(NOW);
    const checks = qa.checklistFor(db, "pr_north1");
    const labels = checks.map((c) => c.label);
    ok(labels.some((l) => /stock photography/.test(l)), "client rule became a check");
    ok(labels.some((l) => /pricing table/.test(l)), "open promise became a check");
    ok(labels.some((l) => /unbilled/.test(l)), "unbilled overage became a check");
    ok(checks.some((c) => c.key === "brief"), "standard checks included");
  });

  it("blocks delivery until it has been run", () => {
    const db = store.seed(NOW);
    const gate = qa.canShip(db, "pr_north1");
    eq(gate.ok, false);
    ok(gate.reasons.some((r) => /No QA pass/.test(r)), "says why");
  });

  it("passes when every check is ticked", () => {
    const db = store.seed(NOW);
    const results = {};
    for (const c of qa.checklistFor(db, "pr_north1")) results[c.key] = true;
    db.qaRuns.push(qa.record(db, "pr_north1", results, NOW));
    eq(qa.status(db, "pr_north1").passed, true);
    eq(qa.canShip(db, "pr_north1").ok, true);
  });

  it("names the check that failed", () => {
    const db = store.seed(NOW);
    const checks = qa.checklistFor(db, "pr_north1");
    const results = {};
    for (const c of checks) results[c.key] = true;
    results[checks[0].key] = false;
    db.qaRuns.push(qa.record(db, "pr_north1", results, NOW));
    const gate = qa.canShip(db, "pr_north1");
    eq(gate.ok, false);
    eq(gate.reasons[0], checks[0].label);
  });

  it("goes stale when a new revision lands after the pass", () => {
    const db = store.seed(NOW);
    const results = {};
    for (const c of qa.checklistFor(db, "pr_north1")) results[c.key] = true;
    db.qaRuns.push(qa.record(db, "pr_north1", results, NOW));
    eq(qa.status(db, "pr_north1").passed, true);

    db.revisions.push({ id: "rv_new", projectId: "pr_north1", round: 4,
      requestedAt: day(1), scope: "extra", summary: "one more thing", minutes: 30 });
    const after = qa.status(db, "pr_north1");
    eq(after.stale, true);
    eq(after.passed, false);
    ok(qa.canShip(db, "pr_north1").reasons.some((r) => /predates/.test(r)), "says the pass is out of date");
  });

  it("can be turned off, and says the delivery was forced", () => {
    const db = store.seed(NOW);
    db.settings.qaBlocksDelivery = false;
    const gate = qa.canShip(db, "pr_north1");
    eq(gate.ok, true);
    eq(gate.forced, true);
  });
});

/* ================================================================== */
describe("money — invoicing", () => {
  const db = store.seed(NOW);

  it("reads state from the calendar, not the label", () => {
    const overdue = db.invoices.find((i) => i.id === "in_1");
    const s = money.stateOf(overdue, db.settings, NOW);
    eq(s.state, "overdue");
    eq(s.daysLate, 5);
    eq(s.amount, 1450);
  });

  it("flags one that is nearly due", () => {
    const inv = { status: "sent", dueAt: day(3), lines: [{ amount: 100 }] };
    eq(money.stateOf(inv, db.settings, NOW).state, "due_soon");
    eq(money.stateOf({ status: "sent", dueAt: day(20), lines: [] }, db.settings, NOW).state, "sent");
  });

  it("chases once, then waits the reminder gap before chasing again", () => {
    const base = { status: "sent", dueAt: day(-10), lines: [{ amount: 500 }] };
    eq(money.stateOf(base, db.settings, NOW).needsReminder, true, "never chased");
    const chasedToday = Object.assign({}, base, { reminders: [day(0)] });
    eq(money.stateOf(chasedToday, db.settings, NOW).needsReminder, false, "already chased today");
    const chasedAgesAgo = Object.assign({}, base, { reminders: [day(-5)] });
    eq(money.stateOf(chasedAgesAgo, db.settings, NOW).needsReminder, true, "gap elapsed");
  });

  it("never chases a paid or void invoice", () => {
    eq(money.stateOf({ status: "paid", dueAt: day(-40), lines: [] }, db.settings, NOW).needsReminder, false);
    eq(money.stateOf({ status: "void", dueAt: day(-40), lines: [] }, db.settings, NOW).state, "void");
  });

  it("adds up the cash position", () => {
    const t = money.totals(db, NOW);
    eq(t.outstanding, 7150, "1450 overdue + 5700 sent");
    eq(t.overdue, 1450);
    eq(t.uninvoiced, 180, "the unbilled extra round");
    eq(t.avgDaysToPay, 15);
  });

  it("ages the debt", () => {
    const a = money.aging(db, NOW);
    eq(a.d1_30, 1450);
    eq(a.current, 5700);
    eq(a.d60plus, 0);
  });

  it("numbers invoices sequentially within the year", () => {
    eq(money.nextNumber(db, NOW), "2026-045");
    eq(money.nextNumber({ invoices: [] }, NOW), "2026-001");
  });

  it("drafts from what the project is actually owed", () => {
    const draft = money.draftFor(db, "pr_north1", NOW);
    // 6800 fee, 3400 deposit already invoiced, plus the 180 extra round.
    eq(draft.lines.length, 2);
    eq(draft.lines[0].amount, 3400);
    eq(draft.lines[1].amount, 180);
    eq(money.total(draft), 3580);
    eq(draft.dueAt, U.addDays(TODAY, 14), "client's payment terms");
  });

  it("drafts only the overage when the fee is already invoiced", () => {
    const local = store.seed(NOW);
    local.invoices.push({ id: "in_x", clientId: "cl_north", projectId: "pr_north1",
      number: "2026-050", issuedAt: day(-1), dueAt: day(13), status: "sent",
      lines: [{ desc: "balance", amount: 3400 }] });
    const draft = money.draftFor(local, "pr_north1", NOW);
    eq(draft.lines.length, 1);
    eq(draft.lines[0].amount, 180);
  });

  it("writes a chase that carries the facts", () => {
    const text = money.reminderDraft(db, "in_1", NOW);
    ok(/2026-041/.test(text), "names the invoice");
    ok(/Menu & window vinyl/.test(text), "lists the line");
  });

  it("escalates the wording on the second chase", () => {
    const local = store.seed(NOW);
    const inv = local.invoices.find((i) => i.id === "in_1");
    const first = money.reminderDraft(local, "in_1", NOW);
    inv.reminders = [day(-4)];
    const second = money.reminderDraft(local, "in_1", NOW);
    ok(/ignore this/.test(first), "first one is gentle");
    ok(/past its due date/.test(second) && /payment date/.test(second), "second one asks for a date");
  });

  it("lists what to chase, worst first", () => {
    const rows = money.needsChasing(db, NOW);
    eq(rows.length, 1);
    eq(rows[0].invoice.id, "in_1");
  });
});

/* ================================================================== */
describe("growth — the pipeline", () => {
  const db = store.seed(NOW);

  it("calls a proposal stalled on the missing third touch", () => {
    const lead = db.leads.find((l) => l.id === "ld_1");
    const h = growth.healthOf(lead, db.settings, NOW);
    eq(h.count, 2);
    eq(h.stalled, true);
    ok(/needs touch 3/.test(h.reason), `reason was: ${h.reason}`);
  });

  it("leaves a conversation alone when it was touched recently", () => {
    const lead = db.leads.find((l) => l.id === "ld_3");
    eq(growth.healthOf(lead, db.settings, NOW).stalled, false);
  });

  it("does not chase a closed lead", () => {
    const won = { stage: "won", value: 100, touches: [] };
    const h = growth.healthOf(won, db.settings, NOW);
    eq(h.open, false);
    eq(h.stalled, false);
  });

  it("discounts the pipeline by the odds of each stage", () => {
    const p = growth.pipeline(db, NOW);
    eq(p.open, 3);
    eq(p.openValue, 15700);
    // 4200*0.3 + 9000*0.6 + 2500*0.1 = 1260 + 5400 + 250
    eq(p.weighted, 6910);
  });

  it("reports a win rate only once something has closed", () => {
    eq(growth.pipeline(db, NOW).winRate, null);
    const local = store.seed(NOW);
    local.leads.push({ id: "w1", name: "Won co", stage: "won", value: 1000, touches: [] });
    local.leads.push({ id: "l1", name: "Lost co", stage: "lost", value: 1000, touches: [] });
    eq(growth.pipeline(local, NOW).winRate, 50);
  });

  it("writes the third touch as a decision, either way", () => {
    const text = growth.nextTouchDraft(db, "ld_1", NOW);
    ok(/Last note from me/.test(text), "it is the closing touch");
    ok(/close the file/.test(text), "offers a no as an answer");
  });
});

/* ================================================================== */
describe("brief — the morning read", () => {
  const db = store.seed(NOW);
  const b = brief.build(db, NOW);
  const section = (id) => b.sections.find((s) => s.id === id);

  it("leads with what the day actually is", () => {
    ok(/2 things need you today/.test(b.headline), `headline was: ${b.headline}`);
    ok(b.counts.total > 0);
  });

  it("puts the decision at the top", () => {
    eq(b.sections[0].id, "decisions");
    ok(/bill round 3 or absorb it/.test(section("decisions").items[0].text));
  });

  it("surfaces the promise made on a call", () => {
    const items = section("promises").items;
    ok(items.some((i) => /pricing table/.test(i.text)), "the call promise is there");
    ok(items.some((i) => /promised on a call/.test(i.meta)), "says where it came from");
  });

  it("carries the overdue invoice and the unbilled round", () => {
    ok(/2026-041/.test(section("money").items[0].text));
    ok(/not billed/.test(section("margin").items[0].text));
  });

  it("names the client who has gone quiet", () => {
    ok(section("quiet").items.some((i) => /Harbor Labs/.test(i.text)), "Harbor Labs never got an update");
  });

  it("does not chase Fernside, who was updated 3 days ago", () => {
    eq(brief.updateDue(db, NOW).some((r) => r.client.id === "cl_ferns"), false);
  });

  it("holds the delivery that has not passed QA", () => {
    ok(/to clear before it ships/.test(section("shipping").items[0].text));
  });

  it("flags the contractor's late task", () => {
    eq(section("team"), undefined, "Sam has nothing past due yet");
    const local = store.seed(NOW);
    local.tasks.find((t) => t.id === "tk_3").due = day(-2);
    const late = brief.build(local, NOW).sections.find((s) => s.id === "team");
    ok(/Sam/.test(late.items[0].text));
  });

  it("orders red before amber inside a section", () => {
    for (const s of b.sections) {
      const ranks = s.items.map((i) => ({ red: 0, amber: 1, blue: 2 })[i.severity]);
      eq(ranks.slice().sort().join(""), ranks.join(""), `${s.id} out of order`);
    }
  });

  it("says so plainly when there is nothing to do", () => {
    const quiet = brief.build(store.defaults(), NOW);
    eq(quiet.counts.total, 0);
    ok(/Nothing needs you/.test(quiet.headline));
  });
});

/* ================================================================== */
describe("brief — the client update", () => {
  const db = store.seed(NOW);
  const text = brief.clientUpdateDraft(db, "cl_north", NOW);

  it("reports what was finished since the last update", () => {
    ok(/Done since the last update/.test(text));
    ok(/Newsletter template build/.test(text));
  });

  it("asks for the decision it is waiting on", () => {
    ok(/What I need from you/.test(text));
    ok(/pricing table/.test(text));
  });

  it("says the revision overage out loud, before the invoice does", () => {
    ok(/3 revision rounds against 2 included/.test(text), `draft said:\n${text}`);
    ok(/\$180/.test(text), "names the number");
  });

  it("stays quiet about money that is not owed", () => {
    ok(!/outstanding/.test(text), "Northbeam has nothing overdue");
    const ferns = brief.clientUpdateDraft(db, "cl_ferns", NOW);
    ok(/Also outstanding: 2026-041/.test(ferns), "Fernside does");
  });

  it("has no empty headings and no triple blank lines", () => {
    ok(!/\n{3,}/.test(text), "collapsed blank lines");
    ok(!/In progress:\n\n/.test(text), "no heading without items");
  });
});

/* ================================================================== */
const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  ipadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

describe("install — getting it onto a home screen", () => {
  it("knows Safari on an iPhone can install", () => {
    const d = install.detect(UA.iphoneSafari, false);
    eq(d.platform, "ios-safari");
    eq(d.iOS, true);
    eq(d.installed, false);
  });

  it("does not send an iOS Chrome user hunting for a Share menu item", () => {
    // Add to Home Screen simply isn't in these browsers.
    eq(install.detect(UA.iphoneChrome, false).platform, "ios-other");
    eq(install.detect(UA.iphoneFirefox, false).platform, "ios-other");
    ok(/Safari/.test(install.advice({ platform: "ios-other" })), "tells them to open Safari");
    ok(!/tap Share/.test(install.advice({ platform: "ios-other" })), "and not to tap Share");
  });

  it("spots an iPad pretending to be a Mac", () => {
    eq(install.detect(UA.ipadOS, false, 5).platform, "ios-safari", "touch points give it away");
    eq(install.detect(UA.ipadOS, false, 0).platform, "desktop", "a real Mac stays a desktop");
  });

  it("tells Android and desktop what their own browsers do", () => {
    eq(install.detect(UA.android, false).platform, "android");
    eq(install.detect(UA.desktop, false).platform, "desktop");
    ok(/address bar/.test(install.advice({ platform: "desktop" })));
  });

  it("recognises being installed already, whatever the platform", () => {
    for (const ua of Object.values(UA)) eq(install.detect(ua, true).installed, true);
    ok(/Installed/.test(install.advice({ installed: true })));
  });

  it("offers the real button when the browser has one", () => {
    ok(/Install it/.test(install.advice({ canPrompt: true, platform: "android" })),
       "a live prompt beats the written instructions");
  });
});

describe("the offline shell", () => {
  const here = HERE;
  const manifest = JSON.parse(readFileSync(join(here, "manifest.webmanifest"), "utf8"));
  const sw = readFileSync(join(here, "sw.js"), "utf8");
  const html = readFileSync(join(here, "index.html"), "utf8");

  it("has a manifest that points at icons that exist", () => {
    ok(manifest.start_url && manifest.scope, "start_url and scope set");
    for (const icon of manifest.icons) {
      ok(existsSync(join(here, icon.src)), `missing icon ${icon.src}`);
    }
    ok(manifest.icons.some((i) => i.purpose === "maskable"), "has a maskable icon");
  });

  it("caches every script the page loads", () => {
    // A file in the page but not in the shell list is a blank screen on
    // a train — the failure this check exists to prevent.
    const inPage = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    ok(inPage.length >= 9, `found ${inPage.length} scripts`);
    for (const src of inPage) {
      ok(sw.includes(`"./${src}"`), `sw.js does not cache ${src}`);
      ok(existsSync(join(here, src)), `${src} is missing from disk`);
    }
  });

  it("caches the stylesheet and the page itself", () => {
    for (const file of ["./index.html", "./style.css", "./manifest.webmanifest"]) {
      ok(sw.includes(`"${file}"`), `sw.js does not cache ${file}`);
    }
  });

  it("registers the worker and links the manifest", () => {
    ok(/rel="manifest"/.test(html), "manifest linked");
    ok(/apple-touch-icon/.test(html), "iOS icon linked");
    ok(/serviceWorker/.test(html) && /register\("sw\.js"\)/.test(html), "worker registered");
  });
});

/* ================================================================== */
describe("slack — is this really Slack?", () => {
  const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
  const body = "command=%2Femployee&text=money&user_name=dana";
  const sign = (ts, raw, secret) =>
    "v0=" + createHmac("sha256", secret || SECRET).update(`v0:${ts}:${raw}`).digest("hex");
  const NOW_MS = 1_780_000_000_000;
  const ts = String(Math.floor(NOW_MS / 1000));

  it("accepts a request Slack actually signed", () => {
    const r = slack.verify(SECRET, { timestamp: ts, body, signature: sign(ts, body) }, NOW_MS);
    eq(r.ok, true);
  });

  it("refuses one signed with a different secret", () => {
    const r = slack.verify(SECRET, { timestamp: ts, body, signature: sign(ts, body, "wrong-secret") }, NOW_MS);
    eq(r.ok, false);
    eq(r.reason, "signature mismatch");
  });

  it("refuses a body that changed after it was signed", () => {
    const sig = sign(ts, body);
    const tampered = body.replace("money", "chase");
    eq(slack.verify(SECRET, { timestamp: ts, body: tampered, signature: sig }, NOW_MS).ok, false);
  });

  it("refuses a replay from an hour ago", () => {
    const old = String(Math.floor(NOW_MS / 1000) - 3600);
    const r = slack.verify(SECRET, { timestamp: old, body, signature: sign(old, body) }, NOW_MS);
    eq(r.ok, false);
    eq(r.reason, "timestamp too old");
  });

  it("accepts a little clock drift, in both directions", () => {
    for (const skew of [-120, 120]) {
      const t = String(Math.floor(NOW_MS / 1000) + skew);
      eq(slack.verify(SECRET, { timestamp: t, body, signature: sign(t, body) }, NOW_MS).ok, true, `skew ${skew}`);
    }
  });

  it("refuses an unsigned request, and one with no secret configured", () => {
    eq(slack.verify(SECRET, { timestamp: ts, body }, NOW_MS).ok, false);
    eq(slack.verify("", { timestamp: ts, body, signature: sign(ts, body) }, NOW_MS).ok, false);
  });

  it("does not throw on a signature of the wrong length", () => {
    // timingSafeEqual throws on mismatched lengths; the check must not.
    const r = slack.verify(SECRET, { timestamp: ts, body, signature: "v0=short" }, NOW_MS);
    eq(r.ok, false);
  });
});

describe("slack — what was asked", () => {
  it("defaults to the morning read", () => {
    eq(slack.parseCommand(""), "brief");
    eq(slack.parseCommand("   "), "brief");
    eq(slack.parseCommand(undefined), "brief");
  });

  it("understands the words people actually type", () => {
    eq(slack.parseCommand("money"), "money");
    eq(slack.parseCommand("Overdue"), "chase");
    eq(slack.parseCommand("leads"), "pipeline");
    eq(slack.parseCommand("updates"), "quiet");
    eq(slack.parseCommand("today please"), "brief");
  });

  it("says so when it doesn't know", () => eq(slack.parseCommand("reconcile vat"), "unknown"));

  it("escapes what Slack would otherwise read as markup", () => {
    eq(slack.esc('Tom & Sons <tom@x.co>'), "Tom &amp; Sons &lt;tom@x.co&gt;");
  });
});

describe("slack — the reply", () => {
  const db = store.seed(NOW);

  it("puts the headline in the morning read", () => {
    const payload = slack.reply(AE, db, "brief", NOW);
    const text = JSON.stringify(payload.blocks);
    ok(text.includes("2 things need you today"), "headline is there");
    ok(text.includes("Needs a decision from you"), "sections are there");
    ok(text.includes(":red_circle:"), "severity survives into Slack");
    eq(payload.response_type, "ephemeral", "a slash command answers only the person who asked");
  });

  it("caps a long section rather than posting a wall", () => {
    const local = store.seed(NOW);
    for (let i = 0; i < 9; i += 1) {
      local.tasks.push({ id: "big" + i, title: "Decision " + i, status: "open",
        needsDecision: true, due: day(0), clientId: "cl_north" });
    }
    const blocks = slack.briefBlocks(AE, local, NOW, { itemsPerSection: 4 });
    const decisions = JSON.stringify(blocks).match(/Decision \d/g) || [];
    ok(decisions.length <= 4, `showed ${decisions.length}`);
    ok(JSON.stringify(blocks).includes("and 6 more"), "says how many it left out");
  });

  it("answers money with the numbers, not the whole brief", () => {
    const text = JSON.stringify(slack.reply(AE, db, "money", NOW).blocks);
    ok(text.includes("Outstanding"), "has the totals");
    ok(text.includes("2026-041"), "names what to chase");
    ok(!text.includes("Needs a decision"), "not the morning read");
  });

  it("answers chase with money, promises and quiet deals together", () => {
    const text = JSON.stringify(slack.reply(AE, db, "chase", NOW).blocks);
    ok(text.includes("2026-041"), "the invoice");
    ok(text.includes("pricing table"), "the promise");
    ok(text.includes("Greyline"), "the stalled lead");
  });

  it("carries a one-line fallback for the notification", () => {
    eq(slack.reply(AE, db, "brief", NOW).text, brief.build(db, NOW).headline);
    ok(/outstanding/.test(slack.fallbackText(AE, db, "money", NOW)));
  });

  it("points an unknown command at help", () => {
    const text = JSON.stringify(slack.reply(AE, db, "unknown", NOW).blocks);
    ok(/employee help/.test(text));
  });

  it("says nothing is wrong when nothing is", () => {
    const quiet = store.defaults();
    const text = JSON.stringify(slack.reply(AE, quiet, "brief", NOW).blocks);
    ok(/on schedule/.test(text));
  });

  it("stays quiet on a day not worth waking a channel for", () => {
    // A daily "nothing to report" trains everyone to ignore the channel.
    eq(slack.worthPosting(AE, store.defaults(), NOW), false);
    eq(slack.worthPosting(AE, db, NOW), true);
    eq(slack.worthPosting(AE, db, NOW, { minSeverity: "red" }), true);
  });

  it("escapes a client name that would otherwise be markup", () => {
    const local = store.defaults();
    local.clients.push({ id: "c1", name: "Ben & <script>", status: "active", revisionsIncluded: 0 });
    local.projects.push({ id: "p1", clientId: "c1", name: "Job", stage: "in_progress", dueDate: day(0) });
    const text = JSON.stringify(slack.briefBlocks(AE, local, NOW));
    ok(!text.includes("<script>"), "raw markup never reaches Slack");
  });
});

describe("server — the business on disk", () => {
  const file = join(tmpdir(), `ai-employee-test-${process.pid}.json`);
  const disk = new BusinessStore(file, AE);

  it("treats a missing file as a business nobody has saved yet", () => {
    disk.clear();
    const env = disk.read();
    eq(env.version, 0);
    eq(env.data.clients.length, 0);
  });

  it("round-trips and bumps the version", () => {
    disk.clear();
    const first = disk.write(store.seed(NOW), null, NOW);
    eq(first.version, 1);
    eq(disk.read().data.clients.length, 3);
    const second = disk.write(disk.read().data, 1, NOW);
    eq(second.version, 2);
  });

  it("refuses to write junk over a real business", () => {
    disk.clear();
    disk.write(store.seed(NOW), null, NOW);
    for (const junk of ["a string", [1, 2, 3], 42]) {
      let code = null;
      try { disk.write(junk, null, NOW); } catch (err) { code = err.code; }
      eq(code, "INVALID", `${JSON.stringify(junk)} should be refused`);
    }
    eq(disk.read().data.clients.length, 3, "the business survived");
    eq(disk.read().version, 1, "and the version did not move");
    disk.clear();
  });

  it("refuses a write based on a version that has moved", () => {
    disk.clear();
    disk.write(store.defaults(), null, NOW);      // version 1
    disk.write(store.defaults(), 1, NOW);         // version 2
    let code = null;
    try { disk.write(store.defaults(), 1, NOW); } catch (err) { code = err.code; }
    eq(code, "CONFLICT", "the stale write was refused");
    eq(disk.read().version, 2, "and changed nothing");
  });

  it("keeps a copy of a file it cannot parse rather than clobbering it", () => {
    disk.clear();
    writeFileSync(file, "{ this is not json");
    let code = null;
    try { disk.read(); } catch (err) { code = err.code; }
    eq(code, "CORRUPT");
    ok(existsSync(file + ".corrupt"), "the wreckage was kept");
    rmSync(file + ".corrupt", { force: true });
  });

  it("leaves no temp file behind", () => {
    disk.clear();
    disk.write(store.seed(NOW), null, NOW);
    const strays = readdirSync(tmpdir()).filter((f) => f.startsWith(`ai-employee-test-${process.pid}.json.`));
    eq(strays, [], "temp files cleaned up by the rename");
    disk.clear();
  });
});

describe("sync — the browser side", () => {
  it("tidies up an address someone typed by hand", () => {
    eq(sync.normaliseUrl("localhost:8788"), "http://localhost:8788");
    eq(sync.normaliseUrl("http://box.local:8788/"), "http://box.local:8788");
    eq(sync.normaliseUrl("https://box.local/health"), "https://box.local");
    eq(sync.normaliseUrl("http://box.local/api/business"), "http://box.local");
    eq(sync.normaliseUrl(""), "");
  });

  it("keeps the token out of the business record, and out of exports", () => {
    store.seed(NOW);
    sync.setConfig({ url: "http://localhost:8788", token: "super-secret-token" });
    const exported = store.exportJSON();
    ok(!exported.includes("super-secret-token"), "the token is not in the export");
    ok(!exported.includes("aiEmployeeServer"), "nor is the server config");
    ok(JSON.parse(localStorage.getItem(sync.KEY)).token, "it lives under its own key");
  });

  it("tells the server which version it is writing against", async () => {
    const seen = [];
    sync.setFetch(async (url, opts) => {
      seen.push({ url, headers: opts.headers, method: opts.method });
      return { ok: true, status: 200, text: async () => JSON.stringify({ version: 7 }) };
    });
    sync.setConfig({ url: "http://localhost:8788", token: "t", lastVersion: 6 });
    await sync.push(false);
    eq(seen[0].method, "PUT");
    eq(seen[0].headers["If-Match"], "6");
    eq(seen[0].headers.Authorization, "Bearer t");
    eq(sync.config().lastVersion, 7, "and remembers where it got to");
  });

  it("drops the version check only when forced", async () => {
    const seen = [];
    sync.setFetch(async (url, opts) => {
      seen.push(opts.headers);
      return { ok: true, status: 200, text: async () => JSON.stringify({ version: 9 }) };
    });
    sync.setConfig({ url: "http://localhost:8788", lastVersion: 6 });
    await sync.push(true);
    eq(seen[0]["If-Match"], undefined, "a forced push says overwrite regardless");
  });

  it("reports a disagreement instead of picking a winner", async () => {
    sync.setFetch(async () => ({
      ok: false, status: 409,
      text: async () => JSON.stringify({ error: "stale", current: { version: 12 } }),
    }));
    sync.setConfig({ url: "http://localhost:8788", lastVersion: 6 });
    let caught = null;
    try { await sync.push(false); } catch (err) { caught = err; }
    ok(caught, "it threw");
    eq(caught.code, "CONFLICT");
    eq(caught.current.version, 12);
    eq(sync.config().lastVersion, 6, "and did not move the local marker");
  });

  it("names the likely cause when the server can't be reached", async () => {
    sync.setFetch(async () => { throw new TypeError("Failed to fetch"); });
    sync.setConfig({ url: "http://localhost:8788" });
    let msg = "";
    try { await sync.health(); } catch (err) { msg = err.message; }
    ok(/is it running/.test(msg), `said: ${msg}`);
  });

  it("tests the token, not just whether something answers", async () => {
    // /health answers without a token; testing against it would call a
    // wrong token healthy right up until the first real request.
    const called = [];
    sync.setFetch(async (url) => {
      called.push(url);
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, version: 3 }) };
    });
    sync.setConfig({ url: "http://localhost:8788", token: "t" });
    await sync.health();
    ok(/\/api\//.test(called[0]), `hit an authenticated endpoint, got ${called[0]}`);
    ok(!/\/health$/.test(called[0]), "not the open one");
  });

  it("says plainly when the token is wrong", async () => {
    sync.setFetch(async () => ({ ok: false, status: 401, text: async () => "" }));
    let msg = "";
    try { await sync.health(); } catch (err) { msg = err.message; }
    ok(/rejected the token/.test(msg));
  });

  it("is off until an address is set", () => {
    sync.forget();
    eq(sync.configured(), false);
    eq(sync.status().state, "off");
  });
});

/* ================================================================== */
await runQueued();

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n✗ ${failures.length} of ${total} checks failed:\n`);
  for (const f of failures) console.error("  " + f + "\n");
  process.exit(1);
}
console.log(`✓ employee: ${passed} checks passed`);
