/* ================================================
   PRICE WATCH — app.js
   Bootstrap: wire the events, seed a first run, start the poller.
   ================================================ */
(function (PT) {
  "use strict";
  const U = PT.util;
  const { $, $$, esc, uid, isoDay } = U;
  const store = PT.store;
  const ui = PT.ui;

  /* ---------------------------------------------------------------
     Theme
     --------------------------------------------------------------- */
  /* "auto" means whatever the surrounding page or the OS is set to; an
     explicit choice by the user always wins over both. */
  function resolveTheme(theme) {
    if (theme === "dark" || theme === "light") return theme;
    const stamped = document.documentElement.dataset.theme;
    if (stamped === "dark" || stamped === "light") return stamped;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }

  function applyTheme(theme) {
    const resolved = resolveTheme(theme);
    document.body.classList.toggle("dark", resolved === "dark");
    const icon = $("#darkIcon");
    if (icon) icon.textContent = resolved === "dark" ? "☀" : "☾";
  }

  function toggleTheme() {
    const next = resolveTheme(store.settings().theme) === "dark" ? "light" : "dark";
    store.setSettings({ theme: next });
    applyTheme(next);
  }

  /* Follow the system while the user hasn't overridden it. */
  function watchSystemTheme() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (store.settings().theme === "auto") applyTheme("auto");
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------------------------------------------------------
     First run — three simulated watches plus one live feed, so the app
     has something to show before you've set anything up.
     --------------------------------------------------------------- */
  function seed() {
    const data = store.raw();
    if (data.seeded || data.watches.length) return;

    store.addWatch({
      label: "MTR Intercity — Hung Hom → Guangzhou East",
      kind: "train", provider: "demo", currency: "HKD", direction: "down",
      config: { basePrice: 210, volatility: 0.05 },
      trip: { from: "Hung Hom", to: "Guangzhou East", depart: isoDay(24), pax: 1 },
      intervalMin: 60, cooldownMin: 180,
      rules: [
        { id: uid(), type: "below" },
        { id: uid(), type: "allTimeLow" },
        { id: uid(), type: "deadline", value: 10 },
      ],
      createdAt: Date.now() - 12 * U.DAY,
      notes: "Demo watch — swap the source for a real feed when you have one.",
    });

    store.addWatch({
      label: "Flight — Delhi → Singapore",
      kind: "flight", provider: "demo", currency: "USD", direction: "down",
      config: { basePrice: 340, volatility: 0.08 },
      trip: { from: "DEL", to: "SIN", depart: isoDay(52), pax: 1 },
      intervalMin: 180, cooldownMin: 360,
      rules: [{ id: uid(), type: "below" }, { id: uid(), type: "dropPct", value: 8 }],
      createdAt: Date.now() - 20 * U.DAY,
      notes: "Demo watch.",
    });

    store.addWatch({
      label: "Hotel — Shinjuku, 3 nights",
      kind: "hotel", provider: "demo", currency: "USD", direction: "down",
      config: { basePrice: 155, volatility: 0.07 },
      trip: { from: "", to: "Tokyo", depart: isoDay(38), ret: isoDay(41), pax: 2 },
      intervalMin: 360, cooldownMin: 720,
      rules: [{ id: uid(), type: "dropPct", value: 10 }],
      createdAt: Date.now() - 9 * U.DAY,
      notes: "Demo watch.",
    });

    store.addWatch({
      label: "Bitcoin",
      kind: "crypto", provider: "coingecko", currency: "USD", direction: "up",
      config: { coinId: "bitcoin", vs: "usd" },
      intervalMin: 60, cooldownMin: 360,
      rules: [{ id: uid(), type: "risePct", value: 5 }, { id: uid(), type: "dropPct", value: 5 }],
      notes: "Live feed — no API key needed.",
    });

    store.raw().seeded = true;
    store.save(true);
  }

  /* Give the demo watches a plausible back-history so the charts and the
     signal have something to work with on day one. Sampled from the very
     same function the live provider uses, so the series stays continuous
     once real checks start landing. */
  function backfillDemo() {
    store.all().forEach((w) => {
      if (w.provider !== "demo" || (w.history || []).length) return;
      const span = Math.min(Date.now() - w.createdAt, 30 * U.DAY);
      if (span < U.HOUR) return;
      const points = 150;
      const stepMs = Math.max(U.MIN * 15, Math.floor(span / points));
      const hist = [];
      for (let t = Date.now() - span; t <= Date.now(); t += stepMs) {
        hist.push({ t, p: PT.providers.demoPriceAt(w, t, false), meta: { simulated: true } });
      }
      if (hist.length < 2) return;

      // A target of "cheaper than 4 readings in 5" is what someone would
      // actually pick after looking at this chart, and it puts the dashed
      // target line somewhere useful.
      const rules = w.rules.map((r) => {
        if (r.type !== "below" || Number.isFinite(Number(r.value))) return r;
        const sorted = hist.map((h) => h.p).sort((a, b) => a - b);
        const p20 = sorted[Math.floor(sorted.length * 0.2)];
        return Object.assign({}, r, { value: Math.round(p20 / 5) * 5 });
      });

      store.updateWatch(w.id, {
        history: hist, rules, lastCheck: hist[hist.length - 1].t,
      });
    });
    store.save(true);
  }

  /* ---------------------------------------------------------------
     Manual price entry
     --------------------------------------------------------------- */
  function openLogPrice(id) {
    const w = store.get(id);
    if (!w) return;
    ui.openModal(
      `Log a price — ${esc(w.label)}`,
      `<form id="logForm" class="editor">
        <label class="field field-wide">
          <span>Price in ${esc(w.currency)}</span>
          <input type="number" step="any" name="price" autofocus placeholder="0.00" />
        </label>
        <p class="panel-note">
          This runs your alert rules exactly as an automatic check would.
        </p>
      </form>`,
      `<button class="btn" data-act="close-modal">Cancel</button>
       <button class="btn btn-primary" data-act="log-save" data-id="${esc(id)}">Save price</button>`
    );
    setTimeout(() => { const el = $('[name="price"]'); if (el) el.focus(); }, 60);
  }

  async function saveLoggedPrice(id) {
    const el = $('#logForm [name="price"]');
    const price = U.parseNum(el && el.value);
    if (!price || price <= 0) { ui.flash("Enter a price above zero.", "warn"); return; }
    ui.closeModal();
    const r = await PT.scheduler.checkOne({ id }, { manualPrice: price });
    if (r && r.ok) {
      ui.flash(r.alerts.length ? `Logged — ${r.alerts.length} alert fired.` : "Logged.", "ok");
    } else {
      ui.flash(r ? r.error : "Could not log that price.", "warn");
    }
    ui.render();
  }

  /* ---------------------------------------------------------------
     Source test button in the editor
     --------------------------------------------------------------- */
  async function testSource() {
    const w = ui.harvestForm();
    const out = $('[data-result="source"]');
    if (!out) return;
    if (w.provider === "manual") {
      out.textContent = "Manual watches have nothing to test.";
      out.className = "test-result";
      return;
    }
    out.textContent = "Checking…";
    out.className = "test-result";
    const s = store.settings();
    try {
      const r = await PT.providers.check(w, {
        proxyBase: (s.proxyBase || "").trim(),
        currency: s.currency,
      });
      out.textContent = `✓ ${U.fmtMoney(r.price, r.currency || w.currency)}`;
      out.className = "test-result is-ok";
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      const corsish = /Failed to fetch|NetworkError|Load failed/i.test(msg);
      out.textContent = "✕ " + msg + (corsish && !s.proxyBase
        ? " — this usually means the site blocks browser requests. Set a proxy in Settings."
        : "");
      out.className = "test-result is-bad";
    }
  }

  async function testNotify(channel, btn) {
    const out = $(`[data-result="${channel}"]`);
    if (out) { out.textContent = "Sending…"; out.className = "test-result"; }
    try {
      const msg = await PT.notify.test(channel, store.settings());
      if (out) { out.textContent = "✓ " + msg; out.className = "test-result is-ok"; }
    } catch (e) {
      if (out) {
        out.textContent = "✕ " + (e && e.message ? e.message : e);
        out.className = "test-result is-bad";
      }
    }
  }

  /* ---------------------------------------------------------------
     Settings binding — inputs carry data-set="a.b.c"
     --------------------------------------------------------------- */
  function applySetting(path, value) {
    const s = store.settings();
    const parts = path.split(".");
    let cur = s;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    store.setSettings({});
  }

  /* ---------------------------------------------------------------
     Events
     --------------------------------------------------------------- */
  function wire() {
    // --- clicks
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      const navTab = e.target.closest(".nav-tab");

      if (navTab) {
        ui.state.view = navTab.dataset.view;
        if (ui.state.view === "alerts") store.markAlertsRead();
        ui.render();
        return;
      }
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;

      switch (act) {
        case "new": ui.openEditor(null); break;
        case "edit": ui.openEditor(id); break;
        case "detail": ui.openDetail(id); break;
        case "close-modal": ui.closeModal(); break;
        case "save": ui.saveEditor(); break;

        case "filter":
          ui.state.filter = btn.dataset.filter;
          ui.render();
          break;

        case "detail-tab":
          ui.state.detailTab = btn.dataset.tab;
          ui.refreshDetail();
          break;

        case "toggle": {
          const w = store.get(id);
          if (!w) break;
          store.updateWatch(id, {
            active: !w.active,
            nextCheck: !w.active ? Date.now() + 1000 : null,
          });
          ui.flash(w.active ? "Paused." : "Resumed.", "ok");
          ui.render();
          break;
        }

        case "check": {
          ui.render();
          const r = await PT.scheduler.checkOne({ id });
          if (r && r.ok) {
            ui.flash(
              r.alerts.length ? `${r.alerts.length} alert fired.` : "Checked — no rule triggered.",
              "ok"
            );
          } else if (r) {
            ui.flash("Check failed: " + r.error, "warn");
          }
          ui.render();
          break;
        }

        case "log": openLogPrice(id); break;
        case "log-save": await saveLoggedPrice(id); break;

        case "delete": {
          const w = store.get(id);
          if (!w) break;
          if (confirm(`Delete “${w.label}” and its ${w.history.length} recorded prices?`)) {
            store.removeWatch(id);
            ui.closeModal();
            ui.flash("Deleted.", "ok");
            ui.render();
          }
          break;
        }

        case "rule-add": {
          ui.harvestForm();
          ui.state.editing.rules.push({ id: uid(), type: "below", value: "" });
          ui.rerenderEditor();
          break;
        }
        case "rule-remove": {
          ui.harvestForm();
          ui.state.editing.rules.splice(Number(btn.dataset.index), 1);
          ui.rerenderEditor();
          break;
        }

        case "test-source": await testSource(); break;
        case "test-notify": await testNotify(btn.dataset.channel, btn); break;

        case "suggest-topic": {
          const topic = "pricewatch-" + Math.random().toString(36).slice(2, 12);
          applySetting("notify.ntfy.topic", topic);
          applySetting("notify.ntfy.enabled", true);
          ui.render();
          ui.flash(`Topic set to ${topic} — subscribe to it in the ntfy app.`, "ok");
          break;
        }

        case "alerts-read": store.markAlertsRead(); ui.render(); break;
        case "alerts-clear":
          if (confirm("Clear the alert history?")) { store.clearAlerts(); ui.render(); }
          break;

        case "check-all": {
          ui.flash("Checking everything…", "ok");
          await PT.scheduler.checkAll();
          ui.flash("All checks done.", "ok");
          ui.render();
          break;
        }

        case "theme": toggleTheme(); break;

        case "export": {
          const r = await U.downloadJSON(
            `price-watch-${new Date().toISOString().slice(0, 10)}.json`,
            store.exportAll()
          );
          if (r === "saved") ui.flash("Exported.", "ok");
          else if (r === "declined") ui.flash("Export cancelled.", "ok");
          else ui.flash("This viewer can't save files. Open the app from the repository to export.", "warn");
          break;
        }

        case "reset":
          if (confirm("Delete every watch, all price history and all alerts? This cannot be undone.")) {
            localStorage.removeItem(store.KEY);
            location.reload();
          }
          break;
      }
    });

    // --- changes (selects, checkboxes, settings inputs, file import)
    document.addEventListener("change", (e) => {
      const el = e.target;

      if (el.id === "importFile" && el.files && el.files[0]) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const obj = JSON.parse(reader.result);
            const merge = confirm(
              "OK to merge with what's already here.\nCancel to replace everything."
            );
            store.importAll(obj, merge ? "merge" : "replace");
            applyTheme(store.settings().theme);
            ui.flash("Imported.", "ok");
            ui.render();
          } catch (err) {
            ui.flash("That file isn't valid Price Watch JSON.", "warn");
          }
        };
        reader.readAsText(el.files[0]);
        el.value = "";
        return;
      }

      const act = el.dataset.act;
      if (act === "kind-change") {
        ui.harvestForm();
        const w = ui.state.editing;
        w.kind = el.value;
        // Keep the source valid for the new type.
        const allowed = PT.providers.forKind(w.kind).map((p) => p.id);
        if (!allowed.includes(w.provider)) w.provider = allowed[0];
        w.direction = ["stock", "crypto"].includes(w.kind) ? "up" : "down";
        if (!w.rules.length) w.rules = PT.alerts.defaultRulesFor(w.kind);
        ui.rerenderEditor();
        return;
      }
      if (act === "provider-change") {
        ui.harvestForm();
        ui.state.editing.provider = el.value;
        ui.rerenderEditor();
        return;
      }
      if (act === "rule-type") {
        ui.harvestForm();
        const i = Number(el.dataset.index);
        ui.state.editing.rules[i].type = el.value;
        ui.rerenderEditor();
        return;
      }

      if (el.dataset.set) {
        const v = el.type === "checkbox" ? el.checked
          : el.type === "number" ? Number(el.value)
          : el.value;
        applySetting(el.dataset.set, v);
        if (el.dataset.set === "notify.browser" && v) PT.notify.requestBrowserPermission();
      }
    });

    // --- settings text inputs need input-level saving too
    document.addEventListener("input", U.debounce((e) => {
      const el = e.target;
      if (el.dataset && el.dataset.set && el.type !== "checkbox") {
        const v = el.type === "number" ? Number(el.value) : el.value;
        applySetting(el.dataset.set, v);
      }
    }, 400));

    // --- search
    const search = $("#searchInput");
    if (search) {
      search.addEventListener("input", U.debounce(() => {
        ui.state.search = search.value;
        if (ui.state.view !== "watches") ui.state.view = "watches";
        ui.render();
      }, 200));
    }

    // --- keyboard
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#modalHost").hidden) ui.closeModal();
      if (e.key === "/" && document.activeElement !== search && !document.body.classList.contains("modal-open")) {
        e.preventDefault();
        if (search) search.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && $("#watchForm")) {
        e.preventDefault();
        ui.saveEditor();
      }
    });
  }

  /* ---------------------------------------------------------------
     Go
     --------------------------------------------------------------- */
  function init() {
    store.load();
    seed();
    backfillDemo();
    applyTheme(store.settings().theme);
    watchSystemTheme();
    wire();
    ui.render();

    PT.scheduler.start({
      onUpdate: U.debounce(() => ui.render(), 250),
      onActivity: () => {},
    });

    // Keep relative times ("next in 4m") honest without a full re-render storm.
    setInterval(() => {
      if (document.hidden) return;
      if (PT.ui.state.view === "watches" && !document.body.classList.contains("modal-open")) {
        ui.render();
      }
    }, 30000);

    if (store.settings().notify.browser) PT.notify.requestBrowserPermission();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.PT);
