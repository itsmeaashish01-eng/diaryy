// Reading TipTap/ProseMirror JSON without loading the editor: plain text for
// search and previews, Markdown for export, and the [[links]] a note makes.

import { isSafeHref } from "./url";

export interface RTMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RTNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RTNode[];
  text?: string;
  marks?: RTMark[];
}

export const ITEM_LINK_NODE = "itemLink";

export function emptyDoc(): RTNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Parses stored note content; anything unreadable becomes an empty doc. */
export function parseDoc(content: string | null | undefined): RTNode {
  if (!content) return emptyDoc();
  try {
    const value: unknown = JSON.parse(content);
    if (value && typeof value === "object" && (value as RTNode).type === "doc") return value as RTNode;
  } catch {
    // fall through
  }
  return emptyDoc();
}

/** Plain text → a doc with one paragraph per line, URLs turned into links. */
export function textToDoc(text: string): RTNode {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) => (line ? { type: "paragraph", content: inlineWithLinks(line) } : { type: "paragraph" })),
  };
}

function inlineWithLinks(line: string): RTNode[] {
  const out: RTNode[] = [];
  const re = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}]/gi;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", text: line.slice(last, start) });
    out.push({ type: "text", text: m[0], marks: [{ type: "link", attrs: { href: m[0] } }] });
    last = start + m[0].length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out;
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "taskItem",
  "bulletList",
  "orderedList",
  "taskList",
  "horizontalRule",
]);

/** Plain text of a document, one line per block. */
export function docToText(doc: RTNode): string {
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) lines.push(current.trim());
    current = "";
  };
  const walk = (node: RTNode) => {
    if (node.type === "text") current += node.text ?? "";
    else if (node.type === ITEM_LINK_NODE) current += String(node.attrs?.label ?? "");
    else if (node.type === "hardBreak") current += " ";
    if (BLOCK_TYPES.has(node.type) && current) flush();
    node.content?.forEach(walk);
    if (BLOCK_TYPES.has(node.type)) flush();
  };
  walk(doc);
  flush();
  return lines.join("\n");
}

/** Ids of every item linked with [[…]] inside the document. */
export function extractItemLinks(doc: RTNode): string[] {
  const ids = new Set<string>();
  const walk = (node: RTNode) => {
    if (node.type === ITEM_LINK_NODE && typeof node.attrs?.id === "string") ids.add(node.attrs.id);
    node.content?.forEach(walk);
  };
  walk(doc);
  return Array.from(ids);
}

/** Drops links whose href is not safe to render. Applied on every save. */
export function sanitizeDoc(node: RTNode): RTNode {
  const marks = node.marks
    ?.filter((m) => m.type !== "link" || isSafeHref(String(m.attrs?.href ?? "")))
    .map((m) => (m.type === "link" ? { type: "link", attrs: { href: String(m.attrs?.href) } } : m));
  return {
    ...node,
    ...(marks ? { marks } : {}),
    ...(node.content ? { content: node.content.map(sanitizeDoc) } : {}),
  };
}

// ---- Markdown -------------------------------------------------------------

function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function inlineMd(nodes: RTNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type === ITEM_LINK_NODE) return `[[${String(n.attrs?.label ?? "")}]]`;
      if (n.type !== "text") return inlineMd(n.content);
      const marks = n.marks ?? [];
      if (marks.length === 0) return escapeMd(n.text ?? "");
      // Markdown emphasis may not start or end with a space: keep the
      // surrounding whitespace outside the markers.
      const [, lead = "", core = "", trail = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.text ?? "") ?? [];
      if (!core) return lead + trail;
      const isCode = marks.some((m) => m.type === "code");
      let text = isCode ? `\`${core}\`` : escapeMd(core);
      if (!isCode) {
        if (marks.some((m) => m.type === "bold")) text = `**${text}**`;
        if (marks.some((m) => m.type === "italic")) text = `*${text}*`;
        if (marks.some((m) => m.type === "strike")) text = `~~${text}~~`;
      }
      const link = marks.find((m) => m.type === "link");
      if (link) text = `[${text}](${String(link.attrs?.href ?? "")})`;
      return lead + text + trail;
    })
    .join("");
}

function blockMd(node: RTNode, indent: string): string[] {
  switch (node.type) {
    case "paragraph":
      return [indent + inlineMd(node.content)];
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return [`${indent}${"#".repeat(level)} ${inlineMd(node.content)}`];
    }
    case "blockquote":
      return (node.content ?? []).flatMap((c) => blockMd(c, "")).map((l) => `${indent}> ${l}`);
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return [`${indent}\`\`\`${lang}`, ...text.split("\n").map((l) => indent + l), `${indent}\`\`\``];
    }
    case "horizontalRule":
      return [`${indent}---`];
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? []).flatMap((item, i) => {
        const marker =
          node.type === "orderedList"
            ? `${Number(node.attrs?.start ?? 1) + i}. `
            : node.type === "taskList"
              ? `- [${item.attrs?.checked ? "x" : " "}] `
              : "- ";
        const [first, ...rest] = item.content ?? [];
        const head = first ? blockMd(first, "").join("\n") : "";
        const tail = rest.flatMap((c) => blockMd(c, `${indent}  `));
        return [`${indent}${marker}${head}`, ...tail];
      });
    default:
      return node.content ? node.content.flatMap((c) => blockMd(c, indent)) : [];
  }
}

export function docToMarkdown(doc: RTNode): string {
  const blocks = (doc.content ?? []).map((n) => blockMd(n, "").join("\n"));
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
