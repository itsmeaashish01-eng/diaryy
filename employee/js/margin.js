/* ================================================
   THE AI EMPLOYEE — margin.js
   Job 4 of nine: the revision log.

   Revisions are where a fixed fee quietly becomes an hourly rate nobody
   agreed to. This module keeps the count: which round a change is, which
   rounds the contract included, what the ones past that are worth, and
   how much of that has actually been put on an invoice.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;

  /* A round is billable when it sits past the client's included rounds
     — unless it was logged as goodwill, which is a decision to absorb it
     rather than an oversight. Both are recorded; only one is free. */
  function classify(revision, client) {
    if (!revision) return "included";
    if (revision.scope === "goodwill") return "goodwill";
    const included = Number(client && client.revisionsIncluded) || 0;
    return Number(revision.round) > included ? "extra" : "included";
  }

  function amountFor(revision, client) {
    if (classify(revision, client) !== "extra") return 0;
    const flat = Number(client && client.revisionRate) || 0;
    if (flat > 0) return U.round2(flat);
    /* No per-round price agreed, so fall back to time at the hourly
       rate — the number to argue from, not to send blind. */
    const hours = (Number(revision.minutes) || 0) / 60;
    return U.round2(hours * (Number(client && client.rate) || 0));
  }

  /* The whole picture for one project: rounds used against rounds sold,
     what the overage is worth, and what of it is still unbilled. */
  function state(db, projectId) {
    const project = db.projects.find((p) => p.id === projectId) || null;
    const client = project ? db.clients.find((c) => c.id === project.clientId) : null;
    const rounds = U.sortBy(db.revisions.filter((r) => r.projectId === projectId), (r) => Number(r.round));

    const included = Number(client && client.revisionsIncluded) || 0;
    const extra = [];
    const goodwill = [];
    for (const rev of rounds) {
      const kind = classify(rev, client);
      if (kind === "extra") extra.push(rev);
      else if (kind === "goodwill") goodwill.push(rev);
    }

    const unbilled = extra.filter((r) => !r.billed);
    const minutes = U.sum(rounds, (r) => Number(r.minutes) || 0);
    const extraMinutes = U.sum(extra.concat(goodwill), (r) => Number(r.minutes) || 0);

    const fee = Number(project && project.fee) || 0;
    const hours = minutes / 60;
    /* What the fee works out to per hour once the unpaid rounds are
       counted. This is the number that answers "why was that job bad?" */
    const effectiveRate = hours > 0 ? U.round2(fee / hours) : null;
    const agreedRate = Number(client && client.rate) || 0;

    return {
      project, client,
      rounds, used: rounds.length, included,
      remaining: Math.max(0, included - rounds.length),
      overRounds: Math.max(0, rounds.length - included),
      extra, goodwill, unbilled,
      minutes, extraMinutes,
      extraValue: U.sum(extra, (r) => amountFor(r, client)),
      unbilledValue: U.sum(unbilled, (r) => amountFor(r, client)),
      goodwillValue: U.sum(goodwill, (r) => {
        const flat = Number(client && client.revisionRate) || 0;
        return flat > 0 ? flat : ((Number(r.minutes) || 0) / 60) * agreedRate;
      }),
      fee, effectiveRate, agreedRate,
      /* Below the rate the client agreed to pay: the job is losing money
         against its own quote, and the log says by how much. */
      underwater: effectiveRate != null && agreedRate > 0 && effectiveRate < agreedRate,
    };
  }

  /* Next round number for a project — the log numbers itself so two
     changes on the same day can't both be "round 2". */
  function nextRound(db, projectId) {
    const rounds = db.revisions.filter((r) => r.projectId === projectId);
    return rounds.reduce((max, r) => Math.max(max, Number(r.round) || 0), 0) + 1;
  }

  /* Every project carrying unbilled overage, worst first. The briefing
     and the invoicing screen both start here. */
  function unbilledAcross(db) {
    const out = [];
    for (const project of db.projects) {
      const s = state(db, project.id);
      if (s.unbilled.length) out.push(s);
    }
    return out.sort((a, b) => b.unbilledValue - a.unbilledValue);
  }

  /* Turn the unbilled rounds into invoice lines. Nothing is sent from
     here — it hands the invoicing job something already reconciled. */
  function billableLines(db, projectId) {
    const s = state(db, projectId);
    return s.unbilled.map((rev) => ({
      revisionId: rev.id,
      desc: `Revision round ${rev.round} — ${U.clip(rev.summary || "additional changes", 60)}`,
      amount: amountFor(rev, s.client),
    }));
  }

  AE.margin = { classify, amountFor, state, nextRound, unbilledAcross, billableLines };
})(window.AE = window.AE || {});
