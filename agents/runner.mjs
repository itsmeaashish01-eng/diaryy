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
     --adopt <file>   copy a diary export to wherever the agents that
                      read one are looking, and exit. Add --dry-run to
                      see what it would overwrite first

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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { typeFor, typeList, TYPES } from "./core/registry.mjs";
import { loadAgents, loadState, agentState, remember, saveState } from "./core/state.mjs";
import { decide, narrate, atLeast } from "./core/brain.mjs";
import { deliver, canNotify, anySent, describeDelivery } from "./core/notify.mjs";
import { writeSummary } from "./core/report.mjs";
import { looksLikeExport, adoptTargets, byPath } from "./core/adopt.mjs";
import { plural } from "./core/local.mjs";

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

/* Put an export where the agents are already looking.

     node agents/runner.mjs --adopt ~/Downloads/my-diary-2026-09-17.json

   The alternative is renaming a file and remembering a path, which is a
   chore, and a chore in front of an agent is why `diary-nudge` shipped
   paused and stayed paused. Reports what each agent will now see, and
   what it replaced — with --dry-run it only reports. */
if (flag("--adopt")) {
  const source = opt("--adopt", "");
  if (!source) {
    console.error("--adopt needs a file: node agents/runner.mjs --adopt ~/Downloads/my-diary-2026-09-17.json");
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(source, "utf8");
  } catch (e) {
    console.error(`Can't read ${source}: ${e.code === "ENOENT" ? "no such file" : e.message}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`${source} isn't valid JSON: ${e.message}`);
    process.exit(1);
  }

  const shape = looksLikeExport(parsed);
  if (!shape.ok) {
    console.error(`${source}: ${shape.why}`);
    process.exit(1);
  }

  const targets = adoptTargets(loadAgents(file), TYPES);
  if (!targets.length) {
    console.error("No agent reads a diary export — nothing to adopt it into.");
    process.exit(1);
  }

  console.log(
    `${source}\n  ${plural(shape.days, "day")}, ${shape.first} to ${shape.last} · ` +
    `${shape.written} with writing · ${plural(shape.tasks, "task")}\n`
  );

  for (const { path, agents } of byPath(targets)) {
    const names = agents.map((a) => a.label).join(", ");
    /* What's there now, said before it goes. Adopting is an overwrite,
       and an overwrite you didn't see coming is the kind of thing you
       only notice a week later. */
    let had = "nothing there yet";
    if (existsSync(path)) {
      if (resolve(path) === resolve(source)) {
        console.log(`– ${path} (${names}) — that's the file you gave me, left alone`);
        continue;
      }
      try {
        const before = looksLikeExport(JSON.parse(readFileSync(path, "utf8")));
        had = before.ok
          ? `replacing ${plural(before.days, "day")}, ${plural(before.tasks, "task")}`
          : "replacing something that isn't an export";
      } catch {
        had = "replacing an unreadable file";
      }
    }

    if (dryRun) {
      console.log(`· ${path} (${names}) — would copy, ${had}`);
      continue;
    }

    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, raw);
      console.log(`✓ ${path} (${names}) — ${had}`);
    } catch (e) {
      console.error(`✕ ${path} (${names}) — ${e.message}`);
      process.exit(1);
    }
  }

  const paused = targets.filter((t) => t.paused);
  if (paused.length) {
    console.log(
      `\nStill paused: ${paused.map((p) => p.id).join(", ")}. ` +
      (dryRun
        ? `Adopting for real would give them their file; turning them on is \`"active": true\` in ${file}.`
        : `They have their file now — set "active": true in ${file} to turn them on.`)
    );
  }
  console.log(dryRun ? "\nDry run — nothing written." : "\nDone. `node agents/runner.mjs --dry-run --force` to see what they make of it.");
  process.exit(0);
}

/* Running agents with nowhere to send their findings is a half-configured
   setup that looks like a working one. Say so, every run. */
const warnings = [];
if (!canNotify() && !dryRun) {
  const w =
    "No alert channel is configured — agents will run and record, but nothing will reach you. " +
    "Set NTFY_TOPIC (or WEBHOOK_URL). On GitHub: Settings → Secrets and variables → Actions.";
  warnings.push(w);
  log(`⚠ ${w}`);
}

async function pass() {
  const defs = loadAgents(file);
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
