# AGENTS.md

Instructions for any AI coding agent working in this repository. OpenAI
Codex reads this file directly; Claude Code reads it through `CLAUDE.md`.
Project rules live here, in one place, so both agents follow the same ones.

## What this is

A personal diary and three companion apps, all static pages. No build
step, no server, and no `package.json` at the root: open an `index.html`
and it runs.

| Path | What it is |
|---|---|
| `index.html`, `script.js`, `style.css` | The diary. Data lives in localStorage under `diaryData` |
| `tracker/` | Price Watch: price tracking, alerts, a buy signal. See `tracker/README.md` |
| `agents/` | Small watchers that GitHub Actions runs hourly. See `agents/README.md` |
| `guide/` | RoamGuide, a travel planner that installs as a web app. See `guide/README.md` |
| `guide/ios-app/` | The Capacitor wrapper for the App Store, and the only place with npm dependencies |
| `angio/` | Neuroangiography Atlas: six-vessel simulated injections on a schematic model. See `angio/README.md` |

Read the README of the app you're changing before you change it. They
explain decisions that look like mistakes from the outside.

## Checks

Run these before every commit. CI (`.github/workflows/checks.yml`) runs
the same steps on Node 20. They are offline and take a few seconds:

```bash
node agents/selftest.mjs
node guide/selftest.mjs
node angio/selftest.mjs
node agents/runner.mjs --validate
for f in agents/runner.mjs agents/selftest.mjs agents/core/*.mjs agents/types/*.mjs agents/app.js script.js guide/selftest.mjs guide/js/*.js angio/selftest.mjs angio/js/*.js; do node --check "$f"; done
```

The diary and `tracker/` have no test suite. Check a change there by
opening the page.

## How the code is written

- **No dependencies, no build.** Plain browser JavaScript and Node ES
  modules. Call APIs with `fetch` rather than an SDK; `agents/core/brain.mjs`
  calls the Claude API over raw HTTP for this reason. Don't add a
  `package.json` outside `guide/ios-app/`.
- **Browser scripts hang off a global**: `window.PT` in `tracker/`,
  `window.RG` in `guide/`. The `<script>` order in each `index.html` matters.
- **Each file opens with a header comment** saying what it is, and comments
  explain why rather than what. Match the style of the file you're in.
- **Render outside text as text.** Anything from a feed, a web page or the
  user goes into the page with DOM nodes and `textContent`, not as HTML.
- **Adding an agent type** is one file in `agents/types/` plus one line in
  `agents/core/registry.mjs`. **Adding a city** is one file in
  `guide/js/cities/` plus a `<script>` tag. The READMEs give the shape.

## Things not to do

- **Never commit `agents/private/`.** It is gitignored on purpose: it holds
  personal study notes and may hold patient information.
- **Leave the hourly data files alone unless asked.** Workflows on `main`
  rewrite `agents/data/state.json` and `tracker/data/watches.json` every
  hour. On a merge conflict in `state.json`, take `main`'s version.
  `watches.json` holds both the watch list and the recorded prices, so keep
  both sides.
- **Don't weaken the agents' safety guards.** Agent definitions must not be
  able to run programs or fetch from loopback or private addresses. See
  "Safety" in `agents/README.md`.
- **No secrets in files.** Keys such as `ANTHROPIC_API_KEY` and `NTFY_TOPIC`
  are GitHub Actions secrets.

## Working alongside another agent

Claude and Codex both work in this repository.

- Work on your own branch, never directly on `main`: `claude/...` for
  Claude, `codex/...` for Codex. Don't push to the other agent's branch.
- One task per branch, merged into `main` through a pull request. Smaller
  pull requests conflict less.
- `main` gets bot commits every hour, so fetch and merge it before pushing.
- When reviewing the other agent's pull request, read the diff and run the
  checks. Suggest fixes in the review rather than pushing them, unless asked.
- When a project rule changes, change it here, not in `CLAUDE.md`.
