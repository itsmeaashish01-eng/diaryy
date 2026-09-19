/* ================================================
   THE AI EMPLOYEE — qa.js
   Job 3 of nine: the QA pass before anything ships.

   The checklist is not a generic one. It is built from the client file —
   their rules, their limits — plus the promises made to them that are
   still open, plus the few checks that apply to any delivery. A pass
   goes stale the moment a new revision lands, because it was a pass on
   work that has since changed.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;

  /* The checks that apply whatever the job is. */
  const STANDARD = [
    { key: "brief", label: "Delivery matches what the brief actually asked for" },
    { key: "links", label: "Links, spelling and numbers checked on the final copy" },
    { key: "files", label: "Files named and in the agreed format" },
    { key: "money", label: "Fee and revision rounds reconciled before it goes out" },
  ];

  /* Build the list for one project. Every check carries where it came
     from, so a failure points at the rule it broke rather than at a
     checkbox. */
  function checklistFor(db, projectId) {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) return [];
    const client = db.clients.find((c) => c.id === project.clientId) || null;
    const checks = [];

    for (const rule of (client && client.rules) || []) {
      checks.push({ key: "rule:" + rule.slice(0, 40), label: rule, source: "client rule" });
    }

    const openPromises = db.promises.filter(
      (p) => !p.kept && (p.projectId === projectId || (!p.projectId && client && p.clientId === client.id))
    );
    for (const promise of openPromises) {
      checks.push({
        key: "promise:" + promise.id,
        label: promise.text,
        source: `promised on a ${promise.source || "call"}`,
      });
    }

    const m = AE.margin.state(db, projectId);
    if (m.unbilled.length) {
      checks.push({
        key: "overage",
        label: `${U.plural(m.unbilled.length, "extra revision round")} unbilled — bill it or log it as goodwill`,
        source: "revision log",
      });
    }

    for (const std of STANDARD) checks.push(Object.assign({ source: "standard" }, std));
    return checks;
  }

  function latestRun(db, projectId) {
    const runs = db.qaRuns.filter((r) => r.projectId === projectId);
    if (!runs.length) return null;
    return runs.reduce((newest, r) => (new Date(r.at) > new Date(newest.at) ? r : newest));
  }

  /* A pass taken before the latest revision was requested is a pass on
     older work. The app treats that as no pass at all. */
  function isStale(db, projectId, run) {
    const last = run || latestRun(db, projectId);
    if (!last) return false;
    const revs = db.revisions.filter((r) => r.projectId === projectId);
    const newestRev = revs.reduce((max, r) => {
      const t = new Date(U.dayDate(r.requestedAt) || r.requestedAt).getTime();
      return t > max ? t : max;
    }, 0);
    return newestRev > new Date(last.at).getTime();
  }

  function status(db, projectId) {
    const run = latestRun(db, projectId);
    const checks = checklistFor(db, projectId);
    if (!run) {
      return { run: null, checks, passed: false, stale: false, failed: [], ranAt: null,
               label: "Not checked" };
    }
    const byKey = new Map((run.checks || []).map((c) => [c.key, c]));
    const failed = checks.filter((c) => !(byKey.get(c.key) || {}).pass);
    const stale = isStale(db, projectId, run);
    const passed = failed.length === 0 && !stale;
    return {
      run, checks, failed, stale, passed, ranAt: run.at,
      label: passed ? "Passed" : stale ? "Stale — work changed since" : `${failed.length} open`,
    };
  }

  /* Record a pass attempt. `results` is { checkKey: boolean }. */
  function record(db, projectId, results, now) {
    const checks = checklistFor(db, projectId).map((c) => ({
      key: c.key, label: c.label, source: c.source, pass: !!results[c.key],
    }));
    return {
      id: U.uid("qa"),
      projectId,
      at: (now || new Date()).toISOString(),
      checks,
      passed: checks.every((c) => c.pass),
    };
  }

  /* The gate in front of "delivered". */
  function canShip(db, projectId) {
    const s = status(db, projectId);
    if (!db.settings.qaBlocksDelivery) {
      return { ok: true, reasons: [], qa: s, forced: !s.passed };
    }
    const reasons = [];
    if (!s.run) reasons.push("No QA pass has been run on this project");
    else if (s.stale) reasons.push("The QA pass predates the latest revision");
    for (const check of s.failed) reasons.push(check.label);
    return { ok: reasons.length === 0, reasons, qa: s, forced: false };
  }

  AE.qa = { STANDARD, checklistFor, latestRun, isStale, status, record, canShip };
})(window.AE = window.AE || {});
