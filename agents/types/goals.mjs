/* ================================================
   AGENTS — types/goals.mjs
   Career goals, and whether they're actually moving.

   A goal you wrote down once and never looked at again is the failure
   mode this is built against. So it watches two things: deadlines coming
   at you, and goals that have gone quiet. The second is the useful one —
   nothing else in your week will tell you that a goal hasn't moved in
   six weeks.

   config:
     file        default agents/data/goals.json
     staleDays   a goal with no progress for this long is drifting (21)
     horizonDays how far ahead to start mentioning deadlines (90)

   The file:
     {
       "goals": [{
         "id": "boards",
         "title": "Pass the boards",
         "area": "career",
         "due": "2027-06-01",
         "active": true,
         "milestones": [
           { "text": "Finish the question bank", "due": "2027-01-15", "done": null }
         ],
         "progress": [{ "on": "2026-09-01", "note": "300 questions in" }]
       }]
     }
   ================================================ */

import { readJSON, daysUntil, daysSince, deadlineBucket, staleBucket, plural, isoDay } from "../core/local.mjs";

export default {
  id: "goals",
  label: "Goals",
  summary: "Career goals: deadlines closing in, and goals that have gone quiet",

  validate(agent) {
    const c = agent.config || {};
    try {
      const data = readJSON(c.file || "agents/data/goals.json", "goals file");
      return Array.isArray(data.goals) ? [] : ['the goals file has no "goals" array'];
    } catch (e) {
      return [e.message];
    }
  },

  async run(agent) {
    const c = agent.config || {};
    const staleDays = Number(c.staleDays) || 21;
    const horizon = Number(c.horizonDays) || 90;
    const data = readJSON(c.file || "agents/data/goals.json", "goals file");

    const goals = data.goals.filter((g) => g && g.active !== false);
    const observations = [];
    const add = (key, title, detail) => observations.push({ key, title, detail, at: Date.now(), url: "" });

    let milestonesDone = 0, milestonesTotal = 0, drifting = 0, overdue = 0;

    for (const g of goals) {
      const gid = g.id || g.title;
      const milestones = Array.isArray(g.milestones) ? g.milestones : [];
      milestonesTotal += milestones.length;
      milestonesDone += milestones.filter((m) => m && m.done).length;

      // ---- deadlines, announced once per threshold ----
      const gDays = daysUntil(g.due);
      if (gDays != null && gDays <= horizon) {
        const bucket = deadlineBucket(gDays);
        if (bucket === "overdue") {
          overdue++;
          add(`overdue:${gid}:${staleBucket(-gDays, 7)}`,
            `${g.title} is past its date`,
            `Due ${g.due}, ${plural(-gDays, "day")} ago. Move the date or drop it — a deadline you've silently passed isn't doing any work.`);
        } else if (bucket) {
          add(`due:${gid}:${bucket}`,
            `${g.title} — ${gDays === 0 ? "due today" : `${plural(gDays, "day")} left`}`,
            `Due ${g.due}.`);
        }
      }

      for (const [i, m] of milestones.entries()) {
        if (!m || !m.text) continue;
        const mid = `${gid}:${i}`;
        if (m.done) {
          /* Keyed on the completion date, so ticking one off is reported
             once and editing the note afterwards doesn't re-announce it. */
          add(`done:${mid}:${m.done}`, `✓ ${m.text}`, `${g.title} — finished ${m.done}.`);
          continue;
        }
        const mDays = daysUntil(m.due);
        if (mDays == null || mDays > horizon) continue;
        const bucket = deadlineBucket(mDays);
        if (bucket === "overdue") {
          add(`m-overdue:${mid}:${staleBucket(-mDays, 7)}`,
            `${m.text} is past its date`, `${g.title} — was due ${m.due}.`);
        } else if (bucket) {
          add(`m-due:${mid}:${bucket}`,
            `${m.text} — ${mDays === 0 ? "due today" : `${plural(mDays, "day")} left`}`,
            `${g.title}, due ${m.due}.`);
        }
      }

      // ---- has it moved? ----
      const progress = Array.isArray(g.progress) ? g.progress : [];
      const latest = progress
        .map((p) => (p && p.on ? p.on : null))
        .filter(Boolean)
        .sort()
        .pop();
      const quiet = latest ? daysSince(latest) : null;

      if (quiet == null) {
        add(`nostart:${gid}`, `${g.title} hasn't started`,
          "No progress recorded against it at all yet.");
        drifting++;
      } else if (quiet >= staleDays) {
        drifting++;
        add(`stale:${gid}:${staleBucket(quiet, staleDays)}`,
          `${g.title} hasn't moved in ${plural(quiet, "day")}`,
          `Last note was ${latest}. Either it's still a goal and it needs an hour this week, or it isn't and it should come off the list.`);
      }
    }

    // ---- the periodic sit-down ----
    const every = Number(data.reviewEveryDays) || 0;
    if (every && data.lastReview) {
      const since = daysSince(data.lastReview);
      if (since != null && since >= every) {
        add(`review:${staleBucket(since, every)}`,
          "Time for a goals review",
          `It's been ${plural(since, "day")} since ${data.lastReview}. Re-read the list, cut what's dead, set the next milestones.`);
      }
    }

    /* The metric is the share of milestones done, which moves slowly and
       in one direction — a sparkline of it is a genuine picture of a year
       rather than noise. */
    const pctDone = milestonesTotal ? Math.round((milestonesDone / milestonesTotal) * 100) : 0;

    return {
      observations,
      metric: pctDone,
      memo: { checkedOn: isoDay() },
      facts: { goals: goals.length, milestonesDone, milestonesTotal, drifting, overdue },
      level: overdue ? "notable" : "quiet",
      why: overdue ? `${plural(overdue, "goal")} past its date` : "",
      line:
        `${plural(goals.length, "active goal")} · ${milestonesDone}/${milestonesTotal} milestones · ` +
        `${drifting} drifting${overdue ? ` · ${overdue} overdue` : ""}`,
    };
  },

  describe(agent, fresh) {
    return fresh.map((o) => `${o.title}\n${o.detail}`).join("\n\n");
  },
};
