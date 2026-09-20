/* ================================================
   QUOTE SHELL — app.js
   Boot, clock, controls. Replays a day of markets before the first
   paint so the terminal opens mid-session, then runs the same loop
   forward in front of you.
   ================================================ */
(function (MK) {
  "use strict";
  const { money, px, cents, mmss, clamp } = MK.util;

  const params = new URLSearchParams(location.search);
  const SEED = Number(params.get("seed")) || 7719;
  const REPLAY_H = clamp(Number(params.get("replay")) || 24, 1, 72);

  const S = {
    world: null, maker: null, stats: null, tracker: null,
    feed: [], speed: 4, paused: false, now: 0, seed: SEED,
  };

  /* ---- the ticker across the top ----------------------------------- */
  const COL = { green: "#2fd47f", red: "#ff4a5c", amber: "#f7c948", violet: "#a97bff", dim: "#5e6c80" };
  function say(text, col) {
    S.feed.unshift({ text, col: col || COL.dim });
    if (S.feed.length > 7) S.feed.length = 7;
  }

  function reportFills(fresh) {
    for (const f of fresh) {
      if (f.taker) {
        say(`REFILL ${f.leg} @ ${px(f.px)} · ${f.qty.toLocaleString("en-US")} SH · ${money(f.notional, 2)}`, COL.violet);
      } else if (f.notional > 120) {
        say(`MAKER FILL · ${f.leg} @ ${px(f.px)} · ${money(f.notional, 2)}`,
            f.leg === "UP" ? COL.green : COL.red);
      }
    }
  }

  function reportResolve(r) {
    say(`MKT #${r.index} RESOLVED ${r.winner} · ${r.pnl >= 0 ? "+" : ""}${money(r.pnl, 2)} · ` +
        `${Math.round(r.setQty).toLocaleString("en-US")} SETS @ ${r.pairCost ? "$" + r.pairCost.toFixed(4) : "—"}`,
        r.pnl >= 0 ? COL.green : COL.red);
  }

  /* Between fills the ticker would sit still for a minute at a time,
     so the book narrates itself: where bitcoin is against the strike,
     and how long the market has left. */
  let lastNarrate = 0;
  function narrate() {
    const st = S.world.state, q = S.maker.state.quote;
    const swing = st.spot / st.openSpot - 1;
    if (st.now - lastNarrate < 25000) return;
    lastNarrate = st.now;
    const picks = [
      [`BTC ${money(st.spot, 0)} · ${(swing >= 0 ? "+" : "") + (swing * 100).toFixed(3)}% VS STRIKE · ${mmss(S.world.msLeft())} LEFT`,
       swing >= 0 ? COL.green : COL.red],
      [`QUOTING UP ${px(q.upBid)} / DOWN ${px(q.downBid)} · SET ${q.pairCost.toFixed(4)} · ${(q.edge * 100).toFixed(2)}¢ EDGE`, COL.amber],
      [`INVENTORY ${q.residual >= 0 ? "UP" : "DOWN"} ${Math.abs(Math.round(q.residual)).toLocaleString("en-US")} SH · ` +
       `${S.maker.state.sets.reduce((a, x) => a + x.qty, 0).toLocaleString("en-US")} SET SHARES OPEN`, COL.dim],
    ];
    const p = picks[Math.floor(st.now / 25000) % picks.length];
    say(p[0], p[1]);
  }

  /* ---- advance ------------------------------------------------------ */
  function advance(simMs) {
    let left = Math.min(simMs, 6000);
    while (left > 0) {
      const dt = Math.min(left, 250);
      left -= dt;
      const r = S.maker.step(dt);
      if (r.made.length) reportFills(r.made);
      if (r.settled) reportResolve(r.settled);
      narrate();
    }
  }

  /* ---- boot ---------------------------------------------------------- */
  function boot() {
    const t0 = Date.now();
    S.world = MK.market.createWorld({ seed: SEED, spot: 76297, now: t0 });
    S.world.warmStart(40);
    S.maker = MK.maker.createMaker(S.world, { seed: SEED + 1013, deposit: 170000 });
    /* The bot counts its own state transitions, so the replay fills
       the cycle panel in too. */
    S.tracker = S.maker.state.cycle;
    MK.ui.init();

    const bootLine = document.getElementById("bootLine");
    const bootBar = document.getElementById("bootBar");
    document.getElementById("walletSpan").textContent = `· ${REPLAY_H}H REPLAY + LIVE`;

    /* The replay is a couple of seconds of work. Doing it in slices
       lets the boot bar actually move instead of freezing the tab. */
    const slices = 12;
    let i = 0;
    (function slice() {
      S.maker.warmStart(REPLAY_H / slices);
      i++;
      bootBar.style.width = (i / slices) * 100 + "%";
      bootLine.textContent =
        `replaying ${REPLAY_H}h of five-minute markets — ` +
        `${S.maker.state.setsMade.toLocaleString("en-US")} complete sets built`;
      if (i < slices) return setTimeout(slice, 0);

      say("SESSION RESTORED · " + S.maker.state.windows.length + " MARKETS REPLAYED", COL.amber);
      say("QUOTING BTC 5M UP·DOWN · BIDS ON BOTH LEGS", COL.green);
      S.stats = S.maker.stats();
      MK.ui.render(S);
      document.getElementById("boot").classList.add("gone");
      setTimeout(() => document.getElementById("boot").remove(), 600);
      requestAnimationFrame(loop);
    })();
  }

  /* ---- loop ----------------------------------------------------------- */
  let lastFrame = 0, lastRender = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastFrame) lastFrame = ts;
    const dtReal = Math.min(ts - lastFrame, 250);
    lastFrame = ts;

    if (!S.paused) advance(dtReal * S.speed);

    if (ts - lastRender > 60) {
      lastRender = ts;
      S.now = ts;
      S.stats = S.maker.stats();
      MK.ui.render(S);
    }
  }

  /* ---- controls --------------------------------------------------------- */
  function controls() {
    document.querySelectorAll("[data-speed]").forEach((b) => {
      b.addEventListener("click", () => {
        S.speed = Number(b.dataset.speed);
        S.paused = false;
        document.querySelectorAll("[data-speed]").forEach((x) => x.classList.remove("is-on"));
        b.classList.add("is-on");
        document.getElementById("pauseBtn").textContent = "❚❚";
      });
    });
    const pause = document.getElementById("pauseBtn");
    pause.addEventListener("click", () => {
      S.paused = !S.paused;
      pause.textContent = S.paused ? "▶" : "❚❚";
      pause.classList.toggle("is-on", S.paused);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === " ") { e.preventDefault(); pause.click(); }
      if (e.key >= "1" && e.key <= "3") {
        document.querySelectorAll("[data-speed]")[Number(e.key) - 1].click();
      }
    });
    /* Canvases are sized from their box, so a resize needs a redraw. */
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => S.stats && MK.ui.render(S), 120);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { controls(); boot(); });
  } else { controls(); boot(); }

  MK.app = S;
})(window.MK);
