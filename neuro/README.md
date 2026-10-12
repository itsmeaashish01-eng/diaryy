# Neuro Multiverse

High-yield neurology notes and practice questions, one "universe" per area:
localization, stroke, epilepsy, movement disorders, neuromuscular disease,
demyelination, headache and cognition.

Open `neuro/index.html`. As with the rest of this repository, there's no
build step, no server and no dependencies.

## What it does

- **The map**: one card per universe, each showing how many of its
  questions you've mastered.
- **A universe**: its notes, and a button to practise its questions.
- **Mixed quiz**: ten questions drawn from every universe.
- **Search**: finds text across every universe's notes.

After each answer the quiz shows why the right answer is right. Each
question sits in a Leitner box, 0 to 4. A right answer moves it up one box
and a wrong answer sends it back to 0. Every quiz deals the lowest boxes
first, so the questions you miss come back soonest. A question in box 3 or
higher counts as mastered.

## Where things live

| File | What it holds |
|---|---|
| `js/data.js` | All the content: universes, notes, questions |
| `js/app.js` | Rendering, search, the quiz and progress |
| `selftest.mjs` | Offline checks on `data.js`, also run in CI |

Progress is stored in localStorage under `neuroData`, as question ids and
box numbers only. Nothing leaves the browser.

## Adding content

Add a note or question to a universe in `js/data.js`, or add a whole new
universe object with the same shape. Each question needs:

- a unique `id`, which never changes once shipped, because progress is
  stored against it;
- four `options`, with `answer` giving the index of the right one. Putting
  the right answer first is fine, because the options are shuffled when
  they're shown;
- a `why`, saying in a sentence or two why that answer is right.

Then run `node neuro/selftest.mjs`.

## Keep it clinical, not personal

This is general study material. **Don't put patient details in it.** Everything in
this folder is committed to GitHub. Personal notes belong in `agents/private/`, which is
gitignored.

The content is a study aid, not clinical guidance. Thresholds and drug
choices change, so check them against current guidelines.
