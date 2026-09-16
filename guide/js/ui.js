/* ================================================
   ROAMGUIDE — ui.js
   Rendering and interaction. Plain DOM, event delegation, no framework.
   ================================================ */
(function (RG) {
  "use strict";
  const U = RG.util;
  const { $, $$, esc, fmtDuration, fmtDistance, fromMinutes, fmtMoney, fmtDayLabel } = U;
  const store = RG.store;
  const cat = RG.catalog;
  const plan = RG.plan;

  const state = {
    view: "explore",      // explore | trip | phrases | practical | settings
    city: null,           // null = every city
    category: "all",
    search: "",
    onlyOpen: false,
    dayIndex: 0,
    detailId: null,
    editing: null,        // scratch object for whichever editor is open
  };

  // ---------------------------------------------------------------
  // Small shared pieces
  // ---------------------------------------------------------------
  function catChip(key) {
    const c = cat.CATEGORIES[key] || cat.CATEGORIES.sight;
    return `<span class="cat-chip"><span aria-hidden="true">${c.icon}</span> ${esc(c.label)}</span>`;
  }

  function cityOf(p) {
    return p && p.city ? cat.cityById(p.city) : null;
  }

  function priceText(p) {
    if (!p || !p.price) return "";
    const c = cityOf(p);
    const cur = (p.price.currency) || (c && c.currency) || "USD";
    if (!Number.isFinite(p.price.amount) || p.price.amount === 0) {
      return p.price.note || "Free";
    }
    return `${fmtMoney(p.price.amount, cur)}${p.price.note ? ` · ${p.price.note}` : ""}`;
  }

  /* Opening hours for the day being planned, or for today when browsing.
     Colour is never the only cue — a closed place says "Closed". */
  function hoursBadge(p, weekday) {
    const h = plan.hoursFor(p, weekday == null ? new Date().getDay() : weekday);
    if (h.closed) {
      return `<span class="badge badge-critical"><span aria-hidden="true">✕</span> ${esc(h.text)}</span>`;
    }
    if (h.allDay) {
      return `<span class="badge badge-good"><span aria-hidden="true">◷</span> Open any time</span>`;
    }
    if (!h.known) {
      return `<span class="badge badge-muted"><span aria-hidden="true">?</span> ${esc(h.text)}</span>`;
    }
    return `<span class="badge badge-good"><span aria-hidden="true">◷</span> ${esc(h.text)}</span>`;
  }

  function tagList(tags) {
    return (tags || []).slice(0, 4)
      .map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  }

  function flash(msg, kind) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast is-on" + (kind ? ` toast-${kind}` : "");
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { el.className = "toast"; }, 2600);
  }

  // ---- modal ----
  function openModal(title, body, footer, opts) {
    const host = $("#modalHost");
    host.innerHTML = `<div class="modal-back" data-act="close-modal-back">
      <div class="modal ${opts && opts.wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="modal-head">
          <h2>${title}</h2>
          <button class="icon-btn" data-act="close-modal" aria-label="Close">✕</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">${footer || ""}</footer>
      </div>
    </div>`;
    host.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    const host = $("#modalHost");
    host.hidden = true;
    host.innerHTML = "";
    document.body.classList.remove("modal-open");
    state.detailId = null;
  }

  // ---------------------------------------------------------------
  // Explore
  // ---------------------------------------------------------------
  function matches(p, q) {
    if (!q) return true;
    const hay = U.fold([
      p.name, p.local, p.cityName, p.blurb, p.tip, (p.tags || []).join(" "),
      (cat.CATEGORIES[p.cat] || {}).label,
    ].join(" "));
    // Every word has to land somewhere, so two words narrow rather than widen.
    return U.fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }

  function visiblePlaces() {
    const weekday = new Date().getDay();
    return store.allPlaces().filter((p) => {
      if (state.city && p.city !== state.city) return false;
      if (state.category !== "all" && p.cat !== state.category) return false;
      if (state.onlyOpen && plan.hoursFor(p, weekday).closed) return false;
      return matches(p, state.search);
    });
  }

  function placeCard(p) {
    const saved = store.isSaved(p.id);
    const visited = store.isVisited(p.id);
    const price = priceText(p);
    return `<article class="place-card${visited ? " is-visited" : ""}">
      <header class="place-head">
        <div>
          <h3 class="place-name">
            <button class="linkish" data-act="detail" data-id="${esc(p.id)}">${esc(p.name)}</button>
          </h3>
          ${p.local && store.settings().showLocal
            ? `<p class="place-local" lang="und">${esc(p.local)}</p>` : ""}
          <p class="place-meta">
            ${catChip(p.cat)}
            <span class="dot">·</span> ${esc(p.cityName || "")}
            <span class="dot">·</span> ${esc(fmtDuration(p.min))}
            ${price ? `<span class="dot">·</span> ${esc(price)}` : ""}
          </p>
        </div>
        <button class="icon-btn star${saved ? " is-on" : ""}" data-act="save" data-id="${esc(p.id)}"
          title="${saved ? "Remove from saved" : "Save for later"}"
          aria-pressed="${saved ? "true" : "false"}"
          aria-label="${saved ? "Remove from saved" : "Save for later"}">${saved ? "★" : "☆"}</button>
      </header>
      <p class="place-blurb">${esc(p.blurb || "")}</p>
      <p class="place-badges">${hoursBadge(p)} ${visited ? `<span class="badge badge-muted"><span aria-hidden="true">✓</span> Been</span>` : ""}</p>
      ${p.tags && p.tags.length ? `<p class="tag-row">${tagList(p.tags)}</p>` : ""}
      <footer class="place-foot">
        <button class="btn btn-small" data-act="add-to-day" data-id="${esc(p.id)}">+ Add to day</button>
        <button class="btn btn-small btn-ghost" data-act="detail" data-id="${esc(p.id)}">Details</button>
      </footer>
    </article>`;
  }

  function viewExplore() {
    const places = visiblePlaces();
    const cities = cat.cities;
    const active = store.activeTrip();

    const cityChips = [`<button class="chip-btn${!state.city ? " is-on" : ""}" data-act="city" data-city="">All cities</button>`]
      .concat(cities.map((c) =>
        `<button class="chip-btn${state.city === c.id ? " is-on" : ""}" data-act="city" data-city="${esc(c.id)}">${esc(c.name)}</button>`
      )).join("");

    const catChips = [`<button class="chip-btn${state.category === "all" ? " is-on" : ""}" data-act="cat" data-cat="all">Everything</button>`]
      .concat(Object.keys(cat.CATEGORIES).map((k) =>
        `<button class="chip-btn${state.category === k ? " is-on" : ""}" data-act="cat" data-cat="${esc(k)}">
          <span aria-hidden="true">${cat.CATEGORIES[k].icon}</span> ${esc(cat.CATEGORIES[k].label)}</button>`
      )).join("");

    const city = state.city ? cat.cityById(state.city) : null;

    return `
      <section class="panel">
        <div class="filter-row">${cityChips}</div>
        <div class="filter-row filter-row-sub">${catChips}</div>
        <div class="filter-row filter-row-sub">
          <label class="toggle">
            <input type="checkbox" data-act="only-open" ${state.onlyOpen ? "checked" : ""} />
            <span>Open today only</span>
          </label>
          <span class="muted">${U.plural(places.length, "place")}${state.search ? ` matching “${esc(state.search)}”` : ""}</span>
          <button class="btn btn-small btn-ghost" data-act="new-place">+ Add your own</button>
        </div>
      </section>

      ${city ? `<section class="panel city-intro">
        <h2>${esc(city.name)}<span class="muted"> · ${esc(city.country)}</span></h2>
        <p>${esc(city.blurb)}</p>
        <p class="muted"><strong>When to come.</strong> ${esc(city.bestMonths)}</p>
        <p><button class="btn btn-small" data-act="view" data-view="practical">Practical details →</button></p>
      </section>` : ""}

      ${active ? "" : `<section class="panel panel-nudge">
        <p><strong>No trip yet.</strong> Start one and you can drop any of these into a day and see the whole thing timed out.</p>
        <button class="btn btn-primary btn-small" data-act="new-trip">Start a trip</button>
      </section>`}

      ${places.length
        ? `<div class="place-grid">${places.map(placeCard).join("")}</div>`
        : `<section class="panel empty">
             <p>Nothing matches that.</p>
             <button class="btn btn-small" data-act="clear-filters">Clear the filters</button>
           </section>`}
    `;
  }

  // ---------------------------------------------------------------
  // Trip
  // ---------------------------------------------------------------
  function dayContext(day) {
    return { place: store.place, opts: store.planOpts(), day };
  }

  function timelineBlock(b, trip, dayIndex) {
    if (b.type === "travel") {
      const mode = b.mode === "walk" ? "Walk" : "Transit";
      const icon = b.mode === "walk" ? "⏶" : "⇄";
      const dir = RG.map.osmDirections(b.from, b.to);
      return `<li class="tl-travel">
        <span class="tl-time" aria-hidden="true">${icon}</span>
        <span class="tl-travel-text">${esc(mode)} ${esc(fmtDuration(b.minutes))}
          · ${esc(fmtDistance(b.km, store.settings().units))}
          ${dir ? `<a href="${esc(dir)}" target="_blank" rel="noopener">route</a>` : ""}</span>
      </li>`;
    }
    if (b.type === "wait") {
      const why = b.reason === "opens" ? "until it opens" : "before your pinned time";
      return `<li class="tl-travel tl-wait">
        <span class="tl-time" aria-hidden="true">◌</span>
        <span class="tl-travel-text">${esc(fmtDuration(b.minutes))} spare ${esc(why)}</span>
      </li>`;
    }

    if (b.missing) {
      return `<li class="tl-stop is-missing">
        <span class="tl-time">—</span>
        <div class="tl-body">
          <p>This stop's place has been deleted.</p>
          <button class="btn btn-small btn-ghost" data-act="stop-remove"
            data-day="${dayIndex}" data-stop="${esc(b.stop.id)}">Remove it</button>
        </div>
      </li>`;
    }

    const p = b.place;
    const warn = b.warnings.map((w) =>
      `<p class="warn warn-${esc(w.level)}"><span aria-hidden="true">${w.level === "warning" ? "▲" : "✕"}</span> ${esc(w.text)}</p>`
    ).join("");

    return `<li class="tl-stop${b.stop.done ? " is-done" : ""}">
      <span class="tl-time">${esc(fromMinutes(b.startMin))}${b.stop.at != null ? `<span class="pin" title="Pinned time" aria-label="Pinned time">⚲</span>` : ""}</span>
      <div class="tl-body">
        <div class="tl-title-row">
          <h4>
            <button class="linkish" data-act="detail" data-id="${esc(p.id)}">${esc(p.name)}</button>
          </h4>
          <span class="tl-dur">${esc(fmtDuration(b.dwell))}</span>
        </div>
        <p class="tl-meta">${catChip(p.cat)} <span class="dot">·</span> ${esc(b.hours.text)}
          ${priceText(p) ? `<span class="dot">·</span> ${esc(priceText(p))}` : ""}</p>
        ${b.stop.note ? `<p class="tl-note">${esc(b.stop.note)}</p>` : ""}
        ${warn}
        <div class="tl-actions">
          <button class="icon-btn" data-act="stop-up" data-day="${dayIndex}" data-stop="${esc(b.stop.id)}" title="Earlier" aria-label="Move earlier">↑</button>
          <button class="icon-btn" data-act="stop-down" data-day="${dayIndex}" data-stop="${esc(b.stop.id)}" title="Later" aria-label="Move later">↓</button>
          <button class="icon-btn" data-act="stop-edit" data-day="${dayIndex}" data-stop="${esc(b.stop.id)}" title="Note or pin a time" aria-label="Note or pin a time">✎</button>
          <button class="icon-btn${b.stop.done ? " is-on" : ""}" data-act="stop-done" data-day="${dayIndex}" data-stop="${esc(b.stop.id)}" title="Mark as done" aria-label="Mark as done">✓</button>
          <button class="icon-btn" data-act="stop-remove" data-day="${dayIndex}" data-stop="${esc(b.stop.id)}" title="Remove from the day" aria-label="Remove from the day">✕</button>
        </div>
      </div>
    </li>`;
  }

  /* Set by a copy of the app published on its own, away from the diary it
     normally sits beside. Everything else works standalone; writing into
     diaryData does not, so that one control isn't drawn. */
  function dayPanel(trip) {
    const i = Math.min(state.dayIndex, Math.max(0, trip.days.length - 1));
    const day = trip.days[i];
    if (!day) {
      return `<section class="panel empty"><p>This trip has no days yet.</p>
        <button class="btn btn-small" data-act="day-add">Add a day</button></section>`;
    }

    const built = plan.buildDay(day, dayContext(day));
    const opts = store.planOpts();
    const city = trip.cityId ? cat.cityById(trip.cityId) : null;

    const mapPoints = built.blocks
      .filter((b) => b.type === "stop" && b.place && b.place.lat != null)
      .map((b, n) => ({
        lat: b.place.lat, lon: b.place.lon, label: `${n + 1}. ${b.place.name}`,
        n: n + 1, cat: b.place.cat, done: b.stop.done,
        time: fromMinutes(b.startMin),
      }));

    const spend = trip.expenses
      .filter((e) => e.date === day.date)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const budget = trip.budget && Number(trip.budget.daily);
    const currency = (trip.budget && trip.budget.currency) || (city && city.currency) || "USD";

    return `
      <section class="panel day-head">
        <div class="day-head-left">
          <h2>${esc(fmtDayLabel(day.date))}</h2>
          <p class="muted">
            Starts ${esc(fromMinutes(day.startMin == null ? opts.dayStart : day.startMin))}
            <span class="dot">·</span> ${U.plural(day.stops.length, "stop")}
            ${built.blocks.length ? `<span class="dot">·</span> ends ${esc(fromMinutes(built.endMin))}` : ""}
          </p>
        </div>
        <div class="day-head-right">
          <button class="btn btn-small" data-act="day-suggest">Suggest a day</button>
          <button class="btn btn-small" data-act="day-tidy" ${day.stops.length < 3 ? "disabled" : ""}>Tidy the order</button>
          <button class="btn btn-small btn-ghost" data-act="day-start">Start time</button>
        </div>
      </section>

      ${built.warnings.length ? `<section class="panel panel-warn">
        <h3>Worth knowing</h3>
        <ul>${built.warnings.map((w) =>
          `<li class="warn warn-${esc(w.level)}"><span aria-hidden="true">${w.level === "warning" ? "▲" : "✕"}</span>
           ${w.place ? `<strong>${esc(w.place)}:</strong> ` : ""}${esc(w.text)}</li>`).join("")}</ul>
      </section>` : ""}

      <div class="day-cols">
        <section class="panel day-plan">
          ${day.stops.length
            ? `<ul class="timeline">${built.blocks.map((b) => timelineBlock(b, trip, i)).join("")}</ul>`
            : `<div class="empty">
                 <p>Nothing planned for this day.</p>
                 <p class="muted">Add places from Explore, or let the planner put a day together for you.</p>
                 <button class="btn btn-primary btn-small" data-act="day-suggest">Suggest a day</button>
               </div>`}
          <div class="day-plan-foot">
            <button class="btn btn-small" data-act="view" data-view="explore">+ Add a place</button>
            ${day.stops.length ? `
              <button class="btn btn-small btn-ghost" data-act="day-copy">Copy as text</button>
              ${window.RG_HOSTED ? "" :
                `<button class="btn btn-small btn-ghost" data-act="day-diary">Send to diary</button>`}
              <button class="btn btn-small btn-ghost" data-act="day-geojson">Export .geojson</button>` : ""}
          </div>
        </section>

        <aside class="day-side">
          <section class="panel map-panel">
            <h3>Where these are</h3>
            ${RG.map.svg(mapPoints, { width: 420, height: 300, units: store.settings().units })}
            <p class="muted small">Drawn from coordinates — no streets. Open any place for a real map.</p>
          </section>

          <section class="panel">
            <h3>The day in numbers</h3>
            <dl class="stat-list">
              <div><dt>On your feet</dt><dd>${esc(fmtDuration(built.travelMin))}</dd></div>
              <div><dt>Distance covered</dt><dd>${esc(fmtDistance(built.km, store.settings().units))}</dd></div>
              <div><dt>At the stops</dt><dd>${esc(fmtDuration(built.dwellMin))}</dd></div>
              <div><dt>Admission</dt><dd>${built.cost ? esc(fmtMoney(built.cost, currency)) : "—"}</dd></div>
            </dl>
          </section>

          <section class="panel">
            <h3>Spending</h3>
            <p class="spend-line">
              <strong>${esc(fmtMoney(spend, currency))}</strong> logged today
              ${budget ? `<span class="muted">of ${esc(fmtMoney(budget, currency))}</span>` : ""}
            </p>
            ${budget ? `<div class="meter" role="img"
              aria-label="${esc(Math.round((spend / budget) * 100))}% of today's budget used">
              <span style="width:${Math.min(100, Math.round((spend / budget) * 100))}%"
                class="${spend > budget ? "over" : ""}"></span>
            </div>
            ${spend > budget ? `<p class="warn warn-warning"><span aria-hidden="true">▲</span> ${esc(fmtMoney(spend - budget, currency))} over.</p>` : ""}` : ""}
            <ul class="expense-list">
              ${trip.expenses.filter((e) => e.date === day.date).map((e) =>
                `<li><span>${esc(e.note || e.cat)}</span>
                  <span class="expense-amt">${esc(fmtMoney(Number(e.amount) || 0, currency))}</span>
                  <button class="icon-btn" data-act="expense-remove" data-id="${esc(e.id)}"
                    title="Remove" aria-label="Remove this expense">✕</button></li>`).join("")}
            </ul>
            <button class="btn btn-small" data-act="expense-add">+ Log a spend</button>
          </section>
        </aside>
      </div>
    `;
  }

  function viewTrip() {
    const trip = store.activeTrip();
    if (!trip) {
      return `<section class="panel empty">
        <h2>No trip yet</h2>
        <p>A trip is a city, some dates, and a day to hang places off.</p>
        <button class="btn btn-primary" data-act="new-trip">Start one</button>
      </section>`;
    }

    const city = trip.cityId ? cat.cityById(trip.cityId) : null;
    const away = U.daysUntil(trip.startDate);
    const dayTabs = trip.days.map((d, i) =>
      `<button class="day-tab${i === state.dayIndex ? " is-on" : ""}" data-act="day-pick" data-index="${i}">
        <span class="day-tab-n">Day ${i + 1}</span>
        <span class="day-tab-d">${esc(d.date ? fmtDayLabel(d.date) : "—")}</span>
        <span class="day-tab-c">${U.plural(d.stops.length, "stop")}</span>
      </button>`).join("");

    const others = store.trips().filter((t) => t.id !== trip.id);

    return `
      <section class="panel trip-head">
        <div>
          <h2>${esc(trip.name || (city ? city.name : "Untitled trip"))}</h2>
          <p class="muted">
            ${city ? esc(city.name) + " · " : ""}${esc(fmtDayLabel(trip.startDate))}
            <span class="dot">·</span> ${U.plural(trip.days.length, "day")}
            ${away != null ? `<span class="dot">·</span> ${away > 0 ? `${U.plural(away, "day")} away` : away === 0 ? "today" : "under way"}` : ""}
          </p>
        </div>
        <div class="trip-head-actions">
          ${others.length ? `<select data-act="trip-switch" aria-label="Switch trip">
            ${store.trips().map((t) => `<option value="${esc(t.id)}" ${t.id === trip.id ? "selected" : ""}>${esc(t.name || "Untitled trip")}</option>`).join("")}
          </select>` : ""}
          <button class="btn btn-small" data-act="trip-edit">Edit trip</button>
          <button class="btn btn-small btn-ghost" data-act="new-trip">New trip</button>
        </div>
      </section>

      <section class="panel day-tabs-panel">
        <div class="day-tabs">${dayTabs}
          <button class="day-tab day-tab-add" data-act="day-add" aria-label="Add a day">+</button>
        </div>
      </section>

      ${dayPanel(trip)}
    `;
  }

  // ---------------------------------------------------------------
  // Phrasebook & practical
  // ---------------------------------------------------------------
  function currentCity() {
    if (state.city) return cat.cityById(state.city);
    const t = store.activeTrip();
    if (t && t.cityId) return cat.cityById(t.cityId);
    return cat.cities[0];
  }

  function cityPicker(act) {
    const city = currentCity();
    return `<div class="filter-row">${cat.cities.map((c) =>
      `<button class="chip-btn${city && c.id === city.id ? " is-on" : ""}" data-act="${act}" data-city="${esc(c.id)}">${esc(c.name)}</button>`
    ).join("")}</div>`;
  }

  function viewPhrases() {
    const city = currentCity();
    const q = state.search;
    const groups = (city.phrases || []).map((g) => {
      const items = g.items.filter((it) =>
        !q || U.fold(it.join(" ")).includes(U.fold(q))
      );
      if (!items.length) return "";
      return `<section class="panel">
        <h3>${esc(g.group)}</h3>
        <ul class="phrase-list">${items.map((it) => `
          <li>
            <div class="phrase-en">${esc(it[0])}</div>
            <div class="phrase-loc" lang="und">${esc(it[1])}</div>
            <div class="phrase-say">${esc(it[2])}</div>
            <button class="icon-btn" data-act="copy-phrase" data-text="${esc(it[1])}"
              title="Copy" aria-label="Copy ${esc(it[0])}">⧉</button>
          </li>`).join("")}</ul>
      </section>`;
    }).join("");

    return `
      <section class="panel">
        <h2>${esc(city.language)} — enough to be polite</h2>
        <p class="muted">Pronunciation is approximate and unashamedly phonetic. Saying it badly still counts.</p>
        ${cityPicker("city-phrases")}
      </section>
      ${groups || `<section class="panel empty"><p>No phrase matches “${esc(q)}”.</p></section>`}
    `;
  }

  function viewPractical() {
    const city = currentCity();
    const b = city.basics || {};
    const rows = [
      ["Getting around", b.transit],
      ["Money", b.money],
      ["Tipping", b.tipping],
      ["Water", b.water],
      ["Manners & watch-outs", b.etiquette],
      ["Emergency", b.emergency],
      ["Power", b.power],
      ["When to come", city.bestMonths],
    ].filter((r) => r[1]);

    return `
      <section class="panel">
        <h2>${esc(city.name)}<span class="muted"> · ${esc(city.country)}</span></h2>
        <p>${esc(city.blurb)}</p>
        ${cityPicker("city-practical")}
      </section>
      <section class="panel">
        <dl class="practical">
          ${rows.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join("")}
        </dl>
      </section>
      <section class="panel">
        <h3>Everything in ${esc(city.name)}</h3>
        ${RG.map.svg(city.places.map((p, i) => ({
          lat: p.lat, lon: p.lon, label: p.name, n: i + 1, cat: p.cat,
        })), { width: 640, height: 380, route: false, units: store.settings().units })}
      </section>
    `;
  }

  // ---------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------
  function viewSettings() {
    const s = store.settings();
    const paceOpts = Object.keys(store.PACE).map((k) =>
      `<option value="${k}" ${s.pace === k ? "selected" : ""}>${esc(store.PACE[k].label)} — ${esc(store.PACE[k].note)}</option>`
    ).join("");

    return `
      <section class="panel">
        <h2>How you travel</h2>
        <div class="field-grid">
          <label class="field">
            <span>Pace</span>
            <select data-set="pace">${paceOpts}</select>
          </label>
          <label class="field">
            <span>Day starts</span>
            <input type="time" data-set="dayStart" value="${esc(s.dayStart)}" />
          </label>
          <label class="field">
            <span>Day ends</span>
            <input type="time" data-set="dayEnd" value="${esc(s.dayEnd)}" />
          </label>
          <label class="field">
            <span>Walking speed (km/h)</span>
            <input type="number" step="0.1" min="2" max="7" data-set="walkKmh" value="${esc(s.walkKmh)}" />
          </label>
          <label class="field">
            <span>Walk rather than ride, up to</span>
            <input type="number" step="0.1" min="0.2" max="6" data-set="maxWalkKm" value="${esc(s.maxWalkKm)}" />
          </label>
          <label class="field">
            <span>Distances in</span>
            <select data-set="units">
              <option value="km" ${s.units === "km" ? "selected" : ""}>Kilometres</option>
              <option value="mi" ${s.units === "mi" ? "selected" : ""}>Miles</option>
            </select>
          </label>
        </div>
        <label class="toggle">
          <input type="checkbox" data-set="showLocal" ${s.showLocal ? "checked" : ""} />
          <span>Show names in the local script too</span>
        </label>
        <p class="panel-note">
          Pace stretches or squeezes every stop's suggested length. It changes the plan,
          not the guidebook.
        </p>
      </section>

      <section class="panel">
        <h2>Your data</h2>
        <p class="muted">
          Everything lives in this browser, on this device. Nothing is uploaded anywhere —
          which also means clearing site data clears your trips.
        </p>
        <div class="btn-row">
          <button class="btn" data-act="export">Export everything</button>
          <label class="btn">Import a file
            <input type="file" id="importFile" accept=".json" style="display:none" />
          </label>
          <button class="btn btn-danger" data-act="reset">Delete everything</button>
        </div>
      </section>

      <section class="panel">
        <h2>About the guidebook</h2>
        <p>
          Four cities ship with the app: ${esc(cat.cities.map((c) => c.name).join(", "))}.
          Opening hours, prices and closing days are planning figures, accurate when they
          were written and certain to drift. Check anything you'd be sorry to get wrong —
          every place links out to OpenStreetMap.
        </p>
        <p class="muted">
          Add your own places from Explore, and they behave exactly like the built-in ones:
          plannable, mappable, and yours to export.
        </p>
      </section>
    `;
  }

  // ---------------------------------------------------------------
  // Place detail
  // ---------------------------------------------------------------
  function openDetail(id) {
    const p = store.place(id);
    if (!p) return;
    state.detailId = id;
    const city = cityOf(p);
    const visited = store.visitedAll()[id];
    const saved = store.isSaved(id);
    const osm = RG.map.osmLink(p);

    const week = Array.isArray(p.hours) ? plan.WEEKDAYS.map((name, d) => {
      const h = plan.hoursFor(p, d);
      return `<div class="${d === new Date().getDay() ? "is-today" : ""}">
        <dt>${esc(name)}</dt><dd>${esc(h.closed ? "Closed" : h.text)}</dd></div>`;
    }).join("") : "";

    openModal(esc(p.name), `
      ${p.local ? `<p class="detail-local" lang="und">${esc(p.local)}</p>` : ""}
      <p class="detail-meta">${catChip(p.cat)}
        <span class="dot">·</span> ${esc(p.cityName || (city ? city.name : ""))}
        <span class="dot">·</span> ${esc(fmtDuration(p.min))} is about right
        ${priceText(p) ? `<span class="dot">·</span> ${esc(priceText(p))}` : ""}</p>
      ${p.blurb ? `<p class="detail-blurb">${esc(p.blurb)}</p>` : ""}
      ${p.best ? `<p><strong>Best time.</strong> ${esc(p.best)}</p>` : ""}
      ${p.tip ? `<p class="detail-tip"><strong>Worth knowing.</strong> ${esc(p.tip)}</p>` : ""}
      ${p.tags && p.tags.length ? `<p class="tag-row">${tagList(p.tags)}</p>` : ""}
      ${week ? `<h3>Opening hours</h3><dl class="week-hours">${week}</dl>` : ""}
      ${visited ? `<p class="panel-note">Visited ${esc(fmtDayLabel(visited.date))}${visited.note ? ` — ${esc(visited.note)}` : ""}</p>` : ""}
      ${osm ? `<p><a href="${esc(osm)}" target="_blank" rel="noopener">Open on OpenStreetMap ↗</a></p>` : ""}
      ${p.custom ? `<p class="panel-note">One of your own pins.</p>` : ""}
    `, `
      <button class="btn btn-ghost" data-act="save" data-id="${esc(id)}">${saved ? "★ Saved" : "☆ Save"}</button>
      <button class="btn btn-ghost" data-act="visited" data-id="${esc(id)}">${visited ? "✓ Been" : "Mark as been"}</button>
      ${p.custom ? `<button class="btn btn-ghost" data-act="edit-place" data-id="${esc(id)}">Edit</button>` : ""}
      <button class="btn btn-primary" data-act="add-to-day" data-id="${esc(id)}">Add to day</button>
    `, { wide: true });
  }

  // ---------------------------------------------------------------
  // Chrome
  // ---------------------------------------------------------------
  function renderTabs() {
    $$(".nav-tab").forEach((t) => {
      const on = t.dataset.view === state.view;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-current", on ? "page" : "false");
    });
    const search = $("#searchInput");
    if (search) {
      search.placeholder = state.view === "phrases" ? "Search phrases…" : "Search places…";
    }
  }

  function render() {
    const host = $("#view");
    if (!host) return;
    let html = "";
    switch (state.view) {
      case "trip": html = viewTrip(); break;
      case "phrases": html = viewPhrases(); break;
      case "practical": html = viewPractical(); break;
      case "settings": html = viewSettings(); break;
      default: html = viewExplore();
    }
    host.innerHTML = html;
    renderTabs();
  }

  RG.ui = {
    state, render, flash, openModal, closeModal, openDetail,
    dayContext, catChip, priceText, currentCity,
  };
})(window.RG);
