/* ================================================
   THE AI EMPLOYEE — brief.js
   Job 2 of nine: the morning read.
   Job 5 of nine: the client update.

   The morning read is not a list of everything. It is the short list of
   what needs a decision today or has a deadline, assembled from the
   other eight jobs and ordered by what goes wrong if it's missed. If the
   business is quiet, the brief is short — that is the point.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;

  const RANK = { red: 0, amber: 1, blue: 2 };

  function item(severity, text, meta, go) {
    return { severity, text, meta: meta || "", go: go || null };
  }

  /* ---- clients who are owed a word ---------------------------------- */
  function updateDue(db, now) {
    const at = now || new Date();
    const gap = Number(db.settings.updateEveryDays) || 7;
    const out = [];
    for (const client of db.clients) {
      if (client.status === "archived") continue;
      const live = db.projects.filter(
        (p) => p.clientId === client.id && p.stage !== "closed"
      );
      if (!live.length) continue;
      const updates = db.updates.filter((u) => u.clientId === client.id);
      const last = updates.length
        ? updates.reduce((newest, u) => (String(u.sentAt) > String(newest.sentAt) ? u : newest))
        : null;
      const since = last ? U.daysBetween(last.sentAt, at) : null;
      if (since == null || since >= gap) {
        out.push({ client, last, daysSince: since, projects: live });
      }
    }
    return out.sort((a, b) => (b.daysSince == null ? 999 : b.daysSince) - (a.daysSince == null ? 999 : a.daysSince));
  }

  /* ---- the read ------------------------------------------------------ */
  function build(db, now) {
    const at = now || new Date();
    const today = U.isoDay(at);
    const cur = db.settings.currency;
    const sections = [];
    const push = (id, title, icon, items) => {
      if (items.length) sections.push({ id, title, icon, items: items.sort((a, b) => RANK[a.severity] - RANK[b.severity]) });
    };

    /* 1. Decisions. Nothing else moves until these do. */
    const decisions = db.tasks
      .filter((t) => t.status !== "done" && t.needsDecision)
      .map((t) => item(
        U.isPast(t.due, at) ? "red" : "amber",
        t.title,
        `${AE.store.clientName(t.clientId) || "Internal"} · ${U.relDay(t.due, at)}`,
        { view: "work", id: t.id }
      ));
    push("decisions", "Needs a decision from you", "◆", decisions);

    /* 2. Promises made out loud and never written down. */
    const promises = db.promises
      .filter((p) => !p.kept && (!p.due || U.daysUntil(p.due, at) <= 1))
      .map((p) => item(
        U.isPast(p.due, at) ? "red" : "amber",
        p.text,
        `${AE.store.clientName(p.clientId)} · promised on a ${p.source || "call"} ${U.relDay(p.madeAt, at)}`,
        { view: "clients", id: p.clientId }
      ));
    push("promises", "Promises still open", "✋", promises);

    /* 3. Deadlines: work due, meetings today, deliveries this week. */
    const deadlines = [];
    for (const t of db.tasks) {
      if (t.status === "done" || t.needsDecision || !t.due) continue;
      const days = U.daysUntil(t.due, at);
      if (days > 1) continue;
      deadlines.push(item(
        days < 0 ? "red" : "amber",
        t.title,
        `${AE.store.projectName(t.projectId)} · ${U.relDay(t.due, at)}`,
        { view: "work", id: t.id }
      ));
    }
    for (const e of db.events) {
      if (e.done) continue;
      const day = U.isoDay(e.when);
      if (day !== today) continue;
      deadlines.push(item(
        e.kind === "deadline" ? "red" : "blue",
        e.title,
        `${U.fmtTime(e.when)} · ${e.kind}`,
        { view: "schedule", id: e.id }
      ));
    }
    push("today", "Today", "◷", deadlines);

    /* 4. Anything standing between finished work and the client. */
    const shipping = [];
    for (const p of db.projects) {
      if (p.stage !== "qa" && p.stage !== "in_progress") continue;
      const days = p.dueDate ? U.daysUntil(p.dueDate, at) : null;
      if (p.stage === "qa") {
        const gate = AE.qa.canShip(db, p.id);
        shipping.push(item(
          gate.ok ? "blue" : (days != null && days <= 1 ? "red" : "amber"),
          gate.ok ? `${p.name} — passed QA, ready to send` : `${p.name} — ${U.plural(gate.reasons.length, "thing")} to clear before it ships`,
          `${AE.store.clientName(p.clientId)}${days != null ? ` · due ${U.relDay(p.dueDate, at)}` : ""}`,
          { view: "qa", id: p.id }
        ));
      } else if (days != null && days <= 2) {
        shipping.push(item(days < 0 ? "red" : "amber", `${p.name} — still in progress`,
          `${AE.store.clientName(p.clientId)} · due ${U.relDay(p.dueDate, at)}`,
          { view: "work", id: p.id }));
      }
    }
    push("shipping", "Before it ships", "✓", shipping);

    /* 5. Margin: rounds done for free that nobody decided to give away. */
    const overage = AE.margin.unbilledAcross(db).map((s) => item(
      s.underwater ? "red" : "amber",
      `${s.project.name} — ${U.plural(s.unbilled.length, "extra round")} worth ${U.money(s.unbilledValue, cur)} not billed`,
      s.underwater
        ? `${s.client ? s.client.name : ""} · effective rate ${U.money(s.effectiveRate, cur)}/h against ${U.money(s.agreedRate, cur)}/h agreed`
        : `${s.client ? s.client.name : ""} · ${U.plural(s.used, "round")} used of ${s.included} included`,
      { view: "revisions", id: s.project.id }
    ));
    push("margin", "Revisions eating the margin", "↺", overage);

    /* 6. Money out the door. */
    const money = AE.money.needsChasing(db, at).map((row) => item(
      row.state.daysLate > 14 ? "red" : "amber",
      `${AE.store.clientName(row.invoice.clientId)} — ${row.invoice.number} · ${U.money(row.state.amount, cur)}`,
      (row.state.lastReminder
        ? `${row.state.label}, last chased ${U.relDay(row.state.lastReminder, at)}`
        : `${row.state.label}, never chased`),
      { view: "invoices", id: row.invoice.id }
    ));
    push("money", "Invoices to chase", "$", money);

    /* 7. Silence, which clients read as trouble. */
    const quiet = updateDue(db, at).map((row) => item(
      row.daysSince == null || row.daysSince > 14 ? "amber" : "blue",
      `${row.client.name} — ${row.daysSince == null ? "no update logged yet" : `last update ${U.plural(row.daysSince, "day")} ago`}`,
      `${U.plural(row.projects.length, "live project")}`,
      { view: "updates", id: row.client.id }
    ));
    push("quiet", "Clients owed an update", "✉", quiet);

    /* 8. The pipeline, which only rots quietly. */
    const leads = AE.growth.needsTouch(db, at).map((row) => item(
      row.health.count < (db.settings.touchesToClose || 3) ? "amber" : "blue",
      `${row.lead.name} — ${row.health.reason}`,
      `${U.money(row.lead.value, cur)} · ${AE.growth.STAGES.find((s) => s.key === row.lead.stage).label}`,
      { view: "growth", id: row.lead.id }
    ));
    push("pipeline", "Conversations going quiet", "↗", leads);

    /* 9. Work parked with someone else. */
    const waiting = [];
    for (const member of db.team) {
      if (member.id === "tm_you") continue;
      const open = db.tasks.filter((t) => t.owner === member.id && t.status !== "done");
      const late = open.filter((t) => U.isPast(t.due, at));
      if (late.length) {
        waiting.push(item("amber", `${member.name} — ${U.plural(late.length, "task")} past due`,
          late.map((t) => U.clip(t.title, 40)).join(" · "), { view: "team", id: member.id }));
      }
    }
    push("team", "Waiting on someone else", "◉", waiting);

    const counts = sections.reduce(
      (acc, s) => {
        for (const it of s.items) acc[it.severity] += 1;
        acc.total += s.items.length;
        return acc;
      },
      { red: 0, amber: 0, blue: 0, total: 0 }
    );

    return {
      date: today,
      dateLabel: U.fmtDayLong(today),
      sections,
      counts,
      /* One line at the top, because the whole point is not having to
         read nine screens to find out whether today is on fire. */
      headline: counts.total === 0
        ? "Nothing needs you. Everything on the books is on schedule."
        : counts.red > 0
          ? `${U.plural(counts.red, "thing")} need${counts.red === 1 ? "s" : ""} you today${counts.amber ? `, ${counts.amber} soon` : ""}.`
          : `Nothing urgent. ${U.plural(counts.total, "item")} worth a look.`,
    };
  }

  /* ---- job 5: one clear summary, no fluff ---------------------------- */
  function clientUpdateDraft(db, clientId, now) {
    const at = now || new Date();
    const client = db.clients.find((c) => c.id === clientId);
    if (!client) return "";
    const cur = db.settings.currency;

    const updates = db.updates.filter((u) => u.clientId === clientId);
    const last = updates.length
      ? updates.reduce((newest, u) => (String(u.sentAt) > String(newest.sentAt) ? u : newest))
      : null;
    const since = last ? last.sentAt : U.addDays(U.isoDay(at), -7);

    const projects = db.projects.filter((p) => p.clientId === clientId && p.stage !== "closed");
    const projectIds = new Set(projects.map((p) => p.id));

    const done = db.tasks.filter(
      (t) => t.status === "done" && projectIds.has(t.projectId) && t.doneAt && String(t.doneAt) >= String(since)
    );
    const openTasks = db.tasks.filter((t) => t.status !== "done" && projectIds.has(t.projectId));
    const mine = openTasks.filter((t) => !t.needsDecision);
    const theirs = db.promises.filter((p) => !p.kept && p.clientId === clientId);
    const decisions = openTasks.filter((t) => t.needsDecision);

    const lines = [];
    lines.push(`${client.name} — update, ${U.fmtDay(U.isoDay(at), { month: "long", day: "numeric" })}`);
    lines.push("");

    if (done.length) {
      lines.push("Done since the last update:");
      for (const t of done) lines.push(`· ${t.title}`);
      lines.push("");
    }

    if (mine.length) {
      lines.push("In progress:");
      for (const t of U.sortBy(mine, (t) => t.due || "9999").slice(0, 6)) {
        lines.push(`· ${t.title}${t.due ? ` — ${U.fmtDay(t.due)}` : ""}`);
      }
      lines.push("");
    }

    const delivery = projects.filter((p) => p.dueDate).map((p) => `${p.name} — ${U.fmtDay(p.dueDate)}`);
    if (delivery.length) {
      lines.push("Next delivery:");
      for (const d of delivery) lines.push(`· ${d}`);
      lines.push("");
    }

    /* The half of the update that actually changes anything: what is
       sitting with them. */
    if (decisions.length || theirs.length) {
      lines.push("What I need from you:");
      for (const t of decisions) lines.push(`· ${t.title}${t.due ? ` — by ${U.fmtDay(t.due)}` : ""}`);
      for (const p of theirs) lines.push(`· ${p.text}`);
      lines.push("");
    }

    /* Revisions said out loud, before they turn into an argument on an
       invoice. */
    for (const p of projects) {
      const m = AE.margin.state(db, p.id);
      if (m.overRounds > 0 && m.unbilled.length) {
        lines.push(
          `Note on ${p.name}: we're at ${U.plural(m.used, "revision round")} against ${m.included} included. ` +
          `Round${m.extra.length > 1 ? "s" : ""} ${m.extra.map((r) => r.round).join(", ")} ` +
          `come to ${U.money(m.unbilledValue, cur)} and will go on the next invoice unless you'd rather adjust the scope.`
        );
        lines.push("");
      }
    }

    const owed = db.invoices
      .map((i) => ({ i, s: AE.money.stateOf(i, db.settings, at) }))
      .filter((r) => r.i.clientId === clientId && r.s.state === "overdue");
    if (owed.length) {
      lines.push(
        `Also outstanding: ${owed.map((r) => `${r.i.number} (${U.money(r.s.amount, cur)}, ${r.s.label})`).join(", ")}.`
      );
      lines.push("");
    }

    lines.push(db.settings.operator || db.settings.businessName);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  AE.brief = { build, updateDue, clientUpdateDraft };
})(window.AE = window.AE || {});
