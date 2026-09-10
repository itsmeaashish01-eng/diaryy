/* ================================================
   PRICE WATCH — providers.js
   A price source is anything that can answer "what does it cost right now?"

   Every provider exposes:
     id, label, kinds[], note, needsProxy, fields[]
     fetch(watch, ctx) -> { price, currency, meta }
     describe(watch)   -> short subtitle for the card

   `ctx` carries { proxyBase, currency }. Adding a source means adding one
   object to REGISTRY — nothing else in the app needs to change.
   ================================================ */
(function (PT) {
  "use strict";
  const { fetchWithTimeout, dig, seededRandom, clamp } = PT.util;

  /* Browsers block cross-origin reads unless the server opts in with CORS
     headers. Sources that don't (most airline/rail sites) go through the
     little Node proxy in tracker/server/price-proxy.mjs. */
  function viaProxy(url, ctx) {
    if (!ctx.proxyBase) return url;
    const base = ctx.proxyBase.replace(/\/+$/, "");
    return `${base}/fetch?url=${encodeURIComponent(url)}`;
  }

  async function getJSON(url, ctx, opts) {
    const res = await fetchWithTimeout(url, opts, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json();
  }

  async function getText(url, ctx, opts) {
    const res = await fetchWithTimeout(url, opts, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  }

  const num = (v) => {
    if (typeof v === "number") return v;
    if (v == null) return NaN;
    // Tolerate "1,234.56", "$1234", "INR 1 234,56"
    let s = String(v).trim().replace(/[^\d.,\-]/g, "");
    if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    return parseFloat(s);
  };

  /* The simulated walk, as a pure function of time.

     Both the live provider and the first-run backfill call this, so a
     freshly generated history and the next real check sit on one
     continuous curve instead of jumping apart. */
  function demoPriceAt(w, t, jitter) {
    const base = num(w.config.basePrice) || 120;
    const vol = clamp(num(w.config.volatility) || 0.06, 0.005, 0.4);
    const rnd = seededRandom(w.id + "|" + base);
    const stepMs = Math.max(5, w.intervalMin || 60) * 60000;
    const steps = clamp(Math.floor((t - w.createdAt) / stepMs), 0, 4000);

    let p = base;
    for (let i = 0; i <= steps; i++) {
      p += (base - p) * 0.08;                 // pull back toward normal
      p *= 1 + (rnd() - 0.5) * 2 * vol;       // noise
      if (rnd() < 0.025) p *= 0.86;           // flash sale
    }

    // Travel fares climb as the date approaches.
    const depart = w.trip && w.trip.depart;
    if (depart) {
      const left = (Date.parse(depart + "T12:00:00") - t) / 86400000;
      if (Number.isFinite(left) && left >= 0) {
        p *= 1 + 0.55 * Math.exp(-left / 12);
        const dow = new Date(depart + "T12:00:00").getDay();
        if (dow === 5 || dow === 0) p *= 1.09;   // Fri/Sun premium
      }
    }
    // A touch of live jitter so a manual "check now" isn't a guaranteed no-op.
    if (jitter) p *= 1 + (Math.random() - 0.5) * 0.008;
    return Math.round(p * 100) / 100;
  }

  const REGISTRY = [
    // ------------------------------------------------------------------
    {
      id: "demo",
      label: "Demo feed (simulated)",
      kinds: ["flight", "train", "bus", "hotel", "ferry", "car", "stock", "crypto", "fx", "other"],
      needsProxy: false,
      note:
        "Generates a realistic price series so you can try alerts and the buy " +
        "signal without wiring up a real feed. Travel prices drift upward as the " +
        "date nears, with the occasional flash sale. Not real money.",
      fields: [
        { key: "basePrice", label: "Typical price", type: "number", placeholder: "120", required: true },
        { key: "volatility", label: "Volatility (0.01–0.25)", type: "number", placeholder: "0.06" },
      ],
      describe: (w) => "Simulated series",
      async fetch(w, ctx) {
        return {
          price: demoPriceAt(w, Date.now(), true),
          currency: w.currency || ctx.currency,
          meta: { simulated: true },
        };
      },
    },

    // ------------------------------------------------------------------
    {
      id: "manual",
      label: "Manual entry",
      kinds: ["flight", "train", "bus", "hotel", "ferry", "car", "stock", "crypto", "fx", "other"],
      needsProxy: false,
      note:
        "No automatic checking — you type the price in whenever you see it. " +
        "The chart, statistics and buy signal all work the same way.",
      fields: [],
      describe: () => "Prices entered by hand",
      async fetch() {
        throw new Error("Manual watch — use “Log price” to add a reading.");
      },
    },

    // ------------------------------------------------------------------
    {
      id: "coingecko",
      label: "CoinGecko (crypto)",
      kinds: ["crypto"],
      needsProxy: false,
      note: "Free public API, no key. Use the coin id from the CoinGecko URL (e.g. bitcoin, ethereum, solana).",
      fields: [
        { key: "coinId", label: "Coin id", placeholder: "bitcoin", required: true },
        { key: "vs", label: "Priced in", placeholder: "usd" },
      ],
      describe: (w) => `${w.config.coinId || "?"} → ${(w.config.vs || "usd").toUpperCase()}`,
      async fetch(w, ctx) {
        const id = String(w.config.coinId || "").trim().toLowerCase();
        const vs = String(w.config.vs || "usd").trim().toLowerCase();
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${encodeURIComponent(vs)}`;
        const j = await getJSON(viaProxy(url, ctx), ctx);
        const price = num(dig(j, `${id}.${vs}`));
        if (!Number.isFinite(price)) throw new Error(`No price for "${id}" in ${vs}`);
        return { price, currency: vs.toUpperCase() };
      },
    },

    // ------------------------------------------------------------------
    {
      id: "coinbase",
      label: "Coinbase spot (crypto)",
      kinds: ["crypto", "fx"],
      needsProxy: false,
      note: "Free public spot price, no key. Pair looks like BTC-USD or ETH-EUR.",
      fields: [{ key: "pair", label: "Pair", placeholder: "BTC-USD", required: true }],
      describe: (w) => w.config.pair || "?",
      async fetch(w, ctx) {
        const pair = String(w.config.pair || "").trim().toUpperCase();
        const url = `https://api.coinbase.com/v2/prices/${encodeURIComponent(pair)}/spot`;
        const j = await getJSON(viaProxy(url, ctx), ctx);
        const price = num(dig(j, "data.amount"));
        if (!Number.isFinite(price)) throw new Error(`No spot price for ${pair}`);
        return { price, currency: dig(j, "data.currency") || pair.split("-")[1] };
      },
    },

    // ------------------------------------------------------------------
    {
      id: "stooq",
      label: "Stooq (stocks & indices)",
      kinds: ["stock", "other"],
      needsProxy: false,
      note:
        "Free delayed quotes, no key. Symbols carry a market suffix: aapl.us, " +
        "msft.us, tsla.us, ^spx (S&P 500), reliance.in. If your browser blocks " +
        "it as cross-origin, set a proxy in Settings.",
      fields: [{ key: "symbol", label: "Symbol", placeholder: "aapl.us", required: true }],
      describe: (w) => String(w.config.symbol || "?").toUpperCase(),
      async fetch(w, ctx) {
        const sym = String(w.config.symbol || "").trim().toLowerCase();
        const url = `https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`;
        const text = await getText(viaProxy(url, ctx), ctx);
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) throw new Error("Empty response from Stooq");
        const cols = lines[0].split(",").map((s) => s.trim().toLowerCase());
        const vals = lines[1].split(",");
        const close = num(vals[cols.indexOf("close")]);
        if (!Number.isFinite(close)) throw new Error(`Unknown symbol "${sym}"`);
        return {
          price: close,
          currency: w.currency || ctx.currency,
          meta: {
            open: num(vals[cols.indexOf("open")]),
            high: num(vals[cols.indexOf("high")]),
            low: num(vals[cols.indexOf("low")]),
            asOf: vals[cols.indexOf("date")],
          },
        };
      },
    },

    // ------------------------------------------------------------------
    {
      id: "frankfurter",
      label: "Frankfurter (exchange rates)",
      kinds: ["fx"],
      needsProxy: false,
      note: "Free ECB reference rates, no key.",
      fields: [
        { key: "from", label: "From", placeholder: "USD", required: true },
        { key: "to", label: "To", placeholder: "INR", required: true },
      ],
      describe: (w) => `${w.config.from || "?"} → ${w.config.to || "?"}`,
      async fetch(w, ctx) {
        const from = String(w.config.from || "").trim().toUpperCase();
        const to = String(w.config.to || "").trim().toUpperCase();
        const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
        const j = await getJSON(viaProxy(url, ctx), ctx);
        const price = num(dig(j, `rates.${to}`));
        if (!Number.isFinite(price)) throw new Error(`No rate ${from}→${to}`);
        return { price, currency: to };
      },
    },

    // ------------------------------------------------------------------
    {
      id: "json",
      label: "Any JSON endpoint",
      kinds: ["flight", "train", "bus", "hotel", "ferry", "car", "stock", "crypto", "fx", "other"],
      needsProxy: false,
      note:
        "The universal escape hatch. Point it at any URL that returns JSON and " +
        "give the path to the price field, e.g. data.offers.0.price.total — " +
        "this is how you attach a rail or airline API once you have one.",
      fields: [
        { key: "url", label: "URL", placeholder: "https://api.example.com/fares?from=A&to=B", required: true },
        { key: "path", label: "Path to price", placeholder: "data.0.price.total", required: true },
        { key: "currencyPath", label: "Path to currency (optional)", placeholder: "data.0.price.currency" },
        { key: "headers", label: "Headers as JSON (optional)", placeholder: '{"Authorization":"Bearer …"}' },
        { key: "multiplier", label: "Multiply result by (optional)", type: "number", placeholder: "1" },
      ],
      describe: (w) => {
        try { return new URL(w.config.url).hostname; } catch (e) { return "custom endpoint"; }
      },
      async fetch(w, ctx) {
        let headers;
        if (w.config.headers) {
          try { headers = JSON.parse(w.config.headers); }
          catch (e) { throw new Error("Headers field is not valid JSON"); }
        }
        const j = await getJSON(viaProxy(w.config.url, ctx), ctx, { headers });
        let price = num(dig(j, w.config.path));
        if (!Number.isFinite(price)) throw new Error(`No number at path "${w.config.path}"`);
        const mult = num(w.config.multiplier);
        if (Number.isFinite(mult) && mult > 0) price *= mult;
        const cur = w.config.currencyPath ? dig(j, w.config.currencyPath) : null;
        return { price, currency: cur || w.currency || ctx.currency };
      },
    },

    // ------------------------------------------------------------------
    {
      id: "regex",
      label: "Any web page (pattern match)",
      kinds: ["flight", "train", "bus", "hotel", "ferry", "car", "other"],
      needsProxy: true,
      note:
        "Fetches a page and pulls the price out with a regular expression — the " +
        "first capture group is the number. Almost always needs the proxy, and " +
        "it breaks whenever the site changes its markup. Check the site's terms " +
        "before pointing this at it.",
      fields: [
        { key: "url", label: "Page URL", placeholder: "https://example.com/fares", required: true },
        { key: "pattern", label: "Regex with one capture group", placeholder: '"price":\\s*"?([0-9.,]+)', required: true },
      ],
      describe: (w) => {
        try { return new URL(w.config.url).hostname; } catch (e) { return "web page"; }
      },
      async fetch(w, ctx) {
        const text = await getText(viaProxy(w.config.url, ctx), ctx);
        let re;
        try { re = new RegExp(w.config.pattern); }
        catch (e) { throw new Error("Invalid regular expression"); }
        const m = text.match(re);
        if (!m || m[1] == null) throw new Error("Pattern did not match the page");
        const price = num(m[1]);
        if (!Number.isFinite(price)) throw new Error(`Matched "${m[1]}" but it isn't a number`);
        return { price, currency: w.currency || ctx.currency };
      },
    },

    // ------------------------------------------------------------------
    {
      id: "command",
      label: "Local program (unattended runner only)",
      kinds: ["flight", "train", "bus", "hotel", "ferry", "car", "stock", "crypto", "fx", "other"],
      needsProxy: false,
      note:
        "Runs a program on your own machine that prints {\"price\": 87, " +
        "\"currency\": \"USD\"}. This is how sites with no API get checked " +
        "automatically — see tracker/server/fetchers/browser-price.mjs. A web " +
        "page can't start programs, so this one is skipped here and only runs " +
        "in the unattended runner.",
      fields: [
        { key: "command", label: "Command to run", placeholder: 'node tracker/server/fetchers/browser-price.mjs --url "…" --min 20 --max 600', required: true },
        { key: "timeoutMs", label: "Give up after (ms)", type: "number", placeholder: "120000" },
      ],
      describe: () => "local program",
      async fetch() {
        throw new Error(
          "Only the unattended runner can run local programs. This watch is checked there."
        );
      },
    },

    // ------------------------------------------------------------------
    {
      id: "amadeus",
      label: "Amadeus flight offers (via proxy)",
      kinds: ["flight"],
      needsProxy: true,
      note:
        "Real flight fares from Amadeus' free self-service tier. Your API key " +
        "stays on the proxy, never in the browser: run tracker/server/price-proxy.mjs " +
        "with AMADEUS_KEY / AMADEUS_SECRET set, then put its address in Settings.",
      fields: [
        { key: "origin", label: "From (IATA)", placeholder: "DEL", required: true },
        { key: "destination", label: "To (IATA)", placeholder: "SIN", required: true },
        { key: "adults", label: "Adults", type: "number", placeholder: "1" },
        { key: "nonStop", label: "Non-stop only (true/false)", placeholder: "false" },
      ],
      describe: (w) =>
        `${(w.config.origin || "?").toUpperCase()} → ${(w.config.destination || "?").toUpperCase()}`,
      async fetch(w, ctx) {
        if (!ctx.proxyBase) throw new Error("Set a proxy address in Settings first");
        const depart = (w.trip && w.trip.depart) || "";
        if (!depart) throw new Error("This watch needs a departure date");
        const qs = new URLSearchParams({
          origin: String(w.config.origin || "").toUpperCase(),
          destination: String(w.config.destination || "").toUpperCase(),
          date: depart,
          adults: String(w.config.adults || 1),
          currency: w.currency || ctx.currency,
        });
        if (w.trip && w.trip.ret) qs.set("returnDate", w.trip.ret);
        if (String(w.config.nonStop) === "true") qs.set("nonStop", "true");
        const base = ctx.proxyBase.replace(/\/+$/, "");
        const j = await getJSON(`${base}/amadeus/flight?${qs}`, ctx);
        const price = num(j.price);
        if (!Number.isFinite(price)) throw new Error(j.error || "No offers returned");
        return { price, currency: j.currency || w.currency, meta: j.meta };
      },
    },
  ];

  const byId = (id) => REGISTRY.find((p) => p.id === id) || null;
  const forKind = (kind) => REGISTRY.filter((p) => p.kinds.includes(kind));

  /* Run one price check. Normalises every failure into an Error with a
     message worth showing the user. */
  async function check(watch, ctx) {
    const p = byId(watch.provider);
    if (!p) throw new Error(`Unknown price source "${watch.provider}"`);
    const result = await p.fetch(watch, ctx);
    if (!result || !Number.isFinite(result.price)) {
      throw new Error("Source returned no usable price");
    }
    if (result.price <= 0) throw new Error("Source returned a zero or negative price");
    return result;
  }

  function describe(watch) {
    const p = byId(watch.provider);
    if (!p) return "unknown source";
    try { return p.describe(watch); } catch (e) { return p.label; }
  }

  PT.providers = { REGISTRY, byId, forKind, check, describe, demoPriceAt };
})(window.PT);
