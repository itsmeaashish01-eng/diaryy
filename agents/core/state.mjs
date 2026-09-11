/* ================================================
   AGENTS — core/state.mjs
   What each agent remembers between runs.

   Definitions live in agents.json and are yours to edit. State lives in
   state.json and is the runner's to write — what it has already seen, the
   numbers it has recorded, when it last said something. Keeping them in
   separate files means a run can commit its state back without ever
   rewriting your configuration.
   ================================================ */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA_VERSION = 1;

/* Caps. An agent that runs hourly forever should not grow a state file
   forever with it.

   MAX_SEEN is the one to be careful with. It's the dedupe memory, so it
   has to be bigger than the largest number of distinct things a single
   run can turn up — otherwise a run overflows it, the earliest keys fall
   off, and the next run "discovers" them again and alerts on them. A
   library scan that finds a note and a review date for each of 300 notes
   is 600 keys in one pass, so the default is set well clear of that, and
   an agent that tracks more can raise it with "maxSeen". */
const MAX_SEEN = 1000;
const MAX_METRICS = 1500;
const MAX_EVENTS = 60;
const MAX_RUNS = 200;

export function blankAgentState() {
  return {
    lastRun: 0,        // when we last attempted it
    lastOk: 0,         // when it last succeeded
    errorCount: 0,
    lastError: null,
    lastLine: "",      // the one-line summary of the last good run
    seen: [],          // observation keys already reported
    metrics: [],       // [{ t, v }]
    events: [],        // [{ t, level, title, detail, url }]
    notifiedAt: {},    // level -> timestamp, for cooldowns
    memo: {},          // free-form, owned by the agent type
  };
}

export function loadState(path) {
  if (!existsSync(path)) return { version: SCHEMA_VERSION, agents: {}, runs: [] };
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    /* A corrupt state file must not stop the agents from running — they
       would simply re-report what they have already seen, which is noisy
       but recoverable. Losing the run entirely is not. */
    console.warn(`state file ${path} is unreadable (${e.message}) — starting fresh`);
    data = {};
  }
  return {
    version: SCHEMA_VERSION,
    agents: data.agents && typeof data.agents === "object" ? data.agents : {},
    runs: Array.isArray(data.runs) ? data.runs : [],
  };
}

export function agentState(state, id) {
  if (!state.agents[id]) state.agents[id] = blankAgentState();
  const s = state.agents[id];
  // Tolerate a hand-edited or older state file missing newer fields.
  for (const [k, v] of Object.entries(blankAgentState())) {
    if (s[k] === undefined) s[k] = Array.isArray(v) ? [] : v;
  }
  return s;
}

/* Returns how many keys had to be dropped to stay under the cap. Anything
   above zero means this agent is forgetting faster than it's learning,
   and the runner says so rather than letting it repeat itself quietly. */
export function remember(s, { seen = [], metric = null, events = [] }, cap = MAX_SEEN) {
  let dropped = 0;
  if (seen.length) {
    const merged = s.seen.concat(seen);
    dropped = Math.max(0, Math.min(merged.length - cap, seen.length));
    s.seen = merged.slice(-cap);
  }
  if (metric && Number.isFinite(metric.v)) {
    s.metrics.push({ t: metric.t || Date.now(), v: metric.v });
    if (s.metrics.length > MAX_METRICS) s.metrics = s.metrics.slice(-MAX_METRICS);
  }
  if (events.length) s.events = events.concat(s.events).slice(0, MAX_EVENTS);
  return { dropped };
}

export function saveState(path, state, run) {
  if (run) state.runs = [run, ...state.runs].slice(0, MAX_RUNS);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

export function loadAgents(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(data.agents)) {
    throw new Error(`${path} has no "agents" array`);
  }
  return data;
}
