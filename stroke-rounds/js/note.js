/* ==========================================================
   StrokeRounds — note.js
   Turns a patient record into text you can paste into the chart.

   buildNote()   — the full STROKE ROUND sheet, in the same order
                   as the paper template it replaces
   buildBrief()  — a one-screen sign-out blurb
   buildList()   — the whole census as a printable handoff
   ========================================================== */

const NoteBuilder = (() => {

  const STATUS_TEXT = {
    "":        "—",
    ordered:   "ordered",
    pending:   "pending",
    done:      "done",
    na:        "n/a",
  };

  const dash = (v) => (v && String(v).trim() ? String(v).trim() : "—");

  /** "Label: value" only when there is a value, so the note stays readable. */
  function line(label, value, opts = {}) {
    const v = value == null ? "" : String(value).trim();
    if (!v && !opts.always) return null;
    return `${label}: ${v || "—"}`;
  }

  function header(p) {
    const day = Store.hospitalDay(p);
    const bits = [
      p.name || "Unnamed patient",
      p.age ? `${p.age}${p.sex ? p.sex[0].toUpperCase() : ""}` : p.sex,
      p.room ? `Room ${p.room}` : "",
      p.mrn ? `MRN ${p.mrn}` : "",
    ].filter(Boolean);
    const l2 = [
      day ? `Hospital day ${day}` : "",
      p.admitDate ? `Admitted ${p.admitDate}` : "",
      p.lkw ? `LKW ${p.lkw}` : "",
    ].filter(Boolean);
    return [bits.join(" · "), l2.join(" · ")].filter(Boolean);
  }

  function workupBlock(p) {
    const out = [];
    Store.WORKUP_ITEMS.forEach((item) => {
      const w = p.workup[item.key] || { status: "", result: "" };
      if (!w.status && !w.result) return;
      const result = (w.result || "").trim();
      // A result typed without a status is still a result — don't print "— —".
      const value = w.status
        ? STATUS_TEXT[w.status] + (result ? ` — ${result}` : "")
        : result;
      out.push(`  ${item.label}: ${value}`);
    });
    return out;
  }

  function assocBlock(p) {
    const out = [];
    Store.ASSOC_FIELDS.forEach((f) => {
      const v = (p.assoc[f.key] || "").trim();
      if (v) out.push(`  ${f.label}: ${v}`);
    });
    return out;
  }

  /**
   * Full round note.
   * @param {object} p patient
   * @param {object} r the round entry to render (defaults to today's)
   * @param {object} opts {includeEmpty:boolean} — keep blank prompts as "—"
   *        so the note can be printed and filled in by hand at the bedside.
   */
  function buildNote(p, r, opts = {}) {
    const keepEmpty = !!opts.includeEmpty;
    const L = [];
    const push = (v) => { if (v !== null && v !== undefined) L.push(v); };
    const section = (title) => { push(""); push(title); };
    const kv = (label, value) => push(line(label, value, { always: keepEmpty }));

    push("STROKE ROUND");
    push(r && r.date ? r.date : Store.todayISO());
    header(p).forEach(push);
    push("");

    kv("Vitals", r && r.vitals);
    kv("Labs", r && r.labs);
    kv("Any new investigation", r && r.newInvestigation);

    push("");
    kv("Hx / Trauma", [p.hx, p.trauma].filter(Boolean).join(" | "));
    kv("Location", p.location);
    kv("Vascularity", p.vascularity);
    kv("Risk factors", (p.riskFactors || []).join(", "));
    kv("Etiology", [p.etiology, p.etiologyNote].filter(Boolean).join(" — "));
    kv("Stroke prevention", p.prevention);
    kv("DVT", p.dvt);
    kv("PT / OT / SLP", [p.pt, p.ot, p.slp].filter(Boolean).join(" | "));

    const acute = [p.tpa, p.evt].filter(Boolean).join(" | ");
    if (acute) kv("Acute treatment", acute);

    const nihss = (r && r.nihss) || p.nihssCurrent;
    if (p.nihssAdmit || nihss || p.mrsPre) {
      kv("NIHSS", [
        p.nihssAdmit ? `admit ${p.nihssAdmit}` : "",
        nihss ? `today ${nihss}` : "",
        p.mrsPre ? `pre-morbid mRS ${p.mrsPre}` : "",
      ].filter(Boolean).join(" · "));
    }

    const wu = workupBlock(p);
    if (wu.length || keepEmpty) {
      section("Work up:");
      if (wu.length) wu.forEach(push);
      else Store.WORKUP_ITEMS.forEach((i) => push(`  ${i.label}: —`));
    }

    const assoc = assocBlock(p);
    if (assoc.length || keepEmpty) {
      section("Associated condition:");
      if (assoc.length) assoc.forEach(push);
      else Store.ASSOC_FIELDS.forEach((f) => push(`  ${f.label}: —`));
    }

    push("");
    kv("Exam", r && r.exam);
    kv("Assessment", r && r.assessment);
    kv("Plan", r && r.plan);
    kv("Meds", p.meds);
    kv("Notes", p.notes);

    const open = (p.tasks || []).filter((t) => !t.done);
    if (open.length) {
      section("Open items:");
      open.forEach((t) => push(`  [ ] ${t.text}`));
    }

    if (p.dispo) { push(""); push(line("Dispo", p.dispo)); }

    // Collapse runs of blank lines that appear when sections are empty.
    return L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /** Short sign-out line: who they are, what happened, what is pending. */
  function buildBrief(p) {
    const day = Store.hospitalDay(p);
    const r = (p.rounds || []).find((x) => x.date === Store.todayISO());
    const pending = Store.WORKUP_ITEMS
      .filter((i) => ["ordered", "pending"].includes((p.workup[i.key] || {}).status))
      .map((i) => i.label);
    const open = (p.tasks || []).filter((t) => !t.done).map((t) => t.text);

    const L = [];
    L.push(`${p.room ? p.room + " · " : ""}${p.name || "Unnamed"}${p.age ? ", " + p.age : ""}${p.sex ? p.sex[0].toUpperCase() : ""}${day ? " · HD " + day : ""}`);
    L.push(`${p.type}${p.location ? " — " + p.location : ""}${p.vascularity ? " (" + p.vascularity + ")" : ""}`);
    if (p.etiology) L.push(`Etiology: ${p.etiology}`);
    if (p.tpa || p.evt) L.push(`Acute: ${[p.tpa, p.evt].filter(Boolean).join(" | ")}`);
    if (p.nihssAdmit || p.nihssCurrent) L.push(`NIHSS ${dash(p.nihssAdmit)} → ${dash(p.nihssCurrent)}`);
    if (p.prevention) L.push(`Prevention: ${p.prevention}`);
    if (r && r.plan) L.push(`Plan: ${r.plan}`);
    if (pending.length) L.push(`Pending: ${pending.join(", ")}`);
    if (open.length) L.push(`To do: ${open.join("; ")}`);
    if (p.dispo) L.push(`Dispo: ${p.dispo}`);
    return L.join("\n") + "\n";
  }

  /** Whole active list, for a printed handoff or a paste into a group chat. */
  function buildList(patients, title = "Stroke service") {
    const L = [`${title.toUpperCase()} — ${Store.todayISO()}`, `${patients.length} patient(s)`, ""];
    patients.forEach((p, i) => {
      L.push(`${i + 1}. ${buildBrief(p).trim().split("\n").join("\n   ")}`);
      L.push("");
    });
    return L.join("\n");
  }

  return { buildNote, buildBrief, buildList, STATUS_TEXT };
})();
