/* ================================================
   PRICE WATCH — scheduler.js
   The polling loop: decides what's due, checks it, records the reading,
   runs the rules, sends the notifications.

   Deliberately conservative about other people's servers: a small
   concurrency cap, jitter so watches don't all fire on the same second,
   and exponential backoff on a failing source.
   ================================================ */
(function (PT) {
  "use strict";
  const { MIN, HOUR, clamp } = PT.util;
  const store = PT.store;

  const TICK_MS = 20 * 1000;      // how often we look for due work
  const MAX_PARALLEL = 3;
  const MAX_BACKOFF = 6 * HOUR;

  let timer = null;
  let running = new Set();
  let hooks = { onUpdate: () => {}, onActivity: () => {} };

  function ctx() {
    const s = store.settings();
    return { proxyBase: (s.proxyBase || "").trim(), currency: s.currency || "USD" };
  }

  function isDue(w, now) {
    if (!w.active) return false;
    // Neither can be checked from a page: manual is typed in by hand, and a
    // browser can't start a local program. The unattended runner does both.
    if (w.provider === "manual" || w.provider === "command") return false;
    if (running.has(w.id)) return false;
    if (!w.nextCheck) return true;
    return w.nextCheck <= now;
  }

  /* Spread checks out a little so twenty hourly watches don't stampede. */
  function scheduleNext(w, failed) {
    const base = Math.max(1, w.intervalMin || 60) * MIN;
    let delay = base;
    if (failed) {
      const backoff = base * Math.pow(2, clamp(w.errorCount || 1, 1, 8));
      delay = Math.min(backoff, MAX_BACKOFF);
    }
    const jitter = delay * 0.1 * Math.random();
    store.updateWatch(w.id, { nextCheck: Date.now() + delay + jitter });
  }

  /* One check, end to end. `manualPrice` lets the UI feed in a hand-typed
     reading and get the same rules + notifications for free. */
  async function checkOne(watch, opts) {
    const w = store.get(watch.id);
    if (!w) return null;
    opts = opts || {};
    running.add(w.id);
    hooks.onActivity(w.id, true);

    try {
      let price, currency, meta;
      if (opts.manualPrice != null) {
        price = Number(opts.manualPrice);
        currency = w.currency;
        meta = { manual: true };
        if (!Number.isFinite(price) || price <= 0) throw new Error("Enter a positive number");
      } else {
        const r = await PT.providers.check(w, ctx());
        price = r.price; currency = r.currency; meta = r.meta;
      }

      // Adopt the source's currency the first time we learn it.
      if (currency && currency !== w.currency && (w.history || []).length === 0) {
        store.updateWatch(w.id, { currency });
      }

      store.addPoint(w.id, price, meta);
      const fresh = store.get(w.id);
      const s = PT.analytics.summarize(fresh);
      const v = PT.analytics.verdict(fresh, s);

      const fired = PT.alerts.evaluate(fresh, price, s, v);
      if (fired.length) {
        const stamps = Object.assign({}, fresh.lastAlertAt || {});
        fired.forEach((a) => { stamps[a.ruleType] = a.t; });
        store.updateWatch(w.id, { lastAlertAt: stamps });
        for (const a of fired) {
          store.pushAlert(a);
          PT.notify.dispatch(a, store.settings()).then((rep) => {
            if (rep && rep.quiet) console.info("Alert held back by quiet hours:", a.message);
          });
        }
      }

      scheduleNext(fresh, false);
      return { ok: true, price, alerts: fired };
    } catch (err) {
      store.recordError(w.id, err && err.message ? err.message : err);
      scheduleNext(store.get(w.id), true);
      return { ok: false, error: String(err && err.message ? err.message : err) };
    } finally {
      running.delete(w.id);
      hooks.onActivity(w.id, false);
      hooks.onUpdate();
    }
  }

  async function tick() {
    const now = Date.now();
    const due = store.all().filter((w) => isDue(w, now));
    if (!due.length) return;
    // Oldest-checked first, so nothing starves.
    due.sort((a, b) => (a.lastCheck || 0) - (b.lastCheck || 0));
    const slots = MAX_PARALLEL - running.size;
    if (slots <= 0) return;
    await Promise.all(due.slice(0, slots).map((w) => checkOne(w)));
  }

  /* "Check all now" — respects the concurrency cap but ignores schedules. */
  async function checkAll(onlyIds) {
    const list = store.all().filter(
      (w) => w.active && w.provider !== "manual" && w.provider !== "command"
        && (!onlyIds || onlyIds.includes(w.id))
    );
    const queue = list.slice();
    const workers = new Array(Math.min(MAX_PARALLEL, queue.length))
      .fill(0)
      .map(async () => {
        while (queue.length) {
          const w = queue.shift();
          await checkOne(w);
        }
      });
    await Promise.all(workers);
  }

  function start(h) {
    hooks = Object.assign(hooks, h || {});
    stop();
    timer = setInterval(tick, TICK_MS);
    // Coming back to a backgrounded tab: browsers throttle timers, so catch up.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
    setTimeout(tick, 1500);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  const isRunning = (id) => running.has(id);
  const busyCount = () => running.size;

  PT.scheduler = { start, stop, tick, checkOne, checkAll, isRunning, busyCount };
})(window.PT);
