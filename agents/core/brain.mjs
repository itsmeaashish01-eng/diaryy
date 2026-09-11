/* ================================================
   AGENTS — core/brain.mjs
   Turning "here is what I found" into "here is whether you care".

   Two halves, deliberately separated:

     decide()   the rules. Deterministic, free, and the only thing that
                sets the level. Runs on every agent, every time.

     narrate()  the words. By default a plain sentence built from the same
                facts. If ANTHROPIC_API_KEY is set and the agent opts in,
                Claude writes it instead.

   The model never sets the level and never suppresses a rule — it only
   phrases what the rules already decided. That keeps the alerting honest
   and, more practically, keeps the whole thing working with no API key
   and no bill.
   ================================================ */

export const LEVELS = ["quiet", "notable", "urgent"];
export const rank = (level) => Math.max(0, LEVELS.indexOf(level));
export const atLeast = (level, floor) => rank(level) >= rank(floor);

const pct = (a, b) => (b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100);

/* ---- the rules ---------------------------------------------------- */
/*
   Each agent may carry a `rules` array. Every rule is { when, ...args,
   level } and the highest level that fires wins. With no rules at all an
   agent still reports anything genuinely new, which is what you almost
   always want and saves writing the obvious rule out by hand.
*/
export function decide(agent, run, s) {
  const rules = Array.isArray(agent.rules) && agent.rules.length
    ? agent.rules
    : [{ when: "new", level: "notable" }];

  const reasons = [];
  let level = "quiet";
  const fire = (why, at) => {
    reasons.push(why);
    if (rank(at || "notable") > rank(level)) level = at || "notable";
  };

  const v = run.metric == null ? null : Number(run.metric);
  const prev = s.metrics.length ? s.metrics[s.metrics.length - 1].v : null;
  const history = s.metrics.map((m) => m.v);
  const fresh = run.fresh || [];

  for (const r of rules) {
    switch (r.when) {
      case "always":
        fire(run.line || "reporting every run, as configured", r.level);
        break;

      case "new":
        if (fresh.length) {
          const min = Number(r.count) || 1;
          if (fresh.length >= min) {
            fire(`${fresh.length} new ${fresh.length === 1 ? "item" : "items"}`, r.level);
          }
        }
        break;

      case "above":
        if (v != null && v > Number(r.value)) fire(`${fmt(v)} is above ${fmt(r.value)}`, r.level);
        break;

      case "below":
        if (v != null && v < Number(r.value)) fire(`${fmt(v)} is below ${fmt(r.value)}`, r.level);
        break;

      case "changesBy": {
        if (v == null || prev == null) break;
        const delta = pct(v, prev);
        if (Math.abs(delta) >= Number(r.percent || 10)) {
          fire(`${delta > 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)}% since the last check`, r.level);
        }
        break;
      }

      case "newLow":
        if (v != null && history.length >= 3 && v < Math.min(...history)) {
          fire(`lowest reading yet (${fmt(v)})`, r.level);
        }
        break;

      case "newHigh":
        if (v != null && history.length >= 3 && v > Math.max(...history)) {
          fire(`highest reading yet (${fmt(v)})`, r.level);
        }
        break;

      case "error":
        if (s.errorCount >= (Number(r.after) || 3)) {
          fire(`failed ${s.errorCount} times in a row`, r.level || "urgent");
        }
        break;

      default:
        reasons.push(`(unknown rule "${r.when}" — ignored)`);
    }
  }

  /* A type can escalate on its own — an endpoint that just went down
     knows more about whether that matters than a threshold does. */
  if (run.level && rank(run.level) > rank(level)) {
    level = run.level;
    if (run.why) reasons.push(run.why);
  }

  return { level, reasons };
}

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return Math.abs(x) >= 100 ? x.toFixed(0) : String(Number(x.toFixed(2)));
}

/* ---- the words ---------------------------------------------------- */

export function narrateWithRules(agent, run, verdict) {
  const head = run.line || `${agent.label}: something changed`;
  if (!verdict.reasons.length) return head;
  return `${head} — ${verdict.reasons.join("; ")}`;
}

/* The seam. Off unless a key exists AND the agent asked for it, so the
   default install costs nothing and needs no account. */
export function llmEnabled(agent) {
  return Boolean(process.env.ANTHROPIC_API_KEY) && agent.brain === "claude";
}

/*
   Raw HTTP rather than @anthropic-ai/sdk on purpose: this repo has no
   package.json and the workflow runs bare `node`, so a dependency here
   would mean an install step in CI for a code path that is off by
   default. One POST is a fair trade for keeping that true.
*/
export async function narrateWithClaude(agent, run, verdict, fresh) {
  const model = process.env.AGENT_MODEL || "claude-opus-5";
  const body = {
    model,
    max_tokens: 1024,
    // Cheap end of the range: this is a two-sentence summarisation job.
    output_config: { effort: "low" },
    fallbacks: "default",
    system:
      "You write one-line alerts for a personal monitoring agent. " +
      "You are given what the agent found and the reasons its rules fired. " +
      "Reply with at most two sentences of plain text: what changed and why it matters. " +
      "No preamble, no markdown, no bullet points, no restating the agent's name.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          agent: agent.label,
          type: agent.type,
          level: verdict.level,
          summary: run.line,
          reasons: verdict.reasons,
          newItems: fresh.slice(0, 10).map((o) => ({ title: o.title, detail: o.detail })),
          facts: run.facts || {},
        }),
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`Claude API responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (json.stop_reason === "refusal") throw new Error("Claude declined to summarise this one");

  const text = (json.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Claude returned no text");
  return text;
}

/* What the runner actually calls. Falls back to the rules if the model
   is off, unreachable, or unhappy — an alert that doesn't arrive because
   an API call failed is worse than a plainly worded one. */
export async function narrate(agent, run, verdict, fresh, log) {
  if (!llmEnabled(agent)) return narrateWithRules(agent, run, verdict);
  try {
    return await narrateWithClaude(agent, run, verdict, fresh);
  } catch (e) {
    log(`  (brain fell back to rules — ${e.message})`);
    return narrateWithRules(agent, run, verdict);
  }
}
