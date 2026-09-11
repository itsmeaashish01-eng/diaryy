/* ================================================
   AGENTS — core/registry.mjs
   Every agent type the runner knows about.

   Adding a type means writing one file in types/ and adding it to this
   list. Nothing else in the runner, the dashboard or the workflow needs
   to change — that's the whole point of the shape.

   A type exports:
     id, label, summary
     validate(agent)          -> string[] of problems, empty if fine
     run(agent, ctx)          -> { observations, metric, memo, facts,
                                   line, level?, why? }
     describe(agent, fresh, run) -> the body of the alert

   `ctx` carries { state, now, log }. `observations` are things with an
   identity — the runner keeps their keys and only ever reports one once.
   `metric` is a single number to record, which is what the threshold
   rules read.
   ================================================ */

import feed from "../types/feed.mjs";
import webpage from "../types/webpage.mjs";
import uptime from "../types/uptime.mjs";
import githubRelease from "../types/github-release.mjs";
import price from "../types/price.mjs";
import diary from "../types/diary.mjs";
import goals from "../types/goals.mjs";
import study from "../types/study.mjs";
import reading from "../types/reading.mjs";
import exercise from "../types/exercise.mjs";
import portfolio from "../types/portfolio.mjs";

export const TYPES = Object.fromEntries(
  [
    // Watching the world
    feed, webpage, uptime, githubRelease, price, portfolio,
    // Watching you
    diary, goals, study, reading, exercise,
  ].map((t) => [t.id, t])
);

export const typeFor = (agent) => TYPES[agent.type] || null;

export const typeList = () =>
  Object.values(TYPES).map((t) => `  ${t.id.padEnd(16)} ${t.summary}`).join("\n");
