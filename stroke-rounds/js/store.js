/* ==========================================================
   StrokeRounds — store.js
   Local-only data layer. Nothing leaves the device: every
   patient, round and task lives in localStorage under
   "strokeRounds.v1". Export/import is a plain JSON file the
   user controls.
   ========================================================== */

const Store = (() => {
  const KEY      = "strokeRounds.v1";
  const SETTINGS = "strokeRounds.settings.v1";
  const SCHEMA   = 1;

  /* ---------- Reference data (the fields from the paper list) ---------- */

  const STROKE_TYPES = [
    "Ischemic stroke", "TIA", "ICH", "SAH", "CVST",
    "Stroke mimic", "Carotid/vert dissection", "Other",
  ];

  const VASC_TERRITORIES = [
    "MCA", "MCA superior div", "MCA inferior div", "ACA", "PCA",
    "Vertebrobasilar", "PICA", "AICA", "SCA", "Lenticulostriate",
    "Watershed", "Multi-territory",
  ];

  const LOCATIONS = [
    "L frontal", "R frontal", "L parietal", "R parietal",
    "L temporal", "R temporal", "L occipital", "R occipital",
    "L insula", "R insula", "L basal ganglia", "R basal ganglia",
    "L thalamus", "R thalamus", "L corona radiata", "R corona radiata",
    "Pons", "Midbrain", "Medulla", "L cerebellum", "R cerebellum",
  ];

  const RISK_FACTORS = [
    "HTN", "DM2", "HLD", "AFib", "CAD", "CHF", "Prior stroke/TIA",
    "Smoking", "OSA", "CKD", "Obesity", "PFO", "Carotid stenosis",
    "Malignancy", "OCP/HRT", "Substance use", "Family hx",
  ];

  const ETIOLOGIES = [
    "Large artery atherosclerosis", "Cardioembolic", "Small vessel",
    "Other determined", "Cryptogenic / ESUS", "Incomplete work-up",
    "Dissection", "Hypoperfusion / watershed", "Vasculitis / RCVS",
  ];

  /* Work-up items — mirrors the "Work up" block of the rounding sheet */
  const WORKUP_ITEMS = [
    { key: "cth",       label: "CT head",             sub: "baseline / interval bleed check" },
    { key: "cta",       label: "CTA head & neck",     sub: "LVO, stenosis, dissection" },
    { key: "ctp",       label: "CT perfusion",        sub: "core / penumbra mismatch" },
    { key: "mri",       label: "MRI brain",           sub: "DWI · ADC · SWAN · FLAIR ± contrast" },
    { key: "priorScan", label: "Prior scans reviewed", sub: "outside imaging / comparison" },
    { key: "tte",       label: "TTE",                 sub: "EF, wall motion, thrombus" },
    { key: "bubble",    label: "Bubble study",        sub: "R→L shunt / PFO" },
    { key: "tee",       label: "TEE",                 sub: "if source still unclear" },
    { key: "ltcm",      label: "Long-term cardiac monitor", sub: "≥14–30 day for occult AF" },
    { key: "ldl",       label: "LDL",                 sub: "goal < 70 mg/dL" },
    { key: "a1c",       label: "HbA1c",               sub: "goal < 7%" },
    { key: "hypercoag", label: "Hypercoagulable panel", sub: "APLA, factors — timing matters" },
    { key: "dsa",       label: "DSA",                 sub: "catheter angiography" },
    { key: "eeg",       label: "EEG",                 sub: "if seizure suspected" },
  ];

  const WORKUP_STATUS = ["", "ordered", "pending", "done", "na"];

  /* Associated-condition block */
  const ASSOC_FIELDS = [
    { key: "cns",          label: "CNS / prior stroke" },
    { key: "card",         label: "Cardiac (stent, CAD, valve)" },
    { key: "endo",         label: "Endocrine" },
    { key: "hemeOnc",      label: "Heme / Onc" },
    { key: "electroRenal", label: "Electrolytes / renal" },
    { key: "infection",    label: "Infection" },
    { key: "other",        label: "Other significant disorder" },
  ];

  /* ---------- Defaults ---------- */

  const DEFAULT_SETTINGS = {
    theme: "dark",
    pin: "",            // stored as a hash, empty = no lock
    lockOnHide: true,
    autoPurgeDays: 0,   // 0 = never auto-purge signed-off patients
    listName: "Stroke service",
    lastBackup: "",
  };

  let db = { schema: SCHEMA, patients: [], updatedAt: "" };
  let settings = { ...DEFAULT_SETTINGS };

  /* ---------- Utilities ---------- */

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const todayISO = (d = new Date()) => {
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return t.toISOString().slice(0, 10);
  };

  const nowISO = () => new Date().toISOString();

  /** Days since admission, 1-indexed the way rounds are counted. */
  function hospitalDay(patient) {
    if (!patient.admitDate) return null;
    const a = new Date(patient.admitDate + "T00:00:00");
    const t = new Date(todayISO() + "T00:00:00");
    const diff = Math.round((t - a) / 86400000);
    return diff >= 0 ? diff + 1 : null;
  }

  /* Tiny non-cryptographic hash. This is a screen-lock convenience for a
     shared workstation, not encryption — the README says so plainly. */
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return "h" + (h >>> 0).toString(36);
  }

  /* ---------- Blank records ---------- */

  function blankWorkup() {
    const wu = {};
    WORKUP_ITEMS.forEach((i) => (wu[i.key] = { status: "", result: "" }));
    return wu;
  }

  function blankAssoc() {
    const a = {};
    ASSOC_FIELDS.forEach((f) => (a[f.key] = ""));
    return a;
  }

  function blankPatient() {
    return {
      id: uid(),
      name: "",
      mrn: "",
      room: "",
      age: "",
      sex: "",
      admitDate: todayISO(),
      lkw: "",
      type: "Ischemic stroke",
      location: "",
      vascularity: "",
      hx: "",
      trauma: "",
      nihssAdmit: "",
      nihssCurrent: "",
      mrsPre: "",
      tpa: "",          // e.g. "TNK 0.25 mg/kg @ 03:12"
      evt: "",          // e.g. "EVT TICI 2b @ 04:40"
      riskFactors: [],
      etiology: "",
      etiologyNote: "",
      prevention: "",
      dvt: "",
      pt: "", ot: "", slp: "",
      workup: blankWorkup(),
      assoc: blankAssoc(),
      meds: "",
      notes: "",
      dispo: "",
      flag: false,
      status: "active",
      dischargeDate: "",
      tasks: [],
      rounds: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  }

  function blankRound(date = todayISO()) {
    return {
      id: uid(),
      date,
      vitals: "",
      labs: "",
      newInvestigation: "",
      exam: "",
      nihss: "",
      assessment: "",
      plan: "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  }

  /* ---------- Persistence ---------- */

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        db = migrate(parsed);
      }
    } catch (e) {
      console.warn("StrokeRounds: could not read saved data", e);
    }
    try {
      const raw = localStorage.getItem(SETTINGS);
      if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      console.warn("StrokeRounds: could not read settings", e);
    }
    autoPurge();
    return db;
  }

  /** Fill in fields added after a record was first written. */
  function migrate(parsed) {
    const out = { schema: SCHEMA, patients: [], updatedAt: parsed.updatedAt || "" };
    out.patients = (parsed.patients || []).map((p) => {
      const base = blankPatient();
      const merged = { ...base, ...p };
      merged.workup = { ...base.workup, ...(p.workup || {}) };
      WORKUP_ITEMS.forEach((i) => {
        if (typeof merged.workup[i.key] === "string") {
          merged.workup[i.key] = { status: "done", result: merged.workup[i.key] };
        }
        if (!merged.workup[i.key]) merged.workup[i.key] = { status: "", result: "" };
      });
      merged.assoc = { ...base.assoc, ...(p.assoc || {}) };
      merged.riskFactors = Array.isArray(p.riskFactors) ? p.riskFactors : [];
      merged.tasks = Array.isArray(p.tasks) ? p.tasks : [];
      merged.rounds = Array.isArray(p.rounds) ? p.rounds : [];
      merged.id = p.id || uid();
      return merged;
    });
    return out;
  }

  function save() {
    db.updatedAt = nowISO();
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      alert("Could not save — this device's storage is full or blocked.\n" + e.message);
    }
  }

  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
    return settings;
  }

  function getSettings() { return settings; }

  /** Drop signed-off patients older than the retention window (opt-in). */
  function autoPurge() {
    const days = Number(settings.autoPurgeDays) || 0;
    if (!days) return;
    const cutoff = Date.now() - days * 86400000;
    const before = db.patients.length;
    db.patients = db.patients.filter((p) => {
      if (p.status !== "discharged") return true;
      const t = new Date(p.dischargeDate || p.updatedAt || 0).getTime();
      return t > cutoff;
    });
    if (db.patients.length !== before) save();
  }

  /* ---------- Patient CRUD ---------- */

  const all = () => db.patients;
  const get = (id) => db.patients.find((p) => p.id === id) || null;

  function add(patch = {}) {
    const p = { ...blankPatient(), ...patch };
    db.patients.push(p);
    save();
    return p;
  }

  function update(id, patch) {
    const p = get(id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: nowISO() });
    save();
    return p;
  }

  function remove(id) {
    db.patients = db.patients.filter((p) => p.id !== id);
    save();
  }

  /* ---------- Rounds ---------- */

  /** Today's round note, created on first touch so the tab is never empty. */
  function todayRound(patient, create = true) {
    const d = todayISO();
    let r = patient.rounds.find((x) => x.date === d);
    if (!r && create) {
      r = blankRound(d);
      patient.rounds.push(r);
      save();
    }
    return r;
  }

  function updateRound(patient, roundId, patch) {
    const r = patient.rounds.find((x) => x.id === roundId);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: nowISO() });
    patient.updatedAt = nowISO();
    save();
    return r;
  }

  function deleteRound(patient, roundId) {
    patient.rounds = patient.rounds.filter((r) => r.id !== roundId);
    save();
  }

  /** Was this patient rounded on today? (any content in today's note) */
  function roundedToday(patient) {
    const r = patient.rounds.find((x) => x.date === todayISO());
    if (!r) return false;
    return Boolean(
      (r.vitals || r.labs || r.newInvestigation || r.exam || r.assessment || r.plan || "").trim()
    );
  }

  /* ---------- Tasks ---------- */

  function addTask(patient, text) {
    if (!text.trim()) return;
    patient.tasks.push({ id: uid(), text: text.trim(), done: false, createdAt: nowISO() });
    patient.updatedAt = nowISO();
    save();
  }

  function toggleTask(patient, taskId) {
    const t = patient.tasks.find((x) => x.id === taskId);
    if (t) { t.done = !t.done; patient.updatedAt = nowISO(); save(); }
  }

  function removeTask(patient, taskId) {
    patient.tasks = patient.tasks.filter((t) => t.id !== taskId);
    save();
  }

  const openTasks = (p) => p.tasks.filter((t) => !t.done).length;

  /* ---------- Export / import ---------- */

  function exportJSON() {
    return JSON.stringify({ ...db, exportedAt: nowISO(), app: "StrokeRounds" }, null, 2);
  }

  /** merge = keep existing patients and append; otherwise replace outright. */
  function importJSON(text, merge = true) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.patients)) throw new Error("Not a StrokeRounds backup file.");
    const incoming = migrate(parsed).patients;
    if (!merge) {
      db.patients = incoming;
    } else {
      const byId = new Map(db.patients.map((p) => [p.id, p]));
      incoming.forEach((p) => {
        const existing = byId.get(p.id);
        if (!existing) db.patients.push(p);
        else if (new Date(p.updatedAt) > new Date(existing.updatedAt)) Object.assign(existing, p);
      });
    }
    save();
    return incoming.length;
  }

  function wipe() {
    db = { schema: SCHEMA, patients: [], updatedAt: nowISO() };
    save();
  }

  /* ---------- Demo record (teaching / trying the app out) ---------- */

  function addDemo() {
    const p = add({
      name: "DEMO — J.R.",
      mrn: "000-DEMO",
      room: "7West-12",
      age: "68",
      sex: "F",
      admitDate: todayISO(new Date(Date.now() - 2 * 86400000)),
      lkw: "2026-09-02 21:40",
      type: "Ischemic stroke",
      location: "L basal ganglia",
      vascularity: "MCA superior div",
      hx: "Sudden R hemiparesis and aphasia at home, found by family.",
      trauma: "No head trauma; no fall witnessed.",
      nihssAdmit: "14",
      nihssCurrent: "6",
      mrsPre: "0",
      tpa: "TNK 0.25 mg/kg 23:05 (door-to-needle 38 min)",
      evt: "EVT L M1, TICI 2b at 00:22",
      riskFactors: ["HTN", "DM2", "HLD", "AFib"],
      etiology: "Cardioembolic",
      etiologyNote: "New AF on telemetry, CHA2DS2-VASc 6.",
      prevention: "ASA 81 bridge → apixaban 5 mg BID on day 5 (size-based delay). Atorvastatin 80.",
      dvt: "SCDs; heparin held 24h post-lytic, started this AM.",
      pt: "PT: ambulating with min assist",
      ot: "OT: ADL retraining",
      slp: "SLP: dysphagia 3 diet, thin liquids",
      meds: "Atorvastatin 80, metoprolol 25 BID, metformin held, apixaban to start d5.",
      notes: "Family meeting scheduled; discussing rehab placement.",
    });
    p.workup.cth  = { status: "done",    result: "ASPECTS 8, no HT on 24h scan" };
    p.workup.cta  = { status: "done",    result: "L M1 occlusion, recanalized post-EVT" };
    p.workup.ctp  = { status: "done",    result: "Core 12 mL / penumbra 78 mL" };
    p.workup.mri  = { status: "done",    result: "L lentiform + insular DWI, no SWAN blooming" };
    p.workup.tte  = { status: "done",    result: "EF 55%, no thrombus" };
    p.workup.ldl  = { status: "done",    result: "112 → statin escalated" };
    p.workup.a1c  = { status: "done",    result: "7.8%" };
    p.workup.ltcm = { status: "ordered", result: "AF captured — monitor not needed" };
    p.workup.tee  = { status: "na",      result: "source found" };
    p.assoc.card  = "New-onset AF, rate controlled";
    p.assoc.endo  = "DM2 uncontrolled, A1c 7.8";
    p.assoc.electroRenal = "Cr 1.1, K 3.4 repleted";
    const r = todayRound(p);
    Object.assign(r, {
      vitals: "BP 138/76, HR 74, T 36.8, SpO2 97% RA",
      labs: "Acceptable — Na 138, K 3.4→repleted, Cr 1.1, Plt 210",
      newInvestigation: "24h CT head: no hemorrhagic transformation",
      exam: "Alert, mild expressive aphasia, R arm 4/5, R leg 4+/5, R facial droop",
      nihss: "6",
      assessment: "Day 3 L MCA cardioembolic stroke s/p TNK + EVT, improving.",
      plan: "Start apixaban day 5. Continue statin. PT/OT/SLP. Rehab eval.",
    });
    addTask(p, "Confirm apixaban start date with pharmacy");
    addTask(p, "Rehab placement — call case management");
    addTask(p, "Repeat lipid panel in 6 weeks (discharge instruction)");
    save();
    return p;
  }

  return {
    // reference data
    STROKE_TYPES, VASC_TERRITORIES, LOCATIONS, RISK_FACTORS, ETIOLOGIES,
    WORKUP_ITEMS, WORKUP_STATUS, ASSOC_FIELDS,
    // lifecycle
    load, save, getSettings, saveSettings, hash,
    // patients
    all, get, add, update, remove, blankPatient,
    // rounds
    todayRound, updateRound, deleteRound, roundedToday, blankRound,
    // tasks
    addTask, toggleTask, removeTask, openTasks,
    // data
    exportJSON, importJSON, wipe, addDemo,
    // helpers
    uid, todayISO, nowISO, hospitalDay,
  };
})();
