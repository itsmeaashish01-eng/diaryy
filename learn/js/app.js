/* ================================================
   CODE CLINIC — app.js
   Routing, the sidebar, the dashboard, and the controls in the top bar.

     #/            the dashboard: your two projects and the four tracks
     #/t/<track>   one track's lessons
     #/l/<lesson>  a lesson
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  const U = CC.util;
  const { el, $ } = U;
  const store = CC.store;

  /* ---- progress arithmetic ------------------------------------------------ */

  function lessonState(l) {
    if (store.isDone(l.id)) return "done";
    const req = CC.content.requiredBlocks(l);
    const any = req.some((b) => store.passed(store.blockKey(l.id, b.id)));
    const seen = store.data.lessons[l.id] && store.data.lessons[l.id].seen;
    return any || seen ? "started" : "new";
  }

  function trackProgress(t) {
    const done = t.lessons.filter((l) => store.isDone(l.id)).length;
    return { done, total: t.lessons.length, pct: t.lessons.length ? done / t.lessons.length : 0 };
  }

  function projectProgress(kind) {
    const ls = CC.content.allLessons().filter((l) => l.project === kind);
    const done = ls.filter((l) => store.isDone(l.id)).length;
    const next = ls.find((l) => !store.isDone(l.id)) || null;
    return { done, total: ls.length, next };
  }

  const ICON = { done: "✓", started: "◐", new: "○" };
  const meter = (pct, label) => el("div", { class: "meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct * 100), "aria-label": label },
    el("span", { style: { width: `${Math.round(pct * 100)}%` } }));

  /* ---- sidebar ------------------------------------------------------------- */

  function renderSidebar(activeLesson, activeTrack) {
    const nav = $("#sidebarNav");
    nav.replaceChildren(...CC.content.tracks.map((t) => {
      const p = trackProgress(t);
      const open = t.id === activeTrack || (activeLesson && activeLesson.track === t.id);
      const details = el("details", { class: "side-track", open: open || undefined },
        el("summary", null,
          el("span", { class: "side-icon", "aria-hidden": "true" }, t.icon),
          el("span", { class: "side-title" }, t.title),
          el("span", { class: "side-count" }, `${p.done}/${p.total}`)),
        meter(p.pct, `${t.title}: ${p.done} of ${p.total} lessons done`),
        el("ol", { class: "side-lessons" }, t.lessons.map((l) => {
          const st = lessonState(l);
          return el("li", { class: `st-${st}${activeLesson && activeLesson.id === l.id ? " active" : ""}` },
            el("a", { href: `#/l/${l.id}`, "aria-current": activeLesson && activeLesson.id === l.id ? "page" : undefined },
              el("span", { class: "st", "aria-label": st === "done" ? "done" : st === "started" ? "started" : "not started" }, ICON[st]),
              el("span", null, l.title)));
        })));
      return details;
    }));
  }

  /* ---- dashboard ------------------------------------------------------------ */

  function projectCard(kind, title, blurb, finishLine) {
    const p = projectProgress(kind);
    return el("section", { class: `project project-${kind}` },
      el("h2", null, title),
      el("p", null, blurb),
      meter(p.total ? p.done / p.total : 0, `${title}: ${p.done} of ${p.total} lessons`),
      el("p", { class: "w-hint" }, `${p.done} of ${p.total} lessons that build it`),
      p.next
        ? el("p", null, "Next: ", el("a", { href: `#/l/${p.next.id}` }, p.next.title))
        : el("p", { class: "fb-ok" }, finishLine));
  }

  function renderDashboard(main) {
    const last = store.data.last && CC.content.lesson(store.data.last);
    const first = CC.content.allLessons()[0];
    const resume = last && !store.isDone(last.id) ? last : CC.content.allLessons().find((l) => !store.isDone(l.id)) || first;
    const anyProgress = CC.content.allLessons().some((l) => lessonState(l) !== "new");

    main.replaceChildren(el("div", { class: "dash" },
      el("header", { class: "dash-hero" },
        el("p", { class: "eyebrow" }, "Coding · Agentic AI · Deployment · Research — two projects, one clinician"),
        el("h1", null, "Code Clinic"),
        el("p", { class: "lede" }, "Learn to program, to build with AI agents, and to ship software — by building your own website and a research toolkit you'll actually use. Everything runs here in the browser; nothing to install."),
        el("div", { class: "toolbar" },
          el("a", { class: "btn primary", href: `#/l/${resume.id}` }, anyProgress ? `Continue: ${resume.title}` : "Start the course"),
          anyProgress ? null : el("a", { class: "btn ghost", href: "#/t/start" }, "How it works"))),
      el("div", { class: "projects" },
        projectCard("website", "Your website", "A personal academic site — about you, your research, your publications, how to reach you — written by hand, checked automatically, live on your own address.", "✓ Built and shipped."),
        projectCard("research", "Your research toolkit", "A reproducible analysis of a (simulated) cohort — cleaning, Table 1, risk ratios, Kaplan–Meier — and a literature assistant that can only cite what it actually found.", "✓ Toolkit complete.")),
      el("h2", { class: "section-title" }, "The tracks"),
      el("div", { class: "tracks" }, CC.content.tracks.map((t) => {
        const p = trackProgress(t);
        const mins = t.lessons.reduce((s, l) => s + (l.minutes || 30), 0);
        return el("a", { class: "track-card", href: `#/t/${t.id}` },
          el("span", { class: "track-icon", "aria-hidden": "true" }, t.icon),
          el("h3", null, t.title),
          el("p", null, t.summary),
          meter(p.pct, `${t.title} progress`),
          el("p", { class: "w-hint" }, `${p.done}/${p.total} lessons · about ${U.fmtMinutes(mins)}`));
      })),
      el("section", { class: "dash-foot" },
        el("h2", { class: "section-title" }, "Good to know"),
        el("ul", null,
          el("li", null, "Your progress, code and notes are saved in this browser only. Use ⤓ in the top bar to export them, and ⤒ to bring them back on another machine."),
          el("li", null, "Python loads the first time a Python exercise runs (about 12 MB from cdn.jsdelivr.net, then cached). It needs the page served — the published site, or python3 -m http.server 8000 in the repository folder — rather than opened as a file."),
          el("li", null, "The agent lab works without an API key in practice mode. Live mode uses your own key, which never leaves this browser except to go to Anthropic."),
          el("li", null, "No real patient data is used anywhere in this course, and none should ever be pasted into it.")),
        el("div", { class: "toolbar" },
          el("button", { class: "btn ghost small", type: "button", on: { click: () => {
            if (!window.confirm("Erase all progress, code and notes in this browser? Export first if you might want them.")) return;
            store.reset();
            route();
          } } }, "Reset all progress")))));
  }

  function renderTrack(main, t) {
    const p = trackProgress(t);
    main.replaceChildren(el("div", { class: "track-page" },
      el("p", { class: "crumbs" }, el("a", { href: "#/" }, "Code Clinic"), " · Track"),
      el("h1", null, `${t.icon} ${t.title}`),
      el("p", { class: "lede" }, t.summary),
      t.outcome ? el("div", { class: "objectives" }, el("p", { class: "w-label" }, "What you'll have at the end"), el("p", null, t.outcome)) : null,
      meter(p.pct, `${p.done} of ${p.total} lessons done`),
      el("ol", { class: "lesson-list" }, t.lessons.map((l) => {
        const st = lessonState(l);
        return el("li", { class: `st-${st}` },
          el("a", { href: `#/l/${l.id}` },
            el("span", { class: "st" }, ICON[st]),
            el("span", { class: "ll-main" }, el("span", { class: "ll-title" }, l.title), l.summary ? el("span", { class: "ll-sum" }, l.summary) : null),
            el("span", { class: "ll-meta" }, U.fmtMinutes(l.minutes || 30), l.project ? el("span", { class: `tag tag-${l.project}` }, l.project === "website" ? "website" : "research") : null)));
      }))));
  }

  /* ---- routing ------------------------------------------------------------------ */

  function route() {
    const main = $("#main");
    const h = location.hash.replace(/^#/, "");
    const m = h.match(/^\/(l|t)\/([\w-]+)$/);
    document.body.classList.remove("menu-open");
    if (m && m[1] === "l" && CC.content.lesson(m[2])) {
      const l = CC.content.lesson(m[2]);
      CC.ui.renderLesson(l, main, refreshSoon);
      renderSidebar(l, null);
      document.title = `${l.title} — Code Clinic`;
    } else if (m && m[1] === "t" && CC.content.track(m[2])) {
      const t = CC.content.track(m[2]);
      renderTrack(main, t);
      renderSidebar(null, t.id);
      document.title = `${t.title} — Code Clinic`;
    } else {
      renderDashboard(main);
      renderSidebar(null, null);
      document.title = "Code Clinic — coding, agents and deployment for a clinician";
    }
    window.scrollTo(0, 0);
    const h1 = main.querySelector("h1");
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
  }

  /* Progress changes many times a second while you type into a widget;
     the sidebar only needs to catch up once you pause. */
  const refreshSoon = U.debounce(() => {
    const h = location.hash.match(/^#\/l\/([\w-]+)$/);
    const t = location.hash.match(/^#\/t\/([\w-]+)$/);
    renderSidebar(h ? CC.content.lesson(h[1]) : null, t ? t[1] : null);
  }, 300);

  /* ---- top bar ---------------------------------------------------------------------- */

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function applyTheme(dark) {
    document.body.classList.toggle("dark", dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    $("#darkIcon").textContent = dark ? "☀" : "☾";
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("darkMode"); } catch { saved = null; }
    const dark = saved == null ? window.matchMedia("(prefers-color-scheme: dark)").matches : saved === "1";
    applyTheme(dark);
    $("#darkToggle").addEventListener("click", () => {
      const now = !document.body.classList.contains("dark");
      applyTheme(now);
      try { localStorage.setItem("darkMode", now ? "1" : "0"); } catch { /* still toggles for this visit */ }
    });
  }

  function initSearch() {
    const input = $("#searchInput");
    const box = $("#searchResults");
    const close = () => { box.hidden = true; box.replaceChildren(); };
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { close(); return; }
      const hits = CC.content.allLessons().filter((l) =>
        (l.title + " " + (l.summary || "") + " " + (l.keywords || "")).toLowerCase().includes(q)).slice(0, 8);
      box.replaceChildren(...(hits.length ? hits.map((l) => el("a", { href: `#/l/${l.id}`, class: "sr", on: { click: () => { input.value = ""; close(); } } },
        el("span", { class: "sr-track" }, CC.content.track(l.track).title), el("span", null, l.title)))
        : [el("p", { class: "w-note" }, "No lesson matches that.")]));
      box.hidden = false;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const a = box.querySelector("a"); if (a) { location.hash = a.getAttribute("href"); input.value = ""; close(); } }
      if (e.key === "Escape") { input.value = ""; close(); input.blur(); }
    });
    document.addEventListener("click", (e) => { if (!box.contains(e.target) && e.target !== input) close(); });
  }

  function initData() {
    $("#exportBtn").addEventListener("click", () => {
      U.download(`code-clinic-${U.todayStr()}.json`, store.exportJSON(), "application/json");
      toast("Exported — keep the file somewhere safe.");
    });
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (!window.confirm("Replace the progress in this browser with the file's?")) return;
        try { store.importJSON(String(reader.result)); toast("Imported."); route(); }
        catch (err) { toast(err.message); }
      };
      reader.readAsText(f);
    });
  }

  function init() {
    store.load();
    initTheme();
    initSearch();
    initData();
    $("#menuBtn").addEventListener("click", () => {
      const open = document.body.classList.toggle("menu-open");
      $("#menuBtn").setAttribute("aria-expanded", String(open));
    });
    if (!store.storageOk) toast("This browser won't let the page save — progress will be lost when you close it.");
    window.addEventListener("hashchange", route);
    route();
  }

  document.addEventListener("DOMContentLoaded", init);
  CC.app = { route, lessonState, trackProgress };
})(window.CC);
