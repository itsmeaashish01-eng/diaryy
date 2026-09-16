/* ================================================
   MARGINALIA — server/grounding.mjs
   The prompts, and the checking that comes after them.

   Two ideas run through this file.

   The first: a local 14B model is perfectly capable of reading six
   passages and answering from them, and perfectly capable of inventing
   a seventh. So every prompt puts the passages in front of it with
   labels, tells it to cite the label, and tells it in as many words
   that "the sources don't say" is an acceptable answer — because for a
   study tool it is the most useful answer there is.

   The second: asking for citations is not the same as getting them.
   Everything generated here goes through `verify`, which re-reads each
   claim against the passage it names and marks the ones that aren't
   there. The UI shows that mark. Nothing is silently dropped and
   nothing unsupported is silently kept.
   ================================================ */

import { resolveCitations, quoteSupport } from "./rag.mjs";

/* ---- context -------------------------------------------------------- */
/*
   Passages are labelled [S1:p4] — source one, page four — because that
   is short enough for a small model to copy without mangling, and
   specific enough for a reader to check. The label is the contract
   between the prompt and the verifier.
*/

export function buildContext(hits, sources, { budget = 12000 } = {}) {
  const indexOf = new Map(sources.map((s, i) => [s.id, i + 1]));
  const blocks = [];
  let used = 0;
  for (const hit of hits) {
    const n = indexOf.get(hit.sourceId);
    if (!n) continue;
    const label = `[S${n}:p${hit.page}]`;
    const head = hit.heading ? ` (${hit.heading})` : "";
    const block = `${label}${head}\n${hit.text.trim()}`;
    if (used + block.length > budget && blocks.length) break;
    used += block.length;
    blocks.push({ label, sourceIndex: n, sourceId: hit.sourceId, page: hit.page, text: hit.text.trim(), block });
  }
  return {
    blocks,
    text: blocks.map((b) => b.block).join("\n\n---\n\n"),
    manifest: sources.map((s, i) => `S${i + 1} = ${s.title}${s.author ? `, ${s.author}` : ""} (${s.pageCount} pages)`).join("\n"),
  };
}

const RULES = `Rules you follow without exception:
- Use only the passages given. They are the whole of what you know here.
- Put a citation on every factual sentence, in the form [S1:p4], naming the passage it came from. Several are fine: [S1:p4][S3:p9].
- If the passages do not answer the question, say exactly what is missing and stop. Do not fill the gap from memory.
- Quote rather than paraphrase when the wording matters (a definition, a number, a claim someone made).
- No preamble, no "based on the provided context", no closing summary of what you just said.`;

export const systemFor = {
  ask: `You are a careful research assistant reading someone's own library with them.
${RULES}
Answer in prose. Short paragraphs, or a list when the question is a list. Lead with the answer, then the evidence.`,

  summary: `You summarise documents for someone who will be examined on them.
${RULES}
Structure: one paragraph saying what the document is and what it claims, then the key points as bullets, then anything the document itself flags as a limitation.`,

  plan: `You build study plans from a person's own sources.
${RULES}
Every session names what to read (with page numbers), what question it answers, and how long it should take. Be concrete and honest about effort.`,

  diagram: `You turn documents into diagrams.
${RULES}
A node is a step, a component or a concept the document actually describes. An edge is a relationship the document actually states.
Never invent a step to make a diagram look complete. A five-node diagram that is right beats a twelve-node one that is half guessed.`,

  deck: `You write slides that a person will stand up and talk through.
${RULES}
A slide is a claim plus the evidence for it. Bullets are sentences, not fragments of nouns. Speaker notes say what to say out loud, in the speaker's voice.`,

  script: `You write narration to be read aloud over slides.
${RULES}
Write for the ear: short sentences, no brackets, no bullet characters, numbers written as they are spoken. Citations go in the on-screen text, never in what is spoken.`,
};

/* ---- verification --------------------------------------------------- */
/*
   Every sentence that carries a citation is re-read against the
   passage it cites. Three outcomes: supported (the wording is there),
   weak (the topic is there but the wording is not — usually a fair
   paraphrase, occasionally a drift), and unsupported (the passage does
   not contain this). The threshold is deliberately generous; the point
   is to catch the sentence that came from the model's memory rather
   than from the page, and those score near zero.
*/

const SUPPORTED = 0.5;
const WEAK = 0.22;

export function verify(text, { blocks, sources }) {
  const byLabel = new Map(blocks.map((b) => [b.label.toLowerCase(), b]));
  const bySource = new Map();
  for (const b of blocks) {
    if (!bySource.has(b.sourceIndex)) bySource.set(b.sourceIndex, []);
    bySource.get(b.sourceIndex).push(b);
  }

  const sentences = splitForCheck(text);
  const checked = [];
  for (const sentence of sentences) {
    const markers = sentence.match(/\[S\d+(?::p?\d+)?\]/gi) || [];
    if (!markers.length) { checked.push({ sentence, verdict: "uncited", score: 0, markers }); continue; }
    let best = 0;
    for (const marker of markers) {
      const exact = byLabel.get(marker.toLowerCase());
      const candidates = exact
        ? [exact]
        : bySource.get(Number(/\[S(\d+)/i.exec(marker)[1])) || [];
      for (const block of candidates) best = Math.max(best, quoteSupport(stripMarkers(sentence), block.text));
    }
    checked.push({
      sentence,
      markers,
      score: Number(best.toFixed(3)),
      verdict: best >= SUPPORTED ? "supported" : best >= WEAK ? "weak" : "unsupported",
    });
  }

  const { citations, unresolved } = resolveCitations(text, sources);
  const cited = checked.filter((c) => c.verdict !== "uncited");
  const supported = cited.filter((c) => c.verdict === "supported").length;
  const unsupported = cited.filter((c) => c.verdict === "unsupported");

  return {
    sentences: checked,
    citations,
    unresolved,
    grounding: cited.length ? Number((supported / cited.length).toFixed(2)) : null,
    unsupported: unsupported.map((c) => c.sentence.trim()),
    uncitedClaims: checked.filter((c) => c.verdict === "uncited" && looksFactual(c.sentence)).map((c) => c.sentence.trim()),
  };
}

const stripMarkers = (s) => s.replace(/\[S\d+(?::p?\d+)?\]/gi, " ");

function splitForCheck(text) {
  return String(text || "")
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z("[])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

/* A heading, a question or a transition needs no citation. A sentence
   with a number, a name or a claim in it does. */
function looksFactual(sentence) {
  const s = sentence.trim();
  if (s.length < 40) return false;
  if (/^#{1,6}\s|^[-*]\s*$|\?$/.test(s)) return false;
  return /\d|\b(is|are|was|were|shows?|found|reports?|uses?|requires?|causes?|increases?|reduces?)\b/i.test(s);
}

/* ---- structured output ---------------------------------------------- */
/*
   Diagrams, decks and plans come back as JSON, and each piece of that
   JSON carries `evidence`: a short quotation the model says it is
   working from. That quotation is checked against the cited passage
   the same way a sentence is. A node whose evidence is nowhere in the
   sources is kept but flagged — the person asked for a diagram of
   their documents, and being told which box is shaky is more useful
   than being handed a tidy diagram with a lie in it.
*/

export function verifyEvidence(items, { blocks }) {
  const byLabel = new Map(blocks.map((b) => [b.label.toLowerCase(), b]));
  const all = blocks.map((b) => b.text).join("\n\n");
  return items.map((item) => {
    const quote = item.evidence || item.quote || "";
    const cite = (item.cite || item.citation || "").trim();
    if (!quote) return { ...item, support: 0, verdict: "uncited" };
    const block = byLabel.get(cite.toLowerCase());
    const score = block ? quoteSupport(quote, block.text) : quoteSupport(quote, all);
    return {
      ...item,
      cite: block ? block.label : cite,
      page: block ? block.page : item.page || null,
      sourceId: block ? block.sourceId : item.sourceId || null,
      support: Number(score.toFixed(3)),
      verdict: score >= SUPPORTED ? "supported" : score >= WEAK ? "weak" : "unsupported",
    };
  });
}

/* Turn a verification into one line a person can act on. */
export function groundingNote(report) {
  if (!report || report.grounding == null) return "";
  const pct = Math.round(report.grounding * 100);
  const bits = [`${pct}% of the cited sentences match their passage`];
  if (report.unsupported.length) bits.push(`${report.unsupported.length} did not — they are marked below`);
  if (report.unresolved.length) bits.push(`${report.unresolved.length} citation(s) point at nothing: ${report.unresolved.join(", ")}`);
  return bits.join("; ") + ".";
}
