/* ================================================
   QUOTE SHELL — ui.js
   Everything that is text on the page, plus the call into charts.js
   for everything that isn't. Reads state, writes DOM; it decides
   nothing about trading.
   ================================================ */
(function (MK) {
  "use strict";
  const U = MK.util;
  const { money, moneyShort, signedMoney, cents, pct, px, mmss, dur, utcClock, esc, clamp } = U;

  const $ = (id) => document.getElementById(id);
  const el = {};
  const IDS = `boot bootLine bootBar tagMode tagPaired hsSpot hsUpBid hsDownBid hsSetCost
    hsClock hsSpeedLabel spotArrow feedTrack feedState walletPnl walletSub walletSpan stFills stWin stRoi
    riskVal riskFill riskNote ledCost ledEdge ledPaired ledResid ledPairedBar ledResidBar
    ledgerFoot spotMeta ladderRows ladderSpread planeMeta plCost plEdge plUnder plSets
    gridMeta rgrid shellMeta mUpBid bUpBid mDownBid bDownBid mCost bCost mSwing bSwing
    mSkew bSkew mTime bTime mDepth bDepth shellNote fillsMeta tape tapeFoot vwapMeta
    vwCost vwLocked vwSets vwResid cycleMeta cyState cyCount cyHold stStrip`.split(/\s+/);

  const CANVAS = `cEquity cSpot cPlane cPlaneHist cFillHist cShell cVwap cVwapBars
    cCycle cCycleBars`.split(/\s+/);

  function init() {
    IDS.concat(CANVAS).forEach((id) => (el[id] = $(id)));
  }

  const setText = (id, t) => { const n = el[id]; if (n && n.textContent !== t) n.textContent = t; };
  const setWidth = (id, frac) => { const n = el[id]; if (n) n.style.width = clamp(frac, 0, 1) * 100 + "%"; };

  /* A meter that reads out from the middle, for the two inputs that
     have a sign: which way bitcoin is moving, and which leg we're
     carrying too much of. */
  function setSigned(id, v) {
    const n = el[id]; if (!n) return;
    const f = clamp(Math.abs(v), 0, 1) * 50;
    n.style.width = f + "%";
    n.style.marginLeft = v >= 0 ? "50%" : 50 - f + "%";
  }

  /* ---- HUD -------------------------------------------------------- */
  function hud(s) {
    const { world, maker, speed, paused } = s;
    const st = world.state, q = maker.state.quote, b = world.book;
    const up = st.spot >= st.openSpot;

    setText("hsSpot", money(st.spot, 0));
    el.spotArrow.textContent = up ? "UP" : "DOWN";
    el.spotArrow.className = "pill " + (up ? "on-up" : "on-down");
    setText("hsUpBid", px(q.upBid));
    setText("hsDownBid", px(q.downBid));
    setText("hsSetCost", q.pairCost.toFixed(4));
    setText("hsClock", utcClock(st.now));
    setText("hsSpeedLabel", paused ? "SIM CLOCK · HELD" : "SIM CLOCK · " + speed + "×");

    const stat = s.stats;
    setText("tagPaired", "PAIRED " + pct(stat.pairedPct, 1));
    setText("tagMode", q.quoting ? "MKT MAKER" : "STOOD DOWN");
    el.feedState.textContent = q.reason.toUpperCase();
    el.feedState.className = "feed-state" + (q.quoting ? "" : " off");

    el.feedTrack.innerHTML = s.feed
      .map((f) => `<span style="color:${f.col}">${esc(f.text)}</span>`)
      .join(" <b class='dim'>·</b> ");
  }

  /* ---- wallet ------------------------------------------------------ */
  function wallet(s) {
    const st = s.stats;
    el.walletPnl.textContent = signedMoney(st.pnl, 0);
    el.walletPnl.className = "big" + (st.pnl < 0 ? " neg" : "");
    setText("walletSub",
      "DEPOSIT " + moneyShort(st.deposit) + " · " + st.windows + " MARKETS · " +
      "LOCKED " + signedMoney(st.openLocked, 0) + " OPEN");
    setText("stFills", st.fills24.toLocaleString("en-US"));
    setText("stWin", pct(st.winRate, 1));
    setText("stRoi", (st.roi >= 0 ? "+" : "") + pct(st.roi, 2));
    el.stRoi.className = st.roi >= 0 ? "green" : "red";

    setText("riskVal", st.risk.toFixed(1) + "/10 " + st.riskLabel);
    setWidth("riskFill", st.risk / 10);
    el.riskFill.style.background =
      st.risk < 3 ? "#2fd47f" : st.risk < 6 ? "#f7c948" : "#ff4a5c";
    setText("riskNote",
      "RESIDUAL " + Math.abs(Math.round(st.residual)).toLocaleString("en-US") +
      " SHARES · WORST DRAWDOWN " + money(st.maxDrawdown, 0));
    MK.charts.equity(el.cEquity, s.maker);
  }

  /* ---- complete-set ledger ------------------------------------------ */
  function ledger(s) {
    const st = s.stats;
    setText("ledCost", "$" + st.avgPairCost.toFixed(4));
    const edge = (1 - st.avgPairCost) * 100;
    setText("ledEdge", (edge >= 0 ? "+" : "") + edge.toFixed(2) + "¢ PER SET · LAST 120");
    el.ledEdge.className = "k " + (edge >= 0 ? "green" : "red");
    setText("ledPaired", pct(st.pairedPct, 1));
    setText("ledResid", pct(st.residualPct, 1));
    setWidth("ledPairedBar", st.pairedPct);
    setWidth("ledResidBar", st.residualPct);
    setText("ledgerFoot",
      "A SET PAYS $1 WHICHEVER WAY BTC GOES · " +
      Math.round(st.openSets).toLocaleString("en-US") + " SETS HELD INTO THIS EXPIRY");
  }

  /* ---- spot + book --------------------------------------------------- */
  function spot(s) {
    const { world, maker } = s;
    const st = world.state, b = world.book, q = maker.state.quote;
    const chg = st.spot / st.openSpot - 1;
    setText("spotMeta", (chg >= 0 ? "+" : "") + (chg * 100).toFixed(3) + "% THIS MARKET");
    el.spotMeta.className = "hd-meta " + (chg >= 0 ? "green" : "red");
    MK.charts.spot(el.cSpot, world);

    setText("ladderSpread", "SPREAD " + (b.spread * 100).toFixed(1) + "¢");
    /* Sizes are a stable function of the level, so the ladder reads as
       a book rather than flickering noise on every frame. */
    const size = (p) => Math.round(b.depth * (0.55 + 0.45 * Math.abs(Math.sin(p * 997))));
    const rows = [
      { k: "UP ASK", p: b.upAsk, cls: "ask", mine: false },
      { k: "UP BID", p: b.upBid, cls: "bid", mine: Math.abs(q.upBid - b.upBid) < 1e-9 },
      { mid: true },
      { k: "DOWN BID", p: b.downBid, cls: "bid", mine: Math.abs(q.downBid - b.downBid) < 1e-9 },
      { k: "DOWN ASK", p: b.downAsk, cls: "ask", mine: false },
    ];
    const maxSize = Math.max(...rows.filter((r) => !r.mid).map((r) => size(r.p)));
    el.ladderRows.innerHTML = rows.map((r) => {
      if (r.mid) {
        return `<div class="lrow mid"><span>FAIR ${px(b.fairUp)} UP</span>
                <span>PAIR ${q.pairCost.toFixed(3)}</span></div>`;
      }
      const sz = size(r.p);
      return `<div class="lrow ${r.cls}${r.mine ? " mine" : ""}">
        <i class="depth" style="width:${(sz / maxSize) * 100}%"></i>
        <span class="lvl">${r.k.split(" ")[0]}</span>
        <span>${px(r.p)}<span class="dim"> ${cents(r.p)}</span></span>
        <span class="qty">${sz.toLocaleString("en-US")}</span>
        <span class="tag-mine ${r.mine ? "amber" : "dim"}">${r.mine ? "◀ MINE" : ""}</span>
      </div>`;
    }).join("");
  }

  /* ---- pair cost plane ------------------------------------------------ */
  function plane(s) {
    const { maker } = s, st = s.stats;
    const costs = maker.state.pairCosts.items;
    const under = costs.length ? costs.filter((c) => c < 1).length / costs.length : 0;
    setText("planeMeta", costs.length + " SETS PLOTTED");
    setText("plCost", "$" + st.avgPairCost.toFixed(4));
    const edge = (1 - st.avgPairCost) * 100;
    setText("plEdge", (edge >= 0 ? "+" : "") + edge.toFixed(2) + "¢");
    el.plEdge.className = edge >= 0 ? "green" : "red";
    setText("plUnder", pct(under, 1));
    setText("plSets", maker.state.setsMade.toLocaleString("en-US"));
    MK.charts.plane(el.cPlane, maker);
    MK.charts.planeHist(el.cPlaneHist, maker);
  }

  /* ---- resolution grid -------------------------------------------------
     One column per expiry: the price each leg was trading at going in,
     and which of the two paid out a dollar. */
  function rgrid(s) {
    const { maker, world } = s;
    const cols = window.innerWidth < 900 ? 12 : window.innerWidth < 1400 ? 18 : 24;
    const wins = maker.state.windows.last(cols - 1) || [];
    const b = world.book;

    const cells = wins.map((r) => {
      const upC = Math.round(r.lastUp * 100);
      const won = r.pnl >= 0;
      const top = `<div class="rcell ${r.winner === "UP" ? "win" : "lose"}">${upC}¢<small>UP</small></div>`;
      const bot = `<div class="rcell ${r.winner === "DOWN" ? "win" : "lose"}">${100 - upC}¢<small>${
        (won ? "+" : "") + Math.round(r.pnl)}</small></div>`;
      return top + bot;
    });
    const liveUp = Math.round(b.midUp * 100);
    cells.push(
      `<div class="rcell now">${liveUp}¢<small>UP</small></div>` +
      `<div class="rcell now">${100 - liveUp}¢<small>${mmss(world.msLeft())}</small></div>`);
    el.rgrid.innerHTML = cells.join("");
    setText("gridMeta", wins.length + " SETTLED · 1 LIVE");
  }

  /* ---- quote shell ------------------------------------------------------ */
  function shell(s) {
    const { world, maker, now } = s;
    const q = maker.state.quote, b = world.book, st = s.stats;
    const swing = world.state.spot / world.state.openSpot - 1;
    const left = world.msLeft();

    setText("mUpBid", px(q.upBid)); setWidth("bUpBid", q.upBid);
    setText("mDownBid", px(q.downBid)); setWidth("bDownBid", q.downBid);
    setText("mCost", "$" + q.pairCost.toFixed(4)); setWidth("bCost", q.pairCost);
    setText("mSwing", (swing >= 0 ? "+" : "") + (swing * 100).toFixed(3) + "%");
    setSigned("bSwing", swing * 260);
    setText("mSkew", q.skewLeg + " " + pct(q.skewPct, 1));
    setSigned("bSkew", (q.residual || 0) / maker.cfg.maxResidual);
    setText("mTime", mmss(left)); setWidth("bTime", left / MK.market.WINDOW_MS);
    setText("mDepth", money(b.depth, 0)); setWidth("bDepth", b.depth / 4200);

    setText("shellNote",
      q.quoting
        ? "Bidding both legs. Every UP fill is looking for a DOWN fill to pair with — the chord it makes is a set that pays $1 at expiry."
        : "Quotes are down: " + q.reason + ". Open sets ride to resolution; the residual is what's left to worry about.");
    setText("shellMeta",
      maker.state.setsMade.toLocaleString("en-US") + " SETS MADE · " +
      maker.state.refills.toLocaleString("en-US") + " REFILLS");
    MK.shell.draw(el.cShell, maker, world, now);

    /* the tape */
    const fills = (maker.state.fills.last(14) || []).slice().reverse();
    el.tape.innerHTML = fills.map((f) => {
      const cls = f.leg === "UP" ? "up" : "down";
      return `<div class="trow ${cls}${f.taker ? " take" : ""}">
        <span class="side">${f.taker ? "REFILL" : "BID"}</span>
        <span class="mid-c">${f.leg} @ ${px(f.px)} <span class="dim">×${f.qty.toLocaleString("en-US")}</span></span>
        <span class="amt">${money(f.notional, 2)}</span>
      </div>`;
    }).join("");
    setText("fillsMeta", "· " + st.fills24.toLocaleString("en-US") + " / 24H");
    const not = (maker.state.fills.last(400) || []).map((f) => f.notional);
    setText("tapeFoot", not.length
      ? "MED " + money(U.quantile(not, 0.5), 0) + " · MAX " + money(Math.max(...not), 0)
      : "—");
    MK.charts.fillHist(el.cFillHist, maker);
  }

  /* ---- vwap ------------------------------------------------------------- */
  function vwap(s) {
    const { maker, world } = s, st = s.stats;
    const wi = world.state.windowIndex;
    const here = maker.state.chords.items.filter((x) => x.w === wi);
    const vq = here.reduce((a, x) => a + x.qty, 0);
    const vc = here.reduce((a, x) => a + x.qty * x.cost, 0);
    setText("vwCost", vq ? "$" + (vc / vq).toFixed(4) : "—");
    setText("vwLocked", signedMoney(st.openLocked, 2));
    setText("vwSets", Math.round(st.openSets).toLocaleString("en-US"));
    setText("vwResid", (st.residual >= 0 ? "UP " : "DOWN ") +
      Math.abs(Math.round(st.residual)).toLocaleString("en-US"));
    el.vwResid.className = Math.abs(st.residual) > maker.cfg.refillAt ? "red" : "";
    setText("vwapMeta", here.length
      ? here.length + (here.length === 1 ? " SET" : " SETS") + " IN MARKET #" + wi
      : "NO PAIRS YET IN #" + wi + " · SHOWING LAST 40");
    MK.charts.vwap(el.cVwap, maker, world);
    MK.charts.vwapBars(el.cVwapBars, maker);
  }

  /* ---- quote cycle ------------------------------------------------------- */
  function cycle(s) {
    const t = s.tracker, st = s.stats;
    setText("cyState", t.state);
    setText("cyCount", t.cycles.toLocaleString("en-US"));
    setText("cyHold", st.avgHold ? dur(st.avgHold) : "—");
    setText("cycleMeta", t.transitions.toLocaleString("en-US") + " TRANSITIONS");
    MK.charts.cycle(el.cCycle, t);
    MK.charts.cycleBars(el.cCycleBars, t);
  }

  /* ---- status strip -------------------------------------------------------- */
  function status(s) {
    const st = s.stats;
    setText("stStrip", [
      "AVG HOLD " + (st.avgHold ? dur(st.avgHold) : "—"),
      "DEPOSIT " + moneyShort(st.deposit),
      "ROI " + (st.roi >= 0 ? "+" : "") + pct(st.roi, 2),
      "FILLS/H " + Math.round(st.fills24 / 24).toLocaleString("en-US"),
      "SETS " + s.maker.state.setsMade.toLocaleString("en-US"),
      "MARKET #" + s.world.state.windowIndex,
      "quoteshell // BTC 5M UP·DOWN",
      "SIMULATED · SEED " + s.seed,
    ].join("  ·  "));
  }

  function render(s) {
    hud(s); wallet(s); ledger(s); spot(s); plane(s);
    rgrid(s); shell(s); vwap(s); cycle(s); status(s);
  }

  MK.ui = { init, render, el };
})(window.MK);
