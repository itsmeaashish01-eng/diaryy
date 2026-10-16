/* ================================================
   AGENTS — types/organizer.mjs
   The organizer, keeping its own list honest.

   The diary agent watches whether you're *writing*. This one watches
   whether you're *doing*: it reads the same export, ignores the prose,
   and looks only at the task lists.

   A task in the organizer belongs to the day you wrote it on — there is
   no due date field, and the day you planned something for is the best
   statement of when you meant to do it. So a task still open on a day
   that has passed is a task that slipped, and the number of those, and
   how long they've been sitting, is the only honest measure of whether
   the list is working.

   config:
     file        path to the export, default agents/data/organizer.json
     ageDays     a slipped task is first mentioned at this age (7)
     overload    this many open on one day is too many for one day (6)
     maxMention  most tasks named in a single run (3)
     includeText name the task, rather than just its date (true)
     weeklyReview say how the week went, once a week (true)

   ---- What it will tell you -------------------------------------------

   Slipped tasks, each one once per age rung — first at `ageDays`, then
   14, 30, 60, 90, 180, 365 days. A task you're ignoring on purpose stops
   asking soon enough; a task you've genuinely lost comes back.

   A day with nothing planned while things are slipping, which is the
   moment to pull one forward. A day carrying more than `overload`, which
   is the moment to move one out. The week's open-versus-closed, once a
   week, because the only question that matters about a list is whether
   it's shrinking.

   And a cleared board, on the days you clear it. A tool that only ever
   reports failure is one you stop reading.

   ---- On task text ----------------------------------------------------

   This one does say your task text out loud, which the diary agent
   deliberately doesn't. "Something from 3 weeks ago is still open" is
   not a reminder; "Call the letting agent" is. That text travels to
   whatever channel you configured, so `includeText: false` turns it off
   and leaves you the counts and the dates.

   ---- The file --------------------------------------------------------

   Exactly what the diary's ⤓ Export button produces:

     {
       "2026-09-14": {
         "diary": "…", "mood": "🙂", "notes": "", "notesTag": "general",
         "tasks": [{ "id": "1757…", "text": "Call the agent",
                     "completed": false }]
       }
     }

   Point `file` wherever you keep it. Committed under agents/data/ it
   runs unattended in CI; under agents/private/ it's gitignored and runs
   only when you run it. Both work — the agent never assumes which.
   ================================================ */

import { readJSON, daysSince, isoDay, isoWeek, plural, DAY } from "../core/local.mjs";

/* The rungs a slipped task is mentioned at. Once each, so a task you're
   ignoring deliberately goes quiet within a week or two, and one you've
   genuinely lost resurfaces at a month and at a quarter. */
const AGE_RUNGS = [14, 30, 60, 90, 180, 365];

export function ageRungs(ageDays) {
  const first = Math.max(1, Number(ageDays) || 7);
  return [first, ...AGE_RUNGS.filter((r) => r > first)];
}

/* The highest rung a task of this age has reached, or null below the
   first one. That value goes in the observation key, which is what makes
   each rung announce itself exactly once. */
export function ageBucket(days, ageDays) {
  let hit = null;
  for (const r of ageRungs(ageDays)) if (days >= r) hit = r;
  return hit;
}

/* Flatten an export into one list of tasks that know their own day.
   Anything that isn't a dated entry with a task list is skipped rather
   than guessed at — an import from elsewhere shouldn't crash the run. */
export function collect(data) {
  const tasks = [];
  const days = [];
  for (const [day, entry] of Object.entries(data || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!entry || typeof entry !== "object") continue;
    days.push(day);
    const list = Array.isArray(entry.tasks) ? entry.tasks : [];
    list.forEach((t, i) => {
      const text = String((t && t.text) || "").trim();
      if (!text) return;
      tasks.push({
        /* Scoped to the day, because the app's ids are millisecond
           timestamps — unique in practice, but the day is what actually
           guarantees it, and it keeps the key readable in state.json. */
        key: `${day}#${(t && t.id) || i}`,
        day,
        text,
        done: !!(t && t.completed),
      });
    });
  }
  return { tasks, days: days.sort() };
}

export default {
  id: "organizer",
  label: "Organizer",
  /* Names the file this type wants, which is what makes `--adopt` able
     to find it without the runner knowing anything about diaries. */
  adopts: "diary export",
  summary: "The to-do side of the diary: what slipped, what's piling up, what got done",

  validate(agent) {
    const c = agent.config || {};
    try {
      const data = readJSON(c.file || "agents/data/organizer.json", "organizer export");
      if (Array.isArray(data)) return ["that's a list, not a diary export — keys should be YYYY-MM-DD"];
      const { days } = collect(data);
      return days.length
        ? []
        : ["no dated entries in there — use ⤓ Export in the diary and save the file it gives you"];
    } catch (e) {
      return [e.message];
    }
  },

  async run(agent) {
    const c = agent.config || {};
    const ageDays = Math.max(1, Number(c.ageDays) || 7);
    const overload = Math.max(2, Number(c.overload) || 6);
    const maxMention = Math.max(1, Number(c.maxMention) || 3);
    const withText = c.includeText !== false;
    const weekly = c.weeklyReview !== false;

    const data = readJSON(c.file || "agents/data/organizer.json", "organizer export");
    const { tasks } = collect(data);

    const today = isoDay();
    const observations = [];
    const add = (key, title, detail) => observations.push({ key, title, detail, at: Date.now(), url: "" });
    const name = (t) => (withText ? `“${t.text}”` : `a task from ${t.day}`);

    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const openToday = open.filter((t) => t.day === today);
    const doneToday = done.filter((t) => t.day === today);
    const ahead = open.filter((t) => t.day > today);
    /* Slipped: open, and its day has been and gone. */
    const slipped = open
      .filter((t) => t.day < today)
      .map((t) => ({ ...t, age: daysSince(t.day) }))
      .sort((a, b) => b.age - a.age);

    if (!tasks.length) {
      return {
        observations: [{
          key: "empty",
          title: "No tasks in the export yet",
          detail: "Add a few in the diary, export again, and this starts working.",
          at: Date.now(), url: "",
        }],
        metric: 0,
        facts: { open: 0, done: 0, slipped: 0 },
        line: "no tasks yet",
      };
    }

    /* ---- what slipped, oldest first, a few at a time ---------------- */
    let mentioned = 0;
    for (const t of slipped) {
      if (mentioned >= maxMention) break;
      const rung = ageBucket(t.age, ageDays);
      if (rung == null) continue;
      add(
        `aging:${t.key}:${rung}`,
        `Open since ${t.day} — ${plural(t.age, "day")}`,
        `${name(t)}. Still worth doing, or is it time it came off the list? Both are answers.`
      );
      mentioned++;
    }

    /* ---- today, said once, and only when there's something to say --- */
    if (openToday.length >= overload) {
      add(
        `overload:${today}`,
        `${plural(openToday.length, "task")} on today`,
        `That's more than the ${overload} you said is a day's worth. Something here is really tomorrow's.`
      );
    }

    if (!openToday.length && slipped.length) {
      const oldest = slipped[0];
      add(
        `pull:${today}`,
        `Nothing on today, ${plural(slipped.length, "task")} still open behind you`,
        `The oldest is ${name(oldest)}, from ${oldest.day}. An empty day is the easiest time to clear one.`
      );
    }

    /* ---- and the days you clear it ---------------------------------- */
    if (doneToday.length && !openToday.length && !slipped.length) {
      add(
        `clear:${today}`,
        `Everything's done`,
        `${plural(doneToday.length, "task")} today and nothing left open anywhere. Worth noticing.`
      );
    }

    /* ---- the week, once a week -------------------------------------- */
    const weekStart = isoDay(Date.now() - 7 * DAY);
    const openedThisWeek = tasks.filter((t) => t.day > weekStart).length;
    const closedThisWeek = done.filter((t) => t.day > weekStart).length;

    if (weekly && tasks.length >= 5) {
      const week = isoWeek();
      const verdict =
        closedThisWeek > openedThisWeek
          ? "The list shrank. That's the only direction that counts."
          : closedThisWeek === openedThisWeek
            ? "You broke even — as much went on as came off."
            : "More went on the list than came off it. That's fine for a week and a problem for a month.";
      add(
        `week:${week}`,
        `This week: ${closedThisWeek} done, ${openedThisWeek} added`,
        `${verdict}${slipped.length ? ` ${plural(slipped.length, "task")} still open from earlier days.` : ""}`
      );
    }

    const rate = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
    const oldest = slipped[0] || null;

    return {
      observations,
      /* The number the threshold rules read. How much has slipped is the
         one figure worth putting an `above` rule on. */
      metric: slipped.length,
      memo: { oldestOpen: oldest ? oldest.day : null },
      facts: {
        openToday: openToday.length,
        doneToday: doneToday.length,
        slipped: slipped.length,
        oldestDays: oldest ? oldest.age : 0,
        plannedAhead: ahead.length,
        openTotal: open.length,
        doneTotal: done.length,
        completionRate: rate,
        closedThisWeek,
        openedThisWeek,
      },
      line:
        `${openToday.length} on today · ${slipped.length} slipped` +
        `${oldest ? ` · oldest ${oldest.age}d` : ""} · ` +
        `${closedThisWeek} done this week · ${rate}% all time`,
    };
  },

  describe(agent, fresh) {
    return fresh.map((o) => `${o.title}\n${o.detail}`).join("\n\n");
  },
};
