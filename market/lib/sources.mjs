/* ================================================
   MARKET LENS — lib/sources.mjs
   Where the raw material comes from. All free, no API keys:

     prices        Yahoo Finance chart API, Stooq CSV as a fallback
     news          Yahoo Finance RSS + Google News RSS, per symbol
     market news   Google News RSS for the market as a whole
     reports       SEC EDGAR XBRL "company facts" — the numbers out of
                   each company's own 10-Q and 10-K filings

   Every fetch goes through the agents' safeFetch (timeouts, redirect
   checks, no private addresses) and is cached on disk under
   market/.cache, so re-running an analysis an hour later costs almost
   nothing and doesn't hammer anyone's servers.

   The parsers are exported separately so the self-test can check them
   against fixtures without the network.
   ================================================ */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { safeFetch } from "../../agents/core/net.mjs";
import { parseFeed } from "../../agents/types/feed.mjs";
import { CONCEPTS } from "./fundamentals.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = process.env.MARKET_CACHE_DIR || join(HERE, "..", ".cache");

const HOUR = 3600e3;
const TTL = {
  prices: 6 * HOUR,
  news: 0.5 * HOUR,
  secTickers: 7 * 24 * HOUR,
  secFacts: 24 * HOUR,
};

// Yahoo serves a 429 to anything that doesn't look like a browser.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* SEC asks every client to say who it is, with a way to reach them.
   Requests without one are often refused — fundamentals then simply
   drop out of the analysis rather than failing it. */
function secUA() {
  const email = (process.env.MARKET_CONTACT_EMAIL || "").trim();
  return `MarketLens personal research ${email || "(contact not set)"}`;
}

// ---------------------------------------------------------------- cache

function cachePath(key) {
  return join(CACHE_DIR, key.replace(/[^a-z0-9._-]+/gi, "_") + ".json");
}

function cacheGet(key, ttl) {
  const p = cachePath(key);
  if (!existsSync(p)) return null;
  try {
    const { at, data } = JSON.parse(readFileSync(p, "utf8"));
    return Date.now() - at < ttl ? data : null;
  } catch {
    return null;
  }
}

function cachePut(key, data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(key), JSON.stringify({ at: Date.now(), data }));
  return data;
}

async function cached(key, ttl, fn) {
  const hit = cacheGet(key, ttl);
  if (hit) return hit;
  return cachePut(key, await fn());
}

async function fetchText(url, opts = {}) {
  const res = await safeFetch(url, { timeoutMs: 25000, ...opts });
  return res.text();
}

// ---------------------------------------------------------------- prices

/* Yahoo spells share classes with a dash (BRK-B), Stooq with a dash and
   a market suffix (brk-b.us). People type them with a dot. */
export const yahooSymbol = (s) => s.toUpperCase().replace(/\./g, "-");
const stooqSymbol = (s) => s.toLowerCase().replace(/\./g, "-") + ".us";

/* -> [{ date: "2024-01-02", close, volume }] oldest first, adjusted for
   splits and dividends where the source provides it. */
export function parseYahooChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !Array.isArray(r.timestamp)) {
    const why = json && json.chart && json.chart.error && json.chart.error.description;
    throw new Error(why || "no price history in the response");
  }
  const q = (r.indicators.quote && r.indicators.quote[0]) || {};
  const adj = (r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose) || q.close;
  const out = [];
  r.timestamp.forEach((t, i) => {
    const close = adj && adj[i];
    if (close == null || !Number.isFinite(close) || close <= 0) return;
    out.push({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      close,
      volume: (q.volume && q.volume[i]) || 0,
    });
  });
  return {
    name: (r.meta && (r.meta.longName || r.meta.shortName)) || "",
    currency: (r.meta && r.meta.currency) || "USD",
    rows: dedupeByDate(out),
  };
}

export function parseStooqCSV(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (!/^date,/i.test(lines[0] || "")) throw new Error("Stooq did not return a price table");
  const head = lines[0].toLowerCase().split(",");
  const iD = head.indexOf("date"), iC = head.indexOf("close"), iV = head.indexOf("volume");
  const rows = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const close = Number(f[iC]);
    if (!f[iD] || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date: f[iD], close, volume: Number(f[iV]) || 0 });
  }
  return { name: "", currency: "USD", rows: dedupeByDate(rows) };
}

function dedupeByDate(rows) {
  const by = new Map();
  for (const r of rows) by.set(r.date, r);
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function getPrices(symbol) {
  return cached(`prices-${symbol}`, TTL.prices, async () => {
    const errors = [];
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=10y&interval=1d&events=div%2Csplit`;
      const body = await fetchText(url, { userAgent: BROWSER_UA, accept: "application/json" });
      const out = parseYahooChart(JSON.parse(body));
      if (out.rows.length > 300) return { ...out, source: "Yahoo Finance" };
      errors.push(`Yahoo: only ${out.rows.length} days`);
    } catch (e) {
      errors.push(`Yahoo: ${e.message}`);
    }
    try {
      const csv = await fetchText(`https://stooq.com/q/d/l/?s=${stooqSymbol(symbol)}&i=d`, { userAgent: BROWSER_UA });
      const out = parseStooqCSV(csv);
      if (out.rows.length > 300) return { ...out, source: "Stooq" };
      errors.push(`Stooq: only ${out.rows.length} days`);
    } catch (e) {
      errors.push(`Stooq: ${e.message}`);
    }
    throw new Error(`no usable price history for ${symbol} (${errors.join("; ")})`);
  });
}

// ---------------------------------------------------------------- news

const MAX_NEWS_AGE_DAYS = 30;

const normTitle = (t) => t.toLowerCase().replace(/\s+-\s+[^-]+$/, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/* Google News appends " - Publisher" to every title, which would read
   as part of the headline to the sentiment scorer. */
export function cleanHeadline(title) {
  return String(title || "").replace(/\s+-\s+[^-]{2,60}$/, "").trim();
}

export function mergeNews(lists, now = Date.now()) {
  const seen = new Set();
  const out = [];
  for (const item of lists.flat()) {
    const key = normTitle(item.title);
    if (!key || seen.has(key)) continue;
    if (now - item.at > MAX_NEWS_AGE_DAYS * 24 * HOUR) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => b.at - a.at);
}

async function feed(url, source) {
  const xml = await fetchText(url, {
    userAgent: BROWSER_UA,
    accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  });
  return parseFeed(xml).map((i) => ({
    title: cleanHeadline(i.title),
    url: i.url,
    at: i.at,
    source: (i.title.match(/\s-\s([^-]{2,60})$/) || [])[1] || source,
  }));
}

const googleNews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=en-US&gl=US&ceid=US:en`;

export async function getNews(symbol, name) {
  return cached(`news-${symbol}`, TTL.news, async () => {
    const lists = [];
    const errors = [];
    const sym = yahooSymbol(symbol);
    const shortName = String(name || "").replace(/,?\s+(inc\.?|corp(oration)?\.?|co\.?|ltd\.?|plc|holdings?|company|class [a-c])\b.*$/i, "").trim();
    const query = shortName ? `"${shortName}" stock OR ${sym}` : `${sym} stock`;
    for (const [url, src] of [
      [`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`, "Yahoo Finance"],
      [googleNews(query), "Google News"],
    ]) {
      try { lists.push(await feed(url, src)); } catch (e) { errors.push(`${src}: ${e.message}`); }
    }
    if (!lists.length) throw new Error(errors.join("; "));
    return mergeNews(lists).slice(0, 60);
  });
}

export async function getMarketNews() {
  return cached("news-market", TTL.news, async () => {
    const lists = [];
    for (const q of ["stock market", "Federal Reserve interest rates", "S&P 500 outlook", "US economy recession inflation"]) {
      try { lists.push(await feed(googleNews(q), "Google News")); } catch { /* one query down is fine */ }
    }
    if (!lists.length) throw new Error("no market news feeds answered");
    return mergeNews(lists).slice(0, 120);
  });
}

// ---------------------------------------------------------------- SEC reports

async function getSecTickers() {
  return cached("sec-tickers", TTL.secTickers, async () => {
    const body = await fetchText("https://www.sec.gov/files/company_tickers.json", { userAgent: secUA(), accept: "application/json" });
    const map = {};
    for (const row of Object.values(JSON.parse(body))) {
      map[String(row.ticker).toUpperCase()] = { cik: row.cik_str, title: row.title };
    }
    return map;
  });
}

export async function getCompanyFacts(symbol) {
  const tickers = await getSecTickers();
  const hit = tickers[yahooSymbol(symbol)] || tickers[symbol.toUpperCase()];
  if (!hit) return null; // ETFs and foreign issuers don't file XBRL facts here
  const cik = String(hit.cik).padStart(10, "0");
  return cached(`sec-facts-${cik}`, TTL.secFacts, async () => {
    const body = await fetchText(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { userAgent: secUA(), accept: "application/json" });
    const json = JSON.parse(body);
    // Only keep what the analysis reads — the full file can be 10MB+.
    return { name: json.entityName || hit.title, facts: slimFacts(json.facts) };
  });
}

function slimFacts(facts) {
  const gaap = (facts && facts["us-gaap"]) || {};
  const keep = {};
  for (const list of Object.values(CONCEPTS)) {
    for (const c of list.names) if (gaap[c]) keep[c] = gaap[c];
  }
  return { "us-gaap": keep };
}
