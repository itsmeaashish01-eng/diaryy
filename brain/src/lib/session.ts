// Signed session cookies (HMAC-SHA256 via Web Crypto, so the same code runs
// in the proxy and in route handlers). The cookie holds only an expiry time
// and its signature — no password, no user data.

export const SESSION_COOKIE = "brain_session";
export const SESSION_DAYS = 30;

export function authEnabled(): boolean {
  return Boolean(process.env.AUTH_PASSWORD_HASH && process.env.AUTH_SECRET);
}

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, now: number = Date.now()): Promise<string> {
  const expires = String(now + SESSION_DAYS * 86_400_000);
  return `${expires}.${await hmac(secret, `session:${expires}`)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now: number = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  return constantTimeEqual(signature, await hmac(secret, `session:${expires}`));
}
