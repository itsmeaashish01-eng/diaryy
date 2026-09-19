/* ================================================
   THE AI EMPLOYEE — money.js
   Job 7 of nine: invoicing. Track, remind, get paid.

   An invoice has a status somebody typed and a state the calendar
   decides. This module only trusts the calendar: "sent" plus a due date
   in the past is overdue whether or not anyone changed the label.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;

  function total(invoice) {
    return U.sum((invoice && invoice.lines) || [], (l) => l.amount);
  }

  /* What this invoice actually is today. */
  function stateOf(invoice, settings, now) {
    const at = now || new Date();
    const cfg = settings || {};
    const amount = total(invoice);
    const base = { amount, needsReminder: false, daysLate: 0, daysToDue: null, lastReminder: null };

    if (!invoice) return Object.assign(base, { state: "draft", label: "Draft" });
    if (invoice.status === "paid") {
      const days = invoice.paidAt && invoice.issuedAt ? U.daysBetween(invoice.issuedAt, invoice.paidAt) : null;
      return Object.assign(base, { state: "paid", label: "Paid", daysToPay: days });
    }
    if (invoice.status === "void") return Object.assign(base, { state: "void", label: "Void" });
    if (invoice.status === "draft") return Object.assign(base, { state: "draft", label: "Draft — not sent" });

    const daysToDue = U.daysUntil(invoice.dueAt, at);
    const reminders = (invoice.reminders || []).slice().sort();
    const lastReminder = reminders.length ? reminders[reminders.length - 1] : null;

    if (daysToDue < 0) {
      const late = Math.abs(daysToDue);
      /* Chase once the grace period is up, then again every cycle —
         never twice in the same window, which is how a reminder turns
         into nagging. */
      const gap = Number(cfg.reminderDays) || 3;
      const sinceLast = lastReminder ? U.daysBetween(lastReminder, at) : null;
      const needsReminder = sinceLast == null ? late >= 1 : sinceLast >= gap;
      return Object.assign(base, {
        state: "overdue", label: `${U.plural(late, "day")} late`,
        daysLate: late, daysToDue, needsReminder, lastReminder,
      });
    }
    return Object.assign(base, {
      state: daysToDue <= 5 ? "due_soon" : "sent",
      label: daysToDue === 0 ? "Due today" : `Due ${U.relDay(invoice.dueAt, at)}`,
      daysToDue, lastReminder,
    });
  }

  /* The cash position, which is the only reason any of this is tracked. */
  function totals(db, now) {
    const at = now || new Date();
    const month = U.isoDay(at).slice(0, 7);
    const year = U.isoDay(at).slice(0, 4);
    let outstanding = 0, overdue = 0, drafted = 0, paidMonth = 0, paidYear = 0;
    const payDays = [];

    for (const inv of db.invoices) {
      const s = stateOf(inv, db.settings, at);
      if (s.state === "paid") {
        if ((inv.paidAt || "").slice(0, 7) === month) paidMonth += s.amount;
        if ((inv.paidAt || "").slice(0, 4) === year) paidYear += s.amount;
        if (typeof s.daysToPay === "number") payDays.push(s.daysToPay);
      } else if (s.state === "draft") {
        drafted += s.amount;
      } else if (s.state !== "void") {
        outstanding += s.amount;
        if (s.state === "overdue") overdue += s.amount;
      }
    }

    /* Work already done that nobody has invoiced yet — the difference
       between a busy month and a paid one. */
    const uninvoiced = U.sum(AE.margin.unbilledAcross(db), (s) => s.unbilledValue);

    return {
      outstanding: U.round2(outstanding),
      overdue: U.round2(overdue),
      drafted: U.round2(drafted),
      paidMonth: U.round2(paidMonth),
      paidYear: U.round2(paidYear),
      uninvoiced: U.round2(uninvoiced),
      avgDaysToPay: payDays.length ? Math.round(U.sum(payDays) / payDays.length) : null,
    };
  }

  /* Everything that should be chased right now. */
  function needsChasing(db, now) {
    const at = now || new Date();
    return db.invoices
      .map((inv) => ({ invoice: inv, state: stateOf(inv, db.settings, at) }))
      .filter((row) => row.state.needsReminder)
      .sort((a, b) => b.state.daysLate - a.state.daysLate);
  }

  function aging(db, now) {
    const at = now || new Date();
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
    for (const inv of db.invoices) {
      const s = stateOf(inv, db.settings, at);
      if (s.state === "paid" || s.state === "void" || s.state === "draft") continue;
      if (s.daysLate === 0) buckets.current += s.amount;
      else if (s.daysLate <= 30) buckets.d1_30 += s.amount;
      else if (s.daysLate <= 60) buckets.d31_60 += s.amount;
      else buckets.d60plus += s.amount;
    }
    for (const k of Object.keys(buckets)) buckets[k] = U.round2(buckets[k]);
    return buckets;
  }

  /* "2026-047" — sequential within the year, so a gap is visible. */
  function nextNumber(db, now) {
    const year = U.isoDay(now || new Date()).slice(0, 4);
    let max = 0;
    for (const inv of db.invoices) {
      const m = /^(\d{4})-(\d+)$/.exec(String(inv.number || ""));
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    }
    return `${year}-${String(max + 1).padStart(3, "0")}`;
  }

  /* A draft built from what the project is actually owed: the part of
     the fee not yet invoiced, plus every unbilled extra round. */
  function draftFor(db, projectId, now) {
    const at = now || new Date();
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const client = db.clients.find((c) => c.id === project.clientId) || null;

    const already = U.sum(
      db.invoices.filter((i) => i.projectId === projectId && i.status !== "void"),
      (i) => total(i)
    );
    const feeLeft = U.round2((Number(project.fee) || 0) - already);

    const lines = [];
    if (feeLeft > 0) {
      lines.push({ desc: `${project.name} — ${already > 0 ? "balance of fee" : "project fee"}`, amount: feeLeft });
    }
    for (const line of AE.margin.billableLines(db, projectId)) {
      lines.push({ desc: line.desc, amount: line.amount, revisionId: line.revisionId });
    }

    const terms = Number(client && client.paymentTermsDays) || 14;
    return {
      clientId: project.clientId,
      projectId,
      number: nextNumber(db, at),
      issuedAt: U.isoDay(at),
      dueAt: U.addDays(U.isoDay(at), terms),
      status: "draft",
      reminders: [],
      lines,
    };
  }

  /* The text of the chase. Firm, short, and carrying the facts it needs
     — which is all a late invoice usually wants. */
  function reminderDraft(db, invoiceId, now) {
    const inv = db.invoices.find((i) => i.id === invoiceId);
    if (!inv) return "";
    const s = stateOf(inv, db.settings, now || new Date());
    const client = db.clients.find((c) => c.id === inv.clientId);
    const cur = db.settings.currency;
    const first = !(inv.reminders || []).length;
    const opener = first
      ? `Quick note that invoice ${inv.number} (${U.money(s.amount, cur)}) fell due on ${U.fmtDay(inv.dueAt)}.`
      : `Following up again on invoice ${inv.number} (${U.money(s.amount, cur)}), now ${U.plural(s.daysLate, "day")} past its due date of ${U.fmtDay(inv.dueAt)}.`;
    return [
      `Hi ${(client && client.contact ? client.contact.split("@")[0] : "there")},`,
      "",
      opener,
      "",
      (inv.lines || []).map((l) => `· ${l.desc} — ${U.money(l.amount, cur)}`).join("\n"),
      "",
      first
        ? "If it's already gone through, ignore this. If something is holding it up, tell me what and I'll sort it."
        : "Can you confirm a payment date, or tell me who to talk to about it?",
      "",
      "Thanks,",
      db.settings.operator || db.settings.businessName,
    ].join("\n");
  }

  AE.money = { total, stateOf, totals, needsChasing, aging, nextNumber, draftFor, reminderDraft };
})(window.AE = window.AE || {});
