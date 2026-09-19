# The AI Employee

The admin around the work, done.

Agencies rarely lose accounts over the quality of the work. They lose them to
everything around it: a promise made on a call and never written down, a
revision round nobody counted, an invoice that went out three weeks late, a
proposal that died because it never got a third touch.

This is that job, split into nine, in one screen each.

Open `employee/index.html`, or the `◒` button in the diary's top bar.

## The nine jobs

| # | Job | What it actually does |
|---|-----|----------------------|
| 1 | **Client file** | Their rules, rate, revision limit and payment terms. Every other job reads from here. |
| 2 | **Morning read** | Only what needs a decision or has a deadline, assembled from the other eight. |
| 3 | **QA pass** | A checklist built from *this* client's rules and the promises still open to them. |
| 4 | **Revision log** | Which round a change is, which rounds were sold, and what the rest are worth. |
| 5 | **Client updates** | One summary, drafted from what happened — including the parts nobody enjoys writing. |
| 6 | **Scheduling** | Meetings, deadlines, follow-ups. |
| 7 | **Invoicing** | Drafts from the fee and the unbilled rounds; chases on a cadence, not a whim. |
| 8 | **Team** | Who has what, and what is late with someone else. |
| 9 | **Growth** | Which conversation has gone quiet, and which one is short a third touch. |

## The rules it works to

The point of the app is the handful of judgements it makes on its own. They
live in the modules, not the screens, and each is covered by the test suite:

- **A revision round past the included ones is billable** — unless it is logged
  as goodwill, which is a decision to absorb it rather than an oversight. Both
  are recorded, so the giveaway is visible.
- **A QA pass goes stale when a revision lands after it.** It was a pass on work
  that has since changed, so it counts as no pass at all.
- **An invoice is overdue when the calendar says so**, whatever the status field
  says — and it is chased once, then not again until the reminder gap is up.
- **A proposal with two touches and nothing for a week is stalled.** The third
  touch asks for a decision either way, which is what unsticks it.
- **A client with live work and no word in a week is owed an update.**

Settings change the numbers (the gap, the cadence, how many touches count);
they don't change the rules.

## Data

Everything is in this browser's `localStorage` under `aiEmployeeData`. Nothing
is sent anywhere — there is no server and no account. Export and import JSON
from the top bar, and load or erase the demo business from Settings.

A first open seeds a small studio mid-week with the usual mess already in it,
because nine empty screens explain nothing.

## Tests

```sh
node employee/selftest.mjs
```

67 checks, no network, no browser: the date arithmetic, the money, and every
rule above. They run in CI on each push alongside the other apps' suites.

## Files

```
employee/
  index.html        shell and nav
  style.css         the diary's palette, same tokens
  js/util.js        dates, money, text — all pure
  js/store.js       schema, persistence, CRUD, the demo business
  js/margin.js      job 4: rounds, overage, effective rate
  js/qa.js          job 3: the checklist, staleness, the ship gate
  js/money.js       job 7: invoice state, totals, aging, drafts, chases
  js/growth.js      job 9: touches, stalled deals, weighted pipeline
  js/brief.js       job 2 and job 5: the morning read, the client update
  js/ui.js          every view, rendered from the store
  js/app.js         routing, actions, forms
  selftest.mjs      the suite
```

`ui.js` and `app.js` make no decisions — they render what the modules above
work out, which is why the suite can cover the thinking without a DOM.
