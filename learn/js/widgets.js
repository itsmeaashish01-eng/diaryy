/* ================================================
   CODE CLINIC — widgets.js
   The interactive pieces lessons embed: a git terminal, a language model
   you can read, a prompt checklist, the agent stepper and literature lab,
   a 2×2 calculator, Kaplan–Meier curves, Table 1, and the rest.

   Each widget is a function (mount, opts, ctx). ctx carries the block's
   saved state and a pass() to call when the reader has done the thing
   the widget is for. Anything that came from outside — a PubMed title,
   a model's answer, your own typing — is put on the page as text, never
   as markup.
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  const U = CC.util;
  const { el } = U;
  const REG = {};
  const register = (name, fn) => { REG[name] = fn; };

  /* ---- small building blocks ------------------------------------------ */

  const btn = (label, on, cls) => el("button", { class: `btn ${cls || ""}`.trim(), type: "button", on: { click: on } }, label);
  const field = (label, input, hint) => el("label", { class: "w-field" }, el("span", { class: "w-label" }, label), input, hint ? el("span", { class: "w-hint" }, hint) : null);
  const note = (text, cls) => el("p", { class: `w-note ${cls || ""}`.trim() }, text);
  const fmt = (x, dp) => U.fmtNum(x, dp);
  const pct = (x, dp) => (Number.isFinite(x) ? `${(x * 100).toFixed(dp == null ? 1 : dp)}%` : "—");
  const ci = (pair, dp) => `${fmt(pair[0], dp)} to ${fmt(pair[1], dp)}`;
  /* "p < 0.001", "p = 0.042" — never "p = < 0.001". */
  const pText = (p) => (!Number.isFinite(p) ? "p —" : p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);

  function kv(rows) {
    const t = el("table", { class: "kv" });
    rows.forEach(([k, v, cls]) => t.append(el("tr", { class: cls || "" }, el("th", { scope: "row" }, k), el("td", null, v))));
    return t;
  }

  function dataTable(head, rows, caption) {
    const t = el("table", { class: "data" });
    if (caption) t.append(el("caption", null, caption));
    t.append(el("thead", null, el("tr", null, head.map((h) => el("th", { scope: "col" }, h)))));
    t.append(el("tbody", null, rows.map((r) => el("tr", null, r.map((c) => el("td", null, c))))));
    return el("div", { class: "table-wrap" }, t);
  }

  function jsonBlock(obj) {
    return el("pre", { class: "code json" }, el("code", null, JSON.stringify(obj, null, 2)));
  }

  const NS = "http://www.w3.org/2000/svg";
  function S(tag, attrs, ...kids) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, v);
    kids.flat().forEach((k) => { if (k != null) n.append(k instanceof Node ? k : document.createTextNode(String(k))); });
    return n;
  }
  const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

  /* The cohort every research widget shares. Built once, from the seed, so
     every widget and every exercise sees exactly the same 600 people. */
  let cohortCache = null;
  const cohort = () => cohortCache || (cohortCache = CC.stats.makeCohort({ seed: CC.stats.SEED }));
  /* The same people after the cleaning lesson's rules: what the capstone
     analyses, so its charts and its abstract quote the same numbers. */
  let cleanedCache = null;
  const cleanedCohort = () => cleanedCache || (cleanedCache = CC.stats.cleanCohort(CC.stats.makeMessyCSV({ seed: CC.stats.SEED })));
  const dataFor = (opts) => (opts && opts.data === "cleaned" ? cleanedCohort() : cohort());
  const FRAILTY_BANDS = [
    { label: "CFS 1–3 (fit)", test: (r) => r.cfs <= 3 },
    { label: "CFS 4 (vulnerable)", test: (r) => r.cfs === 4 },
    { label: "CFS 5 (mildly frail)", test: (r) => r.cfs === 5 },
    { label: "CFS 6–8 (frail)", test: (r) => r.cfs >= 6 },
  ];
  function table2x2(rows, outcome) {
    const e = rows.filter((r) => r.emp === 1), u = rows.filter((r) => r.emp === 0);
    const a = e.filter(outcome).length, c = u.filter(outcome).length;
    return { a, b: e.length - a, c, d: u.length - c };
  }

  /* ---- the API key, shared by the playground and the lab ------------------ */

  function keyPanel(onChange) {
    const st = CC.store;
    const wrap = el("details", { class: "keypanel" });
    const input = el("input", { type: "password", placeholder: "sk-ant-…", autocomplete: "off", spellcheck: false });
    input.value = st.apiKey();
    const remember = el("input", { type: "checkbox" });
    remember.checked = st.apiKeyRemembered();
    const model = el("select", null, CC.agent.MODELS.map((m) => el("option", { value: m.id }, `${m.label} — $${m.input} / $${m.output} per M tokens`)));
    model.value = st.data.settings.model;
    const effort = el("select", null, ["low", "medium", "high"].map((x) => el("option", { value: x }, x)));
    effort.value = st.data.settings.effort;
    const email = el("input", { type: "email", placeholder: "you@hospital.org (optional)" });
    email.value = st.data.settings.pubmedEmail;
    const status = el("span", { class: "w-hint" });
    const sync = () => {
      status.textContent = st.apiKey() ? (st.apiKeyRemembered() ? "Key saved on this device." : "Key kept for this tab only.") : "No key yet — the practice modes still work.";
    };
    const save = () => {
      st.setApiKey(input.value.trim(), remember.checked);
      st.setSetting("model", model.value);
      st.setSetting("effort", effort.value);
      st.setSetting("pubmedEmail", email.value.trim());
      sync();
      if (onChange) onChange();
    };
    [input, remember, model, effort, email].forEach((n) => n.addEventListener("change", save));
    sync();
    wrap.append(
      el("summary", null, "Settings: API key, model, effort"),
      el("div", { class: "w-grid" },
        field("Anthropic API key", input, "Create one at console.anthropic.com → API keys. Set a monthly spend limit on it first."),
        el("label", { class: "w-check" }, remember, " Remember on this device (otherwise it's forgotten when the tab closes)"),
        field("Model", model), field("Effort", effort, "Lower effort is faster and cheaper; raise it for harder questions."),
        field("Email for PubMed (optional)", email, "NCBI asks programs to identify themselves; it's sent only to NCBI."),
      ),
      el("div", { class: "w-row" }, btn("Forget the key", () => { input.value = ""; remember.checked = false; save(); }, "ghost"), status),
      note("The key is stored only in this browser and goes only to api.anthropic.com. It is never in the export file. Anyone who can run scripts on this page's address could read it, so use a key with a spend limit, and delete it when you're done."),
    );
    return wrap;
  }

  /* ================================================================
     Start here
     ================================================================ */

  register("pacePlanner", (mount, opts, ctx) => {
    const tracks = CC.content.tracks.filter((t) => t.id !== "start");
    const hours = el("input", { type: "range", min: 1, max: 10, step: 1, value: CC.store.data.settings.hoursPerWeek || 3 });
    const label = el("strong");
    const out = el("div", { class: "w-out" });
    function render() {
      const h = Number(hours.value);
      label.textContent = `${h} hour${h === 1 ? "" : "s"} a week`;
      const perWeek = h * 60;
      let cumulative = 0;
      const rows = tracks.map((t) => {
        const mins = t.lessons.reduce((s, l) => s + (l.minutes || 30), 0);
        cumulative += mins;
        return [t.title, U.plural(t.lessons.length, "lesson"), U.fmtMinutes(mins), `${Math.ceil(mins / perWeek)} wk`];
      });
      const weeks = Math.ceil(cumulative / perWeek);
      const done = new Date(Date.now() + weeks * 7 * 864e5);
      out.replaceChildren(
        dataTable(["Track", "Lessons", "Time", "At this pace"], rows),
        el("p", null, `All four, one after another: about ${weeks} weeks — around `, el("strong", null, done.toLocaleDateString(undefined, { month: "long", year: "numeric" })), "."),
        note("A rhythm that survives a fellowship: two short sessions on weekdays for reading and exercises, one longer one at the weekend for the projects. Coding and Deployment can run side by side — the website goes live halfway through, not at the end."),
      );
    }
    hours.addEventListener("input", () => { CC.store.setSetting("hoursPerWeek", Number(hours.value)); render(); ctx.pass(); });
    render();
    mount.append(el("div", { class: "w-row" }, field("Time you can give", hours), label), out);
  });

  /* ================================================================
     Agentic AI
     ================================================================ */

  const DEFAULT_CORPUS = [
    "the patient was admitted with chest pain",
    "the patient was given fluids and improved",
    "the patient was discharged home on day five",
    "the patient was reviewed on the ward round",
    "the patient improved after fluids",
    "the nurse reviewed the patient overnight",
    "the nurse gave the first dose on time",
    "the registrar reviewed the chest x ray",
    "the chest x ray showed consolidation",
    "the chest pain settled with rest",
    "the dose was reduced because of kidney function",
    "the kidney function improved after fluids",
    "fluids were stopped on day three",
    "the ward round was long and the patient was tired",
    "the team discussed the case and agreed a plan",
    "the plan was discussed with the family",
    "the family were happy with the plan",
    "the patient was happy to go home",
    "the results were reviewed by the team",
    "the first dose was given in the emergency department",
  ];

  register("bigram", (mount, opts, ctx) => {
    const A = CC.agent;
    const corpusBox = el("textarea", { rows: 6, class: "mono" });
    corpusBox.value = ((opts && opts.corpus) || DEFAULT_CORPUS).join("\n");
    let model = A.bigram(corpusBox.value.split("\n"));
    const word = el("input", { type: "text", value: "the", class: "mono", size: 12 });
    const temp = el("input", { type: "range", min: 0.2, max: 2, step: 0.1, value: 1 });
    const tempLabel = el("strong");
    const bars = el("div", { class: "bars", role: "img" });
    const outList = el("ol", { class: "gen" });
    const saved = ctx.state() || { n: 0 };
    let n = saved.n || 0;

    function drawBars() {
      const t = Number(temp.value);
      tempLabel.textContent = `temperature ${t.toFixed(1)}`;
      const last = A.tokenize(word.value).slice(-1)[0] || "<s>";
      const opts2 = A.nextWords(model, last, t).slice(0, 8);
      bars.replaceChildren();
      bars.setAttribute("aria-label", opts2.length ? `After "${last}": ${opts2.map((o) => `${o.word} ${Math.round(o.p * 100)}%`).join(", ")}` : `"${last}" never appears in the training text`);
      if (!opts2.length) { bars.append(note(`"${last}" never appears in the training text, so the model has nothing to say after it. A real model never hits this wall — it always has some probability for every token — which is exactly why it never says "I've no idea".`)); return; }
      opts2.forEach((o) => bars.append(el("div", { class: "bar-row" },
        el("span", { class: "bar-word mono" }, o.word === "</s>" ? "(end)" : o.word),
        el("span", { class: "bar-track" }, el("span", { class: "bar-fill", style: { width: `${Math.max(2, o.p * 100)}%` } })),
        el("span", { class: "bar-val" }, `${Math.round(o.p * 100)}%`))));
    }
    function write() {
      n++;
      const r = CC.stats.rng(1000 + n);
      const sentence = A.generate(model, { start: word.value, temperature: Number(temp.value), random: r, maxWords: 16 });
      outList.prepend(el("li", null, el("span", { class: "mono" }, sentence), el("span", { class: "w-hint" }, ` · T=${Number(temp.value).toFixed(1)}`)));
      ctx.save({ n });
      if (n >= 3) ctx.pass();
    }
    corpusBox.addEventListener("input", U.debounce(() => { model = A.bigram(corpusBox.value.split("\n")); drawBars(); }, 250));
    word.addEventListener("input", drawBars);
    temp.addEventListener("input", drawBars);
    drawBars();
    mount.append(
      el("div", { class: "w-row" }, field("After the words…", word), field("Randomness", temp), tempLabel),
      bars,
      el("div", { class: "w-row" }, btn("Write a sentence", write, "primary"), note("Write three — at least one at a low temperature and one at a high one.")),
      outList,
      el("details", null, el("summary", null, "The training text (edit it — the model retrains as you type)"), corpusBox),
    );
  });

  register("promptLinter", (mount, opts, ctx) => {
    const A = CC.agent;
    const min = (opts && opts.minScore) || 7;
    const box = el("textarea", { rows: 7 });
    box.value = (ctx.state() && ctx.state().text) || (opts && opts.starter) || "";
    const list = el("ul", { class: "checks" });
    const score = el("p", { class: "w-score" });
    function render() {
      const r = A.lintPrompt(box.value);
      list.replaceChildren(...r.checks.map((c) => el("li", { class: c.ok ? "ok" : "no" },
        el("span", { class: "mark", "aria-hidden": "true" }, c.ok ? "✓" : "✗"),
        el("span", null, el("strong", null, c.label), c.ok || !c.tip ? "" : ` — ${c.tip}`))));
      const phiOk = r.phi.length === 0;
      score.textContent = `${r.score} of ${r.max}` + (phiOk ? "" : " — and it contains identifiers, which no score makes acceptable");
      score.className = `w-score ${r.score >= min && phiOk ? "good" : ""}`;
      ctx.save({ text: box.value });
      if (r.score >= min && phiOk) ctx.pass();
    }
    box.addEventListener("input", U.debounce(render, 200));
    render();
    mount.append(field("Your prompt", box), score, list, note(`Reach ${min} of ${8}, with no identifiers. The checks are crude on purpose — they look for words, not meaning — so treat a pass as "nothing obviously missing", not "good".`));
  });

  register("phiScrubber", (mount, opts, ctx) => {
    const A = CC.agent;
    const box = el("textarea", { rows: 6 });
    box.value = (opts && opts.sample) || "";
    const found = el("div", { class: "w-out" });
    function scan() {
      const hits = A.findPHI(box.value);
      found.replaceChildren(
        hits.length
          ? dataTable(["Found", "Looks like"], hits.map((h) => [h.text, h.label]))
          : note("Nothing identifier-shaped found. That is not the same as nothing identifying."),
        el("p", { class: "w-label" }, "Redacted"),
        el("pre", { class: "code" }, el("code", null, A.redact(box.value))),
      );
      ctx.pass();
    }
    mount.append(field("Text to check (fictional)", box), el("div", { class: "w-row" }, btn("Scan", scan, "primary")), found);
  });

  /* The loop, one step at a time, with the messages array in full view. */
  register("agentStepper", (mount, opts, ctx) => {
    const A = CC.agent;
    const scenarioName = (opts && opts.scenario) || "oneTool";
    const frames = [];
    const tools = [{
      name: "calculate_bmi",
      description: "Calculate body-mass index from weight in kilograms and height in metres. Call this whenever a BMI is needed rather than working it out yourself.",
      input_schema: { type: "object", properties: { weight_kg: { type: "number" }, height_m: { type: "number" } }, required: ["weight_kg", "height_m"] },
      run: (i) => { if (!(i.height_m > 0)) throw new Error("height must be greater than 0"); return (i.weight_kg / (i.height_m * i.height_m)).toFixed(1); },
    }];
    const userMsg = scenarioName === "parallel" ? "What are the BMIs of a 70 kg, 1.75 m patient and a 95 kg, 1.80 m patient?" : "What's the BMI of a 70 kg patient who is 1.75 m tall?";
    const client = A.scriptedClient(A.SCENARIOS[scenarioName]);
    const view = el("div", { class: "stepper" });
    const counter = el("span", { class: "w-hint" });
    let i = 0;

    async function build() {
      frames.push({ title: "1 · You send the request", body: "A model, a ceiling on the reply, the tools it may ask for (definitions only — the code stays with you), and the conversation so far: one user message.", json: null, req: 0 });
      await A.runAgent(client, {
        tools, messages: [{ role: "user", content: userMsg }], maxSteps: 4,
        onStep: (ev) => {
          if (ev.type === "response") {
            const r = ev.response;
            frames.push({
              title: `${frames.length + 1} · The model replies — stop_reason "${r.stop_reason}"`,
              body: r.stop_reason === "tool_use"
                ? "It hasn't answered. It has asked you to run a tool, with arguments it chose. The empty thinking block is real models' reasoning, hidden by default — it must go back exactly as it came."
                : "end_turn: it's finished. The loop stops and the text is the answer.",
              json: r,
            });
          } else if (ev.type === "tool") {
            frames.push({
              title: `${frames.length + 1} · Your code runs ${ev.call.name}`,
              body: ev.result.is_error ? "The tool failed — so the result says so, with is_error: true, and the model decides what to do about it." : "The result goes back as a tool_result whose tool_use_id matches the call. A string — objects get JSON.stringify'd.",
              json: ev.result,
            });
          }
        },
      });
      // Show what the second request looked like: the whole history, appended.
      const secondReq = client.calls[1];
      if (secondReq) {
        frames.splice(frames.findIndex((f) => /replies/.test(f.title) && f !== frames[1]), 0, {
          title: `· You send everything back`,
          body: "The same request again, now with the model's turn appended unchanged and your tool results in one user message. The API is stateless: each request carries the whole conversation.",
          json: { messages: secondReq.messages },
        });
      }
      frames[0].json = { model: client.calls[0].model, max_tokens: client.calls[0].max_tokens, tools: client.calls[0].tools, messages: client.calls[0].messages };
      frames.forEach((f, k) => { f.title = f.title.replace(/^\d* ?·/, `${k + 1} ·`); });
    }

    function show() {
      const f = frames[i];
      view.replaceChildren(el("h4", null, f.title), el("p", null, f.body), f.json ? jsonBlock(f.json) : null);
      counter.textContent = `Step ${i + 1} of ${frames.length}`;
      prev.disabled = i === 0;
      next.disabled = i === frames.length - 1;
      if (i === frames.length - 1) ctx.pass();
    }
    const prev = btn("← Back", () => { if (i > 0) { i--; show(); } }, "ghost");
    const next = btn("Next step →", () => { if (i < frames.length - 1) { i++; show(); } }, "primary");
    mount.append(el("div", { class: "w-row" }, prev, next, counter), view);
    build().then(show, (e) => view.replaceChildren(note(`Couldn't build the walkthrough: ${e.message}`, "w-err")));
  });

  register("apiPlayground", (mount, opts, ctx) => {
    const A = CC.agent, st = CC.store;
    const system = el("textarea", { rows: 3 });
    system.value = (opts && opts.system) || "You are a concise assistant for a physician. If you are not sure, say so.";
    const user = el("textarea", { rows: 3 });
    user.value = (opts && opts.user) || "In two sentences: what is the difference between a risk ratio and an odds ratio?";
    const out = el("div", { class: "w-out" });

    function request() {
      const body = {
        model: st.data.settings.model,
        max_tokens: 16000,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: st.data.settings.effort },
        system: system.value,
        messages: [{ role: "user", content: user.value }],
      };
      if (A.modelInfo(body.model).fallbacks) body.fallbacks = "default";
      return body;
    }
    function showRequest() {
      const body = request();
      const headers = {
        "content-type": "application/json",
        "x-api-key": st.apiKey() ? "sk-ant-…(yours, hidden)" : "(no key set)",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      };
      if (body.fallbacks) headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
      out.replaceChildren(el("p", { class: "w-label" }, "POST https://api.anthropic.com/v1/messages"), jsonBlock({ headers, body }));
      ctx.pass();
    }
    async function send() {
      if (!st.apiKey()) { out.replaceChildren(note("Add an API key in Settings above first. Everything else on this page works without one.", "w-err")); return; }
      out.replaceChildren(note("Waiting for Claude…"));
      try {
        const body = request();
        const r = await A.claude(body, st.apiKey());
        const thinking = (r.content || []).filter((b) => b.type === "thinking" && b.thinking).map((b) => b.thinking).join("\n");
        out.replaceChildren(
          r.stop_reason === "refusal" ? note(`Declined (stop_reason "refusal")${r.stop_details && r.stop_details.explanation ? `: ${r.stop_details.explanation}` : ""}.`, "w-err") : null,
          el("div", { class: "answer" }, A.textOf(r.content) || "(no text)"),
          thinking ? el("details", null, el("summary", null, "Its reasoning (a summary)"), el("p", { class: "w-hint pre" }, thinking)) : null,
          kv([["stop_reason", r.stop_reason], ["model", r.model], ["tokens in / out", `${r.usage.input_tokens} / ${r.usage.output_tokens}`], ["cost, roughly", `$${A.costOf(r.model, r.usage).toFixed(4)}`]]),
          el("details", null, el("summary", null, "The raw response"), jsonBlock(r)),
        );
        ctx.pass();
      } catch (e) {
        out.replaceChildren(note(e.message, "w-err"));
      }
    }
    mount.append(keyPanel(), field("System prompt", system), field("Your message", user),
      el("div", { class: "w-row" }, btn("Show the request", showRequest), btn("Send to Claude", send, "primary")), out);
  });

  register("literatureLab", (mount, opts, ctx) => {
    const A = CC.agent, st = CC.store;
    const q = el("input", { type: "text", class: "wide" });
    q.value = (ctx.state() && ctx.state().q) || "Does early mobilisation reduce readmission in older medical inpatients?";
    const mode = el("select", null, el("option", { value: "practice" }, "Practice — scripted model, fictional records, no key"), el("option", { value: "live" }, "Live — Claude with your key, real PubMed"));
    const trace = el("ol", { class: "trace" });
    const answer = el("div", { class: "w-out" });
    const runBtn = btn("Run the assistant", () => run(), "primary");

    function step(kind, title, body) {
      const li = el("li", { class: `trace-${kind}` }, el("p", { class: "trace-title" }, title));
      if (body) li.append(body);
      trace.append(li);
      li.scrollIntoView({ block: "nearest" });
    }

    function recordsList(recs, live) {
      return el("ul", { class: "records" }, recs.map((r) => el("li", null,
        el("span", { class: "mono" }, r.pmid), " ",
        live && /^\d+$/.test(r.pmid) ? el("a", { href: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, target: "_blank", rel: "noopener noreferrer" }, r.title || "(untitled)") : el("span", null, r.title || "(untitled)"),
        r.year || r.journal ? el("span", { class: "w-hint" }, ` — ${[r.journal, r.year].filter(Boolean).join(", ")}`) : null)));
    }

    async function run() {
      const live = mode.value === "live";
      ctx.save({ q: q.value });
      trace.replaceChildren();
      answer.replaceChildren();
      if (live && !st.apiKey()) { answer.append(note("Live mode needs an API key — add one in Settings, or use Practice mode.", "w-err")); return; }
      runBtn.disabled = true;
      const retrieved = [];
      const tools = A.literatureTools(live ? "live" : "practice", st.data.settings.pubmedEmail, (recs) => recs.forEach((r) => { if (!retrieved.includes(String(r.pmid))) retrieved.push(String(r.pmid)); }));
      const client = live ? A.liveClient(st.apiKey()) : A.scriptedClient(A.literatureScript(q.value));
      let spent = 0;
      step("user", "You ask", el("p", null, q.value));
      try {
        const result = await A.runAgent(client, {
          model: st.data.settings.model,
          system: A.LITERATURE_SYSTEM,
          tools,
          messages: [{ role: "user", content: q.value }],
          maxSteps: 8,
          thinking: live ? { type: "adaptive", display: "summarized" } : null,
          output_config: live ? { effort: st.data.settings.effort } : null,
          onStep: (ev) => {
            if (ev.type === "response") {
              const r = ev.response;
              if (live) spent += A.costOf(r.model, r.usage);
              const thought = (r.content || []).filter((b) => b.type === "thinking" && b.thinking).map((b) => b.thinking).join("\n");
              const said = A.textOf(r.content);
              const calls = (r.content || []).filter((b) => b.type === "tool_use");
              step("model", `Model · stop_reason "${r.stop_reason}"`, el("div", null,
                thought ? el("details", null, el("summary", null, "reasoning (summary)"), el("p", { class: "w-hint pre" }, thought)) : null,
                said && r.stop_reason !== "end_turn" ? el("p", null, said) : null,
                calls.length ? el("p", { class: "mono small" }, calls.map((c) => `→ ${c.name}(${JSON.stringify(c.input)})`).join("\n")) : null));
            } else if (ev.type === "tool") {
              let recs = null;
              try { recs = JSON.parse(ev.result.content); } catch { recs = null; }
              step(ev.result.is_error ? "error" : "tool", `${ev.call.name} ${ev.result.is_error ? "failed" : "returned"}`,
                ev.result.is_error ? el("p", null, ev.result.content)
                  : Array.isArray(recs) ? recordsList(recs, live) : el("p", { class: "mono small" }, String(ev.result.content).slice(0, 400)));
            }
          },
        });
        if (result.stop !== "end_turn") {
          answer.append(note(`Stopped: ${result.stop === "max_steps" ? "it hit the step limit without finishing" : result.stop === "refusal" ? "the model declined" : `stop_reason "${result.stop}"`}.`, "w-err"));
        }
        if (result.text) {
          const v = A.verifyCitations(result.text, retrieved);
          const paras = result.text.split(/\n\s*\n/).map((p) => {
            const pEl = el("p");
            p.split(/(\[PMID[:\s]*[A-Za-z0-9-]+\])/gi).forEach((part) => {
              const m = part.match(/^\[PMID[:\s]*([A-Za-z0-9-]+)\]$/i);
              if (m) pEl.append(el("span", { class: `cite ${v.unverified.includes(m[1]) ? "bad" : "ok"}`, title: v.unverified.includes(m[1]) ? "Never returned by the tools — unverified" : "Returned by the tools" }, `${v.unverified.includes(m[1]) ? "⚠ " : "✓ "}${m[1]}`));
              else pEl.append(part);
            });
            return pEl;
          });
          answer.append(el("div", { class: "answer" }, paras),
            el("p", { class: `w-score ${v.unverified.length ? "" : "good"}` },
              `${U.plural(v.cited.length, "citation")}: ${v.verified.length} verified against what the tools returned` +
              (v.unverified.length ? `, ${v.unverified.length} NOT — ${v.unverified.join(", ")} was never retrieved. Treat it as invented.` : ".") +
              (v.uncitedParagraphs ? ` ${U.plural(v.uncitedParagraphs, "paragraph")} make claims with no citation at all.` : "")),
            live ? note(`This run cost roughly $${spent.toFixed(4)}. Read the abstracts yourself before you rely on any of it.`) : note("Practice mode: the 'model' is a script and the records are fictional. It invents one citation on purpose, to show the check catching it."));
          ctx.pass();
        }
      } catch (e) {
        answer.append(note(e.message, "w-err"));
      } finally {
        runBtn.disabled = false;
      }
    }
    mount.append(keyPanel(), field("Your question", q), el("div", { class: "w-row" }, field("Mode", mode), runBtn), trace, answer);
  });

  /* ================================================================
     Deployment
     ================================================================ */

  register("urlDissector", (mount, opts, ctx) => {
    const input = el("input", { type: "url", class: "wide mono" });
    input.value = "https://your-name.github.io/my-site/research.html?topic=sepsis#publications";
    const out = el("div", { class: "w-out" });
    const examples = ["https://pubmed.ncbi.nlm.nih.gov/?term=early+mobilisation&sort=date", "http://localhost:8000/learn/#/l/deploy-web", "mailto:you@hospital.org?subject=Collaboration"];
    function render() {
      let u;
      try { u = new URL(input.value.trim()); }
      catch { out.replaceChildren(note("That isn't a complete URL — it needs a scheme like https:// at the front.", "w-err")); return; }
      const rows = [
        ["Scheme", u.protocol.replace(":", ""), u.protocol === "https:" ? "Encrypted. Browsers now treat plain http as insecure, and features like location refuse to work without https." : u.protocol === "http:" ? "Unencrypted — fine for localhost, not for a real site." : "Not a web page at all: the browser hands it to another app."],
        ["Host", u.hostname || "—", u.hostname.endsWith("github.io") ? "GitHub's servers. DNS turns this name into an IP address." : u.hostname === "localhost" ? "Your own machine." : "DNS turns this name into an IP address."],
        ["Port", u.port || "(default)", u.port ? "Explicit — usually only in development." : "443 for https, 80 for http."],
        ["Path", u.pathname || "/", "Which file or page on that server. On GitHub Pages it maps straight onto files in your repository."],
        ["Query", u.search || "—", u.search ? Array.from(u.searchParams.entries()).map(([k, v]) => `${k} = ${v}`).join(" · ") : "Extra parameters for the server or the page's own scripts."],
        ["Fragment", u.hash || "—", u.hash ? "Never sent to the server — the browser scrolls to the element with that id, or the page's scripts read it (this course uses it for navigation)." : "A place within the page."],
      ];
      out.replaceChildren(dataTable(["Part", "Here", "What it does"], rows));
      ctx.pass();
    }
    input.addEventListener("input", U.debounce(render, 250));
    render();
    mount.append(field("A URL", input), el("div", { class: "w-row" }, el("span", { class: "w-hint" }, "Try:"),
      examples.map((x) => btn(x.replace(/^https?:\/\//, "").slice(0, 32) + (x.length > 40 ? "…" : ""), () => { input.value = x; render(); }, "ghost small"))), out);
  });

  /* ---- the git terminal ---------------------------------------------------------- */

  function drawGraph(sim) {
    const g = sim.graph();
    const W = 46, H = 40, PADX = 20, PADY = 44;
    const commits = g.commits;
    const lanes = Math.max(1, ...commits.map((c) => c.lane + 1));
    const width = Math.max(260, PADX * 2 + Math.max(0, commits.length - 1) * W + 120);
    const height = PADY + lanes * H + 10;
    const svg = S("svg", { class: "graph", width, height, viewBox: `0 0 ${width} ${height}`, role: "img",
      "aria-label": commits.length ? `${commits.length} commits. ${commits.map((c) => `${c.id}: ${c.message}`).join("; ")}` : "No commits yet" });
    if (!commits.length) {
      svg.append(S("text", { x: 12, y: 30, class: "graph-empty" }, "No commits yet — the graph fills in as you commit."));
      return svg;
    }
    const pos = {};
    commits.forEach((c, i) => { pos[c.id] = { x: PADX + i * W, y: PADY + c.lane * H }; });
    const color = (lane) => SERIES[lane % SERIES.length];
    commits.forEach((c) => c.parents.forEach((p) => {
      if (!pos[p]) return;
      const a = pos[p], b = pos[c.id];
      const d = a.y === b.y ? `M${a.x},${a.y} L${b.x},${b.y}` : `M${a.x},${a.y} C${a.x + W * 0.6},${a.y} ${b.x - W * 0.6},${b.y} ${b.x},${b.y}`;
      svg.append(S("path", { d, class: "graph-edge", stroke: color(Math.max(c.lane, sim.state.commits[p].lane)) }));
    }));
    commits.forEach((c) => {
      const p = pos[c.id];
      const node = S("g", { class: "graph-node", tabindex: 0 },
        S("title", null, `${c.id} — ${c.message}${c.author !== "you" ? ` (by ${c.author})` : ""}`),
        S("circle", { cx: p.x, cy: p.y, r: 12, class: "graph-hit" }),
        S("circle", { cx: p.x, cy: p.y, r: c.parents.length > 1 ? 7 : 6, fill: color(c.lane), class: "graph-dot" }));
      svg.append(node);
      const labs = g.labels[c.id];
      if (labs) {
        /* Above and to the right of the dot, stacked when several labels
           share a commit (main and origin/main, usually). */
        labs.forEach((l, k) => {
          const text = (l.head ? "HEAD → " : "") + l.name;
          const y = p.y - 11 - k * 12;
          svg.append(S("text", { x: p.x - 4, y, class: `graph-label${l.head ? " head" : ""}${l.remote ? " remote" : ""}` }, text));
        });
      }
    });
    return svg;
  }

  register("gitTerminal", (mount, opts, ctx) => {
    const challenges = (opts && opts.challenges) || [];
    const saved = ctx.state() || {};
    const done = new Set(saved.done || []);
    let current = Math.min(saved.current || 0, Math.max(0, challenges.length - 1));
    let sim = CC.git.create();
    if (saved.sim) sim.restoreSnapshot(saved.sim);
    else if (challenges[current] && challenges[current].setup) challenges[current].setup(sim);

    const outEl = el("div", { class: "term-out", role: "log", "aria-live": "polite" });
    const input = el("input", { type: "text", class: "term-input mono", spellcheck: false, autocomplete: "off", autocapitalize: "off", autocorrect: "off", "aria-label": "Command" });
    const prompt = el("span", { class: "term-prompt mono" });
    const graphBox = el("div", { class: "graph-box" });
    const filesBox = el("div", { class: "files" });
    const goalBox = el("div", { class: "challenge" });
    const history = [];
    let hpos = 0;

    const persist = () => ctx.save({ done: Array.from(done), current, sim: sim.snapshot() });

    function print(lines) {
      lines.forEach((l) => outEl.append(el("pre", { class: `term-line ${l.cls || ""}` }, l.text)));
      outEl.scrollTop = outEl.scrollHeight;
    }
    function refresh() {
      const s = sim.state;
      prompt.textContent = `${s.cwd}${s.inited ? ` (${s.head}${s.merging ? "|MERGING" : ""})` : ""} $`;
      graphBox.replaceChildren(drawGraph(sim));
      // Files, with what git thinks of each.
      const ch = s.inited ? sim.changes() : { staged: [], unstaged: [], untracked: [] };
      const mark = {};
      ch.staged.forEach((x) => { mark[x.path] = (mark[x.path] || "") + "S"; });
      ch.unstaged.forEach((x) => { mark[x.path] = (mark[x.path] || "") + "M"; });
      ch.untracked.forEach((x) => { mark[x.path] = "?"; });
      const files = Object.keys(s.work).sort();
      filesBox.replaceChildren(el("p", { class: "w-label" }, "Files in the folder"),
        files.length ? el("ul", null, files.map((f) => el("li", null,
          el("button", { class: "linkish mono", type: "button", on: { click: () => editFile(f) } }, f),
          mark[f] ? el("span", { class: "fmark", title: mark[f] === "?" ? "untracked" : `${mark[f].includes("S") ? "staged" : ""}${mark[f] === "SM" ? " + " : ""}${mark[f].includes("M") ? "modified" : ""}` }, mark[f]) : null,
          sim.hasMarkers(s.work[f]) ? el("span", { class: "fmark bad" }, "conflict") : null)))
          : note("(empty)"),
        btn("New file…", () => { const name = prompt2("File name", "notes.md"); if (name) { sim.writeFile(name, ""); persist(); refresh(); editFile(name); } }, "ghost small"));
      renderGoal();
    }
    const prompt2 = (msg, def) => {
      const v = window.prompt(msg, def);
      return v && /^[\w.\/-]+$/.test(v.trim()) ? v.trim() : null;
    };
    function editFile(path) {
      const ta = el("textarea", { rows: 6, class: "mono" });
      ta.value = sim.state.work[path];
      const save = btn("Save file", () => { sim.writeFile(path, ta.value); persist(); refresh(); print([{ text: `(saved ${path})`, cls: "muted" }]); }, "primary small");
      filesBox.append(el("div", { class: "editor-pop" }, el("p", { class: "w-label" }, `Editing ${path}`), ta, el("div", { class: "w-row" }, save, btn("Close", () => refresh(), "ghost small"))));
      ta.focus();
    }
    function renderGoal() {
      if (!challenges.length) { goalBox.replaceChildren(); return; }
      const c = challenges[current];
      const isDone = done.has(c.id);
      const nav = el("div", { class: "w-row" },
        el("span", { class: "w-hint" }, `Challenge ${current + 1} of ${challenges.length}`),
        current > 0 ? btn("← Previous", () => go(current - 1), "ghost small") : null,
        isDone && current < challenges.length - 1 ? btn("Next challenge →", () => go(current + 1), "primary small") : null,
        btn("Start this one over", () => go(current, true), "ghost small"));
      goalBox.replaceChildren(
        el("p", { class: "challenge-title" }, isDone ? "✓ " : "", c.title),
        el("div", { class: "md", html: U.md(c.goal) }),
        c.hint ? el("details", null, el("summary", null, "Hint"), el("div", { class: "md", html: U.md(c.hint) })) : null,
        nav);
      goalBox.classList.toggle("done", isDone);
    }
    function go(k, fresh) {
      current = k;
      if (fresh || challenges[k].fresh !== false) {
        sim = CC.git.create();
        if (challenges[k].setup) challenges[k].setup(sim);
        outEl.replaceChildren();
        print([{ text: `— ${challenges[k].title} —`, cls: "muted" }]);
      }
      persist();
      refresh();
      input.focus();
    }
    function check() {
      const c = challenges[current];
      if (!c || done.has(c.id)) return;
      let ok = false;
      try { ok = c.check(sim); } catch { ok = false; }
      if (ok) {
        done.add(c.id);
        persist();
        renderGoal();
        print([{ text: `✓ ${c.title} — done.${current < challenges.length - 1 ? " Next challenge when you're ready." : ""}`, cls: "ok" }]);
        if (challenges.every((x) => done.has(x.id))) ctx.pass();
      }
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const line = input.value;
        input.value = "";
        if (!line.trim()) return;
        history.push(line);
        hpos = history.length;
        print([{ text: `${prompt.textContent} ${line}`, cls: "cmd" }]);
        if (line.trim() === "clear") outEl.replaceChildren();
        else print(sim.exec(line));
        persist();
        refresh();
        check();
      } else if (e.key === "ArrowUp") {
        if (hpos > 0) { hpos--; input.value = history[hpos]; e.preventDefault(); }
      } else if (e.key === "ArrowDown") {
        if (hpos < history.length - 1) { hpos++; input.value = history[hpos]; } else { hpos = history.length; input.value = ""; }
        e.preventDefault();
      }
    });
    mount.append(goalBox,
      el("div", { class: "term-grid" },
        el("div", { class: "term", on: { click: (e) => { if (e.target === e.currentTarget || e.target.classList.contains("term-out")) input.focus(); } } },
          outEl, el("div", { class: "term-row" }, prompt, input)),
        el("div", { class: "term-side" }, graphBox, filesBox)));
    if (!saved.sim) print([{ text: "Type help to see the commands. ↑ and ↓ recall what you typed.", cls: "muted" }]);
    refresh();
    if (done.size === challenges.length && challenges.length) ctx.pass();
  });

  register("dnsHelper", (mount, opts, ctx) => {
    const user = el("input", { type: "text", placeholder: "your-github-username", class: "mono" });
    const domain = el("input", { type: "text", placeholder: "drexample.com", class: "mono" });
    const out = el("div", { class: "w-out" });
    const saved = ctx.state() || {};
    user.value = saved.user || "";
    domain.value = saved.domain || "";
    function render() {
      const u = user.value.trim(), d = domain.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      ctx.save({ user: u, domain: domain.value });
      if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(u)) { out.replaceChildren(note("Enter your GitHub username (letters, digits and single hyphens).")); return; }
      if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) { out.replaceChildren(note("Enter the domain you bought, like drexample.com — no https://, no path.")); return; }
      const rows = [
        ["A", "@", "185.199.108.153"], ["A", "@", "185.199.109.153"], ["A", "@", "185.199.110.153"], ["A", "@", "185.199.111.153"],
        ["AAAA", "@", "2606:50c0:8000::153"], ["AAAA", "@", "2606:50c0:8001::153"], ["AAAA", "@", "2606:50c0:8002::153"], ["AAAA", "@", "2606:50c0:8003::153"],
        ["CNAME", "www", `${u.toLowerCase()}.github.io`],
      ];
      out.replaceChildren(
        el("p", null, "At your domain registrar's DNS settings, add these records (delete any old A or CNAME records for the same names first):"),
        dataTable(["Type", "Name", "Value"], rows),
        el("ol", { class: "steps" },
          el("li", null, "In your site's repository: Settings → Pages → Custom domain → ", el("code", null, `www.${d}`), " → Save. GitHub commits a file called CNAME for you."),
          el("li", null, "Wait. DNS changes take minutes to hours to spread; the Pages settings screen shows when it's happy."),
          el("li", null, "Tick Enforce HTTPS once GitHub has issued the certificate (it does this itself, free)."),
          el("li", null, "Verify the domain in your GitHub account (Settings → Pages → Add a domain) so no one else can point a Pages site at it.")),
        note(`www.${d} becomes the address and ${d} redirects to it. Never use wildcard records (*.${d}) with GitHub Pages — that's how domains get taken over.`));
      ctx.pass();
    }
    user.addEventListener("input", U.debounce(render, 300));
    domain.addEventListener("input", U.debounce(render, 300));
    render();
    mount.append(el("div", { class: "w-grid" }, field("GitHub username", user), field("Your domain", domain)), out);
  });

  /* The checker the CI lesson ships: zero dependencies, so the workflow
     needs nothing but node, like this repository's own checks. */
  const CHECK_SITE = String.raw`#!/usr/bin/env node
/* check-site.mjs — run by .github/workflows/site-checks.yml
   Every .html file: has a <title>, has <html lang>, every <img> has alt
   text, and every local link or image points at a file that exists.
   No dependencies; exits 1 with a list if anything is wrong. */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = resolve(process.argv[2] || ".");
const SKIP = new Set([".git", ".github", "node_modules"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(ROOT)) {
  const html = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  if (!/<title>[^<]+<\/title>/i.test(html)) problems.push(rel + ": no <title>");
  if (!/<html[^>]*\slang=["'][^"']+["']/i.test(html)) problems.push(rel + ": <html> has no lang attribute");
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt\s*=/i.test(m[0])) problems.push(rel + ": <img> without alt text: " + m[0].slice(0, 80));
  }
  for (const m of html.matchAll(/\s(?:href|src)\s*=\s*["']([^"']*)["']/gi)) {
    const url = m[1].split(/[?#]/)[0];
    if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) continue;   // external, mailto:, tel:, data:
    let path;
    try { path = decodeURIComponent(url); } catch { path = url; }
    const target = path.startsWith("/") ? join(ROOT, path) : resolve(dirname(file), path);
    const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, "index.html")));
    if (!ok) problems.push(rel + ": broken link -> " + m[1]);
  }
}

if (problems.length) {
  console.error(problems.join("\n") + "\n\n" + problems.length + " problem(s).");
  process.exit(1);
}
console.log("Site checks passed.");
`;

  function workflowYaml(o) {
    const lines = [
      "# Checks the site on every push and pull request, like this",
      "# repository's own checks.yml. Needs .github/scripts/check-site.mjs.",
      "name: Site checks",
      "",
      "on:",
      "  push:",
      '    branches: ["**"]',
      "  pull_request:",
    ];
    if (o.weekly) lines.push("  schedule:", "    # Mondays 06:23 UTC — links rot even when you don't change anything.", '    - cron: "23 6 * * 1"');
    lines.push("  workflow_dispatch:", "", "permissions:", "  contents: read", "", "jobs:", "  check:", "    runs-on: ubuntu-latest", "    timeout-minutes: 5", "    steps:",
      "      - uses: actions/checkout@v4", "      - uses: actions/setup-node@v4", "        with:", '          node-version: "20"',
      "      - name: Titles, languages, alt text and links", "        run: node .github/scripts/check-site.mjs");
    return lines.join("\n") + "\n";
  }

  const PAGES_YAML = [
    "# Publishes the site with GitHub Actions instead of \"Deploy from a branch\".",
    "# Settings → Pages → Source: GitHub Actions. GitHub's own starter",
    "# (Static HTML) writes an equivalent file with the newest versions.",
    "name: Deploy to Pages",
    "",
    "on:",
    "  push:",
    '    branches: ["main"]',
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: read",
    "  pages: write",
    "  id-token: write",
    "",
    "concurrency:",
    '  group: "pages"',
    "  cancel-in-progress: false",
    "",
    "jobs:",
    "  deploy:",
    "    environment:",
    "      name: github-pages",
    "      url: ${{ steps.deployment.outputs.page_url }}",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/configure-pages@v5",
    "      - uses: actions/upload-pages-artifact@v3",
    "        with:",
    "          path: \".\"",
    "      - id: deployment",
    "        uses: actions/deploy-pages@v4",
    "",
  ].join("\n");

  register("workflowBuilder", (mount, opts, ctx) => {
    const weekly = el("input", { type: "checkbox" });
    const pages = el("input", { type: "checkbox" });
    const out = el("div", { class: "w-out" });
    function fileCard(path, text) {
      return el("div", { class: "filecard" },
        el("div", { class: "w-row" }, el("code", null, path),
          btn("Copy", async () => { await U.copyText(text); ctx.pass(); }, "ghost small"),
          btn("Download", () => { U.download(path.split("/").pop(), text, "text/plain"); ctx.pass(); }, "ghost small")),
        el("pre", { class: "code" }, el("code", null, text)));
    }
    function render() {
      out.replaceChildren(
        fileCard(".github/workflows/site-checks.yml", workflowYaml({ weekly: weekly.checked })),
        fileCard(".github/scripts/check-site.mjs", CHECK_SITE),
        pages.checked ? fileCard(".github/workflows/pages.yml", PAGES_YAML) : null,
      );
    }
    weekly.addEventListener("change", render);
    pages.addEventListener("change", render);
    render();
    mount.append(el("div", { class: "w-row" },
      el("label", { class: "w-check" }, weekly, " Also run every Monday (catches links that rot)"),
      el("label", { class: "w-check" }, pages, " Deploy with Actions too (optional — branch deploys need no workflow)")), out);
  });

  register("siteCheck", (mount, opts, ctx) => {
    const input = el("input", { type: "url", class: "wide mono", placeholder: "https://your-name.github.io/" });
    input.value = (ctx.state() && ctx.state().url) || "";
    const out = el("div", { class: "w-out" });
    async function go() {
      let u;
      try { u = new URL(input.value.trim()); } catch { out.replaceChildren(note("That isn't a full URL — start it with https://", "w-err")); return; }
      ctx.save({ url: u.href });
      out.replaceChildren(note("Knocking…"));
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      try {
        // no-cors: we can't read another site's page from here, but we can
        // tell whether its server answered at all.
        await fetch(u.href, { mode: "no-cors", cache: "no-store", signal: ctl.signal });
        out.replaceChildren(
          el("p", { class: "w-score good" }, "✓ The server answered."),
          u.protocol !== "https:" ? note("It's on http — turn on Enforce HTTPS in Settings → Pages.", "w-err") : null,
          el("p", null, el("a", { href: u.href, target: "_blank", rel: "noopener noreferrer" }, "Open it"), " and look: a server answering only means something is there, not that it's your latest version. GitHub Pages can take a minute or two after a push."));
        ctx.pass();
      } catch {
        out.replaceChildren(note("✕ No answer. Check the spelling; give a fresh deploy a couple of minutes; or this page may be blocked from making outside requests (some previews are).", "w-err"));
      } finally { clearTimeout(timer); }
    }
    mount.append(field("Your site's address", input), el("div", { class: "w-row" }, btn("Is it live?", go, "primary")), out);
  });

  register("checklist", (mount, opts, ctx) => {
    const items = (opts && opts.items) || [];
    const state = ctx.state() || { checked: {} };
    const list = el("ul", { class: "checklist" });
    const count = el("p", { class: "w-score" });
    function update() {
      const n = items.filter((it) => state.checked[it.id]).length;
      count.textContent = `${n} of ${items.length} done`;
      count.className = `w-score ${n === items.length ? "good" : ""}`;
      ctx.save(state);
      if (n === items.length) ctx.pass();
    }
    items.forEach((it) => {
      const box = el("input", { type: "checkbox" });
      box.checked = Boolean(state.checked[it.id]);
      box.addEventListener("change", () => { state.checked[it.id] = box.checked; update(); });
      list.append(el("li", null, el("label", null, box, el("span", { html: U.inline(it.text) })),
        it.detail ? el("div", { class: "w-hint md", html: U.md(it.detail) }) : null));
    });
    update();
    mount.append(list, count);
  });

  /* ================================================================
     Research
     ================================================================ */

  register("pico", (mount, opts, ctx) => {
    const saved = ctx.state() || {};
    const mk = (k, ph) => { const i = el("input", { type: "text", placeholder: ph }); i.value = saved[k] || ""; return i; };
    const P = mk("P", "older adults admitted to medical wards"), I = mk("I", "early mobilisation"), C = mk("C", "usual care"), O = mk("O", "30-day readmission");
    const Ps = mk("Ps", "aged, elderly, older adults, inpatients"), Is = mk("Is", "early mobilization, early ambulation, mobility programme"), Os = mk("Os", "patient readmission, readmission, rehospitalization");
    const design = el("select", null, ["any", "randomised trials", "cohort studies", "systematic reviews"].map((d) => el("option", { value: d }, d)));
    design.value = saved.design || "any";
    const out = el("div", { class: "w-out" });
    const DESIGN = {
      "randomised trials": "(randomized controlled trial[pt] OR randomized[tiab] OR randomised[tiab])",
      "cohort studies": "(cohort studies[mh] OR cohort[tiab] OR prospective[tiab] OR retrospective[tiab])",
      "systematic reviews": "(systematic review[pt] OR meta-analysis[pt] OR systematic review[tiab])",
    };
    const concept = (main, syn) => {
      const terms = [main.value, ...syn.value.split(",")].map((t) => t.trim()).filter(Boolean);
      const uniq = Array.from(new Set(terms.map((t) => t.toLowerCase())));
      if (!uniq.length) return "";
      const q = uniq.map((t) => (/\s/.test(t) ? `"${t}"[tiab]` : `${t}[tiab]`));
      return q.length === 1 ? q[0] : `(${q.join(" OR ")})`;
    };
    function render() {
      const st = { P: P.value, I: I.value, C: C.value, O: O.value, Ps: Ps.value, Is: Is.value, Os: Os.value, design: design.value };
      ctx.save(st);
      if (!P.value.trim() || !I.value.trim() || !O.value.trim()) {
        out.replaceChildren(note("Fill in at least the population, the intervention or exposure, and the outcome."));
        return;
      }
      const question = `In ${P.value.trim()}, does ${I.value.trim()}${C.value.trim() ? `, compared with ${C.value.trim()},` : ""} change ${O.value.trim()}?`;
      const parts = [concept(P, Ps), concept(I, Is), concept(O, Os)].filter(Boolean);
      if (DESIGN[design.value]) parts.push(DESIGN[design.value]);
      const query = parts.join("\nAND ");
      const link = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query.replace(/\n/g, " "))}`;
      const live = el("div");
      out.replaceChildren(
        el("p", { class: "w-label" }, "Your question"), el("p", { class: "answer" }, question),
        el("p", { class: "w-label" }, "A PubMed search to start from"), el("pre", { class: "code" }, el("code", null, query)),
        el("div", { class: "w-row" },
          btn("Copy", () => U.copyText(query.replace(/\n/g, " ")), "ghost small"),
          el("a", { class: "btn ghost small", href: link, target: "_blank", rel: "noopener noreferrer" }, "Open in PubMed ↗"),
          btn("Count results here", async () => {
            live.replaceChildren(note("Asking PubMed…"));
            try {
              const r = await CC.agent.pubmedSearch(query.replace(/\n/g, " "), 5, CC.store.data.settings.pubmedEmail);
              live.replaceChildren(el("p", null, `${r.count.toLocaleString()} records. The first ${r.records.length}:`),
                el("ul", { class: "records" }, r.records.map((x) => el("li", null, el("a", { href: `https://pubmed.ncbi.nlm.nih.gov/${x.pmid}/`, target: "_blank", rel: "noopener noreferrer" }, x.title), el("span", { class: "w-hint" }, ` — ${x.journal}, ${x.year}`)))));
            } catch (e) { live.replaceChildren(note(e.message, "w-err")); }
          }, "ghost small")),
        live,
        note("[tiab] searches titles and abstracts; quoted phrases stay together. A real review adds MeSH terms ([mh]) and has a librarian check it — this is a starting point, and its job is to be too wide rather than too narrow."));
      ctx.pass();
    }
    [P, I, C, O, Ps, Is, Os, design].forEach((n) => n.addEventListener("input", U.debounce(render, 300)));
    design.addEventListener("change", render);
    mount.append(el("div", { class: "w-grid" },
      field("P — population", P), field("…also called", Ps, "comma-separated synonyms"),
      field("I — intervention or exposure", I), field("…also called", Is),
      field("C — comparison", C), field("O — outcome", O), field("…also called", Os), field("Study design", design)), out);
    render();
  });

  register("twoByTwo", (mount, opts, ctx) => {
    const S2 = CC.stats;
    const crude = table2x2(cohort(), (r) => r.readmit30 === 1);
    const presets = {
      "MOVE-EARLY, crude": crude,
      "A rare outcome": { a: 12, b: 988, c: 24, d: 976 },
      "A common outcome": { a: 400, b: 600, c: 600, d: 400 },
      "Small numbers": { a: 3, b: 9, c: 8, d: 2 },
    };
    const inputs = {};
    ["a", "b", "c", "d"].forEach((k) => { inputs[k] = el("input", { type: "number", min: 0, step: 1, class: "num" }); });
    const set = (t) => { ["a", "b", "c", "d"].forEach((k) => { inputs[k].value = t[k]; }); render(); };
    const out = el("div", { class: "w-out" });
    const grid = el("table", { class: "twobytwo" },
      el("thead", null, el("tr", null, el("th"), el("th", { scope: "col" }, "Outcome"), el("th", { scope: "col" }, "No outcome"))),
      el("tbody", null,
        el("tr", null, el("th", { scope: "row" }, "Exposed"), el("td", null, inputs.a), el("td", null, inputs.b)),
        el("tr", null, el("th", { scope: "row" }, "Not exposed"), el("td", null, inputs.c), el("td", null, inputs.d))));
    function render() {
      const v = {};
      for (const k of ["a", "b", "c", "d"]) {
        v[k] = Math.round(Number(inputs[k].value));
        if (!Number.isFinite(v[k]) || v[k] < 0) { out.replaceChildren(note("Each cell needs a whole number, 0 or more.", "w-err")); return; }
      }
      if (v.a + v.b === 0 || v.c + v.d === 0) { out.replaceChildren(note("Each row needs at least one person in it.", "w-err")); return; }
      const t = S2.twoByTwo(v.a, v.b, v.c, v.d);
      const dir = t.rd < 0 ? "lower" : "higher";
      out.replaceChildren(kv([
        ["Risk if exposed", `${pct(t.riskExposed)} (${v.a} of ${v.a + v.b})`],
        ["Risk if not", `${pct(t.riskUnexposed)} (${v.c} of ${v.c + v.d})`],
        ["Risk ratio", `${fmt(t.rr)} (95% CI ${ci(t.rrCI)})`],
        ["Odds ratio", `${fmt(t.or)} (95% CI ${ci(t.orCI)})`],
        ["Risk difference", `${(t.rd * 100).toFixed(1)} percentage points (${(t.rdCI[0] * 100).toFixed(1)} to ${(t.rdCI[1] * 100).toFixed(1)})`],
        ["Number needed to treat", Number.isFinite(t.nnt) ? `${Math.ceil(t.nnt)}${t.rd < 0 ? " (to prevent one)" : " (to cause one more)"}` : "—"],
        ["χ² test", `χ² = ${fmt(t.chi2)}, ${pText(t.p)}`],
        t.fisherP != null ? ["Fisher's exact", `${pText(t.fisherP)} — use this one: some expected counts are under 5`, "warn"] : null,
      ].filter(Boolean)),
      t.corrected ? note("A cell is zero, so 0.5 was added to every cell for the ratios (Haldane–Anscombe).") : null,
      el("p", { class: "answer" }, `Exposed people had a ${dir} risk: ${pct(t.riskExposed)} against ${pct(t.riskUnexposed)}, a risk ratio of ${fmt(t.rr)} (95% CI ${ci(t.rrCI)}).` +
        (Math.abs(Math.log(t.or) - Math.log(t.rr)) > 0.1 ? ` Notice the odds ratio (${fmt(t.or)}) is further from 1 — with a common outcome the two drift apart, and reading an OR as if it were a RR overstates the effect.` : "")));
      ctx.pass();
    }
    ["a", "b", "c", "d"].forEach((k) => inputs[k].addEventListener("input", U.debounce(render, 200)));
    mount.append(el("div", { class: "w-row" }, el("span", { class: "w-hint" }, "Load:"), Object.keys(presets).map((p) => btn(p, () => set(presets[p]), "ghost small"))), grid, out);
    set((opts && opts.preset && presets[opts.preset]) || crude);
  });

  function forestPlot(rows) {
    const W = 560, rowH = 28, top = 26, left = 168, right = 150;
    const H = top + rows.length * rowH + 30;
    const lo = Math.min(0.25, ...rows.map((r) => r.ci[0])), hi = Math.max(2, ...rows.map((r) => r.ci[1]));
    const x = (v) => left + ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (W - left - right);
    const svg = S("svg", { class: "forest", viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": rows.map((r) => `${r.label}: ${fmt(r.est)} (${ci(r.ci)})`).join("; ") });
    [0.25, 0.5, 1, 2].filter((t) => t >= lo && t <= hi).forEach((t) => {
      svg.append(S("line", { x1: x(t), x2: x(t), y1: top - 8, y2: H - 24, class: t === 1 ? "axis-one" : "grid" }));
      svg.append(S("text", { x: x(t), y: H - 8, class: "tick", "text-anchor": "middle" }, String(t)));
    });
    // Either side of the line of no effect, pointing away from it.
    svg.append(S("text", { x: x(1) - 8, y: 14, class: "tick", "text-anchor": "end" }, "← favours the programme"));
    svg.append(S("text", { x: x(1) + 8, y: 14, class: "tick" }, "favours usual care →"));
    rows.forEach((r, i) => {
      const y = top + i * rowH + rowH / 2;
      const g = S("g", { class: `forest-row${r.pooled ? " pooled" : ""}`, tabindex: 0 },
        S("title", null, `${r.label}: OR ${fmt(r.est)} (95% CI ${ci(r.ci)})`),
        S("text", { x: 0, y: y + 4, class: "row-label" }, r.label),
        S("line", { x1: x(Math.max(lo, r.ci[0])), x2: x(Math.min(hi, r.ci[1])), y1: y, y2: y, class: "ci-line" }),
        r.pooled
          ? S("path", { d: `M${x(r.est) - 7},${y} L${x(r.est)},${y - 6} L${x(r.est) + 7},${y} L${x(r.est)},${y + 6} Z`, class: "est pooled-est" })
          : S("rect", { x: x(r.est) - 4, y: y - 4, width: 8, height: 8, rx: 1, class: "est" }),
        S("text", { x: W - right + 12, y: y + 4, class: "row-value" }, `${fmt(r.est)} (${ci(r.ci)})`));
      svg.append(g);
    });
    return svg;
  }

  register("stratify", (mount, opts, ctx) => {
    const S2 = CC.stats;
    const rows = dataFor(opts);
    const outcome = (r) => r.readmit30 === 1;
    const strata = FRAILTY_BANDS.map((b) => ({ ...b, t: table2x2(rows.filter(b.test), outcome), all: rows.filter(b.test) }));
    const crude = table2x2(rows, outcome);
    const ct = S2.twoByTwo(crude.a, crude.b, crude.c, crude.d);
    const mh = S2.mantelHaenszel(strata.map((s) => s.t));
    const forestRows = strata.map((s) => { const t = S2.twoByTwo(s.t.a, s.t.b, s.t.c, s.t.d); return { label: s.label, est: t.or, ci: t.orCI }; })
      .concat([{ label: "Crude (ignoring frailty)", est: ct.or, ci: ct.orCI, pooled: true }, { label: "Adjusted (Mantel–Haenszel)", est: mh.or, ci: mh.orCI, pooled: true }]);
    const tableRows = strata.map((s) => {
      const n = s.all.length, e = s.all.filter((r) => r.emp).length;
      const t = S2.twoByTwo(s.t.a, s.t.b, s.t.c, s.t.d);
      return [s.label, String(n), pct(e / n, 0), pct(t.riskExposed, 0), pct(t.riskUnexposed, 0), `${fmt(t.or)} (${ci(t.orCI)})`];
    });
    mount.append(
      el("figure", { class: "chart" }, forestPlot(forestRows), el("figcaption", null, "Odds ratio for 30-day readmission, programme vs usual care, with 95% confidence intervals (log scale). Squares: within each frailty band. Diamonds: crude and adjusted.")),
      dataTable(["Frailty band", "People", "Got the programme", "Readmitted (programme)", "Readmitted (usual care)", "Odds ratio (95% CI)"], tableRows, "The same numbers as a table"),
      el("p", { class: "answer" }, `Ignoring frailty, the programme looks protective: OR ${fmt(ct.or)} (${ci(ct.orCI)}). Within each frailty band the effect is smaller, and pooling the bands gives ${fmt(mh.or)} (${ci(mh.orCI)}) — an interval that includes 1. Look at the "got the programme" column: the fitter you were, the likelier you were to be mobilised early. That's the confounding.`),
    );
    ctx.pass();
  });

  register("table1", (mount, opts, ctx) => {
    const S2 = CC.stats;
    const source = el("select", null, el("option", { value: "clean" }, "The cohort as simulated"), el("option", { value: "messy" }, "The messy spreadsheet, after the cleaning rules"));
    const out = el("div", { class: "w-out" });
    function smdCont(a, b) { return (S2.mean(a) - S2.mean(b)) / Math.sqrt((S2.variance(a) + S2.variance(b)) / 2); }
    function smdBin(p1, p0) { return (p1 - p0) / Math.sqrt((p1 * (1 - p1) + p0 * (1 - p0)) / 2); }
    function render() {
      const rows = source.value === "clean" ? cohort() : cleanedCohort();
      const e = rows.filter((r) => r.emp === 1), u = rows.filter((r) => r.emp === 0);
      const col = (g, f) => g.map(f);
      const meanSd = (xs) => { const v = xs.filter(S2.isNum); return `${fmt(S2.mean(v), 1)} (${fmt(S2.sd(v), 1)})`; };
      const medIqr = (xs) => `${fmt(S2.median(xs), 0)} [${fmt(S2.quantile(xs, 0.25), 0)}–${fmt(S2.quantile(xs, 0.75), 0)}]`;
      const nPct = (g, f) => { const n = g.filter(f).length; return `${n} (${pct(n / g.length, 0)})`; };
      const prop = (g, f) => g.filter(f).length / g.length;
      const missingAge = (g) => g.filter((r) => r.age == null).length;
      const fmtSmd = (x) => `${fmt(Math.abs(x), 2)}${Math.abs(x) > 0.1 ? " ⚑" : ""}`;
      const body = [
        ["Age, years — mean (SD)", meanSd(col(e, (r) => r.age)), meanSd(col(u, (r) => r.age)), fmtSmd(smdCont(col(e, (r) => r.age).filter(S2.isNum), col(u, (r) => r.age).filter(S2.isNum)))],
        missingAge(rows) ? ["  Age missing", String(missingAge(e)), String(missingAge(u)), ""] : null,
        ["Female — n (%)", nPct(e, (r) => r.sex === "F"), nPct(u, (r) => r.sex === "F"), fmtSmd(smdBin(prop(e, (r) => r.sex === "F"), prop(u, (r) => r.sex === "F")))],
        ["Diabetes — n (%)", nPct(e, (r) => r.diabetes === 1), nPct(u, (r) => r.diabetes === 1), fmtSmd(smdBin(prop(e, (r) => r.diabetes === 1), prop(u, (r) => r.diabetes === 1)))],
        ["Clinical Frailty Scale — median [IQR]", medIqr(col(e, (r) => r.cfs)), medIqr(col(u, (r) => r.cfs)), fmtSmd(smdCont(col(e, (r) => r.cfs), col(u, (r) => r.cfs)))],
        ["Length of stay, days — median [IQR]", medIqr(col(e, (r) => r.los)), medIqr(col(u, (r) => r.los)), fmtSmd(smdCont(col(e, (r) => r.los), col(u, (r) => r.los)))],
      ].filter(Boolean);
      out.replaceChildren(
        dataTable(["", `Early mobility (n = ${e.length})`, `Usual care (n = ${u.length})`, "SMD"], body, `Table 1. Characteristics by exposure — ${rows.length} people`),
        note("SMD is the standardised mean difference: how far apart the groups are, in standard deviations. Above 0.1 (⚑) is the usual flag for imbalance worth adjusting for. There are no p-values on purpose — Table 1 describes who you studied; it doesn't test anything."),
        btn("Download as CSV", () => U.download("table1.csv", [["Characteristic", "Early mobility", "Usual care", "SMD"]].concat(body).map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv"), "ghost small"));
      ctx.pass();
    }
    source.addEventListener("change", render);
    render();
    mount.prepend(field("Data", source));
    mount.append(out);
  });

  register("dataPeek", (mount, opts, ctx) => {
    const S2 = CC.stats;
    const csv = S2.makeMessyCSV({ seed: S2.SEED });
    const raw = S2.parseSimpleCSV(csv);
    const ids = raw.map((r) => r.id);
    const dupes = ids.length - new Set(ids).size;
    const ageBad = raw.filter((r) => !/^\d+$/.test(String(r.age).trim()) || Number(r.age) > 110).length;
    const sexForms = Array.from(new Set(raw.map((r) => JSON.stringify(r.sex)))).sort();
    const empForms = Array.from(new Set(raw.map((r) => r.emp))).sort();
    const negTime = raw.filter((r) => Number(r.time) <= 0).length;
    const head = Object.keys(raw[0]);
    const flag = (k, v) => {
      if (k === "age" && (!/^\d+$/.test(String(v).trim()) || Number(v) > 110)) return true;
      if (k === "sex" && !/^(F|M)$/.test(v)) return true;
      if (k === "emp" && !/^(0|1)$/.test(v)) return true;
      if (k === "time" && Number(v) <= 0) return true;
      return false;
    };
    const show = raw.slice(0, 14);
    const t = el("table", { class: "data" },
      el("thead", null, el("tr", null, head.map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", null, show.map((r) => el("tr", null, head.map((h) => el("td", { class: flag(h, r[h]) ? "flag" : "" }, r[h] === "" ? "(blank)" : r[h]))))));
    mount.append(
      el("div", { class: "table-wrap" }, t),
      kv([
        ["Rows", String(raw.length)],
        ["Duplicate ids", String(dupes)],
        ["Ages blank, NA or impossible", String(ageBad)],
        ["Ways of writing sex", sexForms.join("  ")],
        ["Ways of writing yes/no (emp)", empForms.join("  ")],
        ["Follow-up times ≤ 0", String(negTime)],
      ]),
      el("div", { class: "w-row" }, btn("Download the messy CSV", () => U.download("move-early-messy.csv", csv, "text/csv"), "ghost small"), note("Highlighted cells are ones the cleaning rules have to deal with.")),
    );
    ctx.pass();
  });

  /* Kaplan–Meier, with the number-at-risk table every published curve owes
     its reader, and a crosshair that reads off every group at once. */
  register("kmPlot", (mount, opts, ctx) => {
    const S2 = CC.stats;
    const rows = dataFor(opts);
    const groupBy = el("select", null,
      el("option", { value: "emp" }, "Early mobility vs usual care"),
      el("option", { value: "frailty" }, "Frailty band"),
      el("option", { value: "diabetes" }, "Diabetes"));
    groupBy.value = (opts && opts.groupBy) || "emp";
    const bands = el("input", { type: "checkbox" });
    const wrap = el("div", { class: "km-wrap" });
    const tip = el("div", { class: "tooltip", hidden: true });
    const summary = el("div", { class: "w-out" });

    function groups() {
      if (groupBy.value === "emp") return [{ label: "Early mobility", rows: rows.filter((r) => r.emp === 1) }, { label: "Usual care", rows: rows.filter((r) => r.emp === 0) }];
      if (groupBy.value === "diabetes") return [{ label: "No diabetes", rows: rows.filter((r) => !r.diabetes) }, { label: "Diabetes", rows: rows.filter((r) => r.diabetes) }];
      return FRAILTY_BANDS.map((b) => ({ label: b.label, rows: rows.filter(b.test) }));
    }

    function render() {
      const gs = groups().map((g, i) => ({ ...g, km: S2.kaplanMeier(g.rows), color: SERIES[i] }));
      const W = 640, H = 300, L = 44, R = 132, T = 14, B = 34;
      const xMax = 365;
      const x = (t) => L + (t / xMax) * (W - L - R);
      const y = (s) => T + (1 - s) * (H - T - B);
      const svg = S("svg", { class: "km", viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": `Kaplan–Meier curves, ${gs.map((g) => `${g.label}: ${pct(S2.survivalAt(g.km, 365), 0)} event-free at one year`).join("; ")}` });
      [0, 0.25, 0.5, 0.75, 1].forEach((s) => {
        svg.append(S("line", { x1: L, x2: W - R, y1: y(s), y2: y(s), class: "grid" }));
        svg.append(S("text", { x: L - 8, y: y(s) + 4, class: "tick", "text-anchor": "end" }, `${s * 100}%`));
      });
      [0, 90, 180, 270, 365].forEach((t) => svg.append(S("text", { x: x(t), y: H - 14, class: "tick", "text-anchor": "middle" }, String(t))));
      svg.append(S("text", { x: (L + W - R) / 2, y: H - 1, class: "tick", "text-anchor": "middle" }, "Days since discharge"));
      svg.append(S("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), class: "axis" }));
      const endLabels = [];
      gs.forEach((g) => {
        let d = `M${x(0)},${y(1)}`, s = 1;
        const band = [];
        g.km.steps.forEach((st) => {
          if (st.time > xMax) return;
          if (st.events > 0) { d += ` H${x(st.time)} V${y(st.survival)}`; s = st.survival; }
          band.push(st);
        });
        d += ` H${x(xMax)}`;
        if (bands.checked) {
          /* The band is the upper step function drawn forward and the lower
             one drawn back, closed into one shape. */
          const pts = band.filter((st) => st.events > 0);
          let p = `M${x(0)},${y(1)}`;
          pts.forEach((st) => { p += ` H${x(st.time)} V${y(st.upper)}`; });
          p += ` H${x(xMax)} V${y(pts.length ? pts[pts.length - 1].lower : 1)}`;
          for (let k = pts.length - 1; k >= 0; k--) p += ` H${x(pts[k].time)} V${y(k > 0 ? pts[k - 1].lower : 1)}`;
          p += ` H${x(0)} Z`;
          svg.append(S("path", { d: p, fill: g.color, class: "ci-band" }));
        }
        svg.append(S("path", { d, stroke: g.color, class: "km-line" }));
        g.rows.filter((r) => !r.event && r.time < xMax).forEach((r) => {
          const sAt = S2.survivalAt(g.km, r.time);
          svg.append(S("line", { x1: x(r.time), x2: x(r.time), y1: y(sAt) - 4, y2: y(sAt) + 4, stroke: g.color, class: "censor" }));
        });
        endLabels.push({ y: y(s), label: g.label, color: g.color, s });
      });
      // End labels, pushed apart just enough not to overlap.
      endLabels.sort((a, b) => a.y - b.y);
      for (let i = 1; i < endLabels.length; i++) if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14;
      endLabels.forEach((l) => {
        svg.append(S("line", { x1: W - R + 2, x2: W - R + 14, y1: l.y, y2: l.y, stroke: l.color, class: "key" }));
        svg.append(S("text", { x: W - R + 18, y: l.y + 4, class: "end-label" }, `${l.label} ${pct(l.s, 0)}`));
      });
      // Crosshair.
      const cross = S("line", { y1: T, y2: y(0), class: "crosshair", visibility: "hidden" });
      const hit = S("rect", { x: L, y: T, width: W - L - R, height: y(0) - T, class: "hit", tabindex: 0, "aria-label": "Move along the curves to read values" });
      svg.append(cross, hit);
      const move = (clientX) => {
        const box = svg.getBoundingClientRect();
        const px = ((clientX - box.left) / box.width) * W;
        const t = Math.round(Math.max(0, Math.min(xMax, ((px - L) / (W - L - R)) * xMax)));
        cross.setAttribute("x1", x(t)); cross.setAttribute("x2", x(t)); cross.setAttribute("visibility", "visible");
        tip.replaceChildren(el("p", { class: "tip-head" }, `Day ${t}`), ...gs.map((g) => el("p", { class: "tip-row" },
          el("span", { class: "tip-key", style: { background: g.color } }),
          el("strong", null, pct(S2.survivalAt(g.km, t), 1)), ` ${g.label} · ${S2.atRiskAt(g.rows, t)} at risk`)));
        tip.hidden = false;
        const wb = wrap.getBoundingClientRect();
        const left = clientX - wb.left + 14;
        tip.style.left = `${Math.min(left, wb.width - 230)}px`;
        tip.style.top = "8px";
      };
      hit.addEventListener("pointermove", (e) => move(e.clientX));
      hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; });
      let kt = 180;
      hit.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        kt = Math.max(0, Math.min(365, kt + (e.key === "ArrowRight" ? 15 : -15)));
        const box = svg.getBoundingClientRect();
        move(box.left + (x(kt) / W) * box.width);
        e.preventDefault();
      });
      hit.addEventListener("blur", () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; });
      wrap.replaceChildren(svg, tip);

      const times = [0, 90, 180, 270, 365];
      const risk = dataTable(["Number at risk", ...times.map((t) => `Day ${t}`)], gs.map((g) => [g.label, ...times.map((t) => String(S2.atRiskAt(g.rows, t)))]));
      const sumRows = gs.map((g) => {
        const last = g.km.steps.filter((st) => st.time <= 365).slice(-1)[0];
        return [g.label, String(g.rows.length), String(g.km.events), g.km.median == null ? "not reached" : `${g.km.median} days`,
          last ? `${pct(last.survival, 0)} (${pct(last.lower, 0)}–${pct(last.upper, 0)})` : "—"];
      });
      const lr = gs.length === 2 ? S2.logRank(gs[0].rows, gs[1].rows) : null;
      summary.replaceChildren(risk,
        dataTable(["Group", "People", "Events", "Median time to event", "Event-free at 1 year (95% CI)"], sumRows),
        lr ? el("p", { class: "answer" }, `Log-rank test: χ² = ${fmt(lr.chi2)}, ${pText(lr.p)}. Observed events ${lr.observed.map((o) => fmt(o, 0)).join(" vs ")}; expected under no difference ${lr.expected.map((o) => fmt(o, 1)).join(" vs ")}.`)
          : note("With more than two groups the log-rank test generalises (R's survdiff does it); this widget reports it for two groups only."),
        groupBy.value === "emp" ? note("This curve is crude. The groups differ in frailty (see Table 1), so a gap here is partly who got the programme, not what it did — the same confounding as the 2×2 lesson. A Cox model with frailty as a covariate is the usual next step.") : null);
      ctx.pass();
    }
    groupBy.addEventListener("change", render);
    bands.addEventListener("change", render);
    mount.append(el("div", { class: "w-row" }, field("Compare", groupBy), el("label", { class: "w-check" }, bands, " Show 95% confidence bands")),
      el("figure", { class: "chart" }, wrap, el("figcaption", null, "Event-free survival (death or readmission). Ticks mark people censored — still well when follow-up ended. Hover or use ← → on the chart to read values.")),
      summary);
    render();
  });

  register("abstractBuilder", (mount, opts, ctx) => {
    const S2 = CC.stats;
    const rows = cleanedCohort();
    const rawN = S2.parseSimpleCSV(S2.makeMessyCSV({ seed: S2.SEED })).length;
    const e = rows.filter((r) => r.emp === 1), u = rows.filter((r) => r.emp === 0);
    const crude = table2x2(rows, (r) => r.readmit30 === 1);
    const ct = S2.twoByTwo(crude.a, crude.b, crude.c, crude.d);
    const mh = S2.mantelHaenszel(FRAILTY_BANDS.map((b) => table2x2(rows.filter(b.test), (r) => r.readmit30 === 1)));
    const kmE = S2.kaplanMeier(e), kmU = S2.kaplanMeier(u);
    const lr = S2.logRank(e, u);
    const lastOf = (km) => km.steps.filter((st) => st.time <= 365).slice(-1)[0];
    const sE = lastOf(kmE), sU = lastOf(kmU);
    const saved = ctx.state() || {};
    const area = (k, rows2, text) => { const t = el("textarea", { rows: rows2 }); t.value = saved[k] != null ? saved[k] : text; return t; };
    const bg = area("bg", 3, "Early mobilisation is widely recommended for older medical inpatients, but its effect on readmission is uncertain.");
    const methods = area("methods", 4, `Simulated cohort study (MOVE-EARLY; synthetic data, no real patients). Adults admitted to medical wards, followed for one year. Exposure: an early mobility programme started within 48 hours. Outcomes: 30-day readmission, and time to death or readmission. Odds ratios were estimated crude and stratified by Clinical Frailty Scale band (Mantel–Haenszel); survival by Kaplan–Meier with the log-rank test.`);
    const results = area("results", 6, [
      `Of ${rawN} spreadsheet rows, ${rows.length} people remained after removing duplicates and records that failed the cleaning rules; ${e.length} received the programme.`,
      `Readmission within 30 days was ${pct(ct.riskExposed)} with early mobility and ${pct(ct.riskUnexposed)} with usual care (crude OR ${fmt(ct.or)}, 95% CI ${ci(ct.orCI)}).`,
      `After stratifying by frailty, the OR was ${fmt(mh.or)} (95% CI ${ci(mh.orCI)}).`,
      `At one year, ${pct(sE.survival, 0)} of the programme group and ${pct(sU.survival, 0)} of the usual-care group were alive without readmission (log-rank ${pText(lr.p)}, unadjusted).`,
    ].join(" "));
    const concl = area("concl", 4, "");
    const count = el("p", { class: "w-hint" });
    const items = [
      ["Says it's simulated / the design", () => /simulat|synthetic/i.test(methods.value + concl.value)],
      ["Gives an effect size with a confidence interval", () => /95%\s*CI/i.test(results.value)],
      ["Reports the adjusted estimate, not just the crude", () => /stratif|adjust/i.test(results.value)],
      ["Conclusion mentions confounding or uncertainty", () => /confound|uncertain|imprecise|may|might|cannot|can't|limit/i.test(concl.value)],
      ["Conclusion at least 25 words", () => concl.value.trim().split(/\s+/).filter(Boolean).length >= 25],
    ];
    const list = el("ul", { class: "checks" });
    function update() {
      ctx.save({ bg: bg.value, methods: methods.value, results: results.value, concl: concl.value });
      const states = items.map(([label, f]) => ({ label, ok: f() }));
      list.replaceChildren(...states.map((s) => el("li", { class: s.ok ? "ok" : "no" }, el("span", { class: "mark", "aria-hidden": "true" }, s.ok ? "✓" : "✗"), s.label)));
      count.textContent = `Conclusion: ${concl.value.trim().split(/\s+/).filter(Boolean).length} words`;
      if (states.every((s) => s.ok)) ctx.pass();
    }
    [bg, methods, results, concl].forEach((t) => t.addEventListener("input", U.debounce(update, 250)));
    const md = () => [
      "# Early mobility and readmission in older medical inpatients: a simulated cohort study", "",
      "**Background.** " + bg.value.trim(), "",
      "**Methods.** " + methods.value.trim(), "",
      "**Results.** " + results.value.trim(), "",
      "**Conclusions.** " + concl.value.trim(), "",
      `*Data are simulated (Code Clinic MOVE-EARLY, seed ${S2.SEED}). No real patients.*`, "",
    ].join("\n");
    update();
    mount.append(
      field("Background", bg), field("Methods", methods),
      field("Results — filled in from the analysis; check every number against the widgets above", results),
      field("Conclusions — yours to write", concl), count, list,
      el("div", { class: "w-row" }, btn("Download as Markdown", () => U.download("move-early-abstract.md", md(), "text/markdown"), "primary"), btn("Copy", () => U.copyText(md()), "ghost")));
  });

  CC.widgets = { register, get: (n) => REG[n], names: () => Object.keys(REG), CHECK_SITE, workflowYaml, PAGES_YAML, forestPlot };
})(window.CC);
