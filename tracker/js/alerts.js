/* ================================================
   PRICE WATCH — alerts.js
   Rule definitions and evaluation.

   A rule fires against a fresh reading + the summary stats. Each rule type
   has its own cooldown bucket so a chatty "dropped 5%" rule can't drown out
   a once-in-a-month "all-time low".
   ================================================ */
(function (PT) {
  "use strict";
  const { uid, fmtMoney, MIN } = PT.util;

  /* type -> { label, needsValue, unit, help, test(ctx) }
     test() returns a message string when it fires, or null. */
  const RULES = {
    below: {
      label: "Price drops to or below",
      needsValue: true,
      unit: "amount",
      help: "Your target price. The classic “tell me when it's cheap enough”.",
      severity: "good",
      test: ({ price, value, w }) =>
        price <= value
          ? `${fmtMoney(price, w.currency)} — at or below your ${fmtMoney(value, w.currency)} target`
          : null,
    },
    above: {
      label: "Price rises to or above",
      needsValue: true,
      unit: "amount",
      help: "For things you hold and want to sell into strength, or a stop-watch on a rising fare.",
      severity: "good",
      test: ({ price, value, w }) =>
        price >= value
          ? `${fmtMoney(price, w.currency)} — at or above your ${fmtMoney(value, w.currency)} target`
          : null,
    },
    dropPct: {
      label: "Falls % below its recent average",
      needsValue: true,
      unit: "%",
      help: "Catches a genuine dip even when you never set an exact target.",
      severity: "good",
      test: ({ price, value, s, w }) => {
        const base = s.avg7 || s.avg30 || s.prev;
        if (!base) return null;
        const dropPct = ((base - price) / base) * 100;
        return dropPct >= value
          ? `Down ${dropPct.toFixed(1)}% vs its recent average — now ${fmtMoney(price, w.currency)}`
          : null;
      },
    },
    risePct: {
      label: "Rises % above its recent average",
      needsValue: true,
      unit: "%",
      help: "The mirror image — useful on a position you're holding.",
      severity: "warning",
      test: ({ price, value, s, w }) => {
        const base = s.avg7 || s.avg30 || s.prev;
        if (!base) return null;
        const risePct = ((price - base) / base) * 100;
        return risePct >= value
          ? `Up ${risePct.toFixed(1)}% vs its recent average — now ${fmtMoney(price, w.currency)}`
          : null;
      },
    },
    allTimeLow: {
      label: "Hits a new all-time low",
      needsValue: false,
      help: "Fires only when today beats every reading you've recorded.",
      severity: "good",
      test: ({ s, price, w }) =>
        s.isAllTimeLow && s.n >= 5
          ? `New low: ${fmtMoney(price, w.currency)} — cheapest in ${Math.max(1, Math.round(s.trackedDays))} days of tracking`
          : null,
    },
    allTimeHigh: {
      label: "Hits a new all-time high",
      needsValue: false,
      help: "The mirror image, for positions you hold.",
      severity: "warning",
      test: ({ s, price, w }) =>
        s.isAllTimeHigh && s.n >= 5
          ? `New high: ${fmtMoney(price, w.currency)}`
          : null,
    },
    signal: {
      label: "Buy signal reaches “Book now”",
      needsValue: false,
      help: "Uses the combined score — cheapness, your target, the trend and how near the date is.",
      severity: "good",
      test: ({ v, price, w }) =>
        v && v.verdict && v.verdict.key === "act"
          ? `Signal says book — ${fmtMoney(price, w.currency)} (score ${v.score}/100)`
          : null,
    },
    deadline: {
      label: "Days before the travel date",
      needsValue: true,
      unit: "days",
      help: "A nudge to decide, whatever the price is doing.",
      severity: "warning",
      test: ({ s, value, price, w }) =>
        s.daysToDeadline != null && s.daysToDeadline >= 0 && s.daysToDeadline <= value
          ? `${s.daysToDeadline} day${s.daysToDeadline === 1 ? "" : "s"} to go — currently ${fmtMoney(price, w.currency)}`
          : null,
    },
  };

  function defaultRulesFor(kind) {
    const travel = PT.store.KINDS[kind] && PT.store.KINDS[kind].travel;
    return travel
      ? [{ id: uid(), type: "allTimeLow" }, { id: uid(), type: "dropPct", value: 8 }]
      : [{ id: uid(), type: "dropPct", value: 5 }];
  }

  /* Evaluate every rule on a watch. Returns alerts that are both TRUE and
     out of cooldown; the caller decides what to do with them. */
  function evaluate(watch, price, s, v) {
    const fired = [];
    const now = Date.now();
    const cooldownMs = Math.max(0, watch.cooldownMin || 0) * MIN;

    (watch.rules || []).forEach((rule) => {
      const def = RULES[rule.type];
      if (!def) return;
      const value = Number(rule.value);
      if (def.needsValue && !Number.isFinite(value)) return;

      let msg = null;
      try {
        msg = def.test({ price, value, s, v, w: watch });
      } catch (e) {
        console.warn("Rule threw", rule.type, e);
      }
      if (!msg) return;

      const last = (watch.lastAlertAt || {})[rule.type] || 0;
      if (now - last < cooldownMs) return;

      fired.push({
        id: uid(),
        watchId: watch.id,
        watchLabel: watch.label,
        kind: watch.kind,
        ruleType: rule.type,
        ruleLabel: def.label,
        severity: def.severity || "good",
        message: msg,
        price,
        currency: watch.currency,
        t: now,
        read: false,
      });
    });
    return fired;
  }

  PT.alerts = { RULES, evaluate, defaultRulesFor };
})(window.PT);
