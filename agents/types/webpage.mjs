/* ================================================
   AGENTS — types/webpage.mjs
   Tells you when a page changes, and can pull a number out of it.

   config:
     url       the page
     region    optional regex with one capture group — narrows the watch
               to just that part of the page, so a rotating advert or a
               "generated at" footer doesn't count as a change
     number    optional regex with one capture group — the captured text
               becomes this agent's metric, so threshold rules work
     ignore    optional regex — text matching it is stripped before
               comparing (timestamps, view counters, csrf tokens)
   ================================================ */

import { getText } from "../core/net.mjs";

/* Enough HTML flattening to compare two versions of a page fairly.
   Scripts and styles change constantly and say nothing. */
export function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/* A short, stable fingerprint. Not cryptography — just a value that
   changes when the text does and fits in a state file. */
export function digest(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2654435761) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 16);
}

const num = (v) => {
  const s = String(v).replace(/[^\d.,\-]/g, "");
  const cleaned = /,\d{1,2}$/.test(s) && !/\.\d/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,/g, "");
  return parseFloat(cleaned);
};

function firstGroup(text, pattern, what) {
  const re = new RegExp(pattern, "i");
  const m = text.match(re);
  if (!m) throw new Error(`config.${what} matched nothing on the page`);
  return m[1] !== undefined ? m[1] : m[0];
}

export default {
  id: "webpage",
  label: "Web page",
  summary: "A page changed, or a number on it crossed a line",

  validate(agent) {
    const errs = [];
    const c = agent.config || {};
    if (!c.url) errs.push("needs config.url");
    for (const k of ["region", "number", "ignore"]) {
      if (c[k]) {
        try { new RegExp(c[k], "i"); }
        catch (e) { errs.push(`config.${k} is not a valid regex: ${e.message}`); }
      }
    }
    return errs;
  },

  async run(agent, ctx) {
    const c = agent.config;
    const html = await getText(c.url, { accept: "text/html,application/xhtml+xml,*/*;q=0.8" });

    let text = c.region ? toText(firstGroup(html, c.region, "region")) : toText(html);
    if (c.ignore) text = text.replace(new RegExp(c.ignore, "gi"), " ").replace(/\s+/g, " ").trim();
    if (!text) throw new Error("the page had no readable text left after filtering");

    const fingerprint = digest(text);
    const previous = ctx.state.memo.fingerprint || "";
    const changed = Boolean(previous) && previous !== fingerprint;

    let metric = null;
    if (c.number) {
      const raw = firstGroup(text, c.number, "number");
      const v = num(raw);
      if (!Number.isFinite(v)) throw new Error(`config.number captured "${raw}", which is not a number`);
      metric = v;
    }

    /* The observation key is the fingerprint, so "this page is in a state
       I have already told you about" is the same question as "have I seen
       this key". Re-appearing old content correctly stays quiet. */
    const observations = changed
      ? [{
          key: fingerprint,
          title: `${agent.label} changed`,
          detail: excerptAround(text, ctx.state.memo.text || ""),
          url: c.url,
          at: Date.now(),
        }]
      : [];

    return {
      observations,
      metric,
      memo: { fingerprint, text: text.slice(0, 2000) },
      facts: { characters: text.length, changed, ...(metric == null ? {} : { value: metric }) },
      line: metric == null
        ? (previous ? (changed ? "the page changed" : "no change") : "first look — recorded for comparison")
        : `${metric}${changed ? " · page changed" : ""}`,
    };
  },

  describe(agent, fresh) {
    return fresh.map((o) => o.detail).filter(Boolean).join("\n") || "The page changed.";
  },
};

/* Show the first place the two versions diverge rather than the whole
   page — an alert you have to scroll is an alert you stop reading. */
function excerptAround(now, before) {
  if (!before) return now.slice(0, 200);
  let i = 0;
  while (i < now.length && i < before.length && now[i] === before[i]) i++;
  const from = Math.max(0, i - 60);
  return `…${now.slice(from, from + 220).trim()}…`;
}
