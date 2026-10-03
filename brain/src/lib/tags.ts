/**
 * Canonical tag name: lower-case, no leading '#', words joined with '-'.
 * "#Read Later" → "read-later". Returns "" for input with nothing usable.
 */
export function normalizeTag(input: string): string {
  return input
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_/.]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeTags(inputs: readonly string[]): string[] {
  return Array.from(new Set(inputs.map(normalizeTag).filter(Boolean)));
}

/** "#urgent" style words in free text. */
export function extractHashtags(text: string): string[] {
  return normalizeTags(Array.from(text.matchAll(/(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}\-_/]*)/gu), (m) => m[1] ?? ""));
}
