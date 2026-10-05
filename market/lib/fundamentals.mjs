/* ================================================
   MARKET LENS — lib/fundamentals.mjs
   Reading the companies' own reports.

   SEC EDGAR publishes every number a company tags in its 10-Q and 10-K
   filings. This turns that into a handful of plain measures — is revenue
   growing, is the business profitable, does it turn profit into cash,
   how much does it owe, what are you paying for the earnings — and then
   compares each company against the others you asked about.

   Two things to know about the raw facts:
   - A 10-Q's cash-flow statement is year-to-date, not quarterly, so cash
     flow is read from the annual (10-K) figures only.
   - There is rarely a tagged "Q4". It's derived as the annual figure
     minus the three quarters inside it.
   ================================================ */

export const CONCEPTS = {
  revenue: {
    names: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
    ],
    unit: "USD",
  },
  netIncome: { names: ["NetIncomeLoss", "ProfitLoss"], unit: "USD" },
  opIncome: { names: ["OperatingIncomeLoss"], unit: "USD" },
  eps: { names: ["EarningsPerShareDiluted", "EarningsPerShareBasic"], unit: "USD/shares" },
  cfo: { names: ["NetCashProvidedByUsedInOperatingActivities"], unit: "USD" },
  capex: { names: ["PaymentsToAcquirePropertyPlantAndEquipment"], unit: "USD" },
  liabilities: { names: ["Liabilities"], unit: "USD" },
  equity: {
    names: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    unit: "USD",
  },
};

const DAY = 86400e3;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

/* Every entry for a concept, across the alternative names a company may
   have used over the years. Where the same period was reported more than
   once (it's repeated as a comparative the following year), the most
   recently filed figure wins — that's the restated one. */
function entries(facts, key) {
  const def = CONCEPTS[key];
  const gaap = (facts && facts["us-gaap"]) || {};
  const byPeriod = new Map();
  for (const name of def.names) {
    const units = gaap[name] && gaap[name].units && gaap[name].units[def.unit];
    if (!units) continue;
    for (const u of units) {
      if (!/^10-[QK]/.test(u.form || "") || !Number.isFinite(u.val)) continue;
      const k = `${u.start || ""}|${u.end}`;
      const prev = byPeriod.get(k);
      if (!prev || (u.filed || "") > (prev.filed || "")) byPeriod.set(k, { ...u, concept: name });
    }
  }
  return [...byPeriod.values()];
}

export function quarterly(facts, key) {
  const all = entries(facts, key).filter((e) => e.start);
  const q = new Map();
  for (const e of all) {
    const d = days(e.start, e.end);
    if (d >= 80 && d <= 100) q.set(e.end, { end: e.end, val: e.val, filed: e.filed, form: e.form, start: e.start });
  }
  for (const a of all) {
    const d = days(a.start, a.end);
    if (d < 350 || d > 380 || q.has(a.end)) continue;
    const inside = [...q.values()].filter((x) => days(a.start, x.start) >= -5 && days(x.end, a.end) > 20);
    if (inside.length === 3) {
      q.set(a.end, {
        end: a.end,
        val: a.val - inside.reduce((s, x) => s + x.val, 0),
        filed: a.filed, form: a.form, derived: true,
      });
    }
  }
  return [...q.values()].sort((x, y) => (x.end < y.end ? -1 : 1));
}

export function annual(facts, key) {
  const by = new Map();
  for (const e of entries(facts, key)) {
    if (!e.start) continue;
    const d = days(e.start, e.end);
    if (d >= 350 && d <= 380) by.set(e.end, { end: e.end, val: e.val, filed: e.filed });
  }
  return [...by.values()].sort((x, y) => (x.end < y.end ? -1 : 1));
}

function latestInstant(facts, key) {
  const list = entries(facts, key).filter((e) => !e.start).sort((x, y) => (x.end < y.end ? -1 : 1));
  return list.length ? list[list.length - 1] : null;
}

function yearAgo(series, end) {
  return series.find((x) => Math.abs(days(x.end, end) - 365) <= 20) || null;
}

const growth = (now, then) => (then && then.val ? (now.val - then.val) / Math.abs(then.val) : null);

/* Plain measures for one company. Any of them can be null — a bank has no
   "revenue" in the usual sense, a young company no year-ago quarter. */
export function measures(facts, price) {
  const rev = quarterly(facts, "revenue");
  if (rev.length < 2) return null;
  const last = rev[rev.length - 1];
  const prevQ = rev[rev.length - 2];

  const revenueGrowth = growth(last, yearAgo(rev, last.end));
  const prevGrowth = growth(prevQ, yearAgo(rev, prevQ.end));

  const ni = quarterly(facts, "netIncome");
  const niLast = ni.find((x) => x.end === last.end);
  const netIncomeGrowth = niLast ? growth(niLast, yearAgo(ni, niLast.end)) : null;

  const op = quarterly(facts, "opIncome").find((x) => x.end === last.end);
  const opMargin = op && last.val ? op.val / last.val : null;
  const netMargin = niLast && last.val ? niLast.val / last.val : null;

  // Trailing-twelve-month EPS: four consecutive quarters ending with the latest.
  const eps = quarterly(facts, "eps");
  let epsTTM = null;
  if (eps.length >= 4) {
    const four = eps.slice(-4);
    if (days(four[0].end, four[3].end) <= 300 && days(four[3].end, last.end) <= 100) {
      epsTTM = four.reduce((s, x) => s + x.val, 0);
    }
  }
  const pe = epsTTM > 0 && price > 0 ? price / epsTTM : null;

  const revA = annual(facts, "revenue");
  const cfoA = annual(facts, "cfo");
  const capA = annual(facts, "capex");
  let fcfMargin = null;
  if (cfoA.length && revA.length) {
    const c = cfoA[cfoA.length - 1];
    const r = revA.find((x) => x.end === c.end);
    const k = capA.find((x) => x.end === c.end);
    if (r && r.val) fcfMargin = (c.val - (k ? k.val : 0)) / r.val;
  }

  const liab = latestInstant(facts, "liabilities");
  const eq = latestInstant(facts, "equity");
  const debtToEquity = liab && eq && eq.val > 0 ? liab.val / eq.val : null;

  return {
    period: last.end,
    filed: last.filed,
    form: last.form,
    revenue: last.val,
    revenueGrowth,
    growthAccel: revenueGrowth != null && prevGrowth != null ? revenueGrowth - prevGrowth : null,
    netIncomeGrowth,
    opMargin,
    netMargin,
    fcfMargin,
    debtToEquity,
    epsTTM,
    pe,
  };
}

const t = Math.tanh;

/* How healthy the latest report looks on its own terms, -1..1. */
export function absoluteScore(m) {
  const parts = [];
  if (m.revenueGrowth != null) parts.push(t(m.revenueGrowth / 0.15));
  if (m.growthAccel != null) parts.push(0.5 * t(m.growthAccel / 0.05));
  if (m.opMargin != null) parts.push(t(m.opMargin / 0.2));
  if (m.fcfMargin != null) parts.push(t(m.fcfMargin / 0.15));
  if (m.debtToEquity != null) parts.push(-t((m.debtToEquity - 1.5) / 2));
  if (m.epsTTM != null) parts.push(m.pe ? t((1 / m.pe - 0.04) / 0.03) : -0.6);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

const HIGHER_IS_BETTER = {
  revenueGrowth: 1, growthAccel: 1, opMargin: 1, fcfMargin: 1, netIncomeGrowth: 0.5,
  debtToEquity: -1, earningsYield: 1,
};

/* Compare everyone's reports against each other: for each measure, where
   does this company rank among the ones analysed (0 worst … 1 best)? */
export function peerRanks(bySymbol) {
  const syms = Object.keys(bySymbol).filter((s) => bySymbol[s]);
  const out = {};
  for (const s of syms) out[s] = { sum: 0, w: 0 };
  for (const [k, dir] of Object.entries(HIGHER_IS_BETTER)) {
    const vals = syms
      .map((s) => {
        const m = bySymbol[s];
        const v = k === "earningsYield" ? (m.epsTTM == null ? null : m.pe ? 1 / m.pe : -1) : m[k];
        return v == null || !Number.isFinite(v) ? null : { s, v: v * Math.sign(dir) };
      })
      .filter(Boolean)
      .sort((a, b) => a.v - b.v);
    if (vals.length < 3) continue;
    vals.forEach((x, i) => {
      out[x.s].sum += Math.abs(dir) * (i / (vals.length - 1));
      out[x.s].w += Math.abs(dir);
    });
  }
  const ranks = {};
  for (const s of syms) ranks[s] = out[s].w ? out[s].sum / out[s].w : null;
  return ranks;
}

/* Reports move prices over months, but weakly and with plenty of
   exceptions — so the most this can say is a few points either side of
   a coin flip. */
export function fundamentalsProbability(m, peerRank) {
  const abs = absoluteScore(m);
  if (abs == null) return null;
  const s = peerRank == null ? abs : 0.5 * abs + 0.5 * (2 * peerRank - 1);
  return 0.5 + 0.1 * s;
}
