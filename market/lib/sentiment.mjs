/* ================================================
   MARKET LENS — lib/sentiment.mjs
   What the recent news is saying, in a number.

   A finance-specific word list, because general-purpose sentiment gets
   markets wrong: "beats" is good, "cut" is usually bad, "volatile" isn't
   about emotion. Phrases are checked before single words so "cuts
   guidance" counts once, as itself. A negator just before a word flips
   it ("fails to beat", "no growth").

   Each headline gets a score in -1..1. The overall score weights recent
   headlines more (half-life of a week) and is held back toward zero when
   there are only a few headlines.
   ================================================ */

const PHRASES = {
  "raises guidance": 2.5, "raised guidance": 2.5, "boosts guidance": 2.5, "lifts outlook": 2.5,
  "raises outlook": 2.5, "beats estimates": 2.5, "tops estimates": 2.5, "beat expectations": 2.5,
  "beats expectations": 2.5, "record revenue": 2, "record quarter": 2, "price target raised": 2,
  "raises price target": 2, "share buyback": 1.5, "stock buyback": 1.5, "dividend increase": 1.5,
  "raises dividend": 1.5, "all-time high": 1.5, "record high": 1.5, "strong demand": 1.5,
  "fda approval": 2, "wins contract": 2, "rate cut": 1, "rate cuts": 1, "soft landing": 1.5,
  "cuts guidance": -2.5, "cut guidance": -2.5, "lowers guidance": -2.5, "slashes guidance": -3,
  "lowers outlook": -2.5, "cuts outlook": -2.5, "misses estimates": -2.5, "missed estimates": -2.5,
  "misses expectations": -2.5, "below expectations": -2, "price target cut": -2,
  "lowers price target": -2, "profit warning": -2.5, "going concern": -3, "chapter 11": -3,
  "class action": -1.5, "sec investigation": -2, "doj probe": -2, "rate hike": -1, "rate hikes": -1,
  "job cuts": -1.5, "trade war": -1.5, "government shutdown": -1, "hard landing": -1.5,
  "short seller": -1.5, "52-week low": -1.5,
};

const WORDS = {
  beat: 1.5, beats: 1.5, tops: 1.2, exceeds: 1.5, surge: 1.5, surges: 1.5, soar: 1.5, soars: 1.5,
  jump: 1, jumps: 1, rally: 1, rallies: 1, gain: 0.8, gains: 0.8, rise: 0.6, rises: 0.6, climbs: 0.8,
  rebound: 1, rebounds: 1, record: 0.8, upgrade: 1.8, upgrades: 1.8, upgraded: 1.8, outperform: 1.5,
  overweight: 1.2, bullish: 1.5, buy: 0.6, strong: 0.8, stronger: 0.8, robust: 1, growth: 0.6,
  profit: 0.5, profitable: 1, expands: 0.8, expansion: 0.6, approval: 1.2, approved: 1.2,
  partnership: 0.8, wins: 1, breakthrough: 1.2, accelerates: 1, optimistic: 1, upbeat: 1.2,
  dividend: 0.4, buyback: 1.2, momentum: 0.5, boom: 1, booming: 1, resilient: 0.8, recovery: 0.8,
  miss: -1.5, misses: -1.5, missed: -1.5, plunge: -2, plunges: -2, plummets: -2, tumble: -1.5,
  tumbles: -1.5, sink: -1.2, sinks: -1.2, slump: -1.5, slumps: -1.5, drop: -1, drops: -1, fall: -0.8,
  falls: -0.8, slides: -1, decline: -0.8, declines: -0.8, downgrade: -1.8, downgrades: -1.8,
  downgraded: -1.8, underperform: -1.5, underweight: -1.2, bearish: -1.5, sell: -0.6, weak: -1,
  weaker: -1, weakness: -1, loss: -0.8, losses: -1, lawsuit: -1.2, sues: -1, sued: -1, probe: -1.2,
  investigation: -1.2, recall: -1.2, layoffs: -1, fraud: -2.5, bankruptcy: -3, default: -2,
  delay: -0.8, delays: -0.8, delayed: -0.8, antitrust: -1, fine: -0.6, fined: -1.2, halt: -1.2,
  halts: -1.2, crash: -2, slowdown: -1.2, recession: -1.5, tariff: -0.8, tariffs: -0.8,
  warns: -1.5, warning: -1.2, concern: -0.6, concerns: -0.6, fears: -1, risk: -0.4, volatile: -0.4,
  selloff: -1.5, "sell-off": -1.5, inflation: -0.5, cuts: -0.6, struggles: -1.2, disappointing: -1.5,
  disappoints: -1.5, breach: -1.5, hack: -1.2, outage: -1, shortage: -0.8,
};

const NEGATORS = new Set(["not", "no", "never", "fails", "failed", "fail", "without", "despite", "hardly", "isn't", "wasn't", "won't", "didn't", "doesn't"]);

const tokenize = (s) => s.toLowerCase().replace(/[“”"’']/g, "'").match(/[a-z0-9][a-z0-9'&.-]*/g) || [];

export function scoreHeadline(text) {
  let s = ` ${String(text || "").toLowerCase()} `;
  let total = 0;
  const hits = [];
  for (const [p, v] of Object.entries(PHRASES)) {
    if (s.includes(` ${p} `) || s.includes(` ${p},`) || s.includes(` ${p}:`)) {
      total += v;
      hits.push(p);
      s = s.split(p).join(" ");
    }
  }
  const toks = tokenize(s);
  toks.forEach((w, i) => {
    const v = WORDS[w];
    if (v == null) return;
    const negated = toks.slice(Math.max(0, i - 3), i).some((x) => NEGATORS.has(x));
    total += negated ? -0.7 * v : v;
    hits.push(negated ? `not ${w}` : w);
  });
  return { score: Math.tanh(total / 2.5), hits };
}

const HALF_LIFE_DAYS = 7;

/* items: [{ title, at }] -> { score -1..1, n, positive, negative, items }
   `score` is already shrunk toward 0 for thin coverage. */
export function aggregate(items, now = Date.now()) {
  const scored = items.map((it) => ({ ...it, ...scoreHeadline(it.title) }));
  let wsum = 0, ssum = 0;
  for (const it of scored) {
    const age = Math.max(0, (now - it.at) / 86400e3);
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS) * (it.hits.length ? 1 : 0.35);
    wsum += w;
    ssum += w * it.score;
  }
  const raw = wsum ? ssum / wsum : 0;
  const coverage = Math.min(1, scored.length / 15);
  // Volume in the last week vs the month's daily average: a news spike.
  const lastWeek = scored.filter((x) => now - x.at < 7 * 86400e3).length;
  return {
    score: raw * (0.4 + 0.6 * coverage),
    raw,
    n: scored.length,
    lastWeek,
    positive: scored.filter((x) => x.score > 0.15).length,
    negative: scored.filter((x) => x.score < -0.15).length,
    coverage,
    items: scored,
  };
}

/* Headlines have real but short-lived, small effects on prices over
   months, so news on its own can only move the needle a little. */
export function newsProbability(agg) {
  return 0.5 + 0.12 * agg.score;
}
