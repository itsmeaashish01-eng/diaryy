/* ================================================
   NEURO MULTIVERSE — app.js
   The whole app: the universe map, the notes, search, and the quiz.

   Progress is a Leitner box per question (0–4) in localStorage under
   `neuroData`. A right answer moves a question up a box, a wrong one
   sends it back to 0, and a quiz deals the lowest boxes first, so what
   you keep getting wrong keeps coming back. Box 3 or higher counts as
   mastered. Only question ids and box numbers are stored: never put
   patient details in here.
   ================================================ */
(function (NM) {
  "use strict";

  const KEY = "neuroData";
  const MAX_BOX = 4;
  const MASTERED = 3;
  const QUIZ_LENGTH = 10;

  const $ = (sel) => document.querySelector(sel);

  /* Build an element with text, never HTML: the notes are ours today,
     but the rule is the same for everything in this repository. */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------------------------------------------------------------
     Storage. Private windows can throw on access, so every touch is
     guarded and the app still works, it just forgets.
     --------------------------------------------------------------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : {};
      return { boxes: data.boxes || {}, theme: data.theme || "auto" };
    } catch (e) {
      return { boxes: {}, theme: "auto" };
    }
  }

  const state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable; progress lasts this visit */ }
  }

  const boxOf = (id) => state.boxes[id] || 0;

  function universeProgress(u) {
    const done = u.questions.filter((q) => boxOf(q.id) >= MASTERED).length;
    return { done, total: u.questions.length };
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------------------------------------------------------------
     Theme
     --------------------------------------------------------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = state.theme;
    const dark = state.theme === "dark" ||
      (state.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    $("#themeBtn").textContent = dark ? "☀" : "☾";
  }

  function toggleTheme() {
    const dark = document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    state.theme = dark ? "light" : "dark";
    save();
    applyTheme();
  }

  /* ---------------------------------------------------------------
     Views
     --------------------------------------------------------------- */
  function show(view) {
    for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== "view-" + view;
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const grid = $("#universes");
    grid.replaceChildren();
    let done = 0, total = 0;

    NM.data.forEach((u) => {
      const p = universeProgress(u);
      done += p.done;
      total += p.total;

      const card = el("button", "universe");
      card.type = "button";
      card.append(
        el("span", "universe-glyph", u.glyph),
        el("span", "universe-name", u.name),
        el("span", "universe-tag", u.tagline)
      );
      const bar = el("span", "bar");
      const fill = el("span", "bar-fill");
      fill.style.width = (100 * p.done / p.total) + "%";
      bar.append(fill);
      card.append(bar, el("span", "universe-count", p.done + " / " + p.total + " mastered"));
      card.addEventListener("click", () => openUniverse(u));
      grid.append(card);
    });

    $("#overall").textContent = done + " of " + total + " questions mastered";
    show("home");
  }

  function noteNode(n, universeName) {
    const item = el("article", "note");
    if (universeName) item.append(el("p", "note-from", universeName));
    item.append(el("h3", "note-title", n.title), el("p", "note-body", n.body));
    return item;
  }

  function openUniverse(u) {
    $("#uGlyph").textContent = u.glyph;
    $("#uName").textContent = u.name;
    $("#uTag").textContent = u.tagline;
    const p = universeProgress(u);
    $("#uProgress").textContent = p.done + " of " + p.total + " questions mastered";

    const list = $("#uNotes");
    list.replaceChildren(...u.notes.map((n) => noteNode(n)));
    $("#uPractice").onclick = () => startQuiz(u.questions.map((q) => ({ q, u })), u.name);
    show("universe");
  }

  /* ---------------------------------------------------------------
     Search across every universe's notes
     --------------------------------------------------------------- */
  function runSearch(term) {
    const out = $("#results");
    out.replaceChildren();
    const t = term.trim().toLowerCase();
    if (!t) {
      out.append(el("p", "muted", "Search every universe's notes, for example \"aquaporin\" or \"thiamine\"."));
      return;
    }
    const hits = [];
    NM.data.forEach((u) => u.notes.forEach((n) => {
      if ((n.title + " " + n.body).toLowerCase().includes(t)) hits.push(noteNode(n, u.name));
    }));
    if (!hits.length) out.append(el("p", "muted", "Nothing found for \"" + term.trim() + "\"."));
    else out.append(...hits);
  }

  /* ---------------------------------------------------------------
     Quiz
     --------------------------------------------------------------- */
  let quiz = null;

  /* Lowest box first, shuffled within a box so the same order doesn't
     come round every time. */
  function deal(pool) {
    return shuffle(pool)
      .sort((a, b) => boxOf(a.q.id) - boxOf(b.q.id))
      .slice(0, QUIZ_LENGTH);
  }

  function startQuiz(pool, label) {
    quiz = { cards: deal(pool), i: 0, right: 0, label };
    $("#quizLabel").textContent = label;
    show("quiz");
    renderCard();
  }

  function renderCard() {
    const { q, u } = quiz.cards[quiz.i];
    $("#quizCount").textContent = "Question " + (quiz.i + 1) + " of " + quiz.cards.length;
    $("#quizFrom").textContent = u.name;
    $("#quizQ").textContent = q.q;
    $("#quizWhy").hidden = true;
    $("#quizNext").hidden = true;

    const opts = $("#quizOptions");
    opts.replaceChildren();
    // The right answer is stored first; shuffle so position gives nothing away.
    shuffle(q.options.map((text, idx) => ({ text, idx }))).forEach((o) => {
      const b = el("button", "option", o.text);
      b.type = "button";
      b.dataset.correct = o.idx === q.answer ? "1" : "";
      b.addEventListener("click", () => answer(b, q));
      opts.append(b);
    });
  }

  function answer(button, q) {
    const opts = document.querySelectorAll("#quizOptions .option");
    for (const b of opts) {
      b.disabled = true;
      if (b.dataset.correct) b.classList.add("is-right");
    }
    const ok = !!button.dataset.correct;
    if (!ok) button.classList.add("is-wrong");
    if (ok) quiz.right++;

    state.boxes[q.id] = ok ? Math.min(boxOf(q.id) + 1, MAX_BOX) : 0;
    save();

    const why = $("#quizWhy");
    why.replaceChildren(el("strong", null, ok ? "Correct. " : "Not quite. "), document.createTextNode(q.why));
    why.className = "why " + (ok ? "why-right" : "why-wrong");
    why.hidden = false;

    const next = $("#quizNext");
    next.textContent = quiz.i + 1 < quiz.cards.length ? "Next question" : "See result";
    next.hidden = false;
    next.focus();
  }

  function nextCard() {
    quiz.i++;
    if (quiz.i < quiz.cards.length) return renderCard();
    $("#doneScore").textContent = quiz.right + " / " + quiz.cards.length;
    const pct = quiz.right / quiz.cards.length;
    $("#doneNote").textContent = pct === 1 ? "A clean sweep." :
      pct >= 0.7 ? "Solid. The misses will come round again first." :
      "The ones you missed are now at the front of the queue.";
    show("done");
  }

  function mixedQuiz() {
    const pool = [];
    NM.data.forEach((u) => u.questions.forEach((q) => pool.push({ q, u })));
    startQuiz(pool, "Across the multiverse");
  }

  function resetProgress() {
    if (!confirm("Clear all quiz progress? Your notes aren't affected.")) return;
    state.boxes = {};
    save();
    renderHome();
  }

  /* ---------------------------------------------------------------
     Wiring
     --------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    window.matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", applyTheme);

    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#homeBtn").addEventListener("click", renderHome);
    $("#mixedBtn").addEventListener("click", mixedQuiz);
    $("#searchBtn").addEventListener("click", () => {
      show("search");
      runSearch($("#searchInput").value);
      $("#searchInput").focus();
    });
    $("#searchInput").addEventListener("input", (e) => runSearch(e.target.value));
    $("#quizNext").addEventListener("click", nextCard);
    $("#doneHome").addEventListener("click", renderHome);
    $("#doneAgain").addEventListener("click", () => {
      // Same pool as last time, freshly dealt from the updated boxes.
      const pool = quiz.label === "Across the multiverse" ? null :
        NM.data.find((u) => u.name === quiz.label);
      if (pool) startQuiz(pool.questions.map((q) => ({ q, u: pool })), pool.name);
      else mixedQuiz();
    });
    for (const b of document.querySelectorAll("[data-back]")) b.addEventListener("click", renderHome);
    $("#resetBtn").addEventListener("click", resetProgress);

    renderHome();
  });
})(window.NM);
