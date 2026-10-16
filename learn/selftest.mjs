#!/usr/bin/env node
/* ================================================
   CODE CLINIC — selftest.mjs
   The parts of the course that can be checked without a browser.

     node learn/selftest.mjs

   It loads the course's modules into a sandbox (no DOM — the same trick
   as guide/selftest.mjs) and then checks that the course holds together:

     · every JavaScript exercise's model answer passes its own checks,
       and every starter fails them — graded by the very harness the page
       uses, each run in its own thread with a time limit
     · every Python exercise the same way, with python3 standing in for
       Pyodide (skipped, loudly, if there's no python3)
     · every git challenge can be finished: its solution is replayed
       against its setup, and the check must flip from false to true
     · the practice model enforces the Messages API's rules, and the
       reference agent loop handles every stop reason
     · the statistics agree with published values and with scipy,
       statsmodels and lifelines (pinned here from a cross-check run)
     · the site checker the deployment track hands out catches what it
       says it catches

   HTML exercises need a real browser to grade; here their checks are
   only compiled. widgets.js, ui.js and app.js render what the modules
   below decide.
   ================================================ */

import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { Worker } from "node:worker_threads";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---- a browser, for a very small value of "browser" ---------------- */
function sandbox() {
  const mkStorage = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  };
  const localStorage = mkStorage(), sessionStorage = mkStorage();
  const win = { localStorage, sessionStorage };
  const ctx = createContext({
    window: win, localStorage, sessionStorage, console,
    setTimeout, clearTimeout, URL, URLSearchParams, structuredClone,
    TextEncoder, TextDecoder, AbortController, Intl, Date, Math, JSON, Promise,
  });
  const load = (rel) => runInContext(readFileSync(join(HERE, rel), "utf8"), ctx, { filename: `learn/${rel}` });
  ["util", "store", "stats", "gitsim", "agentsim", "sandbox", "course", "widgets"].forEach((n) => load(`js/${n}.js`));
  // The order the page loads them in, read from the page itself, so a new
  // content file can't be forgotten here.
  const html = readFileSync(join(HERE, "index.html"), "utf8");
  const contentFiles = Array.from(html.matchAll(/src="(js\/content\/[\w-]+\.js)"/g)).map((m) => m[1]);
  const onDisk = readdirSync(join(HERE, "js", "content")).filter((f) => f.endsWith(".js")).map((f) => `js/content/${f}`);
  contentFiles.forEach(load);
  return { CC: win.CC, contentFiles, onDisk };
}

const { CC, contentFiles, onDisk } = sandbox();
const { util: U, stats: S, git: G, agent: A, sandbox: SB, content: C } = CC;

/* ---- the harness -------------------------------------------------- */
let passed = 0;
const failures = [];
const notes = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || "value"}: expected ${b}, got ${a}`);
}
function near(actual, expected, tol, what) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${what || "value"}: expected ${expected} ±${tol}, got ${actual}`);
  }
}
const ok = (cond, what) => { if (!cond) throw new Error(what || "expected true"); };

/* ---- markdown -------------------------------------------------------- */

await check("markdown: headings, lists, code, tables, callouts", () => {
  const h = U.md(`
    ## Title

    A paragraph with \`code\`, **bold** and a [link](https://example.org).

    - one
    - two
      - nested
    1. first

    \`\`\`js
    const x = "<b>";
    \`\`\`

    | a | b |
    |---|---|
    | \`x \\| y\` | 2 |

    > [!SAFETY] Careful
    > Body text.
  `);
  ok(h.includes("<h2>Title</h2>"), "## becomes h2");
  ok(h.includes("<code>code</code>") && h.includes("<strong>bold</strong>"), "inline code and bold");
  ok(h.includes('href="https://example.org" target="_blank" rel="noopener noreferrer"'), "external links open safely");
  ok(/<li>two<ul><li>nested<\/li><\/ul><\/li>/.test(h), "nested list");
  ok(h.includes("<ol><li>first</li></ol>"), "ordered list");
  ok(h.includes('data-lang="js"') && h.includes("&lt;b&gt;"), "code is escaped, language kept");
  ok(h.includes("<td><code>x | y</code></td>"), "an escaped pipe stays in its cell");
  ok(h.includes('class="callout callout-safety"') && h.includes(">Careful<"), "callout with a title");
});

await check("markdown: nothing in a lesson can become markup or a script link", () => {
  const h = U.md("<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>");
  ok(!h.includes("<script>") && !h.includes("<img"), "raw HTML is escaped");
  ok(!h.includes("javascript:"), "javascript: links are dropped");
});

/* ---- store ------------------------------------------------------------ */

await check("store: a malformed import can't break the page", () => {
  const d = CC.store.normalise({ lessons: [1, 2], blocks: { "a:b": "nope", "c:d": { passed: 1 } }, notes: { x: 5, y: "kept" }, settings: { model: 42, effort: "high" } });
  eq(Object.keys(d.lessons), [], "lessons that aren't an object are dropped");
  eq(Object.keys(d.blocks), ["c:d"], "only object-shaped blocks survive");
  eq(d.notes, { y: "kept" }, "only string notes survive");
  eq(d.settings.model, "claude-opus-5-5", "a setting of the wrong type keeps its default");
  eq(d.settings.effort, "high", "a well-typed setting is kept");
});

await check("store: the API key never goes into an export", () => {
  CC.store.load();
  CC.store.setApiKey("sk-ant-secret", true);
  ok(!CC.store.exportJSON().includes("sk-ant-secret"), "key leaked into the export");
  CC.store.setApiKey("", false);
});

/* ---- statistics ---------------------------------------------------------- */
/* Reference values from scipy 1.18, statsmodels 0.15 and lifelines 0.30,
   computed on the same inputs. */

await check("stats: distributions match scipy", () => {
  near(S.tP(2.0, 10), 0.07338803477074037, 1e-12, "t p, df 10");
  near(S.tP(1.5, 3.7), 0.2135981692020135, 1e-12, "t p, fractional df");
  near(S.tCritical(10), 2.228138851986274, 1e-9, "t critical, df 10");
  near(S.chiSquareP(3.84, 1), 0.05004352124870519, 1e-12, "chi-square p, df 1");
  near(S.chiSquareP(10, 4), 0.04042768199451279, 1e-12, "chi-square p, df 4");
  near(S.normalCdf(1.96), 0.9750021048517795, 1e-12, "normal cdf");
  near(S.normalCdf(-3.2), 0.0006871379379158471, 1e-14, "normal cdf, tail");
});

await check("stats: tests and tables match scipy and statsmodels", () => {
  near(S.fisherExact(3, 9, 8, 2), 0.029973122852379817, 1e-12, "Fisher exact");
  near(S.fisherExact(1, 10, 9, 2), 0.0019052155275065491, 1e-12, "Fisher exact");
  const t = S.chiSquareTable([[10, 20, 30], [15, 25, 10]]);
  near(t.chi2, 10.73518518518519, 1e-9, "r×c chi-square");
  near(t.p, 0.004665349198069888, 1e-12, "r×c p");
  const b = S.twoByTwo(20, 80, 10, 90);
  near(b.rr, 2, 1e-12, "RR");
  near(b.or, 2.25, 1e-12, "OR");
  near(b.rd, 0.1, 1e-12, "RD");
});

await check("stats: quantiles follow R's type 7", () => {
  const s = S.summary([4, 1, 3, 2, null, NaN]);
  eq([s.n, s.missing], [4, 2], "n and missing");
  near(s.q1, 1.75, 1e-12, "q1");
  near(s.median, 2.5, 1e-12, "median");
  near(s.q3, 3.25, 1e-12, "q3");
  near(s.sd, 1.2909944487358056, 1e-12, "sample SD");
});

await check("stats: Kaplan–Meier, worked example", () => {
  const km = S.kaplanMeier([{ time: 2, event: 1 }, { time: 3, event: 0 }, { time: 4, event: 1 }, { time: 4, event: 1 }, { time: 5, event: 0 }, { time: 6, event: 1 }]);
  const ev = km.steps.filter((s) => s.events);
  eq(ev.map((s) => [s.time, s.atRisk, s.events]), [[2, 6, 1], [4, 4, 2], [6, 1, 1]], "steps");
  near(ev[1].survival, 5 / 12, 1e-12, "S(4)");
  eq(km.median, 4, "median: first time at or below 0.5");
});

/* The cohort itself: pinned so a change to the generator — which would
   silently change every number the lessons quote — fails here first.
   The estimates were cross-checked with statsmodels and lifelines. */
await check("stats: the MOVE-EARLY cohort is the cohort the lessons describe", () => {
  eq(S.SEED, 2553, "the course's seed");
  const c = S.makeCohort({ seed: S.SEED });
  const e = c.filter((r) => r.emp === 1), u = c.filter((r) => r.emp === 0);
  eq([c.length, e.length], [600, 362], "size and exposed");
  const a = e.filter((r) => r.readmit30).length, cc = u.filter((r) => r.readmit30).length;
  eq([a, cc], [40, 46], "readmissions");
  const t = S.twoByTwo(a, e.length - a, cc, u.length - cc);
  near(t.or, 0.5184985147177964, 1e-12, "crude OR");
  const bands = [[1, 3], [4, 4], [5, 5], [6, 8]].map(([lo, hi]) => {
    const g = c.filter((r) => r.cfs >= lo && r.cfs <= hi);
    const ge = g.filter((r) => r.emp), gu = g.filter((r) => !r.emp);
    const x = ge.filter((r) => r.readmit30).length, y = gu.filter((r) => r.readmit30).length;
    return { a: x, b: ge.length - x, c: y, d: gu.length - y };
  });
  const mh = S.mantelHaenszel(bands);
  near(mh.or, 0.7911808277541855, 1e-12, "Mantel–Haenszel OR");
  near(mh.orCI[0], 0.47974114357391956, 1e-9, "MH lower");
  near(mh.orCI[1], 1.3048017886115448, 1e-9, "MH upper");
  ok(mh.orCI[0] < 1 && mh.orCI[1] > 1, "the adjusted interval crosses 1 — the lessons depend on it");
  eq(S.kaplanMeier(u).median, 267, "usual-care median");
  eq(S.kaplanMeier(e).median, null, "programme median not reached");
  ok(S.logRank(e, u).p < 0.001, "crude log-rank p");
});

await check("stats: cleaning the messy file", () => {
  const csv = S.makeMessyCSV({ seed: S.SEED });
  const raw = S.parseSimpleCSV(csv);
  const clean = S.cleanCohort(csv);
  ok(raw.length > 600, "the messy file has duplicates in it");
  ok(clean.length < 600 && clean.length > 580, `cleaning keeps most rows (kept ${clean.length})`);
  eq(new Set(clean.map((r) => r.id)).size, clean.length, "no duplicate ids");
  ok(clean.every((r) => r.sex === "F" || r.sex === "M"), "sex is coded one way");
  ok(clean.every((r) => r.age === null || (r.age >= 18 && r.age <= 110)), "ages are plausible or missing");
  ok(clean.some((r) => r.age === null), "some ages are missing, as the lesson says");
});

/* ---- the git simulator ------------------------------------------------------ */

await check("git: the basics behave like git", () => {
  const g = G.create();
  const say = (l) => g.exec(l).map((o) => o.text).join("\n");
  ok(/not a git repository/.test(say("git status")), "status before init");
  say("git init");
  say('echo "<h1>Hi</h1>" > index.html');
  ok(/Untracked files/.test(say("git status")), "new file is untracked");
  say("git add .");
  ok(/root-commit/.test(say('git commit -m "First"')), "first commit is the root");
  ok(/nothing to commit/.test(say("git status")), "clean afterwards");
  say('echo "x" > index.html');
  ok(/-<h1>Hi<\/h1>/.test(say("git diff")) && /\+x/.test(say("git diff")), "diff shows the change");
  say("git restore index.html");
  eq(g.state.work["index.html"], "<h1>Hi</h1>", "restore brings the committed version back");
  ok(/rewrite history/.test(say("git reset --hard")), "reset is explained, not run");
});

await check("git: a switch that would clobber work is refused", () => {
  const g = G.create().run(["git init", 'echo "a" > f.txt', "git add .", 'git commit -m one', "git switch -c b", 'echo "b" > f.txt', 'git commit -am two', "git switch main"]);
  g.exec('echo "local" > f.txt');
  ok(/would be overwritten/.test(g.exec("git switch b").map((o) => o.text).join("\n")), "switch refused");
  eq(g.state.head, "main", "still on main");
});

for (const ch of C.gitChallenges) {
  await check(`git challenge "${ch.title}": solvable, and not solved by its setup`, () => {
    const sim = G.create();
    if (ch.setup) ch.setup(sim);
    ok(!ch.check(sim), "the check passes before anything is done");
    const steps = typeof ch.solution === "function" ? ch.solution(sim) : ch.solution;
    for (const line of steps) {
      const out = sim.exec(line);
      const err = out.find((o) => o.cls === "err" && !/rejected|failed to push|CONFLICT|Automatic merge failed|hint:/.test(o.text));
      if (err && !/rejected|CONFLICT/.test(out.map((o) => o.text).join(" "))) throw new Error(`"${line}" failed: ${err.text}`);
    }
    ok(ch.check(sim), "the replayed solution doesn't satisfy the check");
  });
}

/* ---- agents -------------------------------------------------------------- */

const bmiTool = {
  name: "calculate_bmi", description: "BMI", input_schema: { type: "object", properties: {} },
  run: (i) => { if (!(i.height_m > 0)) throw new Error("height must be greater than 0"); return (i.weight_kg / i.height_m ** 2).toFixed(1); },
};

await check("agents: the practice model enforces the protocol", async () => {
  const say = async (msgs, extra) => {
    const c = A.scriptedClient(A.SCENARIOS.oneTool);
    const first = await c.messages.create({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "q" }], tools: [{ name: "calculate_bmi", input_schema: { type: "object" } }] });
    try {
      await c.messages.create({ model: "m", max_tokens: 10, messages: msgs(first.content), ...(extra || {}) });
      return null;
    } catch (e) { return e.message; }
  };
  const user = { role: "user", content: "q" };
  ok(/no tool_result/.test(await say((c) => [user, { role: "assistant", content: c }, { role: "user", content: [{ type: "text", text: "hi" }] }])), "a missing tool_result is caught");
  ok(/unchanged/.test(await say((c) => [user, { role: "assistant", content: c.filter((b) => b.type !== "thinking") }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_bmi_1", content: "22.9" }] }])), "stripping the thinking block is caught");
  ok(/both 'user'/.test(await say(() => [user, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_bmi_1", content: "22.9" }] }])), "forgetting to append the reply is caught");
  ok(/run function/.test(await say((c) => [user, { role: "assistant", content: c }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_bmi_1", content: "22.9" }] }], { tools: [bmiTool] })), "sending a tool's code is caught");
  eq(await say((c) => [user, { role: "assistant", content: c }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_bmi_1", content: "22.9" }] }]), null, "a correct second request is accepted");
});

await check("agents: the reference loop handles every stop reason", async () => {
  const spy = { name: "search_pubmed", description: "s", input_schema: { type: "object" }, calls: 0, run() { this.calls++; return "[]"; } };
  const run = (sc, opts) => A.runAgent(A.scriptedClient(A.SCENARIOS[sc]), { messages: [{ role: "user", content: "q" }], tools: [bmiTool, spy], ...(opts || {}) });
  eq((await run("chat")).stop, "end_turn", "chat");
  ok(/22\.9/.test((await run("oneTool")).text), "one tool");
  ok(/22\.9.*29\.3/.test((await run("parallel")).text), "parallel tools");
  ok(/reported a problem/.test((await run("toolError")).text), "a tool error becomes is_error");
  ok(/don't have a tool/.test((await run("unknownTool")).text), "a missing tool becomes is_error");
  const r = await run("runaway", { maxSteps: 4 });
  eq([r.stop, r.steps], ["max_steps", 4], "runaway is bounded");
  spy.calls = 0;
  eq((await run("refusal")).stop, "refusal", "refusal");
  eq((await run("maxTokens")).stop, "max_tokens", "max_tokens");
  eq(spy.calls, 0, "no tool ran after a refusal or a cut-off reply");
});

await check("agents: the practice literature run catches its invented citation", async () => {
  const tools = [
    { name: "search_pubmed", description: "s", input_schema: { type: "object" }, run: (i) => JSON.stringify(A.practiceSearch(i.query, i.max_results)) },
    { name: "get_abstracts", description: "g", input_schema: { type: "object" }, run: (i) => JSON.stringify(A.practiceAbstracts(i.pmids)) },
  ];
  const r = await A.runAgent(A.scriptedClient(A.literatureScript("early mobility readmission")), { messages: [{ role: "user", content: "q" }], tools });
  eq(r.stop, "end_turn", "finishes");
  const v = A.verifyCitations(r.text, A.PRACTICE_RECORDS.map((x) => x.pmid));
  eq(v.unverified, ["PRACTICE-99"], "the invented citation is the only unverified one");
  ok(v.verified.length >= 2, "real practice citations verify");
  ok(A.PRACTICE_RECORDS.every((x) => /FICTIONAL/.test(x.abstract) && /fictional/i.test(x.journal)), "practice records say they're fictional");
});

await check("agents: identifiers are found, clinical numbers left alone", () => {
  const t = "Mr Raj Kumar, UHID: 2024/118734, MRN 00123456, DOB 12/03/1958, admitted 3 March 2024, ph +91 98765 43210 or 9876543210, (555) 123-4567, raj.k@example.com, 92-year-old.";
  eq(A.redact(t), "[NAME], [ID], [ID], DOB [DATE], admitted [DATE], ph [PHONE] or [PHONE], [PHONE], [EMAIL], [AGE].");
  const labs = "Na 140, K 4.2, Hb 9.8 g/dL, BP 140/90, Plt 150000, 2024 cohort, Patient ID unknown";
  eq(A.findPHI(labs), [], "lab values aren't identifiers");
});

await check("agents: the prompt checklist and the bigram model", () => {
  const weak = A.lintPrompt("Summarise this guideline.");
  const strong = A.lintPrompt("Summarise this guideline note for a cardiology fellow revising for exams. Use bullet points, under 150 words. Only use what is in the note; do not add doses. If something is unclear, flag it under Gaps. Cite the section each point comes from.");
  ok(weak.score <= 2 && strong.score === strong.max, `weak ${weak.score}, strong ${strong.score}/${strong.max}`);
  ok(!A.lintPrompt("Patient a.k@example.com needs a summary").checks.find((c) => c.id === "phi").ok, "identifiers fail the checklist");
  const m = A.bigram(["the patient was given fluids", "the patient improved", "the nurse was kind"]);
  const nw = A.nextWords(m, "the", 1);
  eq(nw.map((x) => x.word), ["patient", "nurse"], "next words, most likely first");
  near(nw[0].p, 2 / 3, 1e-12, "P(patient | the)");
  ok(A.nextWords(m, "the", 0.3)[0].p > nw[0].p, "low temperature sharpens");
});

/* ---- the course's structure ------------------------------------------------ */

await check("content: every file on disk is loaded by the page", () => {
  eq(contentFiles.slice().sort(), onDisk.slice().sort(), "index.html script list vs js/content/");
});

await check("content: ids are unique and every reference resolves", () => {
  const lessonIds = new Set();
  for (const t of C.tracks) {
    ok(t.id && t.title && t.icon && t.summary && t.lessons.length, `track ${t.id} is complete`);
    for (const l of t.lessons) {
      ok(!lessonIds.has(l.id), `duplicate lesson id ${l.id}`);
      lessonIds.add(l.id);
      ok(l.title && l.minutes > 0 && Array.isArray(l.blocks) && l.blocks.length, `lesson ${l.id} is complete`);
      const blockIds = new Set();
      for (const b of l.blocks) {
        if (b.id) { ok(!blockIds.has(b.id), `duplicate block id ${l.id}:${b.id}`); blockIds.add(b.id); }
        if (b.md != null) ok(typeof U.md(b.md) === "string", `markdown renders in ${l.id}`);
        if (b.type === "widget") ok(CC.widgets.get(b.widget), `${l.id}: no widget called ${b.widget}`);
        if (b.type === "quiz") {
          ok(b.options.length >= 2, `${l.id}:${b.id} has options`);
          const answers = Array.isArray(b.answer) ? b.answer : [b.answer];
          ok(answers.every((a) => Number.isInteger(a) && a >= 0 && a < b.options.length), `${l.id}:${b.id} answer in range`);
          ok(b.explain, `${l.id}:${b.id} explains its answer`);
        }
        if (b.type === "code") {
          ok(["js", "html", "python"].includes(b.lang), `${l.id}:${b.id} has a language`);
          ok(b.starter != null && b.solution && b.tests && b.tests.length, `${l.id}:${b.id} has a starter, an answer and checks`);
          ok(b.tests.every((t) => t.name && t.code), `${l.id}:${b.id} checks have names and code`);
          C.prelude(b);   // throws on an unknown "uses"
        }
      }
    }
  }
  ok(C.allLessons().some((l) => l.project === "website") && C.allLessons().some((l) => l.project === "research"), "both projects have lessons");
  ok(C.allLessons().length >= 40, `the course has its lessons (${C.allLessons().length})`);
});

/* ---- exercises: every model answer passes, every starter doesn't ----------- */

const HARNESS_SRC = SB.jsHarness.toString();

/* Each run gets its own thread and a time limit, so a starter that loops
   can't hang CI — the same reason the page gives each run its own worker. */
function runJsIsolated(code, tests, prelude) {
  return new Promise((resolve) => {
    const w = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      const jsHarness = (0, eval)("(" + workerData.src + ")");
      jsHarness(workerData.code, workerData.tests, workerData.prelude)
        .then((r) => parentPort.postMessage(r), (e) => parentPort.postMessage({ ok: false, error: { kind: "internal", message: String(e) }, results: [] }));
    `, { eval: true, workerData: { src: HARNESS_SRC, code, tests, prelude } });
    const timer = setTimeout(() => { w.terminate(); resolve({ ok: false, error: { kind: "timeout", message: "timed out" }, results: [] }); }, 20000);
    w.on("message", (r) => { clearTimeout(timer); w.terminate(); resolve(r); });
    w.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, error: { kind: "internal", message: e.message }, results: [] }); });
  });
}

const py = spawnSync("python3", ["--version"], { encoding: "utf8" });
const havePython = py.status === 0;
if (!havePython) notes.push("python3 not found — the Python exercises were NOT checked. Install Python 3 and rerun.");

function runPython(code, tests, prelude) {
  const driver = SB.PY_HARNESS + "\nimport sys\nsys.stdout.write(__cc_run_json(sys.stdin.read()))\n";
  const r = spawnSync("python3", ["-I", "-c", driver], { input: JSON.stringify({ code, tests, prelude }), encoding: "utf8", timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { ok: false, error: { kind: "internal", message: (r.stderr || r.error || "python failed").toString().slice(0, 400) }, results: [] };
  return JSON.parse(r.stdout);
}

const describe = (r) => (r.error ? `${r.error.kind}: ${r.error.message}${r.error.line ? ` (line ${r.error.line})` : ""}` : "")
  + (r.results || []).filter((x) => !x.pass).map((x) => `\n      ✗ ${x.name} — ${x.message}`).join("");

for (const l of C.allLessons()) {
  for (const b of l.blocks.filter((x) => x.type === "code")) {
    const label = `exercise ${l.id}:${b.id}`;
    if (b.lang === "html") {
      await check(`${label}: its checks compile`, () => {
        const AF = Object.getPrototypeOf(async function () {}).constructor;
        b.tests.forEach((t) => new AF("$check", "$q", "$qa", "$style", "$text", "$sleep", "$type", "$click", "$eq", "$rules", t.code));
        ok(/<html/i.test(b.solution) && /<\/html>/i.test(b.solution), "the answer is a whole page");
      });
      continue;
    }
    const prelude = C.prelude(b);
    if (b.lang === "python") {
      if (!havePython) continue;
      await check(`${label}: the model answer passes`, () => {
        const r = runPython(b.solution, b.tests, prelude);
        ok(r.ok, describe(r));
      });
      await check(`${label}: the starter doesn't`, () => {
        ok(!runPython(b.starter, b.tests, prelude).ok, "the starter already passes every check");
      });
      continue;
    }
    await check(`${label}: the model answer passes`, async () => {
      const r = await runJsIsolated(b.solution, b.tests, prelude);
      ok(r.ok, describe(r));
    });
    await check(`${label}: the starter doesn't`, async () => {
      ok(!(await runJsIsolated(b.starter, b.tests, prelude)).ok, "the starter already passes every check");
    });
  }
}

/* The "try it" blocks have no checks, but they shouldn't crash either. */
for (const l of C.allLessons()) {
  for (const b of l.blocks.filter((x) => x.type === "try")) {
    if (b.lang === "python") {
      if (!havePython) continue;
      await check(`try-it block in ${l.id} runs`, () => { const r = runPython(b.code, [], C.prelude(b)); ok(!r.error, describe(r)); });
    } else {
      await check(`try-it block in ${l.id} runs`, async () => { const r = await runJsIsolated(b.code, [], C.prelude(b)); ok(!r.error, describe(r)); });
    }
  }
}

/* ---- the grader reports mistakes usefully ---------------------------------- */

await check("grader: syntax errors are located, runtime errors traced to your line", async () => {
  const syn = await runJsIsolated("let a = 1;\nlet b = ;\n", [], "");
  eq([syn.error.kind, syn.error.line], ["syntax", 2], "syntax error on line 2");
  const open = await runJsIsolated("function f() {\n  return 1;\n", [], "");
  ok(/never closed/.test(open.error.message), "an unclosed brace says so");
  const rt = await runJsIsolated("function f() {\n  return null.x;\n}\n", [{ name: "t", code: "f();" }], "const pad = 1;\nconst more = 2;");
  ok(/your line 2/.test(rt.results[0].message), `a failing check names the line: ${rt.results[0].message}`);
  const loop = await runJsIsolated("while (true) {}", [], "");
  eq(loop.error.kind, "timeout", "a runaway loop is stopped");
});

/* ---- the site checker the deployment track hands out ------------------------ */

await check("check-site.mjs: passes a good site, catches a bad one", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-site-"));
  try {
    writeFileSync(join(dir, "check-site.mjs"), CC.widgets.CHECK_SITE);
    const site = join(dir, "site");
    mkdirSync(join(site, "img"), { recursive: true });
    writeFileSync(join(site, "img", "me.jpg"), "x");
    writeFileSync(join(site, "index.html"), '<!DOCTYPE html><html lang="en"><head><title>Me</title></head><body><img src="img/me.jpg" alt=""><a href="pubs.html">Pubs</a><a href="https://doi.org/10.1/x">Paper</a><a href="mailto:a@example.org">Mail</a><a href="#top">Top</a></body></html>');
    writeFileSync(join(site, "pubs.html"), '<!DOCTYPE html><html lang="en"><head><title>Publications</title></head><body><a href="index.html?x=1#y">Home</a></body></html>');
    const good = spawnSync(process.execPath, [join(dir, "check-site.mjs"), site], { encoding: "utf8" });
    eq(good.status, 0, `a good site passes (${good.stderr.trim()})`);
    writeFileSync(join(site, "bad.html"), '<html><head></head><body><img src="missing.png"><a href="nowhere.html">x</a></body></html>');
    const bad = spawnSync(process.execPath, [join(dir, "check-site.mjs"), site], { encoding: "utf8" });
    eq(bad.status, 1, "a bad site fails");
    for (const want of ["no <title>", "no lang attribute", "without alt text", "broken link -> nowhere.html", "broken link -> missing.png"]) {
      ok(bad.stderr.includes(want), `reports "${want}"`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await check("workflow builder: the YAML has the shape a workflow needs", () => {
  for (const y of [CC.widgets.workflowYaml({ weekly: false }), CC.widgets.workflowYaml({ weekly: true }), CC.widgets.PAGES_YAML]) {
    ok(/^name: /m.test(y) && /^on:/m.test(y) && /^jobs:/m.test(y) && /^permissions:/m.test(y), "top-level keys");
    ok(!/\t/.test(y), "no tabs — YAML forbids them");
    ok(y.split("\n").every((line) => (line.match(/^ */)[0].length % 2) === 0), "indentation in steps of two");
  }
  ok(/cron: "23 6 \* \* 1"/.test(CC.widgets.workflowYaml({ weekly: true })), "the weekly schedule");
});

/* ---- report ------------------------------------------------------------------- */

const total = passed + failures.length;
for (const n of notes) console.log(`note: ${n}`);
if (failures.length) {
  console.log(`\n${failures.length} of ${total} checks failed:\n`);
  failures.forEach((f) => console.log(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`Code Clinic self-test: all ${total} checks pass (${C.allLessons().length} lessons, ${C.allLessons().reduce((n, l) => n + l.blocks.filter((b) => b.type === "code").length, 0)} exercises).`);
