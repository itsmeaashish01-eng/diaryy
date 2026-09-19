/* ================================================
   THE AI EMPLOYEE — store.js
   Schema, persistence, CRUD, demo data.
   Key: "aiEmployeeData"

   One record of the business. Every other module reads this shape and
   none of them keep their own copy, so a revision logged on the project
   screen is the same revision the briefing counts at 8am and the same
   one that turns into a line on an invoice.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;

  const KEY = "aiEmployeeData";
  const SCHEMA_VERSION = 1;

  /* Project lifecycle. QA sits between the work and the client on
     purpose: nothing reaches "delivered" without passing through it. */
  const PROJECT_STAGES = ["brief", "in_progress", "qa", "delivered", "closed"];

  function defaults() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        businessName: "My Studio",
        operator: "",
        currency: "USD",
        theme: "auto",
        /* How the employee decides something needs chasing. These are
           the limits it works to — the client file holds the rest. */
        followUpDays: 4,       // a lead with no contact this long is stalled
        touchesToClose: 3,     // a proposal needs a third touch to count as worked
        reminderDays: 3,       // invoice reminder this long after it falls due
        qaBlocksDelivery: true,
        updateEveryDays: 7,    // a client with no update this long is overdue one
      },
      clients: [],
      projects: [],
      tasks: [],
      revisions: [],
      promises: [],
      updates: [],
      events: [],
      invoices: [],
      team: [],
      leads: [],
      qaRuns: [],
      seeded: false,
    };
  }

  /* Fill in anything a stored file predates, without touching what it
     already holds. Cheaper than a migration for an additive schema. */
  function hydrate(raw) {
    const base = defaults();
    if (!raw || typeof raw !== "object") return base;
    const out = Object.assign(base, raw);
    out.settings = Object.assign(base.settings, raw.settings || {});
    for (const key of ["clients", "projects", "tasks", "revisions", "promises",
                       "updates", "events", "invoices", "team", "leads", "qaRuns"]) {
      out[key] = Array.isArray(raw[key]) ? raw[key] : [];
    }
    out.version = SCHEMA_VERSION;
    return out;
  }

  let db = defaults();
  const listeners = new Set();

  function load() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (err) {
      raw = null; // corrupt file: start clean rather than refuse to open
    }
    db = hydrate(raw);
    return db;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      /* Out of quota or a private window that refuses to store. The app
         keeps working on the in-memory copy; the UI says so. */
      return false;
    }
    return true;
  }

  function data() { return db; }

  function set(next) {
    db = hydrate(next);
    save();
    emit();
    return db;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit() {
    for (const fn of listeners) {
      try { fn(db); } catch (err) { console.error(err); }
    }
  }

  /* Every mutation goes through here: one place that saves, one place
     that tells the screen something moved. */
  function commit(mutator) {
    const result = mutator(db);
    save();
    emit();
    return result;
  }

  /* ---- generic collection helpers ------------------------------------ */

  function add(collection, record, prefix) {
    return commit((d) => {
      const item = Object.assign({ id: U.uid(prefix || collection.slice(0, 3)) }, record);
      d[collection].push(item);
      return item;
    });
  }

  function update(collection, id, patch) {
    return commit((d) => {
      const item = d[collection].find((x) => x.id === id);
      if (!item) return null;
      Object.assign(item, typeof patch === "function" ? patch(item) : patch);
      return item;
    });
  }

  function remove(collection, id) {
    return commit((d) => {
      const i = d[collection].findIndex((x) => x.id === id);
      if (i < 0) return false;
      d[collection].splice(i, 1);
      return true;
    });
  }

  function find(collection, id) {
    return (db[collection] || []).find((x) => x.id === id) || null;
  }

  function setSetting(key, value) {
    return commit((d) => { d.settings[key] = value; return d.settings; });
  }

  /* ---- lookups the views ask for constantly --------------------------- */

  function clientOf(record) {
    if (!record) return null;
    if (record.clientId) return find("clients", record.clientId);
    if (record.projectId) {
      const p = find("projects", record.projectId);
      return p ? find("clients", p.clientId) : null;
    }
    return null;
  }

  function projectsOf(clientId) {
    return db.projects.filter((p) => p.clientId === clientId);
  }

  function revisionsOf(projectId) {
    return U.sortBy(db.revisions.filter((r) => r.projectId === projectId), (r) => r.round);
  }

  function invoicesOf(clientId) {
    return db.invoices.filter((i) => i.clientId === clientId);
  }

  function openTasks() {
    return db.tasks.filter((t) => t.status !== "done");
  }

  function clientName(id) {
    const c = find("clients", id);
    return c ? c.name : "—";
  }

  function projectName(id) {
    const p = find("projects", id);
    return p ? p.name : "—";
  }

  /* ---- export / import ------------------------------------------------ */

  function exportJSON() {
    return JSON.stringify(db, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Not a data file");
    set(parsed);
    return db;
  }

  function reset() {
    set(defaults());
    return db;
  }

  /* ---- demo business --------------------------------------------------
     An empty app can't show what the nine jobs do, so a first open lands
     in a studio mid-week with the usual mess already in it: a revision
     over the included round, an invoice past due, a promise made on a
     call, and a proposal sitting on two touches.                        */

  function seed(now) {
    const today = U.isoDay(now || new Date());
    const d = (n) => U.addDays(today, n);
    const at = (n, hour) => {
      const x = U.dayDate(d(n));
      x.setHours(hour || 10, 0, 0, 0);
      return x.toISOString();
    };

    const fresh = defaults();
    fresh.seeded = true;
    fresh.settings.businessName = "Nine & Co.";

    const clients = [
      {
        id: "cl_north", name: "Northbeam", contact: "dana@northbeam.co",
        rate: 95, revisionsIncluded: 2, revisionRate: 180, paymentTermsDays: 14,
        status: "active",
        rules: [
          "No stock photography — illustration only",
          "Copy signed off by Dana before anything ships",
          "Files delivered as Figma + PDF, never flattened PNG",
        ],
        notes: "Decisions move fast, approvals slow. Chase Dana directly, not the shared inbox.",
      },
      {
        id: "cl_harbor", name: "Harbor Labs", contact: "ops@harborlabs.io",
        rate: 120, revisionsIncluded: 1, revisionRate: 240, paymentTermsDays: 30,
        status: "active",
        rules: [
          "Everything through the shared ops inbox, never DMs",
          "Accessibility pass required before delivery (AA contrast)",
          "Invoice on the 1st, purchase order number on every line",
        ],
        notes: "Pays on time when the PO is right and not at all when it isn't.",
      },
      {
        id: "cl_ferns", name: "Fernside Bakery", contact: "mo@fernside.shop",
        rate: 70, revisionsIncluded: 3, revisionRate: 90, paymentTermsDays: 7,
        status: "active",
        rules: ["Keep the hand-lettered logo untouched", "No work on weekends — shop hours only"],
        notes: "Small budget, long relationship. Worth keeping.",
      },
    ];

    const projects = [
      { id: "pr_north1", clientId: "cl_north", name: "Spring campaign site", fee: 6800,
        stage: "qa", dueDate: d(2), startedAt: d(-24),
        notes: "Five pages plus the newsletter template." },
      { id: "pr_harbor1", clientId: "cl_harbor", name: "Docs redesign — phase 2", fee: 11400,
        stage: "in_progress", dueDate: d(9), startedAt: d(-12),
        notes: "Component library first, then the migration guide." },
      { id: "pr_ferns1", clientId: "cl_ferns", name: "Menu & window vinyl", fee: 1450,
        stage: "delivered", dueDate: d(-3), startedAt: d(-20), deliveredAt: d(-3),
        notes: "Printer needs the final files by Friday." },
    ];

    const revisions = [
      { id: "rv_1", projectId: "pr_north1", round: 1, requestedAt: d(-9), scope: "included",
        summary: "Hero headline and the three feature cards", minutes: 150, billed: false },
      { id: "rv_2", projectId: "pr_north1", round: 2, requestedAt: d(-4), scope: "included",
        summary: "Swapped the illustration set, reflowed the footer", minutes: 210, billed: false },
      /* The third round is the one that quietly eats the margin. */
      { id: "rv_3", projectId: "pr_north1", round: 3, requestedAt: d(-1), scope: "extra",
        summary: "New pricing table after the board meeting", minutes: 240, billed: false },
      { id: "rv_4", projectId: "pr_ferns1", round: 1, requestedAt: d(-8), scope: "included",
        summary: "Bigger type on the window vinyl", minutes: 45, billed: false },
    ];

    const tasks = [
      { id: "tk_1", projectId: "pr_north1", clientId: "cl_north", title: "Rebuild pricing table from the board deck",
        due: d(0), status: "open", needsDecision: false, owner: "tm_you", priority: "high", createdAt: d(-1) },
      { id: "tk_2", projectId: "pr_north1", clientId: "cl_north", title: "Decide: bill round 3 or absorb it",
        due: d(0), status: "open", needsDecision: true, owner: "tm_you", priority: "high", createdAt: d(-1) },
      { id: "tk_3", projectId: "pr_harbor1", clientId: "cl_harbor", title: "Contrast audit on the component library",
        due: d(3), status: "open", needsDecision: false, owner: "tm_sam", priority: "normal", createdAt: d(-5) },
      { id: "tk_4", projectId: "pr_harbor1", clientId: "cl_harbor", title: "Chase the PO number for phase 2",
        due: d(-2), status: "open", needsDecision: false, owner: "tm_you", priority: "high", createdAt: d(-6) },
      { id: "tk_5", projectId: "pr_ferns1", clientId: "cl_ferns", title: "Send print-ready files to the printer",
        due: d(1), status: "open", needsDecision: false, owner: "tm_you", priority: "normal", createdAt: d(-2) },
      { id: "tk_6", projectId: "pr_harbor1", clientId: "cl_harbor", title: "Migration guide outline",
        due: d(6), status: "open", needsDecision: false, owner: "tm_sam", priority: "normal", createdAt: d(-3) },
      { id: "tk_7", projectId: "pr_north1", clientId: "cl_north", title: "Newsletter template build",
        due: d(-6), status: "done", needsDecision: false, owner: "tm_you", priority: "normal",
        createdAt: d(-14), doneAt: d(-6) },
    ];

    /* Said out loud on a call, which is exactly how it gets forgotten. */
    const promises = [
      { id: "pm_1", clientId: "cl_north", projectId: "pr_north1", source: "call",
        text: "Dana gets a look at the pricing table before it goes anywhere near staging",
        madeAt: d(-1), due: d(0), kept: false },
      { id: "pm_2", clientId: "cl_harbor", projectId: "pr_harbor1", source: "chat",
        text: "Weekly progress note every Monday for phase 2", madeAt: d(-12), due: d(-1), kept: false },
      { id: "pm_3", clientId: "cl_ferns", projectId: "pr_ferns1", source: "call",
        text: "Two spare vinyl sheets in the delivery", madeAt: d(-10), due: d(-3), kept: true },
    ];

    const updates = [
      { id: "up_1", clientId: "cl_north", projectId: "pr_north1", sentAt: d(-7),
        body: "Round 2 is in and the footer reflow is done. QA on Thursday, delivery Monday." },
      { id: "up_2", clientId: "cl_ferns", projectId: "pr_ferns1", sentAt: d(-3),
        body: "Menu and vinyl delivered. Print files with you; invoice attached." },
    ];

    const events = [
      { id: "ev_1", title: "Northbeam — pricing walkthrough", when: at(0, 15), clientId: "cl_north",
        kind: "meeting", done: false },
      { id: "ev_2", title: "Spring campaign site — delivery", when: at(2, 9), clientId: "cl_north",
        kind: "deadline", done: false },
      { id: "ev_3", title: "Harbor Labs — phase 2 checkpoint", when: at(4, 11), clientId: "cl_harbor",
        kind: "meeting", done: false },
      { id: "ev_4", title: "Follow up: Fernside print files", when: at(1, 10), clientId: "cl_ferns",
        kind: "followup", done: false },
    ];

    const invoices = [
      { id: "in_1", clientId: "cl_ferns", projectId: "pr_ferns1", number: "2026-041",
        issuedAt: d(-12), dueAt: d(-5), status: "sent", reminders: [],
        lines: [{ desc: "Menu & window vinyl — full fee", amount: 1450 }] },
      { id: "in_2", clientId: "cl_harbor", projectId: "pr_harbor1", number: "2026-044",
        issuedAt: d(-6), dueAt: d(24), status: "sent", reminders: [],
        lines: [{ desc: "Docs redesign phase 2 — 50% on start", amount: 5700 }] },
      { id: "in_3", clientId: "cl_north", projectId: "pr_north1", number: "2026-038",
        issuedAt: d(-30), dueAt: d(-16), status: "paid", paidAt: d(-15), reminders: [d(-14)],
        lines: [{ desc: "Spring campaign site — deposit", amount: 3400 }] },
    ];

    const team = [
      { id: "tm_you", name: "You", role: "Owner", capacityHours: 30 },
      { id: "tm_sam", name: "Sam (contract)", role: "Design", capacityHours: 16 },
    ];

    const leads = [
      { id: "ld_1", name: "Greyline Coffee", source: "Referral from Fernside", value: 4200,
        stage: "proposal", nextTouchAt: d(-2),
        touches: [
          { at: d(-14), kind: "call", note: "Intro call — they want the whole brand refresh" },
          { at: d(-9), kind: "email", note: "Proposal sent, three tiers" },
        ] },
      { id: "ld_2", name: "Marrow & Sons", source: "Website enquiry", value: 9000,
        stage: "negotiation", nextTouchAt: d(1),
        touches: [
          { at: d(-20), kind: "email", note: "Scoping questions" },
          { at: d(-13), kind: "call", note: "Walked through the phases" },
          { at: d(-4), kind: "email", note: "Revised numbers, waiting on their board" },
        ] },
      { id: "ld_3", name: "Tidewater Co-op", source: "Conference", value: 2500,
        stage: "new", nextTouchAt: d(2),
        touches: [{ at: d(-3), kind: "email", note: "Said hello, sent the one-pager" }] },
    ];

    Object.assign(fresh, { clients, projects, revisions, tasks, promises, updates, events, invoices, team, leads });
    set(fresh);
    return db;
  }

  AE.store = {
    KEY, SCHEMA_VERSION, PROJECT_STAGES,
    defaults, hydrate, load, save, data, set, commit, subscribe,
    add, update, remove, find, setSetting,
    clientOf, projectsOf, revisionsOf, invoicesOf, openTasks, clientName, projectName,
    exportJSON, importJSON, reset, seed,
  };
})(window.AE = window.AE || {});
