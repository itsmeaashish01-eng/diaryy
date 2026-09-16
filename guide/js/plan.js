/* ================================================
   ROAMGUIDE — plan.js
   Turns a list of stops into an actual day: what time you arrive, how
   you get between them, and where the plan quietly falls apart.

   The warnings are the point. Anyone can list four temples; the useful
   part is noticing that the fourth one shuts at five and you'll reach
   it at ten past.
   ================================================ */
(function (RG) {
  "use strict";
  const U = RG.util;
  const geo = RG.geo;

  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /* What a place's hours mean on a given weekday.
     `weekday` null means "no date set yet" — then we can't judge, and
     saying nothing beats inventing a closure. */
  function hoursFor(place, weekday) {
    if (!place || !Array.isArray(place.hours)) {
      return { known: false, closed: false, open: null, close: null, text: "Hours unknown" };
    }
    if (weekday == null) {
      return { known: false, closed: false, open: null, close: null, text: "Set a date to check hours" };
    }
    const raw = place.hours[weekday];
    if (!raw) {
      return { known: true, closed: true, open: null, close: null, text: `Closed ${WEEKDAYS[weekday]}s` };
    }
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(String(raw).trim());
    if (!m) {
      return { known: false, closed: false, open: null, close: null, text: String(raw) };
    }
    const open = U.toMinutes(m[1]);
    let close = U.toMinutes(m[2]);
    if (open == null || close == null) {
      return { known: false, closed: false, open: null, close: null, text: String(raw) };
    }
    // A place open "20:00-02:00" closes tomorrow, not fourteen hours ago.
    if (close <= open) close += 1440;
    const allDay = open === 0 && close >= 1439;
    return {
      known: true, closed: false, open, close, allDay,
      text: allDay ? "Open any time" : `${U.fromMinutes(open)} – ${U.fromMinutes(close)}`,
    };
  }

  /* How long you'd actually spend at a place, at this pace. */
  function dwellFor(place, opts) {
    const base = Number(place && place.min) || 60;
    const f = (opts && opts.paceFactor) || 1;
    return Math.max(15, Math.round((base * f) / 5) * 5);
  }

  /* ---------------------------------------------------------------
     Build one day

       day   { date, startMin, stops:[{ id, placeId, at, done, note }] }
       ctx   { place(id), opts, }

     Returns blocks in order — travel, wait and stop — plus the totals
     and every warning raised along the way.
     --------------------------------------------------------------- */
  function buildDay(day, ctx) {
    const opts = (ctx && ctx.opts) || {};
    const resolve = (ctx && ctx.place) || (() => null);
    const weekday = U.weekdayOf(day && day.date);

    const blocks = [];
    const warnings = [];
    let cursor = day && day.startMin != null ? day.startMin : (opts.dayStart == null ? 540 : opts.dayStart);
    const startedAt = cursor;

    let travelMin = 0, dwellMin = 0, km = 0, cost = 0;
    let prev = null;

    (day && day.stops ? day.stops : []).forEach((stop, i) => {
      const place = resolve(stop.placeId);
      if (!place) {
        // A stop whose place is gone still has to be visible, or it can
        // never be deleted.
        blocks.push({ type: "stop", stop, place: null, missing: true, warnings: [] });
        return;
      }

      // ---- getting there ----
      if (prev) {
        const l = geo.leg(prev, place, opts);
        if (l.minutes > 0 || l.km) {
          blocks.push({ type: "travel", from: prev, to: place, mode: l.mode, km: l.km,
                        minutes: l.minutes, startMin: cursor });
          cursor += l.minutes;
          travelMin += l.minutes;
          km += l.km || 0;
        }
      }

      const dwell = dwellFor(place, opts);
      const h = hoursFor(place, weekday);
      const stopWarnings = [];

      // ---- a time you've pinned yourself (a ticket, a booking) ----
      if (stop.at != null) {
        if (cursor > stop.at) {
          stopWarnings.push({
            level: "serious",
            text: `You'd arrive ${U.fmtDuration(cursor - stop.at)} after the ${U.fromMinutes(stop.at)} you pinned.`,
          });
        } else if (stop.at > cursor) {
          blocks.push({ type: "wait", minutes: stop.at - cursor, startMin: cursor, reason: "pinned" });
        }
        cursor = Math.max(cursor, stop.at);
      }

      // ---- opening hours ----
      if (h.closed) {
        stopWarnings.push({ level: "critical", text: h.text + " — this stop won't happen." });
      } else if (h.known && !h.allDay) {
        if (cursor < h.open) {
          const wait = h.open - cursor;
          blocks.push({ type: "wait", minutes: wait, startMin: cursor, reason: "opens" });
          cursor = h.open;
          if (wait > 30) {
            stopWarnings.push({
              level: "warning",
              text: `Doesn't open until ${U.fromMinutes(h.open)} — ${U.fmtDuration(wait)} to fill.`,
            });
          }
        }
        if (cursor >= h.close) {
          stopWarnings.push({
            level: "critical",
            text: `Closes at ${U.fromMinutes(h.close)}; you'd get there at ${U.fromMinutes(cursor)}.`,
          });
        } else if (cursor + dwell > h.close) {
          stopWarnings.push({
            level: "serious",
            text: `Only ${U.fmtDuration(h.close - cursor)} before it closes — you wanted ${U.fmtDuration(dwell)}.`,
          });
        }
      }

      blocks.push({
        type: "stop", stop, place, startMin: cursor, endMin: cursor + dwell,
        dwell, hours: h, index: i, warnings: stopWarnings,
      });

      stopWarnings.forEach((w) => warnings.push(Object.assign({ place: place.name }, w)));

      cursor += dwell;
      dwellMin += dwell;
      if (place.price && Number.isFinite(place.price.amount)) cost += place.price.amount;
      prev = place;
    });

    const dayEnd = opts.dayEnd == null ? 1260 : opts.dayEnd;
    if (cursor > dayEnd && blocks.length) {
      warnings.push({
        level: "warning",
        text: `The day runs to ${U.fromMinutes(cursor)}, past the ${U.fromMinutes(dayEnd)} you set.`,
      });
    }

    return {
      blocks, warnings, weekday,
      startMin: startedAt, endMin: cursor,
      travelMin, dwellMin, km, cost,
      totalMin: cursor - startedAt,
    };
  }

  /* Reorder a day's stops to cut down the walking.

     Stops with a pinned time stay put — they're the fixed points the rest
     of the day has to work around — and everything else is threaded
     between them by shortest path. */
  function tidyOrder(day, ctx) {
    const resolve = (ctx && ctx.place) || (() => null);
    const stops = (day && day.stops ? day.stops : []).slice();
    if (stops.length < 3) return stops.map((s) => s.id);

    const pinnedAt = new Map();
    stops.forEach((s, i) => { if (s.at != null) pinnedAt.set(i, s); });

    const movable = stops.filter((s) => s.at == null);
    const points = movable
      .map((s) => Object.assign({ __stopId: s.id }, resolve(s.placeId)))
      .filter((p) => p.lat != null);

    // Nothing with coordinates to sort by — leave the order alone.
    if (points.length < 3) return stops.map((s) => s.id);

    const ordered = geo.optimiseOrder(points, { fixedFirst: true });
    const queue = ordered.map((p) => p.__stopId);
    const noCoords = movable.filter((s) => !queue.includes(s.id)).map((s) => s.id);

    // Rebuild the day: pinned stops keep their slot, the tidied ones fill
    // the gaps in the new order.
    const out = [];
    let qi = 0;
    for (let i = 0; i < stops.length; i++) {
      if (pinnedAt.has(i)) out.push(pinnedAt.get(i).id);
      else if (qi < queue.length) out.push(queue[qi++]);
    }
    return out.concat(noCoords);
  }

  /* ---------------------------------------------------------------
     Suggest a day

     Given a city and the time you've got, put together something that
     holds up: open when you'd be there, close enough together to walk,
     and not a repeat of what you've already planned or seen.

     Greedy, by design. A traveller who asks for a suggestion wants a
     defensible starting point in an instant, and will move two things
     around anyway.
     --------------------------------------------------------------- */
  function suggestDay(city, cands, context) {
    const ctx = context || {};
    const opts = ctx.opts || {};
    const exclude = new Set(ctx.exclude || []);
    const weekday = ctx.weekday != null ? ctx.weekday : null;
    const start = opts.dayStart == null ? 540 : opts.dayStart;
    const end = opts.dayEnd == null ? 1260 : opts.dayEnd;
    const maxWait = opts.maxWaitMin == null ? 90 : opts.maxWaitMin;

    /* A day trip is a whole day by definition — pyramids an hour out of
       town can't share an afternoon with anything. Suggesting one would
       technically be a valid day and practically a bad one, so they're
       left for the traveller to plan deliberately. */
    const pool = cands.filter((p) => {
      if (exclude.has(p.id)) return false;
      if (p.lat == null) return false;
      if (!ctx.includeDayTrips && (p.tags || []).includes("day-trip")) return false;
      const h = hoursFor(p, weekday);
      return !h.closed;
    });
    if (!pool.length) return [];

    /* Seed with whatever wants the earliest start — a place that opens at
       six and empties by nine decides the shape of the morning. Failing
       that, the biggest single draw. */
    const score = (p) => {
      let s = (p.tags || []).includes("must-see") ? 3 : 0;
      s += (p.tags || []).includes("iconic") ? 2 : 0;
      s += (p.tags || []).includes("early") ? 1 : 0;
      return s;
    };
    const sorted = pool.slice().sort((a, b) => {
      const ha = hoursFor(a, weekday), hb = hoursFor(b, weekday);
      const oa = ha.open == null ? 1440 : ha.open, ob = hb.open == null ? 1440 : hb.open;
      const earlyA = (a.tags || []).includes("early") ? oa : 1440;
      const earlyB = (b.tags || []).includes("early") ? ob : 1440;
      if (earlyA !== earlyB) return earlyA - earlyB;
      return score(b) - score(a);
    });

    const picked = [sorted[0]];
    let cursor = start;
    {
      const h = hoursFor(sorted[0], weekday);
      if (h.open != null && cursor < h.open) cursor = h.open;
      cursor += dwellFor(sorted[0], opts);
    }

    const remaining = sorted.slice(1);
    while (remaining.length) {
      const from = picked[picked.length - 1];

      /* Nearest first, but only among those that are actually open when
         you'd arrive and can be finished before they shut — a near miss
         that's closed is no candidate at all. */
      let best = null, bestCost = Infinity;
      remaining.forEach((p, i) => {
        const l = geo.leg(from, p, opts);
        let arrive = cursor + l.minutes;
        const h = hoursFor(p, weekday);
        let wait = 0;
        if (h.open != null && arrive < h.open) { wait = h.open - arrive; arrive = h.open; }
        const dwell = dwellFor(p, opts);
        if (h.close != null && arrive + dwell > h.close) return;
        if (arrive + dwell > end) return;
        // A dinner street that opens at five is a fine plan at four and a
        // terrible one at noon. Better to hand back a shorter day than one
        // with five hours of nothing in the middle of it.
        if (wait > maxWait) return;

        // Distance is the cost; a strong draw earns a discount, so the
        // planner will cross town for the one thing worth crossing for.
        const c = l.minutes + wait * 0.5 - score(p) * 8;
        if (c < bestCost) { bestCost = c; best = { i, p, arrive, dwell }; }
      });

      if (!best) break;
      picked.push(best.p);
      cursor = best.arrive + best.dwell;
      remaining.splice(best.i, 1);
      if (picked.length >= 6) break;   // a day, not a forced march
    }

    return picked;
  }

  /* A plain-text day, for pasting into the diary or a message home. */
  function toText(dayPlan, day, opts) {
    const lines = [];
    const head = day && day.date ? U.fmtDayLabel(day.date) : "Day plan";
    lines.push(head);
    lines.push("—".repeat(Math.max(8, head.length)));
    dayPlan.blocks.forEach((b) => {
      if (b.type === "travel") {
        const how = b.mode === "walk" ? "walk" : "transit";
        lines.push(`   ↓ ${U.fmtDuration(b.minutes)} ${how} · ${U.fmtDistance(b.km, opts && opts.units)}`);
      } else if (b.type === "wait") {
        lines.push(`   ↓ ${U.fmtDuration(b.minutes)} spare`);
      } else if (b.place) {
        lines.push(`${U.fromMinutes(b.startMin)}  ${b.place.name} (${U.fmtDuration(b.dwell)})`);
        if (b.stop && b.stop.note) lines.push(`        ${b.stop.note}`);
        b.warnings.forEach((w) => lines.push(`        ! ${w.text}`));
      }
    });
    if (dayPlan.blocks.length) {
      lines.push("");
      lines.push(
        `Ends ${U.fromMinutes(dayPlan.endMin)} · ` +
        `${U.fmtDuration(dayPlan.travelMin)} travelling · ` +
        `${U.fmtDistance(dayPlan.km, opts && opts.units)} covered`
      );
    }
    return lines.join("\n");
  }

  RG.plan = { WEEKDAYS, hoursFor, dwellFor, buildDay, tidyOrder, suggestDay, toText };
})(window.RG);
