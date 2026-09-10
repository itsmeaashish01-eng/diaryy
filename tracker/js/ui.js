/* ================================================
   PRICE WATCH — ui.js
   Rendering and interaction. Plain DOM, event delegation, no framework.
   ================================================ */
(function (PT) {
  "use strict";
  const U = PT.util;
  const { $, $$, esc, fmtMoney, fmtPct, fmtDateTime, relTime, isoDay } = U;
  const store = PT.store;

  const state = {
    view: "watches",
    filter: "all",       // all | travel | markets | paused
    search: "",
    detailId: null,
    detailTab: "chart",
    editing: null,
    chartCleanup: null,
  };

  /* ---------------------------------------------------------------
     Small shared pieces
     --------------------------------------------------------------- */
  function verdictBadge(v) {
    if (!v || !v.verdict) return "";
    const d = v.verdict;
    // Icon + word, never colour alone.
    // Before there's a verdict, show the progress toward one rather than a
    // dead end — "why does it say this, and when will it stop" answered on
    // the badge itself.
    const tail = v.score != null
      ? `<span class="badge-score">${v.score}</span>`
      : v.needed
        ? `<span class="badge-score">${v.n}/${v.needed}</span>`
        : "";
    const tip = v.score != null
      ? `Signal score ${v.score} out of 100`
      : `Needs ${v.needed} price readings before it can judge — ${v.n} so far`;
    return `<span class="badge badge-${d.status}" title="${esc(tip)}">
      <span class="badge-icon" aria-hidden="true">${d.icon}</span>${esc(d.label)}
      ${tail}
    </span>`;
  }

  function changeChip(s) {
    if (s.changePct == null) return `<span class="chip chip-flat">first reading</span>`;
    if (Math.abs(s.changePct) < 0.05) return `<span class="chip chip-flat">unchanged</span>`;
    const down = s.changePct < 0;
    return `<span class="chip ${down ? "chip-down" : "chip-up"}">
      <span aria-hidden="true">${down ? "▼" : "▲"}</span> ${esc(fmtPct(Math.abs(s.changePct)))}
    </span>`;
  }

  function kindChip(kind) {
    const k = store.KINDS[kind] || store.KINDS.other;
    return `<span class="kind-chip"><span aria-hidden="true">${k.icon}</span> ${esc(k.label)}</span>`;
  }

  function tripSummary(w) {
    const t = w.trip || {};
    const bits = [];
    if (t.from || t.to) bits.push(`${esc(t.from || "?")} → ${esc(t.to || "?")}`);
    if (t.depart) {
      const left = U.daysUntil(t.depart);
      bits.push(
        `${esc(t.depart)}${left != null && left >= 0 ? ` · ${left}d away` : left != null ? " · past" : ""}`
      );
    }
    if (t.pax && Number(t.pax) > 1) bits.push(`${esc(t.pax)} travellers`);
    return bits.join(" · ");
  }

  /* ---------------------------------------------------------------
     Watch cards
     --------------------------------------------------------------- */
  function card(w) {
    const s = PT.analytics.summarize(w);
    const v = PT.analytics.verdict(w, s);
    const busy = PT.scheduler.isRunning(w.id);
    const trip = tripSummary(w);

    const sub = [PT.providers.describe(w), trip].filter(Boolean).join(" · ");

    let statLine;
    if (s.n === 0) {
      statLine = w.provider === "manual"
        ? `<span class="muted">No prices logged yet</span>`
        : `<span class="muted">Waiting for the first check</span>`;
    } else {
      const parts = [`low ${esc(fmtMoney(s.min, w.currency))}`];
      if (s.avg30 != null) parts.push(`avg ${esc(fmtMoney(s.avg30, w.currency))}`);
      parts.push(`${s.n} reading${s.n === 1 ? "" : "s"}`);
      statLine = parts.join(" · ");
    }

    const err = w.lastError
      ? `<p class="card-error" title="${esc(w.lastError.message)}">
           <span aria-hidden="true">⚠</span> Last check failed: ${esc(w.lastError.message)}
         </p>`
      : "";

    const pos = s.position && s.position.value != null
      ? `<p class="pos-line">
           ${esc(s.position.qty)} × ${esc(fmtMoney(s.position.cost, w.currency))} →
           <strong>${esc(fmtMoney(s.position.value, w.currency))}</strong>
           <span class="${s.position.plAbs >= 0 ? "d-up" : "d-down"}">
             ${s.position.plAbs >= 0 ? "+" : ""}${esc(fmtMoney(s.position.plAbs, w.currency))}
             (${esc(fmtPct(s.position.plPct, true))})
           </span>
         </p>`
      : "";

    return `<article class="watch-card ${w.active ? "" : "is-paused"} ${busy ? "is-busy" : ""}"
                     data-id="${esc(w.id)}">
      <header class="card-head">
        <div class="card-title-wrap">
          <h3 class="card-title">${esc(w.label || "Untitled watch")}</h3>
          <p class="card-sub">${esc(sub)}</p>
        </div>
        ${kindChip(w.kind)}
      </header>

      <div class="card-price-row">
        <div>
          <p class="card-price">${s.latest == null ? "—" : esc(fmtMoney(s.latest, w.currency))}</p>
          <p class="card-change">${changeChip(s)} ${w.active ? "" : `<span class="chip chip-flat">paused</span>`}</p>
        </div>
        ${verdictBadge(v)}
      </div>

      <div class="card-spark">${PT.chart.sparkline(w.history)}</div>
      ${pos}
      <p class="card-stats">${statLine}</p>
      ${err}

      <footer class="card-foot">
        <span class="card-next">
          ${busy ? "checking…"
            : w.provider === "manual" ? "manual entries"
            : w.provider === "command" ? "runs in the runner"
            : !w.active ? "paused"
            : !w.nextCheck ? "due now"
            : `next ${esc(relTime(w.nextCheck))}`}
        </span>
        <span class="card-actions">
          ${w.provider === "manual" || w.provider === "command"
            ? `<button class="icon-btn" data-act="log" data-id="${esc(w.id)}" title="Log a price by hand">＋</button>`
            : `<button class="icon-btn" data-act="check" data-id="${esc(w.id)}" title="Check now" ${busy ? "disabled" : ""}>⟳</button>`}
          <button class="icon-btn" data-act="detail" data-id="${esc(w.id)}" title="Open details">⤢</button>
          <button class="icon-btn" data-act="toggle" data-id="${esc(w.id)}" title="${w.active ? "Pause" : "Resume"}">${w.active ? "⏸" : "▶"}</button>
          <button class="icon-btn" data-act="edit" data-id="${esc(w.id)}" title="Edit">✎</button>
        </span>
      </footer>
    </article>`;
  }

  function visibleWatches() {
    const q = state.search.trim().toLowerCase();
    return store.all().filter((w) => {
      if (state.filter === "travel" && !(store.KINDS[w.kind] || {}).travel) return false;
      if (state.filter === "markets" && (store.KINDS[w.kind] || {}).travel) return false;
      if (state.filter === "paused" && w.active) return false;
      if (!q) return true;
      const hay = [w.label, w.kind, w.notes, PT.providers.describe(w), tripSummary(w)]
        .join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  /* ---------------------------------------------------------------
     Overview strip
     --------------------------------------------------------------- */
  function overview() {
    const ws = store.all();
    const active = ws.filter((w) => w.active).length;

    // Best current opportunity across every watch that has a verdict.
    let best = null;
    ws.forEach((w) => {
      const s = PT.analytics.summarize(w);
      const v = PT.analytics.verdict(w, s);
      if (v.score != null && (!best || v.score > best.v.score)) best = { w, s, v };
    });

    // Portfolio total, grouped by currency so we never add USD to INR.
    const byCur = {};
    ws.forEach((w) => {
      const s = PT.analytics.summarize(w);
      if (s.position && s.position.value != null) {
        const c = w.currency || "USD";
        byCur[c] = byCur[c] || { value: 0, pl: 0 };
        byCur[c].value += s.position.value;
        byCur[c].pl += s.position.plAbs || 0;
      }
    });
    const curKeys = Object.keys(byCur);

    const todayAlerts = store.alerts().filter((a) => Date.now() - a.t < U.DAY).length;

    return `<section class="overview">
      <div class="ov-tile">
        <p class="ov-label">Watching</p>
        <p class="ov-value">${ws.length}</p>
        <p class="ov-note">${active} active</p>
      </div>
      <div class="ov-tile">
        <p class="ov-label">Alerts today</p>
        <p class="ov-value">${todayAlerts}</p>
        <p class="ov-note">${store.unreadCount()} unread</p>
      </div>
      <div class="ov-tile ov-wide">
        <p class="ov-label">Best signal right now</p>
        ${best
          ? `<p class="ov-value ov-value-sm">${esc(best.w.label)}</p>
             <p class="ov-note">${esc(fmtMoney(best.s.latest, best.w.currency))} · ${verdictBadge(best.v)}</p>`
          : `<p class="ov-note">Nothing scored yet — add a watch and let it gather a few readings.</p>`}
      </div>
      ${curKeys.length
        ? `<div class="ov-tile ov-wide">
             <p class="ov-label">Holdings</p>
             ${curKeys.map((c) => `
               <p class="ov-value ov-value-sm">${esc(fmtMoney(byCur[c].value, c))}</p>
               <p class="ov-note ${byCur[c].pl >= 0 ? "d-up" : "d-down"}">
                 ${byCur[c].pl >= 0 ? "+" : ""}${esc(fmtMoney(byCur[c].pl, c))} overall
               </p>`).join("")}
           </div>`
        : ""}
    </section>`;
  }

  /* ---------------------------------------------------------------
     Views
     --------------------------------------------------------------- */
  function renderWatches() {
    const list = visibleWatches();
    const counts = {
      all: store.all().length,
      travel: store.all().filter((w) => (store.KINDS[w.kind] || {}).travel).length,
      markets: store.all().filter((w) => !(store.KINDS[w.kind] || {}).travel).length,
      paused: store.all().filter((w) => !w.active).length,
    };
    const tab = (id, label) =>
      `<button class="filter-tab ${state.filter === id ? "is-on" : ""}" data-act="filter" data-filter="${id}">
         ${label} <span class="tab-count">${counts[id]}</span>
       </button>`;

    return `${overview()}
      <div class="toolbar">
        <div class="filter-tabs">
          ${tab("all", "Everything")}
          ${tab("travel", "Travel")}
          ${tab("markets", "Markets")}
          ${tab("paused", "Paused")}
        </div>
        <button class="btn btn-primary" data-act="new">＋ New watch</button>
      </div>
      ${list.length
        ? `<div class="watch-grid">${list.map(card).join("")}</div>`
        : `<div class="empty-state">
             <p class="empty-icon" aria-hidden="true">◎</p>
             <h2>${store.all().length ? "Nothing matches that filter." : "Nothing on watch yet."}</h2>
             <p>${store.all().length
                ? "Try another tab or clear the search."
                : "Add a fare, a room, or a ticker and Price Watch will keep an eye on it for you."}</p>
             <button class="btn btn-primary" data-act="new">＋ New watch</button>
           </div>`}`;
  }

  function renderAlerts() {
    const list = store.alerts();
    if (!list.length) {
      return `<div class="empty-state">
        <p class="empty-icon" aria-hidden="true">🔔</p>
        <h2>No alerts yet.</h2>
        <p>When a rule fires you'll see it here — and on your phone, if you've set up a channel in Settings.</p>
      </div>`;
    }
    return `<div class="toolbar">
        <h2 class="view-title">Alert history</h2>
        <span>
          <button class="btn" data-act="alerts-read">Mark all read</button>
          <button class="btn btn-danger-ghost" data-act="alerts-clear">Clear</button>
        </span>
      </div>
      <ul class="alert-list">
        ${list.map((a) => {
          const w = store.get(a.watchId);
          const k = store.KINDS[a.kind] || store.KINDS.other;
          return `<li class="alert-row ${a.read ? "" : "is-unread"}">
            <span class="alert-icon alert-${esc(a.severity)}" aria-hidden="true">${k.icon}</span>
            <div class="alert-body">
              <p class="alert-head">
                <strong>${esc(a.watchLabel || "Watch")}</strong>
                <span class="alert-rule">${esc(a.ruleLabel || a.ruleType)}</span>
              </p>
              <p class="alert-msg">${esc(a.message)}</p>
              <p class="alert-time">${esc(fmtDateTime(a.t))} · ${esc(relTime(a.t))}</p>
            </div>
            ${w ? `<button class="icon-btn" data-act="detail" data-id="${esc(w.id)}" title="Open watch">⤢</button>` : ""}
          </li>`;
        }).join("")}
      </ul>`;
  }

  function renderSettings() {
    const s = store.settings();
    const n = s.notify;
    return `<div class="settings">
      <h2 class="view-title">Settings</h2>

      <section class="panel">
        <h3>Notifications</h3>
        <p class="panel-note">
          A browser notification only arrives while this tab is open. For alerts that
          reach your phone with the tab closed, use ntfy or a webhook — those are sent
          from the browser too, but they land in an app that stays running.
        </p>

        <label class="check">
          <input type="checkbox" data-set="notify.browser" ${n.browser ? "checked" : ""} />
          <span>Desktop notifications</span>
        </label>
        <div class="row">
          <button class="btn" data-act="test-notify" data-channel="browser">Send test</button>
          <span class="test-result" data-result="browser"></span>
        </div>

        <hr class="rule" />

        <label class="check">
          <input type="checkbox" data-set="notify.ntfy.enabled" ${n.ntfy.enabled ? "checked" : ""} />
          <span>Push via ntfy <span class="muted">(free, no account — install the ntfy app and subscribe to your topic)</span></span>
        </label>
        <div class="field-row">
          <label class="field">
            <span>Server</span>
            <input type="text" data-set="notify.ntfy.server" value="${esc(n.ntfy.server)}" placeholder="https://ntfy.sh" />
          </label>
          <label class="field">
            <span>Topic <span class="muted">— pick something long and unguessable</span></span>
            <input type="text" data-set="notify.ntfy.topic" value="${esc(n.ntfy.topic)}" placeholder="pricewatch-8f2ka93hd" />
          </label>
        </div>
        <div class="row">
          <button class="btn" data-act="test-notify" data-channel="ntfy">Send test</button>
          <button class="btn" data-act="suggest-topic">Suggest a topic</button>
          <span class="test-result" data-result="ntfy"></span>
        </div>

        <hr class="rule" />

        <label class="check">
          <input type="checkbox" data-set="notify.webhook.enabled" ${n.webhook.enabled ? "checked" : ""} />
          <span>Webhook (Discord, Slack, or your own)</span>
        </label>
        <div class="field-row">
          <label class="field field-wide">
            <span>URL</span>
            <input type="text" data-set="notify.webhook.url" value="${esc(n.webhook.url)}" placeholder="https://discord.com/api/webhooks/…" />
          </label>
          <label class="field">
            <span>Format</span>
            <select data-set="notify.webhook.style">
              ${["discord", "slack", "plain"].map((o) =>
                `<option value="${o}" ${n.webhook.style === o ? "selected" : ""}>${o}</option>`).join("")}
            </select>
          </label>
        </div>
        <label class="check">
          <input type="checkbox" data-set="notify.webhook.noCors" ${n.webhook.noCors ? "checked" : ""} />
          <span>Fire-and-forget <span class="muted">— tick this if the endpoint rejects browser requests; the alert still goes out, we just can't confirm it</span></span>
        </label>
        <div class="row">
          <button class="btn" data-act="test-notify" data-channel="webhook">Send test</button>
          <span class="test-result" data-result="webhook"></span>
        </div>

        <hr class="rule" />

        <label class="check">
          <input type="checkbox" data-set="quietHours.enabled" ${s.quietHours.enabled ? "checked" : ""} />
          <span>Quiet hours — record alerts but don't ping me</span>
        </label>
        <div class="field-row">
          <label class="field"><span>From (hour)</span>
            <input type="number" min="0" max="23" data-set="quietHours.from" value="${esc(s.quietHours.from)}" /></label>
          <label class="field"><span>Until (hour)</span>
            <input type="number" min="0" max="23" data-set="quietHours.to" value="${esc(s.quietHours.to)}" /></label>
        </div>
        <label class="check">
          <input type="checkbox" data-set="sound" ${s.sound ? "checked" : ""} />
          <span>Play a sound in the tab</span>
        </label>
      </section>

      <section class="panel">
        <h3>Price sources</h3>
        <div class="field-row">
          <label class="field field-wide">
            <span>Proxy address <span class="muted">— needed for sources that block browser requests</span></span>
            <input type="text" data-set="proxyBase" value="${esc(s.proxyBase)}" placeholder="http://localhost:8787" />
          </label>
          <label class="field">
            <span>Default currency</span>
            <input type="text" data-set="currency" value="${esc(s.currency)}" placeholder="USD" />
          </label>
        </div>
        <p class="panel-note">
          Run <code>node tracker/server/price-proxy.mjs</code> and paste its address above.
          It adds the headers browsers require, keeps API keys off the page, and can talk
          to Amadeus for real flight fares. Without it, only the sources marked
          “no proxy needed” will work.
        </p>
        <details class="src-list">
          <summary>What each source needs</summary>
          <ul>
            ${PT.providers.REGISTRY.map((p) => `<li>
              <strong>${esc(p.label)}</strong>
              <span class="src-tag ${p.needsProxy ? "src-proxy" : "src-direct"}">
                ${p.needsProxy ? "needs proxy" : "no proxy needed"}
              </span>
              <br /><span class="muted">${esc(p.note)}</span>
            </li>`).join("")}
          </ul>
        </details>
      </section>

      <section class="panel">
        <h3>Your data</h3>
        <p class="panel-note">
          Everything lives in this browser's local storage — no account, no server,
          nothing leaves the page except the price requests themselves. Export
          regularly if the history matters to you.
        </p>
        <div class="row">
          <button class="btn" data-act="export">Export JSON</button>
          <label class="btn">Import…
            <input type="file" id="importFile" accept=".json" hidden />
          </label>
          <button class="btn btn-danger-ghost" data-act="reset">Delete everything</button>
        </div>
      </section>
    </div>`;
  }

  /* ---------------------------------------------------------------
     Main render
     --------------------------------------------------------------- */
  function render() {
    const root = $("#view");
    if (!root) return;
    if (state.chartCleanup) { state.chartCleanup(); state.chartCleanup = null; }

    if (state.view === "alerts") root.innerHTML = renderAlerts();
    else if (state.view === "settings") root.innerHTML = renderSettings();
    else root.innerHTML = renderWatches();

    $$(".nav-tab").forEach((b) =>
      b.classList.toggle("is-on", b.dataset.view === state.view));

    const badge = $("#alertBadge");
    const unread = store.unreadCount();
    if (badge) {
      badge.textContent = unread;
      badge.hidden = unread === 0;
    }
    document.title = unread
      ? `(${unread}) Price Watch`
      : "Price Watch — track fares & prices";

    if (state.detailId) refreshDetail();
  }

  /* ---------------------------------------------------------------
     Modal plumbing
     --------------------------------------------------------------- */
  function openModal(title, body, footer, cls) {
    const host = $("#modalHost");
    host.innerHTML = `<div class="modal-backdrop" data-act="close-modal"></div>
      <div class="modal ${cls || ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="modal-head">
          <h2>${title}</h2>
          <button class="icon-btn" data-act="close-modal" aria-label="Close">✕</button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ""}
      </div>`;
    host.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    if (state.chartCleanup) { state.chartCleanup(); state.chartCleanup = null; }
    $("#modalHost").hidden = true;
    $("#modalHost").innerHTML = "";
    document.body.classList.remove("modal-open");
    state.detailId = null;
    state.editing = null;
  }

  /* ---------------------------------------------------------------
     Detail view
     --------------------------------------------------------------- */
  function detailBody(w) {
    const s = PT.analytics.summarize(w);
    const v = PT.analytics.verdict(w, s);
    const stat = (label, val, cls) =>
      `<div class="stat"><p class="stat-label">${label}</p><p class="stat-value ${cls || ""}">${val}</p></div>`;

    const tabs = ["chart", "table", "rules"].map((t) =>
      `<button class="sub-tab ${state.detailTab === t ? "is-on" : ""}" data-act="detail-tab" data-tab="${t}">
        ${t === "chart" ? "Chart" : t === "table" ? "Readings" : "Rules & source"}
      </button>`).join("");

    let panel = "";
    if (state.detailTab === "chart") {
      panel = `<div class="chart-host" id="chartHost"></div>`;
    } else if (state.detailTab === "table") {
      panel = PT.chart.table(w, 60);
    } else {
      const rules = (w.rules || []).length
        ? `<ul class="rule-list-ro">${w.rules.map((r) => {
            const def = PT.alerts.RULES[r.type];
            if (!def) return "";
            return `<li><strong>${esc(def.label)}</strong>${
              def.needsValue
                ? ` <span class="rule-val">${def.unit === "%" ? esc(r.value) + "%"
                    : def.unit === "days" ? esc(r.value) + " days"
                    : esc(fmtMoney(Number(r.value), w.currency))}</span>`
                : ""}
              <br /><span class="muted">${esc(def.help)}</span></li>`;
          }).join("")}</ul>`
        : `<p class="muted">No rules — this watch records prices but never pings you.</p>`;

      const p = PT.providers.byId(w.provider);
      panel = `${rules}
        <hr class="rule" />
        <h4>Price source</h4>
        <p><strong>${esc(p ? p.label : w.provider)}</strong> — ${esc(PT.providers.describe(w))}</p>
        <p class="muted">${esc(p ? p.note : "")}</p>
        ${w.lastError ? `<p class="card-error"><span aria-hidden="true">⚠</span> ${esc(w.lastError.message)}
          <span class="muted">(${esc(relTime(w.lastError.t))})</span></p>` : ""}
        <p class="muted">Checks every ${esc(w.intervalMin)} min · alerts at most once every ${esc(w.cooldownMin)} min</p>`;
    }

    return `<div class="detail">
      <div class="detail-top">
        <div>
          <p class="detail-price">${s.latest == null ? "—" : esc(fmtMoney(s.latest, w.currency))}</p>
          <p class="detail-sub">${changeChip(s)} ${esc(tripSummary(w))}</p>
        </div>
        ${verdictBadge(v)}
      </div>

      ${v.reasons && v.reasons.length
        ? `<div class="reasons">
             <p class="reasons-title">Why</p>
             <ul>
               ${v.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}
               ${v.score == null ? `<li>${esc(
                 w.provider === "manual"
                   ? "Press “Log price” each time you check, and the verdict appears on the third."
                   : w.provider === "command"
                     ? "The runner adds one each time it checks — start it with --loop and leave it going."
                     : !w.active
                       ? "This watch is paused, so no more readings are coming. Resume it."
                       : `Next reading ${relTime(w.nextCheck) === "never" ? "is due now" : relTime(w.nextCheck)}, then every ${w.intervalMin} minutes.`
               )}</li>` : ""}
             </ul>
           </div>`
        : ""}

      <div class="stat-grid">
        ${stat("Lowest seen", s.min == null ? "—" : esc(fmtMoney(s.min, w.currency)), "d-down")}
        ${stat("Highest seen", s.max == null ? "—" : esc(fmtMoney(s.max, w.currency)))}
        ${stat("30-day average", s.avg30 == null ? "—" : esc(fmtMoney(s.avg30, w.currency)))}
        ${stat("Vs that average", s.vsAvg30Pct == null ? "—" : esc(fmtPct(s.vsAvg30Pct, true)),
              s.vsAvg30Pct == null || Math.abs(s.vsAvg30Pct) < 0.05 ? ""
                : s.vsAvg30Pct < 0 ? "d-down" : "d-up")}
        ${stat("Readings", s.n)}
        ${stat("Tracked for", s.trackedDays ? esc(U.plural(Math.max(1, Math.round(s.trackedDays)), "day")) : "—")}
        ${s.position ? stat("Position value", esc(fmtMoney(s.position.value, w.currency))) : ""}
        ${s.position ? stat("Profit / loss",
            `${s.position.plAbs >= 0 ? "+" : ""}${esc(fmtMoney(s.position.plAbs, w.currency))}`,
            s.position.plAbs >= 0 ? "d-up" : "d-down") : ""}
        ${stat("Last checked", w.lastCheck ? esc(relTime(w.lastCheck)) : "never")}
        ${stat("Next check", w.provider === "command" ? "the runner"
          : w.provider === "manual" ? "manual"
          : !w.active ? "paused"
          : !w.nextCheck ? "due now"
          : esc(relTime(w.nextCheck)))}
      </div>

      <div class="sub-tabs">${tabs}</div>
      <div class="detail-panel">${panel}</div>
    </div>`;
  }

  function openDetail(id) {
    const w = store.get(id);
    if (!w) return;
    state.detailId = id;
    state.detailTab = state.detailTab || "chart";
    openModal(
      `${(store.KINDS[w.kind] || {}).icon || ""} ${esc(w.label)}`,
      detailBody(w),
      `<button class="btn" data-act="${w.provider === "manual" ? "log" : "check"}" data-id="${esc(id)}">
         ${w.provider === "manual" ? "Log price" : "Check now"}
       </button>
       <button class="btn" data-act="edit" data-id="${esc(id)}">Edit</button>
       <button class="btn btn-danger-ghost" data-act="delete" data-id="${esc(id)}">Delete</button>
       <button class="btn btn-primary" data-act="close-modal">Done</button>`,
      "modal-lg"
    );
    mountChart();
  }

  function refreshDetail() {
    const w = store.get(state.detailId);
    if (!w) return;
    const body = $("#modalHost .modal-body");
    if (!body) return;
    if (state.chartCleanup) { state.chartCleanup(); state.chartCleanup = null; }
    body.innerHTML = detailBody(w);
    mountChart();
  }

  /* The chart is drawn at true pixel size, so a width change (rotating a
     phone, dragging a window) needs a redraw rather than a CSS stretch. */
  function mountChart() {
    if (state.chartCleanup) { state.chartCleanup(); state.chartCleanup = null; }
    const host = $("#chartHost");
    if (!host) return;
    const w = store.get(state.detailId);
    if (!w) return;

    const cleanupChart = PT.chart.detail(host, w, { height: 280 });
    const drawnAt = host.clientWidth;
    const onResize = U.debounce(() => {
      if (!document.body.contains(host)) return;
      if (Math.abs(host.clientWidth - drawnAt) < 12) return;
      mountChart();
    }, 200);
    window.addEventListener("resize", onResize);

    state.chartCleanup = () => {
      cleanupChart();
      window.removeEventListener("resize", onResize);
    };
  }

  /* ---------------------------------------------------------------
     Editor
     --------------------------------------------------------------- */
  function providerFields(w) {
    const p = PT.providers.byId(w.provider);
    if (!p || !p.fields.length) {
      return p ? `<p class="panel-note">${esc(p.note)}</p>` : "";
    }
    return `<p class="panel-note">${esc(p.note)}</p>
      <div class="field-row">
        ${p.fields.map((f) => `<label class="field ${f.key === "url" ? "field-wide" : ""}">
          <span>${esc(f.label)}${f.required ? " *" : ""}</span>
          <input type="${f.type === "number" ? "number" : "text"}" step="any"
                 name="cfg.${esc(f.key)}"
                 value="${esc(w.config[f.key] == null ? "" : w.config[f.key])}"
                 placeholder="${esc(f.placeholder || "")}" />
        </label>`).join("")}
      </div>`;
  }

  function ruleRows(w) {
    if (!w.rules.length) return `<p class="muted">No rules yet — add one so this watch can ping you.</p>`;
    return w.rules.map((r, i) => {
      const def = PT.alerts.RULES[r.type] || {};
      return `<div class="rule-row" data-index="${i}">
        <select name="rule.type.${i}" data-act="rule-type" data-index="${i}">
          ${Object.entries(PT.alerts.RULES).map(([k, d]) =>
            `<option value="${k}" ${r.type === k ? "selected" : ""}>${esc(d.label)}</option>`).join("")}
        </select>
        ${def.needsValue
          ? `<input type="number" step="any" name="rule.value.${i}" value="${esc(r.value == null ? "" : r.value)}"
                    placeholder="${def.unit === "%" ? "8" : def.unit === "days" ? "14" : "250"}" />
             <span class="rule-unit">${esc(def.unit === "amount" ? (w.currency || "") : def.unit || "")}</span>`
          : `<span class="rule-unit rule-unit-wide">${esc(def.help || "")}</span>`}
        <button type="button" class="icon-btn" data-act="rule-remove" data-index="${i}" title="Remove rule">✕</button>
      </div>`;
    }).join("");
  }

  function editorBody(w) {
    const isTravel = (store.KINDS[w.kind] || {}).travel;
    const isMarket = ["stock", "crypto", "fx"].includes(w.kind);
    const sources = PT.providers.forKind(w.kind);

    return `<form id="watchForm" class="editor">
      <div class="field-row">
        <label class="field field-wide">
          <span>What are you watching? *</span>
          <input type="text" name="label" value="${esc(w.label)}" required
                 placeholder="${isTravel ? "e.g. MTR Hung Hom → Guangzhou, 12 Oct" : "e.g. Apple shares"}" />
        </label>
        <label class="field">
          <span>Type</span>
          <select name="kind" data-act="kind-change">
            ${Object.entries(store.KINDS).map(([k, d]) =>
              `<option value="${k}" ${w.kind === k ? "selected" : ""}>${d.icon} ${d.label}</option>`).join("")}
          </select>
        </label>
      </div>

      <fieldset class="panel">
        <legend>Where the price comes from</legend>
        <div class="field-row">
          <label class="field field-wide">
            <span>Source</span>
            <select name="provider" data-act="provider-change">
              ${sources.map((p) =>
                `<option value="${p.id}" ${w.provider === p.id ? "selected" : ""}>
                  ${esc(p.label)}${p.needsProxy ? " (needs proxy)" : ""}
                </option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Currency</span>
            <input type="text" name="currency" value="${esc(w.currency)}" placeholder="USD" />
          </label>
        </div>
        ${providerFields(w)}
        <div class="row">
          <button type="button" class="btn" data-act="test-source">Test this source</button>
          <span class="test-result" data-result="source"></span>
        </div>
      </fieldset>

      ${isTravel ? `<fieldset class="panel">
        <legend>Trip</legend>
        <div class="field-row">
          <label class="field"><span>From</span>
            <input type="text" name="trip.from" value="${esc(w.trip.from || "")}" placeholder="Hung Hom" /></label>
          <label class="field"><span>To</span>
            <input type="text" name="trip.to" value="${esc(w.trip.to || "")}" placeholder="Guangzhou East" /></label>
        </div>
        <div class="field-row">
          <label class="field"><span>${w.kind === "hotel" ? "Check-in" : "Departure"}</span>
            <input type="date" name="trip.depart" value="${esc(w.trip.depart || "")}" /></label>
          <label class="field"><span>${w.kind === "hotel" ? "Check-out" : "Return (optional)"}</span>
            <input type="date" name="trip.ret" value="${esc(w.trip.ret || "")}" /></label>
          <label class="field"><span>${w.kind === "hotel" ? "Guests" : "Travellers"}</span>
            <input type="number" min="1" name="trip.pax" value="${esc(w.trip.pax || 1)}" /></label>
        </div>
        <p class="panel-note">
          The date does real work: as it approaches, the buy signal weights “act now”
          more heavily, because fares almost always climb into the final three weeks.
        </p>
      </fieldset>` : ""}

      ${isMarket ? `<fieldset class="panel">
        <legend>Your position <span class="muted">(optional)</span></legend>
        <div class="field-row">
          <label class="field"><span>Quantity held</span>
            <input type="number" step="any" name="pos.qty" value="${esc(w.position ? w.position.qty : "")}" placeholder="10" /></label>
          <label class="field"><span>Average cost each</span>
            <input type="number" step="any" name="pos.cost" value="${esc(w.position ? w.position.cost : "")}" placeholder="150" /></label>
        </div>
        <p class="panel-note">Fill these in and the card shows what it's worth now and whether you're up or down.</p>
      </fieldset>` : ""}

      <fieldset class="panel">
        <legend>Alert me when…</legend>
        <div id="ruleRows">${ruleRows(w)}</div>
        <button type="button" class="btn" data-act="rule-add">＋ Add a rule</button>
      </fieldset>

      <fieldset class="panel">
        <legend>Checking</legend>
        <div class="field-row">
          <label class="field">
            <span>Goal</span>
            <select name="direction">
              <option value="down" ${w.direction === "down" ? "selected" : ""}>I want it cheaper</option>
              <option value="up" ${w.direction === "up" ? "selected" : ""}>I want it higher</option>
            </select>
          </label>
          <label class="field">
            <span>Check every</span>
            <select name="intervalMin">
              ${[[15, "15 minutes"], [30, "30 minutes"], [60, "hour"], [180, "3 hours"],
                 [360, "6 hours"], [720, "12 hours"], [1440, "day"]].map(([v, l]) =>
                `<option value="${v}" ${Number(w.intervalMin) === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>At most one alert every</span>
            <select name="cooldownMin">
              ${[[0, "always alert"], [60, "hour"], [180, "3 hours"], [360, "6 hours"],
                 [720, "12 hours"], [1440, "day"]].map(([v, l]) =>
                `<option value="${v}" ${Number(w.cooldownMin) === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </label>
        </div>
        <label class="field field-wide">
          <span>Notes (optional)</span>
          <input type="text" name="notes" value="${esc(w.notes || "")}" placeholder="Aisle seat, refundable only…" />
        </label>
      </fieldset>
    </form>`;
  }

  function openEditor(id) {
    const existing = id ? store.get(id) : null;
    if (id && !existing) return;
    state.editing = existing
      ? JSON.parse(JSON.stringify(existing))
      : Object.assign(store.blankWatch(), {
          kind: "flight",
          provider: "demo",
          currency: store.settings().currency,
          intervalMin: store.settings().defaultIntervalMin,
          config: { basePrice: 200 },
          trip: { depart: isoDay(30), pax: 1 },
          rules: PT.alerts.defaultRulesFor("flight"),
        });

    openModal(
      id ? "Edit watch" : "New watch",
      editorBody(state.editing),
      `<button class="btn" data-act="close-modal">Cancel</button>
       <button class="btn btn-primary" data-act="save">${id ? "Save changes" : "Start watching"}</button>`,
      "modal-lg"
    );
  }

  /* Pull the form back into state.editing without losing anything the user
     has typed — called before any re-render of the editor. */
  function harvestForm() {
    const form = $("#watchForm");
    const w = state.editing;
    if (!form || !w) return w;

    const val = (name) => {
      const el = form.querySelector(`[name="${CSS.escape(name)}"]`);
      return el ? el.value : undefined;
    };

    if (val("label") !== undefined) w.label = val("label");
    if (val("kind") !== undefined) w.kind = val("kind");
    if (val("provider") !== undefined) w.provider = val("provider");
    if (val("currency") !== undefined) w.currency = (val("currency") || "USD").toUpperCase();
    if (val("direction") !== undefined) w.direction = val("direction");
    if (val("intervalMin") !== undefined) w.intervalMin = Number(val("intervalMin"));
    if (val("cooldownMin") !== undefined) w.cooldownMin = Number(val("cooldownMin"));
    if (val("notes") !== undefined) w.notes = val("notes");

    // provider config
    const p = PT.providers.byId(w.provider);
    if (p) {
      p.fields.forEach((f) => {
        const v = val("cfg." + f.key);
        if (v !== undefined) w.config[f.key] = v;
      });
    }

    // trip
    ["from", "to", "depart", "ret", "pax"].forEach((k) => {
      const v = val("trip." + k);
      if (v !== undefined) w.trip[k] = v;
    });

    // position
    const qty = U.parseNum(val("pos.qty"));
    const cost = U.parseNum(val("pos.cost"));
    w.position = qty ? { qty, cost: cost || 0 } : null;

    // rules
    w.rules = w.rules.map((r, i) => {
      const t = val(`rule.type.${i}`);
      const v = val(`rule.value.${i}`);
      return {
        id: r.id || U.uid(),
        type: t || r.type,
        value: v === undefined || v === "" ? r.value : Number(v),
      };
    });
    return w;
  }

  function rerenderEditor() {
    const body = $("#modalHost .modal-body");
    if (body) body.innerHTML = editorBody(state.editing);
  }

  function saveEditor() {
    const w = harvestForm();
    if (!w.label || !w.label.trim()) {
      flash("Give the watch a name first.", "warn");
      const el = $('[name="label"]');
      if (el) el.focus();
      return;
    }
    // Required provider fields
    const p = PT.providers.byId(w.provider);
    const missing = (p ? p.fields : []).filter(
      (f) => f.required && !String(w.config[f.key] || "").trim()
    );
    if (missing.length) {
      flash(`“${missing[0].label}” is needed for this source.`, "warn");
      return;
    }
    w.rules = w.rules.filter((r) => {
      const def = PT.alerts.RULES[r.type];
      return def && (!def.needsValue || Number.isFinite(Number(r.value)));
    });

    if (store.get(w.id)) {
      store.updateWatch(w.id, Object.assign({}, w, { nextCheck: Date.now() + 2000 }));
      flash("Saved.", "ok");
    } else {
      store.addWatch(Object.assign({}, w, { nextCheck: Date.now() + 1500 }));
      flash("Watching. First check is on its way.", "ok");
    }
    closeModal();
    render();
  }

  /* ---------------------------------------------------------------
     Toast
     --------------------------------------------------------------- */
  let flashTimer = null;
  function flash(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = `toast toast-${kind || "ok"} is-on`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove("is-on"), 3200);
  }

  PT.ui = {
    state, render, openDetail, openEditor, closeModal, openModal,
    flash, harvestForm, rerenderEditor, saveEditor, refreshDetail, card,
  };
})(window.PT);
