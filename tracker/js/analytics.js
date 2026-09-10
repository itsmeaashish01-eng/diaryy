/* ================================================
   PRICE WATCH — analytics.js
   Turns a price history into (a) descriptive statistics and (b) a verdict.

   The verdict is deliberately explainable: every point of the score comes
   from a named component, and the UI shows the reasons rather than just a
   number. No black box.
   ================================================ */
(function (PT) {
  "use strict";
  const { DAY, clamp, daysUntil } = PT.util;

  const pricesSince = (h, ms) => {
    const cut = Date.now() - ms;
    return h.filter((pt) => pt.t >= cut).map((pt) => pt.p);
  };

  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }

  function stdev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  }

  function median(a) {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* What fraction of past prices were BELOW this one.
     0 = the cheapest reading ever seen, 100 = the most expensive. */
  function percentileRank(values, v) {
    if (!values.length) return null;
    const below = values.filter((x) => x < v).length;
    const equal = values.filter((x) => x === v).length;
    return ((below + equal / 2) / values.length) * 100;
  }

  /* A daily rate extrapolated from a few minutes of readings is nonsense:
     divide a price change by a near-zero time span and you get millions of
     percent. Below this span there is no trend to report. */
  const MIN_TREND_SPAN_DAYS = 0.25;   // six hours

  /* Least-squares slope in price-units per day, over the last `days`.
     Positive = getting more expensive. Null when there isn't enough
     elapsed time to say. */
  function trendPerDay(history, days) {
    const cut = Date.now() - days * DAY;
    const pts = history.filter((p) => p.t >= cut);
    if (pts.length < 3) return null;
    const spanDays = (pts[pts.length - 1].t - pts[0].t) / DAY;
    if (spanDays < MIN_TREND_SPAN_DAYS) return null;
    const t0 = pts[0].t;
    const xs = pts.map((p) => (p.t - t0) / DAY);
    const ys = pts.map((p) => p.p);
    const mx = mean(xs), my = mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    if (den === 0) return null;
    return num / den;
  }

  /* How many consecutive readings, counting back from the latest,
     moved in the same direction. "Falling 4 checks in a row." */
  function streak(history) {
    if (history.length < 2) return { dir: 0, n: 0 };
    let dir = 0, n = 0;
    for (let i = history.length - 1; i > 0; i--) {
      const d = Math.sign(history[i].p - history[i - 1].p);
      if (d === 0) break;
      if (dir === 0) { dir = d; n = 1; }
      else if (d === dir) n++;
      else break;
    }
    return { dir, n };
  }

  function summarize(watch) {
    const h = watch.history || [];
    const values = h.map((p) => p.p);
    const latest = values.length ? values[values.length - 1] : null;
    const prev = values.length > 1 ? values[values.length - 2] : null;

    const min = values.length ? Math.min(...values) : null;
    const max = values.length ? Math.max(...values) : null;
    const firstT = h.length ? h[0].t : null;

    const w7 = pricesSince(h, 7 * DAY);
    const w30 = pricesSince(h, 30 * DAY);

    const s = {
      n: values.length,
      latest,
      prev,
      min,
      max,
      mean: mean(values),
      median: median(values),
      sd: stdev(values),
      low7: w7.length ? Math.min(...w7) : null,
      low30: w30.length ? Math.min(...w30) : null,
      avg7: mean(w7),
      avg30: mean(w30),
      pctRank: latest != null ? percentileRank(values, latest) : null,
      trackedDays: firstT ? Math.max(0, (Date.now() - firstT) / DAY) : 0,
      slope7: trendPerDay(h, 7),
      streak: streak(h),
      changeAbs: latest != null && prev != null ? latest - prev : null,
      changePct: latest != null && prev != null && prev !== 0
        ? ((latest - prev) / prev) * 100 : null,
      // Is this the lowest we've ever recorded? (ties count)
      isAllTimeLow: latest != null && min != null && latest <= min + 1e-9,
      isAllTimeHigh: latest != null && max != null && latest >= max - 1e-9,
      vsAvg30Pct: null,
      daysToDeadline: daysUntil(watch.trip && watch.trip.depart),
    };

    if (s.latest != null && s.avg30) {
      s.vsAvg30Pct = ((s.latest - s.avg30) / s.avg30) * 100;
    }

    // Portfolio maths, when the watch carries a position.
    if (watch.position && watch.position.qty) {
      const qty = Number(watch.position.qty) || 0;
      const cost = Number(watch.position.cost) || 0;
      s.position = {
        qty,
        cost,
        bookCost: qty * cost,
        value: s.latest != null ? qty * s.latest : null,
        plAbs: s.latest != null ? qty * (s.latest - cost) : null,
        plPct: s.latest != null && cost ? ((s.latest - cost) / cost) * 100 : null,
      };
    }
    return s;
  }

  /* ---- The verdict ----------------------------------------------------
     Score is 0–100, where 100 means "act now". Components are weighted and
     each one contributes a plain-English reason. For a "down" watch (you
     want it cheap) the components are:

       cheapness  how low today sits within everything we've seen
       target     how close it is to the price you said you'd accept
       trend      falling prices argue for waiting; rising argue for acting
       urgency    for travel, how close the departure date is

     For an "up" watch (you're holding it and want a high price) cheapness
     and trend simply invert.
  --------------------------------------------------------------------- */
  const VERDICTS = {
    act:   { key: "act",   label: "Book now",  short: "BOOK",  icon: "●", status: "good" },
    good:  { key: "good",  label: "Good price", short: "GOOD", icon: "◆", status: "good" },
    hold:  { key: "hold",  label: "Holding",   short: "HOLD",  icon: "■", status: "warning" },
    wait:  { key: "wait",  label: "Wait",      short: "WAIT",  icon: "▼", status: "serious" },
    none:  { key: "none",  label: "Gathering prices", short: "—", icon: "○", status: "neutral" },
  };

  /* Below this, there is genuinely nothing to say. Most of the score is
     "how does today compare with the past" — and with one reading, that
     reading is both the highest and the lowest ever seen. */
  const MIN_READINGS = 3;

  function verdict(watch, s) {
    const reasons = [];
    if (s.n < MIN_READINGS || s.latest == null) {
      const short = MIN_READINGS - s.n;
      return {
        score: null,
        n: s.n,
        needed: MIN_READINGS,
        verdict: VERDICTS.none,
        reasons: [
          s.n === 0
            ? "No prices recorded yet."
            : `${s.n} price${s.n === 1 ? "" : "s"} recorded. A verdict needs ${MIN_READINGS}, so ${short} more to go.`,
          "The signal is mostly about how today compares with the past, and there isn't a past yet.",
        ],
      };
    }

    const up = watch.direction === "up";
    const parts = [];

    // --- cheapness: percentile of today's price within all history
    const rank = s.pctRank == null ? 50 : s.pctRank;
    const cheapness = up ? rank : 100 - rank;
    parts.push({ w: 0.40, v: cheapness });
    if (!up) {
      if (s.isAllTimeLow && s.n >= 5) {
        reasons.push(`Lowest price since tracking began${s.trackedDays >= 1 ? ` (${PT.util.plural(Math.round(s.trackedDays), "day")})` : ""}.`);
      } else if (rank <= 20) {
        reasons.push(`Cheaper than ${Math.round(100 - rank)}% of readings so far.`);
      } else if (rank >= 80) {
        reasons.push(`More expensive than ${Math.round(rank)}% of readings so far.`);
      }
      if (s.vsAvg30Pct != null && Math.abs(s.vsAvg30Pct) >= 4) {
        reasons.push(
          `${Math.abs(s.vsAvg30Pct).toFixed(0)}% ${s.vsAvg30Pct < 0 ? "below" : "above"} the 30-day average.`
        );
      }
    } else {
      if (s.isAllTimeHigh && s.n >= 5) reasons.push("Highest price since tracking began.");
      if (s.vsAvg30Pct != null && Math.abs(s.vsAvg30Pct) >= 4) {
        reasons.push(
          `${Math.abs(s.vsAvg30Pct).toFixed(0)}% ${s.vsAvg30Pct > 0 ? "above" : "below"} the 30-day average.`
        );
      }
    }

    // --- target proximity
    const targetRule = (watch.rules || []).find(
      (r) => r.type === (up ? "above" : "below")
    );
    if (targetRule && Number.isFinite(Number(targetRule.value)) && Number(targetRule.value) > 0) {
      const target = Number(targetRule.value);
      const hit = up ? s.latest >= target : s.latest <= target;
      let tScore;
      if (hit) {
        tScore = 100;
        reasons.push(`At or past your target of ${PT.util.fmtMoney(target, watch.currency)}.`);
      } else {
        // Fade from 100 at target to 0 at 25% away from it.
        const gap = Math.abs(s.latest - target) / target;
        tScore = clamp(100 - (gap / 0.25) * 100, 0, 100);
        reasons.push(
          `${(gap * 100).toFixed(0)}% ${up ? "below" : "above"} your target of ${PT.util.fmtMoney(target, watch.currency)}.`
        );
      }
      parts.push({ w: 0.20, v: tScore });
    }

    // --- trend: is it moving your way?
    if (s.slope7 != null && s.latest) {
      const perDayPct = (s.slope7 / s.latest) * 100;
      // Rising while you want it cheap = act sooner. Falling = you can wait.
      const signed = up ? -perDayPct : perDayPct;
      const tScore = clamp(50 + signed * 25, 0, 100);
      parts.push({ w: 0.15, v: tScore });
      if (Math.abs(perDayPct) >= 0.4) {
        reasons.push(
          `${perDayPct > 0 ? "Rising" : "Falling"} about ${Math.abs(perDayPct).toFixed(1)}% a day over the last week.`
        );
      }
    }
    if (s.streak.n >= 3) {
      reasons.push(
        `${s.streak.dir < 0 ? "Down" : "Up"} ${s.streak.n} checks in a row.`
      );
    }

    // --- urgency: travel fares climb into the departure date
    const left = s.daysToDeadline;
    if (left != null) {
      let uScore;
      if (left < 0) uScore = 0;
      else if (left <= 3) uScore = 100;
      else if (left <= 7) uScore = 88;
      else if (left <= 14) uScore = 70;
      else if (left <= 21) uScore = 55;
      else if (left <= 45) uScore = 35;
      else uScore = 18;
      parts.push({ w: 0.25, v: uScore });
      if (left < 0) reasons.push("The date has passed.");
      else if (left <= 21) {
        reasons.push(
          `Departs in ${left} day${left === 1 ? "" : "s"} — fares usually climb from here.`
        );
      }
    }

    const totalW = parts.reduce((sum, p) => sum + p.w, 0);
    const score = Math.round(parts.reduce((sum, p) => sum + p.w * p.v, 0) / totalW);

    let v;
    if (score >= 78) v = VERDICTS.act;
    else if (score >= 60) v = VERDICTS.good;
    else if (score >= 40) v = VERDICTS.hold;
    else v = VERDICTS.wait;

    // Confidence caveat — a strong verdict off five readings isn't strong.
    if (s.n < 8) {
      reasons.push(`Based on only ${PT.util.plural(s.n, "reading")} — the signal firms up with more history.`);
    }

    return { score, verdict: v, reasons };
  }

  PT.analytics = {
    summarize, verdict, percentileRank, trendPerDay, mean, median, stdev,
    VERDICTS, MIN_READINGS, MIN_TREND_SPAN_DAYS,
  };
})(window.PT);
