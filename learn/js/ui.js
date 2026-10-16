/* ================================================
   CODE CLINIC — ui.js
   Turning a lesson into a page: prose, exercises with an editor and a
   runner, quizzes, widgets, and the bits at the bottom — notes, the
   diary, what comes next.
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  const U = CC.util;
  const { el } = U;
  const store = CC.store;

  const LANG_NAME = { js: "JavaScript", html: "HTML", python: "Python" };

  /* ---- the editor ------------------------------------------------------ */
  /*
     A textarea with the few behaviours that make code bearable to type:
     Tab indents (Shift+Tab undoes it), Enter keeps the indent and adds one
     after an opening bracket or a Python colon, Ctrl/⌘+Enter runs, and
     Escape lets go of the keyboard so Tab can move on again. Edits go
     through insertText where the browser has it, so undo still works.
  */
  function makeEditor(initial, lang, onInput, onRun) {
    const unit = lang === "python" ? "    " : "  ";
    const gutter = el("div", { class: "gutter", "aria-hidden": "true" });
    const ta = el("textarea", {
      class: "code-input", spellcheck: false, autocomplete: "off", autocapitalize: "off", autocorrect: "off", wrap: "off",
      "aria-label": `${LANG_NAME[lang] || "Code"} editor. Tab indents; press Escape, then Tab, to leave. Control or Command plus Enter runs.`,
    });
    ta.value = initial;
    let errLine = null;

    function paint() {
      const n = ta.value.split("\n").length;
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= n; i++) frag.append(el("span", { class: i === errLine ? "err" : "" }, String(i)));
      gutter.replaceChildren(frag);
      gutter.scrollTop = ta.scrollTop;
      // Grow with the code, up to a point; then scroll.
      ta.style.height = "auto";
      ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 120), 560)}px`;
      gutter.style.height = ta.style.height;
    }

    function insert(text) {
      ta.focus();
      if (!document.execCommand || !document.execCommand("insertText", false, text)) {
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
        ta.dispatchEvent(new Event("input"));
      }
    }

    function lineBounds() {
      const v = ta.value;
      const start = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      let end = v.indexOf("\n", ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === "\n" ? 1 : 0));
      if (end < 0) end = v.length;
      return { start, end };
    }

    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onRun(); return; }
      if (e.key === "Escape") { ta.blur(); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes("\n");
        if (!multi && !e.shiftKey) { insert(unit); return; }
        const { start, end } = lineBounds();
        const block = ta.value.slice(start, end);
        const changed = block.split("\n").map((l) => (e.shiftKey ? l.replace(new RegExp(`^ {1,${unit.length}}`), "") : unit + l)).join("\n");
        ta.setSelectionRange(start, end);
        insert(changed);
        ta.setSelectionRange(start, start + changed.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const v = ta.value;
        const lineStart = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
        const line = v.slice(lineStart, ta.selectionStart);
        let indent = line.match(/^\s*/)[0];
        const before = line.trimEnd();
        if (/[{[(]$/.test(before) || (lang === "python" && /:$/.test(before))) indent += unit;
        insert("\n" + indent);
      }
    });
    ta.addEventListener("input", () => { errLine = null; paint(); onInput(ta.value); });
    ta.addEventListener("scroll", () => { gutter.scrollTop = ta.scrollTop; });

    const wrap = el("div", { class: "editor" }, gutter, ta);
    requestAnimationFrame(paint);
    return {
      el: wrap,
      get value() { return ta.value; },
      set value(v) { ta.value = v; errLine = null; paint(); onInput(v); },
      markLine(n) { errLine = n; paint(); },
      goTo(n) {
        const lines = ta.value.split("\n");
        const start = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
        ta.focus();
        ta.setSelectionRange(start, start + (lines[n - 1] || "").length);
      },
      focus() { ta.focus(); },
    };
  }

  /* ---- shared pieces ------------------------------------------------------ */

  function enhanceCode(root) {
    U.$$("pre.code", root).forEach((pre) => {
      if (pre.querySelector(".copy")) return;
      const b = el("button", { class: "copy", type: "button", "aria-label": "Copy this code" }, "Copy");
      b.addEventListener("click", async () => {
        const ok = await U.copyText(pre.querySelector("code").textContent);
        b.textContent = ok ? "Copied" : "Couldn't copy";
        setTimeout(() => { b.textContent = "Copy"; }, 1500);
      });
      pre.append(b);
    });
  }

  const mdDiv = (text, cls) => {
    const d = el("div", { class: `md ${cls || ""}`.trim(), html: U.md(text) });
    enhanceCode(d);
    return d;
  };

  function badge(passed, optional) {
    return el("span", { class: `badge ${passed ? "done" : optional ? "optional" : ""}` }, passed ? "✓ Done" : optional ? "Optional" : "To do");
  }

  /* ---- exercises ------------------------------------------------------------ */

  function renderResult(out, r, editor, block) {
    out.replaceChildren();
    if (r.error) {
      const kind = { syntax: "Your code doesn't parse", runtime: "Your code stopped with an error", timeout: "Your code ran too long", internal: "Something went wrong running it" }[r.error.kind] || "Error";
      const box = el("div", { class: "result-error", role: "alert" },
        el("p", { class: "result-title" }, kind + (r.error.line ? ` — line ${r.error.line}` : "")),
        el("p", { class: "mono" }, r.error.message));
      if (r.error.line) {
        editor.markLine(r.error.line);
        box.append(el("button", { class: "btn ghost small", type: "button", on: { click: () => editor.goTo(r.error.line) } }, `Go to line ${r.error.line}`));
      }
      out.append(box);
    }
    if (r.results && r.results.length) {
      const passed = r.results.filter((x) => x.pass).length;
      out.append(el("p", { class: `result-summary ${r.ok ? "ok" : ""}` },
        r.ok ? `✓ All ${r.results.length} checks pass.` : `${passed} of ${r.results.length} checks pass.`));
      out.append(el("ul", { class: "results" }, r.results.map((x) => el("li", { class: x.pass ? "ok" : "no" },
        el("span", { class: "mark", "aria-hidden": "true" }, x.pass ? "✓" : "✗"),
        el("span", null, x.name, x.pass || !x.message ? "" : el("span", { class: "why" }, ` — ${x.message}`))))));
    } else if (!r.error && block.tests && block.tests.length === 0) {
      out.append(el("p", { class: "result-summary ok" }, "Ran without errors."));
    }
    if (r.logs && r.logs.length) {
      out.append(el("p", { class: "w-label" }, "Console output"), el("pre", { class: "console" }, r.logs.join("\n")));
    }
  }

  function codeBlock(lesson, block, onPass) {
    const key = store.blockKey(lesson.id, block.id || "try");
    const saved = store.peek(key) || {};
    const optional = Boolean(block.optional || block.type === "try" || !(block.tests && block.tests.length));
    const lang = block.lang || "js";
    const head = el("div", { class: "block-head" },
      el("p", { class: "block-kind" }, block.type === "try" ? `Try it · ${LANG_NAME[lang]}` : `Exercise · ${LANG_NAME[lang]}`),
      block.title ? el("h3", { class: "block-title" }, block.title) : null,
      block.id ? badge(store.passed(key), optional) : null);
    const card = el("section", { class: `block exercise lang-${lang}`, id: block.id ? `b-${block.id}` : null }, head);
    if (block.prompt) card.append(mdDiv(block.prompt));

    const persist = U.debounce((v) => { if (block.id) store.setCode(key, v); }, 400);
    const editor = makeEditor(saved.code != null ? saved.code : (block.starter || block.code || ""), lang, persist, () => run());
    card.append(editor.el);

    const out = el("div", { class: "result", "aria-live": "polite" });
    const status = el("span", { class: "run-status" });
    const runBtn = el("button", { class: "btn primary", type: "button", on: { click: () => run() } }, "▶ Run", el("span", { class: "kbd" }, "Ctrl ↵"));
    const toolbar = el("div", { class: "toolbar" }, runBtn);

    let frame = null;
    if (lang === "html") {
      frame = el("iframe", { class: "preview", title: "Preview of your page", sandbox: "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox" });
      const sizes = el("div", { class: "sizes", role: "group", "aria-label": "Preview width" },
        [["Phone", "390px"], ["Tablet", "768px"], ["Full", "100%"]].map(([label, w]) =>
          el("button", { class: `btn ghost small${w === "100%" ? " on" : ""}`, type: "button", on: { click: (e) => {
            frame.style.width = w;
            U.$$("button", sizes).forEach((b) => b.classList.toggle("on", b === e.currentTarget));
          } } }, label)));
      card._preview = el("div", { class: "preview-wrap" }, el("div", { class: "preview-bar" }, el("span", { class: "w-label" }, "Preview"), sizes), frame);
    }

    if (block.hints && block.hints.length) {
      let shown = 0;
      const hintBox = el("div", { class: "hints" });
      const hintBtn = el("button", { class: "btn ghost", type: "button" }, `Hint (1 of ${block.hints.length})`);
      hintBtn.addEventListener("click", () => {
        if (shown >= block.hints.length) return;
        hintBox.append(mdDiv(block.hints[shown], "hint"));
        shown++;
        hintBtn.textContent = shown >= block.hints.length ? "No more hints" : `Hint (${shown + 1} of ${block.hints.length})`;
        hintBtn.disabled = shown >= block.hints.length;
      });
      toolbar.append(hintBtn);
      card._hints = hintBox;
    }

    if (block.solution) {
      const solBox = el("div", { class: "solution" });
      toolbar.append(el("button", { class: "btn ghost", type: "button", on: { click: () => {
        const tries = (store.peek(key) || {}).attempts || 0;
        if (tries < 2 && !store.passed(key) && !window.confirm("Looking before you've had two goes takes most of the learning out of it. Show the model answer anyway?")) return;
        solBox.replaceChildren(
          el("p", { class: "w-label" }, "One way to do it"),
          el("pre", { class: "code" }, el("code", null, block.solution)),
          el("button", { class: "btn ghost small", type: "button", on: { click: () => {
            if (window.confirm("Replace what's in the editor with this?")) editor.value = block.solution;
          } } }, "Put it in the editor"));
        enhanceCode(solBox);
      } } }, "Show an answer"));
      card._solution = solBox;
    }

    toolbar.append(el("button", { class: "btn ghost", type: "button", on: { click: () => {
      if (window.confirm("Throw away your version and start again from the beginning?")) editor.value = block.starter || block.code || "";
    } } }, "Start over"));

    if (block.download) {
      toolbar.append(el("button", { class: "btn ghost", type: "button", on: { click: () => U.download(block.download, editor.value, lang === "html" ? "text/html" : "text/plain") } }, `Download ${block.download}`));
    }
    toolbar.append(status);
    card.append(toolbar);
    if (card._hints) card.append(card._hints);
    card.append(out);
    if (card._preview) card.append(card._preview);
    if (card._solution) card.append(card._solution);
    const explain = block.explain ? mdDiv(block.explain, "explain") : null;
    if (explain) { explain.hidden = !store.passed(key); card.append(explain); }

    if (lang === "python") {
      const py = CC.sandbox.python;
      const showPy = () => {
        status.textContent = py.state === "ready" ? "" : py.message;
        status.className = `run-status ${py.state === "error" ? "bad" : ""}`;
      };
      py.onStatus(showPy);
      showPy();
    }

    let running = false;
    async function run() {
      if (running) return;
      running = true;
      runBtn.disabled = true;
      status.textContent = lang === "python" && CC.sandbox.python.state !== "ready" ? CC.sandbox.python.message || "Starting Python…" : "Running…";
      out.replaceChildren();
      const tests = block.tests || [];
      let r;
      try {
        const prelude = CC.content.prelude(block);
        if (lang === "html") {
          r = await CC.sandbox.runHTML(editor.value, tests, frame, {});
        } else if (lang === "python") {
          r = await CC.sandbox.python.run(editor.value, tests, { prelude, timeoutMs: block.timeoutMs });
        } else {
          r = await CC.sandbox.runJS(editor.value, tests, { prelude, timeoutMs: block.timeoutMs });
        }
      } catch (e) {
        r = { ok: false, error: { kind: "internal", message: e.message }, logs: [], results: [] };
      }
      if (block.id) store.attempt(key);
      renderResult(out, r, editor, block);
      status.textContent = "";
      running = false;
      runBtn.disabled = false;
      if (r.ok && block.id && tests.length) {
        const first = !store.passed(key);
        store.pass(key);
        head.replaceChild(badge(true, optional), head.lastChild);
        if (explain) explain.hidden = false;
        if (first) onPass();
      }
    }

    // An HTML exercise shows its preview straight away, so the page you're
    // editing is visible before you've pressed anything.
    if (lang === "html") requestAnimationFrame(() => CC.sandbox.runHTML(editor.value, [], frame, {}));
    return card;
  }

  /* ---- quizzes ------------------------------------------------------------------ */

  function quizBlock(lesson, block, onPass) {
    const key = store.blockKey(lesson.id, block.id);
    const saved = store.peek(key) || {};
    const multi = Array.isArray(block.answer);
    const name = `q-${lesson.id}-${block.id}`;
    const head = el("div", { class: "block-head" }, el("p", { class: "block-kind" }, multi ? "Check yourself · choose all that apply" : "Check yourself"), badge(store.passed(key), block.optional));
    const inputs = block.options.map((opt, i) => {
      const input = el("input", { type: multi ? "checkbox" : "radio", name, value: String(i) });
      if (Array.isArray(saved.answer) ? saved.answer.includes(i) : saved.answer === i) input.checked = true;
      return { input, label: el("label", { class: "option" }, input, el("span", { html: U.inline(opt) })) };
    });
    const feedback = el("div", { class: "feedback", "aria-live": "polite" });
    const correct = (picked) => (multi
      ? picked.length === block.answer.length && block.answer.every((a) => picked.includes(a))
      : picked[0] === block.answer);
    function check() {
      const picked = inputs.map((x, i) => (x.input.checked ? i : -1)).filter((i) => i >= 0);
      if (!picked.length) { feedback.replaceChildren(el("p", { class: "w-note" }, "Pick an answer first.")); return; }
      store.setState(key, null);
      const b = store.peek(key) || {};
      b.answer = multi ? picked : picked[0];
      store.save();
      if (correct(picked)) {
        feedback.replaceChildren(el("p", { class: "fb-ok" }, "✓ Right."), block.explain ? mdDiv(block.explain) : null);
        const first = !store.passed(key);
        store.pass(key);
        head.replaceChild(badge(true, block.optional), head.lastChild);
        if (first) onPass();
      } else {
        const why = !multi && block.why && block.why[picked[0]];
        feedback.replaceChildren(el("p", { class: "fb-no" }, multi ? "Not quite — check each option again." : "Not quite."), why ? mdDiv(why) : null);
      }
    }
    const card = el("section", { class: "block quiz", id: `b-${block.id}` }, head, mdDiv(block.question),
      el("div", { class: "options", role: multi ? "group" : "radiogroup" }, inputs.map((x) => x.label)),
      el("div", { class: "toolbar" }, el("button", { class: "btn primary", type: "button", on: { click: check } }, "Check")), feedback);
    if (store.passed(key)) feedback.append(el("p", { class: "fb-ok" }, "✓ You've answered this one."), block.explain ? mdDiv(block.explain) : null);
    return card;
  }

  /* ---- widgets --------------------------------------------------------------------- */

  function widgetBlock(lesson, block, onPass) {
    const key = store.blockKey(lesson.id, block.id);
    const head = el("div", { class: "block-head" }, el("p", { class: "block-kind" }, block.kind || "Interactive"),
      block.title ? el("h3", { class: "block-title" }, block.title) : null, badge(store.passed(key), block.optional));
    const mount = el("div", { class: "widget" });
    const card = el("section", { class: `block widget-block w-${block.widget}`, id: `b-${block.id}` }, head);
    if (block.intro) card.append(mdDiv(block.intro));
    card.append(mount);
    const ctx = {
      key,
      state: () => (store.peek(key) || {}).state,
      save: (s) => store.setState(key, s),
      pass: () => {
        if (store.passed(key)) return;
        store.pass(key);
        head.replaceChild(badge(true, block.optional), head.lastChild);
        onPass();
      },
      get passed() { return store.passed(key); },
    };
    const fn = CC.widgets.get(block.widget);
    if (!fn) mount.append(el("p", { class: "w-note w-err" }, `Missing widget "${block.widget}".`));
    else {
      try { fn(mount, block.opts || {}, ctx); }
      catch (e) { mount.append(el("p", { class: "w-note w-err" }, `This widget failed to start: ${e.message}`)); }
    }
    return card;
  }

  /* ---- the diary next door ------------------------------------------------------------- */
  /*
     The diary stores entries under "diaryData", keyed YYYY-MM-DD, each with
     a tasks list. A finished lesson goes in as a done task — so it counts in
     the diary's own weekly totals, and the diary agent sees the streak.
  */
  function logToDiary(text) {
    let diary;
    try { diary = JSON.parse(localStorage.getItem("diaryData") || "{}"); }
    catch { return { ok: false, msg: "The diary's saved data couldn't be read — nothing written." }; }
    if (!diary || typeof diary !== "object" || Array.isArray(diary)) diary = {};
    const day = U.todayStr();
    const entry = diary[day] || { diary: "", mood: "", notes: "", notesTag: "general", tasks: [] };
    entry.tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
    if (entry.tasks.some((t) => t && t.text === text)) return { ok: true, msg: "Already in today's diary." };
    entry.tasks.push({ id: Date.now().toString(), text, completed: true });
    diary[day] = entry;
    try { localStorage.setItem("diaryData", JSON.stringify(diary)); }
    catch { return { ok: false, msg: "Couldn't write to the diary — storage may be full." }; }
    return { ok: true, msg: "Added to today's diary as a finished task." };
  }

  /* ---- a whole lesson ------------------------------------------------------------------- */

  function renderLesson(lesson, mount, onProgress) {
    const track = CC.content.track(lesson.track);
    store.visit(lesson.id);
    const required = CC.content.requiredBlocks(lesson);
    const doneBanner = el("div", { class: "done-banner", hidden: true, role: "status" });
    const { prev, next } = CC.content.neighbours(lesson.id);

    function check() {
      const all = required.every((b) => store.passed(store.blockKey(lesson.id, b.id)));
      if (all && required.length && !store.isDone(lesson.id)) {
        store.setDone(lesson.id, true);
        showDone(true);
      }
      onProgress();
    }
    function showDone(fresh) {
      doneBanner.hidden = false;
      doneBanner.replaceChildren(
        el("p", null, el("strong", null, fresh ? "Lesson complete." : "You've finished this lesson."),
          next ? " Next: " : "", next ? el("a", { href: `#/l/${next.id}` }, next.title) : " That's the end of the course — go and ship something."));
    }

    const header = el("header", { class: "lesson-head" },
      el("p", { class: "crumbs" }, el("a", { href: `#/t/${track.id}` }, `${track.icon} ${track.title}`), ` · Lesson ${lesson.index + 1} of ${track.lessons.length}`),
      el("h1", null, lesson.title),
      el("p", { class: "lesson-meta" }, `About ${U.fmtMinutes(lesson.minutes || 30)}`,
        lesson.project ? el("span", { class: `tag tag-${lesson.project}` }, lesson.project === "website" ? "Builds your website" : "Builds your research toolkit") : null),
      lesson.summary ? el("p", { class: "lede" }, lesson.summary) : null,
      lesson.objectives ? el("div", { class: "objectives" }, el("p", { class: "w-label" }, "By the end you'll be able to"), el("ul", null, lesson.objectives.map((o) => el("li", { html: U.inline(o) })))) : null);

    const body = el("div", { class: "lesson-body" });
    for (const b of lesson.blocks || []) {
      if (b.md != null || b.type === "md") body.append(mdDiv(b.md != null ? b.md : b.text));
      else if (b.type === "code" || b.type === "try") body.append(codeBlock(lesson, b, check));
      else if (b.type === "quiz") body.append(quizBlock(lesson, b, check));
      else if (b.type === "widget") body.append(widgetBlock(lesson, b, check));
    }

    // Finishing up.
    const foot = el("footer", { class: "lesson-foot" });
    if (!required.length) {
      const btn = el("button", { class: "btn primary", type: "button" }, store.isDone(lesson.id) ? "✓ Marked as done" : "Mark this lesson as done");
      btn.addEventListener("click", () => {
        const now = !store.isDone(lesson.id);
        store.setDone(lesson.id, now);
        btn.textContent = now ? "✓ Marked as done" : "Mark this lesson as done";
        if (now) showDone(true); else doneBanner.hidden = true;
        onProgress();
      });
      foot.append(el("div", { class: "toolbar" }, btn));
    } else {
      const left = required.filter((b) => !store.passed(store.blockKey(lesson.id, b.id))).length;
      if (left) foot.append(el("p", { class: "w-note" }, `${U.plural(left, "exercise")} left to finish this lesson. Optional ones don't count.`));
    }

    const diaryMsg = el("span", { class: "w-hint" });
    const notes = el("textarea", { rows: 4, placeholder: "Anything worth remembering — a question for later, a link, what tripped you up. Saved in this browser and in your export." });
    notes.value = store.data.notes[lesson.id] || "";
    notes.addEventListener("input", U.debounce(() => store.setNote(lesson.id, notes.value), 400));
    foot.append(
      el("label", { class: "w-field" }, el("span", { class: "w-label" }, "Your notes"), notes),
      el("div", { class: "toolbar" },
        el("button", { class: "btn ghost", type: "button", on: { click: () => {
          const r = logToDiary(`Code Clinic — ${lesson.title}`);
          diaryMsg.textContent = r.msg;
        } } }, "✦ Log this to today's diary"), diaryMsg),
      el("nav", { class: "prevnext", "aria-label": "Lessons" },
        prev ? el("a", { href: `#/l/${prev.id}`, class: "prev" }, "← ", prev.title) : el("span"),
        next ? el("a", { href: `#/l/${next.id}`, class: "next" }, next.title, " →") : el("span")));

    mount.replaceChildren(el("article", { class: "lesson" }, header, body, doneBanner, foot));
    if (store.isDone(lesson.id)) showDone(false);
  }

  CC.ui = { renderLesson, makeEditor, mdDiv, enhanceCode, logToDiary, renderResult };
})(window.CC);
