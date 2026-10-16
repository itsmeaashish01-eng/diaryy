/* ================================================
   CODE CLINIC — gitsim.js
   A small git that lives in a page, for learning on before you touch a
   real one. It keeps a working folder, a staging area, commits, branches,
   merges (conflicts included), revert, and a pretend GitHub to push to —
   one that can be made to move while you weren't looking, the way your
   own repository does every hour when the agents commit what they saw.

   It is faithful where it matters for learning and simpler where it
   doesn't: files are compared whole, so two changes to the same file
   always conflict (real git merges line by line), and there is no
   rebase or reset — the lessons explain why you rarely want them.

   No DOM in here. widgets.js draws it; selftest.mjs drives it.
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sameTree = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  function sortKeys(o) {
    const out = {};
    Object.keys(o || {}).sort().forEach((k) => { out[k] = o[k]; });
    return out;
  }

  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return h;
  }

  /* Shell-ish words: quotes group, and > / >> split out even when typed
     against a word ("echo hi>notes.md"). */
  function tokenize(line) {
    const out = [];
    let cur = "", quote = null, had = false;
    const flush = () => { if (had) out.push(cur); cur = ""; had = false; };
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === "\\" && quote === '"' && (line[i + 1] === '"' || line[i + 1] === "\\")) { cur += line[++i]; }
        else cur += ch;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; had = true; continue; }
      if (/\s/.test(ch)) { flush(); continue; }
      if (ch === ">") {
        flush();
        if (line[i + 1] === ">") { out.push(">>"); i++; } else out.push(">");
        continue;
      }
      cur += ch;
      had = true;
    }
    if (quote) return { error: "unclosed quote" };
    flush();
    return { words: out };
  }

  const MARK_START = "<<<<<<< HEAD", MARK_MID = "=======", MARK_END = ">>>>>>> ";
  const hasMarkers = (text) => typeof text === "string" && text.includes(MARK_START) && text.includes(MARK_MID);

  function create() {
    const s = {
      inited: false,
      work: {},
      index: {},
      commits: {},
      branches: {},
      head: "main",
      merging: null,
      remote: null,          // { name, url, branches: { name: id } }
      upstream: {},
      seq: 0,
      lanes: {},             // branch -> lane, so the graph keeps a branch on one row
      nextLane: 0,
      history: [],           // commands typed, for challenges that care how
      cwd: "~/my-site",
    };

    /* ---- reading the repository -------------------------------------- */

    const tip = (b) => (b in s.branches ? s.branches[b] : undefined);
    const headId = () => s.branches[s.head] || null;
    const treeOf = (id) => (id && s.commits[id] ? s.commits[id].tree : {});
    const headTree = () => treeOf(headId());

    function ancestors(id) {
      const seen = new Set();
      const stack = id ? [id] : [];
      while (stack.length) {
        const c = stack.pop();
        if (!c || seen.has(c)) continue;
        seen.add(c);
        (s.commits[c] ? s.commits[c].parents : []).forEach((p) => stack.push(p));
      }
      return seen;
    }
    const isAncestor = (maybe, of) => ancestors(of).has(maybe);

    /* The most recent commit both sides share. Seq is creation order, so
       the common ancestor with the highest seq is the nearest one. */
    function mergeBase(a, b) {
      const A = ancestors(a);
      let best = null;
      ancestors(b).forEach((c) => {
        if (A.has(c) && (!best || s.commits[c].seq > s.commits[best].seq)) best = c;
      });
      return best;
    }

    function resolve(ref) {
      if (!ref) return null;
      if (ref === "HEAD") return headId();
      if (ref in s.branches) return s.branches[ref];
      const m = ref.match(/^origin\/(.+)$/);
      if (m && s.remote && m[1] in s.remote.branches) return s.remote.branches[m[1]];
      const hits = Object.keys(s.commits).filter((id) => id.startsWith(ref));
      return hits.length === 1 ? hits[0] : null;
    }

    function laneFor(branch) {
      if (!(branch in s.lanes)) s.lanes[branch] = s.nextLane++;
      return s.lanes[branch];
    }

    function makeCommit(parents, message, tree, branch, author) {
      s.seq++;
      const id = fnv(`${s.seq}|${parents.join(",")}|${message}|${JSON.stringify(sortKeys(tree))}`)
        .toString(16).padStart(8, "0").slice(0, 7);
      s.commits[id] = { id, parents, message, tree: clone(tree), seq: s.seq, lane: laneFor(branch), author: author || "you" };
      return id;
    }

    /* What git status reports, as data. */
    function changes() {
      const H = headTree(), I = s.index, W = s.work;
      const staged = [], unstaged = [], untracked = [];
      new Set([...Object.keys(H), ...Object.keys(I)]).forEach((p) => {
        if (!(p in H) && p in I) staged.push({ path: p, kind: "new file" });
        else if (p in H && !(p in I)) staged.push({ path: p, kind: "deleted" });
        else if (H[p] !== I[p]) staged.push({ path: p, kind: "modified" });
      });
      Object.keys(I).forEach((p) => {
        if (!(p in W)) unstaged.push({ path: p, kind: "deleted" });
        else if (W[p] !== I[p]) unstaged.push({ path: p, kind: "modified" });
      });
      Object.keys(W).forEach((p) => { if (!(p in I)) untracked.push({ path: p }); });
      const byPath = (a, b) => a.path.localeCompare(b.path);
      return { staged: staged.sort(byPath), unstaged: unstaged.sort(byPath), untracked: untracked.sort(byPath) };
    }

    const isClean = () => {
      const c = changes();
      return !c.staged.length && !c.unstaged.length;
    };

    /* ---- output helpers ---------------------------------------------- */

    let out = [];
    const say = (text, cls) => out.push({ text, cls: cls || "" });
    const fail = (text) => { say(text, "err"); return false; };
    const needRepo = () => (s.inited ? true : fail("fatal: not a git repository (or any of the parent directories): .git\nhint: run git init first"));

    /* ---- the commands -------------------------------------------------- */

    function status() {
      if (!needRepo()) return;
      say(`On branch ${s.head}`);
      if (s.remote && s.upstream[s.head]) {
        const local = headId(), remote = s.remote.branches[s.head];
        if (local === remote) say(`Your branch is up to date with 'origin/${s.head}'.`);
        else if (remote && isAncestor(remote, local)) say(`Your branch is ahead of 'origin/${s.head}'. (use "git push" to publish your local commits)`);
        else if (local && remote && isAncestor(local, remote)) say(`Your branch is behind 'origin/${s.head}'. (use "git pull" to update your local branch)`);
      }
      if (s.merging) {
        say(`You have unmerged paths.\n  (fix conflicts and run "git commit")\n  (use "git merge --abort" to abort the merge)`, "warn");
        const unmerged = s.merging.conflicts.filter((p) => s.index[p] !== s.work[p] || hasMarkers(s.index[p]));
        if (unmerged.length) say("Unmerged paths:\n" + unmerged.map((p) => `        both modified:   ${p}`).join("\n"), "del");
      }
      if (!headId() && !Object.keys(s.index).length && !Object.keys(s.work).length) {
        say("\nNo commits yet\n\nnothing to commit (create/copy files and use \"git add\" to track)");
        return;
      }
      if (!headId()) say("\nNo commits yet");
      const c = changes();
      if (c.staged.length) {
        say("\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)");
        say(c.staged.map((x) => `        ${(x.kind + ":").padEnd(12)}${x.path}`).join("\n"), "add");
      }
      if (c.unstaged.length) {
        say("\nChanges not staged for commit:\n  (use \"git add <file>...\" to update what will be committed)\n  (use \"git restore <file>...\" to discard changes in working directory)");
        say(c.unstaged.map((x) => `        ${(x.kind + ":").padEnd(12)}${x.path}`).join("\n"), "del");
      }
      if (c.untracked.length) {
        say("\nUntracked files:\n  (use \"git add <file>...\" to include in what will be committed)");
        say(c.untracked.map((x) => `        ${x.path}`).join("\n"), "del");
      }
      if (!c.staged.length && !c.unstaged.length && !c.untracked.length) say("nothing to commit, working tree clean");
      else if (!c.staged.length) say(`\nno changes added to commit (use "git add" and/or "git commit -a")`);
    }

    function add(args) {
      if (!needRepo()) return;
      if (!args.length) return fail("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?");
      const all = args.some((a) => a === "." || a === "-A" || a === "--all");
      const paths = all
        ? Array.from(new Set([...Object.keys(s.work), ...Object.keys(s.index)]))
        : args;
      for (const p of paths) {
        if (p in s.work) {
          s.index[p] = s.work[p];
          if (s.merging && s.merging.conflicts.includes(p) && hasMarkers(s.work[p])) {
            say(`warning: ${p} still contains conflict markers (<<<<<<< ======= >>>>>>>). Edit them out before you commit.`, "warn");
          }
        } else if (p in s.index) delete s.index[p];
        else return fail(`fatal: pathspec '${p}' did not match any files`);
      }
    }

    function commit(args) {
      if (!needRepo()) return;
      let msg = null, all = false;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-m" || a === "--message") msg = args[++i];
        else if (a === "-a" || a === "--all") all = true;
        else if (a === "-am" || a === "-ma") { all = true; msg = args[++i]; }
        else if (a.startsWith("-m") && a.length > 2) msg = a.slice(2);
      }
      if (all) Object.keys(s.index).forEach((p) => { if (p in s.work) s.index[p] = s.work[p]; else delete s.index[p]; });
      if (s.merging) {
        const stillMarked = s.merging.conflicts.filter((p) => hasMarkers(s.index[p]));
        const notAdded = s.merging.conflicts.filter((p) => s.index[p] !== s.work[p]);
        if (notAdded.length) return fail(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add <file>'\n        ${notAdded.join("\n        ")}`);
        if (stillMarked.length) return fail(`error: ${stillMarked.join(", ")} still has conflict markers in it. Real git would let you commit that; this one won't — decide what the file should say first.`);
        const id = makeCommit([headId(), s.merging.theirs], msg || `Merge branch '${s.merging.branch}'`, s.index, s.head);
        s.branches[s.head] = id;
        say(`[${s.head} ${id}] ${msg || `Merge branch '${s.merging.branch}'`}`, "ok");
        s.merging = null;
        return;
      }
      if (msg == null) return fail("error: this git needs a message — use git commit -m \"what you changed\"\n(real git would open an editor here)");
      if (!msg.trim()) return fail("Aborting commit due to empty commit message.");
      if (sameTree(s.index, headTree()) && headId()) {
        say(`On branch ${s.head}\nnothing to commit, working tree clean`);
        const c = changes();
        if (c.unstaged.length || c.untracked.length) say('(there are changes, but none are staged — use "git add" first)', "warn");
        return;
      }
      if (!headId() && !Object.keys(s.index).length) return fail("nothing added to commit but untracked files present (use \"git add\" to track)");
      const before = headTree();
      const id = makeCommit(headId() ? [headId()] : [], msg, s.index, s.head);
      s.branches[s.head] = id;
      const n = new Set([...Object.keys(before), ...Object.keys(s.index)]);
      let changed = 0;
      n.forEach((p) => { if (before[p] !== s.index[p]) changed++; });
      say(`[${s.head}${s.commits[id].parents.length ? "" : " (root-commit)"} ${id}] ${msg}\n ${changed} file${changed === 1 ? "" : "s"} changed`, "ok");
    }

    function log(args) {
      if (!needRepo()) return;
      const oneline = args.includes("--oneline");
      const start = args.includes("--all") ? null : headId();
      if (!headId() && !args.includes("--all")) return fail(`fatal: your current branch '${s.head}' does not have any commits yet`);
      const ids = (start ? Array.from(ancestors(start)) : Object.keys(s.commits))
        .sort((a, b) => s.commits[b].seq - s.commits[a].seq);
      const labels = {};
      Object.entries(s.branches).forEach(([b, id]) => {
        if (!id) return;
        (labels[id] = labels[id] || []).push(b === s.head ? `HEAD -> ${b}` : b);
      });
      if (s.remote) Object.entries(s.remote.branches).forEach(([b, id]) => { if (id) (labels[id] = labels[id] || []).push(`origin/${b}`); });
      ids.forEach((id) => {
        const c = s.commits[id];
        const lab = labels[id] ? ` (${labels[id].join(", ")})` : "";
        if (oneline) say(`${id}${lab} ${c.message}`, c.parents.length > 1 ? "warn" : "");
        else {
          say(`commit ${id}${lab}`, "warn");
          if (c.parents.length > 1) say(`Merge: ${c.parents.join(" ")}`);
          say(`Author: ${c.author}\n\n    ${c.message}\n`);
        }
      });
    }

    function lineDiff(a, b) {
      const A = (a || "").split("\n"), B = (b || "").split("\n");
      if (a == null) A.length = 0;
      if (b == null) B.length = 0;
      // Longest common subsequence — fine at the size of anything typed here.
      const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
      for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) {
        L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
      const lines = [];
      let i = 0, j = 0;
      while (i < A.length || j < B.length) {
        if (i < A.length && j < B.length && A[i] === B[j]) { lines.push({ t: " " + A[i], cls: "" }); i++; j++; }
        else if (j < B.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) { lines.push({ t: "+" + B[j], cls: "add" }); j++; }
        else { lines.push({ t: "-" + A[i], cls: "del" }); i++; }
      }
      return lines;
    }

    function diff(args) {
      if (!needRepo()) return;
      const staged = args.includes("--staged") || args.includes("--cached");
      const only = args.filter((a) => !a.startsWith("--"));
      const from = staged ? headTree() : s.index;
      const to = staged ? s.index : s.work;
      const paths = Array.from(new Set([...Object.keys(from), ...Object.keys(to)])).sort()
        .filter((p) => (staged || p in s.index) && from[p] !== to[p] && (!only.length || only.includes(p)));
      if (!paths.length) { say(staged ? "(nothing staged — git diff --staged shows what the next commit would change)" : "(no unstaged changes — try git diff --staged)", "muted"); return; }
      for (const p of paths) {
        say(`diff --git a/${p} b/${p}`, "warn");
        lineDiff(from[p], to[p]).forEach((l) => say(l.t, l.cls));
      }
    }

    /* Switching would clobber a local change only where the two branches
       disagree about that file — anywhere else, the change rides along. */
    function blockedBySwitch(targetTree) {
      const H = headTree();
      const touched = new Set();
      const c = changes();
      c.staged.forEach((x) => touched.add(x.path));
      c.unstaged.forEach((x) => touched.add(x.path));
      c.untracked.forEach((x) => { if (x.path in targetTree) touched.add(x.path); });
      return Array.from(touched).filter((p) => targetTree[p] !== H[p]);
    }

    function switchTo(name, create) {
      if (!needRepo()) return;
      if (!name) return fail("fatal: missing branch name");
      if (s.merging) return fail("error: you're in the middle of a merge — finish it (git commit) or git merge --abort first");
      if (create) {
        if (name in s.branches) return fail(`fatal: a branch named '${name}' already exists`);
        if (!validBranch(name)) return fail(`fatal: '${name}' is not a valid branch name`);
        s.branches[name] = headId();
        s.head = name;
        say(`Switched to a new branch '${name}'`, "ok");
        return;
      }
      if (!(name in s.branches)) {
        if (s.remote && name in s.remote.branches) {
          s.branches[name] = s.remote.branches[name];
          s.upstream[name] = `origin/${name}`;
        } else return fail(`fatal: invalid reference: ${name}`);
      }
      if (name === s.head) { say(`Already on '${name}'`); return; }
      const target = treeOf(s.branches[name]);
      const blocked = blockedBySwitch(target);
      if (blocked.length) {
        return fail(`error: Your local changes to the following files would be overwritten by checkout:\n        ${blocked.join("\n        ")}\nPlease commit your changes or stash them before you switch branches.`);
      }
      const H = headTree();
      // Carry local changes across; replace everything else with the target's version.
      const work = {}, index = {};
      Object.keys(target).forEach((p) => { work[p] = target[p]; index[p] = target[p]; });
      Object.keys(s.work).forEach((p) => { if (s.work[p] !== H[p]) work[p] = s.work[p]; });
      Object.keys(H).forEach((p) => { if (!(p in s.work) && target[p] === H[p]) delete work[p]; });
      Object.keys(s.index).forEach((p) => { if (s.index[p] !== H[p]) index[p] = s.index[p]; });
      Object.keys(H).forEach((p) => { if (!(p in s.index) && target[p] === H[p]) delete index[p]; });
      s.work = work;
      s.index = index;
      s.head = name;
      say(`Switched to branch '${name}'`, "ok");
    }

    const validBranch = (n) => /^[A-Za-z0-9._/-]+$/.test(n) && !n.startsWith("-") && !n.includes("..") && !n.endsWith("/");

    function branch(args) {
      if (!needRepo()) return;
      if (!args.length) {
        const names = Object.keys(s.branches).sort();
        say(names.map((b) => (b === s.head ? `* ${b}` : `  ${b}`)).join("\n"));
        return;
      }
      if (args[0] === "-d" || args[0] === "-D") {
        const name = args[1];
        if (!(name in s.branches)) return fail(`error: branch '${name}' not found.`);
        if (name === s.head) return fail(`error: Cannot delete branch '${name}' checked out`);
        if (args[0] === "-d" && s.branches[name] && headId() && !isAncestor(s.branches[name], headId())) {
          return fail(`error: The branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.`);
        }
        delete s.branches[name];
        say(`Deleted branch ${name}.`, "ok");
        return;
      }
      const name = args[0];
      if (!headId()) return fail(`fatal: Not a valid object name: '${s.head}'. (make a first commit before branching)`);
      if (name in s.branches) return fail(`fatal: a branch named '${name}' already exists`);
      if (!validBranch(name)) return fail(`fatal: '${name}' is not a valid branch name`);
      s.branches[name] = headId();
      say(`(created ${name} at ${headId()} — you are still on ${s.head}; git switch ${name} to move to it)`, "muted");
    }

    function merge(args) {
      if (!needRepo()) return;
      if (args[0] === "--abort") {
        if (!s.merging) return fail("fatal: There is no merge to abort.");
        s.work = s.merging.pre.work;
        s.index = s.merging.pre.index;
        s.merging = null;
        say("Merge aborted — everything is as it was before you typed git merge.", "ok");
        return;
      }
      const ref = args[0];
      const theirs = resolve(ref);
      if (!ref) return fail("fatal: which branch? e.g. git merge feature");
      if (!theirs) return fail(`merge: ${ref} - not something we can merge`);
      if (s.merging) return fail("error: a merge is already in progress");
      if (!isClean()) return fail("error: Your local changes would be overwritten by merge.\nPlease commit your changes or stash them before you merge.");
      const ours = headId();
      if (ours && isAncestor(theirs, ours)) { say("Already up to date."); return; }
      if (!ours || isAncestor(ours, theirs)) {
        s.branches[s.head] = theirs;
        s.index = clone(treeOf(theirs));
        s.work = clone(treeOf(theirs));
        say(`Updating ${ours || "(nothing)"}..${theirs}\nFast-forward`, "ok");
        return;
      }
      const base = treeOf(mergeBase(ours, theirs));
      const O = treeOf(ours), T = treeOf(theirs);
      const result = {}, conflicts = [];
      new Set([...Object.keys(base), ...Object.keys(O), ...Object.keys(T)]).forEach((p) => {
        const b = base[p], o = O[p], t = T[p];
        if (o === t) { if (o != null) result[p] = o; }
        else if (o === b) { if (t != null) result[p] = t; }
        else if (t === b) { if (o != null) result[p] = o; }
        else {
          conflicts.push(p);
          result[p] = `${MARK_START}\n${o == null ? "(deleted on this branch)" : o}\n${MARK_MID}\n${t == null ? "(deleted on that branch)" : t}\n${MARK_END}${ref}`;
        }
      });
      if (!conflicts.length) {
        const id = makeCommit([ours, theirs], `Merge branch '${ref}'`, result, s.head);
        s.branches[s.head] = id;
        s.index = clone(result);
        s.work = clone(result);
        say(`Merge made by the 'ort' strategy.\n[${s.head} ${id}] Merge branch '${ref}'`, "ok");
        return;
      }
      s.merging = { theirs, branch: ref, conflicts, pre: { work: clone(s.work), index: clone(s.index) } };
      // Clean paths are staged; conflicted ones wait for you.
      const index = clone(s.index);
      Object.keys(result).forEach((p) => { if (!conflicts.includes(p)) index[p] = result[p]; });
      Object.keys(index).forEach((p) => { if (!(p in result)) delete index[p]; });
      s.index = index;
      s.work = clone(result);
      conflicts.forEach((p) => say(`CONFLICT (content): Merge conflict in ${p}`, "err"));
      say("Automatic merge failed; fix conflicts and then commit the result.", "err");
      say("(open the file, keep what it should say, delete the <<<<<<< ======= >>>>>>> lines, then git add and git commit)", "muted");
    }

    function restore(args) {
      if (!needRepo()) return;
      const staged = args.includes("--staged");
      const paths = args.filter((a) => !a.startsWith("--"));
      if (!paths.length) return fail("fatal: you must specify path(s) to restore");
      for (const p of paths) {
        if (staged) {
          const H = headTree();
          if (p in H) s.index[p] = H[p]; else delete s.index[p];
        } else {
          if (!(p in s.index)) return fail(`error: pathspec '${p}' did not match any file(s) known to git`);
          s.work[p] = s.index[p];
        }
      }
    }

    function rmCmd(args, viaGit) {
      const paths = args.filter((a) => !a.startsWith("-"));
      if (!paths.length) return fail("usage: rm <file>");
      for (const p of paths) {
        if (!(p in s.work) && !(viaGit && p in s.index)) return fail(`rm: cannot remove '${p}': No such file`);
        delete s.work[p];
        if (viaGit) { delete s.index[p]; say(`rm '${p}'`); }
      }
    }

    function revert(args) {
      if (!needRepo()) return;
      const id = resolve(args[0]);
      if (!id) return fail(`fatal: bad revision '${args[0] || ""}'`);
      if (!isClean()) return fail("error: your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.");
      const c = s.commits[id];
      if (c.parents.length > 1) return fail("error: that's a merge commit — reverting one needs -m, which this git doesn't do. Revert the commits it brought in instead.");
      if (!isAncestor(id, headId())) return fail(`error: ${id} isn't in the history of ${s.head}`);
      const P = treeOf(c.parents[0]), X = c.tree, H = headTree();
      const next = clone(H);
      for (const p of new Set([...Object.keys(P), ...Object.keys(X)])) {
        if (P[p] === X[p]) continue;
        if (H[p] !== X[p]) return fail(`error: could not revert ${id}... ${c.message}\nhint: ${p} has changed since, so undoing it automatically isn't safe.`);
        if (P[p] == null) delete next[p]; else next[p] = P[p];
      }
      const msg = `Revert "${c.message}"`;
      const nid = makeCommit([headId()], msg, next, s.head);
      s.branches[s.head] = nid;
      s.index = clone(next);
      s.work = clone(next);
      say(`[${s.head} ${nid}] ${msg}`, "ok");
    }

    /* ---- the pretend GitHub -------------------------------------------- */

    function remoteCmd(args) {
      if (!needRepo()) return;
      if (args[0] === "add") {
        if (s.remote) return fail(`error: remote ${s.remote.name} already exists.`);
        if (!args[1] || !args[2]) return fail("usage: git remote add origin https://github.com/you/my-site.git");
        s.remote = { name: args[1], url: args[2], branches: {} };
        return;
      }
      if (args[0] === "-v" || !args.length) {
        if (s.remote) say(`${s.remote.name}\t${s.remote.url} (fetch)\n${s.remote.name}\t${s.remote.url} (push)`);
        return;
      }
      fail(`error: this git only knows 'git remote add' and 'git remote -v'`);
    }

    function push(args) {
      if (!needRepo()) return;
      if (!s.remote) return fail("fatal: No configured push destination.\nhint: git remote add origin <url> first");
      const words = args.filter((a) => !a.startsWith("-"));
      const setUp = args.includes("-u") || args.includes("--set-upstream");
      const b = words[1] || s.head;
      if (words[0] && words[0] !== s.remote.name) return fail(`fatal: '${words[0]}' does not appear to be a git repository`);
      if (!words.length && !s.upstream[s.head] && !setUp) {
        return fail(`fatal: The current branch ${s.head} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push -u origin ${s.head}`);
      }
      const local = s.branches[b];
      if (!local) return fail(`error: src refspec ${b} does not match any`);
      const remote = s.remote.branches[b];
      if (remote === local) { say("Everything up-to-date"); return; }
      if (remote && !isAncestor(remote, local)) {
        return fail(` ! [rejected]        ${b} -> ${b} (fetch first)\nerror: failed to push some refs to '${s.remote.url}'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. Use 'git pull' before pushing again.`);
      }
      s.remote.branches[b] = local;
      if (setUp || !s.upstream[b]) s.upstream[b] = `origin/${b}`;
      say(`To ${s.remote.url}\n   ${remote || "(new branch)"}..${local}  ${b} -> ${b}`, "ok");
      if (setUp) say(`branch '${b}' set up to track 'origin/${b}'.`);
    }

    function pull(args) {
      if (!needRepo()) return;
      if (!s.remote) return fail("fatal: no remote to pull from — git remote add origin <url> first");
      const words = args.filter((a) => !a.startsWith("-"));
      const b = words[1] || s.head;
      const theirs = s.remote.branches[b];
      if (!theirs) return fail(`fatal: couldn't find remote ref ${b}`);
      if (args.includes("--rebase")) say("(this git merges instead of rebasing — the end state of your files is the same; the history just keeps the fork visible)", "muted");
      say(`From ${s.remote.url}\n * branch            ${b}       -> FETCH_HEAD`);
      s.upstream[s.head] = s.upstream[s.head] || `origin/${b}`;
      merge([`origin/${b}`]);
    }

    /* ---- the shell around it ---------------------------------------------- */

    function shell(words) {
      const [cmd, ...rest] = words;
      switch (cmd) {
        case "ls": {
          const files = Object.keys(s.work).sort();
          say(files.length ? files.join("\n") : "(empty folder)", files.length ? "" : "muted");
          return;
        }
        case "cat": {
          if (!rest[0]) return fail("usage: cat <file>");
          if (!(rest[0] in s.work)) return fail(`cat: ${rest[0]}: No such file or directory`);
          say(s.work[rest[0]] === "" ? "(empty file)" : s.work[rest[0]], s.work[rest[0]] === "" ? "muted" : "");
          return;
        }
        case "touch": {
          if (!rest.length) return fail("usage: touch <file>");
          rest.forEach((p) => { if (!(p in s.work)) s.work[p] = ""; });
          return;
        }
        case "echo": {
          const i = rest.findIndex((w) => w === ">" || w === ">>");
          if (i < 0) { say(rest.join(" ")); return; }
          const file = rest[i + 1];
          if (!file) return fail("bash: syntax error near unexpected token `newline'");
          const text = rest.slice(0, i).join(" ");
          if (rest[i] === ">>" && file in s.work && s.work[file] !== "") s.work[file] += "\n" + text;
          else s.work[file] = text;
          return;
        }
        case "rm": return rmCmd(rest, false);
        case "pwd": say(s.cwd); return;
        default: fail(`${cmd}: command not found — try help`);
      }
    }

    const HELP = [
      "Files:   ls · cat <file> · touch <file> · rm <file>",
      '         echo "text" > file   (replace)   echo "more" >> file   (add a line)',
      "Git:     git init · git status · git add <file> | . · git commit -m \"message\"",
      "         git log [--oneline] · git diff [--staged] · git restore [--staged] <file>",
      "         git branch [name] · git switch [-c] <name> · git merge <branch> [--abort]",
      "         git revert <commit> · git rm <file>",
      "         git remote add origin <url> · git push [-u origin main] · git pull",
      "Also:    clear · help",
    ].join("\n");

    function exec(line) {
      out = [];
      const text = String(line || "").trim();
      if (!text) return out;
      s.history.push(text);
      const t = tokenize(text);
      if (t.error) { fail(`bash: ${t.error}`); return out; }
      const [cmd, sub, ...rest] = t.words;
      if (cmd === "help") { say(HELP, "muted"); return out; }
      if (cmd !== "git") { shell(t.words); return out; }
      switch (sub) {
        case "init":
          if (s.inited) say(`Reinitialized existing Git repository in ${s.cwd}/.git/`);
          else {
            s.inited = true;
            s.branches = { main: null };
            s.head = "main";
            laneFor("main");
            say(`Initialized empty Git repository in ${s.cwd}/.git/`, "ok");
          }
          break;
        case "status": status(); break;
        case "add": add(rest); break;
        case "commit": commit(rest); break;
        case "log": log(rest); break;
        case "diff": diff(rest); break;
        case "branch": branch(rest); break;
        case "switch":
          if (rest[0] === "-c" || rest[0] === "--create") switchTo(rest[1], true);
          else switchTo(rest[0], false);
          break;
        case "checkout":
          if (rest[0] === "-b") switchTo(rest[1], true);
          else if (rest[0] === "--" || (rest[0] && rest[0] in s.work && !(rest[0] in s.branches))) restore(rest.filter((x) => x !== "--"));
          else switchTo(rest[0], false);
          break;
        case "merge": merge(rest); break;
        case "restore": restore(rest); break;
        case "rm": if (needRepo()) rmCmd(rest, true); break;
        case "revert": revert(rest); break;
        case "remote": remoteCmd(rest); break;
        case "push": push(rest); break;
        case "pull": pull(rest); break;
        case "fetch":
          if (needRepo()) say(s.remote ? `From ${s.remote.url}\n(origin/* now shows what GitHub has; git merge origin/main to bring it in)` : "fatal: no remote configured", s.remote ? "" : "err");
          break;
        case "reset": case "rebase": case "stash":
          fail(`git ${sub} isn't in this simulator. The lessons cover why: reset and rebase rewrite history that others may already have — on your own machine it's survivable, on a shared branch it isn't. Use git revert to undo, and commit rather than stash.`);
          break;
        case undefined: say(HELP, "muted"); break;
        default: fail(`git: '${sub}' is not a git command this simulator knows. See 'help'.`);
      }
      return out;
    }

    /* Run a list of commands quietly — how challenges set the scene. */
    function run(lines) {
      lines.forEach((l) => exec(l));
      out = [];
      return api;
    }

    /* Something happened on GitHub that you didn't do: another person, or
       the agents workflow recording a run. */
    function remoteCommit(branchName, files, message, author) {
      if (!s.remote) throw new Error("no remote");
      const parent = s.remote.branches[branchName] || null;
      const tree = Object.assign(clone(treeOf(parent)), files);
      const id = makeCommit(parent ? [parent] : [], message, tree, branchName, author || "github-actions[bot]");
      s.remote.branches[branchName] = id;
      return id;
    }

    function writeFile(path, text) { s.work[path] = String(text); }
    function deleteFile(path) { delete s.work[path]; }

    /* Everything the graph needs, in creation order. */
    function graph() {
      const commits = Object.values(s.commits).sort((a, b) => a.seq - b.seq);
      const labels = {};
      Object.entries(s.branches).forEach(([b, id]) => { if (id) (labels[id] = labels[id] || []).push({ name: b, head: b === s.head }); });
      if (s.remote) Object.entries(s.remote.branches).forEach(([b, id]) => { if (id) (labels[id] = labels[id] || []).push({ name: `origin/${b}`, remote: true }); });
      return { commits, labels, head: s.head, headId: headId() };
    }

    const api = {
      exec, run, remoteCommit, writeFile, deleteFile, graph, changes, isClean, resolve, isAncestor, mergeBase, tokenize,
      get state() { return s; },
      headId, headTree, treeOf, tip,
      fileAt: (ref, path) => treeOf(resolve(ref))[path],
      commitCount: () => Object.keys(s.commits).length,
      historyOf: (ref) => Array.from(ancestors(resolve(ref))).map((id) => s.commits[id]).sort((a, b) => a.seq - b.seq),
      hasMarkers,
      snapshot: () => clone(s),
      restoreSnapshot: (snap) => { Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, clone(snap)); },
    };
    return api;
  }

  CC.git = { create, tokenize };
})(window.CC);
