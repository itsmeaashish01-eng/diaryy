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
import { toText, digest } from "./types/webpage.mjs";
import diary from "./types/diary.mjs";
import { decide } from "./core/brain.mjs";
import { blankAgentState, remember, loadState, saveState, agentState } from "./core/state.mjs";

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
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

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
  for (let i = 0; i < 500; i++) remember(s, { seen: [`k${i}`], metric: { t: i, v: i } });
  ok(s.seen.length <= 400, `seen capped, got ${s.seen.length}`);
  eq(s.seen[s.seen.length - 1], "k499", "newest key kept");
  eq(s.metrics[s.metrics.length - 1].v, 499, "newest metric kept");
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

/* ---- report ------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`\n  ✕ ${f}`);
process.exit(failures.length ? 1 : 0);
