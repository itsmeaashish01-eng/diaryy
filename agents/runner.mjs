#!/usr/bin/env node
/* ================================================
   AGENTS — runner.mjs

   One pass over your agents: work out what's due, run it, decide whether
   any of it is worth interrupting you for, send what is, remember the
   rest, and exit.

   Two ways to drive it:

     one pass, then exit  — for cron or GitHub Actions
       node agents/runner.mjs

     stay running         — for a laptop or a Pi that's on anyway
       node agents/runner.mjs --loop

   Options:
     --file <path>    agent definitions  (default agents/data/agents.json)
     --state <path>   where to remember  (default agents/data/state.json)
     --only <id>      run just this agent, whatever its interval
     --force          ignore every interval and run everything
     --dry-run        run and decide, but send nothing and save nothing
     --loop           keep running, waking every minute
     --summary <p>    append a markdown report ($GITHUB_STEP_SUMMARY)
     --list           print the agent types and exit
     --validate       check every active agent's definition and exit
                      non-zero if any is broken. Touches no network

   Environment:
     NTFY_TOPIC       ntfy topic to push to
     NTFY_SERVER      default https://ntfy.sh
     WEBHOOK_URL      Discord / Slack / custom webhook
     WEBHOOK_STYLE    discord | slack | plain   (default discord)
     PROXY_BASE       price-proxy address, for price agents that need one
     GITHUB_TOKEN     raises the GitHub API rate limit (optional)
     ANTHROPIC_API_KEY  turns on the Claude brain for agents that asked
                      for it with "brain": "claude". Everything works
                      without it; see agents/README.md.
   ================================================ */

import { typeFor, typeList, TYPES } from "./core/registry.mjs";
import { loadAgents, loadState, agentState, remember, saveState } from "./core/state.mjs";
import { decide, narrate, atLeast } from "./core/brain.mjs";
import {
  deliver, canNotify, anySent, describeDelivery,
  configure, allowCommittedTopic, usingCommittedTopic,
} from "./core/notify.mjs";
import { repoVisibility, personalAgents } from "./core/repo.mjs";
import { writeSummary } from "./core/report.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

if (flag("--list")) {
  console.log("Agent types:\n" + typeList());
  process.exit(0);
}

const file = opt("--file", "agents/data/agents.json");
const statePath = opt("--state", "agents/data/state.json");
const onlyId = opt("--only", "");
const summaryPath = opt("--summary", "");
const dryRun = flag("--dry-run");
const loop = flag("--loop");
let force = flag("--force");

const LOOP_TICK_MS = 60000;
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (m) => console.log(loop ? `[${stamp()}] ${m}` : m);

/* A definitions check with no side effects at all: no fetching, no
   writing, no sending. This is what CI runs, so a typo'd type or a
   config key left half-renamed fails on the pull request rather than at
   37 past the hour in a job nobody is watching.

   Paused agents are skipped, the same as in a real pass — a local-only
   agent whose folder doesn't exist on a runner isn't a broken one. */
if (flag("--validate")) {
  const defs = loadAgents(file);
  const problems = [];
  for (const agent of defs.agents) {
    const label = agent.label || agent.id;
    if (agent.active === false) {
      console.log(`– ${label} — paused, not checked`);
      continue;
    }
    const type = typeFor(agent);
    if (!type) {
      problems.push(`${label}: unknown type "${agent.type}". Known: ${Object.keys(TYPES).join(", ")}`);
      continue;
    }
    const errs = type.validate(agent);
    if (errs.length) problems.push(`${label}: ${errs.join("; ")}`);
    else console.log(`✓ ${label} (${agent.type})`);
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
    for (const p of problems) console.error(`  ✕ ${p}`);
    process.exit(1);
  }
  console.log(`\nAll ${defs.agents.filter((a) => a.active !== false).length} active agents check out.`);
  process.exit(0);
}

/* Running agents with nowhere to send their findings is a half-configured
   setup that looks like a working one. Say so, every run — but only once
   the settings have been read, since the topic may be committed there. */
const warnings = [];

let settingsReady = false;
async function applySettings(defs) {
  if (settingsReady) return;
  settingsReady = true;

  configure((defs.settings && defs.settings.notify) || {});
  const vis = await repoVisibility();

  /* A committed topic is a password. It is safe in a private repository
     and published in a public one, so anything short of a confirmed
     private repo refuses it: a missed alert is recoverable, a leaked
     topic is not. */
  if (usingCommittedTopic()) {
    const safe = !vis.onGitHub || (vis.known && !vis.isPublic);
    allowCommittedTopic(safe);
    if (!safe) {
      const w =
        `The ntfy topic in agents.json is being ignored: ${vis.why}. ` +
        "Move it to an NTFY_TOPIC secret, or make the repository private.";
      warnings.push(w);
      log(`⚠ ${w}`);
    }
  }

  /* The personal agents read a file about you and write what they found
     back into the repository — which a workflow then commits, every hour,
     for as long as this runs. In a public repo that is your goals, your
     reading, your training and your positions, published on a schedule
     and kept in the history afterwards.

     Nothing here stops it: it is the user's repository and their data.
     But it must never be the thing they find out afterwards. */
  /* A check that couldn't be answered protects nothing, and said nothing
     about it — which is how a guard quietly stops guarding. If the answer
     is unavailable, say so and say why, because the alternative is a run
     that looks identical to a safe one. */
  if (vis.onGitHub && !vis.known) {
    const w =
      `Could not determine whether this repository is public: ${vis.why}. ` +
      "The public-repository check is not protecting anything this run.";
    warnings.push(w);
    log(`⚠ ${w}`);
  }

  if (vis.onGitHub && vis.known && vis.isPublic) {
    const personal = personalAgents(defs.agents);
    if (personal.length) {
      const names = personal.map((a) => a.label || a.id).join(", ");
      const w =
        `This repository is PUBLIC, and ${personal.length === 1 ? "this agent writes" : "these agents write"} ` +
        `what ${personal.length === 1 ? "it finds" : "they find"} into state.json, which the workflow commits every run: ${names}. ` +
        "Anyone can read it, and the history keeps it. Make the repository private, " +
        "or pause these and run them on your own machine.";
      warnings.push(w);
      log(`⚠ ${w}`);
    }
  }

  if (!canNotify() && !dryRun) {
    const w =
      "No alert channel is configured — agents will run and record, but nothing will reach you. " +
      "Set NTFY_TOPIC (or WEBHOOK_URL). On GitHub: Settings → Secrets and variables → Actions.";
    warnings.push(w);
    log(`⚠ ${w}`);
  }
}

async function pass() {
  const defs = loadAgents(file);
  await applySettings(defs);
  const state = loadState(statePath);
  const now = Date.now();
  const defaultInterval = Number(defs.settings && defs.settings.defaultIntervalMin) || 60;

  let ran = 0, skipped = 0, failed = 0, notified = 0, held = 0;
  let soonest = null, soonestLabel = "";
  const rows = [];

  for (const agent of defs.agents) {
    const label = agent.label || agent.id;
    const quiet = (why) => {
      skipped++;
      // In loop mode this would repeat every minute forever; once per pass only.
      if (!loop) log(`– ${label} — ${why}`);
    };

    if (onlyId && agent.id !== onlyId) { skipped++; continue; }
    if (agent.active === false) { quiet("paused"); continue; }

    const type = typeFor(agent);
    if (!type) {
      failed++;
      log(`✕ ${label} — unknown type "${agent.type}". Known: ${Object.keys(TYPES).join(", ")}`);
      rows.push({ status: "failed", label, type: agent.type, line: `unknown type "${agent.type}"` });
      continue;
    }

    const problems = type.validate(agent);
    if (problems.length) {
      failed++;
      log(`✕ ${label} — ${problems.join("; ")}`);
      rows.push({ status: "failed", label, type: agent.type, line: problems.join("; ") });
      continue;
    }

    const s = agentState(state, agent.id);
    const every = Math.max(1, Number(agent.intervalMin) || defaultInterval);
    const dueAt = s.lastRun + every * 60000;
    if (!force && !onlyId && now < dueAt) {
      skipped++;
      if (soonest === null || dueAt < soonest) { soonest = dueAt; soonestLabel = label; }
      if (!loop) log(`– ${label} — not due for ${Math.round((dueAt - now) / 60000)} min`);
      continue;
    }

    // ---- run it ----
    let run;
    try {
      run = await type.run(agent, { state: s, now, log });
    } catch (e) {
      failed++;
      s.lastRun = Date.now();
      s.errorCount = (s.errorCount || 0) + 1;
      s.lastError = { message: String(e.message || e), t: Date.now() };
      log(`✕ ${label} — ${e.message || e}`);
      rows.push({ status: "failed", label, type: agent.type, line: String(e.message || e).slice(0, 120) });

      /* A source that has been broken for three runs is itself news —
         otherwise an agent can quietly stop working and look like an
         agent with nothing to report. */
      const verdict = decide(agent, { fresh: [], metric: null }, s);
      if (atLeast(verdict.level, "urgent") && shouldSend(agent, s, verdict.level, now) && !dryRun) {
        const results = await deliver(`${label} is failing`, s.lastError.message, "urgent");
        for (const line of describeDelivery(results)) log(`     ${line}`);
        if (anySent(results)) {
          s.notifiedAt[verdict.level] = Date.now();
          notified++;
        }
      }
      continue;
    }

    ran++;
    s.lastRun = Date.now();
    s.lastOk = Date.now();
    s.errorCount = 0;
    s.lastError = null;
    s.lastLine = run.line || "";
    if (run.memo) s.memo = { ...s.memo, ...run.memo };

    // ---- what of this is actually new? ----
    const seen = new Set(s.seen);
    const observations = Array.isArray(run.observations) ? run.observations : [];
    const fresh = observations.filter((o) => o && o.key && !seen.has(o.key));
    run.fresh = fresh;

    const verdict = decide(agent, run, s);
    log(`✓ ${label} — ${run.line || "ok"}${fresh.length ? ` · ${fresh.length} new` : ""}`);

    const events = fresh.map((o) => ({
      t: o.at || Date.now(),
      level: verdict.level,
      title: o.title,
      detail: o.detail || "",
      url: o.url || "",
    }));

    /* Metrics and the event log are a record of what happened and go in
       regardless. The `seen` keys are different: recording one is what
       stops it being reported again, so it is only safe once the finding
       has actually been dealt with. Held back until we know. */
    const cap = Number(agent.maxSeen) || undefined;
    const { dropped } = remember(s, {
      seen: [],
      metric: run.metric == null ? null : { t: Date.now(), v: Number(run.metric) },
      events,
    }, cap);
    const keys = fresh.map((o) => o.key);

    /* Overflowing the dedupe memory is the one failure that looks like
       the agent working: it re-finds what it already told you and tells
       you again, every run, forever. Never let that be silent. */
    if (dropped) {
      log(`  ⚠ ${label} tracks more than it can remember — ${dropped} key${dropped === 1 ? "" : "s"} dropped.`);
      log(`     Raise "maxSeen" on this agent, or it will report those again next run.`);
    }

    // ---- is it worth interrupting you for? ----
    const floor = (agent.notify && agent.notify.on) || "notable";

    /* Below the threshold you set, or inside a cooldown you set: both are
       you saying "don't tell me about this". That counts as dealt with —
       the finding is recorded and won't come back. */
    if (!atLeast(verdict.level, floor)) {
      remember(s, { seen: keys }, cap);
      rows.push({ status: "quiet", label, type: agent.type, line: run.line || "no change" });
      continue;
    }
    if (!shouldSend(agent, s, verdict.level, now)) {
      remember(s, { seen: keys }, cap);
      log(`  (${verdict.level}, but within its cooldown — not sending)`);
      rows.push({ status: "quiet", label, type: agent.type, line: `${run.line} (cooling down)` });
      continue;
    }

    const headline = await narrate(agent, run, verdict, fresh, log);
    const body = [headline, fresh.length ? type.describe(agent, fresh, run) : ""]
      .filter(Boolean)
      .join("\n\n");

    log(`  ${verdict.level === "urgent" ? "🚨" : "🔔"} ${headline}`);
    if (dryRun) {
      log("     (dry run — not sent)");
      notified++;
      rows.push({ status: verdict.level, label, type: agent.type, line: headline });
      continue;
    }

    const results = await deliver(`${label}`, body, verdict.level);
    for (const line of describeDelivery(results)) log(`     ${line}`);

    if (anySent(results)) {
      remember(s, { seen: keys }, cap);
      s.notifiedAt[verdict.level] = Date.now();
      notified++;
      rows.push({ status: verdict.level, label, type: agent.type, line: headline });
    } else {
      /* Nothing took it, so you have not been told — and marking it seen
         here is how a finding disappears for good. Leave the keys out and
         it waits for a channel that works. This is the whole reason a run
         with no alert channel doesn't quietly consume your news. */
      held += keys.length;
      log(`     (nothing took it — holding ${keys.length} finding${keys.length === 1 ? "" : "s"} for next time)`);
      rows.push({ status: "failed", label, type: agent.type, line: `${headline} — undelivered` });
    }
  }

  const totals = { ran, skipped, failed, notified, held };
  if (dryRun) {
    log(`Dry run — nothing written or sent. ran ${ran}, skipped ${skipped}, failed ${failed}, would notify ${notified}`);
  } else if (ran || failed) {
    saveState(statePath, state, { t: Date.now(), ...totals });
    log(`ran ${ran}, skipped ${skipped}, failed ${failed}, notified ${notified} — ${statePath} updated`);
    if (held) {
      log(`${held} finding${held === 1 ? " is" : "s are"} being held rather than discarded — nothing could deliver ${held === 1 ? "it" : "them"}.`);
      log("They will be reported on the first run that has a working alert channel.");
    }
  } else if (!loop) {
    log(`Nothing was due. skipped ${skipped}`);
  }
  if (summaryPath) writeSummary(summaryPath, rows, totals, warnings);
  return { ...totals, soonest, soonestLabel };
}

/* Cooldowns are per level, so a noisy "notable" agent can't bury the
   urgent one it shares a channel with. */
function shouldSend(agent, s, level, now) {
  const mins = Number(agent.notify && agent.notify.cooldownMin);
  const cooldown = (Number.isFinite(mins) ? mins : 120) * 60000;
  if (cooldown <= 0) return true;
  const last = (s.notifiedAt && s.notifiedAt[level]) || 0;
  return now - last >= cooldown;
}

// ---- go --------------------------------------------------------------
if (loop) {
  log(`Watching ${file}. Running each agent on its own interval; Ctrl-C to stop.`);
  process.on("SIGINT", () => { log("Stopping."); process.exit(0); });

  /* A process that prints nothing for an hour looks broken. When a pass
     finds nothing due, say so and say when the next one lands — throttled,
     so an idle night isn't a wall of text. */
  const QUIET_LOG_MS = 15 * 60 * 1000;
  let lastQuietLog = 0;

  for (;;) {
    try {
      const r = await pass();
      if (!r.ran && !r.failed) {
        if (Date.now() - lastQuietLog > QUIET_LOG_MS || lastQuietLog === 0) {
          lastQuietLog = Date.now();
          log(
            r.soonest
              ? `nothing due — next is ${r.soonestLabel} in ${Math.max(1, Math.round((r.soonest - Date.now()) / 60000))} min`
              : "nothing to run — every agent is paused"
          );
        }
      } else {
        lastQuietLog = 0;
      }
    } catch (e) {
      log(`pass failed: ${e.message || e}`);
    }
    force = false;
    await new Promise((r) => setTimeout(r, LOOP_TICK_MS));
  }
} else {
  await pass();
  /* A broken source is worth surfacing in the log, but it must not fail
     the run: one dead endpoint shouldn't stop the others next hour. */
  process.exit(0);
}
