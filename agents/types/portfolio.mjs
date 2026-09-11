/* ================================================
   AGENTS — types/portfolio.mjs
   Holdings, valued together.

   The `price` type watches one number. This watches a set of them and
   answers the questions a single price can't: what's it all worth, am I
   up or down, and has the shape of it drifted away from what I said I
   wanted.

   It prices each holding through Price Watch's provider registry, so
   there's nothing new to configure and nothing new to break.

   Currencies are never added together. A total in dollars and a total in
   rupees are two totals, reported as two totals — a single blended number
   would be worse than no number.

   config:
     file           default agents/data/portfolio.json
     base           the currency whose total becomes the metric ("USD")
     movePercent    a holding moving this much in one check is worth saying (5)
     driftPercent   allocation this far from target is worth saying (5)

   The file:
     {
       "holdings": [{
         "symbol": "VOO", "label": "S&P 500",
         "provider": "stooq", "config": { "symbol": "voo.us" },
         "currency": "USD", "quantity": 12, "avgCost": 402.10,
         "targetPercent": 60
       }]
     }
   ================================================ */

import { createRequire } from "node:module";
import { readJSON, plural } from "../core/local.mjs";

function loadPT() {
  if (globalThis.PT) return globalThis.PT;
  globalThis.window = globalThis;
  const require = createRequire(import.meta.url);
  require("../../tracker/js/util.js");
  require("../../tracker/js/providers.js");
  return globalThis.PT;
}

const pct = (a, b) => (b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100);
const signed = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export default {
  id: "portfolio",
  label: "Portfolio",
  summary: "What the holdings are worth, and when the shape drifts",

  validate(agent) {
    const c = agent.config || {};
    let data;
    try {
      data = readJSON(c.file || "agents/data/portfolio.json", "portfolio file");
    } catch (e) {
      return [e.message];
    }
    if (!Array.isArray(data.holdings)) return ['the portfolio file has no "holdings" array'];

    const PT = loadPT();
    const errs = [];
    for (const h of data.holdings) {
      if (!h || !h.symbol) { errs.push("a holding has no symbol"); continue; }
      if (h.provider === "command") {
        errs.push(`${h.symbol}: the "command" source is not available to agents`);
      } else if (!PT.providers.byId(h.provider)) {
        errs.push(`${h.symbol}: unknown price source "${h.provider}"`);
      }
    }
    return errs.slice(0, 5);
  },

  async run(agent, ctx) {
    const PT = loadPT();
    const c = agent.config || {};
    const base = (c.base || "USD").toUpperCase();
    const movePercent = Number(c.movePercent) || 5;
    const driftPercent = Number(c.driftPercent) || 5;
    const data = readJSON(c.file || "agents/data/portfolio.json", "portfolio file");

    const lastPrices = ctx.state.memo.prices || {};
    const prices = {};
    const observations = [];
    const add = (key, title, detail) => observations.push({ key, title, detail, at: Date.now(), url: "" });

    const rows = [];
    const failed = [];

    for (const h of data.holdings) {
      const label = h.label || h.symbol;
      const watch = {
        id: `${agent.id}:${h.symbol}`,
        label,
        provider: h.provider,
        currency: h.currency || base,
        config: h.config || h,
        intervalMin: agent.intervalMin || 60,
        createdAt: Date.now(),
      };

      let result;
      try {
        result = await PT.providers.check(watch, {
          proxyBase: (process.env.PROXY_BASE || "").trim(),
          currency: watch.currency,
        });
      } catch (e) {
        /* One dead source must not cost you the whole valuation — price
           what you can and say plainly which ones you couldn't. A count
           on its own ("1 unpriced") is the unhelpful version: it tells
           you something is wrong and leaves you to guess where. */
        failed.push({ symbol: h.symbol, label, why: String(e.message || e) });
        continue;
      }

      const price = Number(result.price);
      const currency = (result.currency || watch.currency || base).toUpperCase();
      const qty = Number(h.quantity) || 0;
      const value = price * qty;
      const cost = (Number(h.avgCost) || 0) * qty;

      prices[h.symbol] = price;
      rows.push({ h, label, price, currency, qty, value, cost });

      // ---- a holding that moved ----
      const before = lastPrices[h.symbol];
      if (Number.isFinite(before)) {
        const move = pct(price, before);
        if (Math.abs(move) >= movePercent) {
          add(`move:${h.symbol}:${new Date().toISOString().slice(0, 13)}`,
            `${label} ${move > 0 ? "up" : "down"} ${Math.abs(move).toFixed(1)}%`,
            `${PT.util.fmtMoney(before, currency)} → ${PT.util.fmtMoney(price, currency)} since the last check.`);
        }
      }
    }

    if (!rows.length) {
      throw new Error(
        failed.length
          ? `couldn't price anything — ${failed[0].label}: ${failed[0].why}`
          : "no holdings priced"
      );
    }

    // ---- totals, per currency, never blended ----
    const byCurrency = {};
    for (const r of rows) {
      const g = (byCurrency[r.currency] = byCurrency[r.currency] || { value: 0, cost: 0, n: 0 });
      g.value += r.value;
      g.cost += r.cost;
      g.n++;
    }

    // ---- allocation drift, within a currency ----
    for (const r of rows) {
      const targetPct = Number(r.h.targetPercent);
      if (!Number.isFinite(targetPct)) continue;
      const group = byCurrency[r.currency];
      if (!group.value) continue;
      const actual = (r.value / group.value) * 100;
      const drift = actual - targetPct;
      if (Math.abs(drift) >= driftPercent) {
        add(`drift:${r.h.symbol}:${Math.round(actual / driftPercent)}`,
          `${r.label} is ${Math.abs(drift).toFixed(1)} points ${drift > 0 ? "over" : "under"} target`,
          `${actual.toFixed(1)}% of the ${r.currency} side, target ${targetPct}%.`);
      }
    }

    /* A holding that won't price is worth saying once a day, not every
       four hours — a broken symbol stays broken, and the total is still
       wrong every run until you fix it. */
    const today = new Date().toISOString().slice(0, 10);
    for (const f of failed) {
      add(`unpriced:${f.symbol}:${today}`,
        `Couldn't price ${f.label}`,
        `${f.why}\nThe total below leaves it out, so it is lower than your real position.`);
    }

    const parts = Object.entries(byCurrency).map(([cur, g]) => {
      const pl = g.cost ? ` (${signed(pct(g.value, g.cost))})` : "";
      return `${PT.util.fmtMoney(g.value, cur)}${pl}`;
    });

    const baseGroup = byCurrency[base];
    const missing = failed.map((f) => f.label).join(", ");

    return {
      observations,
      metric: baseGroup ? Math.round(baseGroup.value * 100) / 100 : null,
      memo: { prices },
      facts: {
        holdings: rows.length,
        unpriced: failed.map((f) => `${f.label}: ${f.why}`),
        byCurrency: Object.fromEntries(
          Object.entries(byCurrency).map(([k, v]) => [k, { value: Math.round(v.value * 100) / 100, holdings: v.n }])
        ),
      },
      level: failed.length ? "notable" : "quiet",
      why: failed.length ? `couldn't price ${missing}` : "",
      /* Say what the total excludes, in the same breath as the total —
         a number that silently omits a holding is worse than no number. */
      line: parts.join(" · ") + (failed.length ? ` · excludes ${missing}` : ""),
    };
  },

  describe(agent, fresh, run) {
    const head = run && run.line ? run.line : "";
    const body = fresh.map((o) => `${o.title}\n${o.detail}`).join("\n\n");
    return [head, body].filter(Boolean).join("\n\n");
  },
};
