/* ================================================
   AGENTS — types/diary.mjs
   The diary, looking after itself.

   Reads a diary export — the file the ⤓ button in the diary produces —
   and reports the things you'd want a nudge about: a streak you're about
   to lose, a milestone you reached, a week of silence, a to-do list that
   has quietly become a backlog.

   config:
     file          path to the export, default agents/data/diary.json
     quietDays     say something after this many days without an entry (3)
     backlog       say something when open tasks reach this many (15)
     milestones    streak lengths worth celebrating ([7, 30, 100, 365])
     minWords      an entry shorter than this doesn't count as writing (1)

   Nothing here reads your diary out loud. The alerts are counts and
   dates; the words stay in the file.
   ================================================ */

import { readFileSync, existsSync } from "node:fs";

const DAY = 86400000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

export default {
  id: "diary",
  label: "Diary",
  summary: "Writing streaks, silences, milestones and to-do backlog",

  validate(agent) {
    const file = (agent.config && agent.config.file) || "agents/data/diary.json";
    return existsSync(file)
      ? []
      : [`no diary export at ${file} — use ⤓ Export in the diary and save it there`];
  },

  async run(agent) {
    const c = agent.config || {};
    const file = c.file || "agents/data/diary.json";
    const quietDays = Number(c.quietDays) || 3;
    const backlogAt = Number(c.backlog) || 15;
    const minWords = Number(c.minWords) || 1;
    const milestones = Array.isArray(c.milestones) ? c.milestones : [7, 30, 100, 365];

    let data;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`could not read ${file}: ${e.message}`);
    }
    if (!data || typeof data !== "object") throw new Error(`${file} is not a diary export`);

    const written = new Set();
    let openTasks = 0, doneTasks = 0, totalWords = 0;
    const moods = {};

    for (const [day, entry] of Object.entries(data)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !entry || typeof entry !== "object") continue;
      const w = words(entry.diary);
      totalWords += w;
      if (w >= minWords) written.add(day);
      if (entry.mood) moods[entry.mood] = (moods[entry.mood] || 0) + 1;
      for (const t of Array.isArray(entry.tasks) ? entry.tasks : []) {
        if (t && t.completed) doneTasks++;
        else if (t && String(t.text || "").trim()) openTasks++;
      }
    }

    /* The streak ends today if you've written today, and yesterday if you
       haven't yet — an unwritten today is a streak in progress, not a
       broken one, and telling someone at 9am that they've lost it is both
       wrong and discouraging. */
    const today = isoDay(Date.now());
    let cursor = written.has(today) ? Date.now() : Date.now() - DAY;
    let streak = 0;
    while (written.has(isoDay(cursor))) {
      streak++;
      cursor -= DAY;
    }

    const last = [...written].sort().pop() || null;
    const silent = last ? Math.floor((Date.parse(today) - Date.parse(last)) / DAY) : null;
    const recent = [...Array(7)].filter((_, i) => written.has(isoDay(Date.now() - i * DAY))).length;

    const observations = [];
    const add = (key, title, detail) => observations.push({ key, title, detail, at: Date.now(), url: "" });

    /* Keys carry the value that triggered them, so each milestone and
       each new depth of silence is reported once and only once.

       A milestone fires on the day you reach it, not the days after —
       and not retroactively, so importing a diary with years of history
       doesn't open with a burst of congratulations you didn't just earn. */
    for (const m of milestones) {
      if (streak === m) {
        add(`streak:${m}`, `${m} days in a row`, `You've written every day for ${m} days. That's the whole point of the thing.`);
      }
    }
    if (silent != null && silent >= quietDays) {
      add(`silent:${silent}`, `${silent} days since you last wrote`, `The last entry was ${last}. No pressure — a line counts.`);
    }
    if (openTasks >= backlogAt) {
      const bucket = Math.floor(openTasks / 5) * 5;
      add(`backlog:${bucket}`, `${openTasks} tasks still open`, `Across the whole diary. ${doneTasks} done so far.`);
    }
    if (streak >= 2 && !written.has(today)) {
      add(`atrisk:${today}`, `${streak}-day streak, nothing written today`, "Still time.");
    }

    const topMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0];

    return {
      observations,
      metric: streak,
      memo: { lastEntry: last },
      facts: {
        streak, entries: written.size, wordsTotal: totalWords,
        writtenThisWeek: recent, openTasks, doneTasks,
        commonMood: topMood ? topMood[0] : null,
      },
      line:
        `${streak}-day streak · ${recent}/7 this week · ` +
        `${written.size} entries · ${openTasks} tasks open`,
    };
  },

  describe(agent, fresh) {
    return fresh.map((o) => `${o.title}\n${o.detail}`).join("\n\n");
  },
};
