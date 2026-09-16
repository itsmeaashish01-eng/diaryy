#!/usr/bin/env node
/* ================================================
   AGENTS — selftest.mjs
   The parts that can be checked without touching the network.

     node agents/selftest.mjs

   Feed parsing, page fingerprinting, the rule engine, what the state
   file remembers and forgets, and the diary's arithmetic. Every agent
   type's actual fetching is covered by --dry-run against the real thing;
   this covers the reasoning, which is where the mistakes hide.
   ================================================ */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseFeed } from "./types/feed.mjs";
import { parseHeader, reviewDue } from "./types/study.mjs";
import { score } from "./types/reading.mjs";
import goals from "./types/goals.mjs";
import reading from "./types/reading.mjs";
import exercise from "./types/exercise.mjs";
import portfolio from "./types/portfolio.mjs";
import { deadlineBucket, isoWeek, staleBucket, daysUntil } from "./core/local.mjs";
import { toText, digest } from "./types/webpage.mjs";
import diary from "./types/diary.mjs";
import organizer, { collect, ageBucket, ageRungs } from "./types/organizer.mjs";
import { decide } from "./core/brain.mjs";
import { blankAgentState, remember, loadState, saveState, agentState } from "./core/state.mjs";
import { anySent, describeDelivery } from "./core/notify.mjs";

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || "value"}: expected ${b}, got ${a}`);
}
const ok = (cond, what) => { if (!cond) throw new Error(what || "expected true"); };

const DAY = 86400000;
const isoDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/* ---- feed parsing ------------------------------------------------- */

check("RSS: title, link and guid come out", () => {
  const items = parseFeed(`<rss><channel>
    <item><title>First &amp; best</title><link>https://example.com/1</link>
      <guid>id-1</guid><description>Hello</description></item>
    <item><title><![CDATA[Second]]></title><link>https://example.com/2</link><guid>id-2</guid></item>
  </channel></rss>`);
  eq(items.length, 2, "item count");
  eq(items[0].title, "First & best", "entities decoded");
  eq(items[0].key, "id-1", "guid used as key");
  eq(items[1].title, "Second", "CDATA unwrapped");
});

check("Atom: href attribute is the link, id is the key", () => {
  const items = parseFeed(`<feed>
    <entry><title>Release 1.2</title><id>tag:x,2026:1</id>
      <link rel="alternate" href="https://example.com/r/1.2"/>
      <summary>Notes &lt;here&gt;</summary></entry>
  </feed>`);
  eq(items.length, 1, "entry count");
  eq(items[0].url, "https://example.com/r/1.2", "href link");
  eq(items[0].key, "tag:x,2026:1", "id as key");
  eq(items[0].detail, "Notes <here>", "escaped markup decoded");
});

check("A page that isn't a feed yields nothing rather than nonsense", () => {
  eq(parseFeed("<html><body><p>not a feed</p></body></html>").length, 0);
});

/* ---- page fingerprinting ------------------------------------------ */

check("Scripts and whitespace don't count as a change", () => {
  const a = toText("<html><body><h1>Hi</h1><script>var t=1</script></body></html>");
  const b = toText("<html><body>\n  <h1>Hi</h1>\n  <script>var t=2</script>\n</body></html>");
  eq(a, "Hi", "tags and scripts stripped");
  eq(digest(a), digest(b), "same visible text, same fingerprint");
});

check("Real text changes do change the fingerprint", () => {
  ok(digest(toText("<p>Sold out</p>")) !== digest(toText("<p>In stock</p>")), "differs");
});

/* ---- the rule engine ---------------------------------------------- */

const state = (over = {}) => ({ ...blankAgentState(), ...over });

check("With no rules, anything new is notable and nothing else is", () => {
  const agent = { id: "a", label: "A" };
  eq(decide(agent, { fresh: [{ key: "x" }] }, state()).level, "notable", "new item");
  eq(decide(agent, { fresh: [] }, state()).level, "quiet", "nothing new");
});

check("Thresholds read the metric", () => {
  const agent = { rules: [{ when: "below", value: 100, level: "urgent" }] };
  eq(decide(agent, { metric: 80, fresh: [] }, state()).level, "urgent", "below fires");
  eq(decide(agent, { metric: 120, fresh: [] }, state()).level, "quiet", "above stays quiet");
});

check("changesBy compares against the last recorded reading", () => {
  const agent = { rules: [{ when: "changesBy", percent: 10, level: "notable" }] };
  const s = state({ metrics: [{ t: 1, v: 100 }] });
  eq(decide(agent, { metric: 85, fresh: [] }, s).level, "notable", "15% drop fires");
  eq(decide(agent, { metric: 105, fresh: [] }, s).level, "quiet", "5% rise doesn't");
});

check("newLow waits for enough history to mean anything", () => {
  const agent = { rules: [{ when: "newLow", level: "notable" }] };
  eq(decide(agent, { metric: 1, fresh: [] }, state({ metrics: [{ v: 5 }, { v: 6 }] })).level,
    "quiet", "two readings is not a record");
  eq(decide(agent, { metric: 1, fresh: [] }, state({ metrics: [{ v: 5 }, { v: 6 }, { v: 7 }] })).level,
    "notable", "three is");
});

check("The highest level among several rules wins", () => {
  const agent = {
    rules: [
      { when: "new", level: "notable" },
      { when: "below", value: 10, level: "urgent" },
    ],
  };
  const v = decide(agent, { metric: 5, fresh: [{ key: "x" }] }, state());
  eq(v.level, "urgent", "urgent wins");
  eq(v.reasons.length, 2, "both reasons kept");
});

check("A type can escalate past its rules, and says why", () => {
  const v = decide({ rules: [] }, { fresh: [], level: "urgent", why: "it's down" }, state());
  eq(v.level, "urgent");
  ok(v.reasons.includes("it's down"), "reason carried through");
});

check("An unknown rule is ignored, not fatal", () => {
  const v = decide({ rules: [{ when: "wishful" }] }, { fresh: [] }, state());
  eq(v.level, "quiet");
  ok(v.reasons[0].includes("unknown rule"), "and it says so");
});

check("Repeated failures only alert once an error rule asks them to", () => {
  const agent = { rules: [{ when: "error", after: 3 }] };
  eq(decide(agent, { fresh: [] }, state({ errorCount: 2 })).level, "quiet", "two failures");
  eq(decide(agent, { fresh: [] }, state({ errorCount: 3 })).level, "urgent", "three failures");
});

/* ---- state -------------------------------------------------------- */

check("Seen keys and metrics are capped, newest kept", () => {
  const s = blankAgentState();
  for (let i = 0; i < 1500; i++) remember(s, { seen: [`k${i}`], metric: { t: i, v: i } });
  ok(s.seen.length <= 1000, `seen capped, got ${s.seen.length}`);
  eq(s.seen[s.seen.length - 1], "k1499", "newest key kept");
  eq(s.metrics[s.metrics.length - 1].v, 1499, "newest metric kept");
});

check("A single run bigger than the old cap is remembered whole", () => {
  /* The failure this guards against: one scan turns up more keys than the
     dedupe memory holds, the earliest fall off, and the next run re-finds
     them and alerts again — every run, forever. */
  const s = blankAgentState();
  const oneRun = [];
  for (let i = 0; i < 300; i++) oneRun.push(`note:n${i}`, `review:n${i}:1`);
  const { dropped } = remember(s, { seen: oneRun });
  eq(dropped, 0, "nothing dropped");
  ok(oneRun.every((k) => s.seen.includes(k)), "every key from the run is remembered");
});

check("Overflowing the dedupe memory is reported, not swallowed", () => {
  const s = blankAgentState();
  const big = Array.from({ length: 1200 }, (_, i) => `k${i}`);
  const { dropped } = remember(s, { seen: big });
  eq(dropped, 200, "says how many it had to forget");
});

check("An agent that tracks a lot can raise its own cap", () => {
  const s = blankAgentState();
  const big = Array.from({ length: 1200 }, (_, i) => `k${i}`);
  const { dropped } = remember(s, { seen: big }, 8000);
  eq(dropped, 0, "nothing dropped at the raised cap");
  eq(s.seen.length, 1200, "all of it kept");
});

check("A corrupt state file costs you memory, not the run", () => {
  const dir = mkdtempSync(join(tmpdir(), "agents-"));
  const p = join(dir, "state.json");
  writeFileSync(p, "{ this is not json");
  const s = loadState(p);
  eq(s.agents, {}, "starts fresh");
  const a = agentState(s, "x");
  a.lastRun = 42;
  saveState(p, s, { t: 1, ran: 1 });
  eq(loadState(p).agents.x.lastRun, 42, "and writes cleanly after");
  rmSync(dir, { recursive: true, force: true });
});

check("A state file missing newer fields is filled in, not rejected", () => {
  const s = { agents: { x: { lastRun: 5 } }, runs: [] };
  const a = agentState(s, "x");
  eq(a.lastRun, 5, "existing value kept");
  eq(a.seen, [], "missing field defaulted");
  eq(a.memo, {}, "missing object defaulted");
});

/* ---- the diary ---------------------------------------------------- */

function diaryFile(entries) {
  const dir = mkdtempSync(join(tmpdir(), "diary-"));
  const p = join(dir, "diary.json");
  writeFileSync(p, JSON.stringify(entries));
  return { p, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const entry = (over = {}) => ({ diary: "wrote something", mood: "🙂", notes: "", tasks: [], ...over });

await (async () => {
  const days = {};
  for (let i = 0; i < 5; i++) days[isoDay(Date.now() - i * DAY)] = entry();
  const { p, cleanup } = diaryFile(days);
  const run = await diary.run({ id: "d", label: "Diary", config: { file: p } }, { state: blankAgentState() });
  check("Streak counts back from today", () => {
    eq(run.metric, 5, "five days running");
    eq(run.facts.writtenThisWeek, 5, "five of the last seven");
  });
  cleanup();
})();

await (async () => {
  // Written through yesterday but not yet today: the streak is alive.
  const days = {};
  for (let i = 1; i <= 3; i++) days[isoDay(Date.now() - i * DAY)] = entry();
  const { p, cleanup } = diaryFile(days);
  const run = await diary.run({ id: "d", label: "Diary", config: { file: p } }, { state: blankAgentState() });
  check("An unwritten today is a streak in progress, not a broken one", () => {
    eq(run.metric, 3, "yesterday still counts");
    ok(run.observations.some((o) => o.key.startsWith("atrisk:")), "but it warns you");
  });
  cleanup();
})();

await (async () => {
  const days = { [isoDay(Date.now() - 9 * DAY)]: entry() };
  const { p, cleanup } = diaryFile(days);
  const run = await diary.run({ id: "d", label: "Diary", config: { file: p, quietDays: 3 } }, { state: blankAgentState() });
  check("Silence is measured from the last entry", () => {
    eq(run.metric, 0, "no streak");
    ok(run.observations.some((o) => o.key === "silent:9"), "nine days, said once");
  });
  cleanup();
})();

await (async () => {
  const days = {
    [isoDay(Date.now())]: entry({ tasks: [
      ...Array.from({ length: 16 }, (_, i) => ({ id: i, text: `task ${i}`, completed: false })),
      { id: 99, text: "done one", completed: true },
      { id: 100, text: "   ", completed: false },   // blank rows aren't a backlog
    ] }),
  };
  const { p, cleanup } = diaryFile(days);
  const run = await diary.run({ id: "d", label: "Diary", config: { file: p, backlog: 15 } }, { state: blankAgentState() });
  check("Open tasks are counted, empty rows are not", () => {
    eq(run.facts.openTasks, 16, "sixteen real tasks");
    eq(run.facts.doneTasks, 1, "one done");
    ok(run.observations.some((o) => o.key.startsWith("backlog:")), "backlog reported");
  });
  cleanup();
})();

await (async () => {
  const days = { "not-a-date": entry(), [isoDay(Date.now())]: entry({ diary: "" }) };
  const { p, cleanup } = diaryFile(days);
  const run = await diary.run({ id: "d", label: "Diary", config: { file: p, minWords: 1 } }, { state: blankAgentState() });
  check("Junk keys and empty entries don't inflate the numbers", () => {
    eq(run.facts.entries, 0, "an empty diary field is not an entry");
    eq(run.metric, 0, "so there is no streak");
  });
  cleanup();
})();

/* ---- dates and buckets -------------------------------------------- */

check("Deadlines are announced at thresholds, not continuously", () => {
  eq(deadlineBucket(45), "90", "45 days out sits in the 90 bucket");
  eq(deadlineBucket(20), "30");
  eq(deadlineBucket(10), "14");
  eq(deadlineBucket(5), "7");
  eq(deadlineBucket(2), "3");
  eq(deadlineBucket(0), "0", "due today");
  eq(deadlineBucket(-3), "overdue");
  eq(deadlineBucket(200), null, "too far out to mention");
});

check("A date is read as midday, so 'due today' isn't 'overdue'", () => {
  eq(daysUntil(isoDay(Date.now())), 0, "today is zero days away");
  eq(daysUntil(isoDay(Date.now() + 3 * DAY)), 3);
});

check("Staleness is reported in steps, not every run", () => {
  eq(staleBucket(21, 7), 21);
  eq(staleBucket(25, 7), 21, "still the same step");
  eq(staleBucket(28, 7), 28, "next step");
});

check("ISO weeks roll over correctly", () => {
  eq(isoWeek(Date.parse("2026-01-01T12:00:00Z")), "2026-W01");
  eq(isoWeek(Date.parse("2027-01-04T12:00:00Z")), "2027-W01", "Monday starts the week");
});

/* ---- study: headers and the ladder -------------------------------- */

check("Front matter is read, including lists and quotes", () => {
  const { head, body } = parseHeader(
    '---\ntitle: "DKA — management"\ntopic: endocrine\ntags: [algorithm, emergency]\nreviewed: 2026-08-14\n---\nFluids first.');
  eq(head.title, "DKA — management", "quotes stripped");
  eq(head.tags, ["algorithm", "emergency"], "list parsed");
  eq(head.reviewed, "2026-08-14");
  eq(body, "Fluids first.", "body separated from header");
});

check("A note with no front matter is still a note", () => {
  const { head, body } = parseHeader("Just some text I typed between clinics.");
  eq(head, {}, "no header");
  eq(body, "Just some text I typed between clinics.", "body untouched");
});

check("A stray --- in the body doesn't become a header", () => {
  const { head } = parseHeader("Some text\n---\nnot: a header\n---");
  eq(head, {}, "front matter must start the file");
});

check("The review ladder advances as you work through a note", () => {
  const ladder = [1, 7, 30, 90];
  eq(reviewDue(2, ladder, 0), 1, "never reviewed: due after a day");
  eq(reviewDue(2, ladder, 1), null, "one pass in: two days is too soon");
  eq(reviewDue(9, ladder, 1), 7, "one pass in: due after a week");
  eq(reviewDue(40, ladder, 2), 30, "two passes in: due after a month");
  eq(reviewDue(500, ladder, 9), 90, "past the end of the ladder, it stays at the top rung");
  eq(reviewDue(null, ladder, 0), null, "no date, nothing to judge");
});

/* ---- reading: the recommender ------------------------------------- */

const item = (over = {}) => ({ id: "x", title: "t", added: isoDay(Date.now() - 30 * DAY), priority: 3, ...over });

check("Something you started beats something you haven't", () => {
  ok(score(item({ started: isoDay() }), 30) > score(item(), 30), "started wins");
});

check("Priority outranks patience", () => {
  const urgent = item({ priority: 5, added: isoDay() });
  const ancient = item({ priority: 2, added: isoDay(Date.now() - 400 * DAY) });
  ok(score(urgent, 30) > score(ancient, 30), "nothing wins by age alone");
});

check("Something that fits the time you have beats something that doesn't", () => {
  ok(score(item({ minutes: 20 }), 30) > score(item({ minutes: 300 }), 30), "fits wins");
});

/* ---- the file-backed agents --------------------------------------- */

function tempJSON(obj) {
  const dir = mkdtempSync(join(tmpdir(), "agents-"));
  const p = join(dir, "data.json");
  writeFileSync(p, JSON.stringify(obj));
  return { p, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const runWith = (type, file, config = {}) =>
  type.run({ id: "t", label: "T", config: { file, ...config } }, { state: blankAgentState(), log() {} });

await (async () => {
  const { p, cleanup } = tempJSON({
    goals: [{
      id: "g1", title: "A goal", active: true,
      due: isoDay(Date.now() + 10 * DAY),
      milestones: [
        { text: "done one", done: "2026-01-01" },
        { text: "open one", due: isoDay(Date.now() + 5 * DAY), done: null },
      ],
      progress: [{ on: isoDay(Date.now() - 40 * DAY), note: "ages ago" }],
    }],
  });
  const run = await runWith(goals, p, { staleDays: 21 });
  check("Goals: a near deadline and a stalled goal both surface", () => {
    eq(run.metric, 50, "one of two milestones done");
    ok(run.observations.some((o) => o.key.startsWith("due:g1:14")), "goal deadline bucketed at 14");
    ok(run.observations.some((o) => o.key.startsWith("m-due:g1:1:7")), "milestone deadline bucketed at 7");
    ok(run.observations.some((o) => o.key.startsWith("stale:g1")), "40 days of silence noticed");
    ok(run.observations.some((o) => o.key === "done:g1:0:2026-01-01"), "completed milestone keyed by its date");
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({
    goals: [{
      id: "g2", title: "Missed it", active: true,
      due: isoDay(Date.now() - 30 * DAY), milestones: [],
      progress: [{ on: isoDay(), note: "still going" }],
    }],
  });
  const run = await runWith(goals, p);
  check("Goals: a passed deadline escalates on its own", () => {
    eq(run.facts.overdue, 1);
    eq(run.level, "notable", "the type escalates without needing a rule");
    ok(run.observations.some((o) => o.key.startsWith("overdue:g2")), "and says so");
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({
    goals: [{ id: "g3", title: "Paused", active: false, progress: [] }],
  });
  const run = await runWith(goals, p);
  check("Goals: an inactive goal is left alone", () => {
    eq(run.facts.goals, 0);
    eq(run.observations.length, 0);
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({
    items: [
      { id: "a", title: "Unread", added: isoDay(Date.now() - 10 * DAY), priority: 4, minutes: 20 },
      { id: "b", title: "Ancient", added: isoDay(Date.now() - 300 * DAY), priority: 1, minutes: 30 },
      { id: "c", title: "Read", added: isoDay(Date.now() - 60 * DAY), finished: isoDay(Date.now() - 2 * DAY) },
    ],
  });
  const run = await runWith(reading, p, { suggest: 1, minutesFree: 30, staleDays: 120 });
  check("Reading: counts, a suggestion, a finish and a long-dead item", () => {
    eq(run.metric, 2, "two unread");
    eq(run.facts.finished, 1);
    ok(run.observations.some((o) => o.key.startsWith("suggest:")), "suggests something");
    ok(run.observations.some((o) => o.key.startsWith("finished:c")), "acknowledges the finish");
    ok(run.observations.some((o) => o.key.startsWith("stale:b")), "flags the 300-day-old one");
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({ items: [] });
  const run = await runWith(reading, p);
  check("Reading: an empty list is quiet, not an error", () => {
    eq(run.metric, 0);
    eq(run.observations.length, 0);
  });
  cleanup();
})();

await (async () => {
  const days = [0, 2, 4].map((n) => isoDay(Date.now() - n * DAY));
  const { p, cleanup } = tempJSON({
    sessions: days.map((d, i) => ({ date: d, kind: "run", minutes: 30 + i, distanceKm: 5 })),
  });
  const run = await runWith(exercise, p, { weeklyTarget: 2, restDayMax: 3 });
  check("Exercise: the last seven days are the metric", () => {
    eq(run.metric, 3, "three sessions in the week");
    ok(run.facts.weekMinutes > 0, "minutes counted");
    ok(!run.observations.some((o) => o.key.startsWith("rest:")), "trained today, so no rest nudge");
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({
    sessions: [{ date: isoDay(Date.now() - 9 * DAY), kind: "run", minutes: 30 }],
  });
  const run = await runWith(exercise, p, { weeklyTarget: 4, restDayMax: 3 });
  check("Exercise: a long gap is mentioned, once per day of it", () => {
    eq(run.metric, 0, "nothing in the last week");
    ok(run.observations.some((o) => o.key === "rest:9"), "nine days off, keyed by the count");
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({ sessions: [] });
  const run = await runWith(exercise, p);
  check("Exercise: an empty log explains itself", () => {
    eq(run.metric, 0);
    ok(run.observations.some((o) => o.key === "empty"), "says what to do");
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({
    holdings: [{ symbol: "X", provider: "command", config: { command: "rm -rf /" }, quantity: 1 }],
  });
  check("Portfolio: a holding can't smuggle in the command source", () => {
    const errs = portfolio.validate({ config: { file: p } });
    ok(errs.some((e) => e.includes("command")), `expected a refusal, got ${JSON.stringify(errs)}`);
  });
  cleanup();
})();

await (async () => {
  const { p, cleanup } = tempJSON({ holdings: [{ symbol: "X", provider: "invented", quantity: 1 }] });
  check("Portfolio: an unknown source is named, not swallowed", () => {
    const errs = portfolio.validate({ config: { file: p } });
    ok(errs.some((e) => e.includes("invented")), `expected the source named, got ${JSON.stringify(errs)}`);
  });
  cleanup();
})();

await (async () => {
  /* The real run surfaced this: the summary said "1 unpriced" and left you
     to work out which holding and why. A source that can't be reached is
     simulated here with a provider that always throws. */
  const { p, cleanup } = tempJSON({
    holdings: [
      { symbol: "GOOD", label: "Priced fine", provider: "demo", currency: "USD",
        config: { basePrice: 100, volatility: 0.01 }, quantity: 2, avgCost: 50 },
      { symbol: "BAD", label: "Dead source", provider: "json", currency: "USD",
        config: { url: "https://127.0.0.1/nope.json", path: "price" }, quantity: 1, avgCost: 10 },
    ],
  });
  const run = await portfolio.run(
    { id: "pf", label: "Portfolio", intervalMin: 60, config: { file: p, base: "USD" } },
    { state: blankAgentState(), log() {} }
  );
  check("Portfolio: an unpriced holding is named, not just counted", () => {
    ok(run.line.includes("Dead source"), `the line should name it, got: ${run.line}`);
    ok(run.facts.unpriced.some((u) => u.startsWith("Dead source:")), "facts carry the reason");
    ok(run.observations.some((o) => o.key.startsWith("unpriced:BAD:")), "and it raises an observation");
    ok(run.metric > 0, "the holdings that did price still produce a total");
  });
  cleanup();
})();

check("A missing data file fails with something you can act on", () => {
  const errs = reading.validate({ config: { file: "/nowhere/at/all.json" } });
  ok(errs.length === 1 && errs[0].includes("no reading list at"), errs[0] || "expected one clear error");
});

/* ---- the organizer: the to-do side of the same export -------------- */

const task = (text, completed = false, id) => ({ id: id || text, text, completed });
const orgRun = (entries, config = {}) => {
  const { p, cleanup } = diaryFile(entries);
  return organizer
    .run({ id: "o", label: "Organizer", config: { file: p, ...config } }, { state: blankAgentState() })
    .finally(cleanup);
};
const dayAgo = (n) => isoDay(Date.now() - n * DAY);

check("collect: only dated entries with real task text count", () => {
  const { tasks, days } = collect({
    "not-a-date": { tasks: [task("ignored")] },
    "2026-09-01": { tasks: [task("real"), task("   "), null] },
    "2026-09-02": { tasks: "not an array" },
    "2026-09-03": null,
  });
  eq(tasks.length, 1, "one usable task");
  eq(tasks[0].text, "real", "the one with text");
  eq(days, ["2026-09-01", "2026-09-02"], "dated entries, sorted");
});

check("collect: a task's key is scoped to its day", () => {
  /* The app's ids are millisecond timestamps. The day is what actually
     guarantees the key is unique, so two days can reuse an id safely. */
  const { tasks } = collect({
    "2026-09-01": { tasks: [task("a", false, "123")] },
    "2026-09-02": { tasks: [task("b", false, "123")] },
  });
  eq(new Set(tasks.map((t) => t.key)).size, 2, "distinct keys");
});

check("The age rungs start where you said and climb from there", () => {
  eq(ageRungs(7), [7, 14, 30, 60, 90, 180, 365], "default ladder");
  eq(ageRungs(30), [30, 60, 90, 180, 365], "a later start drops the rungs below it");
  eq(ageBucket(6, 7), null, "below the first rung, nothing is said");
  eq(ageBucket(7, 7), 7, "the first rung, exactly");
  eq(ageBucket(29, 7), 14, "highest rung reached, not the next one up");
  eq(ageBucket(400, 7), 365, "the top rung holds");
});

await (async () => {
  const run = await orgRun({
    [dayAgo(20)]: entry({ tasks: [task("slipped")] }),
    [dayAgo(0)]: entry({ tasks: [task("today's")] }),
    [isoDay(Date.now() + 3 * DAY)]: entry({ tasks: [task("planned ahead")] }),
  });
  check("A task is slipped only once its own day has passed", () => {
    eq(run.facts.slipped, 1, "the one behind us");
    eq(run.facts.openToday, 1, "today's is not slipped");
    eq(run.facts.plannedAhead, 1, "nor is one planned ahead");
    eq(run.metric, 1, "the metric the threshold rules read is what slipped");
  });
})();

await (async () => {
  const run = await orgRun({ [dayAgo(20)]: entry({ tasks: [task("Call the agent")] }) });
  const keys = run.observations.map((o) => o.key);
  check("Each age rung announces a task once, and the key says which rung", () => {
    ok(keys.includes(`aging:${dayAgo(20)}#Call the agent:14`), `expected the 14-day rung, got ${keys.join()}`);
    /* Same task a fortnight later is a different key, so it comes back
       once — and only once — at 30 days. */
    eq(ageBucket(34, 7), 30, "and the next rung is a new key");
  });
})();

await (async () => {
  const days = {};
  for (let i = 1; i <= 5; i++) days[dayAgo(20 + i)] = entry({ tasks: [task(`old ${i}`)] });
  const run = await orgRun(days, { maxMention: 2 });
  check("maxMention caps how much of the backlog one run reads out", () => {
    const aging = run.observations.filter((o) => o.key.startsWith("aging:"));
    eq(aging.length, 2, "two named");
    ok(aging[0].title.includes(dayAgo(25)), "oldest first");
  });
})();

await (async () => {
  const run = await orgRun({ [dayAgo(20)]: entry({ tasks: [task("Private thing")] }) }, { includeText: false });
  const body = organizer.describe({}, run.observations);
  check("includeText: false keeps the task text out of the alert", () => {
    ok(!body.includes("Private thing"), "the text stays in the file");
    ok(body.includes(dayAgo(20)), "the date still identifies it");
  });
})();

await (async () => {
  const run = await orgRun({
    [dayAgo(0)]: entry({ tasks: [] }),
    [dayAgo(9)]: entry({ tasks: [task("still here")] }),
  });
  check("An empty day with a backlog behind it is the moment to pull one forward", () => {
    const pull = run.observations.find((o) => o.key === `pull:${isoDay()}`);
    ok(pull, "the nudge fired");
    ok(pull.detail.includes("still here"), "and it names the oldest");
  });
})();

await (async () => {
  const run = await orgRun({ [dayAgo(0)]: entry({ tasks: [task("a", true), task("b", true)] }) });
  const cleared = run.observations.find((o) => o.key === `clear:${isoDay()}`);
  check("A cleared board is reported, because a tool that only nags gets ignored", () => {
    ok(cleared, "it noticed");
  });
})();

await (async () => {
  const run = await orgRun({
    [dayAgo(0)]: entry({ tasks: [task("a", true)] }),
    [dayAgo(30)]: entry({ tasks: [task("b")] }),
  });
  check("Nothing is 'cleared' while something is still slipping", () => {
    ok(!run.observations.some((o) => o.key.startsWith("clear:")), "the backlog counts");
  });
})();

await (async () => {
  const run = await orgRun({
    [dayAgo(1)]: entry({ tasks: [task("a"), task("b"), task("c"), task("d"), task("e"), task("f"), task("g")] }),
    [dayAgo(0)]: entry({ tasks: [task("1"), task("2"), task("3")] }),
  }, { overload: 3, ageDays: 30 });
  check("Too many on one day is said once, keyed to the day", () => {
    eq(run.observations.filter((o) => o.key === `overload:${isoDay()}`).length, 1, "once");
  });
})();

await (async () => {
  const days = {};
  for (let i = 0; i < 3; i++) days[dayAgo(i)] = entry({ tasks: [task(`x${i}`, true), task(`y${i}`, true)] });
  const run = await orgRun(days);
  const week = run.observations.find((o) => o.key.startsWith("week:"));
  check("The weekly review says which way the list is moving", () => {
    ok(week, "it fired");
    eq(run.facts.closedThisWeek, 6, "six closed");
    ok(week.detail.includes("broke even"), `expected break-even, got: ${week.detail}`);
  });
})();

check("An export with no dated entries fails with something you can act on", () => {
  const { p, cleanup } = diaryFile({ hello: "world" });
  try {
    const errs = organizer.validate({ config: { file: p } });
    ok(errs.length === 1 && errs[0].includes("⤓ Export"), errs[0] || "expected one clear error");
  } finally {
    cleanup();
  }
});

check("A missing export names the file rather than throwing", () => {
  const errs = organizer.validate({ config: { file: "/nowhere/at/all.json" } });
  ok(errs.length === 1 && errs[0].includes("no organizer export at"), errs[0] || "expected one clear error");
});

/* ---- delivery ------------------------------------------------------ */

check("A finding only counts as reported if a channel actually took it", () => {
  /* This is what stops a run with no alert channel quietly eating your
     news: marking a key as seen is what retires it for good, so it must
     wait on real delivery. */
  ok(anySent([{ name: "ntfy", sent: true, detail: "sent" }]), "one channel took it");
  ok(anySent([
    { name: "ntfy", sent: false, detail: "no topic configured" },
    { name: "webhook", sent: true, detail: "sent" },
  ]), "one of two is enough");
  ok(!anySent([
    { name: "ntfy", sent: false, detail: "no topic configured" },
    { name: "webhook", sent: false, detail: "no webhook configured" },
  ]), "nothing configured means nothing was reported");
  ok(!anySent([{ name: "ntfy", sent: false, detail: "FAILED — ntfy responded 503" }]),
    "a channel that errored did not report it");
  ok(!anySent([]), "no channels at all");
});

check("Delivery results read as a log line per channel", () => {
  eq(describeDelivery([
    { name: "ntfy", sent: true, detail: "sent" },
    { name: "webhook", sent: false, detail: "FAILED — 503" },
  ]), ["ntfy: sent", "webhook: FAILED — 503"]);
});

/* ---- report ------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`\n  ✕ ${f}`);
process.exit(failures.length ? 1 : 0);
