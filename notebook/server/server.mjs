#!/usr/bin/env node
/* ================================================
   MARGINALIA — server/server.mjs
   The one process you run.

     node notebook/server/server.mjs

   Then open http://127.0.0.1:8099. It serves the page, holds the
   library, talks to Ollama on your behalf, and writes decks and videos
   into the notebook's own out/ directory.

   It listens on the loopback address only. Not because the code is
   fragile, but because a notebook full of unpublished work and other
   people's papers has no business being reachable from the café's
   wifi. MARGINALIA_BIND can override that if you know why you want to.

   No dependencies. Node 18 or newer.

   Environment:
     PORT              default 8099
     MARGINALIA_BIND   default 127.0.0.1
     MARGINALIA_HOME   where notebooks live; default notebook/private/library
     OLLAMA_HOST       default http://127.0.0.1:11434
   ================================================ */

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, extname, normalize, basename } from "node:path";
import { fileURLToPath } from "node:url";

import * as ollama from "./ollama.mjs";
import * as store from "./store.mjs";
import * as diagram from "./diagram.mjs";
import * as video from "./video.mjs";
import * as discover from "./discover.mjs";
import * as ocr from "./ocr.mjs";
import { buildContext, systemFor, verify, groundingNote } from "./grounding.mjs";
import { buildDeck } from "./pptx.mjs";
import { toSVG, toMermaid } from "./diagram.mjs";
import { SCHEMA as DECK_SCHEMA, prompt as deckPrompt, normalise as normaliseDeck } from "./deck.mjs";
import { planPrompt, PLAN_SCHEMA, normalisePlan } from "./study.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, "..");
const PORT = Number(process.env.PORT || 8099);
const BIND = process.env.MARGINALIA_BIND || "127.0.0.1";
const MAX_UPLOAD = 200 * 1024 * 1024;

/* ---- plumbing -------------------------------------------------------- */

const send = (res, status, body, headers = {}) => {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json" : "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
};

const fail = (res, e) => {
  const status = e && e.status ? e.status : 500;
  if (status >= 500) console.error("[marginalia]", e);
  send(res, status, { error: String((e && e.message) || e), detail: e && e.detail });
};

async function readBody(req, limit = MAX_UPLOAD) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) { const e = new Error("that file is too large"); e.status = 413; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const readJSONBody = async (req) => {
  const raw = await readBody(req, 4 * 1024 * 1024);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString("utf8")); }
  catch { const e = new Error("that wasn't JSON"); e.status = 400; throw e; }
};

/* Server-sent events, for anything that takes long enough to watch:
   answers as they are written, embedding progress, video rendering. */
function sse(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  let open = true;
  res.on("close", () => { open = false; });
  return {
    get open() { return open; },
    send(event, data) {
      if (!open) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() { if (open) res.end(); },
  };
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".pdf": "application/pdf", ".md": "text/markdown; charset=utf-8",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp4": "video/mp4", ".webm": "video/webm", ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(res, urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const file = join(WEB, rel === "/" || rel === "." ? "index.html" : rel);
  if (!file.startsWith(WEB)) return send(res, 403, "no");
  try {
    const info = await stat(file);
    if (info.isDirectory()) return serveStatic(res, join(rel, "index.html"));
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, "not found");
  }
}

/* ---- retrieval, shared by everything that answers ------------------- */
/*
   One path in and out: embed the question if there is an embedding
   model, search, build a labelled context. Every feature — answers,
   summaries, diagrams, decks, plans, scripts — goes through this, so
   they all cite the same way and they all fail the same way.
*/

async function gather(notebookId, { question, sourceIds, count = 8, embedModel, signal }) {
  const nb = store.getNotebook(notebookId);
  const sources = sourceIds && sourceIds.length ? nb.sources.filter((s) => sourceIds.includes(s.id)) : nb.sources;
  if (!sources.length) {
    const e = new Error("this notebook has no sources yet — add a PDF first");
    e.status = 400;
    throw e;
  }
  const lib = store.library(notebookId);

  let queryVector = null;
  const anyEmbedded = lib.chunks.some((c) => c.vector);
  if (embedModel && anyEmbedded) {
    try { [queryVector] = await ollama.embed([question], { model: embedModel, signal }); }
    catch (e) { if (e instanceof ollama.OllamaDown) throw e; }
  }

  const hits = lib.search(question, { queryVector, count, sourceIds: sources.map((s) => s.id) });
  const context = buildContext(hits, sources);
  return { nb, sources, hits, context, retrieval: queryVector ? "hybrid" : "keyword" };
}

/* ---- the routes ------------------------------------------------------ */

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const rx = new RegExp(
    "^" + pattern.replace(/:[a-z]+/gi, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$"
  );
  routes.push({ method, rx, keys, handler });
};

/* --- health and models --- */

/*
   Health has to be instant: the page asks for it before it draws
   anything, and again every half minute. So it reports what is already
   known about ffmpeg and OCR — null until the background probe
   finishes — and never waits for either. /api/tools is where a caller
   that genuinely wants the answer goes.
*/
route("GET", "/api/health", async (req, res) => {
  video.capabilities.warm();
  ocr.capabilities.warm();
  const out = {
    ok: true,
    home: store.ROOT,
    ollama: { host: ollama.host, up: false },
    video: video.known(),
    ocr: ocr.known(),
    probing: !video.known() || !ocr.known(),
  };
  try {
    /* A short leash. If Ollama is wedged rather than absent, the page
       should still come up and say so. */
    const m = await ollama.models({ timeout: 2500 });
    out.ollama = { host: m.host, up: true, chat: m.chat.length, embed: m.embed.length };
  } catch (e) {
    out.ollama.error = e.message;
  }
  send(res, 200, out);
});

route("GET", "/api/tools", async (req, res) => {
  const [videoCaps, ocrCaps] = await Promise.all([video.capabilities(), ocr.capabilities()]);
  send(res, 200, { video: videoCaps, ocr: ocrCaps });
});

route("GET", "/api/models", async (req, res) => {
  try {
    const m = await ollama.models();
    send(res, 200, { ...m, running: await ollama.running() });
  } catch (e) {
    /* The model list failing is not fatal — the app still reads PDFs
       and searches them. Say so rather than showing an error page. */
    send(res, 200, { host: ollama.host, chat: [], embed: [], all: [], recommended: ollama.RECOMMENDED, error: e.message });
  }
});

route("POST", "/api/pull", async (req, res) => {
  const { model } = await readJSONBody(req);
  if (!model) return send(res, 400, { error: "which model?" });
  const stream = sse(res);
  try {
    await ollama.pull(model, (p) => stream.send("progress", p));
    stream.send("done", { model });
  } catch (e) {
    stream.send("failed", { error: e.message });
  }
  stream.end();
});

/* --- notebooks --- */

route("GET", "/api/notebooks", (req, res) => send(res, 200, { notebooks: store.listNotebooks() }));

route("POST", "/api/notebooks", async (req, res) => {
  const body = await readJSONBody(req);
  send(res, 200, store.createNotebook(body));
});

route("GET", "/api/notebooks/:id", (req, res, { id }) => send(res, 200, store.getNotebook(id)));

route("PATCH", "/api/notebooks/:id", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const nb = store.getNotebook(id);
  if (body.title) nb.title = String(body.title).slice(0, 120);
  if (body.about !== undefined) nb.about = String(body.about).slice(0, 2000);
  send(res, 200, store.saveNotebook(nb));
});

route("DELETE", "/api/notebooks/:id", (req, res, { id }) => {
  store.deleteNotebook(id);
  send(res, 200, { deleted: id });
});

/* --- sources --- */

route("POST", "/api/notebooks/:id/sources", async (req, res, { id }) => {
  const filename = String(req.headers["x-filename"] || "upload.pdf");
  const buffer = await readBody(req);
  if (!buffer.length) return send(res, 400, { error: "empty file" });
  const { source } = store.addSource(id, { filename, buffer });
  store.forgetLibrary(id);
  send(res, 200, { source });
});

route("POST", "/api/notebooks/:id/sources/url", async (req, res, { id }) => {
  const { url } = await readJSONBody(req);
  if (!/^https?:\/\//i.test(url || "")) return send(res, 400, { error: "that isn't a URL" });
  /* Fetching a page the person asked for is the one outward call this
     server makes, and only ever on an explicit click. */
  const response = await fetch(url, { headers: { "user-agent": "Marginalia/1 (local research notebook)" }, redirect: "follow" });
  if (!response.ok) return send(res, 502, { error: `that URL answered ${response.status}` });
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type") || "";
  const name = basename(new URL(url).pathname) || "page.html";
  const filename = /pdf/i.test(type) || name.endsWith(".pdf") ? (name.endsWith(".pdf") ? name : `${name}.pdf`) : `${name}.html`;
  const { source } = store.addSource(id, { filename, buffer, url });
  store.forgetLibrary(id);
  send(res, 200, { source });
});

route("DELETE", "/api/notebooks/:id/sources/:sid", (req, res, { id, sid }) => {
  store.removeSource(id, sid);
  store.forgetLibrary(id);
  send(res, 200, { deleted: sid });
});

route("GET", "/api/notebooks/:id/sources/:sid/pages", (req, res, { id, sid }) => {
  send(res, 200, { pages: store.sourcePages(id, sid) });
});

route("GET", "/api/notebooks/:id/sources/:sid/file", async (req, res, { id, sid }) => {
  const file = store.sourceFile(id, sid);
  if (!file) return send(res, 404, { error: "no original file kept for this source" });
  res.writeHead(200, { "content-type": "application/pdf" });
  createReadStream(file).pipe(res);
});

/* Embedding, with progress, because on a laptop this is the one step
   that takes minutes rather than seconds. */
route("POST", "/api/notebooks/:id/index", async (req, res, { id }) => {
  const { embedModel, sourceIds } = await readJSONBody(req);
  const nb = store.getNotebook(id);
  const targets = nb.sources.filter((s) => !sourceIds || sourceIds.includes(s.id));
  const stream = sse(res);
  try {
    for (const source of targets) {
      const existing = store.readIndex(id, source.id);
      if (existing && existing.embedModel === embedModel && existing.chunks.length) {
        stream.send("source", { id: source.id, title: source.title, chunks: existing.chunks.length, skipped: true });
        continue;
      }
      const chunks = store.chunkSource(id, source.id);
      stream.send("source", { id: source.id, title: source.title, chunks: chunks.length });
      let vectors = [];
      if (embedModel) {
        const batch = 16;
        for (let i = 0; i < chunks.length; i += batch) {
          if (!stream.open) return;
          const slice = chunks.slice(i, i + batch);
          const embedded = await ollama.embed(slice.map((c) => `${c.heading ? c.heading + "\n" : ""}${c.text}`), { model: embedModel });
          vectors.push(...embedded);
          stream.send("progress", { id: source.id, done: Math.min(i + batch, chunks.length), total: chunks.length });
        }
      }
      store.writeIndex(id, source.id, { chunks, vectors, embedModel });
      stream.send("indexed", { id: source.id, chunks: chunks.length, embedded: vectors.length });
    }
    store.forgetLibrary(id);
    stream.send("done", { notebook: id });
  } catch (e) {
    stream.send("failed", { error: e.message });
  }
  stream.end();
});

/* --- asking --- */

route("POST", "/api/notebooks/:id/ask", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const question = String(body.question || "").trim();
  if (!question) return send(res, 400, { error: "ask something" });
  const stream = sse(res);
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    const { context, hits, sources, retrieval } = await gather(id, {
      question,
      sourceIds: body.sourceIds,
      count: body.count || 8,
      embedModel: body.embedModel,
      signal: abort.signal,
    });
    stream.send("context", {
      retrieval,
      passages: context.blocks.map((b) => ({ label: b.label, page: b.page, sourceId: b.sourceId, preview: b.text.slice(0, 240) })),
      searched: hits.length,
    });

    const history = (body.history || []).slice(-6).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
    const messages = [
      { role: "system", content: systemFor.ask },
      ...history,
      {
        role: "user",
        content: `Sources:\n${context.manifest}\n\nPassages:\n${context.text}\n\nQuestion: ${question}`,
      },
    ];

    let answer = "";
    for await (const part of ollama.stream(messages, {
      model: body.model,
      temperature: body.temperature ?? 0.2,
      context: body.contextWindow || 8192,
      signal: abort.signal,
    })) {
      if (part.delta) { answer += part.delta; stream.send("token", { delta: part.delta }); }
      if (part.done) stream.send("stats", part.stats);
    }

    const report = verify(answer, { blocks: context.blocks, sources });
    stream.send("verified", { ...report, note: groundingNote(report) });
    store.recordChat(id, { question, answer, model: body.model, grounding: report.grounding });
    stream.send("done", {});
  } catch (e) {
    stream.send("failed", { error: e.message });
  }
  stream.end();
});

/* --- summaries --- */

const SUMMARY_KINDS = {
  brief: "A summary of about 200 words, then five bullets of the key points.",
  detailed: "A structured summary: what it is, what it claims, how it argues it, what it measures, what it concedes.",
  faq: "Eight questions a reader would ask, each with a short answer.",
  timeline: "The events or steps in order, with dates or page references.",
  critique: "What is well supported here, what is asserted without support, and what a sceptical reader should check.",
};

route("POST", "/api/notebooks/:id/summarise", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const kind = SUMMARY_KINDS[body.kind] ? body.kind : "brief";
  const stream = sse(res);
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  try {
    const query = body.focus || "main claims, method, results, limitations, conclusions";
    const { context, sources } = await gather(id, {
      question: query,
      sourceIds: body.sourceIds,
      count: body.count || 14,
      embedModel: body.embedModel,
      signal: abort.signal,
    });
    const messages = [
      { role: "system", content: systemFor.summary },
      {
        role: "user",
        content: `Sources:\n${context.manifest}\n\nPassages:\n${context.text}\n\n${SUMMARY_KINDS[kind]}${body.focus ? `\n\nFocus on: ${body.focus}` : ""}`,
      },
    ];
    let text = "";
    for await (const part of ollama.stream(messages, { model: body.model, temperature: 0.2, context: 8192, signal: abort.signal })) {
      if (part.delta) { text += part.delta; stream.send("token", { delta: part.delta }); }
    }
    const report = verify(text, { blocks: context.blocks, sources });
    stream.send("verified", { ...report, note: groundingNote(report) });
    stream.send("done", {});
  } catch (e) {
    stream.send("failed", { error: e.message });
  }
  stream.end();
});

/* --- diagrams --- */

route("POST", "/api/notebooks/:id/diagram", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const { context } = await gather(id, {
    question: body.topic || "the process, the components and how they connect",
    sourceIds: body.sourceIds,
    count: body.count || 12,
    embedModel: body.embedModel,
  });
  const graph = await diagram.build({ topic: body.topic, kind: body.kind, context, model: body.model });
  send(res, 200, { ...graph, svg: toSVG(graph, { theme: body.theme }), mermaid: toMermaid(graph) });
});

route("POST", "/api/notebooks/:id/diagram/export", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const graph = body.graph;
  if (!graph || !graph.nodes) return send(res, 400, { error: "no diagram to export" });
  const name = `${slugName(graph.title)}.svg`;
  const file = join(store.outputDir(id), name);
  writeFileSync(file, toSVG(graph, { theme: body.theme }));
  store.recordOutput(id, { kind: "diagram", name, title: graph.title });
  send(res, 200, { name, url: `/api/notebooks/${id}/out/${encodeURIComponent(name)}` });
});

/* --- decks --- */

route("POST", "/api/notebooks/:id/deck", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const { context, sources, nb } = await gather(id, {
    question: body.topic || "the argument, the evidence and the conclusions",
    sourceIds: body.sourceIds,
    count: body.count || 16,
    embedModel: body.embedModel,
  });
  const { value } = await ollama.json(
    deckPrompt({ topic: body.topic, context, slides: body.slides || 8 }),
    { model: body.model, schema: DECK_SCHEMA, context: 8192 }
  );
  const deck = normaliseDeck(value, { context, sources, notebook: nb });
  if (body.diagram) {
    try {
      const graph = await diagram.build({ topic: body.topic, kind: body.diagramKind || "flowchart", context, model: body.model });
      deck.slides.splice(Math.min(1, deck.slides.length), 0, {
        title: graph.title,
        diagram: graph,
        notes: `${graph.summary}\n\nEvidence: ${graph.nodes.map((n) => `${n.label} ${n.cite}`).join("; ")}`,
      });
      deck.diagram = graph;
    } catch { /* a deck without the diagram is still a deck */ }
  }
  send(res, 200, deck);
});

route("POST", "/api/notebooks/:id/deck/export", async (req, res, { id }) => {
  const deck = await readJSONBody(req);
  if (!deck || !Array.isArray(deck.slides)) return send(res, 400, { error: "no slides to export" });
  const name = `${slugName(deck.title)}.pptx`;
  const file = join(store.outputDir(id), name);
  writeFileSync(file, buildDeck(deck));
  store.recordOutput(id, { kind: "deck", name, title: deck.title, slides: deck.slides.length + 1 });
  send(res, 200, { name, url: `/api/notebooks/${id}/out/${encodeURIComponent(name)}` });
});

/* --- study plans --- */

route("POST", "/api/notebooks/:id/plan", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const { context, sources } = await gather(id, {
    question: body.goal || "what this material covers and in what order it should be learned",
    sourceIds: body.sourceIds,
    count: body.count || 16,
    embedModel: body.embedModel,
  });
  const { value } = await ollama.json(
    planPrompt({ goal: body.goal, days: body.days || 7, minutes: body.minutes || 60, context }),
    { model: body.model, schema: PLAN_SCHEMA, context: 8192 }
  );
  send(res, 200, normalisePlan(value, { context, sources }));
});

/* --- video --- */

route("GET", "/api/video/capabilities", async (req, res) => send(res, 200, await video.capabilities()));

route("POST", "/api/notebooks/:id/storyboard", async (req, res, { id }) => {
  const body = await readJSONBody(req);
  const { context } = await gather(id, {
    question: body.topic || "the story these sources tell",
    sourceIds: body.sourceIds,
    count: body.count || 14,
    embedModel: body.embedModel,
  });
  const board = await video.storyboard({ topic: body.topic, context, model: body.model, minutes: body.minutes || 3 });
  const dir = store.outputDir(id);
  const stem = slugName(board.title);
  writeFileSync(join(dir, `${stem}-script.md`), video.narrationScript(board));
  writeFileSync(join(dir, `${stem}-player.html`), video.playerHTML(board, { diagramSVG: body.diagramSVG || null }));
  store.recordOutput(id, { kind: "storyboard", name: `${stem}-player.html`, title: board.title });
  send(res, 200, {
    ...board,
    player: `/api/notebooks/${id}/out/${encodeURIComponent(`${stem}-player.html`)}`,
    script: `/api/notebooks/${id}/out/${encodeURIComponent(`${stem}-script.md`)}`,
    capabilities: await video.capabilities(),
  });
});

route("POST", "/api/notebooks/:id/video", async (req, res, { id }) => {
  const board = await readJSONBody(req);
  if (!board || !Array.isArray(board.scenes) || !board.scenes.length) return send(res, 400, { error: "no storyboard" });
  const stream = sse(res);
  try {
    const caps = await video.capabilities();
    const name = `${slugName(board.title)}.${caps.h264 ? "mp4" : "webm"}`;
    const file = join(store.outputDir(id), name);
    stream.send("started", caps);
    const result = await video.render(board, file, { onProgress: (p) => stream.send("progress", p) });
    store.recordOutput(id, { kind: "video", name, title: board.title, silent: result.silent });
    stream.send("done", { ...result, name, url: `/api/notebooks/${id}/out/${encodeURIComponent(name)}` });
  } catch (e) {
    stream.send("failed", { error: e.message });
  }
  stream.end();
});

/* --- finding papers that aren't here yet --- */
/*
   The one part of this application that talks to the internet, and it
   only does so when somebody presses something. Searching returns
   records; fetching a file is a second, separate click.
*/

route("GET", "/api/discover/providers", (req, res) =>
  send(res, 200, { providers: discover.PROVIDERS, contact: Boolean(process.env.MARGINALIA_CONTACT) }));

route("POST", "/api/discover/search", async (req, res) => {
  const body = await readJSONBody(req);
  const found = await discover.search(body.query, {
    providers: Array.isArray(body.providers) && body.providers.length ? body.providers : undefined,
    limit: Math.min(25, Math.max(1, Number(body.limit) || 8)),
  });
  send(res, 200, found);
});

route("POST", "/api/notebooks/:id/discover/add", async (req, res, { id }) => {
  const result = await readJSONBody(req);
  const { buffer, filename, url } = await discover.fetchPaper(result);
  const { source } = store.addSource(id, {
    filename,
    buffer,
    title: result.title || filename,
    url: result.url || url,
  });
  store.forgetLibrary(id);
  send(res, 200, { source });
});

/* The bibliography of something already in the notebook, looked up so
   that "this cites something interesting" becomes a source. */
route("POST", "/api/notebooks/:id/sources/:sid/references", async (req, res, { id, sid }) => {
  const body = await readJSONBody(req);
  const pages = store.sourcePages(id, sid);
  if (!pages.length) return send(res, 404, { error: "no text for that source" });
  const entries = discover.referenceEntries(pages.map((p) => p.text).join("\n"));
  const stream = sse(res);
  stream.send("entries", { found: entries.length });
  try {
    const resolved = await discover.resolveReferences(entries, { limit: Math.min(50, Number(body.limit) || 25) });
    for (const item of resolved) {
      if (!stream.open) return;
      stream.send("reference", item);
    }
    stream.send("done", { resolved: resolved.filter((r) => r.match).length, total: entries.length });
  } catch (e) {
    stream.send("failed", { error: e.message });
  }
  stream.end();
});

/* --- OCR, for the sources that are pictures of paper --- */

route("GET", "/api/ocr/capabilities", async (req, res) => send(res, 200, await ocr.capabilities()));

route("POST", "/api/notebooks/:id/sources/:sid/ocr", async (req, res, { id, sid }) => {
  const body = await readJSONBody(req);
  const file = store.sourceFile(id, sid);
  const stream = sse(res);
  if (!file) {
    stream.send("failed", { error: "that source has no PDF to read — OCR only applies to scans" });
    return stream.end();
  }

  try {
    stream.send("started", await ocr.capabilities());
    const { pages, engine, pdf, warnings } = await ocr.ocr(readFileSync(file), {
      language: String(body.language || "eng").slice(0, 40),
      onProgress: (p) => stream.send("progress", p),
    });
    const verdict = ocr.assess(pages);
    const source = store.replaceSourceText(id, sid, pages, {
      pdf,
      via: engine,
      warnings: [...(warnings || []), ...(verdict.ok ? [] : [verdict.note])],
    });
    stream.send("done", { source, engine, note: verdict.note, ok: verdict.ok });
  } catch (e) {
    stream.send("failed", { error: e.message });
  }
  stream.end();
});

/* --- notes and outputs --- */

route("POST", "/api/notebooks/:id/notes", async (req, res, { id }) => send(res, 200, store.addNote(id, await readJSONBody(req))));
route("PATCH", "/api/notebooks/:id/notes/:nid", async (req, res, { id, nid }) => send(res, 200, store.updateNote(id, nid, await readJSONBody(req))));
route("DELETE", "/api/notebooks/:id/notes/:nid", (req, res, { id, nid }) => { store.removeNote(id, nid); send(res, 200, { deleted: nid }); });

route("GET", "/api/notebooks/:id/out/:name", async (req, res, { id, name }) => {
  const clean = basename(decodeURIComponent(name));
  const file = join(store.outputDir(id), clean);
  try {
    await stat(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(clean)] || "application/octet-stream",
      "content-disposition": /\.(html|svg)$/i.test(clean) ? "inline" : `attachment; filename="${clean}"`,
    });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, { error: "no such file" });
  }
});

const slugName = (s) =>
  String(s || "marginalia").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "marginalia";

/* ---- the server ------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  /* A page on another origin must not be able to drive this. */
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)) {
    return send(res, 403, { error: "cross-origin requests are not accepted" });
  }

  if (!url.pathname.startsWith("/api/")) return serveStatic(res, url.pathname);

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.rx.exec(url.pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    try {
      await r.handler(req, res, params, url);
    } catch (e) {
      if (!res.headersSent) fail(res, e);
      else { try { res.end(); } catch { /* client went away */ } }
    }
    return;
  }
  send(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
});

/* Importing this file (the self-test does) should not take a port.
   Only running it directly starts the thing. */
const runningDirectly = process.argv[1] && process.argv[1].endsWith("server.mjs");
if (runningDirectly) server.listen(PORT, BIND, async () => {
  console.log(`\n  Marginalia — http://${BIND}:${PORT}`);
  console.log(`  library     ${store.ROOT}`);
  try {
    const m = await ollama.models();
    console.log(`  ollama      ${m.host} — ${m.chat.length} chat model(s), ${m.embed.length} embedding model(s)`);
    if (!m.chat.length) console.log(`              nothing installed yet: ollama pull ${ollama.RECOMMENDED.chat[0].name}`);
    if (!m.embed.length) console.log(`              for better search:     ollama pull ${ollama.RECOMMENDED.embed[0].name}`);
  } catch {
    console.log(`  ollama      not answering on ${ollama.host} — start it with "ollama serve"`);
  }
  const caps = await video.capabilities();
  console.log(`  video       ${caps.canRender ? `can render (${caps.h264 ? "mp4" : "webm"}${caps.tts ? `, voice via ${caps.tts}` : ", silent"})` : "storyboard and player only (no ffmpeg or browser found)"}`);
  const ocrCaps = await ocr.capabilities();
  console.log(`  ocr         ${ocrCaps.available ? `${ocrCaps.engine} — scans can be read` : `none installed (${ocrCaps.install})`}`);
  console.log("");
});

export default server;
