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

/* Everything after --adopt that isn't another flag.

   Two ways this goes wrong with one argument read positionally. A glob —
   `--adopt ~/Downloads/my-diary-*.json` — is expanded by the shell before
   the runner sees it, so several paths arrive and all but the first are
   silently dropped; and since they sort by name, and the name carries the
   date, the one kept is the *oldest* export. That's the worst possible
   choice made quietly. The other is `--adopt --dry-run`, which would take
   the next flag as a filename and complain that it can't read it.

   So read them all, and stop at the next flag. */
export function adoptSources(argv) {
  const at = argv.indexOf("--adopt");
  if (at < 0) return [];
  const out = [];
  for (let i = at + 1; i < argv.length; i++) {
    if (argv[i].startsWith("--")) break;
    out.push(argv[i]);
  }
  return out;
}

/* Given several exports, the newest is what you meant — you pressed ⤓ and
   then reached for the shell. Decided on modification time rather than on
   the date in the filename, because a name is a claim and an mtime is
   what actually happened. Ties go to the first, so the order the shell
   gave them breaks it. */
export function newestOf(files) {
  return files.reduce((best, f) => (f.mtime > best.mtime ? f : best), files[0]) || null;
}
