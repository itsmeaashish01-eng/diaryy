/* ================================================
   QUOTE SHELL — maker.js
   The bot. It posts bids on both legs of the same five-minute market
   and tries to buy UP and DOWN for less than a dollar between them.

   Every UP share paired against a DOWN share is a complete set. A set
   pays exactly $1 at resolution whichever way bitcoin went, so a set
   bought for 98.43¢ is 1.57¢ of profit that no price move can take
   back. Anything left unpaired is a directional bet, and that residual
   is the only part of the book that can actually lose — so the quotes
   lean against it until it comes back.

   Two layers, then: most of the inventory paired into complete sets
   below $1, the rest carried as a residual small enough to survive
   being wrong.
   ================================================ */
(function (MK) {
  "use strict";
  const { clamp, rng, ring, mean } = MK.util;

  const TICK = 0.001;                  // price increment
  const round = (p) => Math.round(p / TICK) * TICK;

  function createMaker(world, opts) {
    opts = opts || {};
    const rand = rng(opts.seed == null ? 4242 : opts.seed);

    const cfg = {
      deposit: opts.deposit || 170000,
      targetEdge: opts.targetEdge || 0.018,   // cents per set we insist on
      marryCap: opts.marryCap || 0.985,       // most a set may cost once one leg is on
      maxClipNotional: opts.maxClipNotional || 900,
      maxResidual: opts.maxResidual || 600,   // shares we're content to carry into resolution
      refillAt: opts.refillAt || 350,         // shares of imbalance that trigger a refill
      refillGapMs: opts.refillGapMs || 8000,
      refillCap: opts.refillCap || 0.985,     // most a refilled set may cost
      flattenMs: opts.flattenMs || 120000,    // start trimming the excess this late
      guard: opts.guard == null ? 0.010 : opts.guard,
      pullBeforeExpiryMs: opts.pullBeforeExpiryMs || 20000,
    };

    const m = {
      cfg,
      cash: cfg.deposit,
      pnl: 0,
      peakEquity: cfg.deposit,
      maxDrawdown: 0,
      upQ: [],            // unpaired UP lots, FIFO
      downQ: [],          // unpaired DOWN lots, FIFO
      sets: [],           // complete sets held into this window's resolution
      setShares: 0,       // their size, kept as a running total
      fills: ring(2400),  // the live fill tape — deep enough to count a day
      chords: ring(220),  // recent sets, for the quote shell
      pairCosts: ring(600),
      windows: ring(240), // one record per resolved market
      quote: { upBid: 0, downBid: 0, pairCost: 1, edge: 0, quoting: false, reason: "warming up" },
      setsMade: 0,
      sharesPaired: 0,
      sharesResidual: 0,
      holdTimes: ring(300),
      lastFill: null,
      lastRefill: 0,
      refills: 0,
      flattens: 0,
      flatPnl: 0,          // this window's exits, banked at resolution
      flatPnlAll: 0,
      /* Which of four states the book is in, and how the time is
         spent between them. Carrying one leg on its own is the only
         state with real risk in it, so it is worth counting. */
      cycle: {
        state: "FLAT", last: 0, transitions: 0, cycles: 0, sawLeg: false,
        visits: { FLAT: 0, "UP LEG": 0, SET: 0, "DOWN LEG": 0 },
        time: { FLAT: 0, "UP LEG": 0, SET: 0, "DOWN LEG": 0 },
        edges: {},
      },
    };

    const qty = (q) => q.reduce((a, l) => a + l.qty, 0);
    const basis = (q) => q.reduce((a, l) => a + l.qty * l.px, 0);

    /* ---- what we're willing to pay -------------------------------- */
    function updateQuote() {
      const b = world.book;
      const left = world.msLeft();
      const up0 = qty(m.upQ), down0 = qty(m.downQ);
      const residual = up0 - down0;                       // +ve: long UP

      /* Lean away from whichever leg we already hold too much of.
         The short leg gets the better price because filling it turns
         a directional bet back into a locked set. */
      const skew = clamp(residual / cfg.maxResidual, -1, 1) * 0.014;

      /* And lean away from whoever is about to run us over. The
         orders that hit a resting bid are not random: they arrive on
         the leg that is on its way down, which is how a maker ends up
         holding the side nobody wants. So when bitcoin is moving, the
         bid on the leg it is moving against steps back, and both bids
         step back a little in proportion to how fast. */
      const mom = clamp(world.momentum(20000) / 0.0005, -1.5, 1.5);
      const wide = cfg.guard * 0.35 * Math.abs(mom);
      const guardUp = cfg.guard * Math.max(0, -mom) + wide;
      const guardDown = cfg.guard * Math.max(0, mom) + wide;

      /* Skewing towards the short leg can lift that bid above the
         book's own best bid, which is fine — improving the bid is
         what a maker does. Lifting it to the offer is not: that is
         crossing the spread, and paying the ask is a decision for
         refill(), not something a quote should do by accident. */
      let up = round(Math.min(b.upBid - skew - guardUp, b.upAsk - TICK));
      let down = round(Math.min(b.downBid + skew - guardDown, b.downAsk - TICK));

      /* The hard rule: the pair has to cost less than a dollar by at
         least our edge. If the book won't allow it, we step back from
         both sides rather than pay up on one. */
      const cap = 1 - cfg.targetEdge;
      const sum = up + down;
      if (sum > cap) {
        const excess = sum - cap;
        up = round(up - excess / 2);
        down = round(down - excess / 2);
      }

      /* And the rule that stops the bot legging itself. Quoting both
         sides under a dollar *right now* is not enough: the two fills
         arrive minutes apart, and in between the price moves. So
         whatever is already sitting unpaired sets the ceiling for the
         other leg — the next lot out of the queue is the one this
         fill will be married to, and that pair has to work. When the
         book won't offer a price that cheap, the quote goes to the
         floor and this side simply stops trading until the other leg
         is cleared. */
      if (m.upQ.length) down = Math.min(down, round(cfg.marryCap - m.upQ[0].px));
      if (m.downQ.length) up = Math.min(up, round(cfg.marryCap - m.downQ[0].px));
      up = clamp(up, 0.01, 0.98);
      down = clamp(down, 0.01, 0.98);

      let quoting = true, reason = "quoting both";
      if (left < cfg.pullBeforeExpiryMs) {
        quoting = false;
        reason = "quotes pulled · expiry";
      } else if (Math.abs(residual) > cfg.maxResidual * 1.6) {
        reason = residual > 0 ? "one-sided · down only" : "one-sided · up only";
      } else if (m.cash < cfg.deposit * 0.06) {
        quoting = false;
        reason = "cash reserved";
      }

      m.quote = {
        upBid: up, downBid: down,
        pairCost: round(up + down),
        edge: 1 - (up + down),
        quoting, reason,
        residual, skew, mom,
        inventory: up0 + down0,
        /* How much of the book is a bet rather than a set. Paired
           shares are in the denominator: carrying 200 unpaired
           against 20,000 paired is not a lopsided book. */
        skewPct: Math.abs(residual) / Math.max(1, Math.abs(residual) + m.setShares),
        skewLeg: residual >= 0 ? "UP" : "DOWN",
      };
      return m.quote;
    }

    /* ---- pairing --------------------------------------------------
       Match the two queues FIFO. Each match is a complete set and a
       chord in the shell: an UP lot and a DOWN lot tied together at a
       cost that is now fixed for good. */
    function pairInventory(t) {
      while (m.upQ.length && m.downQ.length) {
        const u = m.upQ[0], d = m.downQ[0];
        const n = Math.min(u.qty, d.qty);
        const cost = u.px + d.px;
        const set = {
          t, qty: n, upPx: u.px, downPx: d.px, cost,
          locked: n * (1 - cost), w: world.state.windowIndex,
        };
        m.sets.push(set);
        m.setShares += n;
        m.chords.push(set);
        m.pairCosts.push(cost);
        m.setsMade++;
        m.sharesPaired += n;
        u.qty -= n; d.qty -= n;
        if (u.qty <= 1e-9) m.upQ.shift();
        if (d.qty <= 1e-9) m.downQ.shift();
      }
    }

    /* ---- trading against the incoming flow ------------------------ */
    function onSells(sells, t, made) {
      const b = world.book;
      const q = m.quote;
      if (!q.quoting) return;

      for (const s of sells) {
        const ourBid = s.leg === "UP" ? q.upBid : q.downBid;
        const best = s.leg === "UP" ? b.upBid : b.downBid;
        const ticksBack = Math.max(0, Math.round((best - ourBid) / TICK));

        /* Queue position, roughly. Resting at the touch does not mean
           getting the trade: there is a queue in front of us, and only
           a slice of what arrives reaches our order. A few ticks back,
           only the orders big enough to sweep the levels in front of
           us ever get there at all. */
        let share =
          ticksBack === 0 ? 0.021 :
          ticksBack <= 3 ? 0.009 :
          ticksBack <= 8 ? 0.003 : 0.0008;
        if (s.sweep) share *= 1 + 1.4 * s.sweep;

        /* Don't add to the leg we're already long of. */
        const holding = s.leg === "UP" ? q.residual : -q.residual;
        if (holding > cfg.maxResidual) share *= 0.15;

        if (rand() > share) continue;

        const maxShares = Math.floor(cfg.maxClipNotional / Math.max(ourBid, 0.02));
        const n = Math.max(1, Math.min(s.size, maxShares));
        const notional = n * ourBid;
        if (notional > m.cash) continue;

        m.cash -= notional;
        const lot = { px: ourBid, qty: n, t };
        (s.leg === "UP" ? m.upQ : m.downQ).push(lot);

        const fill = {
          t, leg: s.leg, px: ourBid, qty: n, notional,
          edge: s.leg === "UP" ? b.fairUp - ourBid : 1 - b.fairUp - ourBid,
          window: world.state.windowIndex,
        };
        m.fills.push(fill);
        m.lastFill = fill;
        if (made) made.push(fill);
        pairInventory(t);
        updateQuote();
      }
    }

    /* ---- refilling the short leg ----------------------------------
       Quoting alone leaves the book lopsided: the flow arrives on one
       side for minutes at a time, so the bids that get hit are all on
       one leg. Sitting on that is a directional bet the bot never
       meant to take. So when the imbalance gets big enough it stops
       waiting and crosses the spread on the short leg — paying the
       ask is worth it as long as the completed set still costs less
       than the dollar it will pay out. When the ask has run too far
       for that, the leg is closed instead — see flatten(). */
    function refill(t) {
      const resid = qty(m.upQ) - qty(m.downQ);
      if (Math.abs(resid) < cfg.refillAt) return null;
      if (t - m.lastRefill < cfg.refillGapMs) return null;

      const b = world.book;
      const leg = resid > 0 ? "DOWN" : "UP";
      const ask = leg === "UP" ? b.upAsk : b.downAsk;
      const longQ = resid > 0 ? m.upQ : m.downQ;

      /* Only as many shares as can still be paired under a dollar at
         this ask. Lots bought too high to marry are left alone — they
         are not a pairing problem any more, they are a position, and
         flatten() closes those. */
      const ceiling = cfg.refillCap - ask;
      let eligible = 0;
      for (const lot of longQ) {
        if (lot.px >= ceiling) break;      // FIFO: the rest queue behind it
        eligible += lot.qty;
      }
      if (eligible < 1) return null;

      const want = Math.min(Math.abs(resid), eligible);
      const n = Math.min(want, Math.floor(b.depth * 0.3), Math.floor(m.cash / Math.max(ask, 0.02)));
      if (n < 1) return null;

      m.cash -= n * ask;
      (leg === "UP" ? m.upQ : m.downQ).push({ px: ask, qty: n, t });
      const fill = {
        t, leg, px: ask, qty: n, notional: n * ask, taker: true,
        edge: (leg === "UP" ? b.fairUp : 1 - b.fairUp) - ask,
        window: world.state.windowIndex,
      };
      m.fills.push(fill);
      m.lastFill = fill;
      m.lastRefill = t;
      m.refills++;
      pairInventory(t);
      updateQuote();
      return fill;
    }

    /* ---- trimming the residual ---------------------------------------
       What doesn't pair is a directional bet, and it is worth being
       precise about whether that is a bad thing. Every unpaired share
       was bought on the bid, below what the market thought it was
       worth, so carrying it to resolution is a positive-expectation
       coin flip. Selling it back means crossing the spread and paying
       that edge away for certain.

       So the residual is kept, not dumped — up to a size the session
       can absorb being wrong about. Only the excess over that cap
       gets sold, and only once the clock is short enough that it
       won't pair on its own. */
    function flatten(t) {
      if (world.msLeft() > cfg.flattenMs) return null;
      const resid = qty(m.upQ) - qty(m.downQ);
      const excess = Math.abs(resid) - cfg.maxResidual;
      if (excess < 1) return null;

      const b = world.book;
      const leg = resid > 0 ? "UP" : "DOWN";
      const q = resid > 0 ? m.upQ : m.downQ;
      const bid = leg === "UP" ? b.upBid : b.downBid;
      const want = excess;

      let left = want, cost = 0;
      while (left > 1e-9 && q.length) {
        const lot = q[0];
        const n = Math.min(lot.qty, left);
        cost += n * lot.px;
        lot.qty -= n; left -= n;
        if (lot.qty <= 1e-9) q.shift();
      }
      const sold = want - left;
      if (sold < 1) return null;

      const proceeds = sold * bid;
      m.cash += proceeds;
      m.flatPnl += proceeds - cost;
      m.flattens++;

      const fill = {
        t, leg, px: bid, qty: sold, notional: proceeds, sell: true,
        pnl: proceeds - cost, window: world.state.windowIndex,
      };
      m.fills.push(fill);
      m.lastFill = fill;
      return fill;
    }

    /* ---- resolution ------------------------------------------------
       Sets pay $1 each, so their profit was banked the moment they
       were paired. The residual is where the session is actually
       decided: it pays $1 a share or nothing at all. */
    function settle(res) {
      const setQty = m.sets.reduce((a, s) => a + s.qty, 0);
      const lockedPnl = m.sets.reduce((a, s) => a + s.locked, 0);
      for (const s of m.sets) m.holdTimes.push(res.end - s.t);

      const longLeg = m.upQ.length ? "UP" : m.downQ.length ? "DOWN" : null;
      const q = longLeg === "UP" ? m.upQ : longLeg === "DOWN" ? m.downQ : [];
      const resQty = qty(q);
      const resBasis = basis(q);
      const resPayout = longLeg && longLeg === res.winner ? resQty : 0;
      const resPnl = resPayout - resBasis;

      m.cash += setQty * 1 + resPayout;
      const flatPnl = m.flatPnl;
      const pnl = lockedPnl + resPnl + flatPnl;
      m.pnl += pnl;
      m.flatPnlAll += flatPnl;
      m.flatPnl = 0;
      m.sharesResidual += resQty;

      const equity = cfg.deposit + m.pnl;
      m.peakEquity = Math.max(m.peakEquity, equity);
      m.maxDrawdown = Math.max(m.maxDrawdown, m.peakEquity - equity);

      const record = {
        index: res.index, end: res.end, winner: res.winner,
        openSpot: res.openSpot, closeSpot: res.closeSpot,
        upSettle: res.winner === "UP" ? 1 : 0,
        lastUp: res.lastUp,
        setQty, lockedPnl, resQty, resLeg: longLeg, resPnl, flatPnl, pnl,
        pairCost: setQty ? 1 - lockedPnl / setQty : null,
        paired: setQty + resQty ? setQty / (setQty + resQty) : 0,
        won: pnl > 0,
      };
      m.windows.push(record);

      m.sets = [];
      m.setShares = 0;
      m.upQ = [];
      m.downQ = [];
      updateQuote();
      return record;
    }

    function trackCycle(now) {
      const c = m.cycle;
      /* Pairing drains one queue completely, so "holds both legs"
         never happens — what matters is whether the book is balanced
         enough to be a set, or lopsided enough to be a bet. */
      const resid = qty(m.upQ) - qty(m.downQ);
      const lean = Math.abs(resid) >= cfg.refillAt / 2;
      const s =
        lean ? (resid > 0 ? "UP LEG" : "DOWN LEG") :
        m.sets.length ? "SET" : "FLAT";
      if (c.last) c.time[c.state] += Math.min(now - c.last, 60000);
      c.last = now;
      if (s === c.state) return;
      c.edges[c.state + ">" + s] = (c.edges[c.state + ">" + s] || 0) + 1;
      c.visits[s]++;
      c.transitions++;
      if (s === "UP LEG" || s === "DOWN LEG") c.sawLeg = true;
      if (s === "SET" && c.sawLeg) { c.cycles++; c.sawLeg = false; }
      c.state = s;
    }

    /* ---- one step -------------------------------------------------- */
    function step(dtMs) {
      const ev = world.advance(dtMs);

      /* Settlement comes first, and the order matters more than it
         looks. When a step crosses an expiry the book has already
         rolled to the next market, so anything filled before the old
         one is closed out would be a position in the new market being
         paid off by the old market's result — a free dollar a share,
         every five minutes, from a look-ahead nobody meant to write. */
      let settled = null;
      if (ev.resolved) settled = settle(ev.resolved);

      updateQuote();
      const made = [];
      onSells(ev.sells, world.state.now, made);
      const refilled = refill(world.state.now);
      if (refilled) made.push(refilled);
      const flat = flatten(world.state.now);
      if (flat) made.push(flat);
      trackCycle(world.state.now);
      return { settled, made, flow: ev.sells.length };
    }

    /* ---- what the panels read -------------------------------------- */
    function stats() {
      const now = world.state.now;
      const wins = m.windows.items;
      const day = wins.filter((r) => now - r.end < 24 * 3600 * 1000);
      const fills24 = m.fills.items.filter((f) => now - f.t < 24 * 3600 * 1000).length;
      const paired = m.sharesPaired + m.sharesResidual;
      const equity = cfg.deposit + m.pnl;
      const openSets = m.sets.reduce((a, s) => a + s.qty, 0);
      const openLocked = m.sets.reduce((a, s) => a + s.locked, 0);
      const resNow = qty(m.upQ) - qty(m.downQ);

      /* A 0–10 reading of how much of this could still go wrong: the
         residual we're carrying, the drawdown we've already taken, and
         how little time is left to pair it off. */
      const exposure = Math.abs(resNow) * 0.5 / cfg.deposit;
      const risk = clamp(
        (Math.abs(resNow) / cfg.maxResidual) * 4.2 +
        (m.maxDrawdown / cfg.deposit) * 22 +
        (1 - world.tau()) * 1.6 * (Math.abs(resNow) > 200 ? 1 : 0),
        0, 10);

      return {
        pnl: m.pnl,
        equity,
        roi: m.pnl / cfg.deposit,
        deposit: cfg.deposit,
        cash: m.cash,
        fills24: fills24 || m.fills.length,
        fillsTotal: m.fills.length,
        windows: wins.length,
        winRate: wins.length ? wins.filter((r) => r.won).length / wins.length : 0,
        dayPnl: day.reduce((a, r) => a + r.pnl, 0),
        avgPairCost: m.pairCosts.length ? mean(m.pairCosts.last(120)) : 1,
        pairedPct: paired ? m.sharesPaired / paired : 0,
        residualPct: paired ? m.sharesResidual / paired : 0,
        openSets, openLocked,
        residual: resNow,
        maxDrawdown: m.maxDrawdown,
        flatPnl: m.flatPnlAll,
        flattens: m.flattens,
        risk,
        riskLabel: risk < 3 ? "SAFE" : risk < 6 ? "WATCH" : "HOT",
        avgHold: m.holdTimes.length ? mean(m.holdTimes.last(120)) : 0,
        exposure,
        tradesPerHour: wins.length ? m.fills.length / Math.max(1, (wins.length * 5) / 60) : 0,
      };
    }

    /* Run the session that happened before you opened the page. Same
       strategy, same book, just no rendering — so the opening numbers
       are the model's own history rather than a decorative guess. */
    function warmStart(hours) {
      const steps = Math.round((hours * 3600 * 1000) / 2000);
      for (let i = 0; i < steps; i++) step(2000);
    }

    return {
      state: m, cycle: m.cycle, cfg,
      step, stats, updateQuote, settle, pairInventory, refill, flatten, trackCycle, warmStart,
    };
  }

  MK.maker = { createMaker, TICK };
})(window.MK);
