/* ================================================
   THE AI EMPLOYEE — ui.js
   Every view, rendered from the store. No decisions are made here:
   what a thing means is worked out in the modules, this file only
   puts it on the screen and labels the buttons.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;
  const S = AE.store;
  const e = U.esc;

  function cur() { return S.data().settings.currency || "USD"; }
  function m(amount) { return U.money(amount, cur()); }
  function now() { return AE.app && AE.app.now ? AE.app.now() : new Date(); }

  /* ---- small builders ------------------------------------------------ */
  function head(title, sub, actions) {
    return `<div class="view-head">
      <div><h1 class="view-title">${title}</h1>${sub ? `<p class="view-sub">${sub}</p>` : ""}</div>
      ${actions ? `<div class="view-actions">${actions}</div>` : ""}
    </div>`;
  }
  function card(inner, cls) { return `<section class="card ${cls || ""}">${inner}</section>`; }
  function cardHead(title, right) {
    return `<div class="card-head"><h2 class="card-title">${title}</h2>${right ? `<div class="spacer"></div>${right}` : ""}</div>`;
  }
  function stat(label, value, sub, tone) {
    return `<div class="stat ${tone ? "is-" + tone : ""}">
      <p class="stat-label">${label}</p><p class="stat-value">${value}</p>
      ${sub ? `<p class="stat-sub">${sub}</p>` : ""}</div>`;
  }
  function empty(title, body, action) {
    return `<div class="empty"><strong>${title}</strong>${body || ""}${action ? `<div style="margin-top:.8rem">${action}</div>` : ""}</div>`;
  }
  function btn(label, act, arg, cls) {
    return `<button class="btn ${cls || ""}" data-act="${act}"${arg ? ` data-id="${e(arg)}"` : ""}>${label}</button>`;
  }

  const STAGE_LABEL = {
    brief: "Brief", in_progress: "In progress", qa: "In QA", delivered: "Delivered", closed: "Closed",
  };
  const STAGE_TONE = { brief: "", in_progress: "badge-violet", qa: "badge-amber", delivered: "badge-green", closed: "" };

  /* ================================================================
     2 — MORNING READ
     ================================================================ */
  function viewBrief(db) {
    const b = AE.brief.build(db, now());
    const parts = [];

    parts.push(`<div class="brief-hero">
      <p class="brief-date">${e(b.dateLabel)} · the morning read</p>
      <p class="brief-headline">${e(b.headline)}</p>
      <div class="brief-counts">
        <span><span class="item-dot dot-red" style="display:inline-block;margin:0 .3rem 0 0"></span>${b.counts.red} urgent</span>
        <span><span class="item-dot dot-amber" style="display:inline-block;margin:0 .3rem 0 0"></span>${b.counts.amber} soon</span>
        <span><span class="item-dot dot-blue" style="display:inline-block;margin:0 .3rem 0 0"></span>${b.counts.blue} to note</span>
      </div>
    </div>`);

    if (!b.sections.length) {
      parts.push(empty("Desk clear",
        "<p>No decisions waiting, nothing past due, every client heard from recently.</p>",
        btn("Look at the work board", "goto", "work")));
      return parts.join("");
    }

    for (const sec of b.sections) {
      const items = sec.items.map((it) => `
        <button class="item" data-act="goto" data-id="${e(it.go ? it.go.view : "brief")}" data-ref="${e(it.go ? it.go.id : "")}">
          <span class="item-dot dot-${it.severity}"></span>
          <span class="row-main"><span class="item-text">${e(it.text)}</span>
          ${it.meta ? `<span class="item-meta">${e(it.meta)}</span>` : ""}</span>
        </button>`).join("");
      parts.push(card(
        `<h2 class="sec-title"><span class="sec-icon">${e(sec.icon)}</span>${e(sec.title)}<span class="sec-n">${sec.items.length}</span></h2>${items}`
      ));
    }
    return parts.join("");
  }

  /* ================================================================
     1 — CLIENT FILE
     ================================================================ */
  function viewClients(db) {
    const out = [head("Client file",
      "Business, rules, limits. Read before every task — which is the only reason the rest of it works.",
      btn("+ New client", "newClient", "", "btn-primary"))];

    if (!db.clients.length) {
      out.push(empty("No clients yet", "<p>The file is what every other job reads from: their rules, their revision limit, their payment terms.</p>",
        btn("Add the first client", "newClient", "", "btn-primary")));
      return out.join("");
    }

    out.push('<div class="grid grid-2">');
    for (const c of db.clients) {
      const projects = S.projectsOf(c.id).filter((p) => p.stage !== "closed");
      const owed = db.invoices
        .map((i) => ({ i, s: AE.money.stateOf(i, db.settings, now()) }))
        .filter((r) => r.i.clientId === c.id && (r.s.state === "overdue" || r.s.state === "due_soon" || r.s.state === "sent"));
      const late = owed.filter((r) => r.s.state === "overdue");
      const promises = db.promises.filter((p) => p.clientId === c.id && !p.kept);

      out.push(card(`
        ${cardHead(e(c.name), `<button class="btn btn-sm btn-quiet" data-act="editClient" data-id="${c.id}">Edit</button>`)}
        <p class="card-note">${e(c.contact || "no contact on file")}</p>
        <div style="margin:.7rem 0 .5rem">
          <span class="chip">${m(c.rate)}/h</span>
          <span class="chip">${U.plural(Number(c.revisionsIncluded) || 0, "revision round")} included</span>
          <span class="chip">${c.revisionRate ? m(c.revisionRate) + "/extra round" : "extra rounds at hourly"}</span>
          <span class="chip">net ${Number(c.paymentTermsDays) || 0} days</span>
        </div>
        ${(c.rules || []).length ? `<p class="card-note" style="margin-top:.5rem"><strong>Rules</strong></p>
          <ul class="rule-list">${c.rules.map((r) => `<li>${e(r)}</li>`).join("")}</ul>` : ""}
        ${c.notes ? `<p class="card-note" style="margin-top:.6rem">${e(c.notes)}</p>` : ""}
        <div class="row" style="border-top:1px solid var(--card-border);margin-top:.8rem;padding-top:.7rem">
          <div class="row-main"><span class="row-meta">
            ${U.plural(projects.length, "live project")}${promises.length ? ` · ${U.plural(promises.length, "open promise")}` : ""}
          </span></div>
          ${late.length ? `<span class="badge badge-red">${m(U.sum(late, (r) => r.s.amount))} late</span>`
                        : owed.length ? `<span class="badge">${m(U.sum(owed, (r) => r.s.amount))} out</span>` : ""}
        </div>
        <div class="row-actions" style="margin-top:.6rem">
          ${btn("Update draft", "composeUpdate", c.id, "btn-sm")}
          ${btn("New project", "newProject", c.id, "btn-sm")}
        </div>`));
    }
    out.push("</div>");
    return out.join("");
  }

  /* ================================================================
     WORK & PROJECTS
     ================================================================ */
  function taskRow(db, t) {
    const late = t.status !== "done" && U.isPast(t.due, now());
    const owner = db.team.find((x) => x.id === t.owner);
    return `<div class="row">
      <input type="checkbox" data-act="toggleTask" data-id="${t.id}" ${t.status === "done" ? "checked" : ""}
             aria-label="Mark done" style="width:16px;height:16px;accent-color:var(--accent)" />
      <div class="row-main">
        <p class="row-title ${t.status === "done" ? "is-done" : ""}">${e(t.title)}</p>
        <p class="row-meta">${e(S.projectName(t.projectId))}${owner ? " · " + e(owner.name) : ""}${t.due ? " · " + U.relDay(t.due, now()) : ""}</p>
      </div>
      ${t.needsDecision ? '<span class="badge badge-violet">decision</span>' : ""}
      ${late ? '<span class="badge badge-red">late</span>' : ""}
      <div class="row-actions">
        <button class="btn btn-sm btn-quiet" data-act="editTask" data-id="${t.id}">⋯</button>
      </div>
    </div>`;
  }

  function viewWork(db) {
    const out = [head("Work &amp; projects",
      "What is on, what it is worth, and what is left to do on it.",
      btn("+ Project", "newProject") + btn("+ Task", "newTask", "", "btn-primary"))];

    const live = db.projects.filter((p) => p.stage !== "closed");
    if (!live.length && !db.tasks.length) {
      out.push(empty("Nothing on the board", "<p>Add a project and the QA pass, revision log and invoicing all hang off it.</p>",
        btn("Add a project", "newProject", "", "btn-primary")));
      return out.join("");
    }

    out.push('<div class="grid grid-2">');
    for (const p of U.sortBy(live, (p) => p.dueDate || "9999")) {
      const mg = AE.margin.state(db, p.id);
      const tasks = db.tasks.filter((t) => t.projectId === p.id);
      const open = tasks.filter((t) => t.status !== "done");
      const gate = AE.qa.canShip(db, p.id);
      const invoiced = U.sum(db.invoices.filter((i) => i.projectId === p.id && i.status !== "void"), AE.money.total);

      out.push(card(`
        ${cardHead(e(p.name), `<span class="badge ${STAGE_TONE[p.stage] || ""}">${STAGE_LABEL[p.stage] || e(p.stage)}</span>`)}
        <p class="card-note">${e(S.clientName(p.clientId))} · ${m(p.fee)}${p.dueDate ? ` · due ${U.relDay(p.dueDate, now())}` : ""}</p>
        ${p.notes ? `<p class="card-note" style="margin-top:.4rem">${e(p.notes)}</p>` : ""}
        <div style="margin:.7rem 0">
          <span class="chip">${open.length}/${tasks.length} tasks open</span>
          <span class="chip">${mg.used}/${mg.included} rounds${mg.overRounds ? ` +${mg.overRounds}` : ""}</span>
          <span class="chip">${m(invoiced)} invoiced</span>
          ${mg.unbilledValue ? `<span class="chip" style="color:var(--amber)">${m(mg.unbilledValue)} unbilled</span>` : ""}
        </div>
        ${p.stage === "qa" && !gate.ok
          ? `<p class="card-note" style="color:var(--amber)">Held: ${e(gate.reasons[0])}${gate.reasons.length > 1 ? ` (+${gate.reasons.length - 1} more)` : ""}</p>` : ""}
        <div class="row-actions" style="margin-top:.6rem;flex-wrap:wrap">
          ${btn("Log revision", "logRevision", p.id, "btn-sm")}
          ${btn("QA pass", "runQa", p.id, "btn-sm")}
          ${btn("Invoice", "draftInvoice", p.id, "btn-sm")}
          ${btn("Edit", "editProject", p.id, "btn-sm btn-quiet")}
          ${p.stage === "qa" ? btn("Deliver", "deliver", p.id, "btn-sm btn-primary") : ""}
        </div>`));
    }
    out.push("</div>");

    const open = db.tasks.filter((t) => t.status !== "done");
    const done = db.tasks.filter((t) => t.status === "done");
    out.push(card(cardHead("Open tasks", `<span class="card-note">${open.length}</span>`) +
      (open.length
        ? U.sortBy(open, (t) => t.due || "9999").map((t) => taskRow(db, t)).join("")
        : '<p class="card-note">Nothing open.</p>')));
    if (done.length) {
      out.push(card(cardHead(`Done (${done.length})`) +
        U.sortBy(done, (t) => t.doneAt || "").reverse().slice(0, 8).map((t) => taskRow(db, t)).join("")));
    }
    return out.join("");
  }

  /* ================================================================
     3 — QA PASS
     ================================================================ */
  function viewQa(db) {
    const out = [head("QA pass",
      "Check before it ships. The list is built from the client's own rules and the promises made to them, so a failure names what it broke.",
      "")];

    const projects = db.projects.filter((p) => p.stage !== "closed");
    if (!projects.length) return out.concat(empty("Nothing to check", "<p>QA runs against a project.</p>")).join("");

    for (const p of projects) {
      const s = AE.qa.status(db, p.id);
      const gate = AE.qa.canShip(db, p.id);
      const tone = s.passed ? "badge-green" : s.stale ? "badge-amber" : s.run ? "badge-red" : "";
      out.push(card(`
        ${cardHead(e(p.name), `<span class="badge ${tone}">${e(s.label)}</span>`)}
        <p class="card-note">${e(S.clientName(p.clientId))} · ${U.plural(s.checks.length, "check")}${s.ranAt ? ` · last run ${U.relDay(U.isoDay(s.ranAt), now())}` : " · never run"}</p>
        ${s.run && s.failed.length ? `<ul class="rule-list">${s.failed.slice(0, 4).map((c) => `<li>${e(c.label)}</li>`).join("")}</ul>` : ""}
        ${s.stale ? '<p class="card-note" style="color:var(--amber);margin-top:.4rem">A revision landed after this pass — it needs running again.</p>' : ""}
        <div class="row-actions" style="margin-top:.7rem">
          ${btn(s.run ? "Run it again" : "Run the pass", "runQa", p.id, "btn-primary btn-sm")}
          ${gate.ok && p.stage === "qa" ? btn("Deliver", "deliver", p.id, "btn-sm") : ""}
        </div>`));
    }
    return out.join("");
  }

  /* ================================================================
     4 — REVISION LOG
     ================================================================ */
  function viewRevisions(db) {
    const rows = db.projects.filter((p) => p.stage !== "closed").map((p) => AE.margin.state(db, p.id));
    const unbilled = U.sum(rows, (r) => r.unbilledValue);
    const given = U.sum(rows, (r) => r.goodwillValue);

    const out = [head("Revision log",
      "Track changes. Keep margins intact. A round that was never counted is a round nobody was paid for.",
      btn("+ Log a revision", "logRevision", "", "btn-primary"))];

    out.push(`<div class="grid grid-3" style="margin-bottom:1rem">
      ${stat("Unbilled overage", m(unbilled), "past the included rounds", unbilled > 0 ? "warn" : "good")}
      ${stat("Given away", m(given), "logged as goodwill")}
      ${stat("Projects over scope", String(rows.filter((r) => r.overRounds > 0).length), "of " + rows.length + " live")}
    </div>`);

    if (!rows.length) {
      out.push(empty("Nothing to log yet",
        "<p>The log hangs off a project. Once one exists, every change to it gets a round number and a price.</p>",
        btn("Add a project", "newProject", "", "btn-primary")));
      return out.join("");
    }

    for (const r of rows) {
      if (!r.rounds.length && r.project.stage === "brief") continue;
      out.push(card(`
        ${cardHead(e(r.project.name), `<span class="badge ${r.overRounds ? "badge-amber" : "badge-green"}">${r.used} of ${r.included} included</span>`)}
        <p class="card-note">${e(r.client ? r.client.name : "—")} · fee ${m(r.fee)} · ${Math.round(r.minutes / 6) / 10}h logged on revisions
          ${r.effectiveRate != null ? ` · effective ${m(r.effectiveRate)}/h against ${m(r.agreedRate)}/h agreed` : ""}</p>
        ${r.underwater ? '<p class="card-note" style="color:var(--danger);margin-top:.3rem">This job is now earning less per hour than the rate it was quoted at.</p>' : ""}
        ${r.rounds.length ? r.rounds.map((rev) => {
          const kind = AE.margin.classify(rev, r.client);
          const amount = AE.margin.amountFor(rev, r.client);
          return `<div class="row">
            <div class="row-main">
              <p class="row-title">Round ${rev.round} — ${e(rev.summary || "no summary")}</p>
              <p class="row-meta">${U.relDay(rev.requestedAt, now())} · ${rev.minutes || 0} min</p>
            </div>
            <span class="badge ${kind === "extra" ? (rev.billed ? "badge-green" : "badge-amber") : kind === "goodwill" ? "badge-violet" : ""}">
              ${kind === "extra" ? (rev.billed ? "billed" : "billable") : kind}
            </span>
            ${amount ? `<span class="row-amount">${m(amount)}</span>` : ""}
            <div class="row-actions">
              ${kind === "extra" && !rev.billed ? `<button class="btn btn-sm btn-quiet" data-act="goodwill" data-id="${rev.id}" title="Absorb this round deliberately">absorb</button>` : ""}
              <button class="btn btn-sm btn-quiet" data-act="deleteRevision" data-id="${rev.id}">✕</button>
            </div>
          </div>`;
        }).join("") : '<p class="card-note">No revisions logged yet.</p>'}
        <div class="row-actions" style="margin-top:.7rem">
          ${btn("Log round " + AE.margin.nextRound(db, r.project.id), "logRevision", r.project.id, "btn-sm")}
          ${r.unbilled.length ? btn(`Bill ${m(r.unbilledValue)}`, "draftInvoice", r.project.id, "btn-sm btn-primary") : ""}
        </div>`));
    }
    return out.join("");
  }

  /* ================================================================
     5 — CLIENT UPDATES
     ================================================================ */
  function viewUpdates(db) {
    const due = AE.brief.updateDue(db, now());
    const dueIds = new Set(due.map((d) => d.client.id));
    const out = [head("Client updates",
      "One clear summary. No fluff. Built from what actually happened, including the parts nobody enjoys writing.",
      "")];

    if (!db.clients.length) return out.concat(empty("No clients yet", "")).join("");

    for (const c of db.clients) {
      const updates = U.sortBy(db.updates.filter((u) => u.clientId === c.id), (u) => u.sentAt).reverse();
      const last = updates[0] || null;
      const overdue = dueIds.has(c.id);
      out.push(card(`
        ${cardHead(e(c.name), overdue ? '<span class="badge badge-amber">owed an update</span>' : '<span class="badge badge-green">up to date</span>')}
        <p class="card-note">${last ? `Last sent ${U.relDay(last.sentAt, now())}` : "Nothing logged yet"} · every ${db.settings.updateEveryDays} days</p>
        ${last ? `<div class="draft" style="margin-top:.6rem;max-height:9rem">${e(U.clip(last.body, 400))}</div>` : ""}
        <div class="row-actions" style="margin-top:.7rem">
          ${btn("Write the update", "composeUpdate", c.id, "btn-primary btn-sm")}
          ${updates.length > 1 ? `<span class="card-note" style="align-self:center">${U.plural(updates.length, "update")} on file</span>` : ""}
        </div>`));
    }
    return out.join("");
  }

  /* ================================================================
     6 — SCHEDULING
     ================================================================ */
  function viewSchedule(db) {
    const out = [head("Scheduling",
      "Meetings, deadlines, follow-ups. One place, so a promise to call back on Thursday is a thing that exists.",
      btn("+ Add", "newEvent", "", "btn-primary"))];

    const open = db.events.filter((ev) => !ev.done);
    if (!open.length) return out.concat(empty("Nothing scheduled", "<p>Deadlines from projects show up here once you add them.</p>",
      btn("Add something", "newEvent", "", "btn-primary"))).join("");

    const byDay = new Map();
    for (const ev of U.sortBy(open, (x) => x.when)) {
      const day = U.isoDay(ev.when);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(ev);
    }
    for (const [day, list] of byDay) {
      const late = U.isPast(day, now());
      out.push(card(
        cardHead(`${U.fmtDayLong(day)}`, `<span class="badge ${late ? "badge-red" : U.daysUntil(day, now()) === 0 ? "badge-amber" : ""}">${U.relDay(day, now())}</span>`) +
        list.map((ev) => `<div class="row">
          <div class="row-main">
            <p class="row-title">${e(ev.title)}</p>
            <p class="row-meta">${U.fmtTime(ev.when)} · ${e(ev.kind)}${ev.clientId ? " · " + e(S.clientName(ev.clientId)) : ""}</p>
          </div>
          <div class="row-actions">
            <button class="btn btn-sm btn-quiet" data-act="doneEvent" data-id="${ev.id}">done</button>
            <button class="btn btn-sm btn-quiet" data-act="deleteEvent" data-id="${ev.id}">✕</button>
          </div>
        </div>`).join("")));
    }
    return out.join("");
  }

  /* ================================================================
     7 — INVOICING
     ================================================================ */
  function viewInvoices(db) {
    const t = AE.money.totals(db, now());
    const aging = AE.money.aging(db, now());
    const out = [head("Invoicing",
      "Track, remind, get paid. An invoice is overdue when the calendar says so, whatever the label on it says.",
      btn("+ New invoice", "draftInvoice", "", "btn-primary"))];

    out.push(`<div class="grid grid-4" style="margin-bottom:1rem">
      ${stat("Outstanding", m(t.outstanding), "sent, not paid")}
      ${stat("Overdue", m(t.overdue), t.overdue ? "chase it" : "nothing late", t.overdue ? "bad" : "good")}
      ${stat("Not yet invoiced", m(t.uninvoiced), "work already done", t.uninvoiced ? "warn" : "")}
      ${stat("Paid this month", m(t.paidMonth), t.avgDaysToPay != null ? `usually ${U.plural(t.avgDaysToPay, "day")} to pay` : "", "good")}
    </div>`);

    if (t.outstanding > 0) {
      out.push(card(cardHead("Aged") + `<div class="grid grid-4">
        ${stat("Not due", m(aging.current), "")}
        ${stat("1–30 days", m(aging.d1_30), "", aging.d1_30 ? "warn" : "")}
        ${stat("31–60 days", m(aging.d31_60), "", aging.d31_60 ? "bad" : "")}
        ${stat("60+ days", m(aging.d60plus), "", aging.d60plus ? "bad" : "")}
      </div>`));
    }

    if (!db.invoices.length) {
      out.push(empty("No invoices yet", "<p>A draft builds itself from the project fee and any revision rounds past the included ones.</p>",
        btn("Draft one", "draftInvoice", "", "btn-primary")));
      return out.join("");
    }

    const rows = U.sortBy(db.invoices, (i) => i.dueAt || "").map((inv) => {
      const s = AE.money.stateOf(inv, db.settings, now());
      const tone = s.state === "overdue" ? "badge-red" : s.state === "paid" ? "badge-green"
        : s.state === "due_soon" ? "badge-amber" : s.state === "draft" ? "badge-violet" : "";
      return `<div class="row">
        <div class="row-main">
          <p class="row-title">${e(inv.number)} — ${e(S.clientName(inv.clientId))}</p>
          <p class="row-meta">${e(S.projectName(inv.projectId))} · issued ${U.fmtDay(inv.issuedAt)}${(inv.reminders || []).length ? ` · chased ${U.plural(inv.reminders.length, "time")}` : ""}</p>
        </div>
        <span class="badge ${tone}">${e(s.label)}</span>
        <span class="row-amount">${m(s.amount)}</span>
        <div class="row-actions">
          ${inv.status === "draft" ? `<button class="btn btn-sm" data-act="sendInvoice" data-id="${inv.id}">send</button>` : ""}
          ${s.state === "overdue" ? `<button class="btn btn-sm ${s.needsReminder ? "btn-primary" : "btn-quiet"}" data-act="chase" data-id="${inv.id}">chase</button>` : ""}
          ${inv.status !== "paid" && inv.status !== "draft" ? `<button class="btn btn-sm btn-quiet" data-act="markPaid" data-id="${inv.id}">paid</button>` : ""}
          <button class="btn btn-sm btn-quiet" data-act="viewInvoice" data-id="${inv.id}">⋯</button>
        </div>
      </div>`;
    }).join("");
    out.push(card(cardHead("All invoices") + rows));
    return out.join("");
  }

  /* ================================================================
     8 — TEAM
     ================================================================ */
  function viewTeam(db) {
    const out = [head("Team",
      "Tasks, feedback, progress — including when the team is one person and a contractor.",
      btn("+ Add someone", "newMember", "", "btn-primary"))];

    if (!db.team.length) return out.concat(empty("Nobody on the books", "<p>Add yourself first — the workload view needs someone to hang tasks on.</p>",
      btn("Add", "newMember", "", "btn-primary"))).join("");

    out.push('<div class="grid grid-2">');
    for (const person of db.team) {
      const tasks = db.tasks.filter((t) => t.owner === person.id);
      const open = tasks.filter((t) => t.status !== "done");
      const late = open.filter((t) => U.isPast(t.due, now()));
      const doneWeek = tasks.filter((t) => t.status === "done" && t.doneAt && t.doneAt >= U.weekStart(now()));
      out.push(card(`
        ${cardHead(e(person.name), late.length ? `<span class="badge badge-red">${U.plural(late.length, "late task")}</span>` : "")}
        <p class="card-note">${e(person.role || "—")}${person.capacityHours ? ` · ${person.capacityHours}h a week` : ""}</p>
        <div style="margin:.6rem 0">
          <span class="chip">${open.length} open</span>
          <span class="chip">${doneWeek.length} done this week</span>
        </div>
        ${open.length ? open.slice(0, 5).map((t) => `<div class="row">
          <div class="row-main"><p class="row-title">${e(t.title)}</p>
          <p class="row-meta">${e(S.projectName(t.projectId))}${t.due ? " · " + U.relDay(t.due, now()) : ""}</p></div>
          ${U.isPast(t.due, now()) ? '<span class="badge badge-red">late</span>' : ""}
        </div>`).join("") : '<p class="card-note">Nothing assigned.</p>'}
        <div class="row-actions" style="margin-top:.6rem">
          ${btn("Assign a task", "newTask", person.id, "btn-sm")}
          ${btn("Edit", "editMember", person.id, "btn-sm btn-quiet")}
        </div>`));
    }
    out.push("</div>");
    return out.join("");
  }

  /* ================================================================
     9 — GROWTH
     ================================================================ */
  function viewGrowth(db) {
    const p = AE.growth.pipeline(db, now());
    const out = [head("Growth",
      "New clients, new opportunities. Proposals rarely die of a no — they die on the touch nobody made.",
      btn("+ New lead", "newLead", "", "btn-primary"))];

    out.push(`<div class="grid grid-4" style="margin-bottom:1rem">
      ${stat("Open pipeline", m(p.openValue), U.plural(p.open, "conversation"))}
      ${stat("Weighted", m(p.weighted), "discounted by stage")}
      ${stat("Gone quiet", String(p.stalled), "need a touch", p.stalled ? "warn" : "good")}
      ${stat("Win rate", p.winRate == null ? "—" : p.winRate + "%", "of closed deals")}
    </div>`);

    if (!db.leads.length) {
      out.push(empty("Nothing in the pipeline", "<p>A lead with two touches and no third is the most expensive thing in a one-person business.</p>",
        btn("Add a lead", "newLead", "", "btn-primary")));
      return out.join("");
    }

    for (const stage of AE.growth.STAGES) {
      const bucket = p.byStage[stage.key];
      if (!bucket || !bucket.count) continue;
      out.push(card(cardHead(stage.label, `<span class="card-note">${m(bucket.value)}</span>`) +
        bucket.leads.map((lead) => {
          const h = AE.growth.healthOf(lead, db.settings, now());
          const tone = h.severity === "warn" ? "badge-amber" : h.severity === "due" ? "badge-violet" : "";
          return `<div class="row">
            <div class="row-main">
              <p class="row-title">${e(lead.name)}</p>
              <p class="row-meta">${e(lead.source || "—")} · ${U.plural(h.count, "touch", "touches")}${h.daysSince != null ? `, last ${U.relDay(AE.growth.lastTouch(lead).at, now())}` : ""}</p>
            </div>
            ${h.reason && h.open ? `<span class="badge ${tone}">${e(U.clip(h.reason, 34))}</span>` : ""}
            <span class="row-amount">${m(lead.value)}</span>
            <div class="row-actions">
              ${h.open ? `<button class="btn btn-sm ${h.stalled ? "btn-primary" : ""}" data-act="touchLead" data-id="${lead.id}">touch</button>` : ""}
              <button class="btn btn-sm btn-quiet" data-act="editLead" data-id="${lead.id}">⋯</button>
            </div>
          </div>`;
        }).join("")));
    }
    return out.join("");
  }

  /* ================================================================
     HOW IT WORKS — the poster
     ================================================================ */
  const JOBS = [
    { n: 1, view: "clients", title: "Client file", body: "Business, rules, limits. Read before every task." },
    { n: 2, view: "brief", title: "Morning read", body: "Only what needs a decision or has a deadline." },
    { n: 3, view: "qa", title: "QA pass", body: "Check before it ships. No edits. Just gaps." },
    { n: 4, view: "revisions", title: "Revision log", body: "Track changes. Keep margins intact." },
    { n: 5, view: "updates", title: "Client updates", body: "One clear summary. No fluff." },
    { n: 6, view: "schedule", title: "Scheduling", body: "Meetings, deadlines, follow-ups." },
    { n: 7, view: "invoices", title: "Invoicing", body: "Track, remind, get paid." },
    { n: 8, view: "team", title: "Team", body: "Tasks, feedback, progress." },
    { n: 9, view: "growth", title: "Growth", body: "New clients, new opportunities." },
  ];
  const PROBLEMS = [
    ["☎", "Missed follow-ups", "and lost opportunities"],
    ["✎", "Unwritten promises", "made on calls, in chats"],
    ["↺", "Untracked revisions", "extra work, lost margin"],
    ["$", "Late invoices", "cash flow issues"],
    ["✉", "Stalled proposals", "no third touch"],
  ];
  const RESULTS = [
    ["◎", "Better client follow-ups", "more deals, less chasing"],
    ["▤", "Everything documented", 'no more "he said, she said"'],
    ["◷", "Faster operations", "on time, every time"],
    ["◫", "Clean invoices & cash flow", "no more late payments"],
  ];

  function viewHow() {
    return `<div class="poster">
      <div class="poster-head">
        <h1>How to run a <em>one-person business</em><br />with an AI employee</h1>
        <p>Agencies rarely lose accounts over the quality of the work. They lose them to the admin around the work — a promise made on a call and never written down, a revision round nobody counted, an invoice that went out three weeks late.</p>
      </div>

      <div class="poster-flow">
        <div class="poster-col problem">
          <h3>The problem</h3>
          <div class="poster-list">
            ${PROBLEMS.map(([icon, title, sub]) => `<div class="poster-line">
              <span class="mark">${icon}</span><div><b>${title}</b><span>${sub}</span></div></div>`).join("")}
          </div>
        </div>

        <div class="poster-core">
          <span class="bot">◒</span>
          <h2>The AI employee</h2>
          <p class="tag">Not a tool. A hire.</p>
          <ul>
            <li>Works where you work</li>
            <li>Runs on nine jobs</li>
            <li>Handles the client side</li>
            <li>Brings structure, not chaos</li>
          </ul>
        </div>

        <div class="poster-col result">
          <h3>The result</h3>
          <div class="poster-list">
            ${RESULTS.map(([icon, title, sub]) => `<div class="poster-line">
              <span class="mark">${icon}</span><div><b>${title}</b><span>${sub}</span></div></div>`).join("")}
          </div>
        </div>
      </div>

      <p class="poster-strip-title">Nine jobs, one job description</p>
      <div class="poster-strip">
        ${JOBS.map((j) => `<button class="job-card" data-act="goto" data-id="${j.view}">
          <span class="job-n">${j.n}</span><b>${j.title}</b><span>${j.body}</span></button>`).join("")}
      </div>

      <p class="poster-foot">Same person. <b>Bigger capacity.</b></p>
    </div>`;
  }

  /* ================================================================
     SETTINGS
     ================================================================ */
  /* The offer to install, worded for wherever the person actually is —
     an iOS Chrome user hunting for a Share menu item that isn't there is
     worse served than one told to open Safari. */
  function installCard() {
    const st = AE.install.state();
    return card(cardHead("Install it") + `
      <p class="card-note">${e(st.advice)}</p>
      ${st.canPrompt ? `<div class="row-actions" style="margin-top:.7rem">${btn("Install", "install", "", "btn-sm btn-primary")}</div>` : ""}
      ${st.installed ? "" : '<p class="field-hint" style="margin-top:.5rem">Once installed it opens offline — the record is on the device either way.</p>'}`);
  }

  function viewSettings(db) {
    const s = db.settings;
    return head("Settings", "How the employee decides what to chase, and when.") + card(`
      <form data-form="settings">
        <div class="field-row">
          <div class="field"><label for="setBiz">Business name</label>
            <input id="setBiz" name="businessName" value="${e(s.businessName)}" /></div>
          <div class="field"><label for="setOp">Sign updates as</label>
            <input id="setOp" name="operator" value="${e(s.operator)}" placeholder="Your name" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="setCur">Currency</label>
            <input id="setCur" name="currency" value="${e(s.currency)}" maxlength="3" /></div>
          <div class="field"><label for="setUpd">Update a client every (days)</label>
            <input id="setUpd" name="updateEveryDays" type="number" min="1" value="${s.updateEveryDays}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="setFollow">A lead is quiet after (days)</label>
            <input id="setFollow" name="followUpDays" type="number" min="1" value="${s.followUpDays}" /></div>
          <div class="field"><label for="setTouch">Touches before a proposal counts as worked</label>
            <input id="setTouch" name="touchesToClose" type="number" min="1" value="${s.touchesToClose}" />
            <p class="field-hint">The third touch is the one that gets skipped.</p></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="setRem">Days between invoice reminders</label>
            <input id="setRem" name="reminderDays" type="number" min="1" value="${s.reminderDays}" /></div>
          <div class="field"><label for="setQa">QA blocks delivery</label>
            <select id="setQa" name="qaBlocksDelivery">
              <option value="yes" ${s.qaBlocksDelivery ? "selected" : ""}>Yes — nothing ships unchecked</option>
              <option value="no" ${!s.qaBlocksDelivery ? "selected" : ""}>No — warn me only</option>
            </select></div>
        </div>
        <div class="form-actions">${btn("Save", "noop", "", "btn-primary")}</div>
      </form>`) + installCard() + card(cardHead("This data") + `
      <p class="card-note">Everything lives in this browser's local storage — nothing is sent anywhere. Export it if you want a copy.</p>
      <div class="row-actions" style="margin-top:.7rem">
        ${btn("Export JSON", "export", "", "btn-sm")}
        ${btn("Load the demo business", "seed", "", "btn-sm")}
        ${btn("Erase everything", "reset", "", "btn-sm btn-danger")}
      </div>`);
  }

  /* ================================================================
     SEARCH
     ================================================================ */
  function viewSearch(db, q) {
    const term = q.toLowerCase();
    const hit = (s) => String(s || "").toLowerCase().includes(term);
    const rows = [];
    for (const c of db.clients) if (hit(c.name) || hit(c.contact) || hit(c.notes) || (c.rules || []).some(hit))
      rows.push(["Client", c.name, c.contact || "", "clients", c.id]);
    /* A client's name should find their work too, not just their file. */
    for (const p of db.projects) if (hit(p.name) || hit(p.notes) || hit(S.clientName(p.clientId)))
      rows.push(["Project", p.name, S.clientName(p.clientId), "work", p.id]);
    for (const t of db.tasks) if (hit(t.title) || hit(S.projectName(t.projectId)))
      rows.push(["Task", t.title, S.projectName(t.projectId), "work", t.id]);
    for (const r of db.revisions) if (hit(r.summary))
      rows.push(["Revision", `Round ${r.round} — ${r.summary}`, S.projectName(r.projectId), "revisions", r.id]);
    for (const i of db.invoices) if (hit(i.number) || hit(S.clientName(i.clientId)) || (i.lines || []).some((l) => hit(l.desc)))
      rows.push(["Invoice", i.number, S.clientName(i.clientId), "invoices", i.id]);
    for (const l of db.leads) if (hit(l.name) || hit(l.source))
      rows.push(["Lead", l.name, l.source || "", "growth", l.id]);
    for (const p of db.promises) if (hit(p.text))
      rows.push(["Promise", p.text, S.clientName(p.clientId), "clients", p.id]);

    return head(`Search`, `${U.plural(rows.length, "result")} for “${e(q)}”`) + (rows.length
      ? card(rows.map(([kind, title, meta, view, id]) => `<button class="item" data-act="goto" data-id="${view}" data-ref="${e(id)}">
          <span class="item-dot dot-blue"></span>
          <span class="row-main"><span class="item-text">${e(title)}</span>
          <span class="item-meta">${e(kind)}${meta ? " · " + e(meta) : ""}</span></span></button>`).join(""))
      : empty("Nothing found", "<p>Try a client name, an invoice number or a few words from a task.</p>"));
  }

  /* ================================================================
     ROUTER
     ================================================================ */
  const VIEWS = {
    brief: viewBrief, clients: viewClients, work: viewWork, qa: viewQa,
    revisions: viewRevisions, updates: viewUpdates, schedule: viewSchedule,
    invoices: viewInvoices, team: viewTeam, growth: viewGrowth,
    how: viewHow, settings: viewSettings,
  };

  function render(view, db, extra) {
    const fn = VIEWS[view] || viewBrief;
    return view === "search" ? viewSearch(db, extra || "") : fn(db, extra);
  }

  AE.ui = { render, viewSearch, JOBS, STAGE_LABEL, head, card, cardHead, stat, empty, btn, m };
})(window.AE = window.AE || {});
