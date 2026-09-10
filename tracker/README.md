# Price Watch

Keep an eye on something you're going to buy — a flight, a train seat, a bus
ticket, a hotel room, a share, a coin — and get told when the price is worth
acting on.

It's a static page: open `tracker/index.html` and it runs. No build step, no
account, no server unless you want one. Everything is stored in your browser.

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

## Getting notified

Checks run **while the tab is open**. That's the honest limit of a page with no
server behind it. So the useful channels are the ones that leave the browser:

| Channel | Reaches you with the tab closed? | Setup |
|---|---|---|
| **ntfy** | **Yes** | Install the ntfy app, subscribe to a topic, put the same topic in Settings. Free, no account. |
| **Webhook** | **Yes** | Any Discord or Slack incoming webhook, or your own endpoint. |
| Desktop notification | No | Just tick the box. Only fires while the tab lives. |

Pick a long, unguessable ntfy topic — anyone who knows the name can read it.
The **Suggest a topic** button generates one.

Quiet hours record alerts without pinging you.

For genuinely unattended tracking, leave the tab open on a machine that stays
awake (an old laptop, a Raspberry Pi, a pinned tab on your phone). Alerts still
reach you through ntfy or the webhook.

---

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
