#!/usr/bin/env node
/* ================================================
   MARGINALIA — server/selftest.mjs
   Does the thing work?

     node notebook/server/selftest.mjs

   Nothing here needs Ollama, a model, or a network. The parts that
   would call a model instead call a stub that answers on localhost and
   says predictable things — including, deliberately, one sentence that
   is not in the sources at all, so the verifier has something to
   catch. A test suite where the model always tells the truth would
   only prove the happy path.

   It writes into a temporary directory and removes it afterwards, so
   running it never touches your library.
   ================================================ */

import http from "node:http";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";

let passed = 0;
let failed = 0;
const results = [];

function check(name, condition, detail) {
  if (condition) { passed++; results.push(`  ok    ${name}`); }
  else { failed++; results.push(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`); }
}

const section = (title) => results.push(`\n${title}`);

/* ---- a PDF, written by hand -------------------------------------------- */
/*
   Small enough to read, real enough to exercise the parser: an
   uncompressed page and a Flate-compressed one, a WinAnsi font, a
   TJ array with the kerning that has to become a space, and an
   octal escape.
*/

function tinyPDF() {
  const page1 = `BT /F1 12 Tf 72 720 Td (Retrieval-augmented generation, locally.) Tj
0 -18 Td [(A 14B model at four bits needs about nine) -250 (gigabytes of memory.)] TJ
0 -18 Td (Chunk quality decides the answer, not parameter count.) Tj ET`;
  const page2Raw = `BT /F1 12 Tf 72 720 Td (Cosine similarity over normalised vectors is a dot product.) Tj
0 -18 Td (The embedding model runs beside the writer and stays under a gigabyte.) Tj ET`;
  const page2 = zlib.deflateSync(Buffer.from(page2Raw, "latin1"));

  const objects = [];
  const push = (body) => { objects.push(body); return objects.length; };

  push("<< /Type /Catalog /Pages 2 0 R >>");
  push("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>");
  push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>");
  push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>");
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  push(`<< /Length ${page1.length} >>\nstream\n${page1}\nendstream`);
  push(`<< /Length ${page2.length} /Filter /FlateDecode >>\nstream\n${page2.toString("latin1")}\nendstream`);

  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/* ---- a stub Ollama ------------------------------------------------------ */
/*
   Speaks just enough of the API: /api/tags, /api/embed and a streaming
   /api/chat. When a JSON schema is requested it answers with something
   that fits it, so the diagram, deck, plan and storyboard paths are
   exercised for real.
*/

const ANSWER =
  "Chunk quality decides the answer, not parameter count [S1:p1]. " +
  "A 14B model at four bits needs about nine gigabytes of memory [S1:p1]. " +
  "The benchmark showed a 63% improvement on the GLUE-9 suite in 2019 [S1:p2].";

function stubBody(req, body) {
  const wantsJSON = body.format && body.format !== "json";
  const prompt = JSON.stringify(body.messages || []);
  if (!wantsJSON) return ANSWER;

  if (/nodes/.test(JSON.stringify(body.format))) {
    return JSON.stringify({
      title: "How an answer is produced",
      summary: "From question to cited answer.",
      nodes: [
        { id: "chunk", label: "Split into chunks", role: "start", evidence: "Chunk quality decides the answer", cite: "[S1:p1]" },
        { id: "embed", label: "Embed each chunk", role: "step", evidence: "Cosine similarity over normalised vectors is a dot product", cite: "[S1:p2]" },
        { id: "answer", label: "Answer with citations", role: "end", evidence: "a fabricated claim about quantum annealing", cite: "[S1:p2]" },
      ],
      edges: [{ from: "chunk", to: "embed", label: "" }, { from: "embed", to: "answer", label: "top passages" }],
      missing: "",
    });
  }
  if (/slides/.test(JSON.stringify(body.format))) {
    return JSON.stringify({
      title: "Local retrieval",
      subtitle: "What these sources say",
      slides: [
        {
          title: "Retrieval sets the ceiling.",
          bullets: [
            { text: "Chunk quality decides the answer, not parameter count.", evidence: "Chunk quality decides the answer, not parameter count", cite: "[S1:p1]" },
            { text: "Nine gigabytes covers a 14B model at four bits.", evidence: "A 14B model at four bits needs about nine gigabytes", cite: "[S1:p1]" },
          ],
          quote: "Chunk quality decides the answer",
          notes: "Open here.",
        },
      ],
      closing: "Retrieval first.",
    });
  }
  if (/sessions/.test(JSON.stringify(body.format))) {
    return JSON.stringify({
      goal: "Understand local retrieval",
      overview: "Two short sessions.",
      sessions: [
        { day: 1, title: "Chunking", minutes: 45, read: "S1 page 1", why: "the core idea", check: "Why does chunk size matter?", evidence: "Chunk quality decides the answer", cite: "[S1:p1]", recall: ["What is overlap for?"] },
      ],
      gaps: "",
    });
  }
  if (/scenes/.test(JSON.stringify(body.format))) {
    return JSON.stringify({
      title: "Local retrieval, briefly",
      scenes: [
        { heading: "The question", onScreen: ["Why chunking matters"], narration: "Start with the passage, not the model.", evidence: "Chunk quality decides the answer", cite: "[S1:p1]" },
        { heading: "The maths", onScreen: ["A dot product"], narration: "Normalised vectors make similarity cheap.", evidence: "Cosine similarity over normalised vectors is a dot product", cite: "[S1:p2]" },
      ],
    });
  }
  return `{"note":"unrecognised schema","prompt":${JSON.stringify(prompt.slice(0, 40))}}`;
}

function startStub() {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};

    if (req.url === "/api/tags") {
      return json(res, {
        models: [
          { name: "stub-writer:14b", size: 9e9, details: { family: "stub", parameter_size: "14B", quantization_level: "Q4_K_M" } },
          { name: "stub-embed-text", size: 3e8, details: { family: "stub" } },
        ],
      });
    }
    if (req.url === "/api/ps") return json(res, { models: [] });
    if (req.url === "/api/embed") {
      const input = Array.isArray(body.input) ? body.input : [body.input];
      return json(res, { embeddings: input.map(fakeVector) });
    }
    if (req.url === "/api/chat") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      const text = stubBody(req, body);
      for (const piece of text.match(/.{1,40}/gs) || []) {
        res.write(JSON.stringify({ message: { content: piece }, done: false }) + "\n");
      }
      res.end(JSON.stringify({ message: { content: "" }, done: true, eval_count: 42, prompt_eval_count: 900, total_duration: 2e9 }) + "\n");
      return;
    }
    res.writeHead(404).end("{}");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const json = (res, value) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };

/* A deterministic pseudo-embedding: bag of character trigrams hashed
   into 64 dimensions. Not a good embedding; a real one, in the sense
   that similar text lands nearby, which is all the test needs. */
function fakeVector(text) {
  const dim = 64;
  const v = new Array(dim).fill(0);
  const s = String(text).toLowerCase();
  for (let i = 0; i + 3 <= s.length; i++) {
    let h = 0;
    for (const ch of s.slice(i, i + 3)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % dim] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

/* ---- a stub for the catalogues ------------------------------------------ */
/*
   arXiv answers Atom, the rest answer JSON, and one of them is broken
   on purpose: a search where a provider is down should come back with
   the other providers' results and a note, not an error page.
*/

function startCatalogues() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const json = (v) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };

    if (url.pathname === "/api/query") {
      res.writeHead(200, { "content-type": "application/atom+xml" });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <published>2017-06-12T00:00:00Z</published>
    <title>Attention Is All You Need</title>
    <summary>We propose a new simple network architecture, the Transformer.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
  </entry>
</feed>`);
    }
    if (url.pathname.startsWith("/pdf/")) {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(tinyPDF());
    }
    if (url.pathname === "/works" && url.searchParams.has("search")) {   // OpenAlex
      return json({
        results: [{
          display_name: "Attention is all you need",
          publication_year: 2017,
          doi: "https://doi.org/10.5555/3295222.3295349",
          cited_by_count: 140000,
          authorships: [{ author: { display_name: "A. Vaswani" } }],
          primary_location: { source: { display_name: "NeurIPS" } },
          best_oa_location: { pdf_url: `${globalThis.__CATALOGUE__}/pdf/1706.03762` },
          abstract_inverted_index: { The: [0], Transformer: [1], dispenses: [2], with: [3], recurrence: [4] },
        }],
      });
    }
    if (url.pathname === "/works") {                                     // Crossref search
      return json({
        message: {
          items: [{
            DOI: "10.5555/3295222.3295349",
            title: ["Attention Is All You Need"],
            author: [{ given: "Ashish", family: "Vaswani" }],
            issued: { "date-parts": [[2017]] },
            "container-title": ["NeurIPS"],
            "is-referenced-by-count": 139000,
            URL: "https://doi.org/10.5555/3295222.3295349",
          }],
        },
      });
    }
    if (url.pathname.startsWith("/works/")) {                            // a single record by DOI
      const doi = decodeURIComponent(url.pathname.replace("/works/", "")).replace(/^https:\/\/doi\.org\//, "");
      return json({
        display_name: "Deep Residual Learning for Image Recognition",
        publication_year: 2016,
        doi: `https://doi.org/${doi}`,
        authorships: [{ author: { display_name: "Kaiming He" } }],
        best_oa_location: { pdf_url: `${globalThis.__CATALOGUE__}/pdf/1512.03385` },
      });
    }
    if (url.pathname.includes("esearch")) return json({ esearchresult: { idlist: [] } });
    if (url.pathname === "/landing") {                                   // a "PDF" that is really a login page
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html>Sign in to read this article</html>");
    }
    res.writeHead(500).end("catalogue is down");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ---- the run ------------------------------------------------------------ */

const home = mkdtempSync(join(tmpdir(), "marginalia-test-"));
process.env.MARGINALIA_HOME = home;

const stub = await startStub();
process.env.OLLAMA_HOST = `http://127.0.0.1:${stub.address().port}`;

const catalogues = await startCatalogues();
const CATALOGUE = `http://127.0.0.1:${catalogues.address().port}`;
process.env.MARGINALIA_ARXIV = CATALOGUE;
process.env.MARGINALIA_CROSSREF = CATALOGUE;
process.env.MARGINALIA_OPENALEX = CATALOGUE;
process.env.MARGINALIA_PUBMED = "http://127.0.0.1:9";   // nothing listens there, on purpose

/* Imported after the environment is set, because both modules read it
   at load time. */
globalThis.__CATALOGUE__ = CATALOGUE;
const { extractPdf } = await import("./pdf.mjs");
const rag = await import("./rag.mjs");
const store = await import("./store.mjs");
const ollama = await import("./ollama.mjs");
const grounding = await import("./grounding.mjs");
const diagramMod = await import("./diagram.mjs");
const deckMod = await import("./deck.mjs");
const studyMod = await import("./study.mjs");
const videoMod = await import("./video.mjs");
const discover = await import("./discover.mjs");
const ocrMod = await import("./ocr.mjs");
const { buildDeck } = await import("./pptx.mjs");
const { zip, crc32 } = await import("./zip.mjs");

try {
  /* --- the PDF reader --- */
  section("pdf");
  const pdf = extractPdf(tinyPDF());
  check("reads both pages", pdf.pages.length === 2, `got ${pdf.pages.length}`);
  check("reads uncompressed text", /Retrieval-augmented generation, locally/.test(pdf.pages[0].text), pdf.pages[0].text.slice(0, 120));
  check("inflates a compressed page", /dot product/.test(pdf.pages[1].text), pdf.pages[1].text.slice(0, 120));
  check("kerning becomes a space", /nine gigabytes/.test(pdf.pages[0].text), pdf.pages[0].text);
  check("line breaks are kept", pdf.pages[0].text.split("\n").length >= 3, JSON.stringify(pdf.pages[0].text));
  check("a scan is reported rather than faked", extractPdf(Buffer.from("%PDF-1.4\nnothing here\n%%EOF")).warnings.length > 0);

  /* --- chunking and retrieval --- */
  section("retrieval");
  const chunks = rag.chunk(pdf.pages, { target: 120, overlap: 40 });
  check("chunks every page", new Set(chunks.map((c) => c.page)).size === 2, JSON.stringify(chunks.map((c) => c.page)));
  check("chunks keep their page", chunks.every((c) => c.page >= 1), "");
  const lib = new rag.Library(chunks.map((c, i) => ({ ...c, id: `t:${i}`, sourceId: "t" })));
  const hits = lib.search("how much memory does a 14B model need", { count: 3 });
  check("keyword search finds the right page", hits[0] && hits[0].page === 1, JSON.stringify(hits[0] && hits[0].text));

  const vectors = await ollama.embed(chunks.map((c) => c.text), { model: "stub-embed-text" });
  check("embeddings come back normalised", Math.abs(Math.hypot(...vectors[0]) - 1) < 1e-5);
  const withVectors = chunks.map((c, i) => ({ ...c, id: `t:${i}`, sourceId: "t", vector: vectors[i] }));
  const [queryVector] = await ollama.embed(["cosine similarity dot product"], { model: "stub-embed-text" });
  const hybrid = new rag.Library(withVectors).search("cosine similarity dot product", { queryVector, count: 2 });
  check("hybrid search finds the vector match", hybrid[0] && hybrid[0].page === 2, JSON.stringify(hybrid[0] && hybrid[0].text));

  /* --- verification --- */
  section("grounding");
  check("a real quotation is supported", rag.quoteSupport("chunk quality decides the answer", pdf.pages[0].text) > 0.8);
  check("an invented quotation is not", rag.quoteSupport("the model was trained on eight trillion tokens of Sanskrit", pdf.pages[0].text) < 0.25);

  /* --- the whole server, through its own API --- */
  section("server");
  const server = (await import("./server.mjs")).default;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, body, raw) => {
    const res = await fetch(base + path, {
      method,
      headers: raw ? { "content-type": "application/octet-stream", "x-filename": raw } : body ? { "content-type": "application/json" } : {},
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try { return { status: res.status, data: JSON.parse(text) }; }
    catch { return { status: res.status, data: text }; }
  };
  const stream = async (path, body) => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await res.text();
    const out = [];
    for (const block of text.split("\n\n")) {
      const event = /event: (.*)/.exec(block);
      const data = /data: (.*)/.exec(block);
      if (event && data) out.push({ event: event[1], data: JSON.parse(data[1]) });
    }
    return out;
  };

  const health = await api("GET", "/api/health");
  check("health answers", health.data.ok === true);
  check("health sees the stub", health.data.ollama.up === true, JSON.stringify(health.data.ollama));

  const nb = (await api("POST", "/api/notebooks", { title: "Test notebook" })).data;
  check("creates a notebook", Boolean(nb.id), JSON.stringify(nb));

  const added = await api("POST", `/api/notebooks/${nb.id}/sources`, tinyPDF(), "paper.pdf");
  check("adds a PDF source", added.data.source && added.data.source.pageCount === 2, JSON.stringify(added.data).slice(0, 200));
  const sourceId = added.data.source.id;

  const indexed = await stream(`/api/notebooks/${nb.id}/index`, { embedModel: "stub-embed-text" });
  check("indexes with progress", indexed.some((e) => e.event === "indexed"), JSON.stringify(indexed.map((e) => e.event)));
  check("index finishes", indexed.at(-1).event === "done", JSON.stringify(indexed.at(-1)));
  check("the index is on disk", (store.readIndex(nb.id, sourceId) || {}).chunks.length > 0);

  const asked = await stream(`/api/notebooks/${nb.id}/ask`, { question: "How much memory does the model need?", model: "stub-writer:14b", embedModel: "stub-embed-text" });
  const context = asked.find((e) => e.event === "context");
  const verified = asked.find((e) => e.event === "verified");
  check("retrieval is reported before the answer", Boolean(context) && context.data.passages.length > 0, JSON.stringify(context && context.data).slice(0, 200));
  check("passages are labelled for citation", context.data.passages.every((p) => /^\[S\d+:p\d+\]$/.test(p.label)), JSON.stringify(context.data.passages.map((p) => p.label)));
  check("the answer streams", asked.filter((e) => e.event === "token").length > 1);
  check("verification runs", Boolean(verified), "no verified event");
  check("it catches the invented sentence",
    verified.data.unsupported.some((s) => /GLUE-9/.test(s)),
    JSON.stringify(verified.data.unsupported));
  check("it does not flag the true ones",
    verified.data.grounding > 0.4 && verified.data.grounding < 1,
    `grounding ${verified.data.grounding}`);

  const diagram = (await api("POST", `/api/notebooks/${nb.id}/diagram`, { model: "stub-writer:14b", kind: "flowchart" })).data;
  check("builds a diagram", diagram.nodes && diagram.nodes.length === 3, JSON.stringify(diagram).slice(0, 200));
  check("lays out without overlapping", noOverlap(diagram.layout), "boxes overlap");
  check("edges point at real nodes", diagram.edges.every((e) => diagram.nodes.some((n) => n.id === e.from) && diagram.nodes.some((n) => n.id === e.to)));
  check("flags the unsupported box", diagram.nodes.some((n) => n.verdict === "unsupported"), JSON.stringify(diagram.nodes.map((n) => [n.id, n.verdict])));
  check("renders SVG", /<svg/.test(diagram.svg) && /Split into chunks/.test(diagram.svg));
  check("renders Mermaid", /flowchart TD/.test(diagram.mermaid), diagram.mermaid);

  const deck = (await api("POST", `/api/notebooks/${nb.id}/deck`, { model: "stub-writer:14b", diagram: false })).data;
  check("writes slides", deck.slides.length >= 1, JSON.stringify(deck).slice(0, 200));
  check("bullets carry a verdict", deck.slides[0].bullets.every((b) => b.verdict), JSON.stringify(deck.slides[0].bullets));

  const exported = (await api("POST", `/api/notebooks/${nb.id}/deck/export`, deck)).data;
  check("exports a .pptx", /\.pptx$/.test(exported.name || ""), JSON.stringify(exported));
  const pptxRes = await fetch(base + exported.url);
  const pptx = Buffer.from(await pptxRes.arrayBuffer());
  check("the .pptx downloads", pptx.length > 4000, `${pptx.length} bytes`);
  check("it is a zip whose first entry is the content types", firstEntry(pptx) === "[Content_Types].xml", firstEntry(pptx));
  check("every entry's checksum is right", zipChecksumsValid(pptx));

  const plan = (await api("POST", `/api/notebooks/${nb.id}/plan`, { model: "stub-writer:14b", days: 3 })).data;
  check("builds a study plan", plan.sessions.length >= 1 && plan.sessions[0].read, JSON.stringify(plan).slice(0, 160));

  const board = (await api("POST", `/api/notebooks/${nb.id}/storyboard`, { model: "stub-writer:14b", minutes: 2 })).data;
  check("writes a storyboard", board.scenes.length === 2, JSON.stringify(board).slice(0, 160));
  check("narration has no citation markers", board.scenes.every((s) => !/\[S\d/.test(s.narration)));
  const player = await fetch(base + board.player).then((r) => r.text());
  check("the player is self-contained", /speechSynthesis/.test(player) && !/<script src=/.test(player));
  check("the script is written out", /## 1\./.test(await fetch(base + board.script).then((r) => r.text())));

  const notebooks = (await api("GET", "/api/notebooks")).data.notebooks;
  check("the notebook is listed", notebooks.some((n) => n.id === nb.id));
  await api("DELETE", `/api/notebooks/${nb.id}`);
  check("deleting removes it", !(await api("GET", "/api/notebooks")).data.notebooks.some((n) => n.id === nb.id));

  server.close();

  /* --- finding papers --- */
  section("discover");
  const found = await discover.search("attention transformer", { providers: ["arxiv", "openalex", "crossref", "pubmed"], limit: 5 });
  check("searches several catalogues at once", found.results.length > 0, JSON.stringify(found).slice(0, 200));
  check("merges the same work into one row", found.results.length === 1, JSON.stringify(found.results.map((r) => r.title)));
  check("keeps the DOI from one and the PDF from another",
    Boolean(found.results[0].doi && found.results[0].pdfUrl),
    JSON.stringify(found.results[0]));
  check("marks what can actually be read", found.results[0].openAccess === true);
  /* Checked against OpenAlex alone: in the merged row the longer arXiv
     summary wins, which is the behaviour we want and the wrong place to
     test the un-inverting. */
  const oaOnly = await discover.search("attention", { providers: ["openalex"], limit: 1 });
  check("un-inverts an OpenAlex abstract",
    /Transformer dispenses with recurrence/.test(oaOnly.results[0].abstract), oaOnly.results[0].abstract);
  check("the merged row keeps the fuller abstract",
    found.results[0].abstract.length >= oaOnly.results[0].abstract.length, found.results[0].abstract);
  check("a catalogue that is down is reported, not fatal",
    found.problems.some((p) => p.provider === "pubmed"), JSON.stringify(found.problems));

  const fetched = await discover.fetchPaper(found.results[0]);
  check("fetches the PDF itself", fetched.buffer.subarray(0, 5).toString() === "%PDF-", fetched.buffer.subarray(0, 8).toString());
  let refusedLogin = false;
  try { await discover.fetchPaper({ title: "x", pdfUrl: `${CATALOGUE}/landing` }); }
  catch (e) { refusedLogin = /web page rather than a PDF/.test(e.message); }
  check("refuses a login page pretending to be a PDF", refusedLogin);

  const bibliography = [
    "References",
    "[1] Vaswani, A., Shazeer, N. Attention is all you need. In NeurIPS, 2017. arXiv:1706.03762",
    "[2] He, K., Zhang, X. Deep residual learning for image recognition. CVPR, 2016. doi:10.1109/CVPR.2016.90",
    "[3] Someone, A. A paper with no identifier at all. Journal of Things, 1998.",
  ].join("\n");
  const entries = discover.referenceEntries(bibliography);
  check("reads a reference list", entries.length === 3, JSON.stringify(entries.map((e) => e.raw.slice(0, 30))));
  check("finds an arXiv id", entries[0].arxivId === "1706.03762", JSON.stringify(entries[0]));
  check("finds a DOI", entries[1].doi === "10.1109/cvpr.2016.90", JSON.stringify(entries[1]));
  check("guesses a title when there is no identifier", /paper with no identifier/i.test(entries[2].title), entries[2].title);

  const resolvedRefs = await discover.resolveReferences(entries, { limit: 3 });
  check("looks references up", resolvedRefs.filter((r) => r.match).length >= 2, JSON.stringify(resolvedRefs.map((r) => Boolean(r.match))));
  check("a looked-up reference is addable", resolvedRefs.some((r) => r.match && r.match.pdfUrl));

  /* --- the same, through the API --- */
  section("discover over http");
  const server2 = (await import("./server.mjs")).default;
  await new Promise((resolve) => server2.listen(0, "127.0.0.1", resolve));
  const base2 = `http://127.0.0.1:${server2.address().port}`;
  const post2 = async (path, body) => {
    const res = await fetch(base2 + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const nb2 = (await post2("/api/notebooks", { title: "From the catalogues" })).data;
  const searched = await post2("/api/discover/search", { query: "attention", providers: ["arxiv", "openalex"] });
  check("the search endpoint answers", searched.data.results.length === 1, JSON.stringify(searched.data).slice(0, 200));
  const addedPaper = await post2(`/api/notebooks/${nb2.id}/discover/add`, searched.data.results[0]);
  check("a found paper becomes a source",
    addedPaper.data.source && addedPaper.data.source.pageCount === 2,
    JSON.stringify(addedPaper.data).slice(0, 200));
  check("the source keeps where it came from", /doi\.org|arxiv/i.test(addedPaper.data.source.url || ""), addedPaper.data.source.url);
  server2.close();

  /* --- OCR --- */
  section("ocr");
  const ocrCaps = ocrMod.capabilities();
  results.push(`  note  ${ocrCaps.available ? `${ocrCaps.engine} is installed` : `no OCR engine here (${ocrCaps.install})`}`);
  if (!ocrCaps.available) {
    let named = false;
    try { await ocrMod.ocr(tinyPDF()); }
    catch (e) { named = /install/i.test(e.message) && Boolean(e.install); }
    check("says how to install an engine rather than just failing", named);
  }
  check("thin OCR output is called thin", ocrMod.assess([{ number: 1, text: "a b" }]).ok === false);
  check("good OCR output passes", ocrMod.assess([{ number: 1, text: "x".repeat(900) }]).ok === true);

  /* --- odds and ends --- */
  section("zip");
  const archive = zip([{ name: "a.txt", data: "hello" }, { name: "b/c.txt", data: Buffer.alloc(5000, 0x41) }]);
  check("round-trips a crc", crc32(Buffer.from("hello")) === 0x3610a686, crc32(Buffer.from("hello")).toString(16));
  check("writes both entries", archive.length > 100 && firstEntry(archive) === "a.txt");
  check("deflates what compresses", archive.length < 5000, `${archive.length} bytes`);

  section("video");
  const caps = videoMod.capabilities();
  results.push(`  note  this machine ${caps.canRender ? `can render (${caps.h264 ? "mp4" : "webm"})` : "cannot render a file (no ffmpeg or browser)"}`);
  void grounding; void diagramMod; void deckMod; void studyMod;
} finally {
  stub.close();
  catalogues.close();
  rmSync(home, { recursive: true, force: true });
}

/* ---- helpers used by the checks ---------------------------------------- */

function noOverlap(layout) {
  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i];
      const b = layout.nodes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
    }
  }
  return true;
}

function firstEntry(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) return null;
  const nameLength = buf.readUInt16LE(26);
  return buf.toString("utf8", 30, 30 + nameLength);
}

/* Walk the local headers and re-check every stored checksum, which is
   what an unhappy PowerPoint would do before refusing to open. */
function zipChecksumsValid(buf) {
  let at = 0;
  while (at + 30 < buf.length && buf.readUInt32LE(at) === 0x04034b50) {
    const method = buf.readUInt16LE(at + 8);
    const stored = buf.readUInt32LE(at + 14);
    const compressed = buf.readUInt32LE(at + 18);
    const nameLength = buf.readUInt16LE(at + 26);
    const extraLength = buf.readUInt16LE(at + 28);
    const start = at + 30 + nameLength + extraLength;
    const body = buf.subarray(start, start + compressed);
    const raw = method === 8 ? zlib.inflateRawSync(body) : body;
    if (crc32(raw) !== stored) return false;
    at = start + compressed;
  }
  return true;
}

console.log(results.join("\n"));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

void readFileSync;
