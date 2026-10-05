/* ================================================
   MARKET LENS — lib/analyze.mjs
   One full pass: fetch, read, learn, compare, combine.

     1. prices for every symbol, plus the S&P 500 (SPY) as the yardstick
     2. the last month of headlines for each, and for the market overall
     3. each company's latest 10-Q/10-K numbers from SEC EDGAR
     4. a model fitted on all of their price histories together, checked
        walk-forward on data it hadn't seen
     5. Monte Carlo futures for each
     6. all of it fused into one probability per stock (quantum.mjs),
        ranked, with an illustrative split of a budget

   Any one source failing for a symbol drops that source for that symbol
   and says so in `errors`; it doesn't sink the run.
   ================================================ */

import { getPrices, getNews, getMarketNews, getCompanyFacts } from "./sources.mjs";
import { aggregate, newsProbability } from "./sentiment.mjs";
import { measures, peerRanks, fundamentalsProbability } from "./fundamentals.mjs";
import { featureSeries, samples, train, walkForward, trustFromSkill, monteCarlo, FEATURES } from "./model.mjs";
import { fuse } from "./quantum.mjs";

export const BENCHMARK = "SPY";

export const WEIGHTS = {
  model: 0.35,
  montecarlo: 0.2,
  fundamentals: 0.2,
  news: 0.15,
  macro: 0.1,
};

const LABELS = {
  model: "Price-pattern model",
  montecarlo: "Monte Carlo futures",
  fundamentals: "Company reports (SEC)",
  news: "Company news",
  macro: "Market mood",
};

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

export function verdict(p) {
  if (p >= 0.62) return { key: "strong", text: "Strong lean up" };
  if (p >= 0.56) return { key: "lean", text: "Lean up" };
  if (p > 0.46) return { key: "neutral", text: "No clear edge" };
  if (p >= 0.4) return { key: "weak", text: "Lean down" };
  return { key: "avoid", text: "Avoid for now" };
}

/* An illustrative split, not advice. Only names the evidence leans up on
   get a slice, sized by conviction over variance and capped at 25% each;
   how much goes to picks at all grows with the average conviction, and
   the rest sits in the broad index. */
export function allocate(stocks, budget, horizon) {
  const eligible = stocks.filter((s) => s.quantum.p >= 0.55 && s.montecarlo && s.montecarlo.p50 > 0);
  if (!eligible.length) {
    return {
      budget, picks: [], indexShare: 1,
      note: "Nothing cleared the bar (55%+ and a positive median outcome). Holding the broad index is the default when there's no edge.",
    };
  }
  const raw = eligible.map((s) => {
    const v = Math.max(0.12, s.montecarlo.annualVol) * Math.sqrt(horizon / 252);
    return (s.quantum.p - 0.5) / (v * v);
  });
  let w = raw.map((r) => r / raw.reduce((a, b) => a + b, 0));
  for (let k = 0; k < 10; k++) {
    const over = w.map((x) => Math.max(0, x - 0.25));
    const spill = over.reduce((a, b) => a + b, 0);
    if (spill < 1e-9) break;
    const room = w.map((x) => (x < 0.25 ? 0.25 - x : 0));
    const roomSum = room.reduce((a, b) => a + b, 0);
    w = w.map((x, i) => Math.min(0.25, x) + (roomSum ? (spill * room[i]) / roomSum : 0));
  }
  const capped = w.reduce((a, b) => a + b, 0); // < 1 only when every name hit the cap
  const avgEdge = eligible.reduce((s, x) => s + (x.quantum.p - 0.5), 0) / eligible.length;
  const picksShare = Math.min(0.7, 0.3 + 4 * avgEdge) * Math.min(1, capped);
  const picks = eligible
    .map((s, i) => ({ symbol: s.symbol, name: s.name, share: picksShare * (w[i] / capped), p: s.quantum.p }))
    .map((x) => ({ ...x, amount: Math.round(budget * x.share) }))
    .sort((a, b) => b.share - a.share);
  return {
    budget,
    picks,
    indexShare: 1 - picks.reduce((s, x) => s + x.share, 0),
    note: "Weights grow with how far the probability is above 50% and shrink with volatility; no name above 25%. The rest stays in the broad index (SPY / VOO).",
  };
}

export async function analyze(opts = {}, onProgress = () => {}) {
  const horizon = Math.max(21, Math.min(252, Number(opts.horizon) || 63));
  const budget = Math.max(0, Number(opts.budget) || 10000);
  const symbols = [...new Set((opts.symbols || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))]
    .filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s));
  if (!symbols.length) throw new Error("no symbols to analyse");
  const names = opts.names || {};
  const errors = [];
  const step = (msg) => onProgress(msg);

  // ---- 1. prices -------------------------------------------------------
  step(`Fetching price history for ${symbols.length} symbols + ${BENCHMARK}…`);
  const all = symbols.includes(BENCHMARK) ? symbols : [...symbols, BENCHMARK];
  const priced = {};
  await pool(all, 4, async (sym) => {
    try {
      priced[sym] = await getPrices(sym);
      step(`  ✓ ${sym}: ${priced[sym].rows.length} trading days (${priced[sym].source})`);
    } catch (e) {
      errors.push({ symbol: sym, what: "prices", why: e.message });
      step(`  ✗ ${sym}: ${e.message}`);
    }
  });
  const bench = priced[BENCHMARK] || null;
  const live = symbols.filter((s) => priced[s] && priced[s].rows.length > 300);
  if (!live.length) throw new Error("couldn't get price history for any symbol — are you online?");

  // ---- 2. news ---------------------------------------------------------
  step("Reading the last 30 days of news…");
  let marketAgg = null;
  try {
    marketAgg = aggregate(await getMarketNews());
    step(`  ✓ market: ${marketAgg.n} headlines, mood ${marketAgg.score.toFixed(2)}`);
  } catch (e) {
    errors.push({ symbol: "MARKET", what: "news", why: e.message });
  }
  const news = {};
  await pool(live, 4, async (sym) => {
    try {
      news[sym] = aggregate(await getNews(sym, names[sym] || priced[sym].name));
    } catch (e) {
      errors.push({ symbol: sym, what: "news", why: e.message });
    }
  });
  step(`  ✓ company news for ${Object.keys(news).length} of ${live.length}`);

  // ---- 3. SEC reports --------------------------------------------------
  step("Reading the latest 10-Q / 10-K filings from SEC EDGAR…");
  const fund = {};
  const secNames = {};
  await pool(live, 3, async (sym) => {
    try {
      const cf = await getCompanyFacts(sym);
      if (!cf) return; // ETF or not an SEC filer
      secNames[sym] = cf.name;
      const rows = priced[sym].rows;
      fund[sym] = measures(cf.facts, rows[rows.length - 1].close);
    } catch (e) {
      errors.push({ symbol: sym, what: "SEC reports", why: e.message });
    }
  });
  const ranks = peerRanks(fund);
  step(`  ✓ reports for ${Object.values(fund).filter(Boolean).length} companies`);

  // ---- 4. the model ----------------------------------------------------
  step(`Learning from price history (horizon ${horizon} trading days)…`);
  const fsBy = {};
  let panel = [];
  for (const sym of new Set([...live, ...(bench ? [BENCHMARK] : [])])) {
    fsBy[sym] = featureSeries(priced[sym].rows, sym === BENCHMARK ? null : bench);
    panel = panel.concat(samples(sym, fsBy[sym], horizon, sym === BENCHMARK ? null : bench));
  }
  const wfUp = walkForward(panel, "y", horizon);
  const wfBeat = walkForward(panel, "beat", horizon);
  const modelUp = train(panel.map((r) => r.x), panel.map((r) => r.y));
  const beatRows = panel.filter((r) => r.beat != null);
  const modelBeat = beatRows.length > 100 ? train(beatRows.map((r) => r.x), beatRows.map((r) => r.beat)) : null;
  const trust = trustFromSkill(wfUp);
  step(`  ✓ ${panel.length} training examples; out-of-sample accuracy ${wfUp ? (wfUp.accuracy * 100).toFixed(1) + "%" : "n/a"}`);

  // ---- 5 & 6. per stock ------------------------------------------------
  step("Simulating futures and combining the evidence…");
  const macroP = marketAgg ? newsProbability(marketAgg) : null;
  const stocks = live.map((sym) => {
    const rows = priced[sym].rows;
    const fs = fsBy[sym];
    const t = rows.length - 1;
    const f = fs.at(t);
    const x = FEATURES.map((k) => f[k]);
    const rawUp = modelUp.predict(x);
    const pModel = modelUp.base + (rawUp - modelUp.base) * trust;
    const pBeat = modelBeat ? modelBeat.base + (modelBeat.predict(x) - modelBeat.base) * trustFromSkill(wfBeat) : null;
    const mc = monteCarlo(fs.logReturns, horizon, { seedKey: sym });
    const nAgg = news[sym];
    const m = fund[sym] || null;
    const pFund = m ? fundamentalsProbability(m, ranks[sym]) : null;

    const sources = [
      { id: "model", p: pModel, confidence: 0.4 + 0.6 * trust },
      { id: "montecarlo", p: mc ? mc.pUp : null, confidence: 0.6 },
      { id: "fundamentals", p: pFund, confidence: 0.7 },
      { id: "news", p: nAgg && nAgg.n ? newsProbability(nAgg) : null, confidence: nAgg ? 0.3 + 0.7 * nAgg.coverage : 0 },
      { id: "macro", p: macroP, confidence: marketAgg ? 0.3 + 0.5 * marketAgg.coverage : 0 },
    ].map((s) => ({ ...s, weight: WEIGHTS[s.id], label: LABELS[s.id] }));
    const q = fuse(sources);

    const spark = [];
    for (let i = Math.max(0, t - 252); i <= t; i += 5) spark.push(+rows[i].close.toFixed(2));
    const hv = mc ? mc.annualVol * Math.sqrt(horizon / 252) : 0.1;

    return {
      symbol: sym,
      name: names[sym] || secNames[sym] || priced[sym].name || sym,
      price: rows[t].close,
      asOf: rows[t].date,
      priceSource: priced[sym].source,
      change1m: Math.exp(f.r21) - 1,
      change6m: Math.exp(f.r126) - 1,
      quantum: q,
      verdict: verdict(q.p),
      rankScore: (q.p - 0.5) + 0.25 * ((mc ? mc.expected : 0) / hv),
      sources: sources.map((s) => ({ id: s.id, label: s.label, p: s.p, weight: s.weight, confidence: s.confidence })),
      model: { pUp: pModel, raw: rawUp, pBeatMarket: pBeat },
      montecarlo: mc,
      news: nAgg
        ? {
            score: nAgg.score, n: nAgg.n, lastWeek: nAgg.lastWeek, positive: nAgg.positive, negative: nAgg.negative,
            headlines: nAgg.items.slice(0, 12).map((h) => ({ title: h.title, url: h.url, source: h.source, at: h.at, score: h.score })),
          }
        : null,
      fundamentals: m ? { ...m, peerRank: ranks[sym], p: pFund } : null,
      features: f,
      spark,
    };
  });

  stocks.sort((a, b) => b.rankScore - a.rankScore);

  const importance = FEATURES.map((k, j) => ({ feature: k, weight: modelUp.w[j] }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  step("Done.");
  return {
    generatedAt: new Date().toISOString(),
    horizonDays: horizon,
    horizonLabel: `${Math.round(horizon / 21)} months`,
    benchmark: BENCHMARK,
    weights: WEIGHTS,
    market: marketAgg
      ? {
          p: macroP, score: marketAgg.score, n: marketAgg.n,
          benchmark: bench ? { price: bench.rows[bench.rows.length - 1].close, change6m: bench.rows.length > 127 ? bench.rows[bench.rows.length - 1].close / bench.rows[bench.rows.length - 127].close - 1 : null } : null,
          headlines: marketAgg.items.slice(0, 10).map((h) => ({ title: h.title, url: h.url, source: h.source, at: h.at, score: h.score })),
        }
      : null,
    model: {
      examples: panel.length,
      baseRate: modelUp.base,
      trust,
      walkForward: wfUp,
      walkForwardBeat: wfBeat,
      importance,
    },
    stocks,
    allocation: allocate(stocks, budget, horizon),
    errors,
  };
}
