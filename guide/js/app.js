/* ================================================
   ROAMGUIDE — app.js
   Bootstrap: theme, first run, the editors, and every click.
   ================================================ */
(function (RG) {
  "use strict";
  const U = RG.util;
  const { $, $$, esc, fromMinutes, fmtDayLabel } = U;
  const store = RG.store;
  const cat = RG.catalog;
  const plan = RG.plan;
  const ui = RG.ui;

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

  function watchSystemTheme() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (store.settings().theme === "auto") applyTheme("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------------------------------------------------------
     Trips
     --------------------------------------------------------------- */
  function openTripEditor(id) {
    const t = id ? store.trip(id) : null;
    const draft = t || Object.assign(store.blankTrip(), { days: [] });
    const city = draft.cityId ? cat.cityById(draft.cityId) : null;
    const dayCount = t ? t.days.length : 3;

    ui.openModal(t ? "Edit trip" : "Start a trip", `
      <form id="tripForm" class="editor">
        <label class="field field-wide">
          <span>Call it</span>
          <input name="name" value="${esc(draft.name)}" placeholder="${esc(city ? city.name : "Somewhere new")}" />
        </label>
        <label class="field">
          <span>City</span>
          <select name="cityId">
            <option value="">— pick one —</option>
            ${cat.cities.map((c) =>
              `<option value="${esc(c.id)}" ${draft.cityId === c.id ? "selected" : ""}>${esc(c.name)}, ${esc(c.country)}</option>`
            ).join("")}
          </select>
        </label>
        <label class="field">
          <span>First day</span>
          <input type="date" name="startDate" value="${esc(draft.startDate || U.isoDay(0))}" />
        </label>
        ${t ? "" : `<label class="field">
          <span>How many days</span>
          <input type="number" name="dayCount" min="1" max="30" value="${dayCount}" />
        </label>`}
        <label class="field">
          <span>Daily budget <span class="muted">(optional)</span></span>
          <input type="number" step="any" name="budget" value="${draft.budget && draft.budget.daily != null ? esc(draft.budget.daily) : ""}"
            placeholder="${esc(city ? city.dayBudget : "")}" />
        </label>
        <p class="panel-note field-wide">
          Moving the first day moves the whole trip — the days stay in order behind it.
        </p>
      </form>
    `, `
      ${t ? `<button class="btn btn-danger" data-act="trip-delete" data-id="${esc(t.id)}">Delete trip</button>` : ""}
      <button class="btn" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="trip-save" data-id="${esc(t ? t.id : "")}">${t ? "Save" : "Start planning"}</button>
    `);
  }

  function saveTripEditor(id) {
    const f = $("#tripForm");
    if (!f) return;
    const name = f.name.value.trim();
    const cityId = f.cityId.value || null;
    const startDate = f.startDate.value || U.isoDay(0);
    const budgetVal = U.parseNum(f.budget.value);
    const city = cityId ? cat.cityById(cityId) : null;

    const budget = {
      daily: budgetVal,
      currency: city ? city.currency : (store.trip(id) && store.trip(id).budget.currency) || "USD",
    };

    if (id) {
      store.updateTrip(id, { name: name || (city ? city.name : "Untitled trip"), cityId, startDate, budget });
      ui.flash("Trip updated.", "ok");
    } else {
      const count = U.clamp(Number(f.dayCount.value) || 1, 1, 30);
      const trip = store.addTrip({
        name: name || (city ? city.name : "Untitled trip"),
        cityId, startDate, budget,
        days: Array.from({ length: count }, (_, i) => store.blankDay(U.addDays(startDate, i))),
      });
      ui.state.dayIndex = 0;
      // A new trip is the thing you want to look at.
      ui.state.view = "trip";
      if (cityId) ui.state.city = cityId;
      ui.flash(`${U.plural(trip.days.length, "day")} in ${trip.name}. Now fill them.`, "ok");
    }
    ui.closeModal();
    ui.render();
  }

  /* ---------------------------------------------------------------
     Adding a place to a day
     --------------------------------------------------------------- */
  function addToDay(placeId) {
    const trip = store.activeTrip();
    const p = store.place(placeId);
    if (!p) return;

    if (!trip) {
      ui.flash("Start a trip first — then places have somewhere to go.", "warn");
      openTripEditor(null);
      return;
    }

    // One day: no point asking which.
    if (trip.days.length === 1) {
      commitAdd(trip, 0, placeId);
      return;
    }

    ui.openModal(`Add ${esc(p.name)}`, `
      <p class="muted">Which day?</p>
      <div class="day-pick">
        ${trip.days.map((d, i) => {
          const clash = d.stops.some((s) => s.placeId === placeId);
          return `<button class="btn day-pick-btn${clash ? " is-disabled" : ""}"
            data-act="add-confirm" data-id="${esc(placeId)}" data-index="${i}" ${clash ? "disabled" : ""}>
            <strong>Day ${i + 1}</strong>
            <span>${esc(d.date ? fmtDayLabel(d.date) : "—")}</span>
            <span class="muted">${clash ? "already on this day" : U.plural(d.stops.length, "stop")}</span>
          </button>`;
        }).join("")}
      </div>
    `, `<button class="btn" data-act="close-modal">Cancel</button>`);
  }

  function commitAdd(trip, dayIndex, placeId) {
    const stop = store.addStop(trip.id, dayIndex, placeId);
    const p = store.place(placeId);
    ui.closeModal();
    if (!stop) {
      ui.flash(`${p ? p.name : "That place"} is already on day ${dayIndex + 1}.`, "warn");
      return;
    }
    ui.state.dayIndex = dayIndex;
    ui.flash(`Added to day ${dayIndex + 1}.`, "ok");
    ui.render();
  }

  /* ---------------------------------------------------------------
     Stops
     --------------------------------------------------------------- */
  function openStopEditor(dayIndex, stopId) {
    const trip = store.activeTrip();
    const day = trip && trip.days[dayIndex];
    const stop = day && day.stops.find((s) => s.id === stopId);
    if (!stop) return;
    const p = store.place(stop.placeId);

    ui.openModal(`${esc(p ? p.name : "Stop")}`, `
      <form id="stopForm" class="editor">
        <label class="field">
          <span>Pin a start time <span class="muted">(a booking, a ticket)</span></span>
          <input type="time" name="at" value="${stop.at != null ? esc(minutesToInput(stop.at)) : ""}" />
        </label>
        <label class="field field-wide">
          <span>Note to self</span>
          <input name="note" value="${esc(stop.note)}" placeholder="Book ahead, bring cash, ask for the roof terrace…" />
        </label>
        <p class="panel-note field-wide">
          A pinned time holds its slot when you tidy the order, and everything else
          is planned around it.
        </p>
      </form>
    `, `
      <button class="btn" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="stop-save" data-day="${dayIndex}" data-stop="${esc(stopId)}">Save</button>
    `);
  }

  const minutesToInput = (m) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  function saveStopEditor(dayIndex, stopId) {
    const trip = store.activeTrip();
    const f = $("#stopForm");
    if (!trip || !f) return;
    const at = U.toMinutes(f.at.value);
    store.updateStop(trip.id, dayIndex, stopId, { at: at == null ? null : at, note: f.note.value.trim() });
    ui.closeModal();
    ui.render();
  }

  function openDayStart(dayIndex) {
    const trip = store.activeTrip();
    const day = trip && trip.days[dayIndex];
    if (!day) return;
    const cur = day.startMin == null ? store.planOpts().dayStart : day.startMin;

    ui.openModal("When does this day start?", `
      <form id="dayForm" class="editor">
        <label class="field">
          <span>Out of the door at</span>
          <input type="time" name="start" value="${esc(minutesToInput(cur))}" />
        </label>
        <label class="field field-wide">
          <span>Note for the day</span>
          <input name="note" value="${esc(day.note)}" placeholder="Arrival day — take it easy" />
        </label>
        <p class="panel-note field-wide">
          Leave it as your usual start (${esc(fromMinutes(store.planOpts().dayStart))}, from Settings)
          or set one just for today.
        </p>
      </form>
    `, `
      <button class="btn btn-ghost" data-act="day-start-clear" data-index="${dayIndex}">Use my usual</button>
      <button class="btn" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="day-start-save" data-index="${dayIndex}">Save</button>
    `);
  }

  /* ---------------------------------------------------------------
     Suggest a day
     --------------------------------------------------------------- */
  function suggestDay(dayIndex) {
    const trip = store.activeTrip();
    const day = trip && trip.days[dayIndex];
    if (!day) return;

    const cityId = trip.cityId || ui.state.city;
    const city = cityId ? cat.cityById(cityId) : null;
    if (!city) {
      ui.flash("Give the trip a city first — that's where the suggestions come from.", "warn");
      openTripEditor(trip.id);
      return;
    }

    // Don't suggest what's already planned elsewhere in the trip, or seen.
    const already = new Set();
    trip.days.forEach((d) => d.stops.forEach((s) => already.add(s.placeId)));
    Object.keys(store.visitedAll()).forEach((id) => already.add(id));

    const pool = store.allPlaces().filter((p) => p.city === city.id);
    const picks = plan.suggestDay(city, pool, {
      opts: store.planOpts(),
      exclude: already,
      weekday: U.weekdayOf(day.date),
    });

    if (!picks.length) {
      ui.flash("Nothing left that fits this day — everything nearby is planned, seen, or shut.", "warn");
      return;
    }

    const preview = { date: day.date, startMin: day.startMin, stops: picks.map((p) => ({ id: p.id, placeId: p.id, at: null })) };
    const built = plan.buildDay(preview, ui.dayContext(preview));

    ui.openModal(`A day in ${esc(city.name)}`, `
      <p class="muted">Open when you'd get there, close enough to walk, and nothing you've already planned.</p>
      <ol class="suggest-list">
        ${built.blocks.filter((b) => b.type === "stop").map((b) => `
          <li>
            <span class="suggest-time">${esc(fromMinutes(b.startMin))}</span>
            <span class="suggest-name">${esc(b.place.name)}</span>
            <span class="muted">${esc(U.fmtDuration(b.dwell))}</span>
          </li>`).join("")}
      </ol>
      <p class="panel-note">
        Ends ${esc(fromMinutes(built.endMin))} ·
        ${esc(U.fmtDuration(built.travelMin))} getting between them ·
        ${esc(U.fmtDistance(built.km, store.settings().units))}.
        ${day.stops.length ? `<br><strong>This adds to the ${U.plural(day.stops.length, "stop")} already on the day.</strong>` : ""}
      </p>
    `, `
      <button class="btn" data-act="close-modal">No thanks</button>
      <button class="btn btn-primary" data-act="suggest-accept" data-index="${dayIndex}"
        data-ids="${esc(picks.map((p) => p.id).join(","))}">Add these ${picks.length}</button>
    `, { wide: true });
  }

  /* ---------------------------------------------------------------
     Your own places
     --------------------------------------------------------------- */
  function openPlaceEditor(id) {
    const p = id ? store.place(id) : null;
    const cityId = (p && p.city) || ui.state.city ||
      (store.activeTrip() && store.activeTrip().cityId) || "";

    ui.openModal(p ? "Edit your pin" : "Add a place", `
      <form id="placeForm" class="editor">
        <label class="field field-wide">
          <span>Name</span>
          <input name="name" value="${esc(p ? p.name : "")}" placeholder="That bakery on the corner" required />
        </label>
        <label class="field">
          <span>City</span>
          <select name="city">
            <option value="">— none —</option>
            ${cat.cities.map((c) => `<option value="${esc(c.id)}" ${cityId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Kind</span>
          <select name="cat">
            ${Object.keys(cat.CATEGORIES).map((k) =>
              `<option value="${k}" ${p && p.cat === k ? "selected" : ""}>${esc(cat.CATEGORIES[k].label)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Latitude</span>
          <input name="lat" type="number" step="any" value="${p && p.lat != null ? esc(p.lat) : ""}" placeholder="35.0116" />
        </label>
        <label class="field">
          <span>Longitude</span>
          <input name="lon" type="number" step="any" value="${p && p.lon != null ? esc(p.lon) : ""}" placeholder="135.7681" />
        </label>
        <label class="field">
          <span>How long you'd spend (minutes)</span>
          <input name="min" type="number" min="5" max="600" value="${p ? esc(p.min) : 60}" />
        </label>
        <label class="field field-wide">
          <span>Note</span>
          <input name="blurb" value="${esc(p ? p.blurb || "" : "")}" placeholder="Why it's worth the walk" />
        </label>
        <p class="panel-note field-wide">
          Coordinates are what put it on the map and into the walking times. Right-click a
          spot on OpenStreetMap and choose “show address” to read them off.
        </p>
      </form>
    `, `
      ${p ? `<button class="btn btn-danger" data-act="place-delete" data-id="${esc(p.id)}">Delete</button>` : ""}
      <button class="btn" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="place-save" data-id="${esc(p ? p.id : "")}">Save</button>
    `);
  }

  function savePlaceEditor(id) {
    const f = $("#placeForm");
    if (!f) return;
    const name = f.name.value.trim();
    if (!name) { ui.flash("It needs a name.", "warn"); return; }

    const patch = {
      name,
      city: f.city.value || null,
      cat: f.cat.value,
      lat: U.parseNum(f.lat.value),
      lon: U.parseNum(f.lon.value),
      min: U.clamp(Number(f.min.value) || 60, 5, 600),
      blurb: f.blurb.value.trim(),
      hours: cat.hours.ALWAYS,
    };

    if (id) {
      store.updateCustomPlace(id, patch);
      ui.flash("Pin updated.", "ok");
    } else {
      store.addCustomPlace(patch);
      ui.flash(patch.lat == null ? "Added — give it coordinates and it'll join the map." : "Added.", "ok");
    }
    ui.closeModal();
    ui.render();
  }

  /* ---------------------------------------------------------------
     Expenses
     --------------------------------------------------------------- */
  function openExpense(dayIndex) {
    const trip = store.activeTrip();
    const day = trip && trip.days[dayIndex];
    if (!day) return;
    const city = trip.cityId ? cat.cityById(trip.cityId) : null;
    const currency = (trip.budget && trip.budget.currency) || (city && city.currency) || "USD";

    ui.openModal("Log a spend", `
      <form id="expenseForm" class="editor">
        <label class="field">
          <span>Amount in ${esc(currency)}</span>
          <input name="amount" type="number" step="any" autofocus placeholder="0.00" />
        </label>
        <label class="field">
          <span>On what</span>
          <select name="cat">
            <option value="food">Food & drink</option>
            <option value="transit">Getting about</option>
            <option value="tickets">Tickets</option>
            <option value="stay">Somewhere to sleep</option>
            <option value="shopping">Shopping</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="field field-wide">
          <span>Note</span>
          <input name="note" placeholder="Lunch at the market" />
        </label>
      </form>
    `, `
      <button class="btn" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="expense-save" data-index="${dayIndex}">Log it</button>
    `);
    setTimeout(() => { const el = $('#expenseForm [name="amount"]'); if (el) el.focus(); }, 60);
  }

  function saveExpense(dayIndex) {
    const trip = store.activeTrip();
    const day = trip && trip.days[dayIndex];
    const f = $("#expenseForm");
    if (!day || !f) return;
    const amount = U.parseNum(f.amount.value);
    if (amount == null) { ui.flash("How much was it?", "warn"); return; }
    store.addExpense(trip.id, {
      date: day.date, amount, cat: f.cat.value, note: f.note.value.trim(),
    });
    ui.closeModal();
    ui.render();
  }

  /* ---------------------------------------------------------------
     Getting a day out of the app
     --------------------------------------------------------------- */
  function currentDayPlan() {
    const trip = store.activeTrip();
    const day = trip && trip.days[ui.state.dayIndex];
    if (!day) return null;
    return { trip, day, built: plan.buildDay(day, ui.dayContext(day)) };
  }

  async function copyDay() {
    const c = currentDayPlan();
    if (!c) return;
    const text = plan.toText(c.built, c.day, store.settings());
    const ok = await U.copyText(text);
    ui.flash(ok ? "Copied." : "Couldn't reach the clipboard — try exporting instead.", ok ? "ok" : "warn");
  }

  /* The diary next door stores entries under "diaryData", keyed by date.
     Same browser, same origin, so a day's plan can land straight in the
     right entry — appended, never over the top of what's there. */
  function sendDayToDiary() {
    const c = currentDayPlan();
    if (!c || !c.day.date) { ui.flash("Give the day a date first.", "warn"); return; }
    const text = plan.toText(c.built, c.day, store.settings());

    let diary = {};
    try {
      diary = JSON.parse(localStorage.getItem("diaryData") || "{}");
    } catch (e) {
      ui.flash("The diary's saved data couldn't be read — nothing written.", "warn");
      return;
    }

    const entry = diary[c.day.date] || { diary: "", mood: "", notes: "", notesTag: "general", tasks: [] };
    const existing = entry.diary || "";
    if (existing.includes(text.trim())) {
      ui.flash("That plan is already in the diary for this day.", "ok");
      return;
    }
    entry.diary = existing ? `${existing}\n\n${text}` : text;
    diary[c.day.date] = entry;

    try {
      localStorage.setItem("diaryData", JSON.stringify(diary));
      ui.flash(`Written into the diary for ${fmtDayLabel(c.day.date)}.`, "ok");
    } catch (e) {
      ui.flash("Couldn't write to the diary — storage may be full.", "warn");
    }
  }

  async function exportGeoJSON() {
    const c = currentDayPlan();
    if (!c) return;
    const points = c.built.blocks
      .filter((b) => b.type === "stop" && b.place && b.place.lat != null)
      .map((b) => ({
        lat: b.place.lat, lon: b.place.lon, label: b.place.name,
        cat: b.place.cat, time: fromMinutes(b.startMin),
      }));
    if (!points.length) { ui.flash("No stop on this day has coordinates.", "warn"); return; }

    const gj = RG.map.toGeoJSON(points, `${c.trip.name || "Trip"} — ${c.day.date || "day"}`);
    const r = await U.downloadFile(
      `roamguide-${c.day.date || U.isoDay(0)}.geojson`,
      JSON.stringify(gj, null, 2),
      "application/geo+json"
    );
    if (r === "saved") ui.flash("Exported.", "ok");
    else if (r === "declined") ui.flash("Export cancelled.", "ok");
    else ui.flash("This viewer can't save files. Open the app from the repository to export.", "warn");
  }

  /* ---------------------------------------------------------------
     Live location
     --------------------------------------------------------------- */
  /* A fix arrives every few seconds while you walk. Re-rendering on each
     one would fight anything you're in the middle of, so only redraw the
     view that's actually showing your position, and never over a dialog. */
  function wireLive() {
    RG.live.onChange(U.debounce(() => {
      if (ui.state.view !== "nearby") return;
      if (document.body.classList.contains("modal-open")) return;
      maybeRefresh();
      ui.render();
      syncMap();
    }, 700));
  }

  /* How far you have to walk before the answer to "what's around me"
     could have changed. Re-asking every few metres would hammer the API
     and reshuffle the list under your thumb while you're reading it. */
  const REFRESH_M = 150;

  async function runLookup(reason) {
    const fix = RG.live.state.fix;
    if (!fix) return;

    ui.state.lookup = { status: "loading", hits: [] };
    ui.state.lookupAt = { lat: fix.lat, lon: fix.lon };
    ui.render();

    try {
      const hits = await RG.lookup.around(fix.lat, fix.lon, ui.state.radius);

      /* Where the curated guidebook has an entry for the same thing, it
         wins: a paragraph written for a traveller beats an encyclopedia
         opening, and it comes with the tip about the queue. Matched by
         distance, because the names rarely agree exactly. */
      const mine = store.allPlaces().filter((p) => p.lat != null);
      hits.forEach((a) => {
        a.guidebook = mine.find((p) =>
          RG.geo.distanceKm({ lat: a.lat, lon: a.lon }, p) * 1000 < 90
        ) || null;
      });

      ui.state.lookup = { status: "ok", hits };
    } catch (e) {
      ui.state.lookup = { status: "error", error: e.message, hits: [] };
    }
    ui.render();
    syncMap();
  }

  /* The live map is a long-lived object living inside a view that
     re-renders on every fix, so it gets put back after each render and
     told what to draw. Doing this from here rather than from ui.js keeps
     rendering a pure string-building job. */
  let tileTroubleWired = false;

  function syncMap() {
    if (ui.state.view !== "nearby") return;
    if (!RG.livemap.available()) return;
    const host = $("#mapHost");
    if (!host) return;
    const fix = RG.live.state.fix;
    if (!fix) return;

    if (!tileTroubleWired) {
      tileTroubleWired = true;
      // One re-render when the tiles give up, to swap in the drawn map.
      RG.livemap.onTileTrouble(() => ui.render());
    }

    RG.livemap.mount(host);
    const hits = (ui.state.lookup && ui.state.lookup.status === "ok") ? ui.state.lookup.hits : [];
    RG.livemap.update(fix, hits.map((a) => ({
      lat: a.lat, lon: a.lon, title: a.title, metres: a.metres,
      extract: a.guidebook && a.guidebook.blurb ? a.guidebook.blurb : a.extract,
      url: a.url,
    })));
  }

  /* Re-ask once you've actually moved, so the guide keeps up as you walk. */
  function maybeRefresh() {
    const fix = RG.live.state.fix;
    if (!fix) return;
    if (ui.state.lookup && ui.state.lookup.status === "loading") return;
    const last = ui.state.lookupAt;
    if (!last) { runLookup("auto"); return; }
    const moved = RG.geo.distanceKm(last, { lat: fix.lat, lon: fix.lon }) * 1000;
    if (moved >= REFRESH_M) runLookup("auto");
  }

  /* ---------------------------------------------------------------
     Events
     --------------------------------------------------------------- */
  function wire() {
    document.addEventListener("click", async (e) => {
      const navTab = e.target.closest(".nav-tab");
      if (navTab) {
        ui.state.view = navTab.dataset.view;
        ui.render();
        syncMap();
        return;
      }

      // A click on the backdrop itself, not on the dialog it holds.
      if (e.target.classList && e.target.classList.contains("modal-back")) {
        ui.closeModal();
        return;
      }

      const btn = e.target.closest("[data-act]");
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      const dayIndex = btn.dataset.day != null ? Number(btn.dataset.day) : ui.state.dayIndex;
      const trip = store.activeTrip();

      switch (act) {
        // ---- chrome ----
        case "view": ui.state.view = btn.dataset.view; ui.render(); syncMap(); break;

        // ---- live location ----
        case "live-start":
          RG.live.start();
          ui.render();
          syncMap();
          break;
        case "live-stop":
          RG.live.stop();
          ui.flash("Location off.", "ok");
          ui.render();
          break;
        case "lookup": await runLookup("manual"); break;
        case "map-recenter": RG.livemap.recenter(RG.live.state.fix); break;

        case "install": {
          const r = await RG.install.prompt();
          if (r === "accepted") ui.flash("Installed — look for it on your home screen.", "ok");
          else if (r === "dismissed") ui.flash("No problem — it's in Settings when you want it.", "ok");
          else ui.flash("Your browser didn't offer an install this time.", "warn");
          ui.render();
          break;
        }
        case "radius":
          ui.state.radius = Number(btn.dataset.r);
          await runLookup("manual");
          break;
        case "theme": toggleTheme(); break;
        case "close-modal": ui.closeModal(); break;

        // ---- explore filters ----
        case "city":
          ui.state.city = btn.dataset.city || null;
          ui.render();
          break;
        case "cat":
          ui.state.category = btn.dataset.cat;
          ui.render();
          break;
        case "clear-filters":
          ui.state.city = null; ui.state.category = "all";
          ui.state.search = ""; ui.state.onlyOpen = false;
          { const s = $("#searchInput"); if (s) s.value = ""; }
          ui.render();
          break;
        case "city-phrases":
        case "city-practical":
          ui.state.city = btn.dataset.city;
          ui.render();
          break;

        // ---- places ----
        case "detail": ui.openDetail(id); break;
        case "save": {
          const added = store.toggleSaved(id);
          const p = store.place(id);
          ui.flash(added ? `Saved ${p ? p.name : "it"}.` : "Removed from saved.", "ok");
          if (ui.state.detailId) ui.openDetail(ui.state.detailId);
          ui.render();
          break;
        }
        case "visited": {
          const was = store.isVisited(id);
          store.markVisited(id, was ? null : {});
          ui.flash(was ? "Unmarked." : "Marked as been.", "ok");
          if (ui.state.detailId) ui.openDetail(ui.state.detailId);
          ui.render();
          break;
        }
        case "new-place": openPlaceEditor(null); break;
        case "edit-place": openPlaceEditor(id); break;
        case "place-save": savePlaceEditor(id); break;
        case "place-delete": {
          const p = store.place(id);
          if (p && confirm(`Delete “${p.name}”? It will come off any day it's planned into.`)) {
            store.removeCustomPlace(id);
            ui.closeModal();
            ui.flash("Deleted.", "ok");
            ui.render();
          }
          break;
        }

        // ---- trips ----
        case "new-trip": openTripEditor(null); break;
        case "trip-edit": if (trip) openTripEditor(trip.id); break;
        case "trip-save": saveTripEditor(id || null); break;
        case "trip-delete": {
          const t = store.trip(id);
          if (t && confirm(`Delete “${t.name || "this trip"}” and its ${U.plural(t.days.length, "day")} of planning?`)) {
            store.removeTrip(id);
            ui.state.dayIndex = 0;
            ui.closeModal();
            ui.flash("Trip deleted.", "ok");
            ui.render();
          }
          break;
        }

        // ---- days ----
        case "day-pick": ui.state.dayIndex = Number(btn.dataset.index); ui.render(); break;
        case "day-add": {
          if (!trip) break;
          store.addDay(trip.id);
          ui.state.dayIndex = trip.days.length - 1;
          ui.render();
          break;
        }
        case "day-start": openDayStart(dayIndex); break;
        case "day-start-save": {
          const f = $("#dayForm");
          if (!trip || !f) break;
          store.updateDay(trip.id, Number(btn.dataset.index), {
            startMin: U.toMinutes(f.start.value),
            note: f.note.value.trim(),
          });
          ui.closeModal();
          ui.render();
          break;
        }
        case "day-start-clear":
          if (trip) store.updateDay(trip.id, Number(btn.dataset.index), { startMin: null });
          ui.closeModal();
          ui.render();
          break;

        case "day-tidy": {
          if (!trip) break;
          const day = trip.days[ui.state.dayIndex];
          const before = plan.buildDay(day, ui.dayContext(day));
          store.reorderStops(trip.id, ui.state.dayIndex, plan.tidyOrder(day, ui.dayContext(day)));
          const after = plan.buildDay(trip.days[ui.state.dayIndex], ui.dayContext(day));
          const saved = before.km - after.km;
          ui.flash(
            saved > 0.05
              ? `Reordered — ${U.fmtDistance(saved, store.settings().units)} less to cover.`
              : "That order was already about as tight as it gets.",
            "ok"
          );
          ui.render();
          break;
        }

        case "day-suggest": suggestDay(ui.state.dayIndex); break;
        case "suggest-accept": {
          if (!trip) break;
          const index = Number(btn.dataset.index);
          const ids = (btn.dataset.ids || "").split(",").filter(Boolean);
          let added = 0;
          ids.forEach((pid) => { if (store.addStop(trip.id, index, pid)) added++; });
          ui.closeModal();
          ui.state.dayIndex = index;
          ui.flash(`${U.plural(added, "stop")} added.`, "ok");
          ui.render();
          break;
        }

        case "day-copy": await copyDay(); break;
        case "day-diary": sendDayToDiary(); break;
        case "day-geojson": await exportGeoJSON(); break;

        // ---- stops ----
        case "add-to-day": addToDay(id); break;
        case "add-confirm":
          if (trip) commitAdd(trip, Number(btn.dataset.index), id);
          break;
        case "stop-up": if (trip) { store.moveStop(trip.id, dayIndex, btn.dataset.stop, -1); ui.render(); } break;
        case "stop-down": if (trip) { store.moveStop(trip.id, dayIndex, btn.dataset.stop, 1); ui.render(); } break;
        case "stop-edit": openStopEditor(dayIndex, btn.dataset.stop); break;
        case "stop-save": saveStopEditor(dayIndex, btn.dataset.stop); break;
        case "stop-done": {
          if (!trip) break;
          const day = trip.days[dayIndex];
          const s = day && day.stops.find((x) => x.id === btn.dataset.stop);
          if (!s) break;
          const done = !s.done;
          store.updateStop(trip.id, dayIndex, s.id, { done });
          // Ticking a stop off is also how you remember you were there.
          if (done) store.markVisited(s.placeId, { date: day.date || U.isoDay(0) });
          ui.render();
          break;
        }
        case "stop-remove":
          if (trip) { store.removeStop(trip.id, dayIndex, btn.dataset.stop); ui.render(); }
          break;

        // ---- expenses ----
        case "expense-add": openExpense(ui.state.dayIndex); break;
        case "expense-save": saveExpense(Number(btn.dataset.index)); break;
        case "expense-remove":
          if (trip) { store.removeExpense(trip.id, id); ui.render(); }
          break;

        // ---- phrases ----
        case "copy-phrase": {
          const ok = await U.copyText(btn.dataset.text || "");
          ui.flash(ok ? "Copied — show them the screen if it comes to it." : "Couldn't copy.", ok ? "ok" : "warn");
          break;
        }

        // ---- data ----
        case "export": {
          const r = await U.downloadFile(
            `roamguide-${U.isoDay(0)}.json`,
            JSON.stringify(store.exportAll(), null, 2),
            "application/json"
          );
          if (r === "saved") ui.flash("Exported.", "ok");
          else if (r === "declined") ui.flash("Export cancelled.", "ok");
          else ui.flash("This viewer can't save files. Open the app from the repository to export.", "warn");
          break;
        }
        case "reset":
          if (confirm("Delete every trip, every pin and everything you've marked as seen? This cannot be undone.")) {
            localStorage.removeItem(store.KEY);
            location.reload();
          }
          break;
      }
    });

    document.addEventListener("change", (e) => {
      const el = e.target;

      if (el.id === "importFile" && el.files && el.files[0]) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const obj = JSON.parse(reader.result);
            const merge = confirm("OK to merge with what's already here.\nCancel to replace everything.");
            store.importAll(obj, merge ? "merge" : "replace");
            applyTheme(store.settings().theme);
            ui.flash("Imported.", "ok");
            ui.render();
          } catch (err) {
            ui.flash("That file isn't RoamGuide JSON.", "warn");
          }
        };
        reader.readAsText(el.files[0]);
        el.value = "";
        return;
      }

      if (el.dataset.act === "only-open") {
        ui.state.onlyOpen = el.checked;
        ui.render();
        return;
      }

      if (el.dataset.act === "trip-switch") {
        store.setActiveTrip(el.value);
        ui.state.dayIndex = 0;
        ui.render();
        return;
      }

      if (el.dataset.set) {
        const v = el.type === "checkbox" ? el.checked
          : el.type === "number" ? Number(el.value)
          : el.value;
        store.setSettings({ [el.dataset.set]: v });
        ui.render();
      }
    });

    const search = $("#searchInput");
    if (search) {
      search.addEventListener("input", U.debounce(() => {
        ui.state.search = search.value;
        if (!["explore", "phrases"].includes(ui.state.view)) ui.state.view = "explore";
        ui.render();
      }, 200));
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#modalHost").hidden) ui.closeModal();
      if (e.key === "/" && document.activeElement !== search &&
          !document.body.classList.contains("modal-open")) {
        e.preventDefault();
        if (search) search.focus();
      }
    });
  }

  /* ---------------------------------------------------------------
     First run — one trip, already half-planned, so the app opens on
     something rather than on a form.
     --------------------------------------------------------------- */
  function seed() {
    const data = store.raw();
    if (data.seeded || data.trips.length) return;

    const city = cat.cityById("kyoto");
    const start = U.isoDay(21);
    const trip = store.addTrip({
      name: "Three days in Kyoto",
      cityId: city.id,
      startDate: start,
      budget: { daily: city.dayBudget, currency: city.currency },
      days: [store.blankDay(start), store.blankDay(U.addDays(start, 1)), store.blankDay(U.addDays(start, 2))],
      notes: "An example trip — rename it, or delete it and start your own.",
    });

    ["kyo-fushimi", "kyo-nishiki", "kyo-gion"].forEach((p) => store.addStop(trip.id, 0, p));
    ["kyo-kiyomizu", "kyo-ginkaku"].forEach((p) => store.addStop(trip.id, 1, p));
    store.addStop(trip.id, 2, "kyo-arashiyama");

    store.raw().seeded = true;
    store.save(true);
  }

  function init() {
    store.load();
    seed();
    applyTheme(store.settings().theme);
    watchSystemTheme();
    wire();
    wireLive();
    RG.install.listen();
    // The offer can arrive after first paint; redraw Settings when it does.
    RG.install.onChange(() => { if (ui.state.view === "settings") ui.render(); });
    ui.render();

    // Location is never switched on behind your back — the Nearby tab asks.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.RG);
