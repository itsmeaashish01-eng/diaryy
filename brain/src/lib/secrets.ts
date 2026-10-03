// A warning, not a filter: the app should never become a password store, so
// text that looks like a credential is flagged before it is saved.

const PATTERNS: { label: string; re: RegExp }[] = [
  { label: "a password", re: /\b(password|passwd|pwd|passcode|pin)\s*[:=]\s*\S+/i },
  { label: "a security answer", re: /\b(security|secret)\s+(question|answer)\s*[:=]/i },
  { label: "recovery codes", re: /\b(recovery|backup)\s+codes?\s*[:=]/i },
  { label: "an API key or token", re: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|bearer)\s*[:=]?\s*[A-Za-z0-9_\-.]{12,}/i },
  { label: "an API key or token", re: /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/ },
  { label: "a private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** What kind of secret the text appears to contain, or null. */
export function detectSecret(text: string): string | null {
  if (!text) return null;
  for (const { label, re } of PATTERNS) if (re.test(text)) return label;
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return "a card number";
  }
  return null;
}
