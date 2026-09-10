# Price Watch

Keep an eye on something you're going to buy — a flight, a train seat, a bus
ticket, a hotel room, a share, a coin — and get told when the price is worth
acting on.

It's a static page: open `tracker/index.html` and it runs. No build step and no
account. For hourly checks that reach your phone with nothing of yours open,
there's a companion job that runs on GitHub Actions — see **Two ways to run it**
below.

---

## What it does

**Watches.** Each watch is one thing you're tracking, with its own price
source, check interval, alert rules and history.

**A price history.** Every check is recorded. The card shows a sparkline; the
detail view shows a full chart with your target line, the cheapest reading
marked, hover values and a plain table of the numbers.

**A buy signal.** Rather than just "is it below X", each watch gets a 0–100
score built from four named parts:

| Part | Weight | What it measures |
|---|---|---|
| Cheapness | 40% | Where today's price sits in everything recorded so far |
| Target | 20% | How close it is to the price you said you'd accept |
| Trend | 15% | Whether it's moving your way, from a 7-day regression |
| Urgency | 25% | For travel, how near the date is — fares climb into the last three weeks |

The score becomes **Book now / Good price / Holding / Wait**, and the detail
view lists the reasons in words, so you can disagree with it. With fewer than
three readings it says so instead of guessing.

**Alerts.** Rules per watch — a target price, a percentage fall against the
recent average, a new all-time low, the signal reaching "Book now", or a
countdown to the travel date. Each rule type has its own cooldown so one noisy
rule can't bury the others.

**Portfolio maths.** Give a stock or coin watch a quantity and average cost and
the card shows current value and profit or loss. Totals are grouped by currency
— it never adds dollars to rupees.

---

## Two ways to run it

**In the browser.** Open the page and it polls while the tab is open. Good for
watching something closely, useless when the tab is shut.

**Unattended, every hour.** `tracker/server/watch-runner.mjs` does one pass —
check what's due, record the prices, run the rules, push what fired — and exits.
The bundled GitHub Actions workflow calls it hourly on GitHub's machines, so
nothing of yours has to be running. It reuses the browser app's own provider,
statistics and rule code, so the two halves can't drift apart on what they decide.

```bash
node tracker/server/watch-runner.mjs --file tracker/data/watches.json
#   --dry-run   check and score, send nothing, save nothing
#   --force     ignore each watch's interval
```

### Turning the hourly job on

1. **Merge the workflow to your default branch.** GitHub only runs scheduled
   workflows from the default branch — on a feature branch it will never fire.
2. **Add a repository secret `NTFY_TOPIC`** under Settings → Secrets and
   variables → Actions, then subscribe to that same topic in the ntfy app.
   `WEBHOOK_URL` works instead of, or alongside, ntfy.
3. **Put your watches in `tracker/data/watches.json`.** Export from the app and
   commit the file; the job commits updated prices back each hour, so importing
   that file into the app later brings the history with it.

Run it on demand any time from the Actions tab.

Worth knowing: GitHub's scheduler is best-effort and can be late by several
minutes under load; scheduled workflows are switched off after long repository
inactivity; and on a private repo an hourly job uses most of the free monthly
Actions minutes (public repos are unlimited).

### Which channel actually reaches you

| Channel | Reaches you with nothing open? | Setup |
|---|---|---|
| **ntfy** | **Yes** | Install the ntfy app, subscribe to a topic, use the same topic in Settings (browser) or as `NTFY_TOPIC` (hourly job). Free, no account. |
| **Webhook** | **Yes** | Any Discord or Slack incoming webhook, or your own endpoint. |
| Desktop notification | No | Browser only, and only while the tab lives. |

Pick a long, unguessable ntfy topic — anyone who knows the name can read it.
The **Suggest a topic** button generates one. Quiet hours (browser) record
alerts without pinging you.

### What the hourly job cannot check

Anything on **Manual entry** — it skips those and says so in the log. That
covers Amtrak, MTR, and most rail, coach and hotel operators, none of which
publish a fare API a program can call. There is no way around that short of
scraping their booking pages, which is fragile and usually against their terms.
What the job does check happily: stocks, crypto, exchange rates, flights via
Amadeus, and any JSON endpoint you point it at.

## Price sources

Pick one per watch. The ones marked **direct** work from the page as-is; the
rest need the proxy below.

| Source | Direct? | For |
|---|---|---|
| Demo feed | direct | A simulated series so you can try everything before wiring up real data |
| Manual entry | direct | You type prices in; charts, stats and alerts all still work |
| CoinGecko | direct | Crypto, no key |
| Coinbase spot | direct | Crypto and some FX, no key |
| Stooq | direct | Stocks and indices, delayed, no key (`aapl.us`, `^spx`, `reliance.in`) |
| Frankfurter | direct | ECB exchange rates, no key |
| **Any JSON endpoint** | direct | **The important one** — any URL returning JSON, plus a path like `data.0.price.total` |
| Any web page | needs proxy | Pull a price out of a page with a regular expression |
| Amadeus flight offers | needs proxy | Real flight fares from the free self-service tier |

Adding a source is one object in `js/providers.js` — `fetch(watch, ctx)`
returns `{ price, currency, meta }` and nothing else in the app has to change.

There is no public, key-free, browser-callable API for rail, coach or hotel
fares — including MTR. Those go one of three ways: **Manual entry** if you're
happy to type the number when you check; **Any JSON endpoint** if you find or
build one; or **Any web page** through the proxy. The first is the one that
always works.

### The proxy

```bash
node tracker/server/price-proxy.mjs
# → http://localhost:8787   (paste this into Settings → Proxy address)
```

Node 18+, no dependencies. It does two things a browser can't:

- **Adds the CORS headers** most sites omit, so the page can read them.
- **Holds API keys** server-side, out of the page where anyone could read them.

It refuses anything that resolves to a private or loopback address, and only
talks to hosts on its allowlist:

```bash
ALLOW_HOSTS=api.example.com,fares.example.org node tracker/server/price-proxy.mjs
```

For real flight prices, get a free key at
[developers.amadeus.com](https://developers.amadeus.com) and start it with:

```bash
AMADEUS_KEY=… AMADEUS_SECRET=… node tracker/server/price-proxy.mjs
```

Then create a flight watch, choose **Amadeus flight offers**, and fill in the
IATA codes. It returns the cheapest offer for the route and date, which is what
you want tracked.

`GET /health` reports the allowlist and whether Amadeus is configured.

**Be a good citizen.** Check a site's terms before scraping it, and don't poll
faster than you need — hourly is plenty for a fare. The scheduler already backs
off exponentially on failure and caps itself at three checks in flight.

---

## Files

```
tracker/
  index.html            page shell; loads the scripts in order
  style.css             theme tokens, layout, chart colours
  js/util.js            formatting, dates, seeded RNG, fetch-with-timeout
  js/store.js           localStorage schema, CRUD, history thinning
  js/providers.js       the price sources — add yours here
  js/analytics.js       statistics and the buy signal
  js/alerts.js          rule definitions and evaluation
  js/notify.js          browser / ntfy / webhook delivery
  js/chart.js           inline SVG sparkline, detail chart, data table
  js/scheduler.js       polling, jitter, backoff, concurrency cap
  js/ui.js              rendering
  js/app.js             bootstrap, events, first-run seed
  server/price-proxy.mjs   optional CORS + API-key proxy
```

Each file attaches itself to `window.PT`; load order is set in `index.html`.

---

## Notes

- History is capped at 1500 points per watch. Older readings are thinned by
  half rather than dropped, and the all-time high and low are never discarded.
- Export from Settings before clearing browser data — local storage is the only
  copy.
- The four watches on first run are there to show the shape of the thing. Three
  are simulated (they say so on the card); Bitcoin is a live feed. Delete them
  whenever.
