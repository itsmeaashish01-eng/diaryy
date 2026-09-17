/* ================================================
   AGENTS — core/adopt.mjs
   Taking a file the diary just gave you and putting it where the agents
   are already looking.

   The diary exports `my-diary-2026-09-17.json` to your downloads folder.
   The agents read `agents/data/organizer.json`. Nothing bridges those two
   facts, so the gap gets crossed by hand — rename, move, remember which
   agent wanted which path — and an agent that needs a chore done before
   it works is an agent that stays paused. `diary-nudge` shipped paused
   for exactly this reason and stayed that way.

   So: `--adopt <file>` copies one export to every agent that reads one.

   Which agents those are isn't a list kept here. A type says so itself,
   by exporting `adopts` with a name for the file it wants:

     export default { id: "organizer", adopts: "diary export", … }

   A new type that reads an export is picked up by this with no change on
   this side — the same bargain as registry.mjs.
   ================================================ */

/* An export is an object keyed by date. That's the whole contract, and
   it's worth checking before overwriting anything, because the mistake
   this catches — adopting the wrong file out of a downloads folder — is
   otherwise silent until an agent reports nonsense. */
export function looksLikeExport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, why: "that isn't a diary export — the file should be an object keyed by date" };
  }
  const days = Object.keys(data).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (!days.length) {
    return { ok: false, why: "no dated entries in there — is this the file the ⤓ button produced?" };
  }
  let tasks = 0, written = 0;
  for (const d of days) {
    const entry = data[d];
    if (!entry || typeof entry !== "object") continue;
    if (String(entry.diary || "").trim()) written++;
    if (Array.isArray(entry.tasks)) tasks += entry.tasks.length;
  }
  return { ok: true, days: days.length, tasks, written, first: days.sort()[0], last: days.sort().pop() };
}

/* Every agent whose type asked for an export, paused ones included — a
   paused agent is the most likely reason you're running this, and it
   can't be un-paused sensibly until its file is there. */
export function adoptTargets(defs, types) {
  const out = [];
  for (const agent of (defs && defs.agents) || []) {
    const type = types[agent.type];
    if (!type || !type.adopts) continue;
    const path = (agent.config && agent.config.file) || null;
    if (!path) continue;
    out.push({
      id: agent.id,
      label: agent.label || agent.id,
      wants: type.adopts,
      path,
      paused: agent.active === false,
    });
  }
  return out;
}

/* Several agents usually point at one path, or deliberately at two. The
   copy happens per path; the agents sharing it are named together, so
   what you read back is what actually happened on disk. */
export function byPath(targets) {
  const seen = new Map();
  for (const t of targets) {
    if (!seen.has(t.path)) seen.set(t.path, { path: t.path, agents: [] });
    seen.get(t.path).agents.push(t);
  }
  return [...seen.values()];
}
