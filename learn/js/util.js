/* ================================================
   CODE CLINIC — util.js
   Small shared helpers, and the markdown the lessons are written in.
   Everything hangs off window.CC.
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  /* ---- escaping ---------------------------------------------------- */

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /* ---- markdown ---------------------------------------------------- */
  /*
     The lessons are written in a small, predictable subset of markdown:
     headings, paragraphs, lists (nested by indent), fenced code, tables,
     rules, and callouts written as  > [!TIP] Optional title.

     Everything is escaped first and only then given meaning, so a stray
     "<" in a lesson about HTML shows up as a "<" rather than as a tag.
     Links are limited to http(s), mailto, in-page anchors and relative
     paths — a lesson has no reason to need javascript: URLs, so it can't
     have them.
  */

  const CALLOUTS = {
    NOTE: "Note", TIP: "Tip", WARNING: "Careful", SAFETY: "Patient safety",
    WHY: "Why this matters", TRY: "Try it", REPO: "In your repository",
  };

  function safeHref(url) {
    const u = String(url).trim();
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;   // any other scheme
    return u;                                           // #anchor or relative
  }

  function inline(text) {
    // Code spans first: their contents are literal and must not be
    // touched by the emphasis or link rules below.
    const codes = [];
    let s = String(text).replace(/`([^`]+)`/g, (_, c) => {
      codes.push(`<code>${esc(c)}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      const h = safeHref(href.replace(/&amp;/g, "&"));
      if (h == null) return label;
      const ext = /^https?:/i.test(h);
      return `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?=[^\w*]|$)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?=[^\w]|$)/g, "$1<em>$2</em>");
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
    return s;
  }

  const indentOf = (line) => line.match(/^ */)[0].length;
  const LIST_RE = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;

  /* A list, possibly nested. Items are gathered with their continuation
     lines, and anything indented past the marker becomes a sub-list. */
  function parseList(lines, i) {
    const first = lines[i].match(LIST_RE);
    const base = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    while (i < lines.length) {
      const m = lines[i].match(LIST_RE);
      if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
      const item = { text: m[3], children: [] };
      i++;
      const sub = [];
      while (i < lines.length && lines[i].trim() !== "" && indentOf(lines[i]) > base) {
        sub.push(lines[i]);
        i++;
      }
      // A plain continuation line joins the item; a nested marker starts a list.
      let j = 0;
      while (j < sub.length && !LIST_RE.test(sub[j])) { item.text += " " + sub[j].trim(); j++; }
      if (j < sub.length) item.children = sub.slice(j);
      items.push(item);
      // A blank line between items keeps the list going.
      if (i < lines.length && lines[i].trim() === "" && i + 1 < lines.length) {
        const n = lines[i + 1].match(LIST_RE);
        if (n && n[1].length === base && /\d/.test(n[2]) === ordered) i++;
      }
    }
    const tag = ordered ? "ol" : "ul";
    const start = ordered ? parseInt(first[2], 10) : 1;
    const html = `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>` +
      items.map((it) => {
        // md() strips the common indent, so the sub-list parses on its own.
        const kids = it.children.length ? md(it.children.join("\n")) : "";
        return `<li>${inline(it.text)}${kids}</li>`;
      }).join("") + `</${tag}>`;
    return { html, next: i };
  }

  function parseTable(lines, i) {
    /* Cells split on "|", except an escaped "\|", which is a literal pipe
       (how a table shows the || operator). */
    const row = (l) => {
      const src = l.trim().replace(/^\|/, "").replace(/\|$/, "");
      const cells = [];
      let cur = "";
      for (let k = 0; k < src.length; k++) {
        if (src[k] === "\\" && src[k + 1] === "|") { cur += "|"; k++; }
        else if (src[k] === "|") { cells.push(cur.trim()); cur = ""; }
        else cur += src[k];
      }
      cells.push(cur.trim());
      return cells;
    };
    const head = row(lines[i]);
    i += 2; // header + separator
    const body = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) { body.push(row(lines[i])); i++; }
    const html =
      `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
      `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return { html, next: i };
  }

  function md(src) {
    const lines = String(src || "").replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n");
    // Lessons are written indented inside template literals; strip the
    // common indent so authors don't have to fight the source layout.
    const ind = Math.min(...lines.filter((l) => l.trim()).map(indentOf).concat([Infinity]));
    if (Number.isFinite(ind) && ind > 0) for (let k = 0; k < lines.length; k++) lines[k] = lines[k].slice(ind);

    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      const fence = line.match(/^```\s*([\w+-]*)\s*$/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        const lang = fence[1] || "";
        out.push(`<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(buf.join("\n"))}</code></pre>`);
        continue;
      }

      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        // The lesson's own title is the page's h1, so "#" and "##" both
        // become h2 and the outline never skips a level.
        const level = Math.max(2, h[1].length);
        out.push(`<h${level}>${inline(h[2])}</h${level}>`);
        i++;
        continue;
      }

      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        const kind = buf[0] && buf[0].match(/^\[!(\w+)\]\s*(.*)$/);
        if (kind && CALLOUTS[kind[1].toUpperCase()]) {
          const k = kind[1].toUpperCase();
          const title = kind[2] || CALLOUTS[k];
          out.push(`<aside class="callout callout-${k.toLowerCase()}"><p class="callout-title">${inline(title)}</p>${md(buf.slice(1).join("\n"))}</aside>`);
        } else {
          out.push(`<blockquote>${md(buf.join("\n"))}</blockquote>`);
        }
        continue;
      }

      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const t = parseTable(lines, i);
        out.push(t.html);
        i = t.next;
        continue;
      }

      if (LIST_RE.test(line)) {
        const l = parseList(lines, i);
        out.push(l.html);
        i = l.next;
        continue;
      }

      // Paragraph: runs until a blank line or the start of another block.
      const buf = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() &&
             !/^(#{1,4}\s|```|\s*>|\s*\|)/.test(lines[i]) && !LIST_RE.test(lines[i])) {
        buf.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${inline(buf.join(" "))}</p>`);
    }
    return out.join("\n");
  }

  /* ---- DOM ----------------------------------------------------------- */

  /* el("button", { class: "btn", on: { click } }, "Run") — attributes,
     listeners and children in one call. Text children are text nodes,
     never parsed as HTML. */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "text") n.textContent = v;
        else if (k === "html") n.innerHTML = v;   // only ever given our own markdown
        else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
        else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
        else if (k in n && typeof v !== "string") n[k] = v;
        else n.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Older Safari, or a page without clipboard permission.
      const ta = el("textarea", { style: { position: "fixed", opacity: "0" } });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---- small things ---------------------------------------------------- */

  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  function todayStr(d) {
    const t = d || new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }

  const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;

  /* "1h 20m" / "45 min" */
  function fmtMinutes(m) {
    const n = Math.max(0, Math.round(m));
    if (n < 60) return `${n} min`;
    const h = Math.floor(n / 60), r = n % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /* Numbers as a person would write them in a results section: no
     trailing zeros past what the size calls for, and never "-0". */
  function fmtNum(x, dp) {
    if (x == null || !Number.isFinite(x)) return "—";
    const d = dp == null ? (Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2) : dp;
    const s = x.toFixed(d);
    return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
  }

  CC.util = { esc, md, inline, safeHref, el, $, $$, copyText, download, debounce, todayStr, plural, fmtMinutes, clamp, fmtNum };
})(window.CC);
