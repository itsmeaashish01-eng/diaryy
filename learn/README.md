# Code Clinic

An interactive course in coding, agentic AI and software deployment, built
around two projects: **your own website**, and **a toolkit for healthcare
research**. Every lesson moves one of them forward.

Open `learn/index.html`. No build step, no server, no dependencies — the
same shape as the rest of this repository. For the Python exercises (and
the live parts of the agent lab), serve it instead:

```
python3 -m http.server 8000     # then http://localhost:8000/learn/
```

The diary's top bar links to it (⚕).

## What's in it

Forty-five lessons in five tracks, about thirty hours at a steady pace:

| Track | Teaches | Builds |
|---|---|---|
| **Start here** | How the course works; setting up your machine | A plan you can keep |
| **Coding** | HTML, CSS, JavaScript, then Python for data | Your website, one exercise at a time |
| **Agentic AI** | How language models work, prompting, patient data, the API, tools, the agent loop, guardrails, evaluation | A literature assistant that can only cite what it found |
| **Deployment** | The web, git, GitHub, Pages, domains, Actions, servers, operations | Your website, live on your own address and watched |
| **Healthcare research** | PICO, ethics, searching, cleaning, Table 1, risks and odds, confounding, survival analysis, reproducibility | A written-up analysis of a simulated cohort |

The dashboard tracks both projects. Lessons tagged *website* or *research*
are the ones that build them.

### The exercises

Thirty-four graded exercises, each with an editor, a **Run** button
(Ctrl/⌘ + Enter), checks that say what's wrong in plain words, hints that
get more specific, and a model answer — offered after two honest attempts.

| Language | Runs in | Checked by |
|---|---|---|
| JavaScript | A Web Worker made fresh for every run; a loop that never ends is stopped after a few seconds | Checks in the same scope as your code |
| HTML | A sandboxed iframe with no access to this page's storage — the preview you see is the page that's checked | Checks injected into that iframe, reporting back by message |
| Python | Pyodide 314.0.7 (CPython compiled to WebAssembly) in a module worker, loaded the first time it's needed | The same harness, run by `python3` in the self-test |

Syntax errors come back with a line number even though browsers don't give
one (the grader finds it by parsing ever-longer prefixes of your code), and
runtime errors are traced to *your* line, not the grader's.

### The interactive pieces

- **A git simulator** with a commit graph and a pretend GitHub — including
  the push that's rejected because the agents workflow committed while you
  were working, which is what really happens in this repository every hour.
- **A practice Claude** that enforces the Messages API's protocol: every
  `tool_use` needs its `tool_result`, assistant turns go back unchanged
  (thinking blocks included), tools are sent without their code. Break a
  rule and you get the kind of 400 the real API would give you.
- **The literature lab**: system prompt, two read-only tools, the loop you
  wrote, and a citation check against what the tools actually returned.
  Practice mode is scripted with fictional records and invents one citation
  on purpose; live mode uses your API key and real PubMed.
- **MOVE-EARLY**, a simulated cohort of 600 adults built to teach
  confounding by indication: frailer patients get the early mobility
  programme less often *and* do worse, so the crude odds ratio (0.52)
  flatters it and the frailty-adjusted one (0.79, CI 0.48–1.30) recovers
  the simulated truth. Table 1, a 2×2 calculator, a stratified forest plot,
  Kaplan–Meier curves with numbers at risk, and a structured-abstract
  builder all read it.
- A bigram language model you can read, a prompt checklist, a PHI scanner,
  a PICO-to-PubMed builder, DNS records for your domain, a GitHub Actions
  workflow generator, and an "is my site live?" check.

## Where your work lives

Progress, code and notes are saved in this browser's `localStorage` under
`codeClinic` — nothing goes to a server. **⤓** exports everything as one
file; **⤒** brings it back on another machine. "Log this to today's diary"
adds a finished lesson to the diary next door as a done task, so it counts
in the diary's own totals.

An API key, if you give the agent lab one, is kept apart: in
`sessionStorage` unless you tick "remember", **never** in the export file,
and sent only to `api.anthropic.com`. The page calls the API directly with
the `anthropic-dangerous-direct-browser-access` header, which is acceptable
for your own key on your own machine and never for a key in a page other
people use — the course says so where it matters. Set a spend limit on the
key.

No real patient data is used anywhere. The cohort is simulated, the
practice literature is fictional and labelled so in every field, and the
lessons on patient data say plainly where identifiable information may and
may not go.

## Where this has to run

| | Opened from disk | Served (localhost or Pages) |
|---|---|---|
| Lessons, quizzes, widgets, JavaScript and HTML exercises | ✓ | ✓ |
| Python exercises | — module workers can't load Pyodide from a `file://` page | ✓ (needs cdn.jsdelivr.net) |
| Agent lab, live mode | — | ✓ (needs api.anthropic.com and eutils.ncbi.nlm.nih.gov) |

GitHub Pages serves it free from this repository: **Settings → Pages →
Deploy from a branch → `main` → `/` (root)**, and it lands at
`https://<username>.github.io/<repo>/learn/`. The deployment track walks
through exactly that, for your own site.

To use Python without the CDN — offline, or behind a firewall — serve the
Pyodide npm package yourself and point the course at it:

```js
localStorage["codeClinic.pyodideBase"] = "http://localhost:8001/";
```

## How it's checked

```
node learn/selftest.mjs
```

No dependencies and no network, like the agents' and RoamGuide's tests,
and CI runs it on every push. It loads the course into a sandbox and:

- runs every exercise's **model answer** through the same grader the page
  uses — JavaScript in an isolated thread with a time limit, Python through
  `python3` — and requires it to pass, and requires every **starter** to fail;
- replays every **git challenge's** solution against its setup, and
  requires the check to flip from false to true;
- drives the practice model and the reference agent loop through every stop
  reason, and checks the protocol violations are caught;
- pins the statistics to scipy, statsmodels and lifelines values computed on
  the same inputs — and pins the cohort itself, so a change to the
  generator, which would silently change every number the lessons quote,
  fails first;
- runs the site checker the deployment track hands out against a good and a
  broken site.

HTML exercises need a browser to grade; the self-test compiles their checks.
They were verified in Chromium along with the rest of the page: every model
answer passes, every starter fails, at desktop and phone widths, light and
dark.

## Adding a lesson

Lessons are data, in `js/content/<track>.js`:

```js
{
  id: "code-something",            // unique across the course
  title: "…",
  minutes: 30,
  project: "website",              // or "research", or leave it out
  summary: "…",
  objectives: ["…"],
  blocks: [
    { md: `Markdown — with \`code\` written \\\` inside the template literal` },
    {
      type: "code", id: "ex1", lang: "js",        // "js" | "html" | "python"
      prompt: "…", starter: "…", solution: "…",
      hints: ["…"],
      tests: [{ name: "What's being checked", code: "$eq(fn(2), 4)" }],
      uses: ["cohort"],            // optional: stats, agents, cohort, messyCSV
    },
    { type: "quiz", id: "q1", question: "…", options: ["…", "…"], answer: 1, explain: "…" },
    { type: "widget", id: "w1", widget: "kmPlot", optional: true },
  ],
}
```

JavaScript checks get `$check`, `$eq`, `$near`, `$throws` and `$output`;
HTML checks get `$q`, `$qa`, `$style`, `$text`, `$type`, `$click`, `$sleep`
and `$rules`; Python checks get `_check`, `_eq`, `_near` and `_output`. A
block is required for the lesson to count as done unless it's `optional`.
Run the self-test: a model answer that doesn't pass, or a starter that
already does, fails it.

## Files

```
learn/
  index.html, style.css      the page, in the diary's palette and type
  selftest.mjs               the checks above
  js/util.js                 helpers and the lessons' markdown
  js/store.js                progress, code, notes; export and import
  js/sandbox.js              the three runners and their graders
  js/stats.js                descriptive stats, 2×2, Mantel–Haenszel, tests,
                             Kaplan–Meier, log-rank, the simulated cohort
  js/gitsim.js               the git simulator
  js/agentsim.js             the practice model, agent loop, PHI scanner,
                             prompt checklist, bigram model, Claude and PubMed
  js/course.js               the lesson registry and exercise preludes
  js/widgets.js              the interactive pieces
  js/ui.js, js/app.js        lessons, routing, dashboard
  js/content/*.js            the five tracks
```
