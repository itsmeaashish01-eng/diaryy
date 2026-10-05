#!/usr/bin/env node
/* ================================================
   MARKET LENS — selftest.mjs
   Everything that can be checked without the network.

     node market/selftest.mjs

   The parsers against fixture responses, the sentiment scorer, the SEC
   arithmetic (including the derived Q4), the model on data with a known
   pattern in it, the quantum fusion's properties, and a whole analysis
   end to end on synthetic prices seeded into a throwaway cache.
   ================================================ */

import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CACHE = mkdtempSync(join(tmpdir(), "market-selftest-"));
process.env.MARKET_CACHE_DIR = CACHE;

const { parseYahooChart, parseStooqCSV, cleanHeadline, mergeNews, yahooSymbol } = await import("./lib/sources.mjs");
const { scoreHeadline, aggregate, newsProbability } = await import("./lib/sentiment.mjs");
const { quarterly, measures, peerRanks, fundamentalsProbability } = await import("./lib/fundamentals.mjs");
const { train, auc, walkForward, monteCarlo, featureSeries, samples } = await import("./lib/model.mjs");
const { fuse } = await import("./lib/quantum.mjs");
const { analyze, allocate, verdict } = await import("./lib/analyze.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || "expected"} ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || "assertion failed"); }
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ≈${b}, got ${a}`);

// deterministic randomness for synthetic data
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

// ---------------------------------------------------------------- sources

await check("Yahoo chart parses adjusted closes and skips nulls", () => {
  const r = parseYahooChart({ chart: { result: [{
    meta: { longName: "Apple Inc.", currency: "USD" },
    timestamp: [1704205800, 1704292200, 1704378600],
    indicators: { quote: [{ close: [185, null, 182], volume: [1, 2, 3] }], adjclose: [{ adjclose: [184, null, 181] }] },
  }] } });
  eq(r.rows.length, 2); eq(r.rows[0].close, 184); eq(r.name, "Apple Inc."); eq(r.rows[0].date, "2024-01-02");
});

await check("Yahoo error is surfaced", () => {
  let msg = "";
  try { parseYahooChart({ chart: { result: null, error: { description: "No data found, symbol may be delisted" } } }); } catch (e) { msg = e.message; }
  ok(/delisted/.test(msg), msg);
});

await check("Stooq CSV parses; HTML is refused", () => {
  const r = parseStooqCSV("Date,Open,High,Low,Close,Volume\n2024-01-02,1,2,0.5,10.5,100\n2024-01-03,1,2,0.5,11,200\n");
  eq(r.rows.length, 2); eq(r.rows[1].close, 11);
  let threw = false;
  try { parseStooqCSV("<html>captcha</html>"); } catch { threw = true; }
  ok(threw, "should refuse non-CSV");
});

await check("share classes map to Yahoo's spelling", () => eq(yahooSymbol("brk.b"), "BRK-B"));

await check("Google News publisher suffix is removed", () => {
  eq(cleanHeadline("Apple beats estimates on iPhone demand - Reuters"), "Apple beats estimates on iPhone demand");
});

await check("news merge dedupes near-identical titles and drops old ones", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  const m = mergeNews([
    [{ title: "Nvidia soars on record revenue", at: now - 3600e3 }],
    [{ title: "Nvidia Soars on Record Revenue!", at: now - 7200e3 }, { title: "Old story", at: now - 60 * 86400e3 }],
  ], now);
  eq(m.length, 1);
});

// ---------------------------------------------------------------- sentiment

await check("finance phrases score the right way", () => {
  ok(scoreHeadline("Microsoft beats estimates and raises guidance").score > 0.5);
  ok(scoreHeadline("Intel cuts guidance, shares plunge").score < -0.5);
  ok(scoreHeadline("Analyst downgrades Tesla to underperform").score < 0);
  ok(scoreHeadline("Company schedules annual meeting").score === 0);
});

await check("negation flips a word", () => {
  ok(scoreHeadline("Retailer fails to beat holiday forecasts").score < 0);
});

await check("aggregate weights recent news and shrinks thin coverage", () => {
  const now = Date.now();
  const fresh = aggregate([{ title: "Stock surges on upgrade", at: now }], now);
  const many = aggregate(Array.from({ length: 20 }, (_, i) => ({ title: `Stock surges on upgrade ${i}`, at: now })), now);
  ok(many.score > fresh.score, "more agreeing headlines should count for more");
  ok(newsProbability(many) > 0.5 && newsProbability(many) <= 0.62);
});

// ---------------------------------------------------------------- SEC reports

function fact(start, end, val, form = "10-Q", filed) {
  return { start, end, val, form, filed: filed || end };
}
const FACTS = {
  "us-gaap": {
    Revenues: { units: { USD: [
      fact("2024-01-01", "2024-03-31", 100), fact("2024-04-01", "2024-06-30", 110), fact("2024-07-01", "2024-09-30", 120),
      fact("2024-01-01", "2024-12-31", 460, "10-K"),
      fact("2025-01-01", "2025-03-31", 120), fact("2025-04-01", "2025-06-30", 132),
    ] } },
    NetIncomeLoss: { units: { USD: [fact("2024-04-01", "2024-06-30", 11), fact("2025-04-01", "2025-06-30", 20)] } },
    OperatingIncomeLoss: { units: { USD: [fact("2025-04-01", "2025-06-30", 33)] } },
    EarningsPerShareDiluted: { units: { "USD/shares": [
      fact("2024-07-01", "2024-09-30", 1), fact("2024-01-01", "2024-03-31", 1), fact("2024-04-01", "2024-06-30", 1),
      fact("2024-01-01", "2024-12-31", 4.5, "10-K"), fact("2025-01-01", "2025-03-31", 1.2), fact("2025-04-01", "2025-06-30", 1.3),
    ] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [fact("2024-01-01", "2024-12-31", 100, "10-K")] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fact("2024-01-01", "2024-12-31", 30, "10-K")] } },
    Liabilities: { units: { USD: [{ end: "2025-06-30", val: 200, form: "10-Q", filed: "2025-07-30" }] } },
    StockholdersEquity: { units: { USD: [{ end: "2025-06-30", val: 100, form: "10-Q", filed: "2025-07-30" }] } },
  },
};

await check("Q4 is derived as annual minus three quarters", () => {
  const q = quarterly(FACTS, "revenue");
  const q4 = q.find((x) => x.end === "2024-12-31");
  ok(q4 && q4.derived, "Q4 missing"); eq(q4.val, 130);
});

await check("measures: growth, margins, TTM EPS, P/E, FCF, leverage", () => {
  const m = measures(FACTS, 50);
  near(m.revenueGrowth, 0.2, 1e-9, "revenue growth");
  near(m.netIncomeGrowth, 9 / 11, 1e-9, "net income growth");
  near(m.opMargin, 0.25, 1e-9, "op margin");
  near(m.epsTTM, 1 + 1.5 + 1.2 + 1.3, 1e-9, "TTM EPS");
  near(m.pe, 50 / 5, 1e-9, "P/E");
  near(m.fcfMargin, 70 / 460, 1e-9, "FCF margin");
  eq(m.debtToEquity, 2);
});

await check("peer ranks put the better report on top", () => {
  const good = { revenueGrowth: 0.3, opMargin: 0.3, fcfMargin: 0.25, debtToEquity: 0.5, epsTTM: 5, pe: 20 };
  const mid = { revenueGrowth: 0.1, opMargin: 0.15, fcfMargin: 0.1, debtToEquity: 1.5, epsTTM: 2, pe: 25 };
  const bad = { revenueGrowth: -0.1, opMargin: -0.05, fcfMargin: -0.1, debtToEquity: 4, epsTTM: -1, pe: null };
  const r = peerRanks({ G: good, M: mid, B: bad });
  ok(r.G > r.M && r.M > r.B, JSON.stringify(r));
  ok(fundamentalsProbability(good, r.G) > 0.55 && fundamentalsProbability(bad, r.B) < 0.45);
});

// ---------------------------------------------------------------- model

await check("logistic regression learns a planted signal", () => {
  const X = [], y = [];
  for (let i = 0; i < 2000; i++) {
    const a = gauss(), b = gauss();
    X.push([a, b]);
    y.push(rnd() < 1 / (1 + Math.exp(-1.5 * a)) ? 1 : 0);
  }
  const m = train(X, y);
  ok(m.w[0] > 0.8 && Math.abs(m.w[1]) < 0.2, `weights ${m.w}`);
  const p = X.map((x) => m.predict(x));
  ok(auc(p, y) > 0.7);
});

await check("AUC is 1 for a perfect ranking and 0.5 for none", () => {
  eq(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
  eq(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]), 0.5);
});

function synthPrices(n, drift, vol, start = "2016-01-04") {
  const rows = [];
  let p = 100;
  let d = new Date(start + "T00:00:00Z");
  for (let i = 0; i < n; i++) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400e3);
    p *= Math.exp(drift + vol * gauss());
    rows.push({ date: d.toISOString().slice(0, 10), close: p, volume: 1e6 });
    d = new Date(d.getTime() + 86400e3);
  }
  return rows;
}

await check("Monte Carlo: a steady riser is more likely up than a faller", () => {
  const up = featureSeries(synthPrices(900, 0.0012, 0.01), null);
  const dn = featureSeries(synthPrices(900, -0.0012, 0.01), null);
  const a = monteCarlo(up.logReturns, 63, { seedKey: "U" });
  const b = monteCarlo(dn.logReturns, 63, { seedKey: "D" });
  ok(a.pUp > 0.7 && b.pUp < 0.5, `${a.pUp} vs ${b.pUp}`);
  ok(a.p10 < a.p50 && a.p50 < a.p90);
});

await check("walk-forward never trains on its own test period", () => {
  const fs = featureSeries(synthPrices(2000, 0.0003, 0.015), null);
  const rows = samples("X", fs, 63, null);
  const wf = walkForward(rows, "y", 63);
  ok(wf, "no result");
  ok(Date.parse(wf.trainedThrough) < Date.parse(wf.testedFrom) - 63 * 86400e3, `${wf.trainedThrough} vs ${wf.testedFrom}`);
});

// ---------------------------------------------------------------- quantum fusion

await check("agreeing sources reinforce; fidelity is 1 when they're identical", () => {
  const r = fuse([
    { id: "a", p: 0.7, weight: 1, confidence: 1 },
    { id: "b", p: 0.7, weight: 1, confidence: 1 },
  ]);
  near(r.p, 0.7, 1e-9); near(r.fidelity, 1, 1e-9); eq(r.consensus, 1);
});

await check("disagreeing sources lower fidelity and land between them", () => {
  const r = fuse([
    { id: "a", p: 0.9, weight: 1, confidence: 1 },
    { id: "b", p: 0.1, weight: 1, confidence: 1 },
  ]);
  near(r.p, 0.5, 1e-9); ok(r.fidelity < 0.8, `fidelity ${r.fidelity}`);
});

await check("low confidence decoheres toward 50%", () => {
  const sure = fuse([{ id: "a", p: 0.8, weight: 1, confidence: 1 }]);
  const unsure = fuse([{ id: "a", p: 0.8, weight: 1, confidence: 0.3 }]);
  ok(unsure.p < sure.p && unsure.p > 0.5);
});

await check("missing sources are skipped and reduce confidence", () => {
  const r = fuse([
    { id: "a", p: 0.65, weight: 1, confidence: 1 },
    { id: "b", p: null, weight: 1, confidence: 1 },
  ]);
  near(r.confidence, 0.5, 1e-9); ok(r.p > 0.5 && r.p < 0.65);
});

await check("the band brackets the answer", () => {
  const r = fuse([
    { id: "a", p: 0.62, weight: 1, confidence: 0.8 },
    { id: "b", p: 0.48, weight: 1, confidence: 0.8 },
    { id: "c", p: 0.58, weight: 1, confidence: 0.8 },
  ]);
  ok(r.band[0] <= r.p && r.p <= r.band[1]);
});

// ---------------------------------------------------------------- allocation

await check("allocation: caps, index remainder, nothing when there's no edge", () => {
  const mk = (symbol, p) => ({ symbol, name: symbol, quantum: { p }, montecarlo: { p50: 0.02, annualVol: 0.25 } });
  const a = allocate([mk("A", 0.7), mk("B", 0.6), mk("C", 0.45)], 10000, 63);
  eq(a.picks.length, 2);
  ok(a.picks.every((p) => p.share <= 0.25 + 1e-9));
  near(a.picks.reduce((s, p) => s + p.share, 0) + a.indexShare, 1, 1e-9, "shares sum");
  eq(allocate([mk("C", 0.45)], 10000, 63).picks.length, 0);
  eq(verdict(0.65).key, "strong"); eq(verdict(0.5).key, "neutral"); eq(verdict(0.3).key, "avoid");
});

// ---------------------------------------------------------------- end to end, offline

function seedCache(key, data) {
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, key.replace(/[^a-z0-9._-]+/gi, "_") + ".json"), JSON.stringify({ at: Date.now(), data }));
}

await check("a full analysis runs on synthetic data, offline", async () => {
  const now = Date.now();
  const syms = { AAA: 0.0008, BBB: 0.0002, CCC: -0.0004, SPY: 0.0003 };
  for (const [s, drift] of Object.entries(syms)) {
    seedCache(`prices-${s}`, { name: `${s} Corp`, currency: "USD", rows: synthPrices(2200, drift, 0.015), source: "fixture" });
  }
  seedCache("news-AAA", [{ title: "AAA beats estimates and raises guidance", at: now - 86400e3, url: "", source: "x" }]);
  seedCache("news-BBB", [{ title: "BBB schedules investor day", at: now - 86400e3, url: "", source: "x" }]);
  seedCache("news-CCC", [{ title: "CCC cuts guidance, shares plunge", at: now - 86400e3, url: "", source: "x" }]);
  seedCache("news-market", [{ title: "Stocks rally to record high", at: now - 86400e3, url: "", source: "x" }]);
  seedCache("sec-tickers", { AAA: { cik: 1, title: "AAA Corp" } });
  seedCache("sec-facts-0000000001", { name: "AAA Corp", facts: FACTS });

  const lines = [];
  const r = await analyze({ symbols: ["AAA", "BBB", "CCC"], horizon: 63, budget: 10000 }, (l) => lines.push(l));
  eq(r.stocks.length, 3);
  ok(r.model.walkForward, "walk-forward missing");
  for (const s of r.stocks) {
    ok(s.quantum.p > 0 && s.quantum.p < 1, `${s.symbol} p=${s.quantum.p}`);
    ok(s.montecarlo && s.spark.length > 10);
  }
  const aaa = r.stocks.find((s) => s.symbol === "AAA");
  ok(aaa.fundamentals && aaa.fundamentals.revenueGrowth > 0, "AAA should have its report read");
  ok(r.stocks.find((s) => s.symbol === "CCC").fundamentals === null, "CCC has no filings");
  ok(aaa.news.score > 0 && r.stocks.find((s) => s.symbol === "CCC").news.score < 0);
  ok(lines.some((l) => /Done/.test(l)));
  ok(JSON.stringify(r).length > 1000);
});

rmSync(CACHE, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed:\n`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`market selftest: ${passed} passed`);
