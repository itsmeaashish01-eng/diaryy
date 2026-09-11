/* ================================================
   AGENTS — app.js
   Reads agents.json and state.json and shows what each agent has been
   doing. Read-only on purpose: the runner owns the state file, and a
   page that could edit it would be a page that could lose a run's work.
   ================================================ */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  let defs = null, state = null;

  /* ---- small helpers ---- */

  function relTime(ts) {
    if (!ts) return "never";
    const diff = ts - Date.now();
    const abs = Math.abs(diff), fut = diff > 0;
    let n, unit;
    if (abs < MIN) return fut ? "in a moment" : "just now";
    if (abs < HOUR) { n = Math.round(abs / MIN); unit = "m"; }
    else if (abs < DAY) { n = Math.round(abs / HOUR); unit = "h"; }
    else { n = Math.round(abs / DAY); unit = "d"; }
    return fut ? `in ${n}${unit}` : `${n}${unit} ago`;
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* Everything below builds nodes rather than HTML strings. The events
     come from pages and feeds on the open internet, and a title is not
     a place to find markup you then run. */
  function linkify(url) {
    const a = el("a", null, url.length > 60 ? url.slice(0, 57) + "…" : url);
    a.href = url;
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    return a;
  }

  /* ---- sparkline ---- */

  function sparkline(metrics) {
    const pts = metrics.slice(-80);
    if (pts.length < 2) return null;

    const W = 600, H = 44, PAD = 3;
    const values = pts.map((p) => p.v);
    const lo = Math.min(...values), hi = Math.max(...values);
    const span = hi - lo;
    const x = (i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
    /* A series that hasn't moved is a flat line through the middle, not
       one pinned to the floor — the floor reads as "it crashed". */
    const y = (v) => (span === 0 ? H / 2 : H - PAD - ((v - lo) / span) * (H - PAD * 2));

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label",
      `${pts.length} readings, lowest ${round(lo)}, highest ${round(hi)}, latest ${round(values[values.length - 1])}`);

    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

    const fill = document.createElementNS(svg.namespaceURI, "path");
    fill.setAttribute("d", `${line} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`);
    fill.setAttribute("fill", "var(--viz-series-fill)");

    const stroke = document.createElementNS(svg.namespaceURI, "path");
    stroke.setAttribute("d", line);
    stroke.setAttribute("fill", "none");
    stroke.setAttribute("stroke", "var(--viz-series)");
    stroke.setAttribute("stroke-width", "1.5");
    stroke.setAttribute("vector-effect", "non-scaling-stroke");

    svg.append(fill, stroke);
    return svg;
  }

  const round = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : String(Number(Number(n).toFixed(2))));

  /* ---- one card ---- */

  function statusOf(agent, s) {
    if (agent.active === false) return { cls: "paused", icon: "–", word: "paused" };
    if (!s || !s.lastRun) return { cls: "waiting", icon: "·", word: "not run yet" };
    if (s.lastError) return { cls: "failed", icon: "✕", word: `failing (${s.errorCount}×)` };
    const level = s.events && s.events[0] ? s.events[0].level : "ok";
    if (level === "urgent") return { cls: "urgent", icon: "🚨", word: "urgent" };
    return { cls: "ok", icon: "✓", word: "ok" };
  }

  function card(agent) {
    const s = (state.agents && state.agents[agent.id]) || null;
    const st = statusOf(agent, s);

    const node = el("article", "card");

    const head = el("div", "card-head");
    const h = el("h2");
    h.append(document.createTextNode(agent.label || agent.id), el("span", "type", agent.type));
    head.append(h, el("span", `pill ${st.cls}`, `${st.icon} ${st.word}`));
    node.append(head);

    node.append(el("p", "when",
      s && s.lastRun
        ? `Last run ${relTime(s.lastRun)} · every ${agent.intervalMin || 60} min`
        : `Every ${agent.intervalMin || 60} min`));

    if (agent.note) node.append(el("p", "muted", agent.note));

    if (s && s.lastError) {
      node.append(el("p", "line", s.lastError.message));
    } else if (s && s.lastLine) {
      node.append(el("p", "line", s.lastLine));
    }

    if (s && s.metrics && s.metrics.length) {
      const spark = sparkline(s.metrics);
      if (spark) {
        const values = s.metrics.map((m) => m.v);
        node.append(spark);
        node.append(el("p", "spark-note",
          `${s.metrics.length} readings · low ${round(Math.min(...values))} · high ${round(Math.max(...values))}`));
      }
    }

    const events = (s && s.events) || [];
    if (events.length) {
      const det = el("details");
      det.append(el("summary", null, `${events.length} recent ${events.length === 1 ? "finding" : "findings"}`));
      const ul = el("ul", "events");
      for (const e of events.slice(0, 12)) {
        const li = el("li");
        li.append(el("div", "etitle", e.title || "(no title)"));
        if (e.detail) li.append(el("div", "edetail", e.detail));
        if (e.url) li.append(linkify(e.url));
        const t = el("time", null, relTime(e.t));
        t.dateTime = new Date(e.t).toISOString();
        li.append(t);
        ul.append(li);
      }
      det.append(ul);
      node.append(det);
    }

    return node;
  }

  /* ---- render ---- */

  function render() {
    const cards = $("cards");
    cards.textContent = "";

    const agents = (defs && defs.agents) || [];
    $("empty").hidden = agents.length > 0;
    if (!agents.length) return;

    for (const a of agents) cards.append(card(a));

    const last = (state.runs && state.runs[0]) || null;
    const active = agents.filter((a) => a.active !== false).length;
    const failing = agents.filter((a) => {
      const s = state.agents && state.agents[a.id];
      return s && s.lastError;
    }).length;

    const totals = $("totals");
    totals.textContent = "";
    const add = (n, label) => {
      const t = el("div", "total");
      t.append(el("b", null, String(n)), el("span", null, label));
      totals.append(t);
    };
    add(active, active === 1 ? "agent running" : "agents running");
    add(agents.length - active, "paused");
    add(failing, "failing");
    if (last) add(last.notified || 0, "alerts last run");
    totals.hidden = false;

    $("lede").textContent = last
      ? `Last run ${relTime(last.t)} — ${last.ran} ran, ${last.failed} failed, ${last.notified} worth telling you about.`
      : "Nothing has run yet.";
  }

  /* ---- loading ---- */

  async function loadFromDisk() {
    const [a, s] = await Promise.all([
      fetch("data/agents.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("data/state.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { agents: {}, runs: [] }))
        .catch(() => ({ agents: {}, runs: [] })),
    ]);
    defs = a;
    state = s;
  }

  function readFile(input, onDone) {
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          onDone(JSON.parse(reader.result));
          $("fallbackNote").textContent = "";
          if (defs) render();
        } catch (e) {
          $("fallbackNote").textContent = `That file didn't parse: ${e.message}`;
        }
      };
      reader.readAsText(f);
      input.value = "";
    });
  }

  /* ---- dark mode, shared with the diary ---- */
  function initDark() {
    const on = localStorage.getItem("darkMode") === "1";
    document.body.classList.toggle("dark", on);
    $("darkToggle").textContent = on ? "☀" : "☾";
    $("darkToggle").addEventListener("click", () => {
      const now = !document.body.classList.contains("dark");
      document.body.classList.toggle("dark", now);
      localStorage.setItem("darkMode", now ? "1" : "0");
      $("darkToggle").textContent = now ? "☀" : "☾";
    });
  }

  async function start() {
    initDark();
    $("reloadBtn").addEventListener("click", () => start());

    state = { agents: {}, runs: [] };
    readFile($("agentsFile"), (j) => { defs = j; });
    readFile($("stateFile"), (j) => { state = j; });

    try {
      await loadFromDisk();
      $("loadFallback").hidden = true;
      render();
    } catch (e) {
      /* Opened off disk, almost certainly. Say what's happening rather
         than showing an empty page that looks broken. */
      $("loadFallback").hidden = false;
      $("lede").textContent = "Couldn't read the data files from here.";
      $("empty").hidden = true;
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
