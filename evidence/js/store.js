/* ================================================
   EVIDENCE DESK — store.js
   Notes and settings, in this browser's localStorage and nowhere else.

   A note keeps the text it was made from. That costs space, but it is
   what lets a note be analysed again — by better rules later, or by
   Claude when you ask — and what lets you check a sentence in the summary
   against the page it came from.
   ================================================ */
(function (EV) {
  "use strict";
  const KEY = "evidenceDesk";
  const DEFAULT_MODEL = "claude-opus-5-5";

  const blank = () => ({
    v: 1,
    notes: [],
    settings: { theme: "auto", apiKey: "", model: DEFAULT_MODEL },
  });

  let data = blank();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && Array.isArray(raw.notes)) {
        data = { ...blank(), ...raw, settings: { ...blank().settings, ...(raw.settings || {}) } };
      }
    } catch (e) {
      data = blank();
    }
    return data;
  }

  /* Returns false rather than throwing when the browser is out of room,
     so the caller can say so in a sentence. */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  const notes = () => data.notes;
  const get = (id) => data.notes.find((n) => n.id === id) || null;

  function add(note) {
    data.notes.unshift(note);
    return save();
  }

  function update(id, patch) {
    const n = get(id);
    if (!n) return false;
    Object.assign(n, patch, { updated: Date.now() });
    return save();
  }

  function remove(id) {
    data.notes = data.notes.filter((n) => n.id !== id);
    return save();
  }

  const settings = () => data.settings;
  function setSettings(patch) {
    Object.assign(data.settings, patch);
    return save();
  }

  /* The key never leaves in an export: a backup file gets emailed,
     dropped in a shared folder, committed by accident. */
  function exportJSON() {
    return JSON.stringify({ v: 1, exported: new Date().toISOString(), notes: data.notes }, null, 2);
  }

  /* Merges by id, so importing the same backup twice changes nothing. */
  function importJSON(text) {
    const j = JSON.parse(text);
    if (!j || !Array.isArray(j.notes)) throw new Error("That file has no notes in it.");
    const have = new Set(data.notes.map((n) => n.id));
    let added = 0;
    for (const n of j.notes) {
      if (!n || typeof n.id !== "string" || !n.analysis || !n.capture || have.has(n.id)) continue;
      data.notes.push(n);
      added++;
    }
    data.notes.sort((a, b) => (b.created || 0) - (a.created || 0));
    if (!save()) throw new Error("This browser is out of storage room.");
    return added;
  }

  function eraseAll() {
    data = blank();
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing to remove */ }
  }

  EV.store = {
    DEFAULT_MODEL, load, notes, get, add, update, remove,
    settings, setSettings, exportJSON, importJSON, eraseAll,
  };
})(window.EV);
