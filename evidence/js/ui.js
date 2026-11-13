/* ================================================
   EVIDENCE DESK — ui.js
   Drawing the three views: Notes, Capture, Settings.

   Everything is built with el() and textContent. A note is made from
   somebody else's web page, so nothing in one is ever handed to the
   browser as HTML, and a link is only a link if safeUrl() passed it.
   ================================================ */
(function (EV) {
  "use strict";
  const { el, toast, clip, fmtDate, hostOf, safeUrl, uid, copyText } = EV.util;
  const { store, analyze, capture, brain } = EV;

  const state = { view: "notes", noteId: null, query: "", busy: false };
  const main = () => document.getElementById("view");

  const NODE_WORD = { if: "If", do: "Do", caution: "Caution", finding: "Evidence" };
  const GRADE_WORD = { strong: "Strong", moderate: "Moderate", limited: "Limited", weak: "Weak", none: "None" };

  /* ---- making a note ------------------------------------------------ */

  function makeNote(payload, question) {
    const cap = capture.normalize(payload);
    if (cap.text.trim().length < 80) {
      toast("There isn't enough text there to make a note from.");
      return null;
    }
    const analysis = analyze.run(cap, clip(String(question || "").trim(), 300));
    const note = {
      id: uid(),
      created: Date.now(),
      updated: Date.now(),
      source: { url: cap.url, title: cap.title, host: hostOf(cap.url) },
      capture: cap,
      analysis,
      mine: "",
      read: {},
    };
    if (!store.add(note)) toast("This browser is out of storage room — export and clear some old notes.");
    else toast(note.source.host ? `Note made from ${note.source.host}` : "Note made");
    state.noteId = note.id;
    show("notes");
    return note;
  }

  /* ---- shell -------------------------------------------------------- */

  function show(view) {
    state.view = view;
    document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("is-on", b.dataset.view === view));
    const host = main();
    host.replaceChildren(
      view === "capture" ? captureView() : view === "settings" ? settingsView() : notesView()
    );
    window.scrollTo(0, 0);
  }

  const card = (title, ...kids) =>
    el("section", { class: "card" }, title ? el("h2", { class: "card-title", text: title }) : null, ...kids);

  const list = (items, cls) => el("ul", { class: cls || "plain-list" }, items.map((s) => el("li", { text: s })));

  /* ---- notes: the list ---------------------------------------------- */

  function notesView() {
    const all = store.notes();
    if (!all.length) {
      return el("div", { class: "empty" },
        el("h1", { class: "view-title", text: "No notes yet" }),
        el("p", { text: "Read something, then bring it here. A note gives you the summary, a decision tree, and the papers behind it in the order worth reading." }),
        el("button", { class: "btn btn-primary", text: "Capture a page", onclick: () => show("capture") }));
    }

    const q = state.query.trim().toLowerCase();
    const shown = q
      ? all.filter((n) => (n.analysis.question + " " + n.source.host + " " + n.mine).toLowerCase().includes(q))
      : all;
    if (!store.get(state.noteId)) state.noteId = (shown[0] || all[0]).id;

    const items = el("div", { class: "note-list" });
    const drawItems = (rows) => items.replaceChildren(
      ...(rows.length ? rows.map(noteRow) : [el("p", { class: "muted pad", text: "Nothing matches that." })]));
    drawItems(shown);

    const search = el("input", {
      type: "search", class: "field", placeholder: "Search notes…", "aria-label": "Search notes", value: state.query,
      oninput: (e) => {
        state.query = e.target.value;
        const needle = state.query.trim().toLowerCase();
        drawItems(needle
          ? all.filter((n) => (n.analysis.question + " " + n.source.host + " " + n.mine).toLowerCase().includes(needle))
          : all);
      },
    });

    return el("div", { class: "notes-layout" },
      el("aside", { class: "sidebar" }, search, items),
      el("article", { class: "detail", id: "detail" }, noteDetail(store.get(state.noteId))));
  }

  function noteRow(n) {
    const total = n.analysis.refs.length;
    const done = Object.values(n.read || {}).filter(Boolean).length;
    return el("button", {
      class: "note-row" + (n.id === state.noteId ? " is-on" : ""),
      onclick: () => { state.noteId = n.id; show("notes"); },
    },
      el("span", { class: "note-row-q", text: clip(n.analysis.question, 90) }),
      el("span", { class: "note-row-meta", text:
        [fmtDate(n.created), n.source.host, total ? `${done}/${total} read` : ""].filter(Boolean).join(" · ") }));
  }

  /* ---- notes: one note ---------------------------------------------- */

  function noteDetail(n) {
    const a = n.analysis;
    const redraw = () => show("notes");

    const question = el("textarea", {
      class: "question", rows: "2", "aria-label": "The question this note answers", value: a.question,
      onchange: (e) => {
        const q = clip(e.target.value.trim(), 300) || a.question;
        // The rules weigh sentences against the question, so a new question
        // is a new summary. Claude's words are kept; only the heading changes.
        const next = a.by === "rules" ? analyze.run(n.capture, q) : { ...a, question: q, tree: { ...a.tree, text: q } };
        store.update(n.id, { analysis: next });
        redraw();
      },
    });

    const src = safeUrl(n.source.url);
    const meta = el("p", { class: "meta" },
      fmtDate(n.created), " · ",
      src ? el("a", { href: src, target: "_blank", rel: "noopener noreferrer", text: n.source.host || "source" }) : "pasted text",
      " · ",
      el("span", { class: "chip", text: a.by === "claude" ? "Written by Claude" : "Picked by rules",
        title: a.by === "claude"
          ? "Summary, tree and reading reasons were written by Claude from the page. The study types and the evidence grade are still the rules'."
          : "Every sentence here is taken from the page as written. Nothing was rewritten." }));

    const askBtn = el("button", {
      class: "btn btn-primary", disabled: state.busy,
      text: state.busy ? "Asking Claude…" : a.by === "claude" ? "Ask Claude again" : "Rewrite with Claude",
      onclick: async () => {
        if (!store.settings().apiKey) { toast("Add a Claude API key in Settings first."); show("settings"); return; }
        state.busy = true; redraw();
        try {
          const next = await brain.ask(n, store.settings());
          store.update(n.id, { analysis: next });
          toast("Rewritten by Claude");
        } catch (e) {
          toast(e.message);
        }
        state.busy = false; redraw();
      },
    });

    const actions = el("div", { class: "actions" },
      askBtn,
      a.by === "claude" ? el("button", { class: "btn", text: "Back to rules", onclick: () => {
        store.update(n.id, { analysis: analyze.run(n.capture, a.question) }); redraw();
      } }) : null,
      el("button", { class: "btn", text: "Download as Word", title: "Saves this note as a .docx you can open in Microsoft Word", onclick: () => {
        const bytes = EV.docx.build(n, fmtDate(n.created));
        const url = URL.createObjectURL(new Blob([bytes], { type: EV.docx.MIME }));
        const link = el("a", { href: url, download: EV.docx.fileName(n) });
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("Saved to Downloads — open it in Word");
      } }),
      el("button", { class: "btn", text: "Copy as Markdown", onclick: async () =>
        toast((await copyText(analyze.toMarkdown(n))) ? "Note copied" : "Could not copy") }),
      el("button", { class: "btn btn-danger", text: "Delete", onclick: () => {
        if (!window.confirm("Delete this note? This cannot be undone.")) return;
        store.remove(n.id); state.noteId = null; redraw();
      } }));

    return el("div", {},
      question, meta, actions,
      n.capture.truncated ? el("p", { class: "notice", text:
        "This page was longer than a note can hold, so only the first part was captured. Select the section you want and capture again to be sure nothing is missed." }) : null,
      card("Summary", a.summary.length ? list(a.summary) : el("p", { class: "muted", text: "No sentences stood out." })),
      a.findings.length ? card("Key numbers", list(a.findings)) : null,
      treeCard(a),
      appraisalCard(a),
      readingCard(n),
      a.gaps && a.gaps.length ? card("What this does not answer", list(a.gaps)) : null,
      card("My notes", el("textarea", {
        class: "mine", rows: "5", placeholder: "What you'd tell a colleague about this. What to check. What you decided.",
        "aria-label": "My notes", value: n.mine || "",
        onchange: (e) => store.update(n.id, { mine: e.target.value }),
      })),
      el("details", { class: "card source" },
        el("summary", { text: "The text this note was made from" }),
        el("pre", { class: "source-text", text: n.capture.text })));
  }

  /* ---- the decision tree -------------------------------------------- */

  function treeNode(node) {
    const cites = node.cites && node.cites.length
      ? el("span", { class: "cites", title: "Reference numbers in the reading list", text: " [" + node.cites.join(", ") + "]" })
      : null;
    return el("li", {},
      el("div", { class: "node node-" + node.kind },
        el("span", { class: "node-word", text: NODE_WORD[node.kind] || "" }),
        el("span", { class: "node-text", text: node.text }), cites),
      node.children && node.children.length ? el("ul", { class: "tree" }, node.children.map(treeNode)) : null);
  }

  function treeCard(a) {
    if (!a.tree.children.length) {
      return card("Decision tree",
        el("p", { class: "muted", text: a.by === "claude"
          ? "The page gave Claude no conditions to branch on."
          : "The rules found no “if this patient, then that” statements on the page. They read sentence structure, so a page that reasons in prose can leave them empty-handed — “Rewrite with Claude” reads for meaning instead." }));
    }
    return card("Decision tree",
      el("div", { class: "node node-question" },
        el("span", { class: "node-word", text: "Question" }),
        el("span", { class: "node-text", text: a.tree.text })),
      el("ul", { class: "tree tree-root" }, a.tree.children.map(treeNode)),
      el("p", { class: "fine", text:
        "Built from what the page says, with the reference numbers it gave. It is a map of where to look, not a protocol — check each branch against its paper." }));
  }

  /* ---- how far to lean on it ---------------------------------------- */

  function appraisalCard(a) {
    const ap = a.appraisal;
    const c = ap.counts || {};
    const parts = [
      [c.guideline, "guideline", "guidelines"],
      [c.synthesis, "systematic review", "systematic reviews"],
      [c.rct, "randomised trial", "randomised trials"],
      [c.observational, "observational study", "observational studies"],
      [c.case, "case report", "case reports"],
      [c.other, "review or unclassified", "reviews or unclassified"],
    ].filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);

    return card("How far to lean on this",
      el("ol", { class: "ladder" }, ap.steps.map((s) =>
        el("li", { class: s.yes ? "is-yes" : "is-no" },
          el("span", { class: "ladder-q", text: s.q }),
          el("span", { class: "ladder-a", text: s.yes ? "Yes ↓" : "No" })))),
      el("div", { class: "verdict verdict-" + ap.grade },
        el("span", { class: "verdict-grade", text: (GRADE_WORD[ap.grade] || "") + " — " + ap.label }),
        el("p", { text: ap.verdict })),
      parts.length ? el("p", { class: "fine", text: "Cited: " + parts.join(" · ") + ". Study types are read from titles, so an unhelpful title is filed as unclassified." }) : null);
  }

  /* ---- the reading list --------------------------------------------- */

  function readingCard(n) {
    const a = n.analysis;
    if (!a.reading.length) {
      return card("Reading list", el("p", { class: "muted", text:
        "No citations were found on the page. If it had a reference list, capture again with the list on screen, or paste it in with the text." }));
    }
    const rows = a.reading.map((item, i) => {
      const r = a.refs.find((x) => x.n === item.n);
      if (!r) return null;
      const url = safeUrl(r.url);
      const done = Boolean(n.read && n.read[r.n]);
      const box = el("input", {
        type: "checkbox", checked: done, "aria-label": "Read: " + r.title,
        onchange: (e) => {
          store.update(n.id, { read: { ...(n.read || {}), [r.n]: e.target.checked } });
          show("notes");
        },
      });
      return el("li", { class: "read-row" + (done ? " is-done" : "") },
        el("span", { class: "read-rank", text: String(i + 1) }),
        box,
        el("div", { class: "read-body" },
          url ? el("a", { class: "read-title", href: url, target: "_blank", rel: "noopener noreferrer", text: r.title })
              : el("span", { class: "read-title", text: r.title }),
          el("div", { class: "read-meta" },
            el("span", { class: "chip chip-l" + r.level, text: r.kindLabel }),
            r.year ? el("span", { text: String(r.year) }) : null,
            r.host ? el("span", { text: r.host }) : null,
            el("span", { class: "cites", text: "ref " + r.n })),
          el("p", { class: "read-why", text: item.why })));
    });

    return card("Reading list",
      el("ol", { class: "read-list" }, rows),
      el("div", { class: "actions" },
        el("button", { class: "btn", text: "Copy unread for the reading agent", title:
          "Copies the unread papers as items for agents/data/reading.json", onclick: async () => {
          const items = analyze.toReadingItems(n, new Date().toISOString().slice(0, 10));
          if (!items.length) return toast("Everything here is read.");
          toast((await copyText(JSON.stringify(items, null, 2))) ? `${items.length} copied — paste into reading.json` : "Could not copy");
        } })));
  }

  /* ---- capture ------------------------------------------------------ */

  function captureView() {
    let pasted = null;   // links recovered from the HTML half of a paste

    const here = location.origin + location.pathname;
    const hosted = /^https?:$/.test(location.protocol);
    const marklet = el("a", {
      class: "bookmarklet", href: hosted ? capture.bookmarklet(here) : "#",
      text: "❋ Evidence note", draggable: "true",
      onclick: (e) => { e.preventDefault(); toast("Drag this to your bookmarks bar — don't click it here."); },
    });

    const question = el("input", { type: "text", class: "field", id: "capQuestion",
      placeholder: "The question you asked (optional — it sharpens the summary)", "aria-label": "Question" });
    const source = el("input", { type: "url", class: "field", id: "capSource",
      placeholder: "Where it's from (optional) — https://…", "aria-label": "Source address" });
    const text = el("textarea", { class: "paste", id: "capText", rows: "12",
      placeholder: "Paste the answer or abstract here, references and all…", "aria-label": "Pasted text",
      onpaste: (e) => {
        const html = e.clipboardData && e.clipboardData.getData("text/html");
        pasted = html ? capture.fromHtml(html) : null;
        if (pasted && pasted.links.length) toast(`Kept ${pasted.links.length} links from what you pasted`);
      },
    });

    const go = el("button", { class: "btn btn-primary", text: "Make a note", onclick: () => {
      const payload = capture.fromText(text.value);
      // Typed-in JSON from the bookmarklet carries its own links; otherwise
      // the ones the paste brought with it are better than any found in the words.
      if (payload.v !== 1 && pasted && pasted.links.length) payload.links = pasted.links;
      if (!payload.url) payload.url = source.value.trim();
      makeNote(payload, question.value || payload.question || "");
    } });

    return el("div", { class: "capture" },
      el("h1", { class: "view-title", text: "Capture what you're reading" }),

      card("From the page, in one click",
        el("p", { text: "Drag this button to your bookmarks bar. Then, on an OpenEvidence answer, a PubMed abstract or a journal page, click it: the page's text and citations come here and a note is waiting when the tab opens." }),
        el("p", { class: "center" }, marklet),
        hosted ? null : el("p", { class: "notice", text:
          "You've opened this as a file on your computer. The button only works when Evidence Desk is on the web (GitHub Pages, say) — until then, use the paste box below." }),
        el("p", { class: "fine", text:
          "It reads the page only when you click, and only the page you are on. Select part of a long page first and just that part is taken. Nothing is sent anywhere but this tab." })),

      card("Or paste it",
        el("p", { text: "Works everywhere, phone included. Select the answer with its reference list, copy, paste — the links to the papers come along with the text." }),
        question, source, text,
        el("div", { class: "actions" }, go)));
  }

  /* ---- settings ----------------------------------------------------- */

  function settingsView() {
    const s = store.settings();
    const key = el("input", { type: "password", class: "field", autocomplete: "off", spellcheck: "false",
      placeholder: "sk-ant-…", "aria-label": "Claude API key", value: s.apiKey });
    const model = el("input", { type: "text", class: "field", spellcheck: "false",
      "aria-label": "Model", value: s.model || store.DEFAULT_MODEL });
    const file = el("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { toast(`${store.importJSON(await f.text())} notes added`); }
      catch (err) { toast(err.message || "That file could not be read."); }
    } });

    return el("div", { class: "capture" },
      el("h1", { class: "view-title", text: "Settings" }),

      card("Claude (optional)",
        el("p", { text: "Without a key, notes are built by rules: sentences picked from the page, never rewritten. With one, “Rewrite with Claude” on a note sends that page's text to Anthropic and gets back a written summary and a proper nested tree." }),
        el("label", { class: "label", text: "API key" }), key,
        el("label", { class: "label", text: "Model" }), model,
        el("div", { class: "actions" },
          el("button", { class: "btn btn-primary", text: "Save", onclick: () => {
            store.setSettings({ apiKey: key.value.trim(), model: model.value.trim() || store.DEFAULT_MODEL });
            toast(key.value.trim() ? "Saved" : "Saved — Claude is off");
          } }),
          el("button", { class: "btn", text: "Forget the key", onclick: () => {
            store.setSettings({ apiKey: "" }); key.value = ""; toast("Key removed");
          } })),
        el("p", { class: "fine", text:
          "The key is kept in this browser only and is sent only to api.anthropic.com. It is never included in an export. Use a key with a spending limit, and never send a page with a patient's details on it." })),

      card("Your notes",
        el("p", { text: `${store.notes().length} saved in this browser. Clearing the browser's site data deletes them, so export now and then.` }),
        file,
        el("div", { class: "actions" },
          el("button", { class: "btn", text: "Export", onclick: () => {
            const url = URL.createObjectURL(new Blob([store.exportJSON()], { type: "application/json" }));
            const a = el("a", { href: url, download: `evidence-notes-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } }),
          el("button", { class: "btn", text: "Import", onclick: () => file.click() }),
          el("button", { class: "btn btn-danger", text: "Erase everything", onclick: () => {
            if (!window.confirm("Erase every note and the saved key from this browser? This cannot be undone.")) return;
            store.eraseAll(); EV.app.applyTheme(); show("capture"); toast("Erased");
          } }))));
  }

  EV.ui = { show, makeNote, state };
})(window.EV);
