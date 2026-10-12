#!/usr/bin/env node
/* ================================================
   NEURO MULTIVERSE — selftest.mjs
   Checks that the question bank holds together.

     node neuro/selftest.mjs

   data.js is a plain browser script, so it runs here in a sandbox with
   a stand-in window. app.js is left out: it needs a DOM, and all it
   does is show what data.js holds.
   ================================================ */

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const win = {};
runInContext(readFileSync(join(HERE, "js/data.js"), "utf8"), createContext({ window: win }));

let passed = 0;
const failures = [];
function ok(cond, what) {
  if (cond) passed++;
  else failures.push(what);
}

const universes = win.NM && win.NM.data;
ok(Array.isArray(universes) && universes.length > 0, "data.js defines NM.data as a non-empty list");

const filled = (s) => typeof s === "string" && s.trim().length > 0;
const universeIds = new Set();
// Progress is stored against question ids, so they must be unique across
// every universe, not just within one.
const questionIds = new Set();

for (const u of universes || []) {
  const at = `universe "${u.id}"`;
  ok(filled(u.id) && !universeIds.has(u.id), `${at}: id is set and unique`);
  universeIds.add(u.id);
  ok(filled(u.name) && filled(u.glyph) && filled(u.tagline), `${at}: has a name, glyph and tagline`);

  ok(Array.isArray(u.notes) && u.notes.length > 0, `${at}: has notes`);
  for (const n of u.notes || []) {
    ok(filled(n.title) && filled(n.body), `${at}: note "${n.title}" has a title and body`);
  }

  ok(Array.isArray(u.questions) && u.questions.length > 0, `${at}: has questions`);
  for (const q of u.questions || []) {
    const qat = `question "${q.id}"`;
    ok(filled(q.id) && !questionIds.has(q.id), `${qat}: id is set and unique`);
    questionIds.add(q.id);
    ok(filled(q.q) && filled(q.why), `${qat}: has a question and an explanation`);
    ok(Array.isArray(q.options) && q.options.length === 4, `${qat}: has exactly four options`);
    ok((q.options || []).every(filled), `${qat}: no option is blank`);
    ok(new Set(q.options).size === (q.options || []).length, `${qat}: options are distinct`);
    ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < (q.options || []).length,
      `${qat}: answer points at one of the options`);
  }
}

if (failures.length) {
  console.error(`\n✕ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f) => console.error("  ✕ " + f + "\n"));
  process.exit(1);
}
console.log(`✓ ${passed} checks passed`);
