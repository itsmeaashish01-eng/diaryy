/* ================================================
   CODE CLINIC — store.js
   Your progress, your code, your notes. All of it lives in this
   browser's localStorage under "codeClinic", and Export/Import moves it
   between machines as one JSON file — the same arrangement as the diary.

   The one thing deliberately kept apart is an API key, if you give the
   agent lab one: it never goes into the export file, and unless you tick
   "remember on this device" it only lives as long as the tab.
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  const KEY = "codeClinic";
  const KEY_API = "codeClinic.apiKey";
  const VERSION = 1;

  const DEFAULT_SETTINGS = {
    model: "claude-opus-5-5",
    effort: "medium",
    hoursPerWeek: 3,
    pubmedEmail: "",
  };

  const fresh = () => ({
    v: VERSION,
    created: Date.now(),
    last: null,          // the lesson you were on, so "continue" means something
    lessons: {},         // id -> { done: ts|null, seen: ts }
    blocks: {},          // "lesson:block" -> { passed: ts|null, attempts, code, answer, state }
    notes: {},           // lesson id -> your own words
    settings: { ...DEFAULT_SETTINGS },
  });

  let data = fresh();
  let storageOk = true;
  const listeners = [];

  const isObj = (x) => x != null && typeof x === "object" && !Array.isArray(x);

  /* Anything that came from a file or an old version gets the same
     treatment: keep what's well-formed, replace what isn't. A malformed
     import shouldn't be able to put the page in a state it can't render. */
  function normalise(raw) {
    const d = fresh();
    if (!isObj(raw)) return d;
    if (Number.isFinite(raw.created)) d.created = raw.created;
    if (typeof raw.last === "string") d.last = raw.last;
    for (const k of ["lessons", "blocks", "notes"]) {
      if (!isObj(raw[k])) continue;
      for (const [id, v] of Object.entries(raw[k])) {
        if (k === "notes") { if (typeof v === "string") d.notes[id] = v; }
        else if (isObj(v)) d[k][id] = v;
      }
    }
    if (isObj(raw.settings)) {
      for (const [k, v] of Object.entries(raw.settings)) {
        if (k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k]) d.settings[k] = v;
      }
    }
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? normalise(JSON.parse(raw)) : fresh();
    } catch {
      storageOk = false;
      data = fresh();
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      storageOk = true;
    } catch {
      storageOk = false;
    }
    listeners.forEach((fn) => { try { fn(); } catch { /* a listener's bug isn't a save failure */ } });
    return storageOk;
  }

  const onChange = (fn) => listeners.push(fn);

  /* ---- lessons ------------------------------------------------------- */

  const lesson = (id) => data.lessons[id] || (data.lessons[id] = { done: null, seen: null });
  const isDone = (id) => Boolean(data.lessons[id] && data.lessons[id].done);

  function setDone(id, done) {
    lesson(id).done = done ? Date.now() : null;
    save();
  }

  function visit(id) {
    lesson(id).seen = Date.now();
    data.last = id;
    save();
  }

  /* ---- blocks (exercises, quizzes, widgets) ---------------------------- */

  const blockKey = (lessonId, blockId) => `${lessonId}:${blockId}`;
  const block = (key) => data.blocks[key] || (data.blocks[key] = {});
  const peek = (key) => data.blocks[key] || null;
  const passed = (key) => Boolean(data.blocks[key] && data.blocks[key].passed);

  function pass(key) {
    const b = block(key);
    if (!b.passed) b.passed = Date.now();
    save();
  }

  function attempt(key) {
    const b = block(key);
    b.attempts = (b.attempts || 0) + 1;
    save();
    return b.attempts;
  }

  function setCode(key, code) {
    block(key).code = code;
    save();
  }

  function setState(key, state) {
    block(key).state = state;
    save();
  }

  /* ---- notes & settings ------------------------------------------------ */

  function setNote(id, text) {
    if (text && text.trim()) data.notes[id] = text;
    else delete data.notes[id];
    save();
  }

  function setSetting(k, v) {
    data.settings[k] = v;
    save();
  }

  /* ---- the API key, kept apart ------------------------------------------ */

  function apiKey() {
    try { return localStorage.getItem(KEY_API) || sessionStorage.getItem(KEY_API) || ""; }
    catch { return ""; }
  }

  function setApiKey(key, remember) {
    try {
      localStorage.removeItem(KEY_API);
      sessionStorage.removeItem(KEY_API);
      if (key) (remember ? localStorage : sessionStorage).setItem(KEY_API, key);
    } catch { /* storage refused — the key simply won't persist */ }
  }

  function apiKeyRemembered() {
    try { return Boolean(localStorage.getItem(KEY_API)); } catch { return false; }
  }

  /* ---- moving between machines ------------------------------------------- */

  function exportJSON() {
    return JSON.stringify({ app: "code-clinic", exported: new Date().toISOString(), ...data }, null, 2);
  }

  function importJSON(text) {
    let raw;
    try { raw = JSON.parse(text); }
    catch { throw new Error("That file isn't valid JSON."); }
    if (!isObj(raw) || (raw.app && raw.app !== "code-clinic") || !isObj(raw.lessons)) {
      throw new Error("That doesn't look like a Code Clinic export.");
    }
    data = normalise(raw);
    save();
    return data;
  }

  function reset() {
    data = fresh();
    save();
  }

  CC.store = {
    KEY, load, save, onChange,
    get data() { return data; },
    get storageOk() { return storageOk; },
    lesson, isDone, setDone, visit,
    blockKey, peek, passed, pass, attempt, setCode, setState,
    setNote, setSetting,
    apiKey, setApiKey, apiKeyRemembered,
    exportJSON, importJSON, reset, normalise,
  };
})(window.CC);
