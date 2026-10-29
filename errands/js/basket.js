/* ================================================
   ERRANDS — basket.js
   The comparison itself: given a shopping list and the prices you've
   recorded at each store, which store is cheapest for the whole list,
   and what would splitting the list across stores save?

   Pure functions over plain data, so selftest.mjs can check the sums.

     items:  [{ id, name, qty }]
     prices: { [storeId]: { [itemId]: { price, date } } }

   A missing price is "unknown", never zero. A store with half the list
   priced isn't cheaper than one with all of it, it's just less known —
   so whole-list totals only compare stores that have every item, and
   failing that, only the items every store has a price for.
   ================================================ */
(function (ER) {
  "use strict";

  const STALE_DAYS = 30;
  const CENT = 0.005;   // ties within half a cent are ties

  function priceAt(prices, storeId, itemId) {
    const cell = prices && prices[storeId] && prices[storeId][itemId];
    return cell && Number.isFinite(cell.price) ? cell : null;
  }

  const qtyOf = (item) => (Number(item.qty) > 0 ? Number(item.qty) : 1);

  function compare(items, storeIds, prices, now) {
    const perItem = {};
    const perStore = {};
    for (const sid of storeIds) {
      perStore[sid] = { total: 0, priced: 0, missing: [], stale: 0, commonTotal: 0 };
    }

    for (const item of items) {
      const row = { min: null, max: null, cheapest: [], priced: 0 };
      for (const sid of storeIds) {
        const cell = priceAt(prices, sid, item.id);
        const st = perStore[sid];
        if (!cell) { st.missing.push(item.name); continue; }
        const line = cell.price * qtyOf(item);
        st.total += line;
        st.priced++;
        const age = ER.util.daysSince(cell.date, now);
        if (age != null && age > STALE_DAYS) st.stale++;
        row.priced++;
        if (row.min == null || cell.price < row.min - CENT) { row.min = cell.price; row.cheapest = [sid]; }
        else if (Math.abs(cell.price - row.min) <= CENT) row.cheapest.push(sid);
        if (row.max == null || cell.price > row.max) row.max = cell.price;
      }
      row.spread = row.min != null && row.priced > 1 ? (row.max - row.min) * qtyOf(item) : 0;
      perItem[item.id] = row;
    }

    // Items with a price at every compared store: the only fair subset
    // when no store has the whole list.
    const common = storeIds.length
      ? items.filter((it) => perItem[it.id].priced === storeIds.length) : [];
    for (const sid of storeIds) {
      perStore[sid].commonTotal = common.reduce(
        (sum, it) => sum + priceAt(prices, sid, it.id).price * qtyOf(it), 0);
    }

    const complete = storeIds
      .filter((sid) => items.length && perStore[sid].priced === items.length)
      .sort((a, b) => perStore[a].total - perStore[b].total);

    // Cheapest store for each item. On a tie the earlier store in the
    // list wins — the caller orders them nearest first, so a tie costs no
    // extra walking.
    const picks = {};
    let splitTotal = 0;
    const uncovered = [];
    for (const item of items) {
      const row = perItem[item.id];
      if (!row.cheapest.length) { uncovered.push(item.name); continue; }
      const sid = storeIds.find((s) => row.cheapest.includes(s));
      picks[item.id] = sid;
      splitTotal += row.min * qtyOf(item);
    }
    const splitStores = storeIds.filter((sid) => Object.values(picks).includes(sid));

    let verdict = null;
    if (complete.length) {
      const best = complete[0];
      const bestTotal = perStore[best].total;
      const worst = complete[complete.length - 1];
      verdict = {
        basis: "all",
        best, bestTotal,
        vsWorst: perStore[worst].total - bestTotal,
        worst,
        split: !uncovered.length && splitStores.length > 1 && splitTotal < bestTotal - CENT
          ? { total: splitTotal, saves: bestTotal - splitTotal, stores: splitStores } : null,
      };
    } else if (common.length && storeIds.length > 1) {
      const ranked = storeIds.slice().sort((a, b) => perStore[a].commonTotal - perStore[b].commonTotal);
      verdict = {
        basis: "common",
        commonCount: common.length,
        best: ranked[0],
        bestTotal: perStore[ranked[0]].commonTotal,
        worst: ranked[ranked.length - 1],
        vsWorst: perStore[ranked[ranked.length - 1]].commonTotal - perStore[ranked[0]].commonTotal,
        split: null,
      };
    }

    return {
      perItem, perStore, complete, common: common.map((i) => i.id),
      split: { total: splitTotal, picks, stores: splitStores, uncovered },
      verdict,
    };
  }

  /* "milk 3.49" / "Eggs, dozen — $4.19" / "bananas\t0.59": one item per
     line with the price last. Lines without a price are skipped and
     reported, rather than guessed at. */
  function parsePasted(text) {
    const rows = [], skipped = [];
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^(.*?)[\s,;:\t—–-]*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*$/.exec(line);
      const name = m && m[1].replace(/[\s,;:—–-]+$/, "").trim();
      const price = m && ER.util.parsePrice(m[2]);
      if (!name || price == null) { skipped.push(line); continue; }
      rows.push({ name, price });
    }
    return { rows, skipped };
  }

  /* Case- and punctuation-blind, so "Eggs (dozen)" finds "eggs dozen". */
  const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  ER.basket = { compare, parsePasted, normName, priceAt, STALE_DAYS };
})(window.ER);
