/* ================================================
   MARGINALIA — server/deck.mjs
   Slides, as an argument rather than a list of nouns.

   The prompt asks for a claim per slide and the evidence under it,
   because that is what a person can actually stand up and say. Each
   bullet carries the passage it came from; the citation is printed
   small on the slide and in full in the speaker notes, so the answer
   to "where does that come from?" is on the screen in front of you.

   The shape produced here is what pptx.mjs writes out, and it is plain
   enough to hand-edit before you do.
   ================================================ */

import { systemFor, verifyEvidence } from "./grounding.mjs";

export const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          bullets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                evidence: { type: "string" },
                cite: { type: "string" },
              },
              required: ["text", "evidence", "cite"],
            },
          },
          quote: { type: "string" },
          notes: { type: "string" },
        },
        required: ["title", "bullets"],
      },
    },
    closing: { type: "string" },
  },
  required: ["title", "slides"],
};

export function prompt({ topic, context, slides = 8 }) {
  return [
    { role: "system", content: systemFor.deck },
    {
      role: "user",
      content:
`Sources:
${context.manifest}

Passages:
${context.text}

Write a ${slides}-slide deck${topic ? ` on: ${topic}` : " on what these sources say"}.

Return JSON:
- title, subtitle: the title slide.
- slides: each with
  - title: the claim the slide makes, as a short sentence — not a topic word.
  - bullets: two to four. Each has text (a full sentence, at most 20 words), evidence (5 to 25 words copied word for word from the passages) and cite (the passage label, like [S2:p7]).
  - quote: one sentence worth showing verbatim, or "".
  - notes: three or four sentences of what to say out loud, in the speaker's voice. Mention the page numbers here.
- closing: the one sentence you would end on.

Build the deck as an argument: what the question is, what the sources found, what follows, what is still open. If the passages don't support a slide, leave it out.`,
    },
  ];
}

export function normalise(value, { context, sources, notebook }) {
  if (!value || !Array.isArray(value.slides) || !value.slides.length) {
    const e = new Error("the model did not return any slides");
    e.status = 502;
    throw e;
  }
  const slides = value.slides.slice(0, 20).map((s) => {
    const bullets = verifyEvidence(
      (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 5).map((b) => ({
        text: String(b.text || "").trim().slice(0, 220),
        evidence: String(b.evidence || "").trim(),
        cite: String(b.cite || "").trim(),
      })).filter((b) => b.text),
      { blocks: context.blocks }
    );
    return {
      title: String(s.title || "").trim().slice(0, 120) || "Untitled slide",
      bullets,
      quote: String(s.quote || "").trim().slice(0, 240),
      notes: [
        String(s.notes || "").trim(),
        bullets.length ? `Sources: ${bullets.map((b) => b.cite).filter(Boolean).join(", ")}` : "",
        bullets.some((b) => b.verdict !== "supported")
          ? `Check before presenting: ${bullets.filter((b) => b.verdict !== "supported").map((b) => `"${b.text}"`).join("; ")}`
          : "",
      ].filter(Boolean).join("\n\n"),
    };
  });

  const all = slides.flatMap((s) => s.bullets);
  return {
    title: String(value.title || (notebook && notebook.title) || "Untitled deck").trim().slice(0, 120),
    subtitle: String(value.subtitle || "").trim().slice(0, 180),
    sourceLine: `From ${sources.length} source${sources.length === 1 ? "" : "s"} · ${sources.reduce((n, s) => n + (s.pageCount || 0), 0)} pages · built locally`,
    closing: String(value.closing || "").trim().slice(0, 240),
    slides,
    check: {
      bullets: all.length,
      supported: all.filter((b) => b.verdict === "supported").length,
      weak: all.filter((b) => b.verdict === "weak").length,
      unsupported: all.filter((b) => b.verdict === "unsupported").length,
    },
  };
}
