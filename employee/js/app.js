/* ================================================
   THE AI EMPLOYEE — app.js
   Wiring: routing, the action table, the forms in the slide-over
   sheet, and the few places where a click changes the record.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;
  const S = AE.store;
  const e = U.esc;

  const $ = (sel) => document.querySelector(sel);
  const view = $("#view");
  const sheet = $("#sheet");
  const sheetBody = $("#sheetBody");
  const sheetTitle = $("#sheetTitle");
  const backdrop = $("#sheetBackdrop");

  let state = { view: "brief", query: "", focus: null };

  function now() { return new Date(); }
  function db() { return S.data(); }
  function m(v) { return U.money(v, db().settings.currency); }
  function today() { return U.isoDay(now()); }

  /* ---- chrome --------------------------------------------------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  function openSheet(title, html) {
    sheetTitle.textContent = title;
    sheetBody.innerHTML = html;
    sheet.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    const first = sheetBody.querySelector("input, textarea, select");
    if (first) first.focus();
  }
  function closeSheet() {
    sheet.classList.add("hidden");
    backdrop.classList.add("hidden");
    sheetBody.innerHTML = "";
  }

  function go(viewName, ref) {
    state.view = viewName;
    state.focus = ref || null;
    state.query = "";
    const input = $("#searchInput");
    if (input) input.value = "";
    if (location.hash.slice(1) !== viewName) location.hash = viewName;
    else render();
    $("#sidebar").classList.remove("is-open");
  }

  /* ---- render --------------------------------------------------------- */
  function render() {
    const data = db();
    view.innerHTML = AE.ui.render(state.query ? "search" : state.view, data, state.query);
    view.scrollTop = 0;

    for (const b of document.querySelectorAll(".side-item")) {
      b.classList.toggle("is-on", !state.query && b.dataset.view === state.view);
    }
    $("#bizName").textContent = data.settings.businessName || "";

    /* The counts on the nav are the same numbers the morning read is
       built from — one source, so they can't disagree. */
    const brief = AE.brief.build(data, now());
    const counts = {
      countBrief: brief.counts.red || brief.counts.total,
      countWork: data.tasks.filter((t) => t.status !== "done" && U.isPast(t.due, now())).length,
      countRev: AE.margin.unbilledAcross(data).length,
      countUpd: AE.brief.updateDue(data, now()).length,
      countInv: AE.money.needsChasing(data, now()).length,
      countLead: AE.growth.needsTouch(data, now()).length,
    };
    for (const [id, n] of Object.entries(counts)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = n ? String(n) : "";
      el.classList.toggle("is-calm", id === "countBrief" && !brief.counts.red);
    }

    if (state.focus) {
      /* Land on the thing that was clicked in the briefing, not just the
         screen it lives on. */
      const target = view.querySelector(`[data-id="${CSS.escape(state.focus)}"]`);
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        target.closest(".card, .row, .job-card")?.animate(
          [{ background: "var(--bg2)" }, { background: "transparent" }], { duration: 1400 });
      }
      state.focus = null;
    }
  }

  /* ---- form helpers ---------------------------------------------------- */
  function field(label, name, value, opts) {
    const o = opts || {};
    const input = o.textarea
      ? `<textarea id="f_${name}" name="${name}" placeholder="${e(o.placeholder || "")}">${e(value || "")}</textarea>`
      : o.select
        ? `<select id="f_${name}" name="${name}">${o.select.map(([v, l]) =>
            `<option value="${e(v)}" ${String(value) === String(v) ? "selected" : ""}>${e(l)}</option>`).join("")}</select>`
        : `<input id="f_${name}" name="${name}" type="${o.type || "text"}" value="${e(value == null ? "" : value)}"
             placeholder="${e(o.placeholder || "")}" ${o.min != null ? `min="${o.min}"` : ""} ${o.required ? "required" : ""} />`;
    return `<div class="field"><label for="f_${name}">${e(label)}</label>${input}
      ${o.hint ? `<p class="field-hint">${e(o.hint)}</p>` : ""}</div>`;
  }
  function row2(a, b) { return `<div class="field-row">${a}${b}</div>`; }
  function form(name, inner, submitLabel, arg) {
    return `<form data-form="${name}"${arg ? ` data-arg="${e(arg)}"` : ""}>${inner}
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-act="closeSheet">Cancel</button>
        <button type="submit" class="btn btn-primary">${e(submitLabel || "Save")}</button>
      </div></form>`;
  }
  function clientOptions(selected) {
    return db().clients.map((c) => [c.id, c.name]).concat(selected ? [] : []);
  }
  function projectOptions() {
    return db().projects.filter((p) => p.stage !== "closed")
      .map((p) => [p.id, `${p.name} — ${S.clientName(p.clientId)}`]);
  }

  /* ---- forms ------------------------------------------------------------ */
  const forms = {
    client(id) {
      const c = id ? S.find("clients", id) : {};
      openSheet(id ? `Edit ${c.name}` : "New client", form("client",
        field("Name", "name", c.name, { required: true }) +
        field("Contact", "contact", c.contact, { placeholder: "name@company.com" }) +
        row2(field("Hourly rate", "rate", c.rate || 0, { type: "number", min: 0 }),
             field("Payment terms (days)", "paymentTermsDays", c.paymentTermsDays || 14, { type: "number", min: 0 })) +
        row2(field("Revision rounds included", "revisionsIncluded", c.revisionsIncluded || 0, { type: "number", min: 0 }),
             field("Price per extra round", "revisionRate", c.revisionRate || 0, { type: "number", min: 0, hint: "0 = charge at the hourly rate" })) +
        field("Rules — one per line", "rules", (c.rules || []).join("\n"), {
          textarea: true, placeholder: "Copy signed off before anything ships\nFiles as Figma + PDF" ,
        }) +
        field("Notes", "notes", c.notes, { textarea: true, placeholder: "How they work, who decides, what goes wrong." }),
        id ? "Save client" : "Add client", id));
    },

    project(id, clientId) {
      const p = id ? S.find("projects", id) : { clientId, stage: "brief", dueDate: U.addDays(today(), 14) };
      if (!db().clients.length) return openSheet("New project",
        `<div class="empty"><strong>Add a client first</strong><p>A project hangs off a client file.</p>
         <div style="margin-top:.8rem">${AE.ui.btn("New client", "newClient", "", "btn-primary")}</div></div>`);
      openSheet(id ? `Edit ${p.name}` : "New project", form("project",
        field("Project", "name", p.name, { required: true }) +
        field("Client", "clientId", p.clientId, { select: clientOptions() }) +
        row2(field("Fee", "fee", p.fee || 0, { type: "number", min: 0 }),
             field("Due", "dueDate", p.dueDate, { type: "date" })) +
        field("Stage", "stage", p.stage, { select: S.PROJECT_STAGES.map((s) => [s, AE.ui.STAGE_LABEL[s]]) }) +
        field("Notes", "notes", p.notes, { textarea: true }),
        id ? "Save project" : "Add project", id));
    },

    task(id, ownerId) {
      const t = id ? S.find("tasks", id) : { due: today(), owner: ownerId || (db().team[0] || {}).id, priority: "normal" };
      openSheet(id ? "Edit task" : "New task", form("task",
        field("Task", "title", t.title, { required: true }) +
        field("Project", "projectId", t.projectId, { select: [["", "— none —"]].concat(projectOptions()) }) +
        row2(field("Due", "due", t.due, { type: "date" }),
             field("Owner", "owner", t.owner, { select: [["", "— unassigned —"]].concat(db().team.map((x) => [x.id, x.name])) })) +
        field("Kind", "needsDecision", t.needsDecision ? "yes" : "no", {
          select: [["no", "Work — just needs doing"], ["yes", "Needs a decision from you"]],
          hint: "Decisions go to the top of the morning read.",
        }) +
        (id ? `<div class="form-actions" style="justify-content:flex-start">
          <button type="button" class="btn btn-sm btn-danger" data-act="deleteTask" data-id="${id}">Delete task</button></div>` : ""),
        id ? "Save task" : "Add task", id));
    },

    revision(projectId) {
      const projects = projectOptions();
      if (!projects.length) return openSheet("Log a revision",
        `<div class="empty"><strong>No live projects</strong><p>A revision belongs to a project.</p></div>`);
      const pid = projectId || projects[0][0];
      const st = AE.margin.state(db(), pid);
      openSheet("Log a revision", form("revision",
        `<p class="card-note" style="margin-bottom:.8rem">This will be round ${AE.margin.nextRound(db(), pid)} of ${st.included} included${st.included && AE.margin.nextRound(db(), pid) > st.included ? " — billable" : ""}.</p>` +
        field("Project", "projectId", pid, { select: projects }) +
        field("What changed", "summary", "", { textarea: true, required: true, placeholder: "New pricing table after the board meeting" }) +
        row2(field("Requested", "requestedAt", today(), { type: "date" }),
             field("Time spent (minutes)", "minutes", 60, { type: "number", min: 0 })) +
        field("Scope", "scope", "auto", {
          select: [["auto", "Count it against the included rounds"], ["goodwill", "Absorb it — goodwill, on purpose"]],
          hint: "Absorbed rounds are still logged, so the giveaway is visible.",
        }),
        "Log it"));
    },

    qa(projectId) {
      const project = S.find("projects", projectId);
      if (!project) return;
      const status = AE.qa.status(db(), projectId);
      const prev = new Map(((status.run || {}).checks || []).map((c) => [c.key, c.pass]));
      openSheet(`QA — ${project.name}`, form("qa",
        `<p class="card-note" style="margin-bottom:.8rem">Built from ${e(S.clientName(project.clientId))}'s rules, the promises still open, and the standard pass. Check before it ships — no edits, just gaps.</p>` +
        status.checks.map((c) => `<label class="check-row">
          <input type="checkbox" name="${e(c.key)}" ${!status.stale && prev.get(c.key) ? "checked" : ""} />
          <span><span class="check-label">${e(c.label)}</span><br /><span class="check-src">${e(c.source)}</span></span>
        </label>`).join(""),
        "Record the pass", projectId));
    },

    update(clientId) {
      const draft = AE.brief.clientUpdateDraft(db(), clientId, now());
      openSheet(`Update — ${S.clientName(clientId)}`, form("update",
        `<p class="card-note" style="margin-bottom:.6rem">Assembled from what actually happened: work finished, what is next, and what is sitting with them.</p>` +
        `<div class="field"><label for="f_body">The update</label>
          <textarea id="f_body" name="body" style="min-height:300px">${e(draft)}</textarea></div>` +
        `<div class="row-actions"><button type="button" class="btn btn-sm" data-act="copy" data-id="f_body">Copy to clipboard</button></div>`,
        "Log as sent", clientId));
    },

    event(id) {
      const ev = id ? S.find("events", id) : { when: today() + "T10:00", kind: "meeting" };
      const when = String(ev.when || "").length > 10
        ? new Date(ev.when).toISOString().slice(0, 16) : today() + "T10:00";
      openSheet(id ? "Edit" : "Add to the schedule", form("event",
        field("What", "title", ev.title, { required: true }) +
        row2(field("When", "when", when, { type: "datetime-local" }),
             field("Kind", "kind", ev.kind, { select: [["meeting", "Meeting"], ["deadline", "Deadline"], ["followup", "Follow-up"]] })) +
        field("Client", "clientId", ev.clientId, { select: [["", "— none —"]].concat(clientOptions()) }),
        id ? "Save" : "Add", id));
    },

    invoice(projectId) {
      const projects = projectOptions();
      if (!projects.length) return openSheet("New invoice",
        `<div class="empty"><strong>No projects to invoice</strong></div>`);
      const pid = projectId || projects[0][0];
      const draft = AE.money.draftFor(db(), pid, now());
      if (!draft.lines.length) {
        return openSheet("New invoice", `<div class="empty"><strong>Nothing outstanding</strong>
          <p>${e(S.projectName(pid))} is fully invoiced and has no unbilled revision rounds.</p></div>`);
      }
      openSheet("New invoice", form("invoice",
        field("Project", "projectId", pid, { select: projects, hint: "Switching project rebuilds the lines." }) +
        `<div class="card" style="box-shadow:none;margin:.2rem 0 .9rem">
          <p class="card-note"><strong>${e(draft.number)}</strong> · ${e(S.clientName(draft.clientId))}</p>
          ${draft.lines.map((l) => `<div class="row"><div class="row-main"><p class="row-title">${e(l.desc)}</p></div>
            <span class="row-amount">${m(l.amount)}</span></div>`).join("")}
          <div class="row"><div class="row-main"><p class="row-title"><strong>Total</strong></p></div>
            <span class="row-amount"><strong>${m(AE.money.total(draft))}</strong></span></div>
        </div>` +
        row2(field("Issued", "issuedAt", draft.issuedAt, { type: "date" }),
             field("Due", "dueAt", draft.dueAt, { type: "date", hint: "From the client's payment terms." })) +
        field("Send it now", "send", "yes", { select: [["yes", "Mark as sent"], ["no", "Keep as a draft"]] }),
        "Create invoice", pid));
    },

    invoiceDetail(id) {
      const inv = S.find("invoices", id);
      if (!inv) return;
      const st = AE.money.stateOf(inv, db().settings, now());
      openSheet(`Invoice ${inv.number}`, `
        <p class="card-note">${e(S.clientName(inv.clientId))} · ${e(S.projectName(inv.projectId))}</p>
        <div class="card" style="box-shadow:none;margin:.7rem 0">
          ${(inv.lines || []).map((l) => `<div class="row"><div class="row-main"><p class="row-title">${e(l.desc)}</p></div>
            <span class="row-amount">${m(l.amount)}</span></div>`).join("")}
          <div class="row"><div class="row-main"><p class="row-title"><strong>${e(st.label)}</strong></p>
            <p class="row-meta">issued ${U.fmtDay(inv.issuedAt)} · due ${U.fmtDay(inv.dueAt)}</p></div>
            <span class="row-amount"><strong>${m(st.amount)}</strong></span></div>
        </div>
        ${(inv.reminders || []).length ? `<p class="card-note">Chased ${inv.reminders.map((r) => U.fmtDay(r)).join(", ")}</p>` : ""}
        <div class="row-actions" style="margin-top:.8rem;flex-wrap:wrap">
          ${inv.status === "draft" ? AE.ui.btn("Mark as sent", "sendInvoice", inv.id, "btn-sm btn-primary") : ""}
          ${inv.status === "sent" ? AE.ui.btn("Write a chase", "chase", inv.id, "btn-sm") : ""}
          ${inv.status !== "paid" ? AE.ui.btn("Mark paid", "markPaid", inv.id, "btn-sm") : ""}
          ${AE.ui.btn("Delete", "deleteInvoice", inv.id, "btn-sm btn-danger")}
        </div>`);
    },

    chase(id) {
      const draft = AE.money.reminderDraft(db(), id, now());
      openSheet("Chase it", form("chase",
        `<div class="field"><label for="f_body">The reminder</label>
          <textarea id="f_body" name="body" style="min-height:260px">${e(draft)}</textarea></div>
         <div class="row-actions"><button type="button" class="btn btn-sm" data-act="copy" data-id="f_body">Copy to clipboard</button></div>`,
        "Log as chased", id));
    },

    member(id) {
      const p = id ? S.find("team", id) : { capacityHours: 20 };
      openSheet(id ? `Edit ${p.name}` : "Add someone", form("member",
        field("Name", "name", p.name, { required: true }) +
        row2(field("Role", "role", p.role, { placeholder: "Design, copy, dev…" }),
             field("Hours a week", "capacityHours", p.capacityHours || 0, { type: "number", min: 0 })),
        id ? "Save" : "Add", id));
    },

    lead(id) {
      const l = id ? S.find("leads", id) : { stage: "new", value: 0, nextTouchAt: U.addDays(today(), 3) };
      openSheet(id ? `Edit ${l.name}` : "New lead", form("lead",
        field("Who", "name", l.name, { required: true }) +
        field("Where from", "source", l.source, { placeholder: "Referral, enquiry, conference…" }) +
        row2(field("Worth", "value", l.value || 0, { type: "number", min: 0 }),
             field("Stage", "stage", l.stage, { select: AE.growth.STAGES.map((s) => [s.key, s.label]) })) +
        field("Next touch", "nextTouchAt", l.nextTouchAt, { type: "date" }),
        id ? "Save" : "Add lead", id));
    },

    touch(id) {
      const lead = S.find("leads", id);
      if (!lead) return;
      const h = AE.growth.healthOf(lead, db().settings, now());
      const draft = AE.growth.nextTouchDraft(db(), id, now());
      openSheet(`Touch ${h.count + 1} — ${lead.name}`, form("touch",
        `<p class="card-note" style="margin-bottom:.6rem">${e(h.reason || "Keeping it warm")}.</p>` +
        row2(field("How", "kind", "email", { select: [["email", "Email"], ["call", "Call"], ["message", "Message"], ["meeting", "Meeting"]] }),
             field("Next touch after this", "nextTouchAt", U.addDays(today(), db().settings.followUpDays), { type: "date" })) +
        `<div class="field"><label for="f_note">What you sent</label>
          <textarea id="f_note" name="note" style="min-height:200px">${e(draft)}</textarea></div>
         <div class="row-actions"><button type="button" class="btn btn-sm" data-act="copy" data-id="f_note">Copy to clipboard</button></div>`,
        "Log the touch", id));
    },

    deliver(id) {
      const project = S.find("projects", id);
      const gate = AE.qa.canShip(db(), id);
      if (gate.ok) return submitDeliver(id, false);
      openSheet(`Hold — ${project.name}`, `
        <p class="card-note">This is what the QA pass says is still open. It ships when these are clear.</p>
        <ul class="rule-list" style="margin:.7rem 0">${gate.reasons.map((r) => `<li>${e(r)}</li>`).join("")}</ul>
        <div class="row-actions" style="margin-top:.8rem">
          ${AE.ui.btn("Run the QA pass", "runQa", id, "btn-sm btn-primary")}
          ${AE.ui.btn("Deliver anyway", "deliverAnyway", id, "btn-sm btn-danger")}
        </div>`);
    },
  };

  /* Two copies disagree. The app does not guess which is right — it
     says so and offers the two honest answers, with an export in
     between for anyone who wants both. */
  function conflict() {
    const cfg = AE.sync.config();
    openSheet("Two copies disagree", `
      <p class="card-note">This browser last saw version ${e(String(cfg.lastVersion))}, and the server has moved on
        since — something else pushed to it, probably another device.</p>
      <p class="card-note" style="margin-top:.6rem">Nothing has been overwritten. Pick which copy is the real one, or
        export this browser's copy first and keep both.</p>
      <div class="row-actions" style="margin-top:1rem;flex-wrap:wrap">
        ${AE.ui.btn("Take the server's copy", "conflictTakeServer", "", "btn-sm btn-primary")}
        ${AE.ui.btn("Keep mine, overwrite the server", "conflictKeepMine", "", "btn-sm btn-danger")}
        ${AE.ui.btn("Export this browser's copy first", "export", "", "btn-sm btn-quiet")}
      </div>`);
  }

  function submitDeliver(id, forced) {
    S.update("projects", id, { stage: "delivered", deliveredAt: today() });
    closeSheet();
    toast(forced ? "Delivered — recorded as shipped without a clean QA pass" : "Delivered");
  }

  /* ---- actions ---------------------------------------------------------- */
  const actions = {
    goto: (id, el) => go(id, el && el.dataset.ref),
    nav: () => $("#sidebar").classList.toggle("is-open"),
    closeSheet,
    noop: () => {},
    theme: () => {
      const dark = document.body.classList.toggle("dark");
      $("#darkIcon").textContent = dark ? "☀" : "☾";
      S.setSetting("theme", dark ? "dark" : "light");
    },
    newClient: () => forms.client(null),
    editClient: (id) => forms.client(id),
    newProject: (id) => forms.project(null, id),
    editProject: (id) => forms.project(id),
    newTask: (id) => forms.task(null, id),
    editTask: (id) => forms.task(id),
    deleteTask: (id) => { S.remove("tasks", id); closeSheet(); toast("Task deleted"); },
    toggleTask: (id) => {
      const t = S.find("tasks", id);
      S.update("tasks", id, t.status === "done"
        ? { status: "open", doneAt: null }
        : { status: "done", doneAt: today() });
    },
    logRevision: (id) => forms.revision(id),
    deleteRevision: (id) => { S.remove("revisions", id); toast("Revision removed from the log"); },
    goodwill: (id) => { S.update("revisions", id, { scope: "goodwill" }); toast("Logged as goodwill — still counted, just not billed"); },
    runQa: (id) => forms.qa(id),
    deliver: (id) => forms.deliver(id),
    deliverAnyway: (id) => submitDeliver(id, true),
    composeUpdate: (id) => forms.update(id),
    newEvent: () => forms.event(null),
    doneEvent: (id) => { S.update("events", id, { done: true }); toast("Done"); },
    deleteEvent: (id) => { S.remove("events", id); },
    draftInvoice: (id) => forms.invoice(id),
    viewInvoice: (id) => forms.invoiceDetail(id),
    deleteInvoice: (id) => { S.remove("invoices", id); closeSheet(); toast("Invoice deleted"); },
    sendInvoice: (id) => {
      S.update("invoices", id, { status: "sent", issuedAt: today() });
      closeSheet();
      toast("Marked as sent — the due date starts from today");
    },
    markPaid: (id) => {
      S.update("invoices", id, { status: "paid", paidAt: today() });
      closeSheet();
      toast("Paid. Nice.");
    },
    chase: (id) => forms.chase(id),
    newMember: () => forms.member(null),
    editMember: (id) => forms.member(id),
    newLead: () => forms.lead(null),
    editLead: (id) => forms.lead(id),
    touchLead: (id) => forms.touch(id),
    copy: (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.select();
      navigator.clipboard ? navigator.clipboard.writeText(el.value).then(() => toast("Copied")) : toast("Select and copy");
    },
    install: async () => {
      const outcome = await AE.install.prompt();
      toast(outcome === "accepted" ? "Installed" :
            outcome === "unavailable" ? "Your browser installs this from its own menu" : "Maybe later");
      render();
    },
    syncTest: async () => {
      try {
        const info = await AE.sync.health();
        toast(`Server is up, holding version ${info.version}`);
      } catch (err) { toast(err.message); }
      render();
    },
    syncPush: async () => {
      try {
        const envelope = await AE.sync.push(false);
        toast(`Pushed — the server is now on version ${envelope.version}`);
      } catch (err) {
        if (err.code === "CONFLICT") return conflict();
        toast(err.message);
      }
      render();
    },
    syncPull: async () => {
      try {
        const envelope = await AE.sync.pull();
        if (!confirm(`Replace what's in this browser with the server's version ${envelope.version}?`)) return;
        AE.sync.applyPulled(envelope);
        toast(`Pulled version ${envelope.version}`);
        go("brief");
      } catch (err) { toast(err.message); render(); }
    },
    syncForget: () => {
      if (!confirm("Disconnect from the server? The business stays in this browser.")) return;
      AE.sync.forget();
      toast("Disconnected");
      render();
    },
    conflictTakeServer: async () => {
      try {
        const envelope = await AE.sync.pull();
        AE.sync.applyPulled(envelope);
        closeSheet();
        toast(`Took the server's version ${envelope.version}`);
        go("brief");
      } catch (err) { toast(err.message); }
    },
    conflictKeepMine: async () => {
      try {
        const envelope = await AE.sync.push(true);
        closeSheet();
        toast(`Overwrote the server — now on version ${envelope.version}`);
      } catch (err) { toast(err.message); }
      render();
    },
    export: () => {
      const blob = new Blob([S.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ai-employee-${today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Exported");
    },
    seed: () => {
      if (!confirm("Load the demo business? This replaces what's here now.")) return;
      S.seed(now());
      go("brief");
      toast("Demo business loaded");
    },
    reset: () => {
      if (!confirm("Erase everything in this browser? There is no undo.")) return;
      S.reset();
      go("brief");
      toast("Erased");
    },
  };

  /* ---- form submission --------------------------------------------------- */
  const submits = {
    client(f, id) {
      const patch = {
        name: f.name.trim(), contact: f.contact.trim(),
        rate: Number(f.rate) || 0, paymentTermsDays: Number(f.paymentTermsDays) || 0,
        revisionsIncluded: Number(f.revisionsIncluded) || 0, revisionRate: Number(f.revisionRate) || 0,
        rules: f.rules.split("\n").map((s) => s.trim()).filter(Boolean),
        notes: f.notes.trim(), status: "active",
      };
      if (id) S.update("clients", id, patch); else S.add("clients", patch, "cl");
      toast(id ? "Client file updated" : "Client added");
    },
    project(f, id) {
      const patch = {
        name: f.name.trim(), clientId: f.clientId, fee: Number(f.fee) || 0,
        dueDate: f.dueDate, stage: f.stage, notes: f.notes.trim(),
      };
      if (id) S.update("projects", id, patch);
      else S.add("projects", Object.assign({ startedAt: today() }, patch), "pr");
      toast(id ? "Project updated" : "Project added");
    },
    task(f, id) {
      const patch = {
        title: f.title.trim(), projectId: f.projectId || null, due: f.due || null,
        owner: f.owner || null, needsDecision: f.needsDecision === "yes",
        clientId: f.projectId ? (S.find("projects", f.projectId) || {}).clientId : null,
      };
      if (id) S.update("tasks", id, patch);
      else S.add("tasks", Object.assign({ status: "open", createdAt: today(), priority: "normal" }, patch), "tk");
      toast(id ? "Task updated" : "Task added");
    },
    revision(f) {
      S.add("revisions", {
        projectId: f.projectId,
        round: AE.margin.nextRound(db(), f.projectId),
        requestedAt: f.requestedAt || today(),
        summary: f.summary.trim(),
        minutes: Number(f.minutes) || 0,
        scope: f.scope === "goodwill" ? "goodwill" : "auto",
        billed: false,
      }, "rv");
      const st = AE.margin.state(db(), f.projectId);
      toast(st.overRounds > 0 && f.scope !== "goodwill"
        ? `Round ${st.used} — past the ${st.included} included, ${m(st.unbilledValue)} now billable`
        : `Round ${st.used} logged`);
    },
    qa(f, projectId) {
      const results = {};
      for (const c of AE.qa.checklistFor(db(), projectId)) results[c.key] = !!f[c.key];
      const run = AE.qa.record(db(), projectId, results, now());
      S.commit((d) => d.qaRuns.push(run));
      const status = AE.qa.status(db(), projectId);
      toast(status.passed ? "QA passed — clear to ship" : `${U.plural(status.failed.length, "check")} still open`);
    },
    update(f, clientId) {
      S.add("updates", { clientId, sentAt: today(), body: f.body.trim() }, "up");
      toast("Update logged — the clock starts again");
    },
    event(f, id) {
      const patch = { title: f.title.trim(), when: new Date(f.when).toISOString(), kind: f.kind, clientId: f.clientId || null };
      if (id) S.update("events", id, patch); else S.add("events", Object.assign({ done: false }, patch), "ev");
      toast("Scheduled");
    },
    invoice(f, pid) {
      const projectId = f.projectId || pid;
      const draft = AE.money.draftFor(db(), projectId, now());
      draft.issuedAt = f.issuedAt || draft.issuedAt;
      draft.dueAt = f.dueAt || draft.dueAt;
      draft.status = f.send === "yes" ? "sent" : "draft";
      const inv = S.add("invoices", draft, "in");
      /* Once an extra round is on an invoice it stops being a surprise
         and stops showing up as unbilled. */
      S.commit((d) => {
        for (const line of inv.lines) {
          if (!line.revisionId) continue;
          const rev = d.revisions.find((r) => r.id === line.revisionId);
          if (rev) rev.billed = true;
        }
      });
      toast(`${inv.number} — ${m(AE.money.total(inv))} ${inv.status === "sent" ? "sent" : "saved as a draft"}`);
    },
    chase(f, id) {
      S.update("invoices", id, (inv) => ({ reminders: (inv.reminders || []).concat(today()) }));
      toast("Chase logged — it won't ask again for a few days");
    },
    member(f, id) {
      const patch = { name: f.name.trim(), role: f.role.trim(), capacityHours: Number(f.capacityHours) || 0 };
      if (id) S.update("team", id, patch); else S.add("team", patch, "tm");
      toast("Saved");
    },
    lead(f, id) {
      const patch = {
        name: f.name.trim(), source: f.source.trim(), value: Number(f.value) || 0,
        stage: f.stage, nextTouchAt: f.nextTouchAt || null,
      };
      if (id) S.update("leads", id, patch); else S.add("leads", Object.assign({ touches: [] }, patch), "ld");
      toast("Saved");
    },
    touch(f, id) {
      S.update("leads", id, (lead) => ({
        touches: (lead.touches || []).concat({ at: today(), kind: f.kind, note: f.note.trim() }),
        nextTouchAt: f.nextTouchAt || null,
      }));
      const lead = S.find("leads", id);
      toast(`Touch ${lead.touches.length} logged`);
    },
    sync(f) {
      const url = AE.sync.normaliseUrl(f.url);
      AE.sync.setConfig({ url, token: f.token.trim() });
      toast(url ? "Server address saved" : "Address cleared");
      /* The sync config lives under its own key, so saving it doesn't go
         through the store and nothing would redraw on its own — and the
         buttons that appear once an address exists would stay hidden. */
      render();
    },
    settings(f) {
      S.commit((d) => Object.assign(d.settings, {
        businessName: f.businessName.trim() || "My Studio",
        operator: f.operator.trim(),
        currency: (f.currency || "USD").toUpperCase().slice(0, 3),
        updateEveryDays: Math.max(1, Number(f.updateEveryDays) || 7),
        followUpDays: Math.max(1, Number(f.followUpDays) || 4),
        touchesToClose: Math.max(1, Number(f.touchesToClose) || 3),
        reminderDays: Math.max(1, Number(f.reminderDays) || 3),
        qaBlocksDelivery: f.qaBlocksDelivery === "yes",
      }));
      toast("Settings saved");
    },
  };

  /* ---- events ------------------------------------------------------------ */
  document.addEventListener("click", (ev) => {
    const nav = ev.target.closest(".side-item[data-view]");
    if (nav) { go(nav.dataset.view); return; }

    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = actions[el.dataset.act];
    if (!act) return;
    ev.preventDefault();
    act(el.dataset.id || "", el);
  });

  document.addEventListener("change", (ev) => {
    const el = ev.target.closest('[data-act="toggleTask"]');
    if (el) actions.toggleTask(el.dataset.id);
  });

  document.addEventListener("submit", (ev) => {
    const formEl = ev.target.closest("[data-form]");
    if (!formEl) return;
    ev.preventDefault();
    const name = formEl.dataset.form;
    const fn = submits[name];
    if (!fn) return;

    /* Checkboxes need to come through as booleans, everything else as
       the string that was typed. */
    const values = {};
    for (const el of formEl.elements) {
      if (!el.name) continue;
      values[el.name] = el.type === "checkbox" ? el.checked : el.value;
    }
    fn(values, formEl.dataset.arg || "");
    if (name !== "settings" && name !== "sync") closeSheet();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !sheet.classList.contains("hidden")) closeSheet();
    if (ev.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      ev.preventDefault();
      $("#searchInput").focus();
    }
  });

  let searchTimer = null;
  $("#searchInput").addEventListener("input", (ev) => {
    clearTimeout(searchTimer);
    const q = ev.target.value.trim();
    searchTimer = setTimeout(() => { state.query = q; render(); }, 140);
  });

  $("#importFile").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        S.importJSON(reader.result);
        go("brief");
        toast("Imported");
      } catch (err) {
        toast("That file didn't read as this app's data");
      }
    };
    reader.readAsText(file);
    ev.target.value = "";
  });

  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (h) state.view = h;
    render();
  });

  /* ---- boot --------------------------------------------------------------- */
  function boot() {
    AE.install.listen();
    /* Settings shows whether an install is on offer, so it has to
       re-render when the browser decides to make one. */
    AE.install.onChange(() => { if (state.view === "settings") render(); });
    S.load();
    const data = db();
    /* A first open lands in a working business rather than nine empty
       screens — the demo is the fastest explanation of what this is. */
    if (!data.seeded && !data.clients.length) S.seed(now());

    const theme = db().settings.theme;
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (theme === "dark" || (theme === "auto" && prefersDark)) {
      document.body.classList.add("dark");
      $("#darkIcon").textContent = "☀";
    }

    const h = location.hash.slice(1);
    if (h) state.view = h;
    S.subscribe(render);
    render();

    if (!S.save()) {
      $("#sideFootNote").textContent = "This browser won't let the app save — changes last until you close the tab.";
    }
  }

  AE.app = { now, go, toast, render, openSheet, closeSheet, state };
  document.addEventListener("DOMContentLoaded", boot);
})(window.AE = window.AE || {});
