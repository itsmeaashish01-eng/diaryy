/* ================================================
   MARGINALIA — server/pace.mjs
   How much to put in front of the model.

   On a laptop without a usable GPU, almost all of the wait before an
   answer appears is the model *reading*, not writing. A 14B model at
   four bits reads somewhere around 30–80 tokens a second on CPU, so
   three thousand tokens of passages is most of a minute of apparently
   nothing happening, every single question — before the first word.

   Which makes the size of the context the most important speed control
   in the application, and one that belongs to the person rather than to
   me: how much evidence is worth how much waiting depends on what they
   are doing. Three settings, honest about the trade:

     fast       four passages. Good for "what does this say about X?",
                where the answer is on one page anyway.
     balanced   six. The default, and what most questions want.
     thorough   eight, and room to write at length. For a question that
                genuinely spans the whole notebook — and for machines
                where reading is cheap.

   num_ctx matters too: Ollama sizes the key-value cache from it, and a
   cache larger than the conversation is memory bandwidth spent on
   nothing. Each profile asks for a window that fits what it sends.
   ================================================ */

export const PROFILES = {
  fast: {
    id: "fast",
    label: "Fast",
    note: "4 passages — least to read before it starts",
    passages: 4,
    budget: 3000,
    context: 2048,
    predict: 500,
    summaryPassages: 8,
    structurePassages: 8,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    note: "6 passages — the default",
    passages: 6,
    budget: 6000,
    context: 4096,
    predict: 800,
    summaryPassages: 12,
    structurePassages: 12,
  },
  thorough: {
    id: "thorough",
    label: "Thorough",
    note: "8 passages, longer answers — slowest to start",
    passages: 8,
    budget: 12000,
    context: 8192,
    predict: 1500,
    summaryPassages: 16,
    structurePassages: 16,
  },
};

export const DEFAULT = "balanced";

export const profile = (name) => PROFILES[String(name || "").toLowerCase()] || PROFILES[DEFAULT];

/* A summary or a deck reads more of the notebook than a question does,
   but the same proportions apply: whichever profile is chosen, these
   are the numbers that go to the retriever and to Ollama. */
export function limits(name, kind = "ask") {
  const p = profile(name);
  const passages =
    kind === "summary" ? p.summaryPassages :
    kind === "structure" ? p.structurePassages :
    p.passages;
  return {
    id: p.id,
    passages,
    /* More passages need proportionally more room, but never more than
       three times the profile's budget — past that the reading cost
       stops being worth what it adds. */
    budget: Math.round(p.budget * Math.min(3, passages / p.passages)),
    context: kind === "ask" ? p.context : Math.max(p.context, 4096),
    predict: kind === "structure" ? Math.max(p.predict, 900) : p.predict,
  };
}

/* What the person should be told after an answer, in their terms: how
   long it spent reading, how long writing, and how fast. */
export function pace(stats) {
  if (!stats) return null;
  const promptTokens = stats.promptTokens || 0;
  const tokens = stats.tokens || 0;
  const seconds = stats.seconds || 0;
  const rate = seconds > 0 ? tokens / seconds : 0;
  return {
    promptTokens,
    tokens,
    seconds: Number(seconds.toFixed(1)),
    rate: Number(rate.toFixed(1)),
    slow: rate > 0 && rate < 8,
  };
}
