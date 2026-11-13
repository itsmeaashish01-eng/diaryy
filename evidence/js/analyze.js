/* ================================================
   EVIDENCE DESK — analyze.js
   Turning a captured page into a note you can study from.

   Everything here is rules: no model, no network, no key. That is the
   default on purpose — it is free, it is instant, and above all you can
   see why it said what it said. Each part is small and arguable:

     refs()      which links are citations, and what kind of study each is
     summary()   the sentences that carry the answer, picked not rewritten
     tree()      the "if this patient, then that" statements, as branches
     appraise()  how far the cited evidence can be leaned on
     reading()   which paper to open first, and why

   Nothing is paraphrased. A sentence in the summary is a sentence from the
   page, so a wrong one is the page's mistake and you can find it there.
   Claude (brain.js) can rewrite the words if you ask; it never changes the
   grading, which stays here where it can be checked.
   ================================================ */
(function (EV) {
  "use strict";
  const { clip, squash, hostOf } = EV.util;

  /* ---- study types --------------------------------------------------
     Ordered: the first pattern that matches wins, so "systematic review
     of randomized trials" is a synthesis, not a trial. Level 1 is the
     top of the pyramid. Guidelines sit beside it rather than on it —
     they are a reading of the evidence, not a piece of it — but they are
     where you start, so they rank first for reading. */
  const KINDS = [
    { id: "guideline", label: "Guideline", level: 1,
      re: /\b(guidelines?|consensus|position (statement|paper)|recommendations?|practice (advisory|parameter|bulletin)|scientific statement|task force)\b/i },
    { id: "synthesis", label: "Systematic review", level: 1,
      re: /\b(meta-?analys[ie]s|systematic review|cochrane|pooled analysis|umbrella review)\b/i },
    { id: "rct", label: "Randomised trial", level: 2,
      re: /\b(randomi[sz]ed|randomly assigned|controlled trial|\bRCT\b|double-?blind|placebo-controlled|phase (2|3|ii|iii)\b|non-?inferiority)\b/i },
    { id: "observational", label: "Observational", level: 3,
      re: /\b(cohort|case-?control|cross-?sectional|registry|observational|retrospective|prospective|population-based|nationwide|longitudinal|database)\b/i },
    { id: "case", label: "Case report", level: 4,
      re: /\b(case (report|series)|a case of)\b/i },
    { id: "review", label: "Review", level: 5,
      re: /\b(review|overview|update|primer|editorial|commentary|perspective|viewpoint|state of the art)\b/i },
  ];
  const UNKNOWN = { id: "unknown", label: "Unclassified", level: 5 };

  function classify(str) {
    const s = String(str || "");
    return KINDS.find((k) => k.re.test(s)) || UNKNOWN;
  }

  /* ---- sentences ---------------------------------------------------- */

  const ABBR = /\b(e\.g|i\.e|vs|et al|Dr|Fig|No|approx|cf|Drs|St)\.\s/g;

  /* Lines first — a bullet is its own sentence whether or not it ends in
     a full stop — then on sentence ends. The lookbehind lets a citation
     marker sit between the full stop and the space: "…lower risk.[3] The". */
  function sentences(text) {
    const out = [];
    for (const line of String(text || "").split(/\n+/)) {
      const guarded = line.replace(ABBR, (m) => m.replace(". ", ".\u0001"));
      for (const part of guarded.split(/(?<=[.!?](?:\[[\d,\s–-]+\])*)\s+(?=[A-Z(])/)) {
        const s = squash(part.replace(/\u0001/g, " ").replace(/^[-•*·▪◦–]\s*/, ""));
        if (s.length >= 30 && s.length <= 600) out.push(s);
      }
    }
    return out;
  }

  const REF_HEADING = /^\s*(references?|sources?|citations?|bibliography|works cited)\s*:?\s*$/i;

  /* The answer, without the reference list under it or the one-word
     lines a page's buttons and menus leave behind. */
  function body(text) {
    const lines = String(text || "").split(/\n/);
    const cut = lines.findIndex((l) => REF_HEADING.test(l));
    return (cut > 0 ? lines.slice(0, cut) : lines)
      .map((l) => l.trim())
      .filter((l) => l.split(/\s+/).length >= 4 || /[:.?]$/.test(l))
      .join("\n");
  }

  const stripCites = (s) => squash(String(s).replace(/\s*\[[\d,\s–-]+\]/g, ""));

  function citesIn(s, max) {
    const found = new Set();
    for (const m of String(s).matchAll(/\[([\d,\s–-]+)\]/g)) {
      for (const part of m[1].split(",")) {
        const range = part.trim().split(/[–-]/).map(Number);
        const a = range[0], b = range.length > 1 ? range[1] : range[0];
        if (!Number.isInteger(a) || !Number.isInteger(b) || b - a > 20) continue;
        for (let n = a; n <= b; n++) if (n >= 1 && n <= max) found.add(n);
      }
    }
    return [...found].sort((x, y) => x - y);
  }

  /* ---- references --------------------------------------------------- */

  const JUNK_HOST = /(^|\.)(twitter|x|facebook|linkedin|instagram|youtube|tiktok|apple|google|apps\.apple|play\.google)\.com$/i;
  const JUNK_TEXT = /^(privacy|terms|sign ?(in|up)|log ?(in|out)|cookies?|help|about|contact|careers|share|copy|download)\b/i;
  const YEAR = /\b(19[5-9]\d|20[0-4]\d)\b/g;

  function yearIn(s) {
    const now = new Date().getFullYear();
    const all = (String(s).match(YEAR) || []).map(Number).filter((y) => y <= now);
    return all.length ? all[all.length - 1] : null;
  }

  /* A page's citations, from its links first and its reference list
     second. The same paper is usually linked twice — once as a little
     "[3]" in the prose and once by title in the list — so links are
     grouped by address and the longest link text is taken as the title. */
  function refs(capture) {
    const pageHost = hostOf(capture.url);
    const byUrl = new Map();
    for (const l of capture.links || []) {
      const host = hostOf(l.u);
      if (!host || JUNK_HOST.test(host) || JUNK_TEXT.test(l.t)) continue;
      // Links back into the same site are navigation unless they read like a citation.
      if (host === pageHost && !(l.t.length >= 25 && yearIn(l.c || l.t))) continue;
      const cur = byUrl.get(l.u);
      if (!cur || l.t.length > cur.t.length) byUrl.set(l.u, l);
    }

    const out = [];
    const seenTitle = new Set();
    const push = (title, url, context) => {
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 50);
      if (!key || seenTitle.has(key)) return;
      seenTitle.add(key);
      // The surrounding text only describes this paper if it contains its title;
      // otherwise it is the paragraph the citation happened to sit in.
      const about = context && context.includes(title.slice(0, 30)) ? context : title;
      const kind = classify(about);
      out.push({
        n: out.length + 1,
        title: clip(title, 260),
        url: url || "",
        host: hostOf(url),
        year: yearIn(about),
        kind: kind.id,
        kindLabel: kind.label,
        level: kind.level,
      });
    };

    for (const l of byUrl.values()) {
      if (l.t.length >= 12 && !/^\[?\d+\]?$/.test(l.t)) push(l.t, l.u, l.c);
    }

    // A reference list with no links in it — a plain-text paste.
    const lines = String(capture.text || "").split(/\n/);
    const at = lines.findIndex((l) => REF_HEADING.test(l));
    if (at >= 0) {
      for (const line of lines.slice(at + 1)) {
        const t = squash(line.replace(/^\s*(\[\d+\]|\d+[.)])\s*/, "").replace(/https?:\/\/\S+/g, ""));
        if (t.length >= 25) push(t, "", t);
      }
    }
    return out;
  }

  /* ---- summary ------------------------------------------------------ */

  const STOP = new Set(("the a an and or of in on for to with by is are was were be been at as from that this " +
    "it its what which who how when does do should can may versus vs than not no").split(" "));
  const CUE = /\b(recommend\w*|should|first-line|preferred|indicated|evidence|guidelines?|trials?|compared|reduc\w+|increas\w+|risk|benefit|mortality|significant\w*|superior|inferior|effective|efficacy|safety|contraindicated)\b/gi;
  const STAT = /\d+(\.\d+)?\s?%|\b(HR|RR|OR|aOR|aHR|NNT|NNH|ARR|RRR)\b|\b95%\s?CI\b|\bp\s?[<=]\s?0?\.\d+/;

  const words = (s) => (String(s).toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((w) => !STOP.has(w));

  /* Sentences chosen, never written. A sentence scores for sharing words
     with the question, for the language of recommendation, for carrying
     a number, and a little for coming early. The picks are then put back
     in the order the page had them, so they still read as an argument. */
  function summary(text, question, count) {
    // A question on the page is the thing being answered, not an answer.
    const all = sentences(text).filter((s) => !s.endsWith("?"));
    const q = new Set(words(question));
    const scored = all.map((s, i) => {
      let score = 0;
      for (const w of new Set(words(s))) if (q.has(w)) score += 2;
      score += Math.min(4, (s.match(CUE) || []).length);
      if (STAT.test(s)) score += 2;
      score += Math.max(0, 2 - i * 0.2);
      return { s, i, score };
    });
    const top = scored.slice().sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, count || 4).sort((a, b) => a.i - b.i);
    const picked = new Set(top.map((t) => t.i));
    const findings = scored.filter((t) => !picked.has(t.i) && STAT.test(t.s)).slice(0, 5);
    return {
      summary: top.map((t) => stripCites(t.s)),
      findings: findings.map((t) => stripCites(t.s)),
    };
  }

  /* ---- the decision tree --------------------------------------------
     Clinical writing states its branches out loud: "In patients with X,
     Y is recommended", "Y is preferred for adults with X", "avoid Y in
     Z". Each such sentence becomes one branch — the condition, then what
     the page says to do about it.

     This reads grammar, not medicine. It will miss a branch phrased
     unusually and it cannot tell a good recommendation from a bad one,
     so every leaf keeps its citation numbers: the tree is a map of where
     to look, not a protocol. */

  const WHO = "(?:patients?|adults?|children|infants?|women|men|those|people|individuals|persons|cases|pregnan\\w+)";
  const LEAD = new RegExp("^(If|When|Where|Unless)\\s+(.{8,170}?),\\s+(?:then\\s+)?(.{15,})$", "i");
  const LEAD_IN = new RegExp("^(In|For|Among)\\s+(" + WHO + "\\b.{4,170}?|.{0,60}?\\b" + WHO + "\\b.{0,120}?),\\s+(.{15,})$", "i");
  const TAIL = new RegExp(
    "^(.{3,}?\\b(?:recommended|indicated|preferred|first-line|considered|suggested|reasonable|contraindicated|avoided|appropriate)\\b[^,;]*?)" +
    "\\s+(?:for|in|among)\\s+(" + WHO + "\\b.{5,170})$", "i");
  const CAUTION = /\b(contraindicated|avoid(ed)?|should not|not recommended|do not|caution|unless|harm\w*|discontinue|stop)\b/i;
  const DIRECTIVE = /\b(recommend\w*|should|first-line|prefer\w*|indicated|consider\w*|start|initiat\w+|use|treat\w*|offer\w*|give|administer\w*|refer\w*|screen\w*|monitor\w*|reasonable)\b/i;

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const leafKind = (s) => (CAUTION.test(s) ? "caution" : DIRECTIVE.test(s) ? "do" : "finding");

  function branchOf(sentence, maxRef) {
    const cites = citesIn(sentence, maxRef);
    const s = stripCites(sentence).replace(/[.;]$/, "");
    let m = s.match(LEAD) || s.match(LEAD_IN);
    if (m) return { cond: cap(m[1].toLowerCase()) + " " + m[2], then: cap(m[3]), cites };
    m = s.match(TAIL);
    if (m) return { cond: "In " + m[2], then: cap(m[1]), cites };
    return null;
  }

  function tree(text, question, maxRef) {
    const branches = [];
    const seen = new Set();
    for (const s of sentences(text)) {
      if (s.endsWith("?")) continue;
      const b = branchOf(s, maxRef || 0);
      if (!b) continue;
      const key = b.cond.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      branches.push({ ...b, kind: leafKind(b.then) });
    }
    // What to do and what to avoid outrank what was merely observed.
    const order = { do: 0, caution: 1, finding: 2 };
    const kept = branches
      .map((b, i) => ({ b, i }))
      .sort((x, y) => order[x.b.kind] - order[y.b.kind] || x.i - y.i)
      .slice(0, 8)
      .sort((x, y) => x.i - y.i)
      .map((x) => x.b);
    return {
      kind: "question",
      text: question || "The question",
      cites: [],
      children: kept.map((b) => ({
        kind: "if", text: clip(b.cond, 220), cites: [],
        children: [{ kind: b.kind, text: clip(b.then, 320), cites: b.cites, children: [] }],
      })),
    };
  }

  /* ---- how far to lean on it ----------------------------------------
     A fixed set of questions, asked top to bottom, stopping at the first
     yes. The path taken is shown, not just the verdict, so the reasoning
     is the same every time and you can disagree with a specific step. */
  function appraise(list) {
    const has = (id) => list.filter((r) => r.kind === id).length;
    const counts = {
      guideline: has("guideline"), synthesis: has("synthesis"), rct: has("rct"),
      observational: has("observational"), case: has("case"),
      other: has("review") + has("unknown"),
    };
    const ladder = [
      { q: "Is a guideline or a systematic review cited?", yes: counts.guideline + counts.synthesis > 0,
        grade: "strong", label: "Synthesised evidence",
        verdict: "Someone has already weighed the trials together. Read that first, and check its date and whose guideline it is." },
      { q: "Is at least one randomised trial cited?", yes: counts.rct > 0,
        grade: "moderate", label: "Trial evidence",
        verdict: "Rests on individual trials. Check that the trial population looks like your patient and that the outcome is one that matters." },
      { q: "Is there observational data — a cohort, a registry, a case-control study?", yes: counts.observational > 0,
        grade: "limited", label: "Observational evidence",
        verdict: "Shows association, not cause. Look for confounding and for who was left out." },
      { q: "Is anything cited at all?", yes: list.length > 0,
        grade: "weak", label: "Opinion and case reports",
        verdict: "Reviews, case reports or sources that could not be classified. Treat as expert opinion until you have read them." },
    ];
    const steps = [];
    let landed = null;
    for (const rung of ladder) {
      steps.push({ q: rung.q, yes: rung.yes });
      if (rung.yes) { landed = rung; break; }
    }
    if (!landed) {
      landed = { grade: "none", label: "No sources found",
        verdict: "Nothing on the page could be read as a citation. The answer may still be right, but there is nothing here to check it against." };
    }
    return { steps, grade: landed.grade, label: landed.label, verdict: landed.verdict, counts };
  }

  /* ---- what to read first ------------------------------------------- */

  const WHY = {
    guideline: "Start here — it states what to do and grades its own evidence",
    synthesis: "Pools the trials, so one read covers many",
    rct: "Primary trial — check population, comparator and outcome",
    observational: "Real-world data — read for who was included and what was adjusted for",
    case: "A single case or series — context, not proof",
    review: "Background reading",
    unknown: "Could not tell the study type from the title — open it and see",
  };

  /* Strongest design first, newest first within a design. A stable sort,
     so two papers that tie keep the order the page cited them in. */
  function reading(list) {
    return list.slice()
      .sort((a, b) => a.level - b.level || (b.year || 0) - (a.year || 0) || a.n - b.n)
      .map((r) => ({ n: r.n, why: WHY[r.kind] || WHY.unknown }));
  }

  /* ---- all of it ---------------------------------------------------- */

  function guessQuestion(capture) {
    if (capture.question) return capture.question;
    const asked = String(capture.text || "").split(/\n/).map(squash).find((l) => l.length > 15 && l.endsWith("?"));
    return clip(asked || capture.title || "Untitled note", 300);
  }

  function run(capture, question) {
    const q = question || guessQuestion(capture);
    const list = refs(capture);
    const text = body(capture.text);
    const sum = summary(text, q, 4);
    return {
      by: "rules",
      question: q,
      summary: sum.summary,
      findings: sum.findings,
      tree: tree(text, q, list.length),
      refs: list,
      appraisal: appraise(list),
      reading: reading(list),
      gaps: [],
    };
  }

  /* ---- taking a note somewhere else --------------------------------- */

  function toMarkdown(note) {
    const a = note.analysis;
    const out = ["# " + a.question, ""];
    if (note.source.url) out.push("Source: " + note.source.url, "");
    const section = (title, items) => {
      if (items && items.length) out.push("## " + title, "", ...items.map((s) => "- " + s), "");
    };
    section("Summary", a.summary);
    section("Key numbers", a.findings);
    if (a.tree.children.length) {
      out.push("## Decision tree", "");
      const walk = (node, depth) => {
        const tag = { if: "", do: "→ ", caution: "⚠ Caution: ", finding: "→ Evidence: " }[node.kind] || "";
        const cite = node.cites && node.cites.length ? " [" + node.cites.join(", ") + "]" : "";
        out.push("  ".repeat(depth) + "- " + tag + node.text + cite);
        (node.children || []).forEach((c) => walk(c, depth + 1));
      };
      a.tree.children.forEach((c) => walk(c, 0));
      out.push("");
    }
    out.push("## Strength of evidence", "", "**" + a.appraisal.label + "** — " + a.appraisal.verdict, "");
    section("What this does not answer", a.gaps);
    if (a.reading.length) {
      out.push("## Reading list", "");
      a.reading.forEach((item, i) => {
        const r = a.refs.find((x) => x.n === item.n);
        if (!r) return;
        const done = note.read && note.read[r.n] ? "x" : " ";
        const title = r.url ? "[" + r.title + "](" + r.url + ")" : r.title;
        out.push((i + 1) + ". [" + done + "] " + title + " — " + r.kindLabel + (r.year ? ", " + r.year : "") + ". " + item.why + ".");
      });
      out.push("");
    }
    if (note.mine && note.mine.trim()) out.push("## My notes", "", note.mine.trim(), "");
    return out.join("\n");
  }

  /* The unread papers, in the shape agents/data/reading.json keeps its
     items — so a note's reading list can be handed to the reading agent,
     which is the thing that will actually nag you about it. */
  function toReadingItems(note, today) {
    const a = note.analysis;
    const minutes = { guideline: 45, synthesis: 40, rct: 35, observational: 30, case: 10, review: 25, unknown: 25 };
    return a.reading
      .map((item) => a.refs.find((r) => r.n === item.n))
      .filter((r) => r && !(note.read && note.read[r.n]))
      .map((r) => ({
        id: (r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)) || "ref-" + r.n,
        title: r.title,
        url: r.url,
        kind: r.kind === "guideline" ? "guideline" : "paper",
        topic: clip(a.question, 60),
        added: today,
        priority: Math.max(1, 6 - r.level),
        minutes: minutes[r.kind] || 25,
        started: null,
        finished: null,
      }));
  }

  EV.analyze = {
    KINDS, classify, sentences, body, refs, summary, tree, appraise, reading,
    run, toMarkdown, toReadingItems, citesIn, stripCites,
  };
})(window.EV);
