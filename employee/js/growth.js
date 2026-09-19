/* ================================================
   THE AI EMPLOYEE — growth.js
   Job 9 of nine: new clients, new opportunities.

   Proposals rarely die of a no. They die on the second touch, when the
   person who sent them got busy. This module counts touches and says
   which conversations have gone quiet.
   ================================================ */
(function (AE) {
  "use strict";
  const U = AE.util;

  const STAGES = [
    { key: "new", label: "New", odds: 0.1 },
    { key: "proposal", label: "Proposal out", odds: 0.3 },
    { key: "negotiation", label: "Negotiating", odds: 0.6 },
    { key: "won", label: "Won", odds: 1 },
    { key: "lost", label: "Lost", odds: 0 },
  ];
  const ODDS = new Map(STAGES.map((s) => [s.key, s.odds]));

  function isOpen(lead) {
    return lead && lead.stage !== "won" && lead.stage !== "lost";
  }

  function touches(lead) {
    return ((lead && lead.touches) || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  function lastTouch(lead) {
    const list = touches(lead);
    return list.length ? list[list.length - 1] : null;
  }

  function daysSinceTouch(lead, now) {
    const last = lastTouch(lead);
    return last ? U.daysBetween(last.at, now || new Date()) : null;
  }

  /* Why this one needs attention, in the order the answers matter. */
  function healthOf(lead, settings, now) {
    const at = now || new Date();
    const cfg = settings || {};
    const gap = Number(cfg.followUpDays) || 4;
    const wanted = Number(cfg.touchesToClose) || 3;
    const count = touches(lead).length;
    const since = daysSinceTouch(lead, at);
    const open = isOpen(lead);

    const out = {
      open, count, daysSince: since,
      stalled: false, dueTouch: false, reason: "", severity: "ok",
      weighted: U.round2((Number(lead.value) || 0) * (ODDS.get(lead.stage) || 0)),
    };
    if (!open) {
      out.reason = lead.stage === "won" ? "Won" : "Closed out";
      return out;
    }
    if (lead.nextTouchAt && U.daysUntil(lead.nextTouchAt, at) <= 0) {
      out.dueTouch = true;
      out.reason = `Follow-up was set for ${U.relDay(lead.nextTouchAt, at)}`;
      out.severity = U.daysUntil(lead.nextTouchAt, at) < 0 ? "warn" : "due";
    }
    if (since == null) {
      out.stalled = true;
      out.severity = "warn";
      out.reason = "Never contacted";
    } else if (since >= gap && count < wanted) {
      out.stalled = true;
      out.severity = "warn";
      /* The specific failure the whole pipeline dies of. */
      out.reason = `${U.plural(count, "touch", "touches")} and quiet for ${U.plural(since, "day")} — needs touch ${count + 1}`;
    } else if (since >= gap * 3) {
      out.stalled = true;
      out.severity = "warn";
      out.reason = `No contact in ${U.plural(since, "day")}`;
    }
    return out;
  }

  function needsTouch(db, now) {
    const at = now || new Date();
    return db.leads
      .map((lead) => ({ lead, health: healthOf(lead, db.settings, at) }))
      .filter((row) => row.health.open && (row.health.stalled || row.health.dueTouch))
      .sort((a, b) => (b.health.daysSince || 999) - (a.health.daysSince || 999));
  }

  /* The pipeline as a number you can plan around: face value, and value
     discounted by the odds of each stage. */
  function pipeline(db, now) {
    const at = now || new Date();
    const byStage = {};
    for (const stage of STAGES) byStage[stage.key] = { count: 0, value: 0, leads: [] };
    let open = 0, openValue = 0, weighted = 0;

    for (const lead of db.leads) {
      const bucket = byStage[lead.stage] || byStage.new;
      const value = Number(lead.value) || 0;
      bucket.count += 1;
      bucket.value = U.round2(bucket.value + value);
      bucket.leads.push(lead);
      if (isOpen(lead)) {
        open += 1;
        openValue += value;
        weighted += value * (ODDS.get(lead.stage) || 0);
      }
    }
    const won = byStage.won.count;
    const decided = won + byStage.lost.count;
    return {
      byStage, open,
      openValue: U.round2(openValue),
      weighted: U.round2(weighted),
      winRate: decided ? Math.round((won / decided) * 100) : null,
      stalled: needsTouch(db, at).length,
    };
  }

  function nextTouchDraft(db, leadId, now) {
    const lead = db.leads.find((l) => l.id === leadId);
    if (!lead) return "";
    const list = touches(lead);
    const last = list.length ? list[list.length - 1] : null;
    const n = list.length + 1;
    const cur = db.settings.currency;
    const lines = [`Hi ${lead.name.split(" ")[0]},`, ""];

    if (n === 1) {
      lines.push(`Following up on ${lead.source || "our conversation"} — happy to put together what this would look like.`);
    } else if (n === 2) {
      lines.push(`Checking the proposal reached you${last ? ` after ${U.relDay(last.at, now)}` : ""}. Any questions on the scope or the number, I'd rather answer them than have you guess.`);
    } else {
      /* Touch three: the one that gets skipped. It asks for a decision
         either way, which is what unsticks it. */
      lines.push(`Last note from me on this one${lead.value ? ` (${U.money(lead.value, cur)})` : ""}.`);
      lines.push("");
      lines.push("If the timing is wrong, say so and I'll close the file and come back in a quarter. If it's still live, tell me what you need from me to get it moving.");
    }
    lines.push("", "Thanks,", db.settings.operator || db.settings.businessName);
    return lines.join("\n");
  }

  AE.growth = { STAGES, ODDS, isOpen, touches, lastTouch, daysSinceTouch, healthOf, needsTouch, pipeline, nextTouchDraft };
})(window.AE = window.AE || {});
