/* ================================================
   ERRANDS — app.js
   The page: a grocery price board across the stores near home, and the
   Tesla chargers around the same address.

   The whole view is rebuilt from state on every change — it's small
   enough that this is simpler than patching it. Price cells commit on
   change rather than on each keystroke, and focus is put back after the
   rebuild, so tabbing along a row of prices works the way it should.
   ================================================ */
(function (ER) {
  "use strict";
  const { h, fmtMiles, fmtMoney, parsePrice, daysSince, KM_PER_MI } = ER.util;
  const P = ER.places, S = ER.store, B = ER.basket;

  const ui = {
    storesBusy: false, storesMsg: "",
    chargersBusy: false, chargersMsg: "",
    geoBusy: false, geoMsg: "",
    editingHome: false,
    pasteStore: "",
    allStores: false,
    confirmReset: false,
  };

  const view = document.getElementById("view");

  /* ---- rendering plumbing -------------------------------------------- */

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      const focusKey = ui.nextFocus || (document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.focus : null);
      ui.nextFocus = null;
      const s = S.get();
      document.querySelectorAll(".nav-tab").forEach((b) =>
        b.classList.toggle("is-on", b.dataset.view === s.tab));
      const page = s.tab === "charging" ? chargingView(s)
        : s.tab === "settings" ? settingsView(s) : groceriesView(s);
      view.replaceChildren(homeBar(s), page);
      afterRender(s);
      if (focusKey) {
        const el = view.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
        if (el) { el.focus({ preventScroll: true }); if (el.select) el.select(); }
      }
    }, 0);
  }

  let afterRender = () => {};

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2600);
  }

  const ago = (iso) => {
    if (!iso) return "never";
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs} h ago`;
    return `${Math.round(hrs / 24)} days ago`;
  };

  const ext = (href, label, cls) =>
    h("a", { href, target: "_blank", rel: "noopener noreferrer", class: cls || "" }, label);

  /* ---- home ----------------------------------------------------------- */

  function homeBar(s) {
    if (ui.editingHome) {
      const input = h("input", { type: "text", value: s.home.label, "aria-label": "Home address",
        class: "grow", "data-focus": "home-input" });
      const go = async (e) => {
        e.preventDefault();
        const label = input.value.trim();
        if (label) await setHomeFromAddress(label);
      };
      return h("form", { class: "home-bar card", onsubmit: go },
        h("span", { class: "home-ico", "aria-hidden": "true" }, "⌂"),
        input,
        h("button", { class: "btn primary", type: "submit", disabled: ui.geoBusy }, ui.geoBusy ? "Finding…" : "Set home"),
        h("button", { class: "btn", type: "button", onclick: () => { ui.editingHome = false; render(); } }, "Cancel"),
        ui.geoMsg ? h("p", { class: "small warn full" }, ui.geoMsg) : null);
    }
    return h("div", { class: "home-bar card" },
      h("span", { class: "home-ico", "aria-hidden": "true" }, "⌂"),
      h("div", { class: "grow" },
        h("div", { class: "home-label" }, s.home.label),
        h("div", { class: "small muted" },
          s.home.exact ? "Distances are measured from here." : "Approximate position — it's refined once the app is online.")),
      h("button", { class: "btn", onclick: () => { ui.editingHome = true; ui.geoMsg = ""; render(); } }, "Change"),
      h("button", { class: "btn", onclick: useMyLocation, title: "Use this device's location" }, "◎ Here"),
      ui.geoMsg ? h("p", { class: "small warn full" }, ui.geoMsg) : null);
  }

  async function setHomeFromAddress(label) {
    ui.geoBusy = true; ui.geoMsg = ""; render();
    try {
      const hit = await P.geocode(label);
      if (!hit) { ui.geoMsg = "No match for that address. Try adding the city and state."; return; }
      applyHome(hit);
      ui.editingHome = false;
    } catch (e) {
      ui.geoMsg = "Couldn't reach the address lookup (OpenStreetMap Nominatim). Check the connection and try again.";
    } finally {
      ui.geoBusy = false; render();
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { ui.geoMsg = "This browser doesn't offer location."; render(); return; }
    if (!window.isSecureContext) {
      ui.geoMsg = "Browsers only share location with https:// or localhost pages. Serve the folder (python3 -m http.server) and open it from localhost.";
      render(); return;
    }
    ui.geoMsg = "Asking for your location…"; render();
    navigator.geolocation.getCurrentPosition(
      (p) => { ui.geoMsg = ""; applyHome({ label: `Current location (${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)})`,
        lat: p.coords.latitude, lon: p.coords.longitude, exact: true }); },
      (err) => { ui.geoMsg = err.code === 1 ? "Location permission was refused." : "Couldn't get a location fix."; render(); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }

  function applyHome(home) {
    const s = S.get();
    const moved = ER.util.distanceKm(s.home, home) > 0.3;
    s.home = home;
    s.stores.list = P.withDistance(s.stores.list, home);
    s.chargers.list = P.withDistance(s.chargers.list, home);
    S.save();
    ER.map.refit();
    render();
    if (moved) { refreshStores(); refreshChargers(); }
  }

  /* ---- live lookups --------------------------------------------------- */

  async function refreshStores() {
    const s = S.get();
    ui.storesBusy = true; ui.storesMsg = ""; render();
    try {
      const list = await P.liveStores(s.home, s.settings.storeRadiusMi * KM_PER_MI * 1000, s.settings.cornerStores);
      if (!list.length) {
        ui.storesMsg = "OpenStreetMap has no grocery stores mapped in that radius. Try a wider one.";
      } else {
        S.setStores(list, "live");
      }
    } catch (e) {
      ui.storesMsg = s.stores.source === "seed"
        ? "Couldn't reach OpenStreetMap, so this is the built-in list for downtown Baltimore."
        : `Couldn't reach OpenStreetMap — showing the list from ${ago(s.stores.fetchedAt)}.`;
    } finally {
      ui.storesBusy = false; render();
    }
  }

  async function refreshChargers() {
    const s = S.get();
    ui.chargersBusy = true; ui.chargersMsg = ""; render();
    try {
      const { list, sources } = await P.liveChargers(s.home, s.settings.chargerRadiusMi * KM_PER_MI * 1000, s.settings.nrelKey);
      S.setChargers(list, "live", sources);
    } catch (e) {
      ui.chargersMsg = s.chargers.source === "seed"
        ? "Couldn't reach OpenStreetMap or the DOE station locator, so this is the built-in list of Baltimore Superchargers."
        : `Couldn't reach either source — showing the list from ${ago(s.chargers.fetchedAt)}.`;
    } finally {
      ui.chargersBusy = false; render();
    }
  }

  const WEEK = 7 * 86400000;
  const stale = (iso) => !iso || Date.now() - Date.parse(iso) > WEEK;

  /* ---- groceries ------------------------------------------------------ */

  function storeShort(st) {
    return st.brand && st.name.toLowerCase().includes(st.brand.toLowerCase()) ? st.brand : st.name;
  }

  function groceriesView(s) {
    const stores = s.compare.map(S.storeById).filter(Boolean);
    const ids = stores.map((x) => x.id);
    const result = B.compare(s.items, ids, s.prices);

    afterRender = () => {
      const picked = new Set(ids);
      const points = S.allStores().map((st) => ({
        lat: st.lat, lon: st.lon, label: st.name, sub: [st.address, fmtMiles(st.km)].filter(Boolean).join(" · "),
        tone: picked.has(st.id) ? "pick" : "other",
        n: picked.has(st.id) ? ids.indexOf(st.id) + 1 : null,
      }));
      // Re-frame when the comparison or the store list changes, not on
      // every price typed.
      ER.map.show(view.querySelector("#mapHost"), s.home, points,
        `groceries:${ids.join(",")}:${s.stores.fetchedAt}`);
    };

    return h("div", { class: "stack" },
      verdictCard(s, stores, result),
      priceBoard(s, stores, result),
      h("div", { class: "two-col" },
        addItemCard(s),
        pasteCard(s, stores)),
      h("section", { class: "card" },
        h("div", { class: "card-head" },
          h("h2", {}, "Map"),
          h("span", { class: "small muted" }, "Numbered pins are the stores you're comparing.")),
        h("div", { id: "mapHost", class: "map-host" })),
      storesCard(s));
  }

  function verdictCard(s, stores, r) {
    const name = (id) => { const st = S.storeById(id); return st ? storeShort(st) : "?"; };
    const kids = [];
    if (stores.length < 2) {
      kids.push(h("p", {}, "Pick two or more stores below to compare them."));
    } else if (!r.verdict) {
      const priced = Object.values(r.perStore).reduce((n, x) => n + x.priced, 0);
      kids.push(h("p", {}, priced
        ? "Not enough overlap yet. Record the same item at two or more stores to see which is cheaper."
        : "Type in prices as you see them — on the shelf, a receipt, a weekly ad or the store's site (the 🔍 in each cell opens that store's search). The app works out the rest."));
    } else {
      const v = r.verdict;
      const st = S.storeById(v.best);
      kids.push(h("div", { class: "verdict-main" },
        h("span", { class: "badge good" }, "✓ Cheapest"),
        h("strong", { class: "verdict-store" }, name(v.best)),
        h("span", { class: "verdict-total" }, fmtMoney(v.bestTotal)),
        st && st.km != null ? h("span", { class: "muted small" }, fmtMiles(st.km) + " from home") : null));
      kids.push(h("p", { class: "small" }, v.basis === "all"
        ? `For your whole list of ${s.items.length} item${s.items.length === 1 ? "" : "s"}.`
          + (v.vsWorst > 0.005 ? ` ${fmtMoney(v.vsWorst)} less than ${name(v.worst)}.` : "")
        : `Compared on the ${v.commonCount} item${v.commonCount === 1 ? "" : "s"} priced at all ${v.storeCount} stores you've checked. Fill in the rest for a whole-list answer.`
          + (v.vsWorst > 0.005 ? ` ${fmtMoney(v.vsWorst)} less than ${name(v.worst)} on those.` : "")));
      if (v.split) {
        kids.push(h("p", { class: "small split" },
          h("strong", {}, `Split it across ${v.split.stores.length} stores: ${fmtMoney(v.split.total)}`),
          ` — saves ${fmtMoney(v.split.saves)} for ${v.split.stores.length - 1} extra stop${v.split.stores.length > 2 ? "s" : ""} (`,
          v.split.stores.map(name).join(", "), "). Each item's cheapest store is marked ✓ in the table."));
      }
      const incomplete = stores.filter((x) => r.perStore[x.id].priced < s.items.length);
      if (incomplete.length && v.basis === "all") {
        kids.push(h("p", { class: "small muted" },
          `Left out of the total: ${incomplete.map(storeShort).join(", ")} — some items have no price there yet.`));
      }
    }
    return h("section", { class: "card verdict" }, h("h2", {}, "Best basket"), kids);
  }

  function priceBoard(s, stores, r) {
    if (!s.items.length) {
      return h("section", { class: "card" }, h("h2", {}, "Prices"),
        h("p", { class: "muted" }, "Your list is empty — add an item below."));
    }
    if (!stores.length) {
      return h("section", { class: "card" }, h("h2", {}, "Prices"),
        h("p", { class: "muted" }, "Tick some stores in “Stores near home” to compare them here."));
    }

    const head = h("tr", {},
      h("th", { class: "item-col", scope: "col" }, "Item"),
      stores.map((st, i) => h("th", { scope: "col" },
        h("div", { class: "store-th" },
          h("span", { class: "pin-dot", "aria-hidden": "true" }, String(i + 1)),
          h("span", {}, storeShort(st))),
        h("div", { class: "small muted" }, st.km != null ? fmtMiles(st.km) : "your store"))),
      h("th", { scope: "col", class: "small" }, ""));

    const rows = s.items.map((item) => {
      const row = r.perItem[item.id];
      return h("tr", {},
        h("th", { scope: "row", class: "item-col" },
          h("div", { class: "item-name" }, item.name),
          item.qty !== 1 ? h("div", { class: "small muted" }, `× ${item.qty}`) : null,
          row.spread > 0.005 ? h("div", { class: "small muted" }, `spread ${fmtMoney(row.spread)}`) : null),
        stores.map((st) => priceCell(s, st, item, row, r)),
        h("td", { class: "row-tools" },
          ext(P.instacartLink(item.name), "Instacart", "small"),
          h("button", { class: "icon-btn small", title: `Remove ${item.name}`, "aria-label": `Remove ${item.name}`,
            onclick: () => { S.removeItem(item.id); render(); } }, "✕")));
    });

    const foot = h("tr", { class: "totals" },
      h("th", { scope: "row", class: "item-col" }, "Total"),
      stores.map((st) => {
        const t = r.perStore[st.id];
        const complete = t.priced === s.items.length;
        // Totals over different items aren't comparable, so "cheapest"
        // here follows the verdict's basis rather than the bigger number.
        const best = r.verdict && r.verdict.best === st.id;
        const common = r.verdict && r.verdict.basis === "common";
        return h("td", { class: best ? "is-best" : "" },
          h("div", { class: "total" }, t.priced ? fmtMoney(t.total) : "—"),
          h("div", { class: "small muted" }, complete ? "all items" : `${t.priced} of ${s.items.length} priced`),
          common && r.active.includes(st.id) ? h("div", { class: "small" }, `${fmtMoney(t.commonTotal)} on the ${r.common.length} shared`) : null,
          best ? h("div", { class: "badge good small" }, common ? "✓ cheapest on shared" : "✓ cheapest") : null);
      }),
      h("td", {}));

    return h("section", { class: "card" },
      h("div", { class: "card-head" },
        h("h2", {}, "Prices"),
        h("span", { class: "small muted" }, "Prices are per item as listed. Blank means not checked yet.")),
      h("div", { class: "table-scroll" },
        h("table", { class: "board" }, h("thead", {}, head), h("tbody", {}, rows), h("tfoot", {}, foot))));
  }

  function priceCell(s, st, item, row, r) {
    const cell = B.priceAt(s.prices, st.id, item.id);
    const lowest = cell && row.priced > 1 && row.cheapest.includes(st.id);
    const pick = r.split.picks[item.id] === st.id && r.verdict && r.verdict.split;
    const age = cell ? daysSince(cell.date) : null;
    const input = h("input", {
      type: "text", inputmode: "decimal", autocomplete: "off",
      value: cell ? cell.price.toFixed(2) : "",
      placeholder: "$",
      "aria-label": `${item.name} at ${st.name}`,
      "data-focus": `p:${st.id}:${item.id}`,
      onchange: (e) => {
        const raw = e.target.value.trim();
        const price = parsePrice(raw);
        if (raw && price == null) { toast("That doesn't look like a price — try 3.49"); e.target.value = cell ? cell.price.toFixed(2) : ""; return; }
        S.setPrice(st.id, item.id, price);
        render();
      },
      // Enter goes down the column, like a spreadsheet: one store's
      // receipt is usually typed in one go.
      onkeydown: (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const items = S.get().items;
        const next = items[items.findIndex((i) => i.id === item.id) + 1];
        ui.nextFocus = next ? `p:${st.id}:${next.id}` : null;
        e.target.blur();
        if (!e.target.dataset.changed) render();
      },
      oninput: (e) => { e.target.dataset.changed = "1"; },
    });
    return h("td", { class: lowest ? "is-low" : "" },
      h("div", { class: "cell" },
        input,
        h("a", { href: P.searchLink(st, item.name), target: "_blank", rel: "noopener noreferrer", class: "lookup",
          title: `Search ${st.name} for ${item.name}`, "aria-label": `Search ${st.name} for ${item.name}`,
          "data-focus": `l:${st.id}:${item.id}` }, "🔍")),
      h("div", { class: "cell-meta small" },
        lowest ? h("span", { class: "badge good" }, pick ? "✓ buy here" : "✓ lowest") : null,
        age != null && age > B.STALE_DAYS ? h("span", { class: "badge warn" }, `⚠ ${age}d old`) : null,
        age != null && age <= B.STALE_DAYS && !lowest ? h("span", { class: "muted" }, age === 0 ? "today" : `${age}d ago`) : null));
  }

  function addItemCard(s) {
    const name = h("input", { type: "text", placeholder: "e.g. Butter, 1 lb", "aria-label": "Item", class: "grow", required: true });
    const qty = h("input", { type: "number", min: "1", step: "1", value: "1", "aria-label": "Quantity", class: "qty" });
    return h("section", { class: "card" },
      h("h2", {}, "Add to the list"),
      h("form", { class: "row", onsubmit: (e) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        S.addItem(name.value, qty.value);
        render();
      } }, name, qty, h("button", { class: "btn primary", type: "submit" }, "Add")),
      h("p", { class: "small muted" }, "Put the size in the name (“Eggs, dozen large”) so every store is priced on the same thing. Quantity multiplies into the totals."));
  }

  function pasteCard(s, stores) {
    if (!stores.length) return h("section", { class: "card" }, h("h2", {}, "Paste prices"),
      h("p", { class: "muted small" }, "Pick a store to compare first."));
    if (!stores.some((x) => x.id === ui.pasteStore)) ui.pasteStore = stores[0].id;
    const sel = h("select", { "aria-label": "Store", onchange: (e) => { ui.pasteStore = e.target.value; } },
      stores.map((st) => h("option", { value: st.id, selected: st.id === ui.pasteStore }, st.name)));
    const ta = h("textarea", { rows: 4, placeholder: "Milk, 1 gal 3.49\nEggs, dozen large 4.19\nAvocados 1.25" , "aria-label": "Prices, one per line" });
    return h("section", { class: "card" },
      h("h2", {}, "Paste prices"),
      h("p", { class: "small muted" }, "From a receipt or a store's site: one item per line, price last. New names are added to the list."),
      h("form", { class: "stack-sm", onsubmit: (e) => {
        e.preventDefault();
        const { rows, skipped } = B.parsePasted(ta.value);
        const st = S.get();
        let added = 0;
        for (const r of rows) {
          let item = st.items.find((i) => B.normName(i.name) === B.normName(r.name));
          if (!item) { item = S.addItem(r.name, 1); added++; }
          S.setPrice(ui.pasteStore, item.id, r.price);
        }
        toast(`${rows.length} price${rows.length === 1 ? "" : "s"} recorded` + (added ? `, ${added} new item${added === 1 ? "" : "s"}` : "")
          + (skipped.length ? ` · skipped ${skipped.length} line${skipped.length === 1 ? "" : "s"} with no price` : ""));
        render();
      } }, sel, ta, h("button", { class: "btn primary", type: "submit" }, "Record prices")));
  }

  function storesCard(s) {
    const picked = new Set(s.compare);
    const all = S.allStores().slice().sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
    const radius = h("select", { "aria-label": "Search radius", onchange: (e) => {
      s.settings.storeRadiusMi = Number(e.target.value); S.save(); refreshStores();
    } }, [0.5, 1, 2, 3, 5, 10].map((mi) => h("option", { value: mi, selected: s.settings.storeRadiusMi === mi }, `${mi} mi`)));
    const corner = h("label", { class: "check small" },
      h("input", { type: "checkbox", checked: s.settings.cornerStores, onchange: (e) => {
        s.settings.cornerStores = e.target.checked; S.save(); refreshStores();
      } }), " Include corner & convenience stores");

    const status = ui.storesBusy ? "Looking up stores on OpenStreetMap…"
      : ui.storesMsg || (s.stores.source === "seed" ? "Built-in list for downtown Baltimore."
        : `From OpenStreetMap, ${ago(s.stores.fetchedAt)} · ${s.stores.list.length} found.`);

    // A 10-mile radius in a city is hundreds of shops. The nearest few
    // dozen, plus anything you're comparing, is what's worth scrolling.
    const LIMIT = 30;
    const visible = ui.allStores ? all : all.filter((st, i) => i < LIMIT || picked.has(st.id));
    const list = h("ul", { class: "place-list" }, visible.map((st) => {
      const dir = st.lat != null ? P.directionsLinks(s.home, st) : null;
      return h("li", { class: "place" + (picked.has(st.id) ? " is-picked" : "") },
        h("label", { class: "check" },
          h("input", { type: "checkbox", checked: picked.has(st.id), onchange: (e) => {
            const c = S.get().compare;
            if (e.target.checked) { if (!c.includes(st.id)) c.push(st.id); }
            else S.get().compare = c.filter((x) => x !== st.id);
            S.save(); render();
          } }),
          h("span", { class: "place-name" }, st.name)),
        h("div", { class: "place-meta small muted" },
          [st.km != null ? fmtMiles(st.km) : null, st.address, kindLabel(st.kind), st.hours].filter(Boolean).join(" · ")),
        h("div", { class: "place-links small" },
          dir ? ext(dir.google, "Directions") : null,
          dir ? ext(dir.apple, "Apple Maps") : null,
          st.website && /^https?:\/\//i.test(st.website) ? ext(st.website, "Website") : null,
          st.kind === "custom" ? h("button", { class: "linkish", onclick: () => { S.removeCustomStore(st.id); render(); } }, "Remove") : null));
    }));

    const cname = h("input", { type: "text", placeholder: "Store name", "aria-label": "Store name", class: "grow", required: true });
    const caddr = h("input", { type: "text", placeholder: "Where (optional)", "aria-label": "Store address", class: "grow" });

    return h("section", { class: "card" },
      h("div", { class: "card-head" },
        h("h2", {}, "Stores near home"),
        h("div", { class: "row" }, radius,
          h("button", { class: "btn", onclick: refreshStores, disabled: ui.storesBusy }, ui.storesBusy ? "Looking…" : "↻ Refresh"))),
      corner,
      h("p", { class: "small " + (ui.storesMsg ? "warn" : "muted") }, status),
      h("p", { class: "small muted" }, "Tick the ones to compare. Your prices stay attached to each store even when you untick it."),
      list,
      all.length > visible.length || ui.allStores
        ? h("button", { class: "linkish small", onclick: () => { ui.allStores = !ui.allStores; render(); } },
          ui.allStores ? "Show fewer" : `Show all ${all.length}`)
        : null,
      h("form", { class: "row add-store", onsubmit: (e) => {
        e.preventDefault();
        if (!cname.value.trim()) return;
        S.addCustomStore(cname.value, caddr.value);
        render();
      } }, cname, caddr, h("button", { class: "btn", type: "submit" }, "Add a store")));
  }

  function kindLabel(k) {
    return { supermarket: "supermarket", grocery: "grocery", greengrocer: "produce", wholesale: "wholesale club",
      marketplace: "market hall", department_store: "has groceries", convenience: "convenience", custom: "added by you" }[k] || "";
  }

  /* ---- charging ------------------------------------------------------- */

  const KIND = {
    supercharger: { label: "Supercharger", tone: "sc", icon: "⚡" },
    destination: { label: "Destination charger", tone: "dest", icon: "🔌" },
    tesla: { label: "Tesla charger", tone: "dest", icon: "🔌" },
    fast: { label: "DC fast (non-Tesla)", tone: "other", icon: "⚡" },
    level2: { label: "Level 2 (non-Tesla)", tone: "other", icon: "🔌" },
  };

  function chargersShown(s) {
    const maxKm = s.settings.chargerRadiusMi * KM_PER_MI;
    return s.chargers.list.filter((c) => {
      if (c.km != null && c.km > maxKm) return false;
      if (s.settings.teslaOnly && !c.tesla) return false;
      if (s.settings.chargerKind === "supercharger" && c.kind !== "supercharger") return false;
      if (s.settings.chargerKind === "destination" && !["destination", "tesla"].includes(c.kind)) return false;
      return true;
    });
  }

  function chargingView(s) {
    const shown = chargersShown(s);
    afterRender = () => {
      const points = shown.map((c, i) => ({
        lat: c.lat, lon: c.lon, label: c.name,
        sub: [KIND[c.kind].label, c.stalls ? `${c.stalls} stalls` : null, c.kw ? `${c.kw} kW` : null, fmtMiles(c.km)].filter(Boolean).join(" · "),
        tone: KIND[c.kind].tone, n: i + 1,
      }));
      ER.map.show(view.querySelector("#mapHost"), s.home, points,
        `charging:${s.settings.chargerRadiusMi}:${s.settings.chargerKind}:${s.settings.teslaOnly}:${s.chargers.fetchedAt}`);
    };

    const set = (k, v) => { s.settings[k] = v; S.save(); render(); };
    const radius = h("select", { "aria-label": "Radius", onchange: (e) => {
      const mi = Number(e.target.value);
      const wider = mi > s.settings.chargerRadiusMi;
      set("chargerRadiusMi", mi);
      if (wider || s.chargers.source !== "live") refreshChargers();
    } }, [3, 5, 10, 25, 50].map((mi) => h("option", { value: mi, selected: s.settings.chargerRadiusMi === mi }, `within ${mi} mi`)));
    const kind = h("select", { "aria-label": "Charger type", onchange: (e) => set("chargerKind", e.target.value) },
      [["all", "All Tesla chargers"], ["supercharger", "Superchargers only"], ["destination", "Destination chargers only"]]
        .map(([v, l]) => h("option", { value: v, selected: s.settings.chargerKind === v }, l)));
    const tesla = h("label", { class: "check small" },
      h("input", { type: "checkbox", checked: !s.settings.teslaOnly, onchange: (e) => set("teslaOnly", !e.target.checked) }),
      " Also show other networks (usable with an adapter)");

    const nearestSC = shown.find((c) => c.kind === "supercharger");
    const src = s.chargers.sources || {};
    const status = ui.chargersBusy ? "Asking OpenStreetMap and the DOE station locator…"
      : ui.chargersMsg || (s.chargers.source === "seed" ? "Built-in list of Baltimore Superchargers."
        : `Updated ${ago(s.chargers.fetchedAt)} · OpenStreetMap ${src.osm === "ok" ? "✓" : "✕"} · DOE locator ${src.doe === "ok" ? "✓" : "✕"}`
          + (src.doe && src.doe !== "ok" ? (s.settings.nrelKey ? "" : " (the shared DEMO_KEY may be used up — add a free key in Settings)") : ""));

    return h("div", { class: "stack" },
      h("section", { class: "card verdict" },
        h("h2", {}, "Nearest Supercharger"),
        nearestSC
          ? h("div", {},
            h("div", { class: "verdict-main" },
              h("span", { class: "badge sc" }, "⚡ Supercharger"),
              h("strong", { class: "verdict-store" }, nearestSC.name),
              h("span", { class: "verdict-total" }, fmtMiles(nearestSC.km))),
            h("p", { class: "small" }, [nearestSC.address, nearestSC.stalls ? `${nearestSC.stalls} stalls` : null,
              nearestSC.kw ? `up to ${nearestSC.kw} kW` : null, nearestSC.hours].filter(Boolean).join(" · ")),
            h("div", { class: "row" },
              ext(P.directionsLinks(s.home, nearestSC).google, "Directions (Google)", "btn primary"),
              ext(P.directionsLinks(s.home, nearestSC).apple, "Apple Maps", "btn")))
          : h("p", {}, "None in this radius. Try a wider one.")),
      h("section", { class: "card" },
        h("div", { class: "card-head" },
          h("h2", {}, "Tesla charging near home"),
          h("div", { class: "row" }, radius, kind,
            h("button", { class: "btn", onclick: refreshChargers, disabled: ui.chargersBusy }, ui.chargersBusy ? "Looking…" : "↻ Refresh"))),
        tesla,
        h("p", { class: "small " + (ui.chargersMsg ? "warn" : "muted") }, status),
        h("div", { id: "mapHost", class: "map-host" }),
        shown.length ? h("ol", { class: "place-list numbered" }, shown.map((c) => chargerItem(s, c)))
          : h("p", { class: "muted" }, "Nothing matches these filters."),
        h("p", { class: "small muted" },
          "Live stall availability and pricing are only in the Tesla app and on ",
          ext("https://www.tesla.com/findus?filters=supercharger", "tesla.com/findus"),
          ". Check there before a tight trip — a listed site can be under repair.")));
  }

  function chargerItem(s, c) {
    const k = KIND[c.kind];
    const dir = P.directionsLinks(s.home, c);
    return h("li", { class: "place" },
      h("div", { class: "place-name" }, c.name),
      h("div", { class: "place-tags" },
        h("span", { class: "badge " + k.tone }, `${k.icon} ${k.label}`),
        c.stalls ? h("span", { class: "badge plain" }, `${c.stalls} stall${c.stalls === 1 ? "" : "s"}`) : null,
        c.kw ? h("span", { class: "badge plain" }, `${c.kw} kW`) : null,
        c.access ? h("span", { class: "badge warn" }, `⚠ ${c.access === "customers" ? "customers only" : c.access}`) : null),
      h("div", { class: "place-meta small muted" },
        [fmtMiles(c.km), c.address, c.hours, c.network && !c.tesla ? c.network : null].filter(Boolean).join(" · ")),
      c.note ? h("div", { class: "small muted" }, c.note) : null,
      h("div", { class: "place-links small" },
        ext(dir.google, "Directions"), ext(dir.apple, "Apple Maps"),
        h("span", { class: "muted" }, `· ${c.source}`)));
  }

  /* ---- settings ------------------------------------------------------- */

  function settingsView(s) {
    afterRender = () => {};
    const key = h("input", { type: "text", value: s.settings.nrelKey, placeholder: "DEMO_KEY", "aria-label": "NREL API key",
      class: "grow", autocomplete: "off", spellcheck: false });
    const file = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { S.importJSON(await f.text()); toast("Backup restored."); }
      catch (err) { toast(err.message || "Couldn't read that file."); }
      render();
    } });
    return h("div", { class: "stack" },
      h("section", { class: "card" },
        h("h2", {}, "Charger data key"),
        h("p", { class: "small" }, "The US Department of Energy's station locator lists every Tesla Supercharger and Destination charger. It's free, but asks for a key. Without one the app uses the shared DEMO_KEY, which runs out after a few lookups an hour. ",
          ext("https://developer.nrel.gov/signup/", "Get a free key"), " (an email address, no card) and paste it here."),
        h("form", { class: "row", onsubmit: (e) => {
          e.preventDefault(); s.settings.nrelKey = key.value.trim(); S.save(); toast("Saved."); refreshChargers();
        } }, key, h("button", { class: "btn primary", type: "submit" }, "Save")),
        h("p", { class: "small muted" }, "The key stays in this browser. It's sent only to developer.nrel.gov.")),
      h("section", { class: "card" },
        h("h2", {}, "Your data"),
        h("p", { class: "small" }, "Your list and prices live in this browser only. Save a backup to move them to another device."),
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: () => ER.util.downloadFile(`errands-${ER.util.today()}.json`, S.exportJSON()) }, "Download backup"),
          h("button", { class: "btn", onclick: () => file.click() }, "Restore backup"), file,
          // Asked on the page, not with confirm(): some embedded viewers
          // answer confirm() with "no" without ever showing it.
          ui.confirmReset
            ? h("span", { class: "row" },
              h("button", { class: "btn danger", onclick: () => {
                ui.confirmReset = false; S.reset(); render(); refreshStores(); refreshChargers();
              } }, "Yes, clear everything"),
              h("button", { class: "btn", onclick: () => { ui.confirmReset = false; render(); } }, "Keep my data"))
            : h("button", { class: "btn danger", onclick: () => { ui.confirmReset = true; render(); } }, "Start over")),
        ui.confirmReset ? h("p", { class: "small warn" }, "This clears your list, every price and your home address. It can't be undone.") : null),
      h("section", { class: "card" },
        h("h2", {}, "Where the data comes from"),
        h("ul", { class: "small plain-list" },
          h("li", {}, h("strong", {}, "Stores and chargers: "), "OpenStreetMap via the Overpass API, and the DOE Alternative Fuels Data Center for chargers."),
          h("li", {}, h("strong", {}, "Addresses: "), "OpenStreetMap's Nominatim geocoder, only when you change home."),
          h("li", {}, h("strong", {}, "Prices: "), "you. No free service publishes shelf prices for every store, so the app keeps the ones you record and links each cell to that store's own search."))));
  }

  /* ---- start ---------------------------------------------------------- */

  document.querySelectorAll(".nav-tab").forEach((b) => b.addEventListener("click", () => {
    S.get().tab = b.dataset.view; S.save(); render();
  }));

  async function start() {
    const s = S.load();
    render();
    // Refine the default address once, then look things up from there.
    if (!s.home.exact) {
      try {
        const hit = await P.geocode(s.home.label);
        if (hit) { s.home = hit; s.stores.list = P.withDistance(s.stores.list, hit);
          s.chargers.list = P.withDistance(s.chargers.list, hit); S.save(); render(); }
      } catch (e) { /* offline: the approximate point still works */ }
    }
    if (s.stores.source !== "live" || stale(s.stores.fetchedAt)) refreshStores();
    if (s.chargers.source !== "live" || stale(s.chargers.fetchedAt)) refreshChargers();
  }

  start();
})(window.ER);
