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

## Install it

Settings offers it, worded for whichever browser you are in. There is a real
install button where the browser provides one; on iOS there is no such event,
so it says where Safari keeps Add to Home Screen — and if you are in Chrome or
Firefox on iOS it says to open Safari, because that menu item does not exist in
those browsers and sending you looking for it would waste your time.

Installed or not, it opens offline. The service worker caches the app on first
visit; there is nothing to keep fresh from a network, since the record lives on
the device and never leaves it. Bump `VERSION` in `sw.js` to roll out a change.

## The server, and Slack (both optional)

The app works with no server at all. Add one and two things become possible:
the business stops living in a single browser, and the employee can answer in
the channel where the work is actually discussed.

```sh
EMPLOYEE_TOKEN=pick-something-long \
SLACK_SIGNING_SECRET=from-your-slack-app \
node employee/server/employee-server.mjs
```

Then paste the address and token into Settings → Sync & Slack.

It runs *the same modules the page runs* — `server/modules.mjs` loads
`employee/js/*.js` in a sandbox — so the morning read Slack posts is the
morning read the page shows, character for character. There is no second
implementation of any of the nine jobs to drift.

| Endpoint | What it does |
|---|---|
| `GET /health` | open, for uptime checks |
| `GET /api/ping` | behind the token — what Settings → Test calls |
| `GET /api/business` | the record, with its version in the `ETag` |
| `PUT /api/business` | writes it; send `If-Match: <version>` |
| `GET /api/brief` | the morning read, `?format=text` for a plain one |
| `POST /slack/commands` | slash commands, signature-checked |

**Slack.** Point a slash command at `/slack/commands`: `/employee` gives the
morning read, and `money`, `chase`, `quiet` and `pipeline` give the rest. Every
request is checked against the signing secret, with a five-minute window so a
captured request can't be replayed. To have it speak first, set
`SLACK_WEBHOOK_URL` and run `node employee/server/employee-server.mjs --post`
on a schedule — it stays silent on a day with nothing urgent, because a daily
"nothing to report" trains everyone to ignore the channel. `--post --force`
overrides that.

**Sync is manual and deliberately dumb.** Every write carries the version it
was based on, so two devices that both changed things get told they disagree
instead of one quietly winning. You pick which copy is real, with an export in
between if you want both.

Two things the server does *not* do: it never changes the record (Slack reads,
it does not write), and it refuses to listen on anything but localhost unless
`EMPLOYEE_TOKEN` is set — the file holds a whole business, including what every
client owes.

## Data

Everything is in this browser's `localStorage` under `aiEmployeeData`. Nothing
is sent anywhere — there is no server and no account. Export and import JSON
from the top bar, and load or erase the demo business from Settings.

That also means it is per-device unless you run the server above; the export
file is the other way to move a business to another machine.

The server's address and token are kept under a *separate* key, never in the
business record — otherwise the token would ride along in every export and get
uploaded to the very server it unlocks.

A first open seeds a small studio mid-week with the usual mess already in it,
because nine empty screens explain nothing.

## Tests

```sh
node employee/selftest.mjs
```

115 checks, no network, no browser: the date arithmetic, the money, every rule
above, the install advice against real user-agent strings, Slack's signature
check (wrong secret, replayed timestamp, body altered after signing), the
version conflict, and a check that every script the page loads is one the
service worker caches — a file missing from that list is a blank screen on a
train. They run in CI on each push alongside the other apps' suites.

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
  js/install.js     where this browser keeps Add to Home Screen
  js/ui.js          every view, rendered from the store
  js/app.js         routing, actions, forms
  js/sync.js        talking to the server, when there is one
  sw.js             the offline shell
  server/modules.mjs    loads the app's own modules in node
  server/store-file.mjs the business on disk, with versions
  server/slack.mjs      signature checks, commands, Block Kit
  server/employee-server.mjs  the HTTP server
  manifest.webmanifest
  icons/icon.svg    the ◒ mark; the PNGs beside it are rendered from it
  selftest.mjs      the suite
```

`ui.js` and `app.js` make no decisions — they render what the modules above
work out, which is why the suite can cover the thinking without a DOM.
