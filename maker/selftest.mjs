#!/usr/bin/env node
/* ================================================
   QUOTE SHELL — selftest.mjs
   The parts that can be checked without a browser.

     node maker/selftest.mjs

   util.js, market.js and maker.js are plain scripts that hang
   themselves off a global, so this runs them in a sandbox with just
   enough `window` to satisfy them and then exercises the reasoning.

   Three of these matter more than the rest, because they are the ones
   that catch a terminal quietly lying about a strategy:

     · the book is calibrated — a leg quoted at 70¢ wins about 70% of
       the time, so the prices on screen mean what they say;
     · the fair price is a martingale — holding inventory is worth
       nothing in expectation, so no P&L can come from the world model
       drifting somewhere convenient;
     · the null: with its edge set to zero the bot makes zero. Every
       version of this file that failed that test had a bug in it, and
       the last one looked like a very good trading strategy.

   charts.js, shell.js, ui.js and app.js are left out — they need a
   DOM, and what they do is draw what the two modules below decide.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---- a browser, for a very small value of "browser" ---------------- */
function load() {
  const ctx = createContext({
    window: {}, console, Math, Date, JSON, Intl, Number, String, Array,
    Float64Array, isNaN,
  });
  for (const f of ["util", "market", "maker"]) {
    runInContext(readFileSync(join(HERE, "js", `${f}.js`), "utf8"), ctx,
                 { filename: `maker/js/${f}.js` });
  }
  return ctx.window.MK;
}
const MK = load();
const T0 = Date.parse("2026-09-20T09:00:00Z");

/* ---- the smallest test harness that is still readable -------------- */
let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(".");
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
    process.stdout.write("x");
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "not equal"}: ${a} !== ${b}`);
}
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) {
    throw new Error(`${msg || "not close"}: ${a} vs ${b} (tolerance ${tol})`);
  }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected true"); }

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const stderr = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)) / a.length);
};

/* A session: a world, a bot, and `hours` of markets already behind it. */
function session(seed, hours, worldOpts, makerOpts) {
  const world = MK.market.createWorld({ seed, spot: 76297, now: T0, ...worldOpts });
  world.warmStart(40);
  const maker = MK.maker.createMaker(world, { seed: seed + 1013, ...makerOpts });
  if (hours) maker.warmStart(hours);
  return { world, maker };
}

/* ================================================================
   1 — util
   ================================================================ */
check("normCdf is a distribution", () => {
  const { normCdf } = MK.util;
  near(normCdf(0), 0.5, 1e-9, "median");
  near(normCdf(1.644854), 0.95, 1e-4, "95th percentile");
  near(normCdf(-1.959964), 0.025, 1e-4, "2.5th percentile");
  near(normCdf(3) + normCdf(-3), 1, 1e-6, "symmetry");
  ok(normCdf(-40) >= 0 && normCdf(40) <= 1, "stays inside [0,1]");
});

check("seeded rng repeats and is unbiased", () => {
  const a = MK.util.rng(99), b = MK.util.rng(99);
  for (let i = 0; i < 50; i++) eq(a(), b(), "same seed, same stream");
  const g = MK.util.rng(7);
  let s = 0, s2 = 0;
  const n = 200000;
  for (let i = 0; i < n; i++) { const x = g.gauss(); s += x; s2 += x * x; }
  near(s / n, 0, 0.01, "gaussian mean");
  near(s2 / n, 1, 0.02, "gaussian variance");
});

check("ring buffer keeps the newest and stays capped", () => {
  const r = MK.util.ring(4);
  for (let i = 0; i < 10; i++) r.push(i);
  eq(r.length, 4, "cap");
  eq(r.last(), 9, "newest");
  eq(r.items[0], 6, "oldest kept");
  eq(r.last(2).join(","), "8,9", "tail slice");
});

check("money and price formatting", () => {
  const u = MK.util;
  eq(u.money(1234.5, 2), "$1,234.50");
  eq(u.money(-20, 0), "-$20");
  eq(u.moneyShort(170000), "$170K");
  eq(u.signedMoney(5, 0), "+$5");
  eq(u.cents(0.524), "52¢");
  eq(u.mmss(113000), "1:53");
  eq(u.px(0.5), "0.500");
});

/* ================================================================
   2 — the world
   ================================================================ */
check("fair price responds the right way round", () => {
  const f = MK.market.fairUp;
  near(f(100, 100, 150000, 0.5), 0.5, 1e-6, "at the strike it is a coin flip");
  ok(f(101, 100, 150000, 0.5) > 0.5, "above the strike is worth more");
  ok(f(99, 100, 150000, 0.5) < 0.5, "below the strike is worth less");
  /* The same distance from the strike is worth more the less time
     there is left for the price to come back. */
  ok(f(100.02, 100, 30000, 0.5) > f(100.02, 100, 280000, 0.5), "time decay");
  ok(f(99.98, 100, 30000, 0.5) < f(99.98, 100, 280000, 0.5), "and the other way below");
  ok(f(100.5, 100, 1, 0.5) > 0.99, "at the bell it is decided");
});

check("windows are aligned, resolve once, and settle on the close", () => {
  const { world } = session(4242, 0);
  const W = MK.market.WINDOW_MS;
  eq(world.state.windowStart % W, 0, "aligned to a five-minute boundary");
  let resolved = 0, seen = null;
  for (let i = 0; i < 2000; i++) {
    const ev = world.advance(1000);
    if (ev.resolved) {
      resolved++;
      const r = ev.resolved;
      eq(r.winner, r.closeSpot > r.openSpot ? "UP" : "DOWN", "winner matches the close");
      ok(seen === null || r.index === seen + 1, "indices run in order");
      seen = r.index;
      eq(r.end - r.start, W, "five minutes long");
    }
  }
  near(resolved, Math.floor(2000 / 300), 1, "one resolution per window");
});

check("the book is two-sided and adds up to a dollar", () => {
  const { world } = session(77, 0);
  for (let i = 0; i < 1200; i++) {
    world.advance(1000);
    const b = world.book;
    ok(b.upBid < b.upAsk, "up is a real spread");
    ok(b.downBid < b.downAsk, "down is a real spread");
    /* Buying both legs on the offer always costs more than a dollar,
       and selling both on the bid always raises less — otherwise
       there would be an arbitrage sitting in the book. */
    ok(b.upAsk + b.downAsk > 1, "no free complete set on the offer");
    ok(b.upBid + b.downBid < 1, "no free money selling both bids");
  }
});

check("bitcoin has no drift and UP wins half the time", () => {
  const { world } = session(2718, 0);
  const rets = [];
  for (let i = 0; i < 66000; i++) {
    const ev = world.advance(1000);
    if (ev.resolved) rets.push(Math.log(ev.resolved.closeSpot / ev.resolved.openSpot));
  }
  ok(rets.length > 200, "enough windows to say anything");
  const se = stderr(rets);
  near(mean(rets) / se, 0, 3, "mean log return is within 3 standard errors of zero");
  const up = rets.filter((r) => r > 0).length / rets.length;
  near(up, 0.5, 0.06, "UP wins about half");
});

check("the book is calibrated: a 70¢ leg wins about 70% of the time", () => {
  const { world } = session(424242, 0);
  const bucket = new Map();
  let live = [];
  for (let i = 0; i < 108000; i++) {
    const ev = world.advance(1000);
    live.push(Math.min(9, Math.floor(world.book.fairUp * 10)));
    if (ev.resolved) {
      for (const k of live) {
        const r = bucket.get(k) || { n: 0, win: 0 };
        r.n++;
        if (ev.resolved.winner === "UP") r.win++;
        bucket.set(k, r);
      }
      live = [];
    }
  }
  for (const [k, r] of bucket) {
    if (r.n < 500) continue;
    const priced = k * 0.1 + 0.05;
    near(r.win / r.n, priced, 0.08,
         `legs priced ${k * 10}-${k * 10 + 10}¢ should win about ${(priced * 100) | 0}%`);
  }
});

/* ================================================================
   3 — the bot's book-keeping
   ================================================================ */
check("pairing matches FIFO and prices the set at the sum of its legs", () => {
  const { world, maker } = session(31337, 0);
  const m = maker.state;
  m.upQ.push({ px: 0.40, qty: 100, t: 0 }, { px: 0.44, qty: 50, t: 1 });
  m.downQ.push({ px: 0.55, qty: 120, t: 2 });
  maker.pairInventory(3);
  eq(m.sets.length, 2, "two matches: 100 against the first lot, 20 against the second");
  eq(m.sets[0].qty, 100);
  near(m.sets[0].cost, 0.95, 1e-9, "0.40 + 0.55");
  near(m.sets[0].locked, 100 * 0.05, 1e-9, "locked profit is what the dollar leaves over");
  eq(m.sets[1].qty, 20);
  near(m.sets[1].cost, 0.99, 1e-9, "0.44 + 0.55");
  eq(m.upQ.length, 1, "30 UP left unpaired");
  eq(m.upQ[0].qty, 30);
  eq(m.downQ.length, 0, "the down lot is used up");
});

check("settlement pays a dollar a set and nothing for the wrong leg", () => {
  const { world, maker } = session(555, 0);
  const m = maker.state;
  const cash0 = m.cash;
  m.upQ.push({ px: 0.30, qty: 200, t: 0 });
  m.downQ.push({ px: 0.60, qty: 150, t: 0 });
  m.cash -= 200 * 0.30 + 150 * 0.60;
  maker.pairInventory(1);
  eq(m.sets[0].qty, 150, "150 complete sets");
  eq(m.upQ[0].qty, 50, "50 UP left over");

  const rec = maker.settle({
    index: 0, winner: "DOWN", openSpot: 100, closeSpot: 99,
    end: 1000, lastUp: 0.4,
  });
  /* 150 sets cost 90¢ each and pay a dollar; the 50 unpaired UP
     shares cost 30¢ each and expire at nothing. */
  near(rec.lockedPnl, 150 * 0.10, 1e-9, "locked profit");
  near(rec.resPnl, -50 * 0.30, 1e-9, "the residual was on the wrong leg");
  near(rec.pnl, 150 * 0.10 - 50 * 0.30, 1e-9, "window P&L");
  near(m.cash, cash0 + rec.pnl, 1e-9, "cash agrees with the P&L");
  eq(m.upQ.length + m.downQ.length + m.sets.length, 0, "the book is empty afterwards");
});

check("cash never disappears: the ledger reconciles over a whole session", () => {
  const { world, maker } = session(8888, 6);
  const m = maker.state;
  /* Run on to the end of a window so nothing is left open. */
  for (let i = 0; i < 4000 && (m.upQ.length || m.downQ.length || m.sets.length); i++) {
    maker.step(1000);
  }
  eq(m.upQ.length + m.downQ.length + m.sets.length, 0, "flat");
  near(m.cash, maker.cfg.deposit + m.pnl, 1e-6,
       "cash equals the deposit plus everything made and lost");
  ok(m.fills.length > 50, "it actually traded");
});

check("every set it builds costs less than a dollar", () => {
  const { maker } = session(1234, 12);
  const costs = maker.state.pairCosts.items;
  ok(costs.length > 100, `only ${costs.length} sets to judge`);
  const over = costs.filter((c) => c >= 1);
  ok(over.length / costs.length < 0.02,
     `${over.length} of ${costs.length} sets cost a dollar or more`);
  ok(mean(costs) < 0.99, "the average set is a real discount, not a rounding error");
});

check("the residual is held to its limit", () => {
  const { world, maker } = session(606, 0);
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    maker.step(1000);
    const q = maker.state.quote;
    worst = Math.max(worst, Math.abs(q.residual || 0));
  }
  /* The cap is a target, not a wall — a single large fill can put it
     over, and the trim then brings it back — but it should never be
     anywhere near a multiple of the limit. */
  ok(worst < maker.cfg.maxResidual * 3.5,
     `residual reached ${Math.round(worst)} against a limit of ${maker.cfg.maxResidual}`);
});

check("quotes stay inside the rules", () => {
  const { world, maker } = session(4321, 0);
  for (let i = 0; i < 14000; i++) {
    maker.step(1000);
    const q = maker.state.quote, b = world.book;
    ok(q.upBid > 0 && q.upBid < 1, "up bid is a price");
    ok(q.downBid > 0 && q.downBid < 1, "down bid is a price");
    /* It may improve on the book's best bid — that is making a
       market — but it must never quote at or through the offer,
       which would be taking one. */
    ok(q.upBid < b.upAsk, "never crosses the spread on up");
    ok(q.downBid < b.downAsk, "never crosses the spread on down");
    ok(q.pairCost < 1, "the quoted pair always costs less than a dollar");
  }
});

check("it stops quoting into the bell", () => {
  const { world, maker } = session(171, 0);
  let sawPulled = false, quotedLate = false;
  for (let i = 0; i < 4000; i++) {
    maker.step(1000);
    if (world.msLeft() < maker.cfg.pullBeforeExpiryMs) {
      if (maker.state.quote.quoting) quotedLate = true; else sawPulled = true;
    }
  }
  ok(sawPulled, "quotes come down before expiry");
  ok(!quotedLate, "and stay down");
});

/* ================================================================
   4 — the null, which is the one that matters
   ================================================================ */
check("with no edge the bot makes nothing", () => {
  /* Every quote sits exactly at fair value: no spread, no skew, no
     guard, no discount for completing a pair. On a martingale that
     has to return zero, whatever the inventory rules do. If this ever
     shows a profit, the profit is a bug — a look-ahead, a mispriced
     book, a position being paid twice — and the terminal would be
     reporting it as a strategy. */
  const pnl = [];
  for (let i = 0; i < 20; i++) {
    const seed = 1000 + i * 137;
    const world = MK.market.createWorld({ seed, spot: 76297, now: T0 });
    world.warmStart(40);
    const advance = world.advance;
    world.advance = (dt) => {
      const ev = advance(dt);
      const b = world.book;
      b.upBid = b.upAsk = b.fairUp;
      b.downBid = b.downAsk = 1 - b.fairUp;
      return ev;
    };
    const maker = MK.maker.createMaker(world, {
      seed: seed + 1013, targetEdge: 0, marryCap: 1, guard: 0, refillCap: 1,
    });
    maker.warmStart(10);
    pnl.push(maker.stats().pnl);
  }
  const t = mean(pnl) / stderr(pnl);
  ok(Math.abs(t) < 3,
     `zero-edge P&L was ${Math.round(mean(pnl))} ± ${Math.round(stderr(pnl))} ` +
     `(${t.toFixed(1)} standard errors from zero) — the world is paying for something`);
});

check("with an edge it earns roughly what it quoted, and not more", () => {
  const pnl = [], quoted = [];
  for (let i = 0; i < 18; i++) {
    const { maker } = session(1000 + i * 137, 10);
    pnl.push(maker.stats().pnl);
    quoted.push(maker.state.fills.items
      .filter((f) => !f.sell)
      .reduce((a, f) => a + f.edge * f.qty, 0));
  }
  const got = mean(pnl), asked = mean(quoted);
  ok(asked > 0, "it quoted an edge at all");
  ok(got > 0, `it should make money over ${pnl.length} sessions, made ${Math.round(got)}`);
  /* Some of the quoted edge is always lost to the half of the flow
     that knew which way the price was about to go. Keeping all of it
     would mean the informed traders are not informed. */
  ok(got < asked * 1.25,
     `kept ${Math.round(got)} of ${Math.round(asked)} quoted — more than the book offered`);
  ok(got > asked * 0.3,
     `kept only ${Math.round(got)} of ${Math.round(asked)} quoted — adverse selection is eating it`);
});

check("informed flow is what costs it money", () => {
  /* Turn the informed share up and the same bot should do worse. */
  const run = (informed) => {
    const p = [];
    for (let i = 0; i < 12; i++) {
      const { maker } = session(1000 + i * 137, 8, { informed });
      p.push(maker.stats().pnl);
    }
    return mean(p);
  };
  const clean = run(0);
  const toxic = run(0.8);
  ok(toxic < clean,
     `a book full of informed sellers should pay worse: ${Math.round(toxic)} vs ${Math.round(clean)}`);
});

/* ================================================================
   5 — what the panels read
   ================================================================ */
check("the reported statistics describe the same session", () => {
  const { maker } = session(9090, 10);
  const s = maker.stats();
  const wins = maker.state.windows.items;
  eq(s.windows, wins.length, "market count");
  near(s.pnl, wins.reduce((a, r) => a + r.pnl, 0), 1e-6, "P&L is the sum of the markets");
  near(s.roi, s.pnl / s.deposit, 1e-12, "ROI is P&L over the deposit");
  near(s.winRate, wins.filter((r) => r.won).length / wins.length, 1e-12, "win rate");
  near(s.pairedPct + s.residualPct, 1, 1e-9, "paired and residual are the whole book");
  ok(s.pairedPct > 0.4, "most of the inventory really is paired");
  ok(s.risk >= 0 && s.risk <= 10, "risk stays on its scale");
  ok(["SAFE", "WATCH", "HOT"].includes(s.riskLabel), "risk has a word for it");
  ok(s.avgHold > 0 && s.avgHold < MK.market.WINDOW_MS, "sets are held for part of a window");
  ok(s.fills24 > 0 && s.fills24 <= maker.state.fills.length, "fill count is real");
});

check("the state machine visits every state and closes its cycles", () => {
  const { maker } = session(1717, 10);
  const c = maker.state.cycle;
  for (const k of ["FLAT", "UP LEG", "SET", "DOWN LEG"]) {
    ok(c.visits[k] > 0, `never reached ${k}`);
    ok(c.time[k] > 0, `no time recorded in ${k}`);
  }
  ok(c.cycles > 0, "no complete cycle");
  ok(c.transitions >= c.cycles, "cycles cannot outnumber transitions");
});

check("a replay is reproducible from its seed", () => {
  const a = session(5150, 4).maker.stats();
  const b = session(5150, 4).maker.stats();
  eq(a.pnl, b.pnl, "same seed, same P&L");
  eq(a.fillsTotal, b.fillsTotal, "same seed, same fills");
  const c = session(5151, 4).maker.stats();
  ok(c.pnl !== a.pnl, "a different seed is a different session");
});

/* ================================================================ */
const label = failures.length ? "FAILED" : "ok";
console.log(`\n\nmaker: ${passed} passed, ${failures.length} failed — ${label}`);
if (failures.length) {
  for (const f of failures) console.error("\n  ✗ " + f);
  process.exit(1);
}
