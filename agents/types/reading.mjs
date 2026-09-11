/* ================================================
   AGENTS — types/reading.mjs
   A reading list that pushes back.

   A to-read list only helps if something picks the next thing off it.
   This scores the queue and tells you what to read next, once a week —
   and tells you when the list is growing faster than you're reading it,
   which is the point at which a reading list becomes a guilt list.

   The recommendation is arithmetic, not a model: priority, how long it
   has sat there, whether it fits the time you said you have, and a nudge
   toward things you've already started. Legible, and you can argue with
   the weights.

   config:
     file          default agents/data/reading.json
     suggest       how many to put in front of you (2)
     minutesFree   a typical sitting, used to prefer things that fit (30)
     staleDays     untouched this long and it's probably not happening (120)

   The file:
     {
       "items": [{
         "id": "sprint-trial",
         "title": "SPRINT — intensive vs standard BP control",
         "url": "https://…",
         "kind": "paper", "topic": "cardiology",
         "added": "2026-02-01", "priority": 4, "minutes": 40,
         "started": null, "finished": null
       }]
     }
   ================================================ */

import { readJSON, daysSince, isoWeek, staleBucket, plural } from "../core/local.mjs";

/* Why something floats to the top. Each part is small and separately
   arguable, which is the idea — if the order looks wrong you can see
   which term did it. */
export function score(item, minutesFree) {
  const priority = Math.min(5, Math.max(1, Number(item.priority) || 3));
  const waiting = daysSince(item.added) || 0;

  let s = priority * 10;
  s += Math.min(waiting / 7, 12);              // patience, capped so nothing wins by age alone
  if (item.started) s += 15;                   // finish what you started
  const mins = Number(item.minutes) || 0;
  if (mins && minutesFree) {
    // Something that fits the sitting you actually have beats something that doesn't.
    s += mins <= minutesFree ? 8 : -Math.min(12, (mins - minutesFree) / 10);
  }
  return s;
}

export default {
  id: "reading",
  label: "Reading",
  summary: "What to read next, and when the list is winning",

  validate(agent) {
    try {
      const d = readJSON((agent.config || {}).file || "agents/data/reading.json", "reading list");
      return Array.isArray(d.items) ? [] : ['the reading list has no "items" array'];
    } catch (e) {
      return [e.message];
    }
  },

  async run(agent) {
    const c = agent.config || {};
    const suggest = Math.max(1, Number(c.suggest) || 2);
    const minutesFree = Number(c.minutesFree) || 30;
    const staleDays = Number(c.staleDays) || 120;
    const data = readJSON(c.file || "agents/data/reading.json", "reading list");

    const items = data.items.filter((i) => i && i.title);
    const unread = items.filter((i) => !i.finished);
    const done = items.filter((i) => i.finished);

    const observations = [];
    const add = (key, title, detail, url) => observations.push({ key, title, detail, url: url || "", at: Date.now() });

    // ---- finished things, acknowledged once ----
    for (const i of done) {
      add(`finished:${i.id || i.title}:${i.finished}`, `Finished — ${i.title}`,
        `${i.kind || "read"}${i.topic ? ` · ${i.topic}` : ""}. ${done.length} down in total.`, i.url);
    }

    // ---- what to read next, once a week ----
    const week = isoWeek();
    const ranked = [...unread].sort((a, b) => score(b, minutesFree) - score(a, minutesFree));
    for (const [n, i] of ranked.slice(0, suggest).entries()) {
      const waiting = daysSince(i.added);
      add(`suggest:${week}:${n}`, `Read next — ${i.title}`,
        [
          i.minutes ? `about ${i.minutes} min` : null,
          i.topic || null,
          i.started ? "already started" : waiting != null ? `on the list ${plural(waiting, "day")}` : null,
        ].filter(Boolean).join(" · "),
        i.url);
    }

    // ---- is the list winning? ----
    const addedRecently = unread.filter((i) => (daysSince(i.added) ?? 999) <= 30).length;
    const finishedRecently = done.filter((i) => (daysSince(i.finished) ?? 999) <= 30).length;
    if (addedRecently > finishedRecently + 3) {
      add(`growing:${week}`, "The list is growing faster than you're reading",
        `${addedRecently} added in the last month, ${finishedRecently} finished. Not a crisis — but worth either cutting some or lowering what you add.`);
    }

    for (const i of unread) {
      const waiting = daysSince(i.added);
      if (!i.started && waiting != null && waiting >= staleDays) {
        add(`stale:${i.id || i.title}:${staleBucket(waiting, staleDays)}`,
          `Still unread after ${plural(waiting, "day")} — ${i.title}`,
          "It's allowed to come off the list. That's not the same as failing to read it.", i.url);
      }
    }

    const hours = Math.round(unread.reduce((n, i) => n + (Number(i.minutes) || 0), 0) / 60);

    return {
      observations,
      metric: unread.length,
      memo: { week },
      facts: {
        unread: unread.length, finished: done.length,
        addedRecently, finishedRecently, estimatedHours: hours,
      },
      line:
        `${unread.length} unread${hours ? ` (~${plural(hours, "hour")})` : ""} · ` +
        `${done.length} finished · ${finishedRecently} in the last month`,
    };
  },

  describe(agent, fresh) {
    return fresh.map((o) => `${o.title}${o.detail ? `\n${o.detail}` : ""}${o.url ? `\n${o.url}` : ""}`).join("\n\n");
  },
};
