/* ==========================================================
   StrokeRounds — app.js
   UI: census, patient detail, tools, settings.
   Everything renders from Store; every edit writes straight back.
   ========================================================== */

(() => {
  "use strict";

  /* ---------------- DOM helpers ---------------- */

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  async function copyText(text, label = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch {
      // Clipboard API is blocked on insecure origins and in some webviews.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast(label); }
      catch { toast("Select and copy manually"); }
      ta.remove();
    }
  }

  function printText(text, title) {
    const w = window.open("", "_blank");
    if (!w) { toast("Allow pop-ups to print"); return; }
    w.document.write(
      `<!doctype html><title>${esc(title)}</title>` +
      `<style>body{font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;padding:24px;max-width:800px}</style>` +
      esc(text)
    );
    w.document.close();
    w.focus();
    w.print();
  }

  /* ---------------- App state ---------------- */

  const state = {
    view: "census",
    patientId: null,
    tab: "round",
    search: "",
    sort: "room",
    filters: new Set(["active"]),
    noteBlanks: false,
    scale: null,       // active calculator state
  };

  /* ---------------- Boot ---------------- */

  function init() {
    Store.load();
    applyTheme(Store.getSettings().theme);
    wireChrome();

    if (Store.getSettings().pin) showLock();
    else unlock();

    // The single-file build has no sw.js beside it to register.
    if ("serviceWorker" in navigator && !window.STROKEROUNDS_SINGLE_FILE) {
      window.addEventListener("load", () =>
        navigator.serviceWorker.register("sw.js").catch(() => {})
      );
    }
  }

  /** An explicit choice wins; otherwise follow whatever the device is set to. */
  function resolveTheme(pref) {
    if (pref === "light" || pref === "dark") return pref;
    const stamped = document.documentElement.dataset.theme;
    if (stamped === "light" || stamped === "dark") return stamped;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light" : "dark";
  }

  function applyTheme(pref) {
    const theme = resolveTheme(pref);
    document.documentElement.dataset.theme = theme;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f4f6fb" : "#0b1220";
    return theme;
  }

  /* ---------------- Lock screen ---------------- */

  function showLock() {
    $("#lockScreen").hidden = false;
    $("#app").hidden = true;
    setTimeout(() => $("#lockInput").focus(), 120);
  }

  function unlock() {
    $("#lockScreen").hidden = true;
    $("#app").hidden = false;
    $("#lockNowBtn").hidden = !Store.getSettings().pin;
    render();
  }

  function tryUnlock() {
    const val = $("#lockInput").value;
    if (Store.hash(val) === Store.getSettings().pin) {
      $("#lockInput").value = "";
      $("#lockError").hidden = true;
      unlock();
    } else {
      $("#lockError").hidden = false;
      $("#lockInput").value = "";
    }
  }

  /* ---------------- Chrome (header, nav, modal) ---------------- */

  function wireChrome() {
    $("#lockBtn").addEventListener("click", tryUnlock);
    $("#lockInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    $("#lockNowBtn").addEventListener("click", showLock);

    $("#themeBtn").addEventListener("click", () => {
      const next = resolveTheme(Store.getSettings().theme) === "light" ? "dark" : "light";
      Store.saveSettings({ theme: next });
      applyTheme(next);
    });

    $("#backBtn").addEventListener("click", () => go("census"));

    $("#bottomNav").addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-btn");
      if (btn) go(btn.dataset.view);
    });

    $("#fab").addEventListener("click", () => openPatientForm(null));

    $("#searchInput").addEventListener("input", (e) => {
      state.search = e.target.value.toLowerCase();
      renderCensus();
    });
    $("#sortSelect").addEventListener("change", (e) => {
      state.sort = e.target.value;
      renderCensus();
    });
    $("#filterChips").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const f = chip.dataset.filter;
      if (state.filters.has(f)) state.filters.delete(f);
      else {
        // Active and signed-off are mutually exclusive views of the list.
        if (f === "active") state.filters.delete("discharged");
        if (f === "discharged") state.filters.delete("active");
        state.filters.add(f);
      }
      $$("#filterChips .chip").forEach((c) =>
        c.classList.toggle("is-on", state.filters.has(c.dataset.filter))
      );
      renderCensus();
    });

    $("#censusEmpty").addEventListener("click", (e) => {
      const act = e.target.closest("[data-action]");
      if (!act) return;
      if (act.dataset.action === "new-patient") openPatientForm(null);
      if (act.dataset.action === "load-demo") { Store.addDemo(); render(); toast("Demo patient added"); }
    });

    $("#patientTabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      state.tab = tab.dataset.tab;
      $$("#patientTabs .tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      renderPatientBody();
    });

    bindPatientBody();

    $("#modalClose").addEventListener("click", closeModal);
    $("#modal .modal-backdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#modal").hidden) closeModal();
    });

    // Lock again when the app goes to the background on a shared device.
    document.addEventListener("visibilitychange", () => {
      const s = Store.getSettings();
      if (document.hidden && s.pin && s.lockOnHide) showLock();
    });
  }

  function go(view, patientId = null) {
    state.view = view;
    if (patientId) state.patientId = patientId;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------------- Modal ---------------- */

  function openModal(title, bodyHTML, footHTML = "") {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHTML;
    $("#modalFoot").innerHTML = footHTML;
    $("#modal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("#modal").hidden = true;
    $("#modalBody").innerHTML = "";
    $("#modalFoot").innerHTML = "";
    document.body.style.overflow = "";
    state.scale = null;
  }

  function confirmAction(message, onYes, yesLabel = "Delete") {
    openModal("Are you sure?", `<p>${esc(message)}</p>`,
      `<button class="btn" id="cnlBtn">Cancel</button>
       <button class="btn btn-danger" id="yesBtn">${esc(yesLabel)}</button>`);
    $("#cnlBtn").onclick = closeModal;
    $("#yesBtn").onclick = () => { closeModal(); onYes(); };
  }

  /* ---------------- Router / render ---------------- */

  function render() {
    ["census", "patient", "tools", "settings"].forEach((v) => {
      $(`#view-${v}`).hidden = v !== state.view;
    });
    $("#backBtn").hidden = state.view !== "patient";
    $("#fab").hidden = state.view !== "census";
    $$("#bottomNav .nav-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.view === state.view)
    );

    if (state.view === "census")   renderCensus();
    if (state.view === "patient")  renderPatient();
    if (state.view === "tools")    renderTools();
    if (state.view === "settings") renderSettings();
  }

  /* ---------------- Census ---------------- */

  function visiblePatients() {
    const f = state.filters;
    let list = Store.all().slice();

    if (f.has("discharged")) list = list.filter((p) => p.status === "discharged");
    else if (f.has("active")) list = list.filter((p) => p.status === "active");

    if (f.has("notrounded")) list = list.filter((p) => !Store.roundedToday(p));
    if (f.has("flag"))       list = list.filter((p) => p.flag);
    if (f.has("tasks"))      list = list.filter((p) => Store.openTasks(p) > 0);

    if (state.search) {
      const q = state.search;
      list = list.filter((p) =>
        [p.name, p.room, p.mrn, p.type, p.location, p.vascularity, p.etiology, p.notes]
          .join(" ").toLowerCase().includes(q)
      );
    }

    const num = (v) => (v === "" || v == null ? -1 : Number(v));
    const sorters = {
      room:    (a, b) => String(a.room).localeCompare(String(b.room), undefined, { numeric: true }),
      name:    (a, b) => String(a.name).localeCompare(String(b.name)),
      day:     (a, b) => (Store.hospitalDay(b) || 0) - (Store.hospitalDay(a) || 0),
      nihss:   (a, b) => num(b.nihssCurrent) - num(a.nihssCurrent),
      updated: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    };
    return list.sort(sorters[state.sort] || sorters.room);
  }

  function renderCensus() {
    const s = Store.getSettings();
    $("#appTitle").textContent = s.listName || "Census";
    const active = Store.all().filter((p) => p.status === "active");
    $("#appSub").textContent =
      `${active.length} active · ${active.filter(Store.roundedToday).length} rounded today`;

    const list = visiblePatients();
    const wrap = $("#censusList");
    const empty = $("#censusEmpty");

    // Stats strip
    const openTasks = active.reduce((n, p) => n + Store.openTasks(p), 0);
    const pendingWU = active.reduce((n, p) =>
      n + Store.WORKUP_ITEMS.filter((i) => ["ordered", "pending"].includes((p.workup[i.key] || {}).status)).length, 0);
    $("#censusStats").innerHTML = Store.all().length ? `
      <div class="stat"><b>${active.length}</b><span>On service</span></div>
      <div class="stat"><b>${active.length - active.filter(Store.roundedToday).length}</b><span>To round</span></div>
      <div class="stat"><b>${openTasks}</b><span>Open tasks</span></div>
      <div class="stat"><b>${pendingWU}</b><span>Pending w/u</span></div>` : "";

    if (!Store.all().length) {
      wrap.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    if (!list.length) {
      wrap.innerHTML = `<div class="empty"><p class="muted">No patients match this filter.</p></div>`;
      return;
    }

    wrap.innerHTML = list.map(patientCard).join("");
    wrap.onclick = (e) => {
      const card = e.target.closest(".pcard");
      if (!card) return;
      if (e.target.closest("[data-flag]")) {
        const p = Store.get(card.dataset.id);
        Store.update(p.id, { flag: !p.flag });
        renderCensus();
        return;
      }
      state.tab = "round";
      go("patient", card.dataset.id);
    };
  }

  function patientCard(p) {
    const day = Store.hospitalDay(p);
    const rounded = Store.roundedToday(p);
    const tasks = Store.openTasks(p);
    const pending = Store.WORKUP_ITEMS
      .filter((i) => ["ordered", "pending"].includes((p.workup[i.key] || {}).status)).length;

    const tags = [];
    if (p.type)         tags.push(`<span class="tag tag-accent">${esc(p.type)}</span>`);
    if (p.vascularity)  tags.push(`<span class="tag">${esc(p.vascularity)}</span>`);
    if (p.etiology)     tags.push(`<span class="tag tag-violet">${esc(p.etiology)}</span>`);
    if (p.nihssCurrent !== "") tags.push(`<span class="tag tag-warn">NIHSS ${esc(p.nihssCurrent)}</span>`);
    if (tasks)          tags.push(`<span class="tag tag-bad">${tasks} task${tasks > 1 ? "s" : ""}</span>`);
    if (pending)        tags.push(`<span class="tag tag-warn">${pending} pending</span>`);
    if (rounded)        tags.push(`<span class="tag tag-good">Rounded</span>`);

    const meta = [
      p.age ? `${esc(p.age)}${p.sex ? esc(p.sex[0].toUpperCase()) : ""}` : esc(p.sex),
      esc(p.location),
      p.mrn ? `MRN ${esc(p.mrn)}` : "",
    ].filter(Boolean).join(" · ");

    return `
      <article class="pcard ${rounded ? "is-rounded" : ""} ${p.flag ? "is-flagged" : ""} ${p.status === "discharged" ? "is-off" : ""}" data-id="${p.id}">
        <div class="pcard-main">
          <div class="pcard-top">
            ${p.room ? `<span class="pcard-room">${esc(p.room)}</span>` : ""}
            <span class="pcard-name">${esc(p.name || "Unnamed")}</span>
          </div>
          ${meta ? `<div class="pcard-meta">${meta}</div>` : ""}
          <div class="pcard-tags">${tags.join("")}</div>
        </div>
        <div class="pcard-side">
          <button class="icon-btn" data-flag="1" title="Flag patient">${p.flag ? "🚩" : "⚐"}</button>
          ${day ? `<span class="day-pill">HD ${day}</span>` : ""}
        </div>
      </article>`;
  }

  /* ---------------- Patient detail ---------------- */

  function currentPatient() { return Store.get(state.patientId); }

  function renderPatient() {
    const p = currentPatient();
    if (!p) { go("census"); return; }

    $("#appTitle").textContent = p.name || "Patient";
    const day = Store.hospitalDay(p);
    $("#appSub").textContent = [
      p.room ? `Room ${p.room}` : "",
      day ? `HD ${day}` : "",
      p.type,
    ].filter(Boolean).join(" · ");

    $("#patientHeader").innerHTML = `
      <div class="ph-top">
        <div>
          <div class="ph-name">${esc(p.name || "Unnamed")}</div>
          <div class="ph-sub">${[
            p.age ? esc(p.age) + (p.sex ? esc(p.sex[0].toUpperCase()) : "") : esc(p.sex),
            p.mrn ? "MRN " + esc(p.mrn) : "",
            p.admitDate ? "Adm " + esc(p.admitDate) : "",
            p.lkw ? "LKW " + esc(p.lkw) : "",
          ].filter(Boolean).join(" · ")}</div>
        </div>
        <div class="ph-actions">
          <button class="icon-btn" data-p="flag" title="Flag">${p.flag ? "🚩" : "⚐"}</button>
          <button class="icon-btn" data-p="edit" title="Edit details">✎</button>
          <button class="icon-btn" data-p="more" title="More">⋯</button>
        </div>
      </div>
      <div class="ph-tags">
        ${p.type ? `<span class="tag tag-accent">${esc(p.type)}</span>` : ""}
        ${p.location ? `<span class="tag">${esc(p.location)}</span>` : ""}
        ${p.vascularity ? `<span class="tag">${esc(p.vascularity)}</span>` : ""}
        ${p.etiology ? `<span class="tag tag-violet">${esc(p.etiology)}</span>` : ""}
        ${p.nihssAdmit !== "" || p.nihssCurrent !== "" ? `<span class="tag tag-warn">NIHSS ${esc(p.nihssAdmit || "–")} → ${esc(p.nihssCurrent || "–")}</span>` : ""}
        ${p.status === "discharged" ? `<span class="tag tag-good">Signed off</span>` : ""}
      </div>`;

    $("#patientHeader").onclick = (e) => {
      const b = e.target.closest("[data-p]");
      if (!b) return;
      if (b.dataset.p === "flag") { Store.update(p.id, { flag: !p.flag }); renderPatient(); }
      if (b.dataset.p === "edit") openPatientForm(p);
      if (b.dataset.p === "more") openPatientMenu(p);
    };

    $$("#patientTabs .tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === state.tab));
    renderPatientBody();
  }

  function openPatientMenu(p) {
    openModal("Patient actions", `
      <div class="btn-col">
        <button class="btn btn-block" data-m="brief">Copy sign-out blurb</button>
        <button class="btn btn-block" data-m="note">Copy full round note</button>
        <button class="btn btn-block" data-m="print">Print round note</button>
        <button class="btn btn-block" data-m="status">${p.status === "active" ? "Sign off / discharge" : "Return to active list"}</button>
        <button class="btn btn-block btn-danger" data-m="delete">Delete patient</button>
      </div>`);
    $("#modalBody").onclick = (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      const r = Store.todayRound(p, false);
      if (b.dataset.m === "brief") { copyText(NoteBuilder.buildBrief(p), "Sign-out copied"); closeModal(); }
      if (b.dataset.m === "note")  { copyText(NoteBuilder.buildNote(p, r), "Note copied"); closeModal(); }
      if (b.dataset.m === "print") { printText(NoteBuilder.buildNote(p, r), p.name || "Round note"); closeModal(); }
      if (b.dataset.m === "status") {
        const active = p.status === "active";
        Store.update(p.id, {
          status: active ? "discharged" : "active",
          dischargeDate: active ? Store.todayISO() : "",
        });
        closeModal();
        toast(active ? "Signed off" : "Back on the list");
        renderPatient();
      }
      if (b.dataset.m === "delete") {
        closeModal();
        confirmAction(`Delete ${p.name || "this patient"} and all their rounds? This cannot be undone.`, () => {
          Store.remove(p.id);
          go("census");
          toast("Patient deleted");
        });
      }
    };
  }

  function renderPatientBody() {
    const p = currentPatient();
    if (!p) return;
    const body = $("#patientBody");
    const views = { round: roundTab, workup: workupTab, profile: profileTab, history: historyTab, note: noteTab };
    body.innerHTML = (views[state.tab] || roundTab)(p);
  }

  /* ----- Round tab ----- */

  function roundTab(p) {
    const r = Store.todayRound(p);
    const ta = (field, label, ph = "") => `
      <div class="field">
        <label>${label}</label>
        <textarea data-round="${field}" placeholder="${esc(ph)}">${esc(r[field] || "")}</textarea>
      </div>`;

    const tasks = p.tasks.map((t) => `
      <div class="task ${t.done ? "is-done" : ""}">
        <input type="checkbox" data-task="${t.id}" ${t.done ? "checked" : ""} />
        <div class="task-text">${esc(t.text)}</div>
        <button class="icon-btn" data-taskdel="${t.id}" title="Remove">✕</button>
      </div>`).join("");

    return `
      <div class="card">
        <div class="card-head">
          <h3>Today · ${r.date}</h3>
          <button class="btn btn-sm" data-act="carry">Carry forward</button>
        </div>
        ${ta("vitals", "Vitals", "BP, HR, T, SpO2")}
        ${ta("labs", "Labs", "Acceptable / notable values")}
        ${ta("newInvestigation", "Any new investigation", "Results back since yesterday")}
        <div class="field">
          <label>NIHSS today</label>
          <div style="display:flex;gap:8px">
            <input type="number" min="0" max="42" data-round="nihss" value="${esc(r.nihss || "")}" placeholder="0–42" />
            <button class="btn btn-sm" data-act="nihss">Score it</button>
          </div>
        </div>
        ${ta("exam", "Exam", "Focal findings, interval change")}
        ${ta("assessment", "Assessment", "Day N, diagnosis, trajectory")}
        ${ta("plan", "Plan", "Today's actions")}
      </div>

      <div class="card">
        <div class="card-head"><h3>Tasks</h3>
          <span class="card-hint">${Store.openTasks(p)} open</span></div>
        ${tasks || `<p class="muted tiny">Nothing outstanding.</p>`}
        <div class="task-add">
          <input type="text" id="taskInput" placeholder="Add a to-do…" />
          <button class="btn btn-primary btn-sm" data-act="addtask">Add</button>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn" data-act="copy-note">Copy note</button>
        <button class="btn" data-act="copy-brief">Copy sign-out</button>
      </div>`;
  }

  /* ----- Work-up tab ----- */

  function workupTab(p) {
    const rows = Store.WORKUP_ITEMS.map((item) => {
      const w = p.workup[item.key] || { status: "", result: "" };
      const seg = ["ordered", "pending", "done", "na"].map((s) => `
        <button data-status="${s}" data-wu="${item.key}" class="${w.status === s ? "is-on" : ""}">
          ${s === "na" ? "N/A" : s === "ordered" ? "Ord" : s === "pending" ? "Pend" : "Done"}
        </button>`).join("");
      return `
        <div class="wu-row">
          <div class="wu-top">
            <div class="wu-label">${esc(item.label)}<span class="wu-sub">${esc(item.sub)}</span></div>
            <div class="seg">${seg}</div>
          </div>
          ${w.status || w.result
            ? `<input type="text" data-wuresult="${item.key}" value="${esc(w.result)}" placeholder="Result / comment" />`
            : ""}
        </div>`;
    }).join("");

    const assoc = Store.ASSOC_FIELDS.map((f) => `
      <div class="field">
        <label>${esc(f.label)}</label>
        <input type="text" data-assoc="${f.key}" value="${esc(p.assoc[f.key] || "")}" placeholder="—" />
      </div>`).join("");

    return `
      <div class="card">
        <div class="card-head"><h3>Work up</h3>
          <span class="card-hint">Tap a status, then add the result</span></div>
        ${rows}
      </div>
      <div class="card">
        <div class="card-head"><h3>Associated conditions</h3></div>
        ${assoc}
      </div>`;
  }

  /* ----- Profile tab ----- */

  function profileTab(p) {
    const chipSet = (values, selected, attr) => `
      <div class="chip-wrap">
        ${values.map((v) => `
          <button class="chip ${selected.includes(v) ? "is-on" : ""}" data-${attr}="${esc(v)}">${esc(v)}</button>`).join("")}
      </div>`;

    const field = (key, label, ph = "", type = "text") => `
      <div class="field">
        <label>${label}</label>
        <input type="${type}" data-field="${key}" value="${esc(p[key] || "")}" placeholder="${esc(ph)}" />
      </div>`;

    const area = (key, label, ph = "") => `
      <div class="field">
        <label>${label}</label>
        <textarea data-field="${key}" placeholder="${esc(ph)}">${esc(p[key] || "")}</textarea>
      </div>`;

    return `
      <div class="card">
        <div class="card-head"><h3>Presentation</h3></div>
        ${area("hx", "History", "How it started, who found them, course")}
        ${area("trauma", "Trauma", "Head trauma, falls, mechanism")}
        <div class="grid3">
          ${field("nihssAdmit", "NIHSS admit", "", "number")}
          ${field("nihssCurrent", "NIHSS now", "", "number")}
          ${field("mrsPre", "Pre mRS", "", "number")}
        </div>
        ${field("tpa", "Thrombolytic", "agent, dose, time")}
        ${field("evt", "Thrombectomy", "vessel, TICI, time")}
      </div>

      <div class="card">
        <div class="card-head"><h3>Location</h3></div>
        ${field("location", "Location", "e.g. L basal ganglia")}
        ${chipSet(Store.LOCATIONS, [p.location], "loc")}
      </div>

      <div class="card">
        <div class="card-head"><h3>Vascularity</h3></div>
        ${field("vascularity", "Territory", "e.g. MCA superior division")}
        ${chipSet(Store.VASC_TERRITORIES, [p.vascularity], "vasc")}
      </div>

      <div class="card">
        <div class="card-head"><h3>Risk factors</h3></div>
        ${chipSet(Store.RISK_FACTORS, p.riskFactors, "rf")}
      </div>

      <div class="card">
        <div class="card-head"><h3>Etiology</h3></div>
        ${chipSet(Store.ETIOLOGIES, [p.etiology], "etio")}
        ${area("etiologyNote", "Supporting detail", "What points to this mechanism")}
      </div>

      <div class="card">
        <div class="card-head"><h3>Prevention & prophylaxis</h3></div>
        ${area("prevention", "Stroke prevention", "Antithrombotic, statin, BP, glycemic plan")}
        ${field("dvt", "DVT prophylaxis", "SCDs, LMWH, timing")}
        <div class="grid3">
          ${field("pt", "PT")}
          ${field("ot", "OT")}
          ${field("slp", "SLP")}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Meds & notes</h3></div>
        ${area("meds", "Meds", "Active medications and changes")}
        ${area("notes", "Notes", "Anything that does not fit elsewhere")}
        ${field("dispo", "Dispo", "Home / rehab / SNF, barriers")}
      </div>`;
  }

  /* ----- History tab ----- */

  function historyTab(p) {
    const rounds = p.rounds.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (!rounds.length) return `<div class="card"><p class="muted">No rounds recorded yet.</p></div>`;
    return `
      <div class="card">
        <div class="card-head"><h3>Round history</h3>
          <span class="card-hint">${rounds.length} entr${rounds.length === 1 ? "y" : "ies"}</span></div>
        <div class="hist">
          ${rounds.map((r) => {
            const summary = [
              r.vitals && `Vitals: ${r.vitals}`,
              r.labs && `Labs: ${r.labs}`,
              r.newInvestigation && `New: ${r.newInvestigation}`,
              r.nihss && `NIHSS ${r.nihss}`,
              r.exam && `Exam: ${r.exam}`,
              r.assessment && `A: ${r.assessment}`,
              r.plan && `P: ${r.plan}`,
            ].filter(Boolean).join("\n");
            return `
              <div class="hist-item">
                <div class="hist-date">${esc(r.date)}${r.date === Store.todayISO() ? " · today" : ""}</div>
                <div class="hist-body">${esc(summary || "No content")}</div>
                <div class="btn-row" style="margin-top:6px">
                  <button class="btn btn-sm" data-roundcopy="${r.id}">Copy</button>
                  <button class="btn btn-sm btn-ghost" data-rounddel="${r.id}">Delete</button>
                </div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  /* ----- Note tab ----- */

  function noteTab(p) {
    const r = Store.todayRound(p);
    const note = NoteBuilder.buildNote(p, r, { includeEmpty: state.noteBlanks });
    return `
      <div class="card">
        <div class="card-head"><h3>Round note</h3>
          <button class="btn btn-sm" data-act="blanks">${state.noteBlanks ? "Hide blanks" : "Show blanks"}</button></div>
        <div class="note-out" id="noteOut">${esc(note)}</div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-primary" data-act="copy-note">Copy</button>
          <button class="btn" data-act="print-note">Print</button>
          <button class="btn" data-act="copy-brief">Sign-out</button>
        </div>
      </div>
      <p class="tiny faint">Paste into the chart and edit there — this app is a scratchpad, not the medical record.</p>`;
  }

  /* ----- Patient body event wiring -----
     Attached once at start-up. Re-rendering the body replaces its innerHTML,
     so binding per render would stack duplicate handlers and make every
     toggle fire twice. */

  const saveTimers = {};
  function debouncedSave(key, fn) {
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(fn, 250);
  }

  function bindPatientBody() {
    const body = $("#patientBody");

    body.addEventListener("input", (e) => {
      const p = currentPatient();
      if (!p) return;
      const t = e.target;
      const d = t.dataset;

      if (d.round) {
        const r = Store.todayRound(p);
        debouncedSave("round:" + d.round, () => Store.updateRound(p, r.id, { [d.round]: t.value }));
      } else if (d.field) {
        debouncedSave("field:" + d.field, () => Store.update(p.id, { [d.field]: t.value }));
      } else if (d.wuresult) {
        debouncedSave("wu:" + d.wuresult, () => {
          p.workup[d.wuresult].result = t.value;
          Store.update(p.id, {});
        });
      } else if (d.assoc) {
        debouncedSave("assoc:" + d.assoc, () => {
          p.assoc[d.assoc] = t.value;
          Store.update(p.id, {});
        });
      }
    });

    body.addEventListener("change", (e) => {
      const p = currentPatient();
      if (!p || !e.target.dataset.task) return;
      Store.toggleTask(p, e.target.dataset.task);
      renderPatientBody();
    });

    body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.target.id !== "taskInput") return;
      const p = currentPatient();
      if (!p) return;
      Store.addTask(p, e.target.value);
      renderPatientBody();
    });

    body.addEventListener("click", (e) => {
      const p = currentPatient();
      if (!p) return;
      const el = e.target.closest("[data-wu],[data-loc],[data-vasc],[data-rf],[data-etio],[data-act],[data-taskdel],[data-roundcopy],[data-rounddel]");
      if (!el) return;
      const d = el.dataset;

      if (d.wu) {                                   // work-up status segment
        const cur = p.workup[d.wu].status;
        p.workup[d.wu].status = cur === d.status ? "" : d.status;
        Store.update(p.id, {});
        renderPatientBody();
        return;
      }
      if (d.loc)  { Store.update(p.id, { location: p.location === d.loc ? "" : d.loc }); renderPatient(); return; }
      if (d.vasc) { Store.update(p.id, { vascularity: p.vascularity === d.vasc ? "" : d.vasc }); renderPatient(); return; }
      if (d.etio) { Store.update(p.id, { etiology: p.etiology === d.etio ? "" : d.etio }); renderPatient(); return; }
      if (d.rf) {
        const set = new Set(p.riskFactors);
        set.has(d.rf) ? set.delete(d.rf) : set.add(d.rf);
        Store.update(p.id, { riskFactors: [...set] });
        renderPatientBody();
        return;
      }
      if (d.taskdel)   { Store.removeTask(p, d.taskdel); renderPatientBody(); return; }
      if (d.roundcopy) {
        const r = p.rounds.find((x) => x.id === d.roundcopy);
        copyText(NoteBuilder.buildNote(p, r), "Note copied");
        return;
      }
      if (d.rounddel) {
        confirmAction("Delete this round entry?", () => {
          Store.deleteRound(p, d.rounddel);
          renderPatientBody();
        });
        return;
      }

      switch (d.act) {
        case "addtask": {
          const input = $("#taskInput", body);
          Store.addTask(p, input.value);
          renderPatientBody();
          break;
        }
        case "carry":     carryForward(p); break;
        case "nihss":     openScale("nihss", (total) => {
                            const r = Store.todayRound(p);
                            Store.updateRound(p, r.id, { nihss: String(total) });
                            Store.update(p.id, { nihssCurrent: String(total) });
                            renderPatient();
                            toast("NIHSS " + total + " saved");
                          }); break;
        case "copy-note": copyText(NoteBuilder.buildNote(p, Store.todayRound(p)), "Note copied"); break;
        case "copy-brief":copyText(NoteBuilder.buildBrief(p), "Sign-out copied"); break;
        case "print-note":printText(NoteBuilder.buildNote(p, Store.todayRound(p)), p.name || "Round note"); break;
        case "blanks":    state.noteBlanks = !state.noteBlanks; renderPatientBody(); break;
      }
    });
  }

  /** Pull yesterday's (or the most recent) round into today's blank fields. */
  function carryForward(p) {
    const today = Store.todayISO();
    const prev = p.rounds
      .filter((r) => r.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!prev) { toast("No earlier round to carry"); return; }
    const r = Store.todayRound(p);
    const patch = {};
    ["exam", "assessment", "plan", "nihss"].forEach((f) => {
      if (!r[f] && prev[f]) patch[f] = prev[f];
    });
    if (!Object.keys(patch).length) { toast("Nothing empty to fill"); return; }
    Store.updateRound(p, r.id, patch);
    renderPatientBody();
    toast(`Carried forward from ${prev.date}`);
  }

  /* ---------------- Patient form (new / edit) ---------------- */

  function openPatientForm(p) {
    const isNew = !p;
    const d = p || Store.blankPatient();
    openModal(isNew ? "New patient" : "Edit details", `
      <div class="field">
        <label>Name or initials</label>
        <input type="text" id="f-name" value="${esc(d.name)}" placeholder="J.R. or Room 12" autofocus />
      </div>
      <div class="grid2">
        <div class="field"><label>Room / bed</label><input type="text" id="f-room" value="${esc(d.room)}" /></div>
        <div class="field"><label>MRN</label><input type="text" id="f-mrn" value="${esc(d.mrn)}" /></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Age</label><input type="number" id="f-age" value="${esc(d.age)}" /></div>
        <div class="field"><label>Sex</label>
          <select id="f-sex">
            ${["", "F", "M", "Other"].map((s) => `<option ${d.sex === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="grid2">
        <div class="field"><label>Admit date</label><input type="date" id="f-admit" value="${esc(d.admitDate)}" /></div>
        <div class="field"><label>Last known well</label><input type="text" id="f-lkw" value="${esc(d.lkw)}" placeholder="date / time" /></div>
      </div>
      <div class="field">
        <label>Diagnosis</label>
        <select id="f-type">
          ${Store.STROKE_TYPES.map((t) => `<option ${d.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
        </select>
      </div>
      <p class="tiny faint">Tip: initials and a room number are usually enough. Less identifying data on a phone is safer.</p>`,
      `<button class="btn" id="pf-cancel">Cancel</button>
       <button class="btn btn-primary" id="pf-save">${isNew ? "Add to list" : "Save"}</button>`);

    $("#pf-cancel").onclick = closeModal;
    $("#pf-save").onclick = () => {
      const patch = {
        name: $("#f-name").value.trim(),
        room: $("#f-room").value.trim(),
        mrn: $("#f-mrn").value.trim(),
        age: $("#f-age").value.trim(),
        sex: $("#f-sex").value,
        admitDate: $("#f-admit").value,
        lkw: $("#f-lkw").value.trim(),
        type: $("#f-type").value,
      };
      if (!patch.name && !patch.room) { toast("Give a name or a room"); return; }
      if (isNew) {
        const created = Store.add(patch);
        closeModal();
        state.tab = "round";
        go("patient", created.id);
      } else {
        Store.update(p.id, patch);
        closeModal();
        renderPatient();
      }
    };
  }

  /* ---------------- Tools ---------------- */

  function renderTools() {
    $("#appTitle").textContent = "Tools";
    $("#appSub").textContent = "Scales, dosing, reference";

    const scaleBtns = Object.values(Scores.SCALES).map((s) => `
      <button class="btn tile" data-scale="${s.id}">
        <b>${esc(s.name)}</b><span class="tiny faint">${esc(s.sub)}</span>
      </button>`).join("");

    const refCards = Scores.REFERENCE.map((c) => `
      <div class="card">
        <div class="card-head"><h3>${esc(c.title)}</h3></div>
        ${c.rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b class="right">${esc(v)}</b></div>`).join("")}
      </div>`).join("");

    $("#toolsBody").innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Scales</h3></div>
        <div class="btn-col">${scaleBtns}</div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Thrombolytic dosing</h3></div>
        <div class="field">
          <label>Weight (kg)</label>
          <input type="number" id="lyticWeight" placeholder="e.g. 78" inputmode="decimal" />
        </div>
        <div id="lyticOut" class="muted tiny">Enter a weight to see alteplase and tenecteplase doses.</div>
      </div>

      <div class="card">
        <div class="card-head"><h3>ICH volume (ABC/2)</h3></div>
        <div class="grid3">
          <div class="field"><label>A (cm)</label><input type="number" id="ichA" inputmode="decimal" /></div>
          <div class="field"><label>B (cm)</label><input type="number" id="ichB" inputmode="decimal" /></div>
          <div class="field"><label>Slices</label><input type="number" id="ichC" inputmode="numeric" /></div>
        </div>
        <div class="field">
          <label>Slice thickness (cm)</label>
          <input type="number" id="ichT" value="0.5" inputmode="decimal" />
        </div>
        <div id="ichOut" class="muted tiny">Largest axial diameter × perpendicular × number of slices with hemorrhage.</div>
      </div>

      ${refCards}
      <p class="tiny faint">Reference values are the common defaults. Your institution's protocol wins.</p>`;

    $("#toolsBody").onclick = (e) => {
      const b = e.target.closest("[data-scale]");
      if (b) openScale(b.dataset.scale);
    };

    const lw = $("#lyticWeight");
    lw.addEventListener("input", () => {
      const w = Number(lw.value);
      if (!w) { $("#lyticOut").innerHTML = "Enter a weight to see alteplase and tenecteplase doses."; return; }
      const a = Scores.alteplase(w);
      const t = Scores.tenecteplase(w, 0.25);
      const t5 = Scores.tenecteplase(w, 0.4);
      $("#lyticOut").innerHTML = `
        <div class="kv"><span>Alteplase total</span><b>${a.total} mg${a.capped ? " (capped)" : ""}</b></div>
        <div class="kv"><span>— bolus (10%, 1 min)</span><b>${a.bolus} mg</b></div>
        <div class="kv"><span>— infusion (60 min)</span><b>${a.infusion} mg</b></div>
        <div class="kv"><span>Tenecteplase 0.25 mg/kg</span><b>${t.total} mg${t.capped ? " (capped)" : ""}</b></div>
        <div class="kv"><span>Tenecteplase 0.4 mg/kg</span><b>${t5.total} mg${t5.capped ? " (capped)" : ""}</b></div>
        <p class="tiny faint" style="margin-top:8px">${esc(a.note)} ${esc(t.note)} Confirm against your protocol and the package insert.</p>`;
    });

    const recalcICH = () => {
      const v = Scores.ichVolume($("#ichA").value, $("#ichB").value, $("#ichC").value, $("#ichT").value);
      $("#ichOut").innerHTML = v
        ? `<div class="kv"><span>Estimated volume</span><b>${v} mL</b></div>
           <p class="tiny faint">≥ 30 mL scores a point on the ICH score.</p>`
        : "Largest axial diameter × perpendicular × number of slices with hemorrhage.";
    };
    ["ichA", "ichB", "ichC", "ichT"].forEach((id) => $("#" + id).addEventListener("input", recalcICH));
  }

  /** Generic scale renderer — works for any entry in Scores.SCALES. */
  function openScale(id, onSave) {
    const scale = Scores.SCALES[id];
    if (!scale) return;
    state.scale = { id, values: scale.items.map(() => null) };

    const body = scale.items.map((item, i) => `
      <div class="score-item">
        <div class="score-q">${esc(item.label)}</div>
        <div class="opt-row">
          ${item.opts.map(([t, v], j) =>
            `<button class="opt" data-i="${i}" data-j="${j}" data-v="${v}">${esc(t)}</button>`).join("")}
        </div>
      </div>`).join("");

    openModal(scale.name, `
      <p class="tiny faint">${esc(scale.sub)}</p>
      ${body}
      <div class="score-total">
        <span class="muted tiny" id="scoreNote">Select every item</span>
        <b id="scoreTotal">0</b>
      </div>`,
      `<button class="btn" id="sc-close">Close</button>
       ${onSave ? `<button class="btn btn-primary" id="sc-save">Save to patient</button>` : ""}`);

    const totalEl = $("#scoreTotal");
    const noteEl = $("#scoreNote");

    const recompute = () => {
      const vals = state.scale.values;
      const answered = vals.filter((v) => v !== null).length;
      const total = vals.reduce((n, v) => n + (v || 0), 0);
      totalEl.textContent = total;
      noteEl.textContent = answered < scale.items.length
        ? `${answered}/${scale.items.length} items — ${scale.interpret(total)}`
        : scale.interpret(total);
      return total;
    };

    $("#modalBody").addEventListener("click", (e) => {
      const b = e.target.closest(".opt");
      if (!b) return;
      const i = Number(b.dataset.i);
      state.scale.values[i] = Number(b.dataset.v);
      $$(`.opt[data-i="${i}"]`, $("#modalBody")).forEach((o) => o.classList.remove("is-on"));
      b.classList.add("is-on");
      recompute();
    });

    $("#sc-close").onclick = closeModal;
    if (onSave) $("#sc-save").onclick = () => { const t = recompute(); closeModal(); onSave(t); };
    recompute();
  }

  /* ---------------- Settings ---------------- */

  function renderSettings() {
    const s = Store.getSettings();
    $("#appTitle").textContent = "Settings";
    $("#appSub").textContent = "Data lives on this device only";

    const bytes = (() => {
      try { return new Blob([localStorage.getItem("strokeRounds.v1") || ""]).size; }
      catch { return 0; }
    })();

    $("#settingsBody").innerHTML = `
      <div class="banner">
        <b>Local only.</b> Nothing is uploaded — no account, no server, no analytics.
        That also means an uninstall or a cleared browser wipes the list, so export a
        backup at the end of a service block. Follow your institution's policy before
        entering identifiable information.
      </div>

      <div class="card">
        <div class="card-head"><h3>List</h3></div>
        <div class="field">
          <label>List name</label>
          <input type="text" id="set-listname" value="${esc(s.listName)}" placeholder="Stroke service" />
        </div>
        <div class="btn-row">
          <button class="btn" id="btn-copylist">Copy whole list</button>
          <button class="btn" id="btn-printlist">Print handoff</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Backup</h3>
          <span class="card-hint">${(bytes / 1024).toFixed(1)} KB stored</span></div>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-export">Save backup file</button>
          <label class="btn" for="importFile">Open backup file</label>
          <input type="file" id="importFile" accept=".json,application/json" hidden />
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn btn-sm" id="btn-copybackup">Copy as text</button>
          <button class="btn btn-sm" id="btn-pastebackup">Paste a backup</button>
        </div>
        <p class="tiny faint" id="backupHint" style="margin-top:8px">
          ${s.lastBackup ? "Last backup: " + esc(s.lastBackup) : "No backup yet — importing merges by patient and keeps the newer copy."}
        </p>
      </div>

      <div class="card">
        <div class="card-head"><h3>Passcode</h3></div>
        <p class="tiny faint">A screen lock for a shared workstation. It is not encryption — anyone with device access and a debugger can read the stored file.</p>
        <div class="btn-row">
          <button class="btn" id="btn-pin">${s.pin ? "Change passcode" : "Set passcode"}</button>
          ${s.pin ? `<button class="btn btn-ghost" id="btn-pin-off">Remove</button>` : ""}
        </div>
        ${s.pin ? `
        <div class="field" style="margin-top:10px">
          <label style="text-transform:none">
            <input type="checkbox" id="set-lockhide" ${s.lockOnHide ? "checked" : ""} style="width:auto;margin-right:8px" />
            Lock when the app goes to the background
          </label>
        </div>` : ""}
      </div>

      <div class="card">
        <div class="card-head"><h3>Retention</h3></div>
        <div class="field">
          <label>Auto-delete signed-off patients after</label>
          <select id="set-purge">
            ${[[0, "Never"], [1, "1 day"], [3, "3 days"], [7, "7 days"], [30, "30 days"]]
              .map(([v, t]) => `<option value="${v}" ${Number(s.autoPurgeDays) === v ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="btn-row">
          <button class="btn btn-danger" id="btn-wipe">Delete everything</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>About</h3></div>
        <p class="tiny muted">StrokeRounds is an offline rounding list and structured note builder
        for a stroke attending. Add it to your home screen and it runs like a native app, with or
        without signal. It is a scratchpad — the chart is still the medical record, and the
        scales and dosing here assist a clinician who already knows them.</p>
        <button class="btn btn-sm" id="btn-demo">Add demo patient</button>
      </div>`;

    $("#set-listname").addEventListener("input", (e) => Store.saveSettings({ listName: e.target.value }));
    $("#set-purge").addEventListener("change", (e) => {
      Store.saveSettings({ autoPurgeDays: Number(e.target.value) });
      toast("Retention updated");
    });
    const lockHide = $("#set-lockhide");
    if (lockHide) lockHide.addEventListener("change", (e) => Store.saveSettings({ lockOnHide: e.target.checked }));

    $("#btn-copylist").onclick = () => {
      const active = Store.all().filter((p) => p.status === "active");
      copyText(NoteBuilder.buildList(active, Store.getSettings().listName), "List copied");
    };
    $("#btn-printlist").onclick = () => {
      const active = Store.all().filter((p) => p.status === "active");
      printText(NoteBuilder.buildList(active, Store.getSettings().listName), "Handoff");
    };

    $("#btn-export").onclick = exportBackup;
    $("#btn-copybackup").onclick = () => showBackupText();
    $("#btn-pastebackup").onclick = pasteBackup;
    $("#importFile").onchange = importBackup;

    $("#btn-pin").onclick = setPin;
    const pinOff = $("#btn-pin-off");
    if (pinOff) pinOff.onclick = () => {
      Store.saveSettings({ pin: "" });
      $("#lockNowBtn").hidden = true;
      renderSettings();
      toast("Passcode removed");
    };

    $("#btn-wipe").onclick = () =>
      confirmAction("Delete every patient, round and task on this device?", () => {
        Store.wipe();
        go("census");
        toast("All data deleted");
      }, "Delete everything");

    $("#btn-demo").onclick = () => { Store.addDemo(); go("census"); toast("Demo patient added"); };
  }

  function markBackedUp() {
    Store.saveSettings({ lastBackup: new Date().toLocaleString() });
    const hint = $("#backupHint");
    if (hint) hint.textContent = "Last backup: " + Store.getSettings().lastBackup;
  }

  /** Hosted viewers (claude.ai artifacts) sandbox downloads and ask the host
      to save the file instead; a plain page saves it itself. */
  async function hostDownloads() {
    if (!window.claude || typeof window.claude.use !== "function") return null;
    try { return await window.claude.use("downloads"); }
    catch { return null; }
  }

  async function exportBackup() {
    const data = Store.exportJSON();
    const filename = `strokerounds-${Store.todayISO()}.json`;

    const downloads = await hostDownloads();
    if (downloads) {
      try {
        await downloads.save({ filename, data });
        markBackedUp();
        toast("Backup saved");
      } catch (err) {
        if (err && err.code === "declined") return;   // the viewer said no
        showBackupText(data);                          // last resort: copy it out
      }
      return;
    }

    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackedUp();
    toast("Backup downloaded");
  }

  /** Backup as text — works in any browser, pastes into notes or email. */
  function showBackupText(data = Store.exportJSON()) {
    openModal("Backup as text", `
      <p class="tiny faint">Copy this and keep it somewhere safe. Paste it back through
      Import to restore the list on any device.</p>
      <textarea id="backupText" readonly style="min-height:180px;font-family:var(--font-mono);font-size:11px">${esc(data)}</textarea>`,
      `<button class="btn" id="bk-close">Close</button>
       <button class="btn btn-primary" id="bk-copy">Copy</button>`);
    $("#bk-close").onclick = closeModal;
    $("#bk-copy").onclick = () => { copyText(data, "Backup copied"); markBackedUp(); };
  }

  /** Restore from pasted text, for viewers that cannot open a file picker. */
  function pasteBackup() {
    openModal("Paste a backup", `
      <div class="field">
        <label>Backup JSON</label>
        <textarea id="pasteText" placeholder="Paste the exported text here" style="min-height:160px;font-family:var(--font-mono);font-size:11px"></textarea>
      </div>`,
      `<button class="btn" id="ps-cancel">Cancel</button>
       <button class="btn btn-primary" id="ps-import">Import</button>`);
    $("#ps-cancel").onclick = closeModal;
    $("#ps-import").onclick = () => {
      try {
        const n = Store.importJSON($("#pasteText").value, true);
        closeModal();
        toast(`Imported ${n} patient${n === 1 ? "" : "s"}`);
        go("census");
      } catch (err) {
        toast("That is not a StrokeRounds backup");
      }
    };
  }

  function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const n = Store.importJSON(String(reader.result), true);
        toast(`Imported ${n} patient${n === 1 ? "" : "s"}`);
        go("census");
      } catch (err) {
        alert("Could not import this file.\n" + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function setPin() {
    openModal("Set passcode", `
      <div class="field">
        <label>New passcode</label>
        <input type="password" id="pin1" inputmode="numeric" autocomplete="off" />
      </div>
      <div class="field">
        <label>Confirm</label>
        <input type="password" id="pin2" inputmode="numeric" autocomplete="off" />
      </div>
      <p class="tiny faint">There is no recovery. Forgetting it means exporting is impossible without clearing the app's data.</p>`,
      `<button class="btn" id="pin-cancel">Cancel</button>
       <button class="btn btn-primary" id="pin-save">Save</button>`);
    $("#pin-cancel").onclick = closeModal;
    $("#pin-save").onclick = () => {
      const a = $("#pin1").value, b = $("#pin2").value;
      if (!a) { toast("Enter a passcode"); return; }
      if (a !== b) { toast("Passcodes do not match"); return; }
      Store.saveSettings({ pin: Store.hash(a) });
      $("#lockNowBtn").hidden = false;
      closeModal();
      renderSettings();
      toast("Passcode set");
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
