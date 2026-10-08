/* ================================================
   CODE CLINIC — content/research.js
   Track 4: from a clinical question to a reproducible, written-up
   result — PICO, ethics, searching, cleaning, Table 1, risks and odds,
   confounding, survival — on MOVE-EARLY, a simulated cohort.

   Every number quoted in these lessons is computed here, from the same
   seeded cohort the widgets and exercises use, so the prose can't drift
   from the analysis.
   ================================================ */
(function (CC) {
  "use strict";

  const S = CC.stats;
  const U = CC.util;
  const f2 = (x) => U.fmtNum(x, 2);
  const pct = (x) => `${(x * 100).toFixed(1)}%`;

  const COHORT = S.makeCohort({ seed: S.SEED });
  const EMP = COHORT.filter((r) => r.emp === 1);
  const USUAL = COHORT.filter((r) => r.emp === 0);
  const tab = (rows) => {
    const e = rows.filter((r) => r.emp === 1), u = rows.filter((r) => r.emp === 0);
    const a = e.filter((r) => r.readmit30 === 1).length, c = u.filter((r) => r.readmit30 === 1).length;
    return { a, b: e.length - a, c, d: u.length - c };
  };
  const CRUDE = tab(COHORT);
  const CT = S.twoByTwo(CRUDE.a, CRUDE.b, CRUDE.c, CRUDE.d);
  const BANDS = [[1, 3], [4, 4], [5, 5], [6, 8]];
  const MH = S.mantelHaenszel(BANDS.map(([lo, hi]) => tab(COHORT.filter((r) => r.cfs >= lo && r.cfs <= hi))));
  const KM_E = S.kaplanMeier(EMP), KM_U = S.kaplanMeier(USUAL);
  const LR = S.logRank(EMP, USUAL);
  const EVENT_STEPS_E = KM_E.steps.filter((st) => st.events > 0);
  const MID = EVENT_STEPS_E[Math.floor(EVENT_STEPS_E.length / 2)];
  const CFS_MEDIAN = [S.median(EMP.map((r) => r.cfs)), S.median(USUAL.map((r) => r.cfs))];

  // The capstone analyses the cleaned spreadsheet, as a real study would.
  const CLEAN = S.cleanCohort(S.makeMessyCSV({ seed: S.SEED }));
  const CLEAN_CT = (() => { const t = tab(CLEAN); return S.twoByTwo(t.a, t.b, t.c, t.d); })();
  const CLEAN_MH = S.mantelHaenszel(BANDS.map(([lo, hi]) => tab(CLEAN.filter((r) => r.cfs >= lo && r.cfs <= hi))));

  CC.content.addTrack({
    id: "res",
    order: 4,
    icon: "∑",
    title: "Healthcare research",
    summary: "From a clinical question to a reproducible result: PICO and study design, ethics and data protection, searching, cleaning, Table 1, risks and odds, confounding, survival analysis — and the write-up.",
    outcome: "A complete, reproducible analysis of a (simulated) cohort that you could defend at a journal club, a structured abstract, and the habits that keep real studies honest.",
    lessons: [
      /* ============================================================ */
      {
        id: "res-question",
        title: "From a clinical question to a research question",
        minutes: 35,
        project: "research",
        summary: "PICO, FINER, and which study designs can answer which questions.",
        keywords: "pico finer study design rct cohort case control bias confounding",
        objectives: [
          "Turn a clinical uncertainty into a structured PICO question",
          "Judge a question with FINER",
          "Match a question to a study design, and name the biases each invites",
        ],
        blocks: [
          { md: `
            ## Start from an uncertainty

            Good research questions come from moments on the ward when you didn't know, and found nobody else did either: *we keep getting older patients out of bed early — does it actually keep them out of hospital afterwards?*

            ## PICO

            | | Question | Here |
            |---|---|---|
            | **P**opulation | Who? | Adults aged 65+ admitted to general medical wards |
            | **I**ntervention / exposure | What? | Mobilisation started within 48 hours |
            | **C**omparison | Against what? | Usual care |
            | **O**utcome | Measured how? | Readmission within 30 days; death or readmission within a year |
            | (**T**ime) | Over what period? | One year |

            Writing it out forces decisions you'd otherwise make by accident: which patients, what counts as "early", which outcome is *primary* — the one the study is sized for and the conclusion rests on.

            ## Is it worth doing? FINER

            **F**easible (enough patients, time, data, skills?) · **I**nteresting (to you, and to someone who'd use the answer) · **N**ovel (search first — next lessons) · **E**thical · **R**elevant (would the answer change practice or the next study?).

            ## Designs and what they can claim

            | Design | Does | Can show | Watch for |
            |---|---|---|---|
            | **Randomised trial** | Chance decides who gets the intervention | Cause and effect | Losses to follow-up, unblinded outcome assessment |
            | **Cohort** | Follow exposed and unexposed people forward | Association; cause only with care | **Confounding**, selection, missing data |
            | **Case–control** | Compare past exposures of people with and without the outcome | Association, for rare outcomes | Recall and selection bias |
            | **Cross-sectional** | One snapshot | Prevalence; association | Can't tell which came first |
            | **Case series** | Describe patients | Hypotheses | No comparison group |
            | **Systematic review** | Find and combine all the studies | The state of the evidence | Only as good as what it combines |

            ## Confounding, first meeting

            Patients who are mobilised early are not the same as those who aren't: they're fitter, which is *why* they're mobilised early — and fitter patients get readmitted less anyway. A comparison that ignores that will credit the programme with what was really the patients' fitness. That's **confounding by indication**, and it runs through this whole track: the simulated cohort you'll analyse was built to contain it, so you can watch it happen and then deal with it.
          ` },
          { type: "widget", id: "pico", widget: "pico", kind: "Builder", title: "Your question, structured", intro: "Use your own question, or the example from above. The builder turns it into a sentence and a first PubMed search." },
          {
            type: "quiz", id: "q-design",
            question: "You want to know whether early mobilisation *causes* fewer readmissions, and a randomised trial is impossible on your ward. What's the strongest realistic design — and its main threat?",
            options: [
              "A case series of well-mobilised patients; threat: small numbers",
              "A cohort study comparing mobilised and non-mobilised patients; threat: confounding — measure frailty and adjust for it",
              "A cross-sectional survey of ward staff; threat: recall bias",
            ],
            answer: 1,
            explain: "A cohort with a comparison group and good measurement of the confounders is the workhorse when you can't randomise. Its credibility depends on measuring what drives both the exposure and the outcome — here, frailty above all.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "res-ethics",
        title: "Ethics, consent and data protection",
        minutes: 35,
        project: "research",
        summary: "What has to be in place before you collect a single data point — and how to handle the data once you have it.",
        keywords: "ethics committee irb consent icmr helsinki gcp hipaa data protection deidentification",
        objectives: [
          "List what must be approved before data collection starts",
          "Know the difference between identifiable, pseudonymised and anonymised data",
          "Store and move research data safely",
        ],
        blocks: [
          { md: `
            ## Before any data

            Research with people, or their records, needs approval from a **research ethics committee** (an IRB in the US) *before* it starts — including retrospective chart reviews. Your own goals file records "ethics approval through" for your paper, so you've done this once; the principles behind it:

            - **The Declaration of Helsinki** (World Medical Association) — the foundation: participants' welfare comes before the research.
            - **Good Clinical Practice** (ICH E6) for trials.
            - **In India**, the ICMR *National Ethical Guidelines for Biomedical and Health Research Involving Human Participants* (2017), review by a registered ethics committee, and prospective registration of trials with the Clinical Trials Registry – India (CTRI) before the first participant is enrolled.

            ## Consent

            Prospective studies usually need informed consent. For research on existing records, ethics committees can approve a **waiver of consent** when the research couldn't practicably be done otherwise and the risk is minimal — but it is the committee's decision, recorded in your approval, never one you make alone.

            ## Three kinds of data

            | | Means | Example |
            |---|---|---|
            | **Identifiable** | Points to a person directly | Name, record number, date of birth |
            | **Pseudonymised** | Identifiers replaced by a code; a key links back | Study ID "P037"; the key is locked away separately |
            | **Anonymised** | Nobody could reasonably re-identify anyone, even with other information | Rare in practice, and harder than it looks |

            Most research datasets are pseudonymised — which means they're still personal data under most laws, and still need protecting.

            ## The 18 identifiers

            The US HIPAA "Safe Harbor" method lists eighteen identifiers to remove. It's a US rule, but a useful checklist anywhere:

            | | |
            |---|---|
            | Names | Geographic units smaller than a state (with narrow exceptions for ZIP codes) |
            | All elements of dates (except year) tied to a person, and all ages over 89 | Telephone numbers |
            | Fax numbers | Email addresses |
            | Social security numbers | Medical record numbers |
            | Health plan beneficiary numbers | Account numbers |
            | Certificate and licence numbers | Vehicle identifiers and number plates |
            | Device identifiers and serial numbers | Web addresses (URLs) |
            | IP addresses | Biometric identifiers, such as fingerprints and voice prints |
            | Full-face photographs and comparable images | Any other unique identifying number, characteristic or code |

            ## Handling the data

            - **Minimise.** Collect only what the analysis needs. Date of birth when age will do is a liability.
            - **Pseudonymise at collection**, and keep the linkage key separate — different place, different access.
            - **Store it where your institution approves**, encrypted, with access limited to the named team. Not a personal cloud drive, not a USB stick, not your email.
            - **Never in a code repository.** Your repository's \`.gitignore\` keeps \`agents/private/\` out of git for exactly this reason; do the same for a \`data/\` folder in any analysis project.
            - **Never in an unapproved AI tool** — see the agentic-AI track.
            - **Plan its end**: how long it's kept, and how it's destroyed.
          ` },
          {
            type: "widget", id: "ethics-list", widget: "checklist", kind: "Checklist", title: "Before you collect any data",
            opts: { items: [
              { id: "protocol", text: "A written protocol: question, design, outcomes, sample size, analysis plan" },
              { id: "approval", text: "Ethics committee approval in hand — covering consent or a waiver of it" },
              { id: "register", text: "Registered if it's a trial (CTRI / ClinicalTrials.gov) — before the first participant" },
              { id: "dmp", text: "A data management plan: what's collected, where it's stored, who can access it, when it's destroyed" },
              { id: "minimal", text: "The data collection form asks only for what the analysis needs" },
              { id: "pseudo", text: "Study IDs instead of identifiers, with the linkage key stored separately" },
              { id: "tools", text: "Every tool that will touch the data — including any AI tool — is approved for it" },
            ] },
          },
          {
            type: "quiz", id: "q-safe-harbor",
            question: "Which of these are among the HIPAA Safe Harbor identifiers? Choose all that apply.",
            options: ["The date of admission", "An age of 93", "A pacemaker's serial number", "The diagnosis", "A potassium of 5.9 mmol/L"],
            answer: [0, 1, 2],
            explain: "Dates tied to a person (other than the year), ages over 89, and device serial numbers are all on the list. Diagnoses and results aren't identifiers by themselves — which is why they're what research datasets keep.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "res-search",
        title: "Searching the literature like a machine",
        minutes: 40,
        project: "research",
        summary: "PubMed syntax that finds what you mean, and the E-utilities API that lets code search for you.",
        keywords: "pubmed search mesh tiab boolean eutils api esearch literature",
        objectives: [
          "Write PubMed searches with field tags, Boolean operators and phrases",
          "Build a search from PICO concepts in code",
          "Call PubMed's E-utilities API, politely",
        ],
        blocks: [
          { md: `
            ## How a good search is shaped

            Each PICO concept becomes a group of synonyms joined by **OR**; the groups are joined by **AND**:

            \`\`\`text
            ("older adults"[tiab] OR elderly[tiab] OR aged[mh])
            AND ("early mobilisation"[tiab] OR "early mobilization"[tiab] OR "early ambulation"[tiab])
            AND (readmission[tiab] OR "patient readmission"[mh])
            \`\`\`

            | Syntax | Means |
            |---|---|
            | \`term[tiab]\` | in the title or abstract |
            | \`term[mh]\` | indexed with that **MeSH** heading — NLM's controlled vocabulary, which catches papers that use different words for the same idea |
            | \`term[pt]\` | publication type, e.g. \`randomized controlled trial[pt]\` |
            | \`"two words"\` | a phrase |
            | \`mobili*\` | truncation: mobilise, mobilisation, mobilization… |
            | \`AND\`, \`OR\`, \`NOT\` | in capitals; brackets group them |

            Spelling matters — British and American variants are different words to a search engine, which is why the example has both. PubMed's **Advanced** search shows exactly how it interpreted your query (the "details" of each search in the History panel); check it.

            ## Sensitive or specific

            A search for a systematic review aims to be **sensitive** — miss nothing, screen thousands. A search to answer a question on the ward aims to be **specific** — find the few best papers fast. PubMed's "Best Match" sort and filters (article type, date) help with the second. For the first, work with a librarian: it's a specialist skill, and review methods expect it.

            ## Searching from code: E-utilities

            NCBI runs a free API, the **E-utilities**. The two calls the agent lab uses:

            - \`esearch.fcgi?db=pubmed&term=…&retmode=json&retmax=20\` → the matching PMIDs
            - \`esummary.fcgi?db=pubmed&id=…&retmode=json\` → titles, journals, dates for those PMIDs

            (\`efetch.fcgi\` returns full records, abstracts included.) NCBI asks programs to send \`tool\` and \`email\` parameters so they can contact you about problems, and to stay under three requests a second without an API key (ten with one).

            > [!TIP] Saved searches
            > With a free My NCBI account, PubMed will email you new results for a saved search. The agentic-AI track's last lesson builds the same thing into your own repository's agents.
          ` },
          {
            type: "code", id: "query", lang: "js", title: "Build a search from concepts",
            prompt: `
              Write \`buildQuery(concepts, design)\`. \`concepts\` is an array of synonym lists. Each term becomes \`term[tiab]\`, with **multi-word terms in double quotes**: \`"older adults"[tiab]\`. A group with several terms is joined by \` OR \` inside brackets; a group of one has no brackets. Groups are joined by \` AND \`. Trim terms, and skip empty terms and empty groups.

              If \`design\` is \`"rct"\`, add \` AND randomized controlled trial[pt]\`; if \`"review"\`, add \` AND systematic review[pt]\`.
            `,
            starter: `function buildQuery(concepts, design) {
  return concepts.map((group) => group.join(" OR ")).join(" AND ");
}

console.log(buildQuery([["older adults", "elderly"], ["early mobilisation"], ["readmission"]], "rct"));
`,
            solution: `function buildQuery(concepts, design) {
  const tag = (term) => (/\\s/.test(term) ? '"' + term + '"[tiab]' : term + "[tiab]");
  const groups = concepts
    .map((group) => group.map((t) => t.trim()).filter(Boolean).map(tag))
    .filter((group) => group.length)
    .map((group) => (group.length === 1 ? group[0] : "(" + group.join(" OR ") + ")"));
  let query = groups.join(" AND ");
  if (design === "rct") query += " AND randomized controlled trial[pt]";
  if (design === "review") query += " AND systematic review[pt]";
  return query;
}

console.log(buildQuery([["older adults", "elderly"], ["early mobilisation"], ["readmission"]], "rct"));
`,
            hints: ["Do it in stages: trim and drop empty terms, tag each term, drop empty groups, bracket the groups with more than one term, then join.", "`/\\s/.test(term)` is true when a term has a space in it."],
            tests: [
              { name: "One term", code: `$eq(buildQuery([["frailty"]]), "frailty[tiab]");` },
              { name: "Synonyms in brackets, phrases in quotes", code: `$eq(buildQuery([["older adults", "elderly"], ["readmission"]]), '("older adults"[tiab] OR elderly[tiab]) AND readmission[tiab]');` },
              { name: "A design filter", code: `$eq(buildQuery([["delirium"]], "rct"), "delirium[tiab] AND randomized controlled trial[pt]"); $eq(buildQuery([["delirium"]], "review"), "delirium[tiab] AND systematic review[pt]");` },
              { name: "Stray spaces and empty terms are cleaned up", code: `$eq(buildQuery([[" frailty ", ""]]), "frailty[tiab]");` },
              { name: "Empty groups are skipped", code: `$eq(buildQuery([["delirium"], []]), "delirium[tiab]");` },
            ],
          },
          {
            type: "code", id: "eutils", lang: "js", title: "The URL for an E-utilities search",
            prompt: "Write `esearchUrl(query, retmax)` returning the full `esearch.fcgi` URL for PubMed, with `db=pubmed`, `term`, `retmode=json` and `retmax` (default 20) — and `tool=code-clinic`. Build the query string with `URLSearchParams`, which encodes spaces, quotes and brackets for you.",
            starter: `function esearchUrl(query, retmax) {
  return "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?term=" + query;
}
`,
            solution: `function esearchUrl(query, retmax = 20) {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: String(retmax),
    tool: "code-clinic",
  });
  return "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" + params;
}
`,
            hints: ["`new URLSearchParams({ db: \"pubmed\", term: query, … })` — then `\"…esearch.fcgi?\" + params` turns it into an encoded string.", "A default parameter: `function esearchUrl(query, retmax = 20)`."],
            tests: [
              { name: "The right endpoint", code: `const u = new URL(esearchUrl("frailty")); $eq(u.origin + u.pathname, "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");` },
              { name: "PubMed, JSON, and 20 results by default", code: `const p = new URL(esearchUrl("frailty")).searchParams; $eq(p.get("db"), "pubmed", "db"); $eq(p.get("retmode"), "json", "retmode"); $eq(p.get("retmax"), "20", "retmax");` },
              { name: "The query survives encoding exactly", code: `const q = '("older adults"[tiab] OR elderly[tiab]) AND readmission[tiab]'; $eq(new URL(esearchUrl(q)).searchParams.get("term"), q);` },
              { name: "retmax can be set", code: `$eq(new URL(esearchUrl("frailty", 5)).searchParams.get("retmax"), "5");` },
              { name: "It says who's asking", code: `$eq(new URL(esearchUrl("frailty")).searchParams.get("tool"), "code-clinic");` },
            ],
            explain: "The agent lab and your PubMed watcher build exactly this URL. Paste one into a browser tab to see the JSON PubMed sends back.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "res-clean",
        title: "Data cleaning you can defend",
        minutes: 45,
        project: "research",
        summary: "Turning a messy spreadsheet into analysable data with written rules — never by hand, never over the original.",
        keywords: "data cleaning tidy data missing values duplicates data dictionary",
        objectives: [
          "Write cleaning rules down before applying them",
          "Distinguish missing, impossible and inconsistently coded values, and treat each deliberately",
          "Clean a dataset in code, reproducibly, and count what was dropped",
        ],
        blocks: [
          { md: `
            ## Rules first

            Cleaning by hand in a spreadsheet — fixing a cell here, deleting a row there — leaves no record, can't be repeated when the data is updated, and quietly changes the result. Cleaning in code turns every decision into a line someone can read, question and rerun. Three principles:

            1. **The raw data is read-only.** Clean into a new dataset; never save over the original.
            2. **Write the rules down first** — in a data dictionary and an analysis plan — so they're decided on principle, not tuned to the answer.
            3. **Count everything you drop**, and why. It goes in your flow diagram, and reviewers ask.

            ## Tidy data

            One row per patient (or per observation), one column per variable, one value per cell. "BP 140/90" in one cell is two variables; "diabetes (type 2)" is a variable and a qualifier.

            ## A data dictionary

            For each variable: its name, meaning, type, units, allowed values or range, and how missing is coded. It's the contract the cleaning code enforces.

            ## Four kinds of problem

            | Problem | Example | Usual treatment |
            |---|---|---|
            | **Missing** | age blank or "NA" | Keep the row; record as missing; handle in the analysis |
            | **Impossible** | age 999 | Treat as missing (and query it at source if you can) |
            | **Inconsistent coding** | sex as F, f, Female, " F" | Map to one code |
            | **Duplicates** | a patient entered twice | Keep one, by a stated rule |

            Some problems disqualify a row — here, a follow-up time that's zero or negative can't be analysed. Decide which, in advance.

            ## The spreadsheet you've been sent

            The MOVE-EARLY data, as it might arrive from a ward: below are its first rows and a tally of its problems.
          ` },
          { type: "widget", id: "peek", widget: "dataPeek", kind: "Data", title: "The raw file", optional: true },
          {
            type: "code", id: "clean", lang: "js", title: "Clean it, by the rules", uses: ["messyCSV"],
            prompt: `
              \`MESSY_CSV\` holds the raw file (no quoted fields, so splitting lines on \`,\` is safe here). Write \`cleanRecord(raw)\` for one row of strings, then \`cleanAll(csvText)\`.

              **\`cleanRecord\` rules:**
              - \`sex\`: trimmed, any case — \`f\`/\`female\` → \`"F"\`, \`m\`/\`male\` → \`"M"\`. Anything else: **drop the row** (return \`null\`).
              - \`age\`: blank or \`NA\` (any case) → \`null\`; otherwise a number, but outside 18–110 → \`null\`. These rows are **kept**.
              - \`emp\`: trimmed, any case — \`yes\`/\`y\`/\`1\`/\`true\` → \`1\`, \`no\`/\`n\`/\`0\`/\`false\` → \`0\`. Anything else: drop.
              - \`time\`: a number; zero, negative or not a number: drop.
              - \`id\` trimmed; \`cfs\`, \`diabetes\`, \`los\`, \`readmit30\`, \`event\` as numbers.

              **\`cleanAll\`**: split into lines, use the first as the header, make an object per line, clean each, drop the \`null\`s, then drop repeated \`id\`s, keeping the first.
            `,
            starter: `function cleanRecord(raw) {
  return {
    id: raw.id,
    age: Number(raw.age),
    sex: raw.sex,
    cfs: Number(raw.cfs),
    diabetes: Number(raw.diabetes),
    emp: Number(raw.emp),
    los: Number(raw.los),
    readmit30: Number(raw.readmit30),
    time: Number(raw.time),
    event: Number(raw.event),
  };
}

function cleanAll(csvText) {
  const lines = csvText.trim().split("\\n");
  const head = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const raw = {};
    head.forEach((h, i) => { raw[h] = cells[i]; });
    return cleanRecord(raw);
  });
}

console.log(cleanAll(MESSY_CSV).length, "rows");
`,
            solution: `function cleanRecord(raw) {
  const sexWord = String(raw.sex).trim().toLowerCase();
  const sex = sexWord === "f" || sexWord === "female" ? "F" : sexWord === "m" || sexWord === "male" ? "M" : null;

  const ageText = String(raw.age).trim();
  let age = ageText === "" || ageText.toUpperCase() === "NA" ? null : Number(ageText);
  if (age !== null && !(Number.isFinite(age) && age >= 18 && age <= 110)) age = null;

  const empWord = String(raw.emp).trim().toLowerCase();
  const emp = ["yes", "y", "1", "true"].includes(empWord) ? 1 : ["no", "n", "0", "false"].includes(empWord) ? 0 : null;

  const time = Number(raw.time);
  if (sex === null || emp === null || !Number.isFinite(time) || time <= 0) return null;

  return {
    id: String(raw.id).trim(),
    age, sex,
    cfs: Number(raw.cfs),
    diabetes: Number(raw.diabetes),
    emp,
    los: Number(raw.los),
    readmit30: Number(raw.readmit30),
    time,
    event: Number(raw.event),
  };
}

function cleanAll(csvText) {
  const lines = csvText.trim().split("\\n");
  const head = lines[0].split(",").map((h) => h.trim());
  const seen = new Set();
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const raw = {};
    head.forEach((h, i) => { raw[h] = cells[i] === undefined ? "" : cells[i]; });
    const row = cleanRecord(raw);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

console.log(cleanAll(MESSY_CSV).length, "rows");
`,
            hints: [
              "Normalise before comparing: `String(raw.sex).trim().toLowerCase()`.",
              "Age has two steps: blank/NA → null; then, if it's a number outside 18–110, also null. `Number(\"999\")` is 999, and `Number(\"\")` is 0 — which is why blanks are caught first.",
              "Duplicates: keep a `Set` of ids you've already kept; skip a row if its id is in it.",
            ],
            tests: [
              { name: "One messy row, cleaned", code: `$eq(cleanRecord({ id: " P001", age: "NA", sex: " female", cfs: "4", diabetes: "0", emp: "Y", los: "6", readmit30: "0", time: "200", event: "1" }), { id: "P001", age: null, sex: "F", cfs: 4, diabetes: 0, emp: 1, los: 6, readmit30: 0, time: 200, event: 1 });` },
              { name: "An impossible age is kept as missing", code: `$eq(cleanRecord({ id: "P002", age: "999", sex: "M", cfs: "3", diabetes: "1", emp: "no", los: "4", readmit30: "1", time: "30", event: "1" }).age, null);` },
              { name: "A non-positive follow-up time drops the row", code: `$eq(cleanRecord({ id: "P003", age: "70", sex: "F", cfs: "3", diabetes: "0", emp: "1", los: "4", readmit30: "0", time: "-30", event: "0" }), null);` },
              { name: "An unrecognised sex drops the row", code: `$eq(cleanRecord({ id: "P004", age: "70", sex: "X", cfs: "3", diabetes: "0", emp: "1", los: "4", readmit30: "0", time: "30", event: "0" }), null);` },
              { name: "No duplicate ids survive", code: `const ids = cleanAll(MESSY_CSV).map((r) => r.id); $eq(ids.length, new Set(ids).size, "rows vs distinct ids");` },
              { name: "The whole file matches the reference cleaning", code: `const mine = cleanAll(MESSY_CSV), ref = __stats.cleanCohort(MESSY_CSV); $eq(mine.length, ref.length, "rows kept"); for (let i = 0; i < ref.length; i++) $eq(mine[i], ref[i], "row " + ref[i].id);` },
            ],
            explain: "That function is your cleaning protocol, executable. Rerun it on next month's export and you get the same decisions. Report the counts: rows received, duplicates removed, rows excluded and why, values set to missing.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "res-describe",
        title: "Describe your cohort: Table 1",
        minutes: 40,
        project: "research",
        summary: "Means or medians, missing data, and balance — the table every paper starts with.",
        keywords: "table 1 descriptive statistics mean median sd iqr standardised mean difference",
        objectives: [
          "Choose mean (SD) or median (IQR) for a variable, and say why",
          "Compute summary statistics exactly as statistical software does",
          "Read a Table 1 for imbalance — without p-values",
        ],
        blocks: [
          { md: `
            ## What Table 1 is for

            It tells the reader **who you studied** — so they can judge whether your results apply to their patients — and, in a comparative study, **how the groups differed at the start**.

            ## Mean or median?

            - **Mean (SD)** for roughly symmetric variables — age, usually.
            - **Median (IQR)** for skewed ones — length of stay, costs, most lab values, scales like the Clinical Frailty Scale. A few very long stays drag a mean upwards; the median doesn't notice them.
            - **n (%)** for categories — and always say what the percentage is of.

            The **SD** describes spread among patients; the standard error describes uncertainty in an estimate. Table 1 wants the SD.

            ## Quartiles have definitions

            There are several ways to compute a quartile from data, and software differs. R's default, numpy's default and Excel's \`QUARTILE.INC\` all use linear interpolation between the sorted values: for proportion *p* of *n* values, go to position *(n − 1) × p* (counting from 0) and interpolate. Matching that exactly is how you check your code against someone else's.

            ## Missing data

            Report how many are missing for each variable. A variable missing for 30% of patients is a finding in itself — and complete-case analysis quietly assumes the missing are like the rest.

            ## Balance, not p-values

            In a randomised trial, baseline differences are chance by definition, so CONSORT discourages testing them. In an observational study, the question isn't "is the difference significant?" but "is it big enough to matter?" — answered with the **standardised mean difference** (SMD): the difference between groups, in standard deviations. Above about 0.1 is the usual flag.
          ` },
          {
            type: "code", id: "summarise", lang: "js", title: "Summary statistics, exactly", uses: ["cohort"],
            prompt: `
              Write \`summarise(values)\` returning \`{ n, missing, mean, sd, median, q1, q3 }\`. Values that are \`null\`, \`undefined\` or \`NaN\` count as **missing** and are left out of everything else. \`sd\` is the sample SD (divide by n − 1); quartiles interpolate at position *(n − 1) × p* in the sorted values.

              \`COHORT\` is here for you to try it on.
            `,
            starter: `function summarise(values) {
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  return { n: values.length, missing: 0, mean, sd: 0, median: 0, q1: 0, q3: 0 };
}

console.log(summarise(COHORT.map((r) => r.los)));
`,
            solution: `function summarise(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const q = (p) => {
    const h = (n - 1) * p;
    const lo = Math.floor(h), hi = Math.ceil(h);
    return v[lo] + (h - lo) * (v[hi] - v[lo]);
  };
  return { n, missing: values.length - n, mean, sd, median: q(0.5), q1: q(0.25), q3: q(0.75) };
}

console.log(summarise(COHORT.map((r) => r.los)));
`,
            hints: [
              "Filter first: `values.filter((x) => typeof x === \"number\" && Number.isFinite(x))` — that drops null, undefined and NaN together — then sort numerically.",
              "Sample SD: square root of the sum of squared differences from the mean, divided by n − 1.",
              "For a quartile: `h = (n - 1) * p`; take the values at `Math.floor(h)` and `Math.ceil(h)` and go the fractional part of the way between them.",
            ],
            tests: [
              { name: "A small example", code: `const s = summarise([4, 1, 3, 2]); $eq(s.n, 4, "n"); $near(s.mean, 2.5, 1e-12, "mean"); $near(s.sd, 1.2909944, 1e-6, "sd"); $near(s.median, 2.5, 1e-12, "median"); $near(s.q1, 1.75, 1e-12, "q1"); $near(s.q3, 3.25, 1e-12, "q3");` },
              { name: "Missing values are counted and left out", code: `const s = summarise([5, null, 7, NaN, undefined]); $eq(s.n, 2, "n"); $eq(s.missing, 3, "missing"); $near(s.mean, 6, 1e-12, "mean");` },
              { name: "Matches the reference on age", code: `const a = COHORT.map((r) => r.age); const mine = summarise(a), ref = __stats.summary(a); for (const k of ["n", "mean", "sd", "median", "q1", "q3"]) $near(mine[k], ref[k], 1e-9, k);` },
              { name: "Matches the reference on length of stay", code: `const a = COHORT.map((r) => r.los); const mine = summarise(a), ref = __stats.summary(a); for (const k of ["median", "q1", "q3"]) $near(mine[k], ref[k], 1e-9, k);` },
            ],
          },
          { md: `
            ## The table

            Here is Table 1 for MOVE-EARLY, built from exactly those calculations. Look at the frailty row before you look at any outcome: the programme group's median Clinical Frailty Scale score is ${CFS_MEDIAN[0]}, usual care's is ${CFS_MEDIAN[1]}.
          ` },
          { type: "widget", id: "t1", widget: "table1", kind: "Table", title: "Table 1", optional: true },
        ],
      },

      /* ============================================================ */
      {
        id: "res-compare",
        title: "Comparing groups: risks, odds and confounding",
        minutes: 50,
        project: "research",
        summary: "Risk ratios, odds ratios and confidence intervals — then watching confounding inflate an effect, and taking it back out.",
        keywords: "risk ratio odds ratio confidence interval p value 2x2 chi square confounding mantel haenszel stratification",
        objectives: [
          "Calculate risk ratios and odds ratios with confidence intervals, and say when they differ",
          "Interpret a confidence interval and a p-value correctly",
          "Detect confounding by stratifying, and pool with Mantel–Haenszel",
        ],
        blocks: [
          { md: `
            ## The 2×2 table

            |  | Outcome | No outcome |
            |---|---|---|
            | **Exposed** | a | b |
            | **Not exposed** | c | d |

            - **Risk** in each group: a / (a + b) and c / (c + d).
            - **Risk ratio (RR)**: the first risk divided by the second. 0.5 means half the risk.
            - **Risk difference (RD)**: the first minus the second — the absolute effect; **1 / |RD|** is the number needed to treat.
            - **Odds ratio (OR)**: (a × d) / (b × c). Case–control studies and logistic regression produce ORs.

            When the outcome is **rare** (under about 10%), OR and RR are close. When it's common they drift apart, and the OR is always further from 1 — so reading an OR as if it were a RR overstates the effect.

            ## Confidence intervals

            Ratios are skewed, so their intervals are calculated on the log scale. For the 95% interval:

            \`\`\`text
            SE(ln OR) = √(1/a + 1/b + 1/c + 1/d)
            SE(ln RR) = √(1/a − 1/(a+b) + 1/c − 1/(c+d))
            interval  = exp( ln(estimate) ± 1.96 × SE )
            \`\`\`

            A 95% interval is the range of effects reasonably compatible with your data and model. If it includes 1 (no difference), the data can't rule out no effect. It is **not** a 95% probability that the truth lies inside this particular interval — and a p-value is **not** the probability that the result is due to chance. A p-value of 0.04 and one of 0.06 are nearly the same evidence; report the estimate and its interval, and let the interval do the talking.

            ## MOVE-EARLY, crude

            Readmission within 30 days was ${pct(CT.riskExposed)} with the early mobility programme and ${pct(CT.riskUnexposed)} with usual care: OR ${f2(CT.or)} (95% CI ${f2(CT.orCI[0])} to ${f2(CT.orCI[1])}), RR ${f2(CT.rr)} (${f2(CT.rrCI[0])} to ${f2(CT.rrCI[1])}). On its face, the programme nearly halves readmission.
          ` },
          {
            type: "code", id: "ratios", lang: "js", title: "Ratios with confidence intervals", uses: ["stats"],
            prompt: `
              Write \`riskRatio(a, b, c, d)\` and \`oddsRatio(a, b, c, d)\`, each returning \`{ estimate, lower, upper }\` — the 95% interval from the formulas above, with 1.96. Assume no cell is zero.
            `,
            starter: `function riskRatio(a, b, c, d) {
  const estimate = (a / (a + b)) / (c / (c + d));
  return { estimate, lower: 0, upper: 0 };
}

function oddsRatio(a, b, c, d) {
  return { estimate: 0, lower: 0, upper: 0 };
}

console.log(riskRatio(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}), oddsRatio(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}));
`,
            solution: `function withInterval(estimate, se) {
  return {
    estimate,
    lower: Math.exp(Math.log(estimate) - 1.96 * se),
    upper: Math.exp(Math.log(estimate) + 1.96 * se),
  };
}

function riskRatio(a, b, c, d) {
  const estimate = (a / (a + b)) / (c / (c + d));
  const se = Math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d));
  return withInterval(estimate, se);
}

function oddsRatio(a, b, c, d) {
  const estimate = (a * d) / (b * c);
  const se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  return withInterval(estimate, se);
}

console.log(riskRatio(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}), oddsRatio(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}));
`,
            hints: ["`Math.log` is the natural log and `Math.exp` its inverse.", "Write the interval once — a helper taking an estimate and an SE — and use it for both."],
            tests: [
              { name: "A textbook table: RR 2.0, OR 2.25", code: `$near(riskRatio(20, 80, 10, 90).estimate, 2, 1e-12, "RR"); $near(oddsRatio(20, 80, 10, 90).estimate, 2.25, 1e-12, "OR");` },
              { name: "No difference gives exactly 1", code: `$near(riskRatio(10, 90, 10, 90).estimate, 1, 1e-12, "RR"); $near(oddsRatio(10, 90, 10, 90).estimate, 1, 1e-12, "OR");` },
              { name: "MOVE-EARLY risk ratio and interval", code: `const r = riskRatio(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}); const ref = __stats.twoByTwo(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}); $near(r.estimate, ref.rr, 1e-9, "RR"); $near(r.lower, ref.rrCI[0], 1e-3, "lower"); $near(r.upper, ref.rrCI[1], 1e-3, "upper");` },
              { name: "MOVE-EARLY odds ratio and interval", code: `const r = oddsRatio(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}); const ref = __stats.twoByTwo(${CRUDE.a}, ${CRUDE.b}, ${CRUDE.c}, ${CRUDE.d}); $near(r.estimate, ref.or, 1e-9, "OR"); $near(r.lower, ref.orCI[0], 1e-3, "lower"); $near(r.upper, ref.orCI[1], 1e-3, "upper");` },
              { name: "The interval brackets the estimate", code: `const r = oddsRatio(43, 317, 50, 190); $check(r.lower < r.estimate && r.estimate < r.upper, "lower < estimate < upper");` },
            ],
          },
          { type: "widget", id: "calc", widget: "twoByTwo", kind: "Calculator", title: "Any 2×2 table", optional: true, intro: "Try the presets: a rare outcome (OR ≈ RR), a common one (they diverge), and small numbers (when Fisher's exact test takes over from χ²)." },
          { md: `
            ## Now stratify

            Split the cohort by frailty and compare like with like: fit patients with fit patients, frail with frail. If the programme really halved readmission, it should do so within each band. If the crude effect was mostly frailty, it will shrink within bands.

            The **Mantel–Haenszel** method pools the within-band estimates into one adjusted estimate, weighting each band by its information.
          ` },
          { type: "widget", id: "strat", widget: "stratify", kind: "Analysis", title: "Crude versus adjusted", optional: true },
          { md: `
            Pooled across frailty bands, the odds ratio is ${f2(MH.or)} (95% CI ${f2(MH.orCI[0])} to ${f2(MH.orCI[1])}), against the crude ${f2(CT.or)}. Most of the apparent benefit was who received the programme, not what it did. (The simulation was built with a true effect of about 0.78 — which the adjusted estimate recovers.)

            Stratification handles one or two confounders. With several — age, frailty, diabetes, admission type — the general tool is **regression**: logistic regression for a binary outcome like readmission, giving an adjusted OR for each variable at once. Same idea, more variables.
          ` },
          {
            type: "quiz", id: "q-confound",
            question: `Crude OR ${f2(CT.or)} (95% CI ${f2(CT.orCI[0])}–${f2(CT.orCI[1])}); frailty-adjusted OR ${f2(MH.or)} (${f2(MH.orCI[0])}–${f2(MH.orCI[1])}). What's the fairest summary?`,
            options: [
              "The programme halves readmission (p < 0.01)",
              "The programme doesn't work",
              "Much of the crude benefit reflects frailer patients not getting the programme; after adjustment the data are compatible with anything from a substantial benefit to a modest harm",
            ],
            answer: 2,
            explain: "The crude estimate is confounded. The adjusted interval is wide and includes 1 — which is \"we can't tell\", not \"no effect\". A trial, or a larger cohort with more confounders measured, is the next step.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "res-survival",
        title: "Survival analysis, properly this time",
        minutes: 55,
        project: "research",
        summary: "Censoring, Kaplan–Meier by hand and in code, the log-rank test — and the traps in reading the curves.",
        keywords: "survival analysis kaplan meier censoring log rank hazard ratio cox competing risks immortal time",
        objectives: [
          "Explain censoring, and why simple proportions mishandle it",
          "Calculate a Kaplan–Meier curve by hand and in code",
          "Read a survival curve critically: numbers at risk, medians, the log-rank test and its limits",
        ],
        blocks: [
          { md: `
            ## Why time-to-event is different

            "What proportion were readmitted within a year?" sounds simple until some patients haven't been followed for a year: they moved away, the study ended, or they joined last month. They didn't have the event *while you were watching*, which is not the same as not having it. These patients are **censored**.

            Drop them, and you throw away information. Count them as event-free, and you overstate survival. The **Kaplan–Meier** method uses each person for exactly as long as they were observed.

            ## The estimator

            At each time *t* when at least one event happens:

            \`\`\`text
            S(t) = S(previous) × (1 − d / n)

            d = events at t
            n = people still at risk just before t (not yet had the event, not yet censored)
            \`\`\`

            Someone censored at a time is counted at risk at that time, then leaves. The curve only steps down at events; censoring makes later steps bigger by shrinking *n*.

            ## By hand

            Six patients: event at day 2; censored at 3; events at 4 and 4; censored at 5; event at 6.

            | Day | At risk | Events | 1 − d/n | S(t) |
            |---|---|---|---|---|
            | 2 | 6 | 1 | 5/6 | 0.833 |
            | 4 | 4 | 2 | 2/4 | 0.833 × 0.5 = 0.417 |
            | 6 | 1 | 1 | 0/1 | 0 |

            At day 4, *n* is 4, not 5: the person censored on day 3 has left. The tail of the curve — that drop to zero — rests on one person, which is why a KM plot should always show the **number at risk** beneath it.

            ## Medians, intervals, comparisons

            - **Median survival** is the first time the curve is at or below 0.5. If it never gets there, the median is "not reached" — common, and fine to report.
            - **Confidence intervals** come from Greenwood's formula.
            - The **log-rank test** compares whole curves: at every event time, how many events would each group have had if their risks were the same? It's most powerful when the hazards are proportional — when one group's risk is a steady multiple of the other's.
            - A **hazard ratio** from a **Cox regression** summarises the difference in one number, and adjusts for confounders — the survival counterpart of logistic regression. It assumes proportional hazards; check that before trusting it.
          ` },
          {
            type: "code", id: "km", lang: "js", title: "Kaplan–Meier in code", uses: ["cohort"],
            prompt: `
              Write \`kaplanMeier(rows)\`, where \`rows\` are \`{ time, event }\` (event 1 = had the outcome, 0 = censored), in any order. Return one entry per distinct time **at which at least one event happened**, in time order: \`{ time, atRisk, events, survival }\`.

              People censored at the same time as an event are still at risk at that time — handle events before censorings. Don't change the order of the array you were given.
            `,
            starter: `function kaplanMeier(rows) {
  const sorted = [...rows].sort((a, b) => a.time - b.time);
  let atRisk = sorted.length;
  let survival = 1;
  const steps = [];

  // Walk through the distinct times. At each one, count events (d) and
  // censorings; if d > 0, update survival and record a step. Then remove
  // everyone with that time from atRisk.

  return steps;
}

console.log(kaplanMeier([{ time: 2, event: 1 }, { time: 3, event: 0 }, { time: 4, event: 1 }, { time: 4, event: 1 }, { time: 5, event: 0 }, { time: 6, event: 1 }]));
`,
            solution: `function kaplanMeier(rows) {
  const sorted = [...rows].sort((a, b) => a.time - b.time);
  let atRisk = sorted.length;
  let survival = 1;
  const steps = [];

  for (let i = 0; i < sorted.length;) {
    const time = sorted[i].time;
    let events = 0, censored = 0;
    while (i < sorted.length && sorted[i].time === time) {
      if (sorted[i].event) events++; else censored++;
      i++;
    }
    if (events > 0) {
      survival *= 1 - events / atRisk;
      steps.push({ time, atRisk, events, survival });
    }
    atRisk -= events + censored;
  }
  return steps;
}

console.log(kaplanMeier([{ time: 2, event: 1 }, { time: 3, event: 0 }, { time: 4, event: 1 }, { time: 4, event: 1 }, { time: 5, event: 0 }, { time: 6, event: 1 }]));
`,
            hints: [
              "An outer loop over positions, and an inner `while` that consumes every row with the same time, counting events and censorings.",
              "Record a step only if `events > 0`: `survival *= 1 - events / atRisk`.",
              "After each time, `atRisk -= events + censored` — that's how censored people leave without causing a step.",
            ],
            tests: [
              { name: "The worked example", code: `const r = kaplanMeier([{ time: 2, event: 1 }, { time: 3, event: 0 }, { time: 4, event: 1 }, { time: 4, event: 1 }, { time: 5, event: 0 }, { time: 6, event: 1 }]); $eq(r.map((s) => [s.time, s.atRisk, s.events]), [[2, 6, 1], [4, 4, 2], [6, 1, 1]], "time, at risk, events"); $near(r[0].survival, 5 / 6, 1e-12, "S(2)"); $near(r[1].survival, 5 / 12, 1e-12, "S(4)"); $near(r[2].survival, 0, 1e-12, "S(6)");` },
              { name: "Censored at an event time: still at risk then", code: `const r = kaplanMeier([{ time: 3, event: 1 }, { time: 3, event: 0 }, { time: 5, event: 1 }]); $eq(r[0].atRisk, 3, "at risk on day 3"); $near(r[0].survival, 2 / 3, 1e-12, "S(3)"); $eq(r[1].atRisk, 1, "at risk on day 5");` },
              { name: "Order doesn't matter, and the input isn't changed", code: `const rows = [{ time: 6, event: 1 }, { time: 2, event: 1 }, { time: 4, event: 1 }, { time: 3, event: 0 }]; const r = kaplanMeier(rows); $eq(r.map((s) => s.time), [2, 4, 6], "times"); $eq(rows[0].time, 6, "first row of the input");` },
              { name: "Matches the reference on the programme group", code: `const g = COHORT.filter((p) => p.emp === 1); const mine = kaplanMeier(g); const ref = __stats.kaplanMeier(g).steps.filter((s) => s.events > 0); $eq(mine.length, ref.length, "steps"); ref.forEach((s, i) => { $eq(mine[i].time, s.time, "time"); $eq(mine[i].atRisk, s.atRisk, "at risk at day " + s.time); $near(mine[i].survival, s.survival, 1e-12, "S(" + s.time + ")"); });` },
            ],
          },
          { md: `
            ## The curves

            Event-free survival for the two groups, with the number at risk below. The programme group was ${U.fmtNum(S.survivalAt(KM_E, 365) * 100, 0)}% event-free at a year against ${U.fmtNum(S.survivalAt(KM_U, 365) * 100, 0)}%; the usual-care median was ${KM_U.median} days, and the programme group's was ${KM_E.median == null ? "not reached" : KM_E.median + " days"}. Log-rank p ${LR.p < 0.001 ? "< 0.001" : LR.p.toFixed(3)}.

            And yet: this is the same crude comparison as the last lesson's, with the same frailty imbalance behind it. Switch the chart to compare frailty bands, and look at how far apart *those* curves are.
          ` },
          { type: "widget", id: "kmplot", widget: "kmPlot", kind: "Chart", title: "Kaplan–Meier curves", optional: true },
          { md: `
            ## Traps

            - **Immortal time bias.** If "exposed" means "received the programme at any point during follow-up", the exposed group is guaranteed to survive until they received it — time in which, by definition, they couldn't have the event. Define exposure at time zero, or use methods built for exposures that change over time.
            - **Competing risks.** If the outcome were readmission alone, death would stop people being readmitted. Treating the dead as censored assumes they could still have been readmitted, and **1 − KM then overstates the risk of readmission**. Use the cumulative incidence function instead (and the Fine–Gray model for regression). MOVE-EARLY sidesteps this by combining death *or* readmission into one outcome.
            - **Informative censoring.** KM assumes censored people are like those who stayed. If people stop attending follow-up *because* they got worse, the curve is too optimistic.
            - **The tail.** Late steps with a handful of people at risk move a lot and mean little. Cut the x-axis where the numbers get small, and always print them.
          ` },
          {
            type: "quiz", id: "q-competing",
            question: "You study time to readmission and treat deaths as censored. Many patients die before they could be readmitted. What goes wrong?",
            options: [
              "Nothing — censoring handles it",
              "1 − KM overestimates the cumulative risk of readmission, because it assumes the dead could still be readmitted",
              "The log-rank test can no longer be calculated",
            ],
            answer: 1,
            explain: "Death is a competing risk: it removes the possibility of readmission altogether, which censoring doesn't represent. The cumulative incidence function (Aalen–Johansen) gives the honest estimate.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "res-python",
        title: "The same analysis in Python",
        minutes: 40,
        project: "research",
        summary: "Kaplan–Meier in Python from scratch — then what lifelines, statsmodels and R do in a line.",
        keywords: "python kaplan meier lifelines statsmodels r survival cox logistic",
        objectives: [
          "Implement Kaplan–Meier in Python",
          "Recognise the library calls that do it for you, in Python and in R",
          "Choose between writing it and calling it",
        ],
        blocks: [
          { md: `
            ## Why do it twice?

            Because the language your analysis ends up in is often not your choice — a supervisor's R scripts, a co-author's Python, a statistician's Stata — and because seeing the same algorithm in two languages separates the idea from the syntax. Once you've written Kaplan–Meier, a library's version is something you can check rather than trust.
          ` },
          {
            type: "code", id: "py-km", lang: "python", title: "Kaplan–Meier in Python", uses: ["cohort"],
            prompt: `
              Write \`kaplan_meier(rows)\` for a list of dictionaries with \`"time"\` and \`"event"\`, returning a list of \`(time, survival)\` tuples, one per distinct time with at least one event, in order. Same rules as before: people censored at an event's time are still at risk at that time.

              \`COHORT\` is here; the checks use the early mobility group.
            `,
            starter: `def kaplan_meier(rows):
    rows = sorted(rows, key=lambda r: r["time"])
    at_risk = len(rows)
    survival = 1.0
    steps = []

    return steps


group = [r for r in COHORT if r["emp"] == 1]
print(kaplan_meier(group)[:5])
`,
            solution: `def kaplan_meier(rows):
    rows = sorted(rows, key=lambda r: r["time"])
    at_risk = len(rows)
    survival = 1.0
    steps = []
    i = 0
    while i < len(rows):
        t = rows[i]["time"]
        events = censored = 0
        while i < len(rows) and rows[i]["time"] == t:
            if rows[i]["event"]:
                events += 1
            else:
                censored += 1
            i += 1
        if events:
            survival *= 1 - events / at_risk
            steps.append((t, survival))
        at_risk -= events + censored
    return steps


group = [r for r in COHORT if r["emp"] == 1]
print(kaplan_meier(group)[:5])
`,
            hints: ["The same two loops as the JavaScript version: an outer `while i < len(rows)` and an inner one that consumes every row with time `t`.", "`steps.append((t, survival))` appends a tuple."],
            tests: [
              { name: "The worked example", code: `r = kaplan_meier([{"time": 2, "event": 1}, {"time": 3, "event": 0}, {"time": 4, "event": 1}, {"time": 4, "event": 1}, {"time": 5, "event": 0}, {"time": 6, "event": 1}])\n_eq([t for t, s in r], [2, 4, 6], "times")\n_near(r[1][1], 5 / 12, 1e-12, "S(4)")` },
              { name: "One step per event time in the programme group", code: `r = kaplan_meier([x for x in COHORT if x["emp"] == 1])\n_eq(len(r), ${EVENT_STEPS_E.length}, "number of steps")` },
              { name: "Matches the reference mid-curve and at the end", code: `r = dict(kaplan_meier([x for x in COHORT if x["emp"] == 1]))\n_near(r[${MID.time}], ${MID.survival}, 1e-12, "S(${MID.time})")\n_near(r[${EVENT_STEPS_E[EVENT_STEPS_E.length - 1].time}], ${EVENT_STEPS_E[EVENT_STEPS_E.length - 1].survival}, 1e-12, "the last step")` },
            ],
          },
          { md: `
            ## The one-line versions

            On your own machine, with \`pip install lifelines pandas\`:

            \`\`\`python
            import pandas as pd
            from lifelines import KaplanMeierFitter
            from lifelines.statistics import logrank_test

            df = pd.read_csv("move-early-clean.csv")
            emp, usual = df[df.emp == 1], df[df.emp == 0]

            km = KaplanMeierFitter().fit(emp.time, event_observed=emp.event, label="Early mobility")
            print(km.median_survival_time_)          # inf when the median isn't reached
            km.plot_survival_function()

            result = logrank_test(emp.time, usual.time,
                                  event_observed_A=emp.event, event_observed_B=usual.event)
            print(result.p_value)
            \`\`\`

            And adjusted models — logistic regression with statsmodels, Cox regression with lifelines:

            \`\`\`python
            import statsmodels.formula.api as smf
            from lifelines import CoxPHFitter

            logit = smf.logit("readmit30 ~ emp + cfs + age + diabetes", data=df).fit()
            print(logit.summary())                   # exponentiate coefficients for odds ratios

            cox = CoxPHFitter().fit(df[["time", "event", "emp", "cfs", "age", "diabetes"]],
                                    duration_col="time", event_col="event")
            cox.print_summary()                      # exp(coef) is the hazard ratio
            cox.check_assumptions(df[["time", "event", "emp", "cfs", "age", "diabetes"]])
            \`\`\`

            The same in R, with the \`survival\` package:

            \`\`\`r
            library(survival)
            fit <- survfit(Surv(time, event) ~ emp, data = d)
            summary(fit, times = c(90, 180, 365))
            survdiff(Surv(time, event) ~ emp, data = d)          # log-rank
            cox <- coxph(Surv(time, event) ~ emp + cfs + age + diabetes, data = d)
            summary(cox)
            cox.zph(cox)                                          # proportional hazards check
            \`\`\`

            > [!NOTE] Defaults differ
            > lifelines draws Kaplan–Meier intervals on the log(−log) scale (as this course does); R's \`survfit\` uses the log scale unless you set \`conf.type = "log-log"\`. Same curve, slightly different bands. Knowing which default you used is part of reporting the analysis.

            ## Write it or call it?

            Call it — for real analyses, use the well-tested library, and say which version. Write it — when you're learning, or checking: a library result that disagrees with your own fifteen-line version is a question worth asking, about your data or your understanding.
          ` },
        ],
      },

      /* ============================================================ */
      {
        id: "res-reproducible",
        title: "Reproducible research",
        minutes: 35,
        project: "research",
        summary: "Scripts, version control, registration and reporting guidelines — making your analysis something someone else can rerun and trust.",
        keywords: "reproducibility version control preregistration reporting guidelines strobe consort prisma equator ai disclosure",
        objectives: [
          "Organise an analysis so anyone can rerun it",
          "Pick the reporting guideline for your design, and pre-register where you should",
          "Disclose AI use correctly",
        ],
        blocks: [
          { md: `
            ## The standard

            Someone else — a reviewer, a co-author, you in a year — should be able to take your raw data and your code and get every number in your paper. That's **reproducibility**, and it's mostly habits:

            - **Scripts, not clicks.** Every step from raw data to final table is code. If you did something by hand, you can't do it again.
            - **Version control the code, never the data.** Your analysis lives in a git repository; the data lives in approved storage and the repository's \`.gitignore\` keeps it out.
            - **One command reruns everything**, from cleaning to figures.
            - **Fix the randomness.** Anything random (bootstraps, imputation, simulation) gets a seed — this course's cohort is seed ${S.SEED}, which is why your numbers match everyone's.
            - **Record versions.** Language and package versions (\`requirements.txt\`, R's \`renv\`), because defaults change between versions.

            A layout that works:

            \`\`\`text
            my-study/
              README.md            what this is, how to run it
              data/raw/            the files as received — read-only, never committed
              data/derived/        what the code produces — never committed
              analysis/            01_clean.py, 02_describe.py, 03_models.py …
              outputs/             tables and figures, regenerated by the code
              .gitignore           data/
            \`\`\`

            ## Decide first, then look

            Write the **analysis plan** — primary outcome, exposure definition, confounders, models, how missing data will be handled — **before** you see outcome data. Changing the plan after looking isn't forbidden, but it must be reported as a change. **Register** it: trials prospectively on CTRI or ClinicalTrials.gov; systematic reviews on PROSPERO; observational studies optionally on OSF.

            ## Reporting guidelines

            The EQUATOR Network collects them. Find yours before you write, not after:

            | Design | Guideline |
            |---|---|
            | Randomised trial | **CONSORT** (protocols: SPIRIT) |
            | Observational study | **STROBE** (routinely collected data: RECORD) |
            | Systematic review | **PRISMA** |
            | Diagnostic accuracy | **STARD** |
            | Prediction model | **TRIPOD** — and TRIPOD+AI for machine-learning models |
            | Case report | **CARE** |
            | AI interventions in trials | CONSORT-AI, SPIRIT-AI |

            ## AI and authorship

            Journals following the ICMJE recommendations expect you to **disclose** how you used AI tools — for writing, analysis code, or anything else — and AI tools cannot be authors, because they can't take responsibility for the work. You can. Every number, every citation and every line of code in your paper is yours to have checked.
          ` },
          {
            type: "widget", id: "repro", widget: "checklist", kind: "Checklist", title: "Before you call an analysis finished",
            opts: { items: [
              { id: "rerun", text: "Deleted the derived data and outputs, reran everything with one command, and got the same numbers" },
              { id: "plan", text: "Every deviation from the analysis plan is written down, with the reason" },
              { id: "flow", text: "A flow diagram accounts for every row: received, excluded and why, analysed" },
              { id: "missing", text: "Missing data reported for every variable, and how it was handled" },
              { id: "versions", text: "Software and package versions recorded" },
              { id: "guideline", text: "The reporting guideline's checklist filled in" },
              { id: "nodata", text: "The repository contains no data, keys or identifiers — checked, not assumed" },
              { id: "ai", text: "AI use described in the methods or acknowledgements, as the journal asks" },
            ] },
          },
          {
            type: "quiz", id: "q-ai-author",
            question: "Claude wrote much of your analysis code, which you tested and reviewed. What does the paper need?",
            options: [
              "Nothing — you checked the code",
              "Claude listed as an author",
              "A disclosure of how the AI tool was used, per the journal's policy; you remain responsible for the work",
            ],
            answer: 2,
            explain: "Disclose the use; keep the responsibility. AI tools can't be authors because authorship means being accountable for the work.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "res-capstone",
        title: "Capstone: the MOVE-EARLY mini-study",
        minutes: 60,
        project: "research",
        summary: "Everything, end to end: the question, the cleaned data, Table 1, crude and adjusted estimates, survival — and a structured abstract in your words.",
        keywords: "capstone abstract mini study write up results conclusion",
        objectives: [
          "Assemble a complete analysis into a structured abstract",
          "Write a conclusion that matches the evidence — no more, no less",
          "Know what would change if the data were real",
        ],
        blocks: [
          { md: `
            ## The analysis, assembled

            You've built every piece:

            1. **Question** (PICO): in older medical inpatients, does early mobilisation, compared with usual care, reduce readmission?
            2. **Data**: the messy spreadsheet, cleaned by your written rules — ${CLEAN.length} people kept, every exclusion counted.
            3. **Table 1**: the groups differ — above all in frailty.
            4. **Estimates**: crude OR ${f2(CLEAN_CT.or)}; frailty-adjusted ${f2(CLEAN_MH.or)} (${f2(CLEAN_MH.orCI[0])}–${f2(CLEAN_MH.orCI[1])}).
            5. **Survival**: event-free survival is better with the programme, crudely — with the same confounding behind it.

            These are the cleaned data's numbers, so they differ a little from earlier lessons, which used the cohort as simulated — exactly as a real paper reports the dataset it analysed, not the one it was sent. Look at the curves and the stratified estimates once more if you like; then write it up.
          ` },
          { type: "widget", id: "cap-strat", widget: "stratify", kind: "Analysis", title: "Crude versus adjusted — cleaned data", optional: true, opts: { data: "cleaned" } },
          { type: "widget", id: "cap-km", widget: "kmPlot", kind: "Chart", title: "Kaplan–Meier curves — cleaned data", optional: true, opts: { data: "cleaned" } },
          { md: `
            ## The abstract

            The builder fills in Background, Methods and Results from the analysis — **check each number against the widgets and your own exercises**, which is exactly what you'd do with a co-author's draft. The conclusion is yours. A good one:

            - says what was found, at the strength it was found — "associated with", not "reduces", for an observational study;
            - gives the adjusted estimate the weight, not the crude one;
            - names the main limitation (residual confounding: frailty was measured; what wasn't?);
            - says what would settle the question.
          ` },
          { type: "widget", id: "abstract", widget: "abstractBuilder", kind: "Write-up", title: "Structured abstract" },
          { md: `
            ## If the data were real

            Everything you did would stand, with more around it: an approved protocol and analysis plan before any data; a statistician involved from the start; a sample size calculation; more confounders measured and modelled (logistic and Cox regression rather than one stratification variable); sensitivity analyses; the STROBE checklist; registration if it were a trial; and the code in a repository, data excluded, with the README that lets someone else rerun it.

            Use Claude Code for the code — it's very good at it — with the habits from this course: a plan first, small steps, tests against numbers you've checked by hand, and every diff read before it's run on anything that matters.

            That's the whole course. Log it to your diary — and then go and find the uncertainty on your ward that deserves a protocol.
          ` },
        ],
      },
    ],
  });
})(window.CC);
