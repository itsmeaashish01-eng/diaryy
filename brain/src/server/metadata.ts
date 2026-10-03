import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainOf, normalizeUrl } from "@/lib/url";

export interface PageMetadata {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  /** A data: URI, so the favicon works offline and loading it tells no one. */
  faviconUrl: string | null;
}

const MAX_HTML = 512 * 1024;
const MAX_ICON = 48 * 1024;
const TIMEOUT_MS = 6000;

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Refuses URLs that point into the local network, so "fetch the title of
 * this bookmark" can never be used to probe the machine or the LAN.
 */
async function assertPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("private host");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("private address");
}

async function safeFetch(rawUrl: string, accept: string): Promise<Response> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept, "user-agent": "Mozilla/5.0 (compatible; BrainBookmarkBot/1.0)" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}

async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > max * 4) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      if (max === MAX_ICON) return null; // a truncated icon is useless
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
}

/** Title, description and icon URL from the <head> of an HTML page. */
export function parseHead(html: string, baseUrl: string): { title: string | null; description: string | null; icon: string | null } {
  const head = html.slice(0, MAX_HTML);
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string) => {
    for (const tag of metas) {
      const k = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
      if (k === key) {
        const content = attr(tag, "content");
        if (content) return decodeEntities(content);
      }
    }
    return null;
  };
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = meta("og:title") ?? (titleTag ? decodeEntities(titleTag) : null);
  const description = meta("og:description") ?? meta("description");

  let icon: string | null = null;
  let best = -1;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !rel.includes("icon") || rel.includes("mask")) continue;
    const rank = rel.includes("apple-touch") ? 1 : 2; // prefer the small favicon
    if (rank > best) {
      try {
        icon = new URL(decodeEntities(href), baseUrl).toString();
        best = rank;
      } catch {
        // ignore malformed href
      }
    }
  }
  return { title: title?.slice(0, 300) || null, description: description?.slice(0, 1000) || null, icon };
}

async function fetchIcon(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, "image/*");
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = await readCapped(res, MAX_ICON);
    if (!bytes || bytes.length === 0) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Best-effort: anything that fails just comes back null. */
export async function fetchMetadata(input: string): Promise<PageMetadata> {
  const url = normalizeUrl(input);
  if (!url) throw new Error("invalid url");
  const result: PageMetadata = { url, domain: domainOf(url), title: null, description: null, faviconUrl: null };
  let iconUrl = new URL("/favicon.ico", url).toString();
  try {
    const res = await safeFetch(url, "text/html,application/xhtml+xml");
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.includes("html")) {
      const bytes = await readCapped(res, MAX_HTML);
      if (bytes) {
        const head = parseHead(new TextDecoder().decode(bytes), res.url || url);
        result.title = head.title;
        result.description = head.description;
        if (head.icon) iconUrl = head.icon;
      }
    }
  } catch {
    // Offline, blocked, or slow: keep what we have.
  }
  result.faviconUrl = await fetchIcon(iconUrl);
  return result;
}
