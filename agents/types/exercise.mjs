/* ================================================
   AGENTS — types/exercise.mjs
   Training, counted honestly.

   It reports on the week rather than the day, because a day means
   nothing and a week is the smallest unit where "am I actually doing
   this?" has an answer. Rest is not failure, so a gap only gets
   mentioned once it's longer than the rest you said you take.

   config:
     file         default agents/data/exercise.json
     weeklyTarget sessions a week you're aiming for (4)
     restDayMax   days off before it says something (3)

   The file:
     {
       "sessions": [
         { "date": "2026-09-08", "kind": "run", "minutes": 42,
           "distanceKm": 8.1, "rpe": 6, "note": "easy" }
       ]
     }
   ================================================ */

import { readJSON, daysSince, isoWeek, DAY, plural } from "../core/local.mjs";

const round1 = (n) => Math.round(n * 10) / 10;

export default {
  id: "exercise",
  label: "Exercise",
  summary: "Weekly training volume, streaks, rest that's gone on a bit long",

  validate(agent) {
    try {
      const d = readJSON((agent.config || {}).file || "agents/data/exercise.json", "exercise log");
      return Array.isArray(d.sessions) ? [] : ['the exercise log has no "sessions" array'];
    } catch (e) {
      return [e.message];
    }
  },

  async run(agent) {
    const c = agent.config || {};
    const target = Math.max(1, Number(c.weeklyTarget) || 4);
    const restDayMax = Math.max(1, Number(c.restDayMax) || 3);
    const data = readJSON(c.file || "agents/data/exercise.json", "exercise log");

    const sessions = data.sessions
      .filter((s) => s && s.date)
      .map((s) => ({ ...s, t: Date.parse(`${s.date}T12:00:00Z`), minutes: Number(s.minutes) || 0 }))
      .filter((s) => Number.isFinite(s.t))
      .sort((a, b) => a.t - b.t);

    if (!sessions.length) {
      return {
        observations: [{ key: "empty", title: "Nothing logged yet", detail: "Add a session to the log and this starts working.", at: Date.now(), url: "" }],
        metric: 0,
        facts: { sessions: 0 },
        line: "no sessions logged",
      };
    }

    const observations = [];
    const add = (key, title, detail) => observations.push({ key, title, detail, at: Date.now(), url: "" });

    const inLast = (days) => sessions.filter((s) => s.t >= Date.now() - days * DAY);
    const thisWeek = sessions.filter((s) => isoWeek(s.t) === isoWeek());
    const last7 = inLast(7);
    const last28 = inLast(28);

    const weekMinutes = thisWeek.reduce((n, s) => n + s.minutes, 0);
    const weekKm = round1(thisWeek.reduce((n, s) => n + (Number(s.distanceKm) || 0), 0));
    const avg4wMinutes = Math.round(last28.reduce((n, s) => n + s.minutes, 0) / 4);

    // ---- rest that's gone on ----
    const last = sessions[sessions.length - 1];
    const off = daysSince(last.date);
    if (off != null && off > restDayMax) {
      add(`rest:${off}`, `${plural(off, "day")} since the last session`,
        `That was ${last.kind || "a session"} on ${last.date}. Rest is part of it — this is just the point you asked to be told.`);
    }

    // ---- the week, said once ----
    const week = isoWeek();
    if (thisWeek.length >= target) {
      add(`target:${week}`, `${plural(thisWeek.length, "session")} this week — target met`,
        `${weekMinutes} minutes${weekKm ? `, ${weekKm} km` : ""}. Target is ${target}.`);
    }

    /* A run of weeks that hit target. Counted backwards from the week
       just gone, so an unfinished current week can't break it. */
    let streak = 0;
    for (let w = 1; w <= 52; w++) {
      const key = isoWeek(Date.now() - w * 7 * DAY);
      const n = sessions.filter((s) => isoWeek(s.t) === key).length;
      if (n >= target) streak++;
      else break;
    }
    if (streak >= 4 && thisWeek.length >= target) {
      add(`weekstreak:${streak}:${week}`, `${plural(streak, "week")} on target, and this one too`,
        "That's the part that actually changes anything.");
    }

    // ---- records, once each ----
    const longest = sessions.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    if (longest.t >= Date.now() - 7 * DAY && sessions.length >= 5) {
      add(`pr-long:${longest.date}`, `Longest session yet — ${longest.minutes} min`,
        `${longest.kind || "session"} on ${longest.date}.`);
    }

    const byKind = {};
    for (const s of last28) byKind[s.kind || "other"] = (byKind[s.kind || "other"] || 0) + 1;
    const mix = Object.entries(byKind).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`).join(", ");

    return {
      observations,
      metric: last7.length,
      memo: { lastSession: last.date },
      facts: {
        sessionsThisWeek: thisWeek.length, target, weekMinutes, weekKm,
        avg4wMinutes, daysOff: off, weekStreak: streak, total: sessions.length,
      },
      line:
        `${thisWeek.length}/${target} this week · ${weekMinutes} min${weekKm ? ` · ${weekKm} km` : ""}` +
        `${mix ? ` · last 4w: ${mix}` : ""}`,
    };
  },

  describe(agent, fresh) {
    return fresh.map((o) => `${o.title}\n${o.detail}`).join("\n\n");
  },
};
