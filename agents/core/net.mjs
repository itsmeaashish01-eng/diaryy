/* ================================================
   AGENTS — core/net.mjs
   The one way an agent reaches the outside world.

   Everything an agent fetches comes from agents.json, and agents.json is
   data — a file someone can edit, or open a pull request against. Data
   should not be able to aim a request at the machine running it, so the
   same guard the price proxy uses applies here: no loopback, no link-local,
   no private ranges, checked again on every redirect hop rather than only
   on the URL you started with.
   ================================================ */

import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_BYTES = 4 * 1024 * 1024;

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
    low.startsWith("fc") || low.startsWith("fd") ||
    low.startsWith("fe80") ||
    low.startsWith("::ffff:")
  );
}

async function assertSafeTarget(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  // Node leaves IPv6 hosts wrapped in brackets; net.isIP doesn't know them that way.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (net.isIP(host) && isPrivateAddress(host)) {
    throw new Error(`"${host}" is a private or link-local address — refusing`);
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve "${host}"`);
  }
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`"${host}" resolves to a private address — refusing`);
  }
}

/* A fetch that times out, follows redirects itself so each hop is checked,
   and refuses to read an unbounded body into memory. */
export async function safeFetch(rawUrl, opts = {}) {
  let url = new URL(rawUrl);
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeTarget(url);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: opts.method || "GET",
        headers: {
          // Plenty of feeds and pages return junk to a client with no UA.
          "User-Agent": opts.userAgent || "agents-runner/1 (+https://github.com)",
          Accept: opts.accept || "*/*",
          ...(opts.headers || {}),
        },
        body: opts.body,
        redirect: "manual",
        signal: ctl.signal,
      });
    } catch (e) {
      throw new Error(e.name === "AbortError" ? `timed out after ${timeoutMs}ms` : e.message);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res;
  }
  throw new Error(`More than ${MAX_REDIRECTS} redirects`);
}

export async function getText(url, opts) {
  const res = await safeFetch(url, opts);
  const body = await res.text();
  return body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body;
}

export async function getJSON(url, opts) {
  const body = await getText(url, { accept: "application/json", ...opts });
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Response was not JSON (starts "${body.slice(0, 60).replace(/\s+/g, " ")}")`);
  }
}

/* Timed request used by the uptime agent — it wants the latency and the
   status even when the status is a failure, so it can't use getText. */
export async function probe(url, opts = {}) {
  const started = Date.now();
  try {
    const res = await safeFetch(url, opts);
    return { up: true, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { up: false, status: 0, ms: Date.now() - started, why: e.message };
  }
}
