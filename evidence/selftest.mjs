#!/usr/bin/env node
/* ================================================
   EVIDENCE DESK — selftest.mjs
   The parts that can be checked without a browser.

     node evidence/selftest.mjs

   The modules are plain scripts that hang off a global, so this runs them
   in a sandbox with a `window` and nothing else, then feeds them a page of
   the kind the app is for: a clinical question, an answer with numbered
   citations, a reference list.

   What is being protected is mostly the grading. A trial filed as a
   guideline, or a tree that invents a branch, is the kind of wrong that
   reads as right — so those are pinned down here.

   ui.js and app.js are left out: they need a DOM, and only draw what the
   modules below decide.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const win = {};
const ctx = createContext({ window: win, console, URL, JSON, Date, Math, Set, Map, AbortSignal });
for (const name of ["util", "capture", "analyze", "brain"]) {
  runInContext(readFileSync(join(HERE, "js", `${name}.js`), "utf8"), ctx, { filename: `evidence/js/${name}.js` });
}
const { capture, analyze, brain } = win.EV;

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(detail ? `${name} — ${detail}` : name);
}
const eq = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

/* ---- a page ------------------------------------------------------- */

const PAGE = {
  v: 1,
  url: "https://example-evidence.test/ask/123",
  title: "Anticoagulation in atrial fibrillation with CKD",
  question: "Which anticoagulant is preferred in atrial fibrillation with chronic kidney disease?",
  text: [
    "Which anticoagulant is preferred in atrial fibrillation with chronic kidney disease?",
    "Share",
    "Direct oral anticoagulants are generally preferred over warfarin for stroke prevention in atrial fibrillation.[1][2]",
    "In patients with moderate chronic kidney disease, apixaban is recommended as first-line therapy.[1] In a pooled analysis, apixaban reduced major bleeding by 31% compared with warfarin (HR 0.69, 95% CI 0.60-0.80).[2]",
    "If the patient is on haemodialysis, the evidence is limited and the decision should be individualised.[3-4]",
    "Dabigatran should be avoided in patients with a creatinine clearance below 30 mL/min.[1]",
    "Warfarin is reasonable for patients with a mechanical heart valve.[1]",
    "In a 2019 trial, the results were mixed.",
    "Among adults with end-stage kidney disease, bleeding rates were higher with rivaroxaban than apixaban.[4]",
    "References",
    "1. 2023 ACC/AHA Guideline for the Diagnosis and Management of Atrial Fibrillation. Circulation. 2024.",
  ].join("\n"),
  links: [
    { t: "[1]", u: "https://journals.test/guideline", c: "Direct oral anticoagulants are generally preferred over warfarin" },
    { t: "2023 ACC/AHA Guideline for the Diagnosis and Management of Atrial Fibrillation", u: "https://journals.test/guideline",
      c: "2023 ACC/AHA Guideline for the Diagnosis and Management of Atrial Fibrillation. Circulation. 2024." },
    { t: "Apixaban versus warfarin in kidney disease: a systematic review and meta-analysis of randomized trials", u: "https://journals.test/meta",
      c: "Apixaban versus warfarin in kidney disease: a systematic review and meta-analysis of randomized trials. BMJ. 2021." },
    { t: "Apixaban for patients on hemodialysis: a randomized controlled trial", u: "https://journals.test/rct",
      c: "Apixaban for patients on hemodialysis: a randomized controlled trial. NEJM. 2022." },
    { t: "Outcomes with rivaroxaban in dialysis: a retrospective cohort", u: "https://journals.test/cohort",
      c: "Outcomes with rivaroxaban in dialysis: a retrospective cohort. JASN. 2018." },
    { t: "Privacy policy", u: "https://example-evidence.test/privacy", c: "" },
    { t: "Ask another question", u: "https://example-evidence.test/ask", c: "" },
    { t: "click me", u: "javascript:alert(1)", c: "" },
  ],
};

const cap = capture.normalize(PAGE);
const a = analyze.run(cap);

/* ---- capture ------------------------------------------------------ */

check("a javascript: link never survives normalize", cap.links.every((l) => /^https?:/.test(l.u)));
eq("the question is carried through", a.question, PAGE.question);
check("a capture that is not an object becomes an empty one", capture.normalize("nope").text === "");
check("clipboard JSON from the bookmarklet is recognised", capture.fromText(JSON.stringify(PAGE)).v === 1);
eq("a bare URL in pasted text becomes a link",
  capture.fromText("SPRINT trial, NEJM 2015 https://example.test/sprint.").links[0].u, "https://example.test/sprint");
check("the bookmarklet is a javascript: URL that names the notebook",
  capture.bookmarklet("https://me.test/evidence/").startsWith("javascript:") &&
  decodeURIComponent(capture.bookmarklet("https://me.test/evidence/")).includes("https://me.test/evidence/#capture"));

/* ---- references --------------------------------------------------- */

eq("four papers, navigation dropped, the [1] link folded into its title",
  a.refs.map((r) => r.kind), ["guideline", "synthesis", "rct", "observational"]);
eq("years come from the citation", a.refs.map((r) => r.year), [2024, 2021, 2022, 2018]);
eq("a review of trials is a synthesis, not a trial",
  analyze.classify("A systematic review of randomized controlled trials").id, "synthesis");
eq("an unrecognisable title is unclassified, not guessed", analyze.classify("Apixaban and the kidney").id, "unknown");
eq("a reference list with no links still yields references",
  analyze.refs({ url: "", links: [], text: "Answer.\nReferences\n1. The SPRINT randomized trial of blood pressure. NEJM 2015.\n2. x" })
    .map((r) => [r.kind, r.year]), [["rct", 2015]]);

/* ---- reading order ------------------------------------------------ */

eq("strongest design first, newest first within it", a.reading.map((r) => r.n), [1, 2, 3, 4]);
eq("older trial sorts after a newer one",
  analyze.reading([
    { n: 1, kind: "rct", level: 2, year: 2010 },
    { n: 2, kind: "rct", level: 2, year: 2020 },
    { n: 3, kind: "guideline", level: 1, year: 2005 },
  ]).map((r) => r.n), [3, 2, 1]);

/* ---- appraisal ---------------------------------------------------- */

eq("a cited guideline lands on the first rung", [a.appraisal.grade, a.appraisal.steps.length], ["strong", 1]);
eq("trials alone are moderate", analyze.appraise([{ kind: "rct" }]).grade, "moderate");
eq("cohorts alone are limited", analyze.appraise([{ kind: "observational" }]).grade, "limited");
eq("reviews alone are weak", analyze.appraise([{ kind: "review" }]).grade, "weak");
eq("no sources is said plainly, after every question was asked",
  [analyze.appraise([]).grade, analyze.appraise([]).steps.length], ["none", 4]);

/* ---- the tree ----------------------------------------------------- */

const branches = a.tree.children.map((c) => [c.text, c.children[0].kind]);
check("'In patients with X, Y is recommended' is a branch that says do",
  branches.some(([t, k]) => /^In patients with moderate chronic kidney disease$/.test(t) && k === "do"), JSON.stringify(branches));
check("'If …' is a branch", branches.some(([t]) => /^If the patient is on haemodialysis$/.test(t)));
check("'avoided in patients with …' is a caution",
  branches.some(([t, k]) => /creatinine clearance below 30/.test(t) && k === "caution"), JSON.stringify(branches));
check("'reasonable for patients with …' is a branch",
  branches.some(([t, k]) => /mechanical heart valve/.test(t) && k === "do"));
check("an observation with no instruction is a finding",
  branches.some(([t, k]) => /end-stage kidney disease/.test(t) && k === "finding"), JSON.stringify(branches));
check("'In a 2019 trial, …' is not about a patient, so not a branch", !branches.some(([t]) => /2019 trial/.test(t)));
eq("a leaf keeps its citations, ranges expanded",
  a.tree.children.find((c) => /haemodialysis/.test(c.text)).children[0].cites, [3, 4]);
check("citation markers are stripped from what is shown",
  !a.tree.children.some((c) => /\[\d/.test(c.text + c.children[0].text)) && !/\[\d/.test(a.summary.join(" ")));
eq("a citation number past the reference list is dropped", analyze.citesIn("as shown.[2][9]", 4), [2]);
eq("text with no conditions gives a tree with no branches, not an invented one",
  analyze.tree("Apixaban was studied in several large trials over the last decade.", "q", 0).children.length, 0);

/* ---- summary ------------------------------------------------------ */

check("the summary is made of sentences from the page",
  a.summary.length > 0 && a.summary.every((s) => PAGE.text.replace(/\[[\d-]+\]/g, "").includes(s)), JSON.stringify(a.summary));
check("the question is not offered as its own answer", !a.summary.some((s) => s.endsWith("?")));
check("the reference list is not summarised", !a.summary.concat(a.findings).some((s) => /Circulation/.test(s)));
check("a sentence with a hazard ratio is surfaced", a.summary.concat(a.findings).some((s) => /HR 0\.69/.test(s)));
eq("'e.g.' does not end a sentence",
  analyze.sentences("Use a direct agent, e.g. Apixaban or another, when renal function allows it.").length, 1);

/* ---- what Claude sends back --------------------------------------- */

const built = brain.buildTree("q", [
  { id: 1, parent: 0, kind: "if", text: "CKD stage 3", cites: [] },
  { id: 2, parent: 1, kind: "do", text: "Apixaban", cites: [1, 1, 99] },
  { id: 3, parent: 2, kind: "do", text: "hangs off a leaf", cites: [] },
  { id: 4, parent: 42, kind: "do", text: "orphan", cites: [] },
  { id: 1, parent: 0, kind: "if", text: "duplicate id", cites: [] },
], 4);
eq("a model's flat list becomes a tree; orphans, duplicates and children of leaves are dropped",
  [built.children.length, built.children[0].children.length, built.children[0].children[0].children.length], [1, 1, 0]);
eq("citations it invented are dropped", built.children[0].children[0].cites, [1]);

/* ---- export ------------------------------------------------------- */

const note = { source: { url: cap.url }, analysis: a, read: { 1: true }, mine: "Check the dialysis trial." };
const md = analyze.toMarkdown(note);
check("markdown carries the tree, the verdict and my notes",
  md.includes("## Decision tree") && md.includes("Synthesised evidence") && md.includes("Check the dialysis trial."));
const items = analyze.toReadingItems(note, "2026-01-01");
eq("reading items skip what is already read and rank by design",
  items.map((i) => [i.priority, i.added]), [[5, "2026-01-01"], [4, "2026-01-01"], [3, "2026-01-01"]]);

/* ---- verdict ------------------------------------------------------ */

if (failures.length) {
  console.error(`\n${failures.length} failed:\n` + failures.map((f) => "  ✗ " + f).join("\n"));
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`evidence: ${passed} checks passed`);
