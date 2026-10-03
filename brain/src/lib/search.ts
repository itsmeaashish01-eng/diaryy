// Search matching and ranking. The database narrows candidates to items
// whose search text contains every query word; this module ranks them.

/** Lower-cased words of a query. Quotes keep phrases together. */
export function tokenize(query: string): string[] {
  const tokens: string[] = [];
  for (const m of query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const t = (m[1] ?? m[2] ?? "").replace(/^#/, "").trim();
    if (t) tokens.push(t);
  }
  return Array.from(new Set(tokens)).slice(0, 12);
}

export interface Scorable {
  title: string;
  searchText: string;
  tags: string[];
  pinned?: boolean;
  favorite?: boolean;
  updatedAt?: Date;
}

/** Higher is better; 0 means "does not match every token". */
export function scoreMatch(tokens: string[], item: Scorable, now: Date = new Date()): number {
  if (tokens.length === 0) return 0;
  const title = item.title.toLowerCase();
  const text = item.searchText;
  let score = 0;
  for (const t of tokens) {
    if (!text.includes(t) && !title.includes(t)) return 0;
    if (title === t) score += 30;
    else if (title.startsWith(t)) score += 16;
    else if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(t)}`, "u").test(title)) score += 12;
    else if (title.includes(t)) score += 8;
    else if (item.tags.includes(t)) score += 7;
    else score += 2;
  }
  const phrase = tokens.join(" ");
  if (tokens.length > 1 && title.includes(phrase)) score += 20;
  if (item.pinned) score += 3;
  if (item.favorite) score += 2;
  if (item.updatedAt) {
    const days = (now.getTime() - item.updatedAt.getTime()) / 86_400_000;
    score += Math.max(0, 3 - days / 30); // a little recency, fading over ~3 months
  }
  return score;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits text into [before, match, after…] segments for highlighting. */
export function highlightSegments(text: string, tokens: string[]): { text: string; hit: boolean }[] {
  const words = tokens.filter(Boolean);
  if (words.length === 0) return [{ text, hit: false }];
  const re = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  return text
    .split(re)
    .filter((s) => s !== "")
    .map((s) => ({ text: s, hit: words.some((w) => w.toLowerCase() === s.toLowerCase()) }));
}
