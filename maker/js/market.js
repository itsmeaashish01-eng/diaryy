/* ================================================
   QUOTE SHELL — market.js
   The world the bot trades in: a BTC spot path, and a fresh
   binary market every five minutes asking one question —

       will BTC be higher at :05 than it was at :00?

   UP and DOWN are separate tokens. Both resolve together, and one of
   them pays $1, so an UP share plus a DOWN share is worth exactly $1
   whatever bitcoin does. That identity is the whole game: this file
   only has to price it honestly and let the book push it around.

   Nothing here is a real venue. It is a simulation, seeded so the same
   number replays the same session, and it never touches the network.
   ================================================ */
(function (MK) {
  "use strict";
  const { clamp, normCdf, rng, ring } = MK.util;

  const WINDOW_MS = 5 * 60 * 1000;      // one market
  const YEAR_S = 365.25 * 24 * 3600;
  const ANNUAL_VOL = 0.5;               // ~0.15% of range in five minutes

  /* Fair probability that UP resolves in the money.
     Driftless lognormal: how many standard deviations of remaining
     move is the price already above where the window opened? */
  function fairUp(spot, openSpot, msLeft, annualVol) {
    const tau = Math.max(msLeft, 1) / 1000 / YEAR_S;
    const sd = (annualVol || ANNUAL_VOL) * Math.sqrt(tau);
    if (sd < 1e-9) return spot > openSpot ? 1 : 0;
    return clamp(normCdf(Math.log(spot / openSpot) / sd), 0.002, 0.998);
  }

  function createWorld(opts) {
    opts = opts || {};
    const rand = rng(opts.seed == null ? 7719 : opts.seed);
    const vol = opts.vol || ANNUAL_VOL;

    /* The book prices with exactly the volatility the path is drawn
       with, and the path is a clean driftless walk: no jumps, no mark
       left by the flow. That is a deliberate choice, and the most
       important one in this file.

       Any mismatch between the two — a jump the pricing doesn't know
       about, a burst of flow that moves the spot — leaves the fair
       price with a drift, and a bot that holds inventory collects
       that drift for nothing. It would look like a brilliant market
       maker and it would really be a bot exploiting a bug in its own
       world. With them equal, the fair price is a martingale: holding
       a position is worth exactly nothing in expectation, and every
       dollar the strategy makes has to come from the spread it quotes
       or the flow it trades against. selftest.mjs asserts it, by
       running the bot with its edge set to zero and checking that it
       makes nothing.

       Adverse selection is modelled where it actually lives — in who
       trades, not in what the price does afterwards. See INFORMED. */
    const priceVol = vol;

    /* The share of taker orders that already know which way the next
       move goes. They sell the leg that is about to be worth less, so
       a maker's fills are not a random sample of the flow. This is
       the entire cost side of market making, and with it high enough
       the strategy loses money — as it should. */
    const INFORMED = opts.informed == null ? 0.34 : opts.informed;

    const w = {
      now: opts.now || Date.now(),
      spot: opts.spot || 76297,
      vol,
      windowIndex: 0,
      openSpot: opts.spot || 76297,
      windowStart: 0,
      windowEnd: 0,
      markUp: null,
      ticks: ring(600),        // spot path inside the live window
      candles: ring(96),       // one per resolved window
      results: ring(64),       // the resolution grid
      book: null,
      flow: 0,                 // taker orders arriving this tick
    };

    /* Windows are aligned to the wall clock, like the real thing:
       every market opens on a five-minute boundary. */
    function alignWindow(t) {
      w.windowStart = Math.floor(t / WINDOW_MS) * WINDOW_MS;
      w.windowEnd = w.windowStart + WINDOW_MS;
      w.openSpot = w.spot;
      w.ticks.items = [];
      w.ticks.push({ t, p: w.spot });
      w.markUp = null;
    }

    const msLeft = () => Math.max(0, w.windowEnd - w.now);
    const tau = () => msLeft() / WINDOW_MS;

    /* The move this step is about to make. Drawn before the book is
       quoted against, and applied after — which is what lets some of
       the flow be informed about it without anything reading the
       future out of order. Mostly a random walk; now and then a jump,
       because a five-minute market that never gets surprised is one
       this bot would look far too clever in. */
    function drawMove(dtMs) {
      return vol * Math.sqrt(dtMs / 1000 / YEAR_S) * rand.gauss();
    }

    /* The rest of the book. Other makers quote around fair with a
       spread that tightens as the answer becomes obvious, and depth
       that thins in the last half minute when nobody wants to be
       caught quoting a coin flip that has stopped flipping. */
    function rebuildBook() {
      const fu = fairUp(w.spot, w.openSpot, msLeft(), priceVol);
      const half = clamp(0.003 + 0.005 * tau() + Math.abs(rand.gauss()) * 0.0012, 0.0025, 0.02);
      const drift = rand.gauss() * 0.002;          // the book is not fair, only near it
      const mid = clamp(fu + drift, 0.02, 0.98);
      const depth = Math.round((900 + 2600 * Math.pow(tau(), 0.6)) * (0.7 + rand() * 0.7));

      w.book = {
        fairUp: fu,
        midUp: mid,
        upBid: clamp(mid - half, 0.01, 0.99),
        upAsk: clamp(mid + half, 0.01, 0.99),
        /* A DOWN share is the other half of a complete set, so its
           book is the UP book reflected in $1. */
        downBid: clamp(1 - (mid + half), 0.01, 0.99),
        downAsk: clamp(1 - (mid - half), 0.01, 0.99),
        spread: half * 2,
        depth,
      };
    }

    /* How many taker orders arrive in this step. Flow picks up as
       expiry approaches and the answer gets worth acting on. */
    function flowRate(dtMs) {
      const urgency = 1 + 0.5 * Math.pow(1 - tau(), 2);
      return (1.6 * urgency * dtMs) / 1000;
    }

    /* Return over the last `ms` of market time. Measured by the clock
       rather than by a tick count, so it means the same thing whether
       the world is being replayed in two-second jumps or ticking
       along in front of someone. */
    function momentum(ms) {
      const span = ms || 20000;
      const pts = w.ticks.items;
      if (pts.length < 2) return 0;
      const last = pts[pts.length - 1];
      let i = pts.length - 1;
      while (i > 0 && last.t - pts[i].t < span) i--;
      return (last.p - pts[i].p) / pts[i].p;
    }

    /* Advance the world by dtMs of its own time. Returns the events a
       strategy needs to react to: taker flow now, a resolution when
       the window closes. */
    function advance(dtMs) {
      const out = { resolved: null, sells: [] };
      if (!w.windowEnd) alignWindow(w.now);

      w.now += dtMs;
      const move = drawMove(dtMs);
      rebuildBook();

      /* Sell orders — the ones that hit resting bids, which is the
         only flow a bid-side maker ever gets to trade against.

         Some of it is informed. Those orders sell the leg that is
         about to be worth less, and they are the reason quoting both
         sides is not free money: a maker's fills are not a random
         sample of the flow, they are the half of it that wanted out
         just before the price agreed. The rest is noise — someone
         closing a position, or taking the other side of a hunch. */
      const rate = flowRate(dtMs);
      let n = Math.floor(rate) + (rand() < rate % 1 ? 1 : 0);
      w.flow = n;
      while (n-- > 0) {
        const informed = rand() < INFORMED;
        const leg = informed ? (move < 0 ? "UP" : "DOWN") : (rand() < 0.5 ? "UP" : "DOWN");
        const size = Math.round(Math.exp(rand.range(2.5, 7.0)));
        out.sells.push({
          leg,
          size,
          informed,
          /* How deep the order sweeps: most stop at the touch. */
          sweep: rand() < 0.14 ? rand.int(1, 3) : 0,
        });
      }

      /* The price with half the window to run. Read at a fixed lead
         because the price at the bell is always 1¢ or 99¢ — by then
         the market has stopped forecasting and is only waiting. */
      if (w.markUp == null && msLeft() <= WINDOW_MS / 2) w.markUp = w.book.midUp;

      /* Now the move happens. The informed orders above were right
         about it; the rest were noise. */
      w.spot *= Math.exp(move);
      w.ticks.push({ t: w.now, p: w.spot });

      if (w.now >= w.windowEnd) {
        const winner = w.spot > w.openSpot ? "UP" : "DOWN";
        /* Where the book was when it stopped mattering — read before
           the next window resets it to a coin flip. */
        const lastUp = w.markUp == null ? w.book.midUp : w.markUp;
        const pts = w.ticks.items;
        const prices = pts.map((p) => p.p);
        const candle = {
          i: w.windowIndex,
          t: w.windowStart,
          o: w.openSpot,
          h: Math.max(...prices, w.spot),
          l: Math.min(...prices, w.spot),
          c: w.spot,
          winner,
        };
        w.candles.push(candle);
        out.resolved = {
          index: w.windowIndex,
          winner, lastUp,
          openSpot: w.openSpot,
          closeSpot: w.spot,
          start: w.windowStart,
          end: w.windowEnd,
          candle,
        };
        w.windowIndex++;
        alignWindow(w.now);
        rebuildBook();
      }
      return out;
    }

    /* Fill the panels before the first tick, so the terminal opens on
       a session already underway rather than on empty axes. */
    function warmStart(windows) {
      for (let i = 0; i < windows; i++) {
        const open = w.spot;
        let hi = open, lo = open;
        for (let k = 0; k < 40; k++) {
          w.spot *= Math.exp(drawMove(7500));
          hi = Math.max(hi, w.spot); lo = Math.min(lo, w.spot);
        }
        const winner = w.spot > open ? "UP" : "DOWN";
        w.candles.push({ i: w.windowIndex, t: w.now - (windows - i) * WINDOW_MS,
                         o: open, h: hi, l: lo, c: w.spot, winner });
        w.windowIndex++;
      }
      alignWindow(w.now);
      rebuildBook();
    }

    return {
      state: w,
      advance, warmStart, rebuildBook,
      msLeft, tau, momentum,
      get book() { return w.book; },
      WINDOW_MS,
    };
  }

  MK.market = { createWorld, fairUp, WINDOW_MS };
})(window.MK);
