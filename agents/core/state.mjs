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
   forever with it. */
const MAX_SEEN = 400;
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

export function remember(s, { seen = [], metric = null, events = [] }) {
  if (seen.length) s.seen = s.seen.concat(seen).slice(-MAX_SEEN);
  if (metric && Number.isFinite(metric.v)) {
    s.metrics.push({ t: metric.t || Date.now(), v: metric.v });
    if (s.metrics.length > MAX_METRICS) s.metrics = s.metrics.slice(-MAX_METRICS);
  }
  if (events.length) s.events = events.concat(s.events).slice(0, MAX_EVENTS);
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
