#!/usr/bin/env node
/* ================================================
   MARKET LENS — cli.mjs
   The same analysis, printed in the terminal.

     node market/cli.mjs                      the watchlist
     node market/cli.mjs AAPL MSFT NVDA       just these
       --horizon 126                          trading days ahead (63 ≈ 3 months)
       --budget 5000                          for the illustrative split
       --json                                 the full report as JSON
   ================================================ */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { analyze } from "./lib/analyze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const horizon = opt("--horizon");
const budget = opt("--budget");
const asJSON = args.includes("--json");
const symbols = args.filter((a) => !a.startsWith("--"));

const wl = JSON.parse(readFileSync(join(HERE, "data", "watchlist.json"), "utf8"));
const names = Object.fromEntries(wl.symbols.map((s) => [s.symbol, s.name]));

const pct = (x, d = 1) => (x == null ? "  —  " : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

const report = await analyze(
  {
    symbols: symbols.length ? symbols : wl.symbols.map((s) => s.symbol),
    horizon: horizon || wl.horizonDays,
    budget: budget || wl.budget,
    names,
  },
  asJSON ? () => {} : (line) => console.error(line)
);

if (asJSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const wf = report.model.walkForward;
console.log(`\nMARKET LENS — ${report.horizonLabel} ahead (${report.horizonDays} trading days) — ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC`);
if (report.market) console.log(`Market mood: ${report.market.score >= 0 ? "+" : ""}${report.market.score.toFixed(2)} from ${report.market.n} headlines`);
if (wf) {
  console.log(`Model check on unseen data: ${(wf.accuracy * 100).toFixed(1)}% right vs ${(wf.baseRateAccuracy * 100).toFixed(1)}% for always guessing the usual answer; AUC ${wf.auc.toFixed(3)}`);
}
console.log("");
console.log(`${pad("#", 3)}${pad("Symbol", 8)}${pad("Name", 22)}${lpad("P(up)", 7)}${lpad("range", 15)}${lpad("median", 9)}${lpad("P(>SPY)", 9)}  ${pad("Verdict", 16)}`);
console.log("-".repeat(92));
report.stocks.forEach((s, i) => {
  const q = s.quantum;
  const mc = s.montecarlo || {};
  console.log(
    `${pad(i + 1, 3)}${pad(s.symbol, 8)}${pad(s.name.slice(0, 20), 22)}${lpad((q.p * 100).toFixed(1) + "%", 7)}` +
    `${lpad(`${(q.band[0] * 100).toFixed(0)}–${(q.band[1] * 100).toFixed(0)}%`, 15)}${lpad(pct(mc.p50), 9)}` +
    `${lpad(s.model.pBeatMarket == null ? "—" : (s.model.pBeatMarket * 100).toFixed(0) + "%", 9)}  ${pad(s.verdict.text, 16)}`
  );
});

const a = report.allocation;
console.log(`\nIllustrative split of $${a.budget.toLocaleString()}:`);
for (const p of a.picks) console.log(`  ${pad(p.symbol, 8)} ${lpad((p.share * 100).toFixed(1) + "%", 6)}  $${p.amount.toLocaleString()}`);
console.log(`  ${pad("SPY/VOO", 8)} ${lpad((a.indexShare * 100).toFixed(1) + "%", 6)}  $${Math.round(a.budget * a.indexShare).toLocaleString()}  (broad index)`);
console.log(`  ${a.note}`);

if (report.errors.length) {
  console.log("\nCouldn't get everything:");
  for (const e of report.errors) console.log(`  ${e.symbol} ${e.what}: ${e.why}`);
}
console.log("\nThis is a statistical estimate, not financial advice. Prices can fall as well as rise.\n");
