/* ================================================
   MARGINALIA — server/study.mjs
   Study plans built from the pages you actually have.

   A plan is only useful if it points at something: this section, these
   pages, this question you should be able to answer afterwards. So
   every session names the source and page range it covers, and the
   check is a question whose answer is on those pages — which the
   verifier can test, because the expected answer has to be quoted from
   them.

   The other half is recall: each session carries a few questions you
   can self-test with later. They are written from the passages, not
   from the model's memory of the subject, which is the difference
   between revising your material and revising something adjacent to it.
   ================================================ */

import { systemFor, verifyEvidence } from "./grounding.mjs";

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string" },
    overview: { type: "string" },
    sessions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "number" },
          title: { type: "string" },
          minutes: { type: "number" },
          read: { type: "string" },
          why: { type: "string" },
          check: { type: "string" },
          evidence: { type: "string" },
          cite: { type: "string" },
          recall: { type: "array", items: { type: "string" } },
        },
        required: ["day", "title", "read", "check", "evidence", "cite"],
      },
    },
    gaps: { type: "string" },
  },
  required: ["goal", "sessions"],
};

export function planPrompt({ goal, days = 7, minutes = 60, context }) {
  return [
    { role: "system", content: systemFor.plan },
    {
      role: "user",
      content:
`Sources:
${context.manifest}

Passages:
${context.text}

Build a ${days}-day plan, about ${minutes} minutes a day${goal ? `, for this goal: ${goal}` : ""}.

Return JSON:
- goal: the goal restated in one sentence.
- overview: two sentences on the order of the material and why that order.
- sessions: one per day, each with
  - day (1 to ${days}), title, minutes (a realistic number, they need not all be equal)
  - read: exactly what to read, naming the source and page numbers, like "S1 pages 4-9, the Method section"
  - why: one sentence on what this session is for
  - check: a question you should be able to answer when the session is done
  - evidence: 5 to 25 words copied word for word from the passages, showing the answer is in the material
  - cite: the passage label, like [S1:p6]
  - recall: two or three short questions for later self-testing
- gaps: anything the goal needs that these sources do not contain. "" if nothing.

Only schedule reading that exists in these sources. If ${days} days is more than the material warrants, use fewer sessions and say so in the overview.`,
    },
  ];
}

export function normalisePlan(value, { context, sources }) {
  if (!value || !Array.isArray(value.sessions) || !value.sessions.length) {
    const e = new Error("the model did not return a plan");
    e.status = 502;
    throw e;
  }
  const sessions = verifyEvidence(
    value.sessions.slice(0, 60).map((s, i) => ({
      day: Number.isFinite(s.day) ? Math.max(1, Math.round(s.day)) : i + 1,
      title: String(s.title || `Session ${i + 1}`).trim().slice(0, 120),
      minutes: Number.isFinite(s.minutes) ? Math.max(10, Math.min(300, Math.round(s.minutes))) : 60,
      read: String(s.read || "").trim().slice(0, 240),
      why: String(s.why || "").trim().slice(0, 240),
      check: String(s.check || "").trim().slice(0, 240),
      evidence: String(s.evidence || "").trim(),
      cite: String(s.cite || "").trim(),
      recall: (Array.isArray(s.recall) ? s.recall : []).map((q) => String(q).trim().slice(0, 200)).filter(Boolean).slice(0, 4),
    })),
    { blocks: context.blocks }
  ).sort((a, b) => a.day - b.day);

  return {
    goal: String(value.goal || "").trim().slice(0, 240),
    overview: String(value.overview || "").trim().slice(0, 600),
    gaps: String(value.gaps || "").trim().slice(0, 400),
    sessions,
    totalMinutes: sessions.reduce((n, s) => n + s.minutes, 0),
    sourceCount: sources.length,
    check: {
      supported: sessions.filter((s) => s.verdict === "supported").length,
      weak: sessions.filter((s) => s.verdict === "weak").length,
      unsupported: sessions.filter((s) => s.verdict === "unsupported").length,
    },
  };
}
