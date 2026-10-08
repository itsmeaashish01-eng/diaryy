/* ================================================
   CODE CLINIC — course.js
   The registry the content files add their tracks to, and the one place
   that decides what an exercise's code can see before yours runs.

   No DOM in here: selftest.mjs loads this too, and builds every
   exercise's prelude exactly as the page does — so a model answer that
   passes there passes here.
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  const tracks = [];
  const byId = {};

  function addTrack(track) {
    const order = track.order == null ? tracks.length : track.order;
    track.order = order;
    track.lessons.forEach((l, i) => {
      l.track = track.id;
      l.index = i;
      byId[l.id] = l;
    });
    tracks.push(track);
    tracks.sort((a, b) => a.order - b.order);
  }

  const lesson = (id) => byId[id] || null;
  const track = (id) => tracks.find((t) => t.id === id) || null;
  const allLessons = () => tracks.flatMap((t) => t.lessons);

  /* What a lesson asks of you before it counts as done: every exercise,
     quiz and widget that isn't marked optional. */
  const requiredBlocks = (l) => (l.blocks || []).filter((b) => b.id && !b.optional && (b.type === "code" || b.type === "quiz" || b.type === "widget"));

  function neighbours(id) {
    const all = allLessons();
    const i = all.findIndex((l) => l.id === id);
    return { prev: i > 0 ? all[i - 1] : null, next: i >= 0 && i < all.length - 1 ? all[i + 1] : null };
  }

  /* ---- preludes ------------------------------------------------------- */
  /*
     An exercise can say  uses: ["stats", "cohort"]  and get, ahead of your
     code, the libraries and data it's about. The names are documented in
     each exercise's prompt; the reference libraries arrive as __stats and
     __agents so the checks can compare your answer with theirs.
  */
  const JS_LIBS = {
    stats: () => `const __stats = (${CC.stats.source})();`,
    agents: () => `const __agents = (${CC.agent.source})();`,
    cohort: () => `const COHORT = __stats.makeCohort({ seed: ${CC.stats.SEED} });`,
    messyCSV: () => `const MESSY_CSV = __stats.makeMessyCSV({ seed: ${CC.stats.SEED} });`,
  };
  const JS_NEEDS = { cohort: ["stats"], messyCSV: ["stats"] };

  /* Python can't run the JavaScript libraries, so the data arrives as data:
     the same 600 rows, as JSON, built by the same seeded generator. */
  const PY_LIBS = {
    cohort: () => `import json as __json\nCOHORT = __json.loads(${JSON.stringify(JSON.stringify(CC.stats.makeCohort({ seed: CC.stats.SEED })))})`,
    messyCSV: () => `MESSY_CSV = ${JSON.stringify(CC.stats.makeMessyCSV({ seed: CC.stats.SEED }))}`,
  };

  function prelude(block) {
    const uses = block.uses || [];
    const parts = [];
    if (block.lang === "python") {
      uses.forEach((u) => { if (!PY_LIBS[u]) throw new Error(`no Python prelude "${u}"`); parts.push(PY_LIBS[u]()); });
    } else {
      const seen = new Set();
      const add = (u) => {
        if (seen.has(u)) return;
        (JS_NEEDS[u] || []).forEach(add);
        if (!JS_LIBS[u]) throw new Error(`no JavaScript prelude "${u}"`);
        seen.add(u);
        parts.push(JS_LIBS[u]());
      };
      uses.forEach(add);
    }
    if (block.prelude) parts.push(block.prelude);
    return parts.join("\n");
  }

  CC.content = { tracks, addTrack, lesson, track, allLessons, requiredBlocks, neighbours, prelude };
})(window.CC);
