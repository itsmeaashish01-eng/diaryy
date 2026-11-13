# Evidence Desk

A notebook for what you read. You look something up — an OpenEvidence
answer, a PubMed abstract, a journal page — click once, and get a note:

- a **summary** of what the page said,
- a **decision tree** of its "if this patient, then that" statements,
- a verdict on **how far to lean on it**, from the kinds of study it cites,
- a **reading list** of those studies, in the order worth opening them.

Open `evidence/index.html`. No build, no server, no account. Notes live in
this browser's localStorage under `evidenceDesk`.

```bash
node evidence/selftest.mjs     # check the reasoning
```

---

## Getting a page in

A web page cannot read your other tabs, and nothing here tries to. The
reading happens inside the page you are on, when you ask for it.

**The bookmarklet.** The Capture tab has a button to drag to your bookmarks
bar. Click it on a page and it collects that page's text and links, opens
Evidence Desk in a new tab, and hands them over. Select part of a long page
first and only the selection is taken. It needs Evidence Desk to be on the
web (GitHub Pages serves it at `…/diaryy/evidence/`); opened as a local
file, a page on another site is not allowed to open it.

**Paste.** Select the answer and its reference list, copy, paste into the
box. The clipboard carries the HTML as well as the words, so the links to
the papers come too. This is the way on a phone, and the fallback if a site
blocks the bookmarklet — in which case the bookmarklet puts the capture on
your clipboard and tells you to paste it.

It does not know anything about OpenEvidence in particular. It reads the
main column of whatever page it is run on, which is why it also works on
PubMed and journal sites, and why a redesign there will not break it.

---

## How a note is made

By rules, by default (`js/analyze.js`). No model, no network, no key.

| Part | How |
|---|---|
| References | Links that leave the site, grouped by address so the `[3]` in the prose and the title in the list are one paper. A reference list with no links is read as lines |
| Study type | From the title: guideline, systematic review, randomised trial, observational, case report, review. First match wins, so a *review of trials* is a review. No match is "unclassified", never a guess |
| Summary | Sentences **picked from the page, never rewritten**, scored on overlap with your question, the language of recommendation, and carrying a number |
| Decision tree | Sentences shaped like "In patients with X, Y…", "If X, Y…", "Y is recommended for adults with X", "avoid Y in patients with Z". Each is one branch; each leaf keeps its citation numbers |
| How far to lean on it | Four fixed questions asked in order — guideline or synthesis? a trial? observational data? anything? — stopping at the first yes. The path is shown, not just the verdict |
| Reading order | Strongest design first, newest first within a design |

The tree reads grammar, not medicine. It misses a branch phrased unusually
and cannot tell a good recommendation from a bad one. It is a map of where
to look in the papers, not a protocol.

### With Claude

Put an API key in Settings and each note gets a **Rewrite with Claude**
button (`js/brain.js`). That sends the page's text to Anthropic and returns
a written summary, a properly nested tree, a reason to read each paper, and
what the page leaves unanswered.

The split is the same as `agents/core/brain.mjs`: **the rules grade, Claude
only writes.** Study types and the strength verdict never come from the
model. It is told to use nothing but the page, and what it returns is
checked on the way in — a citation number the page did not have, or a tree
node with no parent, is dropped.

It only ever runs on a click, never on capture, so a page cannot spend your
money by being read.

---

## Safety

- **Captured text is outside text.** Everything enters through
  `capture.normalize()`, which clips it and keeps only `http(s)` links, and
  everything is drawn with `textContent`. A reference titled
  `<img onerror=…>` shows up as exactly those characters.
- **The bookmarklet hand-off** is accepted only when the page was opened
  for it (`#capture`), only from the window that opened it, and once per
  load.
- **The key** stays in this browser, goes only to `api.anthropic.com`, and
  is left out of exports. A key in a browser can be read by anything else
  running on the same origin, so use one with a spending limit.
- **No patient details.** Notes are stored unencrypted in the browser, and
  "Rewrite with Claude" sends the page's text off the machine. Capture the
  literature, not the chart.

It is a study aid. It organises what a page said; it does not check that
the page was right.

---

## Files

| File | What it is |
|---|---|
| `js/util.js` | `el()`, `safeUrl()` and other small helpers |
| `js/capture.js` | The bookmarklet, paste handling, `normalize()` |
| `js/analyze.js` | The rules: references, summary, tree, appraisal, reading order, export |
| `js/store.js` | localStorage, export and import |
| `js/brain.js` | The optional Claude call |
| `js/ui.js`, `js/app.js` | The three views, start-up, the receiving end of the bookmarklet |
| `selftest.mjs` | Offline checks on the four modules that need no DOM |

Scripts hang off `window.EV` and the `<script>` order in `index.html`
matters.

**Copy unread for the reading agent** on a note's reading list copies the
unread papers in the shape `agents/data/reading.json` keeps its items, so
they can be pasted into that file and nagged about by the `reading` agent.
