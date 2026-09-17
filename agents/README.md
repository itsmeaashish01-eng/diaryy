# Agents

Small programs that watch one thing each, decide whether what they found
is worth interrupting you for, and tell you when it is.

Price Watch already did this for prices. This is the same machinery with
the price-shaped assumptions taken out: an agent is a **source**, a
**schedule**, some **rules**, and a way to **reach you**. Swapping the
source is how you get a different agent — the rest is shared.

```bash
node agents/runner.mjs --list                # what types exist
node agents/runner.mjs --validate            # are my definitions sound?
node agents/runner.mjs --adopt <export>      # feed them the diary's ⤓ file
node agents/runner.mjs --dry-run --force     # run everything, send nothing
node agents/runner.mjs                       # a real pass
node agents/selftest.mjs                     # check the reasoning
```

`--validate` touches nothing — no fetching, no writing, no sending. It
checks every active agent names a type that exists and is configured well
enough to run, and exits non-zero if not. That's what CI runs on each
push, so a typo fails on the pull request rather than at 37 past the hour
in a job nobody is watching.

Open `agents/index.html` to see what they've been doing.

---

## The types

They fall into two families. Some watch the world and tell you when it
moved; the rest watch *you*, and tell you when something you said
mattered has stopped moving. The second family is the one that earns its
keep — nothing else in your week is going to mention that a goal hasn't
been touched since August.

**Watching the world**

| Type | Watches | Tells you when |
|---|---|---|
| `feed` | An RSS or Atom feed | New items appear, optionally only ones matching a pattern |
| `webpage` | Any page | The text changes, or a number on it crosses a line |
| `uptime` | An endpoint | It goes down, comes back, or gets slow |
| `github-release` | A repository | A release or tag is published |
| `price` | One price, from any Price Watch source | A threshold, a fall, a new low |
| `portfolio` | A set of holdings | The total moves, or the allocation drifts from target |

**Watching you**

| Type | Watches | Tells you when |
|---|---|---|
| `diary` | Your diary export | A streak, a silence, a milestone, a growing to-do backlog |
| `organizer` | The task lists in that same export | Something slipped, today is overloaded, or the week's list grew |
| `goals` | Career goals and milestones | A deadline closes in, or a goal goes quiet |
| `study` | A folder of notes | Something's new, due for review, unsourced, or built on an aged guideline |
| `reading` | A reading list | What to read next, and when the list is out-growing you |
| `exercise` | A training log | The week's volume, a streak, rest that's gone on a while |

`price` and `portfolio` don't reimplement anything — they borrow Price
Watch's provider registry, so CoinGecko, Coinbase, Stooq, Frankfurter, a
JSON path, a regex on a page and Amadeus fares are all available here too,
and a fix in one place fixes both.

`portfolio` never adds currencies together. A dollar total and a rupee
total are two totals, reported as two totals — a blended number would be
worse than no number.

---

## Defining one

Agents live in `agents/data/agents.json`. One object each:

```json
{
  "id": "hn-ai",
  "type": "feed",
  "label": "Hacker News — AI stories",
  "active": true,
  "intervalMin": 60,
  "config": { "url": "https://hnrss.org/frontpage", "match": "claude|anthropic" },
  "rules": [{ "when": "new", "level": "notable" }],
  "notify": { "on": "notable", "cooldownMin": 180 }
}
```

`config` is whatever that type needs — each type's file documents its own
keys at the top, and `validate` refuses a misconfigured agent with a
sentence rather than a stack trace.

### Rules

A rule fires at a **level**: `quiet`, `notable`, or `urgent`. The highest
level that fires is the agent's verdict for that run, and `notify.on` is
the level at which you actually get told.

| `when` | Fires when |
|---|---|
| `new` | Something appeared that you haven't been shown before. Add `count` to require several |
| `above` / `below` | The agent's number crossed `value` |
| `changesBy` | It moved `percent` or more since the last check |
| `newLow` / `newHigh` | It's a record, once there are at least three readings to judge against |
| `error` | The source has failed `after` runs in a row — a broken agent is news too |
| `always` | Every run. For when you want a heartbeat |

With no `rules` at all, an agent reports anything new and stays quiet
otherwise, which is usually what you meant.

`notify.cooldownMin` is per level, so a chatty `notable` agent can't bury
the `urgent` one it shares a channel with.

### Nothing is ever reported twice

Each thing an agent finds carries a key — a feed item's guid, a page's
fingerprint, `streak:30`. The runner remembers the keys it has shown you
and filters them out next time. That's what makes an hourly schedule
bearable: running more often costs you nothing extra in noise.

That memory has a size, and it matters. It has to be larger than the most
distinct things a single run can turn up, or a run overflows it, the
earliest keys fall off, and the next run rediscovers them and alerts on
them — every run, forever. The default holds 1000 keys, which is far more
than a feed or a price will ever need. An agent that tracks more raises it:

```json
{ "id": "fellowship", "type": "study", "maxSeen": 8000 }
```

A library scan turns up roughly three keys per note, so size it from the
number of notes, not the number of alerts. If a run does overflow, the
runner says so in the log and on the run page rather than letting the
agent quietly start repeating itself.

---

## The ones that watch you

These read a file of yours. The files live in `agents/data/` (except the
study library — see below), they're plain JSON, and each type's source file
documents its own shape at the top.

### `organizer` — `agents/data/organizer.json`

The same export the diary agent reads, with the prose ignored and only
the task lists looked at. The two are worth having together because they
answer different questions: `diary` asks whether you're writing,
`organizer` asks whether any of it is getting done.

A task in the organizer has no due date — it belongs to the day you wrote
it on, and the day you planned something for is the best statement you
made about when you meant to do it. So a task still open on a day that has
gone by is a task that slipped, and how many of those there are, and how
long they've sat, is the only honest measure of whether the list works.

It reports a slipped task once per age rung — first at `ageDays`, then 14,
30, 60, 90, 180, 365. A task you're ignoring on purpose goes quiet within a
fortnight; one you've genuinely lost comes back at a month and again at a
quarter. `maxMention` (3) caps how much of the backlog any single run reads
out, oldest first, so a long list arrives as a nudge and not an inventory.

Three other things it says, each at most once a day:

- **A day with nothing on it while things are slipping.** That's the
  easiest moment to pull one forward, so it names the oldest.
- **A day carrying more than `overload` (6).** Some of that is really
  tomorrow's.
- **A cleared board.** Everything done and nothing open anywhere. A tool
  that only ever reports failure is one you stop opening.

And once a week, closed against added, with the only verdict that matters:
whether the list shrank.

The metric is the number of slipped tasks, so `above` puts a threshold on
your backlog:

```json
{ "when": "above", "value": 10, "level": "urgent" }
```

**It says your task text out loud**, which the diary agent deliberately
never does. "Something from three weeks ago is still open" isn't a
reminder; "Call the letting agent" is. That text travels to whatever
channel you configured, so `includeText: false` turns it off and leaves
you the counts and the dates.

### `goals` — `agents/data/goals.json`

Goals, milestones with dates, and a `progress` list you append a line to
when something happens. It watches deadlines at thresholds — 90 days, 30,
14, 7, 3, 1 — so each one is mentioned once rather than every hour.

The part worth having is the other half: a goal with no progress note for
`staleDays` gets flagged. Not as a scolding — as a question. Either it's
still a goal and it needs an hour this week, or it isn't and it should come
off the list. Both are fine answers; drifting without deciding isn't.

### `reading` — `agents/data/reading.json`

Once a week it tells you what to read next. The recommendation is
arithmetic, not a model: priority, how long it has been waiting, whether it
fits the sitting you said you get, and a nudge toward things you already
started. All four terms are in `score()` in `types/reading.mjs` — if the
order looks wrong, you can see which one did it and change the weight.

It also tracks intake against completion, and says when the list is growing
faster than you're reading it. And it will suggest dropping something that
has sat unread for months, because a reading list that only grows stops
being a list and becomes a reproach.

### `exercise` — `agents/data/exercise.json`

Sessions with a date, a kind, and minutes. It reports on the **week**, not
the day, because a day means nothing and a week is the smallest unit where
"am I actually doing this?" has an answer. Rest isn't failure, so a gap is
only mentioned once it's longer than the `restDayMax` you set.

### `portfolio` — `agents/data/portfolio.json`

Holdings with a quantity, an average cost and an optional `targetPercent`.
Each is priced through Price Watch's sources; you get the total, the profit
or loss, any holding that moved more than `movePercent` since the last
check, and any position that has drifted `driftPercent` from its target.

One dead source doesn't cost you the valuation — it prices what it can and
names what it couldn't.

---

## `study` — the fellowship library

Point it at a folder of notes and it does four things a folder doesn't:

| | |
|---|---|
| **Remembers what's new** | A note you added is acknowledged once, not every run |
| **Schedules review** | Spaced repetition off each note's own `reviewed` date |
| **Ages the sources** | A guideline has a shelf life; this says when yours is old enough to re-check |
| **Insists on provenance** | A note with no source gets flagged, every run, until it has one |

### The review ladder

Spaced repetition needs to know how many passes you've made, and a note
only carries one date. So the agent counts: every time the `reviewed` date
changes from what it last saw, that note moves up a rung — 1 day, then 7,
30, 90, 180. Read something today and it comes back tomorrow; read it again
and it comes back next week. A note you know well stops asking for
attention, which is the entire point.

Ignore one and it asks again each time it passes another interval, rather
than going quiet forever.

### Why it nags about sources

`source` and `sourceDate` in a note's header aren't bookkeeping. A note you
can't trace back is a note you can't check, and the ones you'd actually act
on — tagged `algorithm`, `protocol`, `dosing` — are exactly the ones where
that matters. So the agent flags them, and it keeps flagging them.

`sourceDate` drives the other half: when the guideline behind a note is
older than `sourceMaxAgeDays`, you get told. Not that the note is wrong —
that the thing it was built on has had time to move.

### Revision cards

With `ANTHROPIC_API_KEY` set and `"synthesize": true`, it writes a
condensed revision card beside each new or changed note. Three things are
wired into how that works, because a summariser loose in clinical material
is only useful if it's bounded:

- **It never touches your note.** Cards go to a separate `.card.md` file.
  Delete every card and you've lost nothing.
- **It's told to add nothing.** Numbers, doses and cut-offs are carried
  across verbatim; anything ambiguous in the note goes under a **Gaps**
  heading rather than being resolved. That flag is the most useful thing on
  the card.
- **Every card carries its provenance** — the source and date from your own
  header, the note it came from, and a line saying it's derived. When a card
  and a guideline disagree, it should be obvious which one wins.

A card is a revision aid built from your note. It is not a source, and the
agent says so on every one it writes.

### Privacy

The library defaults to `agents/private/`, which `.gitignore` excludes.
That's deliberate: notes from a fellowship can contain things that have no
business in a repository, least of all one whose CI job pushes commits back
to itself.

The consequence is that `study` can't run on GitHub's machines — there'd be
nothing there to read. Run it locally:

```bash
node agents/runner.mjs --only fellowship --force
```

Making it run unattended means committing the folder somewhere, and that's
a decision to make deliberately rather than by leaving a default alone. A
private repository is not the same thing as a safe place for patient
information.

---

## Two ways to run it

**On your machine.** `node agents/runner.mjs --loop` stays running and
wakes every minute to see what's due. Good for a laptop or a Pi that's on
anyway.

**Unattended, every hour.** `.github/workflows/agents.yml` runs one pass
on GitHub's machines and commits what it saw back to `state.json`, so
nothing of yours has to be on. Before it does anything useful:

1. Merge the workflow to the **default branch** — GitHub only runs
   scheduled workflows from there.
2. Add a repository secret `NTFY_TOPIC` (Settings → Secrets and variables
   → Actions) and subscribe to that topic in the [ntfy](https://ntfy.sh)
   app on your phone. Free, no account.
3. Edit `agents/data/agents.json`.

The run page gets a table of what each agent found, so "is this working?"
is a glance rather than a scroll.

### Getting told

| Variable | What it does |
|---|---|
| `NTFY_TOPIC` | Push to your phone via ntfy |
| `NTFY_SERVER` | A self-hosted ntfy, default `https://ntfy.sh` |
| `WEBHOOK_URL` | Discord, Slack, or anything taking JSON |
| `WEBHOOK_STYLE` | `discord` (default), `slack`, or `plain` |

With neither set the agents still run and record — and say loudly, every
run, that nothing can reach you. A half-configured setup that looks like a
working one is worse than one that's obviously off.

**A finding nothing could deliver is held, not consumed.** Marking a key as
seen is what retires it for good, so that only happens once a channel has
actually taken it. Runs before you set up ntfy don't quietly eat your news:
whatever they found waits, and arrives on the first run that can reach you.
The run page says how many are waiting.

Findings below your `notify.on` threshold, or inside a cooldown, are a
different case — those are you saying "don't tell me about this", so they
are recorded and won't come back.

---

## The Claude brain (optional, off by default)

Everything above is deterministic and costs nothing. The rules decide, and
they phrase their own alerts.

If you set an `ANTHROPIC_API_KEY` secret **and** give an agent
`"brain": "claude"`, Claude writes the alert text instead — the same facts,
in better words. That is all it does:

- **The rules still decide the level.** The model can't escalate an agent
  and it can't silence one. What you get told about is your configuration,
  not a judgement call you didn't make.
- **A failure falls back to the rules.** An alert that never arrives
  because an API call timed out is worse than a plainly worded one.
- **Nothing is sent anywhere without the key.** No key, no request.

Set `AGENT_MODEL` to use a model other than the default.

It is raw HTTP rather than the Anthropic SDK on purpose: this repo has no
`package.json` and the workflow runs bare `node`, so a dependency would
mean an install step in CI for a path that is off unless you turn it on.

---

## Safety

**Agents are data, and data doesn't get to run programs.** Price Watch's
`command` source — which executes a local program — is deliberately
unreachable from an agent definition.

**Nor does it get to aim requests at your network.** Every fetch resolves
its host first and refuses loopback, link-local and private ranges, and
re-checks on each redirect. A URL in `agents.json` can't be used to read
`169.254.169.254` or something on your LAN.

**The dashboard is read-only** and builds every element as a node rather
than as HTML, so a feed item's title is text, not markup it can run.

---

## Adding a type

One file in `types/`, one line in `core/registry.mjs`. Nothing else in the
runner, the workflow or the dashboard needs to know:

```js
export default {
  id: "weather",
  label: "Weather",
  summary: "Rain is coming",

  validate(agent) { return agent.config.place ? [] : ["needs config.place"]; },

  async run(agent, ctx) {
    const data = await getJSON(`https://…/${agent.config.place}`);
    return {
      observations: [],          // things with an identity, deduped by `key`
      metric: data.rainChance,   // one number; the threshold rules read this
      memo: {},                  // anything to remember for next run
      facts: { place: agent.config.place },
      line: `${data.rainChance}% chance of rain`,
    };
  },

  describe(agent, fresh) { return fresh.map((o) => o.title).join("\n"); },
};
```

If your type reads a file the user exports from somewhere, name that file
in an `adopts` field — `adopts: "diary export"` — and `--adopt` will start
filling it in, with nothing added to the runner.

`ctx.state` is what this agent remembered last time. Return `level` and
`why` from `run` if the type knows something the rules cannot — `uptime`
does this, because a site that just went down is urgent whatever a
threshold says.

---

## Wiring in the diary

The diary keeps its entries in your browser's localStorage, which nothing
on a CI runner can read. So: press **⤓**, then hand the file it gives you
to the runner.

```bash
node agents/runner.mjs --adopt ~/Downloads/my-diary-2026-09-17.json
```

That copies it to wherever the agents that read an export are looking, and
tells you what each one will now see and what it replaced. `--dry-run`
alongside it shows you that without writing anything. It refuses a file
that isn't a diary export rather than overwriting an agent's data with
whatever else was in your downloads folder.

Doing it by hand is a rename and a move, which is a chore, and a chore in
front of an agent is why `diary-nudge` shipped paused and stayed paused.

Two agents read that one file:

| Agent | Reads | Default path |
|---|---|---|
| `diary-nudge` | The writing — streaks, silences, milestones | `agents/data/diary.json` |
| `organizer` | The task lists — what slipped, what's piling up | `agents/data/organizer.json` |

They're separate paths on purpose, so you can commit one and not the
other. Point both at the same file if you'd rather keep one export:

```json
{ "id": "organizer", "config": { "file": "agents/data/diary.json" } }
```

`agents/data/organizer.json` ships as an empty placeholder, so the agent
validates and runs before you've exported anything — it says "no tasks in
the export yet" once and then waits. It deliberately doesn't ship with
invented tasks in it: an agent whose first act is to nudge you about
somebody's made-up errand is one you learn to ignore.

### Where to keep the export

**Committed, under `agents/data/`.** The hourly GitHub Actions run can see
it, so the agents work with nothing of yours switched on. The cost is that
your entries and task text are in the repository.

**Local only, under `agents/private/`.** That folder is gitignored, same as
the study library. Nothing of yours enters the repo, and the trade is that
GitHub's runner has nothing to read — so run it yourself:

```bash
node agents/runner.mjs --only organizer --force
```

Either way it's one line of config:

```json
{ "id": "organizer", "config": { "file": "agents/private/organizer.json" } }
```

`diary-nudge` reports counts and dates only — it never reads your entries
out loud. `organizer` does quote your task text, because a reminder that
won't say what it's reminding you of isn't one; `"includeText": false`
takes that back out if the alert is going somewhere you'd rather it
didn't.

### Keeping it current

An export is a snapshot. The agents are only as current as the last one
you saved, and a stale file makes for confident, wrong nudges — a task you
finished last week still counted as slipped. Re-export when you've been
using the diary properly for a few days, or when an alert tells you
something you know isn't true any more.
