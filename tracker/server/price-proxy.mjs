#!/usr/bin/env node
/* ================================================
   PRICE WATCH — price-proxy.mjs

   A small companion server for the two things a browser page can't do
   on its own:

     1. Read from sites that don't send CORS headers (most airline,
        rail and hotel sites, and some quote APIs).
     2. Hold an API key without putting it in the page, where anyone
        with dev tools could read it.

   Run it:      node tracker/server/price-proxy.mjs
   Then paste   http://localhost:8787   into Price Watch → Settings → Proxy.

   No dependencies. Node 18 or newer (it uses the built-in fetch).

   Environment:
     PORT              default 8787
     ALLOW_HOSTS       comma-separated extra hostnames to permit
     ALLOW_ANY_HOST    "1" to skip the allowlist (see the warning below)
     AMADEUS_KEY       Amadeus self-service API key
     AMADEUS_SECRET    Amadeus self-service API secret
     AMADEUS_ENV       "test" (default) or "production"
   ================================================ */

import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";

const PORT = Number(process.env.PORT || 8787);

/* Hosts the /fetch endpoint will talk to. Keeping a list means a stray
   tab can't turn this into an open relay pointed at your network. Add
   your own sources here or via ALLOW_HOSTS. */
const DEFAULT_ALLOW = [
  "stooq.com",
  "api.coingecko.com",
  "api.coinbase.com",
  "api.binance.com",
  "api.frankfurter.app",
  "query1.finance.yahoo.com",
  "www.alphavantage.co",
  "test.api.amadeus.com",
  "api.amadeus.com",
];

const ALLOW = new Set(
  DEFAULT_ALLOW.concat(
    (process.env.ALLOW_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
);
const ALLOW_ANY = process.env.ALLOW_ANY_HOST === "1";
const MAX_REDIRECTS = 5;

/* ---- guards ------------------------------------------------------- */

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const low = ip.toLowerCase();
  return (
    low === "::" || low === "::1" ||
    low.startsWith("fc") || low.startsWith("fd") ||   // unique-local
    low.startsWith("fe80") ||                          // link-local
    low.startsWith("::ffff:")                          // v4-mapped
  );
}

/* Reject anything pointed at the machine itself or the local network.
   This is the difference between a convenience and a hole in your LAN. */
async function assertSafeTarget(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  // Node hands back IPv6 hosts still wrapped in brackets ("[::1]"), which
  // net.isIP does not recognise. Unwrap before judging anything.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  /* Judge a bare IP address before anything else. It needs no lookup, and
     it keeps the refusal message honest: "not on the allowlist, add it
     with ALLOW_HOSTS=169.254.169.254" reads as though allowlisting were
     the fix. It isn't — the address check below would still refuse it —
     but no error should ever suggest opening a path to link-local or
     loopback. */
  if (net.isIP(host) && isPrivateAddress(host)) {
    throw new Error(`"${host}" is a private or link-local address — refusing, and no setting permits it`);
  }

  if (!ALLOW_ANY && !ALLOW.has(host)) {
    throw new Error(
      `Host "${host}" is not on the allowlist. Add it with ALLOW_HOSTS=${host}`
    );
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    throw new Error(`Cannot resolve "${host}"`);
  }
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`"${host}" resolves to a private address — refusing, and no setting permits it`);
  }
}

/* ---- responses ---------------------------------------------------- */

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJSON(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

/* ---- /fetch ------------------------------------------------------- */

async function handleFetch(req, res, url) {
  const target = url.searchParams.get("url");
  if (!target) return sendJSON(res, 400, { error: "Missing ?url=" });

  let parsed;
  try { parsed = new URL(target); }
  catch (e) { return sendJSON(res, 400, { error: "That isn't a valid URL" }); }

  try {
    await assertSafeTarget(parsed);
  } catch (e) {
    return sendJSON(res, 403, { error: e.message });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    /* Follow redirects by hand, checking every hop.

       Letting fetch follow them itself would undo the whole guard above:
       the first URL passes, then the server answers 302 to
       http://169.254.169.254/ or http://127.0.0.1:9000/ and the proxy
       fetches it anyway. Only the first URL was ever validated. */
    let current = parsed;
    let upstream;
    for (let hop = 0; ; hop++) {
      if (hop > MAX_REDIRECTS) {
        return sendJSON(res, 502, { error: `More than ${MAX_REDIRECTS} redirects` });
      }
      upstream = await fetch(current, {
        headers: {
          // Some sites serve nothing at all without a browser-ish UA.
          "User-Agent": req.headers["user-agent"] || "PriceWatch/1.0",
          Accept: req.headers["accept"] || "*/*",
          "Accept-Language": "en",
        },
        redirect: "manual",
        signal: ctrl.signal,
      });

      const location = upstream.headers.get("location");
      if (!(upstream.status >= 300 && upstream.status < 400 && location)) break;

      let next;
      try { next = new URL(location, current); }
      catch (e) { return sendJSON(res, 502, { error: "Upstream sent a redirect we can't parse" }); }

      try {
        await assertSafeTarget(next);
      } catch (e) {
        return sendJSON(res, 403, {
          error: `Refused a redirect to ${next.origin}: ${e.message}`,
        });
      }
      current = next;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    cors(res);
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
      "X-Proxied-From": current.origin,
    });
    res.end(body);
  } catch (e) {
    sendJSON(res, 502, { error: `Upstream request failed: ${e.message}` });
  } finally {
    clearTimeout(timer);
  }
}

/* ---- /amadeus/flight ---------------------------------------------- */

const amadeusBase =
  process.env.AMADEUS_ENV === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

let tokenCache = { token: null, expires: 0 };

async function amadeusToken() {
  const key = process.env.AMADEUS_KEY;
  const secret = process.env.AMADEUS_SECRET;
  if (!key || !secret) {
    throw new Error("Set AMADEUS_KEY and AMADEUS_SECRET before using this endpoint");
  }
  if (tokenCache.token && Date.now() < tokenCache.expires - 30000) {
    return tokenCache.token;
  }
  const res = await fetch(`${amadeusBase}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: key,
      client_secret: secret,
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) {
    throw new Error(`Amadeus auth failed: ${j.error_description || res.status}`);
  }
  tokenCache = {
    token: j.access_token,
    expires: Date.now() + (j.expires_in || 1799) * 1000,
  };
  return tokenCache.token;
}

async function handleAmadeusFlight(req, res, url) {
  const q = url.searchParams;
  const required = ["origin", "destination", "date"];
  const missing = required.filter((k) => !q.get(k));
  if (missing.length) {
    return sendJSON(res, 400, { error: `Missing ${missing.join(", ")}` });
  }

  try {
    const token = await amadeusToken();
    const params = new URLSearchParams({
      originLocationCode: q.get("origin"),
      destinationLocationCode: q.get("destination"),
      departureDate: q.get("date"),
      adults: q.get("adults") || "1",
      currencyCode: q.get("currency") || "USD",
      max: "20",
    });
    if (q.get("returnDate")) params.set("returnDate", q.get("returnDate"));
    if (q.get("nonStop") === "true") params.set("nonStop", "true");

    const r = await fetch(`${amadeusBase}/v2/shopping/flight-offers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (!r.ok) {
      const detail = (j.errors && j.errors[0] && (j.errors[0].detail || j.errors[0].title)) || r.status;
      return sendJSON(res, 502, { error: `Amadeus: ${detail}` });
    }
    const offers = j.data || [];
    if (!offers.length) return sendJSON(res, 200, { error: "No offers for that search" });

    // Cheapest offer wins — that's the whole point of the watch.
    let best = null;
    for (const o of offers) {
      const total = parseFloat(o.price && o.price.grandTotal);
      if (Number.isFinite(total) && (!best || total < best.total)) {
        best = { total, offer: o };
      }
    }
    if (!best) return sendJSON(res, 200, { error: "Offers had no readable price" });

    const seg = best.offer.itineraries?.[0]?.segments || [];
    sendJSON(res, 200, {
      price: best.total,
      currency: best.offer.price.currency,
      meta: {
        carrier: seg[0]?.carrierCode,
        stops: Math.max(0, seg.length - 1),
        duration: best.offer.itineraries?.[0]?.duration,
        seatsLeft: best.offer.numberOfBookableSeats,
        offers: offers.length,
      },
    });
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
}

/* ---- server ------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    return sendJSON(res, 200, {
      ok: true,
      allowAnyHost: ALLOW_ANY,
      allowedHosts: ALLOW_ANY ? "any" : [...ALLOW].sort(),
      amadeus: Boolean(process.env.AMADEUS_KEY && process.env.AMADEUS_SECRET),
    });
  }
  if (url.pathname === "/fetch") return handleFetch(req, res, url);
  if (url.pathname === "/amadeus/flight") return handleAmadeusFlight(req, res, url);

  sendJSON(res, 404, {
    error: "Not found",
    endpoints: ["/health", "/fetch?url=…", "/amadeus/flight?origin=&destination=&date="],
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Price Watch proxy listening on http://localhost:${PORT}`);
  console.log(`  allowlist : ${ALLOW_ANY ? "DISABLED (ALLOW_ANY_HOST=1)" : [...ALLOW].sort().join(", ")}`);
  console.log(`  amadeus   : ${process.env.AMADEUS_KEY ? "configured" : "not configured"}`);
  console.log(`Paste http://localhost:${PORT} into Price Watch → Settings → Proxy address.`);
});
