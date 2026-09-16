/* ================================================
   MARGINALIA — server/store.mjs
   Where the library lives.

   Plain files under notebook/private/, one directory per notebook:

     library/<notebook>/notebook.json     title, sources, notes, chats
     library/<notebook>/sources/<id>.pdf  exactly the bytes you added
     library/<notebook>/sources/<id>.txt  the extracted text, page by page
     library/<notebook>/index/<id>.json   chunks and their vectors
     library/<notebook>/out/              decks, diagrams, videos

   No database. You can read every file in here with `cat`, copy the
   directory to another machine, or delete a notebook with `rm -r` and
   nothing will be left behind pointing at it. private/ is in
   .gitignore, so none of it can be committed by accident — which
   matters, because this is where your unpublished drafts and other
   people's papers end up.
   ================================================ */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, renameSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";

import { extractPdf } from "./pdf.mjs";
import { chunk, Library, packVectors, unpackVectors } from "./rag.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.MARGINALIA_HOME || join(here, "..", "private", "library");

const ensure = (dir) => { mkdirSync(dir, { recursive: true }); return dir; };

/* Write through a temporary file and rename. A notebook.json truncated
   by a crash mid-write would take the whole notebook with it. */
function writeJSON(path, value) {
  ensure(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

const readJSON = (path, fallback = null) => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return fallback; }
};

const slug = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "notebook";

const nbDir = (id) => join(ROOT, id);
const nbFile = (id) => join(nbDir(id), "notebook.json");

/* ---- notebooks ------------------------------------------------------ */

export function listNotebooks() {
  ensure(ROOT);
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readJSON(nbFile(e.name)))
    .filter(Boolean)
    .map(summarise)
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
}

const summarise = (nb) => ({
  id: nb.id,
  title: nb.title,
  created: nb.created,
  updated: nb.updated,
  sources: (nb.sources || []).length,
  pages: (nb.sources || []).reduce((n, s) => n + (s.pageCount || 0), 0),
  notes: (nb.notes || []).length,
  chats: (nb.chats || []).length,
});

export function createNotebook({ title = "Untitled notebook", about = "" } = {}) {
  ensure(ROOT);
  const base = slug(title);
  let id = base;
  let n = 2;
  while (existsSync(nbDir(id))) id = `${base}-${n++}`;
  const now = new Date().toISOString();
  const nb = { id, title, about, created: now, updated: now, sources: [], notes: [], chats: [], outputs: [] };
  ensure(nbDir(id));
  writeJSON(nbFile(id), nb);
  return nb;
}

export function getNotebook(id) {
  const nb = readJSON(nbFile(id));
  if (!nb) { const e = new Error(`no notebook called "${id}"`); e.status = 404; throw e; }
  nb.sources = nb.sources || [];
  nb.notes = nb.notes || [];
  nb.chats = nb.chats || [];
  nb.outputs = nb.outputs || [];
  return nb;
}

export function saveNotebook(nb) {
  nb.updated = new Date().toISOString();
  writeJSON(nbFile(nb.id), nb);
  caches.delete(nb.id);
  return nb;
}

export function deleteNotebook(id) {
  getNotebook(id);
  rmSync(nbDir(id), { recursive: true, force: true });
  caches.delete(id);
}

/* ---- sources -------------------------------------------------------- */

const KIND = {
  ".pdf": "pdf", ".txt": "text", ".md": "text", ".markdown": "text",
  ".csv": "text", ".json": "text", ".html": "html", ".htm": "html",
};

export function sourceKind(filename) {
  const ext = /\.[a-z0-9]+$/i.exec(String(filename || ""));
  return KIND[(ext && ext[0].toLowerCase()) || ""] || null;
}

/* Strip tags well enough to read an article saved from a browser.
   Script and style go entirely; block elements become line breaks. */
function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* Text files have no pages, so make some: a page every ~3000
   characters, broken at a paragraph. Citations then point at something
   findable instead of at "the file". */
function paginate(text, size = 3000) {
  const paragraphs = text.split(/\n\s*\n/);
  const pages = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf.length + p.length > size && buf) { pages.push(buf.trim()); buf = ""; }
    buf += p + "\n\n";
  }
  if (buf.trim()) pages.push(buf.trim());
  return pages.map((t, i) => ({ number: i + 1, text: t }));
}

export function addSource(notebookId, { filename, buffer, title, url = "" }) {
  const nb = getNotebook(notebookId);
  const kind = sourceKind(filename) || (url ? "html" : "text");
  const id = randomUUID().slice(0, 8);
  const dir = ensure(join(nbDir(nb.id), "sources"));

  let pages = [];
  let warnings = [];
  let info = {};

  if (kind === "pdf") {
    const result = extractPdf(buffer);
    pages = result.pages;
    warnings = result.warnings;
    info = result.info;
    writeFileSync(join(dir, `${id}.pdf`), buffer);
  } else {
    const raw = buffer.toString("utf8");
    pages = paginate(kind === "html" ? htmlToText(raw) : raw);
  }

  const text = pages.map((p) => p.text).join("\n\f\n");
  writeFileSync(join(dir, `${id}.txt`), text);

  const source = {
    id,
    title: title || info.title || String(filename || url || "untitled").replace(/\.[a-z0-9]+$/i, ""),
    filename: filename || "",
    url,
    kind,
    added: new Date().toISOString(),
    pageCount: pages.length,
    chars: text.length,
    author: info.author || "",
    warnings,
    sha: createHash("sha256").update(buffer).digest("hex").slice(0, 16),
    indexed: null,
  };
  nb.sources.push(source);
  saveNotebook(nb);
  return { source, pages };
}

export function sourcePages(notebookId, sourceId) {
  const file = join(nbDir(notebookId), "sources", `${sourceId}.txt`);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n\f\n").map((text, i) => ({ number: i + 1, text }));
}

export function sourceFile(notebookId, sourceId) {
  const file = join(nbDir(notebookId), "sources", `${sourceId}.pdf`);
  return existsSync(file) ? file : null;
}

export function removeSource(notebookId, sourceId) {
  const nb = getNotebook(notebookId);
  nb.sources = nb.sources.filter((s) => s.id !== sourceId);
  for (const f of [
    join(nbDir(nb.id), "sources", `${sourceId}.pdf`),
    join(nbDir(nb.id), "sources", `${sourceId}.txt`),
    join(nbDir(nb.id), "index", `${sourceId}.json`),
  ]) rmSync(f, { force: true });
  saveNotebook(nb);
}

/* ---- the index ------------------------------------------------------ */
/*
   Chunk once, embed once, store beside the source. Re-embedding a
   hundred-page paper takes a minute or two on a laptop, so the result
   is kept and only redone when the embedding model changes.
*/

const indexFile = (notebookId, sourceId) => join(nbDir(notebookId), "index", `${sourceId}.json`);

export function readIndex(notebookId, sourceId) {
  const data = readJSON(indexFile(notebookId, sourceId));
  if (!data) return null;
  const vectors = unpackVectors(data.vectors || { dim: 0, data: "" });
  return {
    ...data,
    chunks: data.chunks.map((c, i) => ({ ...c, sourceId, vector: vectors[i] || null })),
  };
}

export function chunkSource(notebookId, sourceId) {
  const pages = sourcePages(notebookId, sourceId);
  return chunk(pages).map((c, i) => ({ ...c, id: `${sourceId}:${i}`, sourceId }));
}

export function writeIndex(notebookId, sourceId, { chunks, vectors, embedModel }) {
  const payload = {
    sourceId,
    embedModel: embedModel || null,
    built: new Date().toISOString(),
    chunks: chunks.map((c) => ({ id: c.id, page: c.page, heading: c.heading, ordinal: c.ordinal, text: c.text })),
    vectors: vectors && vectors.length ? packVectors(vectors) : { dim: 0, data: "" },
  };
  writeJSON(indexFile(notebookId, sourceId), payload);
  const nb = getNotebook(notebookId);
  const source = nb.sources.find((s) => s.id === sourceId);
  if (source) {
    source.indexed = { at: payload.built, chunks: chunks.length, embedModel: payload.embedModel };
    saveNotebook(nb);
  }
  return payload;
}

/* Libraries are rebuilt from the per-source index files and cached
   until something in the notebook changes. The cache key includes the
   index files' modification times, so an index rebuilt in another tab
   is picked up without a restart. */
const caches = new Map();

export function library(notebookId) {
  const nb = getNotebook(notebookId);
  const stamp = nb.sources
    .map((s) => {
      const f = indexFile(notebookId, s.id);
      try { return `${s.id}:${statSync(f).mtimeMs}`; } catch { return `${s.id}:none`; }
    })
    .join("|");
  const cached = caches.get(notebookId);
  if (cached && cached.stamp === stamp) return cached.library;

  const chunks = [];
  for (const source of nb.sources) {
    const index = readIndex(notebookId, source.id);
    if (index) { chunks.push(...index.chunks); continue; }
    /* Not embedded yet — still searchable, lexically. Being usable the
       moment a PDF lands matters more than being optimal. */
    chunks.push(...chunkSource(notebookId, source.id));
  }
  const lib = new Library(chunks);
  caches.set(notebookId, { stamp, library: lib });
  return lib;
}

export const forgetLibrary = (notebookId) => caches.delete(notebookId);

/* ---- notes, chats and outputs --------------------------------------- */

export function addNote(notebookId, note) {
  const nb = getNotebook(notebookId);
  const entry = {
    id: randomUUID().slice(0, 8),
    created: new Date().toISOString(),
    title: note.title || "Note",
    body: note.body || "",
    kind: note.kind || "note",                          // note | answer | summary | plan
    citations: note.citations || [],
    pinned: Boolean(note.pinned),
  };
  nb.notes.unshift(entry);
  saveNotebook(nb);
  return entry;
}

export function updateNote(notebookId, noteId, patch) {
  const nb = getNotebook(notebookId);
  const note = nb.notes.find((n) => n.id === noteId);
  if (!note) { const e = new Error("no such note"); e.status = 404; throw e; }
  Object.assign(note, patch, { id: note.id, created: note.created });
  saveNotebook(nb);
  return note;
}

export function removeNote(notebookId, noteId) {
  const nb = getNotebook(notebookId);
  nb.notes = nb.notes.filter((n) => n.id !== noteId);
  saveNotebook(nb);
}

export function recordChat(notebookId, turn) {
  const nb = getNotebook(notebookId);
  nb.chats.push({ at: new Date().toISOString(), ...turn });
  if (nb.chats.length > 200) nb.chats = nb.chats.slice(-200);
  saveNotebook(nb);
}

export function outputDir(notebookId) {
  return ensure(join(nbDir(notebookId), "out"));
}

export function recordOutput(notebookId, output) {
  const nb = getNotebook(notebookId);
  nb.outputs.unshift({ at: new Date().toISOString(), ...output });
  nb.outputs = nb.outputs.slice(0, 60);
  saveNotebook(nb);
  return output;
}
