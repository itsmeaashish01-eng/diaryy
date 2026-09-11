/* ================================================
   AGENTS — types/price.mjs
   What does it cost right now?

   This type doesn't fetch prices itself — it borrows Price Watch's
   provider registry, so every source that app already speaks (CoinGecko,
   Coinbase, Stooq, Frankfurter, a JSON path, a regex on a page, Amadeus
   fares) is an agent source too, and a fix to one fixes both.

   config:
     provider   a Price Watch provider id: coingecko | coinbase | stooq |
                frankfurter | json | regex | demo | amadeus
     currency   optional, for display
     ...        whatever that provider needs — the same keys the app's
                own form asks for (symbol, url, path, pattern, …)

   The "command" provider is deliberately not reachable from here. It
   exists to run a local program, and an agent definition is data.
   ================================================ */

import { createRequire } from "node:module";

/* Price Watch's modules are plain browser scripts that hang themselves
   off `window`. Point `window` at the Node global and they load unchanged —
   the same trick watch-runner.mjs uses. */
function loadPT() {
  if (globalThis.PT) return globalThis.PT;
  globalThis.window = globalThis;
  const require = createRequire(import.meta.url);
  require("../../tracker/js/util.js");
  require("../../tracker/js/providers.js");
  return globalThis.PT;
}

export default {
  id: "price",
  label: "Price",
  summary: "The price of something, from any Price Watch source",

  validate(agent) {
    const c = agent.config || {};
    if (!c.provider) return ["needs config.provider"];
    if (c.provider === "command") {
      return ['config.provider "command" is not available to agents — it runs programs, and an agent file is data'];
    }
    const PT = loadPT();
    return PT.providers.byId(c.provider) ? [] : [`unknown price source "${c.provider}"`];
  },

  async run(agent, ctx) {
    const PT = loadPT();
    const c = agent.config;

    /* The providers expect a watch. An agent is close enough to one —
       give it the shape they read and nothing else. */
    const watch = {
      id: agent.id,
      label: agent.label,
      provider: c.provider,
      currency: c.currency || "USD",
      config: c,
      trip: agent.trip || null,
      intervalMin: agent.intervalMin || 60,
      createdAt: ctx.state.memo.createdAt || Date.now(),
    };

    const result = await PT.providers.check(watch, {
      proxyBase: (process.env.PROXY_BASE || "").trim(),
      currency: watch.currency,
    });

    const price = Number(result.price);
    const currency = result.currency || watch.currency;
    const money = PT.util.fmtMoney(price, currency);

    /* A price is a number, not an event: nothing here is "new" in the
       way a feed item is. The threshold rules — below, newLow, changesBy —
       are what make a price agent say anything at all. */
    return {
      observations: [],
      metric: price,
      memo: { createdAt: watch.createdAt, currency, lastMoney: money },
      facts: { price, currency, source: PT.providers.describe(watch) },
      line: money,
    };
  },

  describe(agent, fresh, run) {
    const c = agent.config;
    return `${(run && run.line) || "price updated"}${c.note ? `\n${c.note}` : ""}`;
  },
};
