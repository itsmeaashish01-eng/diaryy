/* ================================================
   AGENTS — types/feed.mjs
   Watches an RSS or Atom feed and reports items it hasn't seen before.

   config:
     url      the feed
     match    optional regex — only items whose title or summary match
     ignore   optional regex — drop items that match this
     max      how many new items to carry into one alert (default 5)
   ================================================ */

import { getText } from "../core/net.mjs";

/* A feed is XML, but a feed in the wild is XML-shaped text: unescaped
   ampersands, CDATA, namespaced tags, attributes in any order. A real
   parser would reject half of them, so pull out the four fields that
   matter and don't pretend to more rigour than that. */
const decode = (s = "") =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

const link = (block) => {
  const plain = tag(block, "link");
  if (plain) return plain;
  // Atom puts it in an attribute instead.
  const m = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? decode(m[1]) : "";
};

export function parseFeed(xml) {
  const blocks = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) || [];
  return blocks.map((b) => {
    const title = tag(b, "title") || "(untitled)";
    const url = link(b);
    const id = tag(b, "guid") || tag(b, "id") || url || title;
    const when = tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || "";
    const body = tag(b, "description") || tag(b, "summary") || tag(b, "content") || "";
    return { key: id, title, url, detail: body.slice(0, 300), at: Date.parse(when) || Date.now() };
  });
}

export default {
  id: "feed",
  label: "Feed",
  summary: "New items in an RSS or Atom feed",

  validate(agent) {
    const errs = [];
    if (!agent.config || !agent.config.url) errs.push("needs config.url");
    for (const k of ["match", "ignore"]) {
      if (agent.config && agent.config[k]) {
        try { new RegExp(agent.config[k], "i"); }
        catch (e) { errs.push(`config.${k} is not a valid regex: ${e.message}`); }
      }
    }
    return errs;
  },

  async run(agent) {
    const c = agent.config;
    const xml = await getText(c.url, { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8" });
    let items = parseFeed(xml);
    if (!items.length) throw new Error("no <item> or <entry> elements — is that URL a feed?");

    const total = items.length;
    if (c.match) {
      const re = new RegExp(c.match, "i");
      items = items.filter((i) => re.test(i.title) || re.test(i.detail));
    }
    if (c.ignore) {
      const re = new RegExp(c.ignore, "i");
      items = items.filter((i) => !re.test(i.title) && !re.test(i.detail));
    }

    items.sort((a, b) => b.at - a.at);
    const kept = items.slice(0, Math.max(1, Number(c.max) || 5) * 4);

    return {
      observations: kept,
      metric: null,
      facts: { itemsInFeed: total, matching: items.length },
      line: c.match
        ? `${items.length} of ${total} items match /${c.match}/`
        : `${total} items in the feed`,
    };
  },

  /* What the alert says when this type has something to report. The
     runner passes only the items it hasn't shown you before. */
  describe(agent, fresh) {
    const max = Math.max(1, Number(agent.config.max) || 5);
    const shown = fresh.slice(0, max);
    const lines = shown.map((o) => `• ${o.title}${o.url ? `\n  ${o.url}` : ""}`);
    if (fresh.length > shown.length) lines.push(`…and ${fresh.length - shown.length} more`);
    return lines.join("\n");
  },
};
