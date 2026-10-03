// URL handling. Anything that ends up in an href goes through here, so a
// `javascript:` or `data:` URL can never be stored or rendered as a link.

const WEB_PROTOCOLS = new Set(["http:", "https:"]);
const OTHER_SAFE_PROTOCOLS = new Set(["mailto:", "tel:"]);

/**
 * Schemes password managers use for deep links to an entry. Only these
 * non-web schemes are accepted for "where is the password" references.
 */
const PASSWORD_MANAGER_PROTOCOLS = new Set([
  "onepassword:",
  "bitwarden:",
  "lastpass:",
  "dashlane:",
  "keeper:",
  "keepassxc:",
  "enpass:",
  "nordpass:",
  "proton-pass:",
  "apple-passwords:",
]);

export type UrlKind = "web" | "any";

/**
 * Normalises user input into a safe absolute URL, or returns null.
 * "example.com/x" becomes "https://example.com/x".
 */
export function normalizeUrl(input: string, kind: UrlKind = "web"): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 4096 || /\s/.test(raw)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  // "localhost:3000" looks like a scheme but is a host.
  const looksLikeHostPort = /^[\w.-]+:\d+(\/|$)/.test(raw);
  const candidate = hasScheme && !looksLikeHostPort ? raw : `https://${raw.replace(/^\/+/, "")}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  const protocol = url.protocol.toLowerCase();
  if (WEB_PROTOCOLS.has(protocol)) {
    if (!url.hostname || (!url.hostname.includes(".") && url.hostname !== "localhost")) return null;
    return url.toString();
  }
  if (kind === "any" && (OTHER_SAFE_PROTOCOLS.has(protocol) || PASSWORD_MANAGER_PROTOCOLS.has(protocol))) {
    return url.toString();
  }
  return null;
}

/** True when `href` may be rendered in an <a>. */
export function isSafeHref(href: string | null | undefined): href is string {
  if (!href) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true; // in-app
  return safeProtocol(href);
}

function safeProtocol(href: string): boolean {
  try {
    const p = new URL(href).protocol.toLowerCase();
    return WEB_PROTOCOLS.has(p) || OTHER_SAFE_PROTOCOLS.has(p) || PASSWORD_MANAGER_PROTOCOLS.has(p);
  } catch {
    return false;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}]/gi;

/** Every http(s) URL found in free text. */
export function findUrls(text: string): string[] {
  return Array.from(text.matchAll(URL_IN_TEXT), (m) => m[0]);
}

/** True when the whole (trimmed) string is a single URL. */
export function isProbablyUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return normalizeUrl(t) !== null;
  // bare domains: "example.com", "nih.gov/path"
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t) && normalizeUrl(t) !== null;
}
