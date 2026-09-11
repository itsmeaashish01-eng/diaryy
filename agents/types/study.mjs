/* ================================================
   AGENTS — types/study.mjs
   A fellowship's worth of learning material, kept honest.

   Point it at a folder of notes — guidelines, treatment algorithms,
   papers you've summarised, anything you've written down — and it does
   four things no folder does on its own:

     remembers what's new       so a note you added is acknowledged once
     schedules review           spaced repetition off each note's own
                                "reviewed" date, because a note read once
                                is a note forgotten
     ages the sources           a guideline has a shelf life; this tells
                                you when yours is old enough to re-check
     insists on provenance      a treatment algorithm with no source on
                                it gets flagged, every time, until it has
                                one

   With ANTHROPIC_API_KEY set and "synthesize": true, it also writes a
   study card beside each new or changed note — a condensed version for
   revision. Three rules are wired into how that works, because a
   summariser loose in clinical material is only useful if it's bounded:

     · it never touches your note. Cards are written to a separate
       .card.md file and your original is the only thing that's edited
       by you.
     · it is told to carry numbers across verbatim and to add nothing
       that isn't in the note. Where the note is ambiguous it must say
       so rather than resolve it.
     · every card carries the source and date from your own header, and
       says on its face that it's derived — so when a card and a
       guideline disagree, it's obvious which one wins.

   config:
     library             folder of notes (default agents/private/study)
     reviewAfterDays     spaced-repetition ladder ([1, 7, 30, 90, 180])
     sourceMaxAgeDays    a source older than this wants re-checking (730)
     requireSource       flag notes with no source (true)
     synthesize          write study cards, needs a key (false)
     maxSynthPerRun      cards per run, so one big import can't run away (3)

   Note headers are optional but this is what it reads:

     ---
     title: DKA — management
     topic: endocrine
     source: ADA Standards of Care
     sourceDate: 2025-01-01
     reviewed: 2026-08-14
     tags: [algorithm, emergency]
     ---
   ================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { relative } from "node:path";
import { listFiles, daysSince, staleBucket, plural, isoDay } from "../core/local.mjs";
import { askClaude } from "../core/brain.mjs";

const LADDER = [1, 7, 30, 90, 180];

/* A small, forgiving front-matter reader. Notes are written by a person
   in a hurry between clinics; this should read what they actually typed,
   not reject it on a colon. */
export function parseHeader(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const head = {};
  if (!m) return { head, body: text };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim().replace(/^["']|["']$/g, "");
    if (/^\[.*\]$/.test(v)) {
      v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    }
    head[kv[1].toLowerCase()] = v;
  }
  return { head, body: text.slice(m[0].length).trim() };
}

/* Same cheap fingerprint the webpage type uses — changes when the text
   does, and fits in a state file. */
export function digest(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2654435761) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 16);
}

/* Which rung of the ladder is a note on, and is it due?

   Spaced repetition needs to know how many times you've been through
   something, and a note only carries one date. So the agent counts: each
   time the "reviewed" date changes from what it last saw, that note moves
   up a rung. Read something today and it comes back tomorrow; read it
   again and it comes back in a week, then a month. Which is the whole
   point — a note you know well should stop asking for attention. */
export function reviewDue(daysSinceReviewed, ladder, reps = 0) {
  if (daysSinceReviewed == null) return null;
  const step = ladder[Math.min(reps, ladder.length - 1)];
  return daysSinceReviewed >= step ? step : null;
}

/* Tags that make a missing source matter more than usual: these are the
   notes you'd act on, not just the ones you'd read. */
const isActionable = (head) => {
  const tags = Array.isArray(head.tags) ? head.tags : head.tags ? [head.tags] : [];
  return tags.some((t) => /algorithm|protocol|dose|dosing|regimen/i.test(String(t)));
};

const SYNTH_SYSTEM = [
  "You condense one clinical study note into a revision card for the doctor who wrote it.",
  "",
  "Absolute rules:",
  "1. Use ONLY what is in the note. Add no facts, no doses, no thresholds, no indications",
  "   from your own knowledge, even if you believe the note is incomplete or wrong.",
  "2. Copy every number, dose, unit, rate and cut-off EXACTLY as written. Never round,",
  "   convert, or normalise a unit.",
  "3. Where the note is ambiguous, incomplete or internally inconsistent, say so plainly",
  "   under a 'Gaps' heading instead of resolving it. That flag is the most useful thing",
  "   on the card.",
  "4. No preamble and no sign-off. Markdown, no top-level heading.",
  "",
  "Shape: a one-line summary, then 'Key points' as short bullets, then 'Gaps' listing",
  "anything unclear or unsourced (omit the Gaps heading only if there is genuinely nothing).",
].join("\n");

export default {
  id: "study",
  label: "Study library",
  summary: "Fellowship notes: what's new, what's due for review, what's aged out",

  validate(agent) {
    const dir = (agent.config && agent.config.library) || "agents/private/study";
    if (!existsSync(dir)) {
      return [`no library folder at ${dir} — create it and put your notes in, or point config.library elsewhere`];
    }
    if (agent.config && agent.config.synthesize && !process.env.ANTHROPIC_API_KEY) {
      // Not an error: the rest of the agent is useful without it.
      return [];
    }
    return [];
  },

  async run(agent, ctx) {
    const c = agent.config || {};
    const dir = c.library || "agents/private/study";
    const ladder = Array.isArray(c.reviewAfterDays) && c.reviewAfterDays.length
      ? [...c.reviewAfterDays].sort((a, b) => a - b)
      : LADDER;
    const sourceMaxAge = Number(c.sourceMaxAgeDays) || 730;
    const requireSource = c.requireSource !== false;

    const files = listFiles(dir, { exts: [".md", ".txt", ".markdown"] })
      .filter((f) => !f.name.endsWith(".card.md"));   // cards aren't source material
    if (!files.length) throw new Error(`no notes found under ${dir}`);

    const known = ctx.state.memo.notes || {};
    const notes = {};
    const observations = [];
    const add = (key, title, detail) => observations.push({ key, title, detail, at: Date.now(), url: "" });

    const topics = {};
    let dueForReview = 0, unsourced = 0, agedSources = 0, changed = [];

    for (const f of files) {
      const rel = relative(dir, f.path);
      let raw;
      try { raw = readFileSync(f.path, "utf8"); }
      catch { continue; }

      const { head, body } = parseHeader(raw);
      const fp = digest(body);
      const title = head.title || f.name.replace(/\.(md|markdown|txt)$/i, "");
      const topic = head.topic || "unfiled";
      topics[topic] = (topics[topic] || 0) + 1;
      notes[rel] = { fp, reviewed: head.reviewed || null, title };

      const before = known[rel];
      /* Each time the reviewed date changes, that's another pass through
         the note — and another rung up the ladder. */
      const reviewed = head.reviewed || null;
      const reps = before
        ? (before.reps || 0) + (before.reviewed !== reviewed && reviewed ? 1 : 0)
        : 0;
      notes[rel].reps = reps;

      if (!before) {
        add(`note:${rel}:${fp}`, `New note — ${title}`,
          `${topic}${head.source ? ` · ${head.source}` : ""}`);
        changed.push({ rel, path: f.path, head, body, title, fp });
      } else if (before.fp !== fp) {
        add(`note:${rel}:${fp}`, `Updated — ${title}`, `${topic}`);
        changed.push({ rel, path: f.path, head, body, title, fp });
      }

      // ---- spaced repetition ----
      const sinceReviewed = reviewed ? daysSince(reviewed) : null;
      const rung = reviewDue(sinceReviewed, ladder, reps);
      if (rung != null) {
        dueForReview++;
        /* Keyed on how far past the interval it is, so ignoring it means
           it asks again next interval rather than going quiet forever. */
        add(`review:${rel}:${rung}:${staleBucket(sinceReviewed, rung)}`,
          `Due for review — ${title}`,
          `Last read ${reviewed}, ${plural(sinceReviewed, "day")} ago` +
          `${reps ? ` · ${plural(reps, "pass")} so far, next interval ${rung} days` : ""}. ` +
          `Update the "reviewed" date when you've been through it.`);
      } else if (!reviewed) {
        dueForReview++;
        add(`unreviewed:${rel}`, `Never reviewed — ${title}`,
          `Add a "reviewed: ${isoDay()}" line to the header once you've read it back, and it'll join the rotation.`);
      }

      // ---- provenance ----
      if (requireSource && !head.source) {
        unsourced++;
        const weight = isActionable(head) ? "This one is tagged as something you'd act on, which makes it the kind you most want to be able to trace." : "";
        add(`unsourced:${rel}`, `No source on — ${title}`,
          `A note you can't trace back is a note you can't check. ${weight}`.trim());
      }

      const sourceAge = head.sourcedate ? daysSince(head.sourcedate) : null;
      if (sourceAge != null && sourceAge >= sourceMaxAge) {
        agedSources++;
        add(`aged:${rel}:${staleBucket(sourceAge, 365)}`,
          `Source may be superseded — ${title}`,
          `${head.source || "Its source"} is dated ${head.sourcedate}, ${Math.floor(sourceAge / 365)}+ years old. Worth checking whether it still stands.`);
      }
    }

    // ---- optional: write study cards ----
    let cardsWritten = 0;
    if (c.synthesize && process.env.ANTHROPIC_API_KEY && changed.length) {
      const budget = Math.max(1, Number(c.maxSynthPerRun) || 3);
      for (const n of changed.slice(0, budget)) {
        try {
          await writeCard(n, dir);
          cardsWritten++;
        } catch (e) {
          ctx.log(`  (no card for ${n.rel} — ${e.message})`);
        }
      }
    } else if (c.synthesize && !process.env.ANTHROPIC_API_KEY && changed.length) {
      ctx.log("  (synthesize is on but ANTHROPIC_API_KEY isn't set — indexing only)");
    }

    const topTopics = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([t, n]) => `${t} ${n}`).join(", ");

    return {
      observations,
      metric: dueForReview,
      memo: { notes, lastScan: isoDay() },
      facts: {
        notes: files.length, topics: Object.keys(topics).length,
        dueForReview, unsourced, agedSources, cardsWritten,
      },
      /* An unsourced algorithm is the one thing here worth more than a
         nudge — it's the note most likely to be wrong and least likely
         to be checkable. */
      level: unsourced > 0 ? "notable" : "quiet",
      why: unsourced ? `${plural(unsourced, "note")} with no source` : "",
      line:
        `${plural(files.length, "note")} · ${dueForReview} due for review` +
        `${unsourced ? ` · ${unsourced} unsourced` : ""}` +
        `${cardsWritten ? ` · ${plural(cardsWritten, "card")} written` : ""}` +
        `${topTopics ? ` · ${topTopics}` : ""}`,
    };
  },

  describe(agent, fresh) {
    /* A first scan of a whole library can turn up hundreds of things.
       Show a readable handful and say how many are behind it. */
    const shown = fresh.slice(0, 8);
    const lines = shown.map((o) => `${o.title}\n${o.detail}`);
    if (fresh.length > shown.length) lines.push(`…and ${fresh.length - shown.length} more`);
    return lines.join("\n\n");
  },
};

/* The card sits beside the note and is regenerated when the note changes.
   It is never merged into the note: one file is yours, the other is
   derived, and you can delete every card without losing anything. */
async function writeCard(n, dir) {
  const cardPath = n.path.replace(/\.(md|markdown|txt)$/i, ".card.md");

  const text = await askClaude({
    system: SYNTH_SYSTEM,
    maxTokens: 2048,
    effort: "medium",
    user: `Title: ${n.title}\nSource: ${n.head.source || "(none given)"}\nSource date: ${n.head.sourcedate || "(none given)"}\n\n---\n\n${n.body.slice(0, 40000)}`,
  });

  const header = [
    "<!-- Generated from the note beside it. Do not edit: it is rewritten",
    "     whenever that note changes. The note, and the source it cites,",
    "     are what count. -->",
    "",
    `# ${n.title} — revision card`,
    "",
    `*Derived from \`${n.rel}\` on ${isoDay()}. Source: ${n.head.source || "**none cited on the note**"}` +
      `${n.head.sourcedate ? ` (${n.head.sourcedate})` : ""}. A study aid — check it against the source before you act on it.*`,
    "",
  ].join("\n");

  writeFileSync(cardPath, `${header}\n${text}\n`);
}
