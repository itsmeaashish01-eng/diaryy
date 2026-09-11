# Agents

Small programs that watch one thing each, decide whether what they found
is worth interrupting you for, and tell you when it is.

Price Watch already did this for prices. This is the same machinery with
the price-shaped assumptions taken out: an agent is a **source**, a
**schedule**, some **rules**, and a way to **reach you**. Swapping the
source is how you get a different agent — the rest is shared.

```bash
node agents/runner.mjs --list                # what types exist
node agents/runner.mjs --dry-run --force     # run everything, send nothing
node agents/runner.mjs                       # a real pass
node agents/selftest.mjs                     # check the reasoning
```

Open `agents/index.html` to see what they've been doing.

---

## The types

| Type | Watches | Tells you when |
|---|---|---|
| `feed` | An RSS or Atom feed | New items appear, optionally only ones matching a pattern |
| `webpage` | Any page | The text changes, or a number on it crosses a line |
| `uptime` | An endpoint | It goes down, comes back, or gets slow |
| `github-release` | A repository | A release or tag is published |
| `price` | Anything Price Watch can price | A threshold, a fall, a new low |
| `diary` | Your diary export | A streak, a silence, a milestone, a growing to-do backlog |

`price` doesn't reimplement anything — it borrows Price Watch's provider
registry, so CoinGecko, Coinbase, Stooq, Frankfurter, a JSON path, a regex
on a page and Amadeus fares are all available here too, and a fix in one
place fixes both.

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

`ctx.state` is what this agent remembered last time. Return `level` and
`why` from `run` if the type knows something the rules cannot — `uptime`
does this, because a site that just went down is urgent whatever a
threshold says.

---

## Wiring in the diary

The diary keeps its entries in your browser's localStorage, which nothing
on a CI runner can read. Export it with the **⤓** button, save the file as
`agents/data/diary.json`, commit it, and set the `diary-nudge` agent to
`"active": true`.

It reports counts and dates — streaks, silences, milestones, how many
tasks are still open. It doesn't read your entries out loud and it doesn't
send them anywhere. If you'd rather that file never left your machine, run
the agent locally with `--only diary-nudge` and leave it paused in the
committed config.
