// Turning a pasted blob of text into an inbox item, so capturing needs no
// decisions: a URL becomes a bookmark, "todo …" becomes a task, anything
// else becomes a note. Hashtags become tags.

import { extractHashtags } from "./tags";
import type { ItemType } from "./types";
import { domainOf, isProbablyUrl, normalizeUrl } from "./url";

export type CaptureMode = "AUTO" | ItemType;

export interface CaptureResult {
  type: ItemType;
  title: string;
  body: string;
  url: string | null;
  tags: string[];
}

const TASK_PREFIX = /^(?:-\s*)?(?:\[\s?\]|todo\b:?|task\b:?|t:)\s*/i;
const NOTE_PREFIX = /^(?:note\b:?|n:)\s*/i;
const IDEA_PREFIX = /^idea\b:?\s*/i;
const TITLE_MAX = 140;

function splitTitle(text: string): { title: string; body: string } {
  const [first = "", ...rest] = text.split("\n");
  const line = first.trim();
  if (line.length <= TITLE_MAX) return { title: line, body: rest.join("\n").trim() };
  const cut = line.lastIndexOf(" ", TITLE_MAX);
  const title = `${line.slice(0, cut > 40 ? cut : TITLE_MAX)}…`;
  return { title, body: text.trim() };
}

export function parseCapture(input: string, mode: CaptureMode = "AUTO"): CaptureResult | null {
  let text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  const tags = extractHashtags(text);
  // A trailing run of hashtags is metadata, not content.
  text = text.replace(/(?:\s+#[\p{L}\p{N}][\p{L}\p{N}\-_/]*)+\s*$/u, "").trim() || text;

  // A URL on its own, or a title line followed by a URL, is a bookmark.
  const lines = text.split("\n").filter((l) => l.trim());
  const looksLikeBookmark =
    isProbablyUrl(lines[0] ?? "") || (lines.length === 2 && isProbablyUrl(lines[1]!.trim()) && !isProbablyUrl(lines[0]!));

  let type: ItemType;
  if (mode !== "AUTO") type = mode;
  else if (looksLikeBookmark) type = "BOOKMARK";
  else if (TASK_PREFIX.test(text)) type = "TASK";
  else type = "NOTE";

  if (type === "TASK") text = text.replace(TASK_PREFIX, "");
  if (NOTE_PREFIX.test(text)) text = text.replace(NOTE_PREFIX, "");
  if (IDEA_PREFIX.test(text)) {
    text = text.replace(IDEA_PREFIX, "");
    if (!tags.includes("idea")) tags.push("idea");
  }
  text = text.trim() || input.trim();

  if (type === "BOOKMARK" || type === "LINK") {
    const lines = text.split("\n");
    const urlLineIndex = lines.findIndex((l) => isProbablyUrl(l.trim()));
    const url = urlLineIndex >= 0 ? normalizeUrl(lines[urlLineIndex]!.trim()) : null;
    if (url) {
      const rest = lines.filter((_, i) => i !== urlLineIndex).join("\n").trim();
      const { title, body } = rest ? splitTitle(rest) : { title: domainOf(url), body: "" };
      return { type, title: title || domainOf(url), body, url, tags };
    }
    // Asked for a bookmark but there is no URL: keep it as a note.
    type = "NOTE";
  }

  const { title, body } = splitTitle(text);
  return { type, title: title || "Untitled", body, url: null, tags };
}
