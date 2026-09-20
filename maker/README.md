# Quote Shell

A market-making terminal for five-minute binary markets — the kind that asks
one question and answers it twelve times an hour:

> Will bitcoin be higher at :05 than it was at :00?

UP and DOWN are separate tokens. Both resolve together and exactly one of them
pays $1, so **an UP share plus a DOWN share is worth a dollar whatever bitcoin
does**. That pair is called a *complete set*, and it is the whole game: buy
both legs for less than a dollar between them and the difference is yours
regardless of the price.

The bot quotes bids on both legs, pairs what it gets into complete sets under
$1, and carries whatever won't pair as a small directional residual. The
terminal is what it looks like while it does that.

**It is a simulation.** There is no venue, no wallet, no money. Open
`maker/index.html` and it runs — no build step, no network, no account. Every
number on screen comes from a seeded model of a book and a strategy trading
against it, and `?seed=7719` in the URL replays the same session exactly.

---

## What's on the screen

The terminal opens on a session already underway: it replays 24 hours of
five-minute markets through the same code before the first paint, so the
ledger, the plane and the resolution grid have a history behind them. Then it
runs forward at 1×, 4× or 12× — space bar pauses, 1/2/3 switch speed.

**Wallet.** Session P&L, fills, the share of markets that ended up, and a
0–10 reading of how much could still go wrong — built from the residual being
carried, the drawdown already taken, and how little time is left to pair it
off.

**Complete-set ledger.** What the average set cost and how the inventory
splits between paired and residual. Paired is safe by construction. Residual
is the part that can lose.

**BTC spot.** Five-minute candles, one per market, with the live one in amber
and the strike — the price the window opened at — as a dashed line. Under it,
the book: both legs, both sides, with our own resting bid marked.

**Pair cost plane.** One dot per completed set: what the UP leg cost against
what the DOWN leg cost. The anti-diagonal is $1. Every dot below it is a set
bought for less than it will pay, and the gap is the edge.

**Resolution grid.** The last few expiries. Each column is one market: what
the two legs were trading at with half the window left, which of them went on
to pay a dollar, and what we made or lost on it.

**Quote shell.** The centrepiece, and the one panel worth explaining.

Price is the angle. The UP leg runs over the top of the ring from 0¢ round to
100¢; the DOWN leg runs back underneath. Each chord ties an UP fill to the
DOWN fill it was paired with — one chord, one complete set.

That layout has a property worth the panel: a chord spans an angle of exactly
π times what the set cost, so a set costing a full dollar is a diameter and
passes dead through the middle, and anything cheaper misses the centre by more
the cheaper it was. **The hole in the middle of the hairball is the edge.**
When the bot is quoting well it opens up; when the book turns against it the
chords close in and it shuts. The dashed amber ring is where the average set
sits.

**Running VWAP.** What the pairs actually cost in the live market, in the
order they were made — the dots are sets, the step line is the volume-weighted
average, and the amber line is the dollar they will each pay.

**Quote cycle.** The four states the book can be in — flat, carrying one leg,
paired, carrying the other — and where the time goes. Sitting in a leg is the
only state with risk in it.

---

## How the bot trades

**Quote both legs.** Bids sit at or inside the book on UP and DOWN at once,
with a hard rule: the two bids must sum to less than a dollar by at least the
target edge. If the book won't allow that, it steps back from both sides
rather than paying up on one.

**Price the second leg off the first.** Quoting both sides under a dollar
*right now* is not enough — the two fills arrive minutes apart and the price
moves in between. So whatever is sitting unpaired sets the ceiling for the
other leg. When the book won't offer a price that cheap, that side stops
trading until the other leg clears. This is the rule that stops the bot
legging itself, and it is why the inventory goes one-sided for minutes at a
time.

**Lean away from trouble.** Two skews ride on top of the quotes: one against
whichever leg is over-held, so the short side gets the better price; one
against whoever is about to run us over, because the orders that hit a resting
bid arrive on the leg that is on its way down.

**Refill, don't overpay.** When the imbalance gets big enough the bot crosses
the spread on the short leg — but only for the lots that still make a set
under a dollar at that ask. Lots bought too high to marry are left alone; they
are not a pairing problem any more, they are a position.

**Keep the residual, trim the excess.** What doesn't pair is a directional
bet, and it is worth being precise about whether that is bad. Every unpaired
share was bought on the bid, below what the market thought it was worth, so
carrying it to resolution is a positive-expectation coin flip; selling it back
means crossing the spread and paying that edge away for certain. So the
residual is kept — up to a size the session can absorb being wrong about —
and only the excess is sold, late, once it clearly won't pair on its own.

**Stand down into the bell.** Quotes come off in the last twenty seconds.

---

## Being honest about the numbers

A market-making simulation will show you whatever its world lets it. Almost
every plausible-looking bug in one of these makes the bot *richer*, which is
exactly the direction that stops you looking. Three of them were in this one
before the tests went in:

- The bot filled against the next market's book and got paid by the last
  market's result — a guaranteed couple of cents a share, every five minutes.
- The book priced with one volatility while the price path moved with another,
  so the fair price carried a drift and merely holding inventory collected it.
- Flow moved the spot and flow followed the trend it had just created, so the
  world had momentum in it and any strategy could pick it up.

Each of those looked like a brilliant strategy on screen. So the world is now
built to make that kind of mistake fail loudly:

- **The path is a clean driftless walk and the book prices it with exactly the
  volatility it is drawn with.** No jumps, no market impact. The fair price is
  a martingale, so holding a position is worth nothing in expectation, and
  every dollar has to come from the spread quoted or the flow traded against.
- **Adverse selection is modelled where it lives — in who trades.** About a
  third of the taker orders already know which way the next move goes and sell
  the leg that is about to be worth less. That is the cost side, and turning
  it up far enough makes the strategy lose money, as it should.
- **`selftest.mjs` runs the bot with its edge set to zero and asserts that it
  makes nothing**, within three standard errors over twenty sessions. It also
  checks that a leg the book prices at 70¢ really does win about 70% of the
  time, and that what the bot keeps is less than the edge it quoted.

With that in place the model settles around **1,100 fills a day, sets averaging
just under 90¢, about 70% of inventory paired, and a bit over a thousand
dollars a day on a $170k book — roughly two thirds of the edge it quotes, with
the rest lost to informed flow.** Losing days happen; three in a thirty-two
seed sweep.

Those returns are still flattering, and it is worth saying why rather than
tuning them down until they look modest. The simulated book has no fees, no
latency, no competitors improving on the quote, no queue to wait in beyond a
crude fill probability, and it never goes offline. A real venue has all of
those, and each one takes a bite out of the same number. **Treat it as a
working model of the strategy's shape, not a backtest.**

---

## Running the tests

```bash
node maker/selftest.mjs     # ~25s, offline, no dependencies
```

Twenty-two checks: the maths in `util.js`, the world's arithmetic (windows
resolve once, the book never offers a free complete set, bitcoin has no
drift), the bot's book-keeping (FIFO pairing, settlement, and cash reconciling
against P&L over a whole session), and the statistical ones above. Everything
is seeded, so a failure is a real failure and not a bad afternoon.

---

## Files

```
maker/
  index.html        page shell; loads the scripts in order
  style.css         theme tokens, the panel grid, chart colours
  js/util.js        formatting, seeded RNG, normal CDF, ring buffers
  js/market.js      the simulated world — spot path, expiries, the book
  js/maker.js       the bot — quoting, pairing, refills, settlement, stats
  js/charts.js      canvas renderers for every panel but the shell
  js/shell.js       the quote shell graph
  js/ui.js          reads state, writes DOM
  js/app.js         boot, replay, clock, controls
  selftest.mjs      the offline suite
```

`util.js`, `market.js` and `maker.js` touch no DOM, which is what lets the
suite run them head-less. Everything attaches itself to `window.MK`; load
order is set in `index.html`.

## Notes

- `?seed=7719` picks the session; `?replay=48` changes how much history is
  replayed before the first paint (1–72 hours, 24 by default).
- Nothing is stored and nothing is sent anywhere. Reload and it replays from
  the same seed.
- The wallet address in the header is decoration. There is no wallet.
