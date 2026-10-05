/* ================================================
   MARKET LENS — app.js
   The page. Talks only to market/server.mjs on this computer.
   ================================================ */

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("marketLens." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("marketLens." + k, JSON.stringify(v)); } catch { /* private window */ } },
  };

  // ---------------------------------------------------------------- helpers

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(d)}%`);
  const spct = (x, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`);
  const money = (x) => (x == null ? "—" : "$" + Math.round(x).toLocaleString());
  const price = (x) => (x == null ? "—" : "$" + x.toFixed(2));
  const ago = (t) => {
    const h = (Date.now() - t) / 3600e3;
    if (h < 1) return "just now";
    if (h < 24) return `${Math.round(h)}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };
  const bigMoney = (x) => {
    if (x == null) return "—";
    const a = Math.abs(x);
    if (a >= 1e9) return `$${(x / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
    return money(x);
  };

  function tone(p) {
    if (p >= 0.56) return "good";
    if (p <= 0.44) return "bad";
    return "flat";
  }

  function sparkline(values, w = 96, h = 28) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("class", "spark");
    if (!values || values.length < 2) return svg;
    const lo = Math.min(...values), hi = Math.max(...values);
    const x = (i) => (i / (values.length - 1)) * (w - 2) + 1;
    const y = (v) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
    const path = document.createElementNS(NS, "polyline");
    path.setAttribute("points", values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "));
    path.setAttribute("class", values[values.length - 1] >= values[0] ? "up" : "down");
    svg.append(path);
    const title = document.createElementNS(NS, "title");
    title.textContent = `${spct(values[values.length - 1] / values[0] - 1)} over the past year`;
    svg.append(title);
    return svg;
  }

  /* Probability bar with a 50% midline and the leave-one-out range. */
  function probBar(p, band) {
    const wrap = el("div", { class: "pbar", role: "img", "aria-label": `${pct(p, 1)} probability up` });
    if (band) {
      wrap.append(el("span", { class: "pbar-band", style: `left:${band[0] * 100}%;width:${Math.max(0.5, (band[1] - band[0]) * 100)}%` }));
    }
    wrap.append(el("span", { class: "pbar-mid" }));
    wrap.append(el("span", { class: `pbar-dot ${tone(p)}`, style: `left:${p * 100}%` }));
    return wrap;
  }

  // ---------------------------------------------------------------- theme

  function applyDark(on) {
    document.body.classList.toggle("dark", on);
    $("#darkToggle").textContent = on ? "☀" : "☾";
  }
  const savedDark = (() => { try { return localStorage.getItem("darkMode"); } catch { return null; } })();
  applyDark(savedDark == null ? window.matchMedia("(prefers-color-scheme: dark)").matches : savedDark === "1");
  $("#darkToggle").addEventListener("click", () => {
    const on = !document.body.classList.contains("dark");
    applyDark(on);
    try { localStorage.setItem("darkMode", on ? "1" : "0"); } catch { /* fine */ }
  });

  // ---------------------------------------------------------------- api

  async function api(path, body) {
    const res = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  }

  // ---------------------------------------------------------------- render

  function renderTiles(r) {
    const tiles = $("#tiles");
    tiles.replaceChildren();
    const top = r.stocks[0];
    const wf = r.model.walkForward;
    const m = r.market;
    const tile = (label, value, sub, cls) =>
      el("div", { class: `tile ${cls || ""}` }, el("div", { class: "tile-label", text: label }), el("div", { class: "tile-value", text: value }), el("div", { class: "tile-sub", text: sub }));

    tiles.append(
      tile("Strongest case", top ? top.symbol : "—", top ? `${pct(top.quantum.p, 1)} up over ${r.horizonLabel} · ${top.verdict.text}` : "", top ? tone(top.quantum.p) : ""),
      tile("Market mood", m ? (m.score > 0.1 ? "Upbeat" : m.score < -0.1 ? "Worried" : "Mixed") : "—",
        m ? `${m.score >= 0 ? "+" : ""}${m.score.toFixed(2)} from ${m.n} headlines` : "market news unavailable",
        m ? (m.score > 0.1 ? "good" : m.score < -0.1 ? "bad" : "flat") : ""),
      tile("Model on unseen data", wf ? pct(wf.accuracy, 1) : "—",
        wf ? `vs ${pct(wf.baseRateAccuracy, 1)} by always guessing the usual answer` : "not enough history to test",
        wf ? (wf.skill > 0.01 ? "good" : "flat") : ""),
      tile("S&P 500 (SPY)", m && m.benchmark ? price(m.benchmark.price) : "—",
        m && m.benchmark && m.benchmark.change6m != null ? `${spct(m.benchmark.change6m)} over 6 months` : "", "")
    );
  }

  let openRow = null;

  function renderTable(r) {
    const tb = $("#rankTable tbody");
    tb.replaceChildren();
    $("#rankHint").textContent = `${r.stocks.length} stocks · ${r.horizonLabel} ahead · ranked by probability and risk-adjusted upside`;
    r.stocks.forEach((s, i) => {
      const f = s.fundamentals;
      const row = el("tr", { class: "row", tabindex: "0", "aria-expanded": "false" },
        el("td", { class: "muted", text: i + 1 }),
        el("td", {}, el("div", { class: "sym", text: s.symbol }), el("div", { class: "name", text: s.name })),
        el("td", { class: "hide-sm" }, sparkline(s.spark)),
        el("td", { class: "pcell" }, el("span", { class: `pnum ${tone(s.quantum.p)}`, text: pct(s.quantum.p, 1) }), probBar(s.quantum.p, s.quantum.band)),
        el("td", { class: "hide-sm" }, el("span", { class: `chip ${s.verdict.key}`, text: s.verdict.text })),
        el("td", { class: "num hide-sm" },
          el("div", { text: s.montecarlo ? spct(s.montecarlo.p50) : "—" }),
          el("div", { class: "muted small", text: s.montecarlo ? `${spct(s.montecarlo.p10, 0)} to ${spct(s.montecarlo.p90, 0)}` : "" })),
        el("td", { class: "num hide-md", text: pct(s.model.pBeatMarket) }),
        el("td", { class: `num hide-md ${s.news ? (s.news.score > 0.05 ? "good-t" : s.news.score < -0.05 ? "bad-t" : "") : ""}` },
          s.news ? `${s.news.score >= 0 ? "+" : "−"}${Math.abs(s.news.score).toFixed(2)}` : "—",
          s.news ? el("div", { class: "muted small", text: `${s.news.n} stories` }) : null),
        el("td", { class: "num hide-md", text: f && f.peerRank != null ? `${Math.round(f.peerRank * 100)}th pct` : f ? "scored" : "—" })
      );
      const detail = el("tr", { class: "detail", hidden: true }, el("td", { colspan: "9" }, renderDetail(s, r)));
      const toggle = () => {
        const open = detail.hidden;
        if (openRow && openRow !== detail) {
          openRow.hidden = true;
          openRow.previousSibling.setAttribute("aria-expanded", "false");
        }
        detail.hidden = !open;
        row.setAttribute("aria-expanded", String(open));
        openRow = open ? detail : null;
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      tb.append(row, detail);
    });
  }

  function renderDetail(s, r) {
    const q = s.quantum;
    const evidence = el("div", { class: "evidence" },
      el("h3", { text: "The evidence" }),
      ...s.sources.map((src) => {
        const part = q.parts.find((p) => p.id === src.id);
        return el("div", { class: "ev-row" + (src.p == null ? " missing" : "") },
          el("div", { class: "ev-label" }, src.label, el("span", { class: "muted small", text: part ? ` · ${pct(part.share)} of the say` : " · unavailable" })),
          src.p == null ? el("div", { class: "muted small", text: "no data this run" }) : probBar(src.p),
          el("div", { class: `ev-p ${src.p == null ? "" : tone(src.p)}`, text: src.p == null ? "—" : pct(src.p, 1) }));
      }),
      el("div", { class: "ev-sum" },
        el("div", {}, el("span", { class: "muted", text: "Fused P(up) " }), el("strong", { text: pct(q.p, 1) }), el("span", { class: "muted", text: ` (range ${pct(q.band[0])}–${pct(q.band[1])})` })),
        el("div", {}, el("span", { class: "muted", text: "Fidelity " }), el("strong", { text: q.fidelity.toFixed(4) }),
          el("span", { class: "muted", text: ` · ${pct(q.consensus)} of the weight agrees · evidence strength ${pct(q.confidence)}` })))
    );

    const mc = s.montecarlo;
    const facts = el("div", { class: "facts" },
      el("h3", { text: "Price & outlook" }),
      el("dl", {},
        el("dt", { text: "Last close" }), el("dd", { text: `${price(s.price)} on ${s.asOf}` }),
        el("dt", { text: "1 month / 6 months" }), el("dd", { text: `${spct(s.change1m)} / ${spct(s.change6m)}` }),
        el("dt", { text: `Middle outcome, ${r.horizonLabel}` }), el("dd", { text: mc ? spct(mc.p50) : "—" }),
        el("dt", { text: "1-in-10 bad / good case" }), el("dd", { text: mc ? `${spct(mc.p10)} / ${spct(mc.p90)}` : "—" }),
        el("dt", { text: "Volatility (yearly)" }), el("dd", { text: mc ? pct(mc.annualVol) : "—" }),
        el("dt", { text: "Model: up / beats S&P" }), el("dd", { text: `${pct(s.model.pUp, 1)} / ${pct(s.model.pBeatMarket, 1)}` }),
        el("dt", { text: "Price data" }), el("dd", { text: s.priceSource || "—" }))
    );

    const f = s.fundamentals;
    const report = el("div", { class: "facts" },
      el("h3", { text: "Latest company report" }),
      f
        ? el("dl", {},
            el("dt", { text: "Period / form" }), el("dd", { text: `${f.period} · ${f.form}${f.filed ? `, filed ${f.filed}` : ""}` }),
            el("dt", { text: "Quarterly revenue" }), el("dd", { text: bigMoney(f.revenue) }),
            el("dt", { text: "Revenue vs a year ago" }), el("dd", { text: spct(f.revenueGrowth) + (f.growthAccel != null ? ` (${f.growthAccel >= 0 ? "speeding up" : "slowing"})` : "") }),
            el("dt", { text: "Net income vs a year ago" }), el("dd", { text: spct(f.netIncomeGrowth) }),
            el("dt", { text: "Operating margin" }), el("dd", { text: pct(f.opMargin, 1) }),
            el("dt", { text: "Free-cash-flow margin" }), el("dd", { text: pct(f.fcfMargin, 1) }),
            el("dt", { text: "Liabilities / equity" }), el("dd", { text: f.debtToEquity == null ? "—" : f.debtToEquity.toFixed(2) }),
            el("dt", { text: "P/E (trailing)" }), el("dd", { text: f.pe ? f.pe.toFixed(1) : f.epsTTM != null && f.epsTTM <= 0 ? "loss-making" : "—" }),
            el("dt", { text: "Rank among these" }), el("dd", { text: f.peerRank == null ? "—" : `${Math.round(f.peerRank * 100)}th percentile` }))
        : el("p", { class: "muted", text: "No SEC filing data. That's normal for ETFs and foreign companies. If it's missing for every stock, set your contact email in Settings." })
    );

    const news = el("div", { class: "news" },
      el("h3", { text: "Recent headlines" }),
      s.news && s.news.headlines.length
        ? el("ul", {}, ...s.news.headlines.map((h) =>
            el("li", {},
              el("span", { class: `dot ${h.score > 0.15 ? "good" : h.score < -0.15 ? "bad" : "flat"}`, title: `sentiment ${h.score.toFixed(2)}`, "aria-label": h.score > 0.15 ? "positive" : h.score < -0.15 ? "negative" : "neutral" }),
              h.url ? el("a", { href: h.url, target: "_blank", rel: "noopener noreferrer", text: h.title }) : el("span", { text: h.title }),
              el("span", { class: "muted small", text: ` · ${h.source || ""} · ${ago(h.at)}` }))))
        : el("p", { class: "muted", text: "No headlines found." })
    );

    return el("div", { class: "detail-grid" }, evidence, facts, report, news);
  }

  function renderAllocation(r) {
    const a = r.allocation;
    const card = $("#allocCard");
    card.replaceChildren();
    const rows = [...a.picks.map((p) => ({ label: p.symbol, sub: p.name, share: p.share, amount: p.amount, p: p.p })),
      { label: "Broad index", sub: "S&P 500 fund, e.g. SPY or VOO", share: a.indexShare, amount: Math.round(a.budget * a.indexShare), index: true }];
    const bar = el("div", { class: "stack", role: "img", "aria-label": rows.map((x) => `${x.label} ${pct(x.share)}`).join(", ") },
      ...rows.filter((x) => x.share > 0.001).map((x, i) =>
        el("span", { class: x.index ? "seg index" : `seg s${i % 6}`, style: `width:${x.share * 100}%`, title: `${x.label} ${pct(x.share, 1)}` })));
    card.append(
      el("div", { class: "card-head" }, el("h2", { text: `An illustrative split of ${money(a.budget)}` }), el("span", { class: "hint", text: `${r.horizonLabel} horizon` })),
      bar,
      el("table", { class: "alloc" },
        el("tbody", {}, ...rows.map((x, i) => el("tr", {},
          el("td", {}, el("span", { class: x.index ? "key index" : `key s${i % 6}` }), el("strong", { text: x.label }), el("span", { class: "muted small", text: `  ${x.sub || ""}` })),
          el("td", { class: "num", text: pct(x.share, 1) }),
          el("td", { class: "num", text: money(x.amount) }),
          el("td", { class: "num muted small", text: x.p ? `${pct(x.p, 1)} up` : "" }))))),
      el("p", { class: "hint", text: a.note })
    );
  }

  function renderModel(r) {
    const m = r.model, wf = m.walkForward, wb = m.walkForwardBeat;
    const card = $("#modelCard");
    card.replaceChildren();
    const nice = { r21: "1-month move", r63: "3-month move", r126: "6-month move", mom12_1: "12-month momentum", vol63: "Volatility", volTrend: "Volatility rising", sma50_200: "50/200-day trend", dd252: "Distance from 1-yr high", rsi14: "RSI (14-day)", rel126: "6-month vs S&P 500" };
    const maxW = Math.max(...m.importance.map((x) => Math.abs(x.weight)), 1e-9);
    card.append(
      el("h2", { text: "How much to trust the model" }),
      wf
        ? el("p", {}, `Trained on ${m.examples.toLocaleString()} examples, then tested on ${wf.testSamples.toLocaleString()} later ones it never saw (from ${wf.testedFrom}). `,
            el("strong", { text: `It was right ${pct(wf.accuracy, 1)} of the time` }), ` versus ${pct(wf.baseRateAccuracy, 1)} for always guessing the usual answer. AUC ${wf.auc.toFixed(3)}, where 0.5 means no better than chance. `,
            wf.skill > 0 ? `Its probabilities were ${pct(wf.skill, 1)} better calibrated than the base rate.` : "Its probabilities were no better calibrated than the base rate, so its say has been turned down.",
            wb ? ` For beating the S&P 500: ${pct(wb.accuracy, 1)} right vs ${pct(wb.baseRateAccuracy, 1)}.` : "")
        : el("p", { class: "muted", text: "Not enough history to run an out-of-sample test." }),
      el("h3", { text: "What it learned to look at" }),
      el("div", { class: "imp" }, ...m.importance.map((x) =>
        el("div", { class: "imp-row" },
          el("span", { text: nice[x.feature] || x.feature }),
          el("span", { class: "imp-bar" }, el("span", { class: x.weight >= 0 ? "pos" : "neg", style: `width:${(Math.abs(x.weight) / maxW) * 100}%` })),
          el("span", { class: "muted small", text: x.weight >= 0 ? "higher → more often up" : "higher → less often up" }))))
    );
  }

  function renderMarket(r) {
    const card = $("#marketCard");
    card.replaceChildren();
    const m = r.market;
    card.append(el("h2", { text: "Market & economy headlines" }));
    if (!m) { card.append(el("p", { class: "muted", text: "Market news wasn't available this run." })); return; }
    card.append(el("ul", { class: "news" }, ...m.headlines.map((h) =>
      el("li", {},
        el("span", { class: `dot ${h.score > 0.15 ? "good" : h.score < -0.15 ? "bad" : "flat"}` }),
        h.url ? el("a", { href: h.url, target: "_blank", rel: "noopener noreferrer", text: h.title }) : el("span", { text: h.title }),
        el("span", { class: "muted small", text: ` · ${h.source || ""} · ${ago(h.at)}` })))));
  }

  function renderErrors(r) {
    const card = $("#errorsCard");
    card.replaceChildren();
    card.hidden = !r.errors.length;
    if (!r.errors.length) return;
    card.append(
      el("h2", { text: "What couldn't be fetched" }),
      el("p", { class: "hint", text: "The analysis ran without these. A missing SEC report for every stock usually means the contact email in Settings isn't set." }),
      el("ul", { class: "errs" }, ...r.errors.map((e) => el("li", {}, el("strong", { text: `${e.symbol} · ${e.what}: ` }), e.why))));
  }

  function render(r) {
    $("#empty").hidden = true;
    $("#report").hidden = false;
    renderTiles(r);
    renderTable(r);
    renderAllocation(r);
    renderModel(r);
    renderMarket(r);
    renderErrors(r);
    $("#foot").textContent = `Generated ${new Date(r.generatedAt).toLocaleString()} · prices, news and filings from Yahoo Finance, Stooq, Google News and SEC EDGAR · not financial advice.`;
  }

  // ---------------------------------------------------------------- run

  let polling = null;

  function showProgress(job) {
    const box = $("#progress");
    box.hidden = !job.running;
    $("#progressHead").textContent = job.running ? "Analysing…" : "";
    $("#progressLog").textContent = job.log.slice(-8).join("\n");
    $("#runBtn").disabled = job.running;
  }

  async function poll() {
    try {
      const job = await api("/api/status");
      showProgress(job);
      if (!job.running) {
        clearInterval(polling);
        polling = null;
        if (job.error) {
          alert(`The analysis failed: ${job.error}`);
        } else {
          render(await api("/api/report"));
        }
      }
    } catch (e) {
      clearInterval(polling);
      polling = null;
      $("#runBtn").disabled = false;
      $("#progress").hidden = true;
    }
  }

  async function run() {
    const symbols = $("#symbols").value.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const horizon = Number($("#horizon").value);
    const budget = Number($("#budget").value) || 0;
    store.set("symbols", symbols.join(" "));
    store.set("horizon", horizon);
    store.set("budget", budget);
    try {
      await api("/api/run", { symbols, horizon, budget });
    } catch (e) {
      if (e.status !== 409) { alert(e.message); return; }
    }
    showProgress({ running: true, log: ["Starting…"] });
    if (!polling) polling = setInterval(poll, 1000);
  }

  $("#runBtn").addEventListener("click", run);

  $("#saveEmail").addEventListener("click", async () => {
    try {
      await api("/api/settings", { contactEmail: $("#email").value.trim() });
      $("#emailMsg").textContent = "Saved.";
    } catch (e) {
      $("#emailMsg").textContent = e.message;
    }
  });

  // ---------------------------------------------------------------- boot

  (async function boot() {
    if (location.protocol === "file:") {
      $("#empty").hidden = false;
      $("#empty").replaceChildren(el("h2", { text: "Start the app first" }),
        el("p", {}, "Market Lens needs its small local server to fetch data. In a terminal, from the repository folder, run ", el("code", { text: "node market/server.mjs" }), " and it opens here by itself."));
      $("#runBtn").disabled = true;
      return;
    }
    try {
      const wl = await api("/api/watchlist");
      $("#symbols").value = store.get("symbols", wl.symbols.map((s) => s.symbol).join(" "));
      $("#horizon").value = String(store.get("horizon", wl.horizonDays || 63));
      $("#budget").value = store.get("budget", wl.budget || 10000);
    } catch { /* keep the defaults */ }
    try { $("#email").value = (await api("/api/settings")).contactEmail || ""; } catch { /* fine */ }

    try {
      const job = await api("/api/status");
      if (job.running) { showProgress(job); polling = setInterval(poll, 1000); }
    } catch { /* fine */ }
    try {
      render(await api("/api/report"));
    } catch {
      $("#empty").hidden = false;
    }
  })();
})();
