/* ================================================
   CODE CLINIC — content/deploy.js
   Track 3: how the web works, git and GitHub, publishing on GitHub Pages
   under your own domain, automatic checks, and keeping a site running.

   The git challenges run in gitsim.js. Each carries a `solution` — the
   commands that solve it — which selftest.mjs replays against the setup,
   so a challenge that can't be finished never ships.
   ================================================ */
(function (CC) {
  "use strict";

  const PAGE_V1 = "<h1>Dr A. N. Example</h1>\n<p>Physician in fellowship training.</p>";
  const STYLE_V1 = "body { font-family: Georgia, serif; }";
  const EDITED = "<h1>Dr A. N. Example</h1>\n<p>Physician in fellowship training, researching recovery after acute illness.</p>";

  const GIT_BASICS = [
    {
      id: "first-commit",
      title: "Your first commit",
      goal: "Start a repository, create **index.html** with anything in it, stage it, and commit it with a message.",
      hint: "`git init`, then `echo \"<h1>Hello</h1>\" > index.html`, then `git status` to see it untracked. `git add index.html`, then `git commit -m \"First page\"`.",
      check: (sim) => Boolean(sim.state.inited && sim.headId() && "index.html" in sim.headTree() && sim.isClean()),
      solution: ["git init", 'echo "<h1>Hello</h1>" > index.html', "git add index.html", 'git commit -m "First page"'],
    },
    {
      id: "stage-selectively",
      title: "Commit only what you mean",
      goal: "You've changed **index.html** and **style.css**, and there's a **notes.md** of private notes. Commit the **style.css** change on its own — leave index.html's change uncommitted, and never commit notes.md.",
      hint: "`git status` shows all three. `git diff` shows what changed. Stage just one file — `git add style.css` — and check with `git status` before you commit.",
      setup: (sim) => {
        sim.run(["git init"]);
        sim.writeFile("index.html", PAGE_V1);
        sim.writeFile("style.css", STYLE_V1);
        sim.run(["git add .", 'git commit -m "First version"']);
        sim.writeFile("index.html", EDITED);
        sim.writeFile("style.css", "body { font-family: system-ui, sans-serif; line-height: 1.6; }");
        sim.writeFile("notes.md", "Private: ask B about the frailty data before the meeting.");
      },
      check: (sim) => {
        const id = sim.headId();
        const c = id && sim.state.commits[id];
        if (!c || c.parents.length !== 1) return false;
        const before = sim.treeOf(c.parents[0]);
        return before["style.css"] !== c.tree["style.css"] && before["index.html"] === c.tree["index.html"] && !("notes.md" in c.tree);
      },
      solution: ["git status", "git add style.css", 'git commit -m "Use a sans-serif font with more line spacing"'],
    },
    {
      id: "restore",
      title: "Undo a mistake in your working folder",
      goal: "Something mangled **index.html** — look at it with `cat index.html`. Get the last committed version back, without making a new commit.",
      hint: "`git diff` shows the damage. `git restore index.html` replaces the file with the version in the last commit.",
      setup: (sim) => {
        sim.run(["git init"]);
        sim.writeFile("index.html", PAGE_V1);
        sim.run(["git add .", 'git commit -m "First version"']);
        sim.writeFile("index.html", "oops — pasted the wrong thing over the whole page");
      },
      check: (sim) => sim.state.work["index.html"] === sim.headTree()["index.html"] && sim.commitCount() === 1,
      solution: ["cat index.html", "git diff", "git restore index.html"],
    },
  ];

  const GIT_BRANCHES = [
    {
      id: "branch-merge",
      title: "Branch, commit, merge",
      goal: "Make a branch called **publications**, switch to it, add a **publications.html** and commit it. Then switch back to **main** and merge the branch in.",
      hint: "`git switch -c publications` makes the branch and moves you onto it. After committing, `git switch main` then `git merge publications`. Watch the graph.",
      setup: (sim) => {
        sim.run(["git init"]);
        sim.writeFile("index.html", PAGE_V1);
        sim.run(["git add .", 'git commit -m "First version"']);
      },
      check: (sim) => sim.state.head === "main" && "publications" in sim.state.branches && "publications.html" in sim.treeOf(sim.state.branches.main),
      solution: ["git switch -c publications", 'echo "<h1>Publications</h1>" > publications.html', "git add publications.html", 'git commit -m "Add a publications page"', "git switch main", "git merge publications"],
    },
    {
      id: "conflict",
      title: "Resolve a conflict",
      goal: "The **title** branch and **main** both changed the heading in index.html. Merge **title** into main, decide what the heading should say, fix the file so the conflict markers are gone, and finish the merge.",
      hint: "`git merge title` stops with a conflict. Click **index.html** in the files panel (or `cat` it): keep the line you want, delete the `<<<<<<<`, `=======` and `>>>>>>>` lines, save. Then `git add index.html` and `git commit -m \"Merge the title change\"`.",
      setup: (sim) => {
        sim.run(["git init"]);
        sim.writeFile("index.html", "<h1>Dr A. N. Example</h1>");
        sim.run(["git add .", 'git commit -m "First version"', "git switch -c title"]);
        sim.writeFile("index.html", "<h1>Dr A. N. Example, MD</h1>");
        sim.run(['git commit -am "Add the degree"', "git switch main"]);
        sim.writeFile("index.html", "<h1>A. N. Example — Physician</h1>");
        sim.run(['git commit -am "Say what I do"']);
      },
      check: (sim) => {
        const id = sim.headId();
        const c = id && sim.state.commits[id];
        return Boolean(c && c.parents.length === 2 && !sim.state.merging && !sim.hasMarkers(c.tree["index.html"]));
      },
      solution: ["git merge title", 'echo "<h1>Dr A. N. Example, MD — Physician</h1>" > index.html', "git add index.html", 'git commit -m "Merge the title change"'],
    },
    {
      id: "revert",
      title: "Undo a commit — safely",
      goal: "The last commit added **results.html**, which mustn't be public yet. Undo that commit **without rewriting history**: the undo should itself be a new commit.",
      hint: "`git log --oneline` shows the commit's id. `git revert <id>` makes a new commit that does the opposite.",
      setup: (sim) => {
        sim.run(["git init"]);
        sim.writeFile("index.html", PAGE_V1);
        sim.run(["git add .", 'git commit -m "First version"']);
        sim.writeFile("results.html", "<h1>DRAFT results — not for publication</h1>");
        sim.run(["git add results.html", 'git commit -m "Add draft results"']);
      },
      check: (sim) => {
        const id = sim.headId();
        const c = id && sim.state.commits[id];
        return Boolean(c && /^Revert/.test(c.message) && !("results.html" in c.tree) && sim.commitCount() === 3);
      },
      solution: (sim) => [`git revert ${sim.headId()}`],
    },
  ];

  const GIT_REMOTE = [
    {
      id: "push-pull",
      title: "Push — and what to do when it's refused",
      goal: "There's a change to **index.html** in your folder. Commit it and get it onto GitHub (`origin`). Something will get in the way: the agents workflow committed to GitHub while you were working, just as it does every hour in your real repository.",
      hint: "`git commit -am \"…\"`, then `git push`. When it's rejected: `git pull` brings GitHub's commit in and merges it; then `git push` again. `git status` and the graph show where everything is.",
      setup: (sim) => {
        sim.run(["git init"]);
        sim.writeFile("index.html", PAGE_V1);
        sim.run(["git add .", 'git commit -m "First version"', "git remote add origin https://github.com/you/my-site.git", "git push -u origin main"]);
        sim.remoteCommit("main", { "agents/data/state.json": "{ \"lastRun\": \"2026-10-08T09:37:00Z\" }" }, "Agents: record run 2026-10-08 09:37 UTC", "agents");
        sim.writeFile("index.html", EDITED);
      },
      check: (sim) => {
        const s = sim.state;
        return Boolean(s.remote && s.remote.branches.main === sim.headId() && "agents/data/state.json" in sim.headTree() && sim.headTree()["index.html"] === EDITED);
      },
      solution: ['git commit -am "Say what I research"', "git push", "git pull", "git push"],
    },
  ];

  const AGENTS_JSON = `const AGENTS_JSON = {
  version: 1,
  settings: { defaultIntervalMin: 60 },
  agents: [
    { id: "hn-ai", type: "feed", label: "Hacker News — AI stories", active: true, intervalMin: 60,
      config: { url: "https://hnrss.org/frontpage", match: "claude|anthropic|llm|agent", max: 5 } },
    { id: "my-site", type: "uptime", label: "My site", active: false, intervalMin: 60,
      config: { url: "https://example.com", timeoutMs: 15000 },
      rules: [{ when: "above", value: 4000, level: "notable" }] },
    { id: "career", type: "goals", label: "Career goals", active: true, intervalMin: 720,
      config: { file: "agents/data/goals.json", staleDays: 21, horizonDays: 90 } },
  ],
};`;

  CC.content.addTrack({
    id: "ship",
    order: 3,
    icon: "⇡",
    title: "Deployment",
    summary: "How the web works, git and GitHub, publishing on GitHub Pages under your own domain, automatic checks with GitHub Actions — and keeping it running.",
    outcome: "Your website live at an address you own, over HTTPS, versioned in git, checked on every push, and watched by your own uptime agent.",
    lessons: [
      /* ============================================================ */
      {
        id: "ship-web",
        title: "How the web works",
        minutes: 30,
        summary: "What actually happens between typing an address and seeing a page.",
        keywords: "url dns http https status codes static dynamic hosting",
        objectives: [
          "Take a URL apart and say what each part does",
          "Follow a request from DNS lookup to response",
          "Read HTTP status codes, and say what \"static hosting\" means",
        ],
        blocks: [
          { md: `
            ## From address to page

            1. **DNS.** Your browser asks the Domain Name System what IP address \`your-name.github.io\` lives at — the phone book of the internet.
            2. **Connection.** It connects to that address and, for \`https\`, sets up encryption: the server proves it really is that name with a certificate, and from then on nobody in between can read or alter the conversation.
            3. **Request.** \`GET /research.html\` — please send me this.
            4. **Response.** A status code, some headers, and the file.
            5. **More requests.** The page names a stylesheet, scripts, fonts, images — each one another request.

            ## Status codes

            | Code | Means |
            |---|---|
            | **200** OK | Here it is |
            | **301 / 302** | It's moved — go here instead |
            | **304** Not Modified | Use the copy you already have |
            | **404** Not Found | No such file — usually a typo or a moved page |
            | **403** Forbidden | It exists, you can't have it |
            | **500** | The server broke |
            | **503** | The server is overloaded or down for maintenance |

            The first digit is the family: 2 success, 3 redirection, 4 your mistake, 5 theirs.

            ## Static and dynamic

            A **static** site is files — HTML, CSS, JavaScript, images — sent as they are. That's your website: no database, no server code, nothing to break into or keep patched. It can be hosted free, and it's fast everywhere because copies sit on servers close to every visitor (a content delivery network).

            A **dynamic** site runs code on a server for each request — to log people in, store a form, query a database. Powerful, and everything you then have to look after. A later lesson covers when you need it (rarely, for a personal site) and how to add just enough.
          ` },
          { type: "widget", id: "url", widget: "urlDissector", kind: "Try it", title: "Take a URL apart" },
          {
            type: "quiz", id: "q-status",
            question: "You moved your publications page from `/pubs.html` to `/publications.html`. Old links in emails still point at the old address. What should a visitor following one ideally get?",
            options: ["A 404, so they know it moved", "A 301 redirect to the new address", "A 500"],
            answer: 1,
            explain: "A permanent redirect sends people (and search engines) to the new address. GitHub Pages can't set redirects itself, so the simple fix there is to leave a small `pubs.html` with a link to the new page — or not to move pages people link to.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-git",
        title: "Git: saving your work properly",
        minutes: 40,
        project: "website",
        summary: "Commits, the staging area, and undoing mistakes — in a practice repository you can't break.",
        keywords: "git commit add status diff log restore version control",
        objectives: [
          "Explain the working folder, the staging area and commits",
          "Commit exactly the changes you mean to, with a useful message",
          "Read status, diff and log, and undo an unwanted change",
        ],
        blocks: [
          { md: `
            ## Why version control

            Git keeps every saved version of a project, with who changed what, when and why. For a website that means you can always get back to the version that worked. For research it's more: an analysis whose every change is recorded, dated and explained is an analysis you can defend — and one a reviewer, a co-author or you in eighteen months can follow.

            ## Three places

            - **The working folder** — the files as they are now, as you edit them.
            - **The staging area** — the changes you've chosen to go into the next commit. \`git add\` puts them there.
            - **Commits** — saved snapshots, each with a message, an author, a time and a pointer to the one before. \`git commit\` makes one.

            The staging area is what lets you commit *exactly* what you mean: fix a typo and change the colours in one sitting, and commit them as two separate, clearly-described changes.

            ## The everyday commands

            | Command | Does |
            |---|---|
            | \`git init\` | Make this folder a repository |
            | \`git status\` | What's changed, what's staged — run it constantly |
            | \`git add <file>\` / \`git add .\` | Stage one file / everything |
            | \`git commit -m "message"\` | Save the staged changes |
            | \`git diff\` / \`git diff --staged\` | Line-by-line changes, unstaged / staged |
            | \`git log --oneline\` | The history, one line per commit |
            | \`git restore <file>\` | Throw away unstaged changes to a file |
            | \`git restore --staged <file>\` | Unstage, keeping the change |

            ## Messages worth reading

            A commit message says *what changed and why*, in the imperative, as if completing "This commit will…": "Add publications section", "Fix the broken DOI link for the 2025 paper". Your repository's own history is a model: look at the lessons' commit messages when you push.

            ## Practise here

            The terminal below runs a small simulation of git — not real git, but it behaves the same way for everything in these challenges, and you can't break anything. The graph on the right draws your commits as you make them. Click a file to edit it.
          ` },
          { type: "widget", id: "git-basics", widget: "gitTerminal", kind: "Practice repository", title: "Commits", opts: { challenges: GIT_BASICS } },
          { md: `
            > [!TIP] On your own machine
            > It's the same commands in a real terminal. Or use the buttons: VS Code's Source Control panel (the branch icon on the left) shows changed files, stages them with **+**, and commits with a message box — all git underneath. Run \`git status\` in a terminal now and then anyway; it's the clearest description of where you are.
          ` },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-branches",
        title: "Branches, merges and conflicts",
        minutes: 40,
        summary: "Working on something without disturbing what works — and bringing it back.",
        keywords: "git branch switch merge conflict revert reset",
        objectives: [
          "Make a branch, work on it, and merge it back",
          "Resolve a merge conflict calmly",
          "Undo a commit with revert — and explain why not reset",
        ],
        blocks: [
          { md: `
            ## Branches

            A branch is a movable label on a commit. \`main\` is the one your live site is built from. Make a branch to try something — a new section, a redesign — and commits go on it while \`main\` stays as it was. If it works out, **merge** it back; if not, delete the branch and nothing happened.

            | Command | Does |
            |---|---|
            | \`git switch -c name\` | Make a branch and move onto it |
            | \`git switch main\` | Move back |
            | \`git branch\` | List branches; the current one is starred |
            | \`git merge name\` | Bring another branch's commits into this one |

            Every branch this course has been built on was made this way — including the one this lesson arrived in.

            ## Merges

            If \`main\` hasn't moved since you branched, a merge just slides the \`main\` label forward: a **fast-forward**. If both have new commits, git makes a **merge commit** with two parents — you'll see the two lines join in the graph.

            ## Conflicts

            When both sides changed the same lines, git can't know which you want, so it stops and marks the file:

            \`\`\`text
            <<<<<<< HEAD
            <h1>A. N. Example — Physician</h1>
            =======
            <h1>Dr A. N. Example, MD</h1>
            >>>>>>> title
            \`\`\`

            The top half is yours (\`HEAD\`), the bottom half theirs. Edit the file to say what it should — one version, the other, or a combination — delete the three marker lines, then \`git add\` and \`git commit\`. A conflict isn't an error; it's git asking a question only you can answer. (\`git merge --abort\` backs out if you'd rather think about it.)

            > [!NOTE] A simplification
            > Real git merges line by line, so two people editing *different* lines of a file merge cleanly. This simulator compares whole files, so any two edits to the same file conflict. The resolution is identical.

            ## Undoing a commit

            **\`git revert <commit>\`** makes a new commit that exactly reverses an old one. History keeps both: what happened and that it was undone. That's always safe, including on commits you've already pushed.

            You'll also meet \`git reset\` and "force push", which *rewrite* history — they make it as if commits never happened. On your own unpushed work that's occasionally useful; on anything already on GitHub it breaks every other copy, including the GitHub Actions jobs that commit to your repository every hour. This course leaves them out on purpose.
          ` },
          { type: "widget", id: "git-branches", widget: "gitTerminal", kind: "Practice repository", title: "Branches", opts: { challenges: GIT_BRANCHES } },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-github",
        title: "GitHub: remotes, pushes and pull requests",
        minutes: 40,
        project: "website",
        summary: "Putting your repository on GitHub, keeping the two in step — and what to do when a secret gets committed.",
        keywords: "github remote push pull clone pull request gitignore secrets",
        objectives: [
          "Connect a local repository to GitHub and push to it",
          "Recover from a rejected push by pulling first",
          "Keep secrets and private data out of a repository — and know what to do if one gets in",
        ],
        blocks: [
          { md: `
            ## Remotes

            Git is complete on your own machine; GitHub is a copy of the repository on a server — the **remote**, conventionally called \`origin\`. You **push** your commits up to it and **pull** others' commits down.

            | Command | Does |
            |---|---|
            | \`git remote add origin <url>\` | Connect this repository to one on GitHub |
            | \`git push -u origin main\` | Send main up, and remember where it goes |
            | \`git push\` | …thereafter |
            | \`git pull\` | Fetch what's new on GitHub and merge it in |
            | \`git clone <url>\` | Copy a repository from GitHub to a new folder |

            ## When a push is refused

            If GitHub has commits you don't — a colleague's, or a bot's — your push is rejected: git won't let you silently overwrite them. You \`git pull\` (which merges their work into yours), then push again.

            Your own repository does this to you constantly, by design. The Price Watch and agents workflows commit a data file every hour. That's why both workflow files end with \`git pull --rebase --autostash\` before they push — and why, at your own keyboard, a rejected push usually means "pull first", not "something is broken".

            ## Pull requests

            A **pull request** proposes merging one branch into another on GitHub, with a page to discuss and review the change line by line before it's merged. Even working alone, it's a good habit for bigger changes: it makes you read your own diff, and it's where your repository's checks report — a red cross on a pull request is a problem found before it reached your live site.

            ## Keeping things out

            A \`.gitignore\` file lists what git should never track. Your repository's begins:

            \`\`\`text
            # Anything under agents/private/ stays on your machine. That's where the
            # study library lives — notes, guidelines, anything with a patient or a
            # person in it has no business in a repository...
            agents/private/*
            !agents/private/README.md
            \`\`\`

            The same idea protects a research project: raw data, exports, anything identifiable, and every file holding a key (\`.env\`) belong in \`.gitignore\` **before** the first commit.

            > [!SAFETY] If you commit a secret
            > Assume it's compromised the moment it reaches GitHub — automated scanners find exposed keys within minutes. **Revoke or rotate it first**, then clean up. Deleting it in a later commit doesn't help: it's still in the history. If you commit patient data, treat it as a data breach and follow your institution's process; don't just quietly delete it.
          ` },
          { type: "widget", id: "git-remote", widget: "gitTerminal", kind: "Practice repository", title: "Push and pull", opts: { challenges: GIT_REMOTE } },
          { md: `
            ## For real: your website's repository

            1. On github.com: **New repository**. For the simplest address, name it \`<your-username>.github.io\`; any other name works too (the next lesson explains the difference). Public. No README — you have files already.
            2. In a terminal, in the folder holding your downloaded \`index.html\`:

            \`\`\`bash
            git init
            git add index.html
            git commit -m "First version of my website"
            git branch -M main
            git remote add origin https://github.com/<your-username>/<repository>.git
            git push -u origin main
            \`\`\`

            The first push asks you to sign in to GitHub — follow the prompt (VS Code and GitHub Desktop handle this for you). \`git branch -M main\` makes sure your branch is called \`main\`, whatever your git's default.
          ` },
          {
            type: "quiz", id: "q-secret",
            question: "You notice your Anthropic API key in a file you pushed yesterday. What's the first thing to do?",
            options: [
              "Delete the file and push again",
              "Make the repository private",
              "Revoke the key in the Anthropic console and make a new one",
            ],
            answer: 2,
            explain: "Once a secret has been public it's compromised, and nothing you do to the repository changes that — the old commit still holds it, and it may already have been copied. Revoke first; tidy up afterwards.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-pages",
        title: "Publish with GitHub Pages",
        minutes: 35,
        project: "website",
        summary: "From repository to live website, free, in about three clicks.",
        keywords: "github pages publish deploy hosting static site",
        objectives: [
          "Publish a repository as a website with GitHub Pages",
          "Choose between a user site and a project site, and avoid the broken-link trap",
          "Say what Pages is not for",
        ],
        blocks: [
          { md: `
            ## Turning it on

            In your website's repository on github.com:

            1. **Settings → Pages**.
            2. Under **Build and deployment**, Source: **Deploy from a branch**.
            3. Branch: **main**, folder: **/ (root)**. **Save**.
            4. Wait a minute or two. The Pages settings screen shows the address when it's live, and the repository's Actions tab shows the deployment running.

            Every push to \`main\` from then on republishes the site — usually within a minute.

            ## User site or project site

            | Repository name | Address |
            |---|---|
            | \`<username>.github.io\` | \`https://<username>.github.io/\` — your **user site**, one per account |
            | anything else, e.g. \`website\` | \`https://<username>.github.io/website/\` — a **project site** |

            Either is fine, and a custom domain (next lesson) replaces both. One trap with project sites: a link written \`href="/style.css"\` means "from the root of the domain", which on a project site is the wrong folder. Write links relative to the page — \`href="style.css"\` — and they work in both places, and on your own machine.

            This course itself could be published the same way — from your \`diaryy\` repository it would appear at \`https://<username>.github.io/diaryy/learn/\` — which is also what the live parts of the agent lab need (a real web address, rather than a file on disk).

            ## What Pages is for — and isn't

            - **Public.** A Pages site is on the open internet. On GitHub's free plan the repository must be public too; on paid plans the repository can be private, but the *site* is still public.
            - **Static.** No server code, no database, no secrets.
            - **Personal, not commercial.** Pages isn't for running a business; there are usage limits (sites up to 1 GB, and a soft limit of 100 GB of bandwidth a month — far beyond any personal site).
            - **Never for patient information** — not even "just for colleagues".
          ` },
          {
            type: "widget", id: "pages-steps", widget: "checklist", kind: "Checklist", title: "Publish your site",
            opts: { items: [
              { id: "repo", text: "Created a public repository for the website on GitHub" },
              { id: "pushed", text: "Pushed \`index.html\` to its \`main\` branch" },
              { id: "enabled", text: "Settings → Pages → Deploy from a branch → main / (root) → Save" },
              { id: "visited", text: "Opened the address GitHub gave you, on a phone as well as a computer" },
            ] },
          },
          { type: "widget", id: "pages-live", widget: "siteCheck", kind: "Check", title: "Is it live?", optional: true },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-domain",
        title: "Your own domain, with HTTPS",
        minutes: 30,
        project: "website",
        summary: "Buying a domain, pointing its DNS at GitHub, and getting the padlock — without the classic takeover mistake.",
        keywords: "domain dns a record cname https certificate registrar",
        objectives: [
          "Buy a domain sensibly and protect it",
          "Write the DNS records that point it at GitHub Pages",
          "Turn on HTTPS and verify the domain",
        ],
        blocks: [
          { md: `
            ## Do you need one?

            No — \`username.github.io\` is a perfectly good address, and staying on it costs nothing. A domain of your own (\`drexample.com\`, \`anexample.in\`) is easier to say and remember, survives you moving hosts, and looks more permanent. It costs roughly the price of a textbook a year.

            ## Buying one

            Any accredited registrar will do. Whichever you choose:

            - Turn on **auto-renew**, with a card that won't expire next month. Lapsed domains are bought up within days and used for spam on your name.
            - Turn on the registrar's **lock** and **two-factor authentication**.
            - Use their **privacy** option so your home address isn't in the public WHOIS record.

            ## DNS records

            DNS records tell the world where your domain lives:

            | Type | Does |
            |---|---|
            | **A** | name → an IPv4 address |
            | **AAAA** | name → an IPv6 address |
            | **CNAME** | name → another name ("www.drexample.com is really you.github.io") |
            | **TXT** | text, often for proving you own the domain |
            | **MX** | where email for the domain goes |

            \`@\` in a record's name means the domain itself (the *apex*, \`drexample.com\`); \`www\` means \`www.drexample.com\`. Changes take minutes to hours to spread, governed by each record's TTL ("time to live").

            For GitHub Pages: the apex gets four A records (and four AAAA) pointing at GitHub's servers, and \`www\` gets a CNAME to your \`github.io\` name. The helper below writes them for you.
          ` },
          { type: "widget", id: "dns", widget: "dnsHelper", kind: "Helper", title: "Your DNS records" },
          { md: `
            ## HTTPS

            Once DNS points at GitHub, it issues a certificate for your domain automatically (from Let's Encrypt, free). When the Pages settings show it's ready, tick **Enforce HTTPS** so every visitor gets the encrypted version.

            ## The takeover mistake

            If your DNS points at GitHub but no repository claims the domain — say you deleted the repository, or used a wildcard record — someone else can create a Pages site that claims it, and your domain serves their content. Two defences: **verify the domain** in your GitHub account settings (only verified owners can then use it), and **never use wildcard records** (\`*.drexample.com\`) with Pages.

            ## Email at your domain

            The domain can also carry email (\`you@drexample.com\`) through a separate email provider and MX records. Worth it if you'll keep the domain for life; skip it otherwise. Clinical correspondence belongs on your institution's email in any case.
          ` },
          {
            type: "quiz", id: "q-dns",
            question: "You want `www.drexample.com` to show your GitHub Pages site. Which record does that?",
            options: ["An MX record for www", "A CNAME record: www → your-username.github.io", "A TXT record containing your GitHub username"],
            answer: 1,
            explain: "A CNAME says \"this name is an alias for that one\". The apex (drexample.com itself) can't have a CNAME under the DNS rules, which is why it gets A and AAAA records instead.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-actions",
        title: "Automatic checks with GitHub Actions",
        minutes: 40,
        project: "website",
        summary: "A robot that tests every push — using your repository's own workflows as the textbook.",
        keywords: "github actions ci workflow yaml checks schedule secrets",
        objectives: [
          "Read a workflow file: triggers, jobs, steps",
          "Add a check that catches broken links and missing alt text before they go live",
          "Use secrets and schedules — and avoid the default-branch trap",
        ],
        blocks: [
          { md: `
            ## Continuous integration

            **GitHub Actions** runs programs on GitHub's machines when something happens in your repository — a push, a pull request, a time of day. Used for checking, it's *continuous integration*: every change is tested automatically, and a failure shows as a red cross on the commit and the pull request. Free for public repositories.

            ## Reading a workflow

            Your repository already has three, in \`.github/workflows/\`. Here's the heart of \`checks.yml\`:

            \`\`\`yaml
            name: Checks

            on:                          # when to run
              push:
                branches: ["**"]         # a push to any branch
                paths-ignore:            # …except the hourly data-file commits
                  - "tracker/data/watches.json"
                  - "agents/data/state.json"
              pull_request:

            permissions:
              contents: read             # it only needs to read the code

            jobs:
              test:
                runs-on: ubuntu-latest   # a fresh Linux machine each time
                timeout-minutes: 5
                steps:
                  - uses: actions/checkout@v4      # get the code
                  - uses: actions/setup-node@v4    # install Node
                    with:
                      node-version: "20"
                  - name: Agent self-test
                    run: node agents/selftest.mjs  # a step is a command
            \`\`\`

            - \`on\` — the triggers. \`paths-ignore\` is a nice touch: the bots' hourly commits change only data, so testing them would be 48 pointless runs a day.
            - \`permissions\` — least privilege, as with agents: this job can read, not write.
            - \`steps\` — \`uses\` runs a published action; \`run\` runs a command. If any command exits with an error, the job fails.

            That last step is the pattern for everything: **a check is a program that exits with an error when something's wrong.**

            ## Secrets and schedules

            \`agents.yml\` shows the other two features you'll want. Secrets — set in Settings → Secrets and variables → Actions — arrive as environment variables, never in the file:

            \`\`\`yaml
            env:
              NTFY_TOPIC: \${{ secrets.NTFY_TOPIC }}
              ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
            \`\`\`

            And schedules use cron syntax, in UTC:

            \`\`\`yaml
            on:
              schedule:
                - cron: "37 * * * *"     # every hour, at 37 minutes past
            \`\`\`

            > [!WARNING] The default-branch trap
            > Scheduled workflows only ever run from the repository's **default branch**. A schedule on a feature branch does nothing, silently. Your workflow files say so in their first comment, because it's the most common "why isn't it running?" there is. (Also: in public repositories, GitHub disables scheduled workflows after 60 days with no activity in the repository.)

            ## A check for your website

            The builder below produces a workflow and a small, dependency-free checker script for your site: every page has a \`<title>\` and a \`lang\`, every image has alt text, and every local link points at a file that exists. Put the two files in your website's repository at the paths shown, commit, push — and watch the Actions tab.
          ` },
          { type: "widget", id: "workflow", widget: "workflowBuilder", kind: "Builder", title: "Checks for your site" },
          {
            type: "quiz", id: "q-cron",
            question: "You add a nightly link-check schedule to a workflow on a branch called `checks`, push it, and wait a week. Nothing runs. Why?",
            options: [
              "Cron times are in your local time zone, so it ran at a different time",
              "Scheduled workflows only run from the default branch — merge it into main",
              "Schedules need a paid plan",
            ],
            answer: 1,
            explain: "Schedules are read from the default branch only. Merge the workflow into `main` (cron times are UTC, which is worth remembering too).",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-servers",
        title: "When a static site isn't enough",
        minutes: 35,
        summary: "Forms, keys and databases: the smallest server that does the job — and the health-data line you don't cross.",
        keywords: "serverless functions backend api key proxy forms validation cors",
        objectives: [
          "Recognise what a static site can't do",
          "Choose the smallest backend that does: a form service, a serverless function, a proxy",
          "Validate input on the server, every time",
        ],
        blocks: [
          { md: `
            ## What static can't do

            A static site can't keep a secret (everything is sent to the visitor), can't store what a visitor submits, and can't do anything only a trusted computer should. For a personal academic site that's usually fine. When you do need more:

            | You want | Smallest thing that works |
            |---|---|
            | A contact form | A form-handling service, or a few lines in a serverless function that emails you |
            | To call an API that needs a key | A serverless function that holds the key and calls the API for you |
            | To call a site that blocks browsers (no CORS) | The same: a small proxy |
            | Accounts, a database | A real backend — and a real maintenance commitment |

            **Serverless functions** (Cloudflare Workers, Netlify and Vercel functions, and others) are small pieces of code a provider runs on demand. Free tiers are generous for personal use; you write a function, they handle servers, scaling and HTTPS.

            > [!REPO] Your repository has one
            > \`tracker/server/price-proxy.mjs\` exists for exactly the two reasons above: to read sites that don't send CORS headers, and to hold an API key "without putting it in the page, where anyone with dev tools could read it". It also keeps an **allowlist** of hosts it will talk to, "so a stray tab can't turn this into an open relay" — which is what an unrestricted proxy becomes.

            ## The server's first job: distrust input

            Anything can arrive at a public endpoint — not just from your form, but from scripts that never saw it. So a function checks everything: the method, the type and length of every field, the format of an email. It rejects what's wrong with a clear \`400\` and does nothing. A cheap trick against spam bots is a **honeypot**: a field hidden from people, so anything that fills it in is a bot — pretend to accept, and drop it.

            > [!SAFETY] Where health data goes
            > A personal website, and anything built on it, holds no patient information — not in a form, not in a database, not in an email it sends. Patient-facing tools are a different category altogether: clinical safety assessment (in the UK, the DCB0129 and DCB0160 standards), information governance, and possibly regulation as software as a medical device. Research data is collected in institution-approved systems such as REDCap, not on a site you built.
          ` },
          {
            type: "code", id: "handler", lang: "js", title: "A contact-form function that distrusts its input",
            prelude: "const sent = [];\nfunction sendEmail(message) { sent.push(message); }",
            prompt: `
              Write \`handle(request)\` for a contact form's serverless function. \`request\` is \`{ method, body }\`, with \`body\` holding \`name\`, \`email\`, \`message\` and \`website\` (a honeypot field hidden from people). Return \`{ status, body }\`:

              - not \`"POST"\` → \`405\`
              - \`website\` filled in → \`200\` with \`{ ok: true }\`, but **don't** send anything (it's a bot)
              - otherwise validate, trimming each field: \`name\` 1–100 characters, \`email\` shaped like \`x@y.z\`, \`message\` 10–2000 characters. If any fail → \`400\` with \`{ errors: [...] }\`, one string per failing field that starts with the field's name
              - all good → call \`sendEmail({ name, email, message })\` once, return \`200\` with \`{ ok: true }\`
            `,
            starter: `function handle(request) {
  sendEmail(request.body);
  return { status: 200, body: { ok: true } };
}
`,
            solution: `function handle(request) {
  if (request.method !== "POST") return { status: 405, body: { error: "POST only" } };
  const b = request.body || {};
  if (b.website) return { status: 200, body: { ok: true } };   // a bot: pretend, and drop it

  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim();
  const message = String(b.message || "").trim();
  const errors = [];
  if (name.length < 1 || name.length > 100) errors.push("name: 1 to 100 characters");
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) errors.push("email: doesn't look like an email address");
  if (message.length < 10 || message.length > 2000) errors.push("message: 10 to 2000 characters");
  if (errors.length) return { status: 400, body: { errors } };

  sendEmail({ name, email, message });
  return { status: 200, body: { ok: true } };
}
`,
            hints: ["Check the method first, then the honeypot, then the fields — returning as soon as one fails.", "`String(b.name || \"\").trim()` copes with a missing field as well as stray spaces.", "An email shape check: `/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/` — something, @, something, a dot, something."],
            tests: [
              { name: "Anything but POST gets 405", code: `sent.length = 0; $eq(handle({ method: "GET", body: {} }).status, 405); $eq(sent.length, 0, "emails sent");` },
              { name: "A good message is sent, once", code: `sent.length = 0; const r = handle({ method: "POST", body: { name: "Asha", email: "asha@example.org", message: "Interested in collaborating on frailty." } }); $eq(r.status, 200, "status"); $eq(r.body, { ok: true }, "body"); $eq(sent.length, 1, "emails sent"); $eq(sent[0], { name: "Asha", email: "asha@example.org", message: "Interested in collaborating on frailty." });` },
              { name: "A bad email is a 400 naming the field", code: `sent.length = 0; const r = handle({ method: "POST", body: { name: "Asha", email: "asha-at-example", message: "Interested in collaborating." } }); $eq(r.status, 400, "status"); $check(r.body.errors.some((e) => e.startsWith("email")), "errors should include one starting with \\"email\\""); $eq(sent.length, 0, "emails sent");` },
              { name: "Too short a message is refused", code: `sent.length = 0; const r = handle({ method: "POST", body: { name: "Asha", email: "a@example.org", message: "hi" } }); $eq(r.status, 400); $check(r.body.errors.some((e) => e.startsWith("message")), "errors should name message");` },
              { name: "An over-long name is refused", code: `sent.length = 0; const r = handle({ method: "POST", body: { name: "x".repeat(101), email: "a@example.org", message: "A perfectly fine message." } }); $eq(r.status, 400); $check(r.body.errors.some((e) => e.startsWith("name")), "errors should name name");` },
              { name: "Fields are trimmed before checking", code: `sent.length = 0; const r = handle({ method: "POST", body: { name: "   ", email: "a@example.org", message: "A perfectly fine message." } }); $eq(r.status, 400, "a name of only spaces is empty");` },
              { name: "The honeypot drops bots quietly", code: `sent.length = 0; const r = handle({ method: "POST", body: { name: "Bot", email: "b@example.org", message: "Buy cheap watches now!!", website: "http://spam.example" } }); $eq(r.status, 200, "status"); $eq(sent.length, 0, "a bot's message was sent");` },
            ],
          },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-ops",
        title: "Keep it running",
        minutes: 30,
        project: "website",
        summary: "Monitoring with your own uptime agent, renewals, backups, performance and accessibility — the boring things that keep a site alive.",
        keywords: "monitoring uptime agent backups performance lighthouse accessibility renewals",
        objectives: [
          "Point your repository's uptime agent at your new site",
          "Set up the small routines that stop a site quietly dying",
          "Check performance and accessibility with the browser's own tools",
        ],
        blocks: [
          { md: `
            ## Watch it

            Your repository already has an uptime watcher, waiting for an address. In \`agents/data/agents.json\` there's an agent called \`my-site\`, of type \`uptime\`, set to \`"active": false\` with \`"url": "https://example.com"\`. Point it at your site and switch it on, and the hourly workflow will tell you — through ntfy, on your phone — if the site goes down, comes back, or gets slow (its rule calls anything over 4 seconds notable).

            The exercise does that edit in code: the kind of small, careful data change that's easy to get wrong by hand in a large JSON file.
          ` },
          {
            type: "code", id: "uptime", lang: "js", title: "Switch on your uptime agent", prelude: AGENTS_JSON,
            prompt: `
              \`AGENTS_JSON\` is a cut-down copy of your \`agents.json\`. Write \`pointUptimeAt(config, url)\` that returns a **new** config in which the agent with id \`"my-site"\` is active and has \`config.url\` set to \`url\` — with everything else, including its other settings and every other agent, unchanged, and the original not modified.

              Refuse (throw) unless \`url\` starts with \`https://\`.
            `,
            starter: `function pointUptimeAt(config, url) {
  const site = config.agents.find((a) => a.id === "my-site");
  site.active = true;
  site.config.url = url;
  return config;
}

console.log(JSON.stringify(pointUptimeAt(AGENTS_JSON, "https://example.github.io/"), null, 2));
`,
            solution: `function pointUptimeAt(config, url) {
  if (!/^https:\\/\\//.test(url)) throw new Error("use the https:// address");
  const copy = JSON.parse(JSON.stringify(config));
  const site = copy.agents.find((a) => a.id === "my-site");
  if (!site) throw new Error("no agent called my-site");
  site.active = true;
  site.config.url = url;
  return copy;
}

console.log(JSON.stringify(pointUptimeAt(AGENTS_JSON, "https://example.github.io/"), null, 2));
`,
            hints: ["`JSON.parse(JSON.stringify(config))` makes a deep copy you can change freely.", "Check the URL first: `if (!url.startsWith(\"https://\")) throw new Error(...)`."],
            tests: [
              { name: "my-site is on, and points at your site", code: `const out = pointUptimeAt(AGENTS_JSON, "https://dr-example.github.io/"); const s = out.agents.find((a) => a.id === "my-site"); $eq(s.active, true, "active"); $eq(s.config.url, "https://dr-example.github.io/", "url");` },
              { name: "Its other settings survive", code: `const s = pointUptimeAt(AGENTS_JSON, "https://dr-example.github.io/").agents.find((a) => a.id === "my-site"); $eq(s.config.timeoutMs, 15000, "timeoutMs"); $eq(s.rules, [{ when: "above", value: 4000, level: "notable" }], "rules");` },
              { name: "Other agents are untouched", code: `const out = pointUptimeAt(AGENTS_JSON, "https://dr-example.github.io/"); $eq(out.agents.filter((a) => a.id !== "my-site"), AGENTS_JSON.agents.filter((a) => a.id !== "my-site"));` },
              { name: "The original isn't modified", code: `pointUptimeAt(AGENTS_JSON, "https://dr-example.github.io/"); const s = AGENTS_JSON.agents.find((a) => a.id === "my-site"); $eq(s.active, false, "original active"); $eq(s.config.url, "https://example.com", "original url");` },
              { name: "Plain http is refused", code: `await $throws(() => pointUptimeAt(AGENTS_JSON, "http://dr-example.github.io/"), "an http:// address should throw");` },
            ],
            explain: "In the real file, make the same two changes — `\"active\": true` and your address — then run `node agents/runner.mjs --validate` and `node agents/runner.mjs --only my-site --dry-run --force` before you commit. (Uptime findings are about the outside world, so they're safe to run in a public repository.)",
          },
          { md: `
            ## The quiet routines

            - **Renewal.** Domain on auto-renew; a calendar reminder a month before anyway.
            - **Links.** The weekly check from the Actions lesson catches links that rot.
            - **Backups.** Git *is* your backup — every commit, on GitHub and your machine. Export this course's progress and your diary now and then too; they live only in your browser.
            - **Freshness.** A dated "last updated" line, and a quarterly look at the publications list. A site that's visibly stale undermines itself.

            ## Fast and usable

            In Chrome, open your site, then Developer Tools (F12, or right-click → Inspect) → **Lighthouse** → Analyse. It scores performance, accessibility, best practices and search basics, and says what to fix. For a page like yours, the usual findings are oversized images (resize photos to the size they're shown at) and contrast.

            ## Headers you can't set

            GitHub Pages doesn't let you set HTTP security headers. For a static site with no forms, no logins and no third-party scripts, that matters little. If you add scripts from other sites — analytics, embeds — each is code you're trusting with your visitors; add as few as you can. If you want visitor statistics, choose a privacy-friendly service that doesn't set tracking cookies, and say so on the site.
          ` },
        ],
      },

      /* ============================================================ */
      {
        id: "ship-capstone",
        title: "Capstone: ship it",
        minutes: 45,
        project: "website",
        summary: "Your website, live, checked and watched — and then tell people where it is.",
        keywords: "launch checklist capstone ship website live",
        objectives: [
          "Launch your site with everything from this track in place",
          "Confirm it's live from the outside",
          "Make it findable",
        ],
        blocks: [
          { md: `
            ## The launch checklist

            Everything in this track, in the order you'd do it. Tick as you go; it saves in this browser.
          ` },
          {
            type: "widget", id: "launch", widget: "checklist", kind: "Checklist", title: "Launch",
            opts: { items: [
              { id: "final", text: "Final \`index.html\` from the coding capstone, read through once more on a phone-sized preview" },
              { id: "repo", text: "In a GitHub repository, committed with a sensible message, pushed to \`main\`" },
              { id: "pages", text: "GitHub Pages on: Settings → Pages → Deploy from a branch → main / (root)" },
              { id: "checks", text: "Site checks workflow and \`check-site.mjs\` added; the Actions tab shows a green tick" },
              { id: "https", text: "Loads over https:// — Enforce HTTPS ticked" },
              { id: "domain", text: "Custom domain set up and verified — or a decision to stay on github.io for now" },
              { id: "uptime", text: "Your repository's \`my-site\` uptime agent pointed at it and switched on" },
              { id: "phi", text: "Read it once more for anything about a patient, or anything you wouldn't say in a lecture" },
            ] },
          },
          { type: "widget", id: "live", widget: "siteCheck", kind: "Check", title: "Confirm it's live" },
          { md: `
            ## Make it findable

            - Add the address to your **ORCID** record, **Google Scholar** profile, **LinkedIn** and email signature.
            - Put it on your next **poster** and **slide deck** — a QR code works well on posters.
            - Search engines find a linked site within days or weeks; there's nothing to submit for a page like this.

            ## What you've built

            A website you wrote line by line, under version control, published on infrastructure you understand, checked automatically on every change, and watched by an agent that will tell you if it ever goes down. That's a genuinely professional setup — and every piece of it is something you can now explain, change and fix.

            Log it to your diary. It's worth a line.
          ` },
        ],
      },
    ],
  });

  // For selftest.mjs: every challenge, so their solutions can be replayed.
  CC.content.gitChallenges = GIT_BASICS.concat(GIT_BRANCHES, GIT_REMOTE);
})(window.CC);
