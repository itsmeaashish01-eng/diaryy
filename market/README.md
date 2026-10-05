# Market Lens

A US stock outlook that runs on your own computer. It reads the last month of
news, each company's latest quarterly and annual reports, and ten years of
prices. It compares the stocks against each other, then gives each one a
**quantum probability** of being higher over the next few months, with a
ranked list and an illustrative way to split a budget.

> **Not financial advice.** Over a few months, a single stock's move is close
> to a coin flip, and no model changes that. Market Lens is built to be
> honest about it: it tests itself on past data it never saw, tells you how
> well it did, and pulls its answers toward 50% when the evidence is thin.
> Use it to decide what's worth a closer look, not as an instruction to buy.

---

## Start it

You need [Node.js](https://nodejs.org) 18 or newer, and nothing else: no
`npm install`, no API keys, no account.

```bash
node market/server.mjs
```

It opens **http://localhost:8787** in your browser. Press **Analyse now**.

- **Windows:** double-click `market/start.bat`.
- **macOS:** double-click `market/start.command`.

The first run fetches everything and takes a minute or two for the 25-stock
default list. After that, prices are cached for 6 hours, news for 30 minutes
and filings for a day, so re-runs are quick.

**One setting worth making:** open *Settings* and enter your email. The SEC
asks every program that reads its filings to identify itself. Without an
email, EDGAR often refuses the request, and the company-report evidence drops
out. The email is stored only in `market/.cache/settings.json` on your
machine, and that folder is git-ignored.

### In the terminal instead

```bash
node market/cli.mjs                         # the watchlist
node market/cli.mjs AAPL MSFT NVDA JPM XOM  # just these
node market/cli.mjs --horizon 126 --budget 5000
node market/cli.mjs --json > report.json
```

Set `MARKET_CONTACT_EMAIL=you@example.com` for the SEC when you use the
terminal.

---

## What it does

For every stock you list, plus the S&P 500 (SPY) as the yardstick:

| Evidence | Where it comes from | Weight |
|---|---|---|
| **Price-pattern model** | A logistic regression re-learned on every run from all the listed stocks' price histories. It uses momentum over 1, 3, 6 and 12 months, the 50/200-day trend, volatility, distance from the 1-year high, RSI and strength against the S&P 500. | 35% |
| **Monte Carlo futures** | 3,000 futures stitched from real month-long stretches of the stock's last 3 years. Its drift is pulled halfway toward the long-run market average, so a hot streak isn't projected forward at face value. Gives the likely range. | 20% |
| **Company reports** | SEC EDGAR filings (10-Q, 10-K). Uses revenue growth and whether it's speeding up, operating and free-cash-flow margins, liabilities/equity and P/E. Each company is scored on its own and **ranked against the others you listed**. | 20% |
| **Company news** | 30 days of Yahoo Finance and Google News headlines, scored with a finance-specific word list ("raises guidance", "misses estimates", "downgrade"…). Newer stories count for more. | 15% |
| **Market mood** | The same, for news about the market, the Fed and the economy. | 10% |

### The quantum probability

Each source's probability *p* becomes a qubit, `√p|up⟩ + √(1−p)|down⟩`. The
qubits are superposed, weighted by how much each source can be trusted, and
the answer is read with the Born rule:

```
|Ψ⟩ = Σ αᵢ |ψᵢ⟩          P(up) = |⟨up|Ψ⟩|² / ⟨Ψ|Ψ⟩
```

When sources agree, their amplitudes interfere constructively. When they
disagree, they cancel. ⟨Ψ|Ψ⟩, the **fidelity**, measures how much they
agree. When evidence is missing or weak, the state is mixed with the fully
uncertain one, so a thin case can't look confident. The **range** shown next
to each probability is how far the answer moves if you leave out any one
source.

To be plain about it: this is quantum-*inspired* maths running on your normal
CPU. It's a principled way to combine evidence. It is not a quantum computer,
and it can't see the future.

### How far to trust it

The model is tested **walk-forward**. It's fitted on the earlier 75% of
history, a gap as long as the horizon is skipped, and then it's scored on the
rest. The page shows how often it was right compared with always guessing the
usual answer, plus its AUC (0.5 = chance) and whether its probabilities beat
the base rate. The model's say in the final answer is scaled by that result.
If it showed no real skill, it is turned down.

### The illustrative split

Only stocks at **55%+ with a positive middle outcome** get a slice. Slices
are sized by how far above 50% they are and shrunk for volatility, with no
single stock above 25%. Everything else goes to a broad index fund (SPY/VOO).
If nothing clears the bar, it says to hold the index. That's the right
default when there's no edge.

---

## Changing the list

Type any US tickers into the box on the page; your list is remembered in the
browser. To change the default, edit `market/data/watchlist.json`. ETFs work
too, with prices and news but no company report.

## Files

```
market/
  server.mjs        local web server (127.0.0.1 only) + job runner
  cli.mjs           the same analysis in the terminal
  index.html, app.js, style.css    the page
  lib/sources.mjs   prices (Yahoo → Stooq fallback), news RSS, SEC EDGAR, disk cache
  lib/sentiment.mjs finance headline scoring
  lib/fundamentals.mjs  reading 10-Q/10-K facts, peer ranking
  lib/model.mjs     features, logistic regression, walk-forward test, Monte Carlo
  lib/quantum.mjs   Born-rule evidence fusion
  lib/analyze.mjs   one full pass, start to finish
  selftest.mjs      offline tests — `node market/selftest.mjs`
  data/watchlist.json   the default stocks, horizon and budget
```

## Limits worth knowing

- Data comes from free, unofficial endpoints (Yahoo Finance, Stooq, Google
  News). They can change or rate-limit without notice. When one fails, that
  evidence drops out, and the page lists what was missing.
- Headline word-scoring is coarse. It catches "beats estimates", not sarcasm
  or nuance.
- Prices are daily closes. This is built for 1–12 month horizons, not trading.
- Past patterns are only a weak guide to future prices. The walk-forward
  numbers show how weak.
