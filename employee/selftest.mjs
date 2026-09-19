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

import { readFileSync, existsSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---- a browser, for a very small value of "browser" ---------------- */
function sandbox() {
  const stored = new Map();
  const localStorage = {
    getItem: (k) => (stored.has(k) ? stored.get(k) : null),
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
  };
  const win = { localStorage, navigator: { userAgent: "node", maxTouchPoints: 0 }, addEventListener() {} };
  const ctx = createContext({
    window: win, localStorage, navigator: win.navigator, console, Date, Intl, JSON, Math,
    setTimeout, clearTimeout,
  });
  for (const file of ["util.js", "store.js", "margin.js", "qa.js", "money.js", "growth.js", "brief.js", "install.js"]) {
    runInContext(readFileSync(join(HERE, "js", file), "utf8"), ctx, { filename: file });
  }
  const AE = runInContext("window.AE", ctx);
  /* The tests need the same storage the modules write to, to prove the
     app copes with what it finds there. */
  return { AE, localStorage };
}

/* ---- a very small test runner -------------------------------------- */
let passed = 0;
const failures = [];
let group = "";

function describe(name, fn) { group = name; fn(); }
function it(name, fn) {
  try { fn(); passed += 1; }
  catch (err) { failures.push(`${group} → ${name}\n    ${err.message}`); }
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

const { AE, localStorage } = sandbox();
const { util: U, store, margin, qa, money, growth, brief, install } = AE;

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
const total = passed + failures.length;
if (failures.length) {
  console.error(`\n✗ ${failures.length} of ${total} checks failed:\n`);
  for (const f of failures) console.error("  " + f + "\n");
  process.exit(1);
}
console.log(`✓ employee: ${passed} checks passed`);
