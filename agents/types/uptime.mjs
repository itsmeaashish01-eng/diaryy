/* ================================================
   AGENTS — types/uptime.mjs
   Is it up, and how slow is it today?

   config:
     url        what to probe
     expect     optional status code to require (default: any 2xx/3xx)
     contains   optional string the body must contain to count as up
     timeoutMs  default 15000

   The metric is the response time in milliseconds, so the ordinary
   threshold rules cover "it's up but crawling" without extra machinery.
   ================================================ */

import { safeFetch } from "../core/net.mjs";

export default {
  id: "uptime",
  label: "Uptime",
  summary: "An endpoint went down, came back, or got slow",

  validate(agent) {
    return agent.config && agent.config.url ? [] : ["needs config.url"];
  },

  async run(agent, ctx) {
    const c = agent.config;
    const timeoutMs = Number(c.timeoutMs) || 15000;
    const started = Date.now();

    let up = true, status = 0, why = "";
    try {
      const res = await safeFetch(c.url, { timeoutMs });
      status = res.status;
      if (c.expect && status !== Number(c.expect)) {
        up = false;
        why = `expected ${c.expect}, got ${status}`;
      } else if (c.contains) {
        const body = await res.text();
        if (!body.includes(c.contains)) {
          up = false;
          why = `the page no longer contains "${c.contains}"`;
        }
      }
    } catch (e) {
      up = false;
      why = e.message;
    }

    const ms = Date.now() - started;
    const wasUp = ctx.state.memo.up;
    const flipped = wasUp !== undefined && wasUp !== up;

    /* Only the transitions are worth an alert. A site that has been down
       for a week should not wake you every hour to say so — the run log
       and the dashboard are where "still down" belongs. */
    const observations = flipped
      ? [{
          key: `${up ? "up" : "down"}-${Math.floor(Date.now() / 60000)}`,
          title: up ? `${agent.label} is back up` : `${agent.label} is down`,
          detail: up ? `Responding again in ${ms}ms.` : why,
          url: c.url,
          at: Date.now(),
        }]
      : [];

    return {
      observations,
      metric: up ? ms : null,
      memo: { up, lastStatus: status, lastWhy: why },
      facts: { up, status, ms, ...(why ? { why } : {}) },
      /* A site going down is urgent whatever the rules say; a site that
         is merely still down is not, or the alert loses its meaning. */
      level: flipped && !up ? "urgent" : flipped && up ? "notable" : "quiet",
      why: flipped ? (up ? "back up" : why) : "",
      line: up ? `up · ${ms}ms${status ? ` · HTTP ${status}` : ""}` : `DOWN — ${why}`,
    };
  },

  describe(agent, fresh) {
    return fresh.map((o) => `${o.title}\n${o.detail}`).join("\n\n");
  },
};
