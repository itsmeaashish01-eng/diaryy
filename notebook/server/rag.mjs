/* ================================================
   MARGINALIA — server/rag.mjs
   Chunking, indexing and retrieval.

   The model is the part everyone thinks about and the part that
   matters least here. What decides whether an answer is right is
   whether the six passages put in front of the model were the right
   six, and whether each one still knows which page it came from. So:

     chunk()    splits on paragraph and sentence boundaries, never
                mid-word, and keeps the page number and the nearest
                heading with every piece.

     search()   runs a lexical search and a vector search and fuses the
                two rankings. Embeddings alone miss exact terms — a
                model number, a gene name, an author — and keywords
                alone miss paraphrase. Fusing costs nothing and fails
                in fewer ways than either.

   Nothing here needs a GPU, and with no embedding model installed the
   lexical half works on its own.
   ================================================ */

const STOP = new Set(
  ("a an the and or but if then than that this these those of in on at to from by for with without into over under " +
   "is are was were be been being it its as we our you your they their he she his her i not no so such which who whom " +
   "what when where why how can could should would may might will shall do does did done have has had also very more " +
   "most least much many some any each other another both either neither per via using used use between among about")
    .split(" ")
);

export const tokenise = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z0-9'+#.-]+/)
    .map((t) => t.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((t) => t.length > 1 && t.length < 40 && !STOP.has(t));

/* ---- chunking ------------------------------------------------------ */
/*
   Windows of about a thousand characters with a couple of sentences of
   overlap. Small enough that a citation points at something a person
   can check by eye, large enough that the argument survives the cut.
   A heading line seen on the way is carried into every chunk beneath
   it, which is what lets an answer say "under Method" rather than
   "somewhere on page 7".
*/

const HEADING = /^(?:\d+(?:\.\d+)*\.?\s+[A-Z].{2,70}|[A-Z][A-Za-z ]{2,60}|(?:ABSTRACT|INTRODUCTION|METHODS?|RESULTS?|DISCUSSION|CONCLUSIONS?|REFERENCES|APPENDIX)\b.{0,60})$/;

function splitSentences(text) {
  const out = [];
  const re = /[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[0];
    if (s.trim()) out.push(s);
    if (re.lastIndex === m.index) re.lastIndex++;         // guard against an empty match
  }
  return out.length ? out : [text];
}

export function chunk(pages, { target = 1000, overlap = 200, min = 120 } = {}) {
  const chunks = [];
  let heading = "";

  for (const page of pages) {
    const paragraphs = String(page.text || "").split(/\n\s*\n/);
    let buf = "";
    let bufHeading = heading;

    const flush = (force) => {
      const text = buf.trim();
      buf = "";
      if (!text) return;
      if (text.length < min && !force && chunks.length) {
        /* Too small to stand alone: give it to the chunk before,
           provided that one is on the same page. */
        const prev = chunks[chunks.length - 1];
        if (prev.page === page.number && prev.text.length + text.length < target * 1.6) {
          prev.text += "\n" + text;
          return;
        }
      }
      chunks.push({ page: page.number, heading: bufHeading, text });
      bufHeading = heading;
    };

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const firstLine = trimmed.split("\n")[0];
      if (trimmed.length < 80 && HEADING.test(firstLine) && !/[.;,]$/.test(firstLine)) {
        flush(false);
        heading = firstLine.trim();
        bufHeading = heading;
        buf = firstLine + "\n";
        continue;
      }
      for (const sentence of splitSentences(trimmed)) {
        if (buf.length + sentence.length > target && buf.length >= min) {
          const carry = tailSentences(buf, overlap);
          flush(false);
          buf = carry;
        }
        buf += sentence;
      }
      buf += "\n\n";
    }
    flush(true);
  }

  return chunks.map((c, i) => ({ ...c, ordinal: i, text: c.text.trim() }));
}

/* The last couple of sentences of a chunk, to open the next one with.
   Overlap is what stops a fact that straddles a boundary from being
   invisible to both halves. */
function tailSentences(text, budget) {
  const sentences = splitSentences(text);
  let out = "";
  for (let i = sentences.length - 1; i >= 0 && out.length < budget; i--) out = sentences[i] + out;
  return out.trim() ? out.trim() + " " : "";
}

/* ---- lexical scoring ------------------------------------------------ */
/*
   BM25 over the chunk texts. It is thirty lines, it needs no model,
   and it is the half of retrieval that never confuses "GPT-4" with
   "GPT-3" the way a cosine sometimes does.
*/

export class Lexical {
  constructor(docs) {
    this.docs = docs;                                   // [{ id, text }]
    this.df = new Map();
    this.terms = [];
    this.lengths = [];
    for (const d of docs) {
      const tokens = tokenise(d.text);
      const tf = new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
      this.terms.push(tf);
      this.lengths.push(tokens.length || 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / (this.lengths.length || 1) || 1;
  }

  score(query, { k1 = 1.4, b = 0.75 } = {}) {
    const q = tokenise(query);
    const n = this.docs.length;
    const scores = new Float64Array(n);
    for (const term of new Set(q)) {
      const df = this.df.get(term) || 0;
      if (!df) continue;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (let i = 0; i < n; i++) {
        const tf = this.terms[i].get(term);
        if (!tf) continue;
        const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + (b * this.lengths[i]) / this.avgLength));
        scores[i] += idf * norm;
      }
    }
    return scores;
  }
}

/* ---- vectors -------------------------------------------------------- */

export const dot = (a, b) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

export const packVectors = (vectors) => {
  if (!vectors.length) return { dim: 0, data: "" };
  const dim = vectors[0].length;
  const flat = new Float32Array(dim * vectors.length);
  vectors.forEach((v, i) => flat.set(v, i * dim));
  return { dim, data: Buffer.from(flat.buffer).toString("base64") };
};

export const unpackVectors = ({ dim, data }) => {
  if (!dim || !data) return [];
  const buf = Buffer.from(data, "base64");
  const flat = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const out = [];
  for (let i = 0; i + dim <= flat.length; i += dim) out.push(flat.subarray(i, i + dim));
  return out;
};

/* ---- fusion --------------------------------------------------------- */
/*
   Reciprocal rank fusion. Two rankings, one list, no weights to tune
   and no scale to normalise — the only thing that matters is where a
   chunk placed in each list. A chunk both methods like rises; a chunk
   only one of them likes still gets a hearing, which is the point.
*/

function rankOf(scores) {
  const order = [...scores.keys()].sort((a, b) => scores[b] - scores[a]);
  const rank = new Map();
  order.forEach((idx, position) => { if (scores[idx] > 0) rank.set(idx, position + 1); });
  return rank;
}

export function fuse(rankings, { k = 60, count = 8 } = {}) {
  const totals = new Map();
  for (const rank of rankings) {
    for (const [idx, position] of rank) totals.set(idx, (totals.get(idx) || 0) + 1 / (k + position));
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([idx, score]) => ({ idx, score }));
}

/* ---- the searchable library ---------------------------------------- */
/*
   One of these is built per notebook, from the chunks of whichever
   sources the question is allowed to see. Building it is cheap
   (milliseconds for a few thousand chunks); holding stale ones is not
   worth the bugs, so the server rebuilds on demand and caches by
   source revision.
*/

export class Library {
  constructor(chunks) {
    this.chunks = chunks;                               // [{ id, sourceId, page, heading, text, vector? }]
    this.lexical = new Lexical(chunks.map((c) => ({ id: c.id, text: `${c.heading}\n${c.text}` })));
  }

  get size() { return this.chunks.length; }

  search(query, { queryVector = null, count = 8, sourceIds = null } = {}) {
    if (!this.chunks.length) return [];
    const allowed = sourceIds && sourceIds.length ? new Set(sourceIds) : null;

    const lexScores = this.lexical.score(query);
    const vecScores = new Float64Array(this.chunks.length);
    if (queryVector) {
      for (let i = 0; i < this.chunks.length; i++) {
        const v = this.chunks[i].vector;
        vecScores[i] = v ? dot(queryVector, v) : 0;
      }
    }
    if (allowed) {
      for (let i = 0; i < this.chunks.length; i++) {
        if (!allowed.has(this.chunks[i].sourceId)) { lexScores[i] = 0; vecScores[i] = 0; }
      }
    }

    const rankings = [rankOf(lexScores)];
    if (queryVector) rankings.push(rankOf(vecScores));
    const fused = fuse(rankings, { count: count * 3 });

    /* Don't hand the model six chunks from one paragraph. Take the
       best from each page first, then fill. */
    const picked = [];
    const perPage = new Map();
    for (const { idx, score } of fused) {
      const c = this.chunks[idx];
      const key = `${c.sourceId}:${c.page}`;
      const used = perPage.get(key) || 0;
      if (used >= 2) continue;
      perPage.set(key, used + 1);
      picked.push({ ...c, score, lexical: lexScores[idx], vector: undefined, similarity: vecScores[idx] });
      if (picked.length >= count) break;
    }
    if (picked.length < count) {
      for (const { idx, score } of fused) {
        if (picked.length >= count) break;
        const c = this.chunks[idx];
        if (picked.some((p) => p.id === c.id)) continue;
        picked.push({ ...c, score, lexical: lexScores[idx], vector: undefined, similarity: vecScores[idx] });
      }
    }
    return picked;
  }

  byId(id) { return this.chunks.find((c) => c.id === id) || null; }
}

/* ---- checking a claim against the sources -------------------------- */
/*
   Used everywhere something generated says it came from somewhere: the
   answer's citations, a diagram node's evidence, a slide's bullet. It
   is a similarity test on words, not a proof, but it catches the thing
   that actually goes wrong — a quotation that appears nowhere in the
   document, attached to a claim the document never made.
*/

export function quoteSupport(quote, chunkText) {
  const q = tokenise(quote);
  if (!q.length) return 0;
  const haystack = String(chunkText || "").toLowerCase();
  if (haystack.includes(String(quote).toLowerCase().trim())) return 1;

  const present = new Set(tokenise(haystack));
  const hits = q.filter((t) => present.has(t)).length;
  const coverage = hits / q.length;

  /* Word order counts for something: five words in sequence is a
     quotation, five words scattered over a page is a coincidence. */
  const shingle = (arr, n) => {
    const out = new Set();
    for (let i = 0; i + n <= arr.length; i++) out.add(arr.slice(i, i + n).join(" "));
    return out;
  };
  const qShingles = shingle(q, 3);
  if (!qShingles.size) return coverage;
  const hayShingles = shingle(tokenise(haystack), 3);
  let matched = 0;
  for (const s of qShingles) if (hayShingles.has(s)) matched++;
  return 0.4 * coverage + 0.6 * (matched / qShingles.size);
}

export const CITATION = /\[S(\d+)(?::p?(\d+))?\]/gi;

/* Pull [S2:p14]-style markers out of generated text and say which of
   them point at something real. Anything that doesn't is returned as
   `unresolved` so the caller can strike it rather than quietly
   pretending it was fine. */
export function resolveCitations(text, sources) {
  const found = [];
  const unresolved = [];
  const str = String(text || "");
  let m;
  CITATION.lastIndex = 0;
  while ((m = CITATION.exec(str))) {
    const index = Number(m[1]);
    const page = m[2] ? Number(m[2]) : null;
    const source = sources[index - 1];
    if (!source) { unresolved.push(m[0]); continue; }
    if (page != null && source.pageCount && (page < 1 || page > source.pageCount)) { unresolved.push(m[0]); continue; }
    found.push({ marker: m[0], sourceIndex: index, sourceId: source.id, title: source.title, page });
  }
  const seen = new Set();
  return {
    citations: found.filter((c) => { const k = c.marker; if (seen.has(k)) return false; seen.add(k); return true; }),
    unresolved: [...new Set(unresolved)],
  };
}
