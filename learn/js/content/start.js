/* ================================================
   CODE CLINIC — content/start.js
   Start here: what the course is for, how it works, and the tools to
   install for when you leave the browser.
   ================================================ */
(function (CC) {
  "use strict";

  CC.content.addTrack({
    id: "start",
    order: 0,
    icon: "▸",
    title: "Start here",
    summary: "What you're going to build, how the exercises work, and setting up your own machine.",
    outcome: "A plan that fits around your rota, and a workbench ready for when the projects leave the browser.",
    lessons: [
      {
        id: "start-how",
        title: "How this course works",
        minutes: 15,
        summary: "Two projects, four tracks, and why a clinician with an AI assistant still needs to read code.",
        objectives: [
          "Say what the two projects are and which tracks build each",
          "Run an exercise, read its checks, and know where your work is kept",
          "Pick a pace you can keep",
        ],
        blocks: [
          { md: `
            ## Two projects

            This course is organised around two things you said you wanted, not around a syllabus:

            1. **Your own website** — a personal academic site: who you are, your clinical and research interests, your publications, how to reach you. Written by hand, so you understand every line; checked automatically; live on the internet at an address you own.
            2. **A research toolkit** — the ability to take a question from PICO to a defensible result: search the literature, clean a dataset, describe a cohort, compare groups, draw a Kaplan–Meier curve, and write it up reproducibly. Plus an AI literature assistant that is only allowed to cite what it actually found.

            ## Four tracks

            | Track | What it teaches | Builds |
            |---|---|---|
            | **Coding** | HTML, CSS and JavaScript, then Python for data | The website; the habits that make analysis code trustworthy |
            | **Agentic AI** | How language models work, prompting, tools, the agent loop, guardrails, evaluation | The literature assistant |
            | **Deployment** | The web, git, GitHub, Pages, domains, Actions, keeping a site running | The website, live |
            | **Healthcare research** | Questions, ethics, searching, cleaning, Table 1, risk and odds, survival, reproducibility | The toolkit, and a written-up mini-study |

            They interlock rather than run in sequence: Coding and Deployment together put your site online about halfway through; the research track leans on the coding lessons about data; the agent lab leans on the research track's searching lesson.

            ## How the exercises work

            Exercises have an editor, a **Run** button (or Ctrl/⌘ + Enter), and a set of checks. Your code runs here, in your browser — JavaScript in a sandboxed worker, HTML in a sealed-off preview, Python through Pyodide — and is never sent anywhere. When every check passes, the exercise is done; when every exercise in a lesson is done, so is the lesson.

            Stuck? Each exercise has hints that get more specific, and an answer you can look at — after a couple of honest attempts, because seeing the answer first removes most of what the exercise was for.

            > [!NOTE] Where your work lives
            > Progress, your code, and your notes are saved in this browser's storage. Nothing goes to a server. Use **⤓** in the top bar to export everything as one file (do this now and then), and **⤒** to bring it back on another machine. Finished a lesson? "Log this to today's diary" adds it to the diary next door as a done task.

            ## Why learn this when you have Claude?

            Fair question — you already use Claude Code to build things. The answer is the same as for any tool you'd use on a patient: you need to know enough to check it. AI writes code fast and is often right; when it's wrong, it's wrong confidently and in ways that look plausible. A unit conversion off by a factor of four, a survival curve that quietly drops censored patients, a citation to a paper that doesn't exist. The course aims to make you the person who catches those — a reviewer who can read code, run it, test it and say no — and then to make you fast by letting AI do the typing.

            > [!SAFETY] One rule for the whole course
            > No real patient data — not in an exercise, not in a prompt, not "just to test it". Every dataset here is simulated or fictional, and labelled as such. Real data belongs in systems your institution has approved for it, under an ethics approval that covers what you're doing.
          ` },
          {
            type: "quiz", id: "q-where",
            question: "You finish ten lessons on your work computer, then open the course on your laptop at home. What do you see?",
            options: [
              "Your ten lessons, because progress syncs to your account",
              "A fresh start — progress lives in each browser, so you'd export it from one and import it on the other",
              "Your ten lessons, because the course saves to GitHub",
            ],
            answer: 1,
            explain: "There's no account and no server: everything is stored in the browser you used. That's a privacy feature — and the reason Export exists.",
            why: { 0: "There's no account here — nothing is sent to a server.", 2: "Nothing is saved to GitHub unless you put it there yourself." },
          },
          { md: `
            ## Pick a pace

            Most fellowship weeks have less slack than they look like they will. Choose a number of hours you could give in a bad week, not a good one — a pace you keep beats a pace you plan.
          ` },
          { type: "widget", id: "pace", widget: "pacePlanner", optional: true, kind: "Plan" },
        ],
      },
      {
        id: "start-workbench",
        title: "Set up your workbench",
        minutes: 25,
        summary: "The free tools you'll want when your website and analyses move onto your own machine.",
        keywords: "install vscode git node python github",
        objectives: [
          "Install a code editor, git, Node.js and Python",
          "Create a GitHub account protected with two-factor authentication",
          "Open this course from your own computer",
        ],
        blocks: [
          { md: `
            Everything in the course runs in the browser, so you can skip this lesson for now and come back when the deployment track sends you here. But it helps to have the tools ready.

            ## What to install

            | Tool | What it's for | Check it worked |
            |---|---|---|
            | **VS Code** (code.visualstudio.com) | Editing files, with a built-in terminal and git buttons | Open it |
            | **Git** (git-scm.com) | Version control — the deployment track's subject | \`git --version\` |
            | **Node.js, LTS version** (nodejs.org) | Runs JavaScript outside a browser — this repository's agents and self-tests use it | \`node --version\` |
            | **Python 3** (python.org) | Data analysis | \`python3 --version\` (on Windows, \`py --version\`) |

            On a Mac, the first time you type \`git\` in Terminal it offers to install Apple's command-line tools — accepting that is enough. On Windows, Git for Windows also installs "Git Bash", a terminal where every command in this course works as written.

            ## A GitHub account

            Sign up at github.com with an email you'll keep after training ends — a personal address, not a hospital one you'll lose when you move. Then turn on **two-factor authentication** (Settings → Password and authentication). Your repositories will hold your website and your analysis code; that's worth a second factor.

            ## Claude Code, outside the browser

            You already use Claude Code on the web. The same tool runs in a terminal and inside VS Code, working directly on files on your machine. Its documentation (code.claude.com/docs) has the current installation steps. Later lessons cover how to work with it well: small steps, a plan before code, and reading every diff.

            ## Opening this course on your own machine

            This course is a folder of plain files in your repository (\`learn/\`). Browsers are wary of pages opened straight from disk, so serve the folder instead — from the repository's top folder:

            \`\`\`bash
            python3 -m http.server 8000
            \`\`\`

            then visit **http://localhost:8000/learn/**. That's also how you'll preview your own website before publishing it.

            > [!TIP] The terminal, briefly
            > A terminal is a text conversation with your computer. You'll need about six commands in this whole course: \`cd folder\` (go into a folder), \`cd ..\` (go up one), \`ls\` (list files — \`dir\` on Windows' own prompt), \`pwd\` (where am I?), and whatever tool you're running. Up-arrow recalls the last command. Nothing you type in this course deletes anything you didn't create.
          ` },
          {
            type: "widget", id: "setup-list", widget: "checklist", optional: true, kind: "Checklist", title: "Your workbench",
            opts: { items: [
              { id: "github", text: "GitHub account created, with two-factor authentication on" },
              { id: "vscode", text: "VS Code installed" },
              { id: "git", text: "\`git --version\` prints a version" },
              { id: "node", text: "\`node --version\` prints v20 or later" },
              { id: "python", text: "\`python3 --version\` prints 3.10 or later" },
              { id: "served", text: "Opened this course at http://localhost:8000/learn/", detail: "Optional for now — needed by the deployment track." },
            ] },
          },
        ],
      },
    ],
  });
})(window.CC);
