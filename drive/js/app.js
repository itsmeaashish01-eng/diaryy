/* ================================================
   LANE COACH — app.js
   Tabs, keyboard routing, resize, and the few preferences worth
   remembering between visits. Loaded last: everything it starts is
   already on window.LC.
   ================================================ */
window.LC = window.LC || {};

(function (LC) {
  "use strict";
  const KEY = "laneCoach";

  // Preferences only — a private window or blocked storage just means
  // starting from the defaults, never a broken page.
  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function savePrefs(patch) {
    try { localStorage.setItem(KEY, JSON.stringify(Object.assign(readPrefs(), patch))); } catch (e) { /* fine */ }
  }

  const prefs = readPrefs();
  let view = "quiz";

  function show(name) {
    view = name;
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.view === name;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== "view-" + name; });
    if (name !== "drive") LC.drive.hide();
    // A canvas sized while hidden is 0×0; draw again now it has a size.
    requestAnimationFrame(() => (name === "quiz" ? LC.quiz.draw() : name === "drive" ? LC.drive.draw() : null));
    savePrefs({ view: name });
  }

  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => show(t.dataset.view));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tabs = Array.from(document.querySelectorAll(".tab"));
      const i = tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
      const next = tabs[(i + tabs.length) % tabs.length];
      next.focus();
      show(next.dataset.view);
      e.preventDefault();
      e.stopPropagation();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "select" || tag === "input" || tag === "textarea" || e.target.classList.contains("tab")) return;
    // Space and Enter on a focused button should press the button.
    if (tag === "button" && (e.key === " " || e.key === "Enter")) return;
    const handled = view === "quiz" ? LC.quiz.key(e) : view === "drive" ? LC.drive.key(e) : false;
    if (handled) e.preventDefault();
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => (view === "quiz" ? LC.quiz.draw() : LC.drive.draw()), 60);
  });

  LC.quiz.init({
    cues: prefs.cues,
    onPrefs: savePrefs,
    onDrive: (id) => { LC.drive.load(id); show("drive"); },
  });
  LC.drive.init({ traffic: prefs.traffic, timeScale: prefs.timeScale, onPrefs: savePrefs });

  show(["quiz", "drive", "guide"].includes(prefs.view) ? prefs.view : "quiz");

  // The guide explains a live card: the Mixmaster drill has an exit
  // number, which the Denton split does not.
  LC.draw.navCard(document.getElementById("guide-nav"), LC.scenarios[1], { cues: true, distanceFt: 2500 });
})(window.LC);
