/* ================================================
   SCREEN TIME — screentime.js
   Track, budget and push back on social app usage.
   Data lives in localStorage under "screenTimeData".

   Honest scope note: a web page cannot force-quit
   another app on your phone. This tracks, budgets,
   warns, nags and gets in your way on purpose.
   Pair it with Android Digital Wellbeing / iOS
   Screen Time for hard blocking.
   ================================================ */

const ST_KEY = "screenTimeData";

/* ---- DATA SHAPE ----
{
  apps:  [{ id, name, emoji, limit }],   // limit is in minutes, 0 = no limit
  logs:  { "YYYY-MM-DD": { appId: seconds } },
  focus: { "YYYY-MM-DD": seconds },
  active: { appId, startedAt, lastNag } | null,
  focusSession: { endsAt, minutes } | null,
  alerted: { "YYYY-MM-DD": [appId, ...] },
  settings: { budget, nagEvery, bedStart, bedEnd, notify, bedBlock }
}
*/

const DEFAULT_APPS = [
  { id: "instagram", name: "Instagram", emoji: "📷", limit: 30 },
  { id: "youtube",   name: "YouTube",   emoji: "▶️", limit: 45 },
  { id: "tiktok",    name: "TikTok",    emoji: "🎵", limit: 20 },
  { id: "whatsapp",  name: "WhatsApp",  emoji: "💬", limit: 30 },
  { id: "x",         name: "X",         emoji: "🐦", limit: 20 },
  { id: "reddit",    name: "Reddit",    emoji: "👽", limit: 20 },
];

const DEFAULT_SETTINGS = {
  budget: 120,        // minutes of social per day
  nagEvery: 10,       // remind me every N minutes inside a session
  bedStart: "22:30",
  bedEnd: "07:00",
  notify: false,
  bedBlock: true,
};

const NUDGES = [
  "Still scrolling. Is this the part of today you'll remember?",
  "That's time you can't put back in the jar.",
  "The feed will still be there. Your evening won't.",
  "You opened this for one thing. Did you do it?",
  "Put it down and go write a diary entry instead.",
  "Nothing new has been posted in the last 90 seconds.",
];

let ST = {};
let tickTimer = null;
let holdTimer = null;

/* ================================================
   STORAGE
   ================================================ */
function loadST() {
  try {
    const raw = localStorage.getItem(ST_KEY);
    ST = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("Could not read screen time data:", e);
    ST = {};
  }
  if (!Array.isArray(ST.apps) || !ST.apps.length) ST.apps = DEFAULT_APPS.map(a => ({ ...a }));
  if (!ST.logs || typeof ST.logs !== "object") ST.logs = {};
  if (!ST.focus || typeof ST.focus !== "object") ST.focus = {};
  if (!ST.alerted || typeof ST.alerted !== "object") ST.alerted = {};
  ST.settings = Object.assign({}, DEFAULT_SETTINGS, ST.settings || {});
  if (ST.active && !ST.apps.some(a => a.id === ST.active.appId)) ST.active = null;
  if (ST.focusSession && ST.focusSession.endsAt <= Date.now()) ST.focusSession = null;
}

function saveST() {
  try {
    localStorage.setItem(ST_KEY, JSON.stringify(ST));
  } catch (e) {
    toast("Could not save — storage may be full.");
  }
}

/* ================================================
   TIME HELPERS
   ================================================ */
function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDay(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dayKey(dt);
}

// "1h 24m" / "36m" / "48s"
function fmtMins(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// "07:12" clock style for the running session
function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function minutesNow(d = new Date()) { return d.getHours() * 60 + d.getMinutes(); }

function parseHM(str) {
  const [h, m] = String(str || "0:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Downtime can wrap past midnight (22:30 → 07:00)
function inDowntime(d = new Date()) {
  const start = parseHM(ST.settings.bedStart);
  const end = parseHM(ST.settings.bedEnd);
  const now = minutesNow(d);
  if (start === end) return false;
  return start < end ? (now >= start && now < end) : (now >= start || now < end);
}

/* ================================================
   USAGE MATH
   ================================================ */
function loggedSeconds(appId, key = dayKey()) {
  return (ST.logs[key] && ST.logs[key][appId]) || 0;
}

// Seconds of the live session that belong to `key` (usually today)
function liveSeconds(appId, key = dayKey()) {
  if (!ST.active || ST.active.appId !== appId) return 0;
  const started = ST.active.startedAt;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  if (key !== dayKey()) return 0;
  const from = Math.max(started, midnight.getTime());
  return Math.max(0, (Date.now() - from) / 1000);
}

function appSeconds(appId, key = dayKey()) {
  return loggedSeconds(appId, key) + liveSeconds(appId, key);
}

function daySeconds(key = dayKey()) {
  const logged = Object.values(ST.logs[key] || {}).reduce((a, b) => a + b, 0);
  const live = ST.active && key === dayKey() ? liveSeconds(ST.active.appId, key) : 0;
  return logged + live;
}

function addSeconds(appId, seconds, key = dayKey()) {
  if (seconds <= 0) return;
  if (!ST.logs[key]) ST.logs[key] = {};
  ST.logs[key][appId] = (ST.logs[key][appId] || 0) + seconds;
}

// Split a session across midnight so each day gets its own share
function commitSession(appId, startedAt, endedAt) {
  let cursor = startedAt;
  while (cursor < endedAt) {
    const d = new Date(cursor);
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const chunkEnd = Math.min(nextMidnight, endedAt);
    addSeconds(appId, (chunkEnd - cursor) / 1000, dayKey(d));
    cursor = chunkEnd;
  }
}

function last7Keys() {
  const keys = [];
  for (let i = 6; i >= 0; i--) keys.push(shiftDay(dayKey(), -i));
  return keys;
}

function avgSeconds(days = 7, { includeToday = false } = {}) {
  const keys = [];
  for (let i = includeToday ? 0 : 1; i <= days; i++) keys.push(shiftDay(dayKey(), -i));
  const used = keys.filter(k => ST.logs[k]);
  if (!used.length) return 0;
  return used.reduce((a, k) => a + daySeconds(k), 0) / used.length;
}

function streakUnderBudget() {
  const budget = ST.settings.budget * 60;
  if (!budget) return 0;
  let streak = 0;
  // Today only counts once it is over — start from yesterday, then add today if still under.
  if (daySeconds() <= budget && Object.keys(ST.logs[dayKey()] || {}).length) streak++;
  for (let i = 1; i <= 365; i++) {
    const key = shiftDay(dayKey(), -i);
    if (!ST.logs[key]) break;          // no record = chain ends
    if (daySeconds(key) > budget) break;
    streak++;
  }
  return streak;
}

/* ================================================
   NOTIFICATIONS / TOAST
   ================================================ */
let toastTimeout;
function toast(msg, duration = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add("hidden"), duration);
}

function notify(title, body) {
  toast(body || title);
  if (!ST.settings.notify) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "icons/icon-192.png", tag: "screentime" });
  } catch (e) { /* some browsers only allow SW notifications — toast already fired */ }
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}

async function askNotifyPermission() {
  if (!("Notification" in window)) {
    toast("This browser has no notification support.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

/* ================================================
   SESSION CONTROL
   ================================================ */
function startSession(appId) {
  if (ST.active && ST.active.appId === appId) return;
  if (ST.active) stopSession(true);
  ST.active = { appId, startedAt: Date.now(), lastNag: 0 };
  saveST();
  renderAll();
  const app = getApp(appId);
  toast(`Timer running for ${app.name}. Stop it when you put the phone down.`);
}

function stopSession(silent = false) {
  if (!ST.active) return;
  const { appId, startedAt } = ST.active;
  const ended = Date.now();
  commitSession(appId, startedAt, ended);
  ST.active = null;
  saveST();
  if (!silent) {
    const app = getApp(appId);
    const spent = (ended - startedAt) / 1000;
    toast(`${app ? app.name : "Session"}: ${fmtMins(spent)} logged. Today: ${fmtMins(daySeconds())}.`);
  }
  renderAll();
}

function getApp(id) { return ST.apps.find(a => a.id === id); }

function checkLimits() {
  const key = dayKey();
  if (!ST.alerted[key]) ST.alerted[key] = [];
  let changed = false;

  ST.apps.forEach(app => {
    if (!app.limit) return;
    if (appSeconds(app.id) >= app.limit * 60 && !ST.alerted[key].includes(app.id)) {
      ST.alerted[key].push(app.id);
      changed = true;
      notify(`${app.name} limit reached`, `${app.name}: ${app.limit}m used up. Close it.`);
    }
  });

  const budget = ST.settings.budget * 60;
  if (budget && daySeconds() >= budget && !ST.alerted[key].includes("__budget")) {
    ST.alerted[key].push("__budget");
    changed = true;
    notify("Daily budget spent", `You've used your whole ${ST.settings.budget}m of social today.`);
  }
  if (changed) saveST();
}

function checkNag() {
  if (!ST.active || !ST.settings.nagEvery) return;
  const elapsedMin = (Date.now() - ST.active.startedAt) / 60000;
  const step = Math.floor(elapsedMin / ST.settings.nagEvery);
  if (step > 0 && step !== ST.active.lastNag) {
    ST.active.lastNag = step;
    saveST();
    const app = getApp(ST.active.appId);
    const line = NUDGES[Math.floor(Math.random() * NUDGES.length)];
    notify(`${Math.round(elapsedMin)}m on ${app ? app.name : "this app"}`, line);
  }
}

/* ================================================
   RENDER
   ================================================ */
function renderToday() {
  const total = daySeconds();
  const budget = ST.settings.budget * 60;
  const pct = budget ? Math.min(total / budget, 1) : 0;
  const C = 2 * Math.PI * 52;

  const ring = document.getElementById("ringFill");
  ring.style.strokeDashoffset = String(C * (1 - pct));
  ring.classList.toggle("warn", budget > 0 && pct >= 0.75 && pct < 1);
  ring.classList.toggle("over", budget > 0 && total >= budget);

  document.getElementById("ringValue").textContent = fmtMins(total);
  document.getElementById("ringSub").textContent = budget
    ? `of ${fmtMins(budget)} budget`
    : "no budget set";

  const remaining = budget - total;
  document.getElementById("statRemaining").textContent = budget
    ? (remaining > 0 ? fmtMins(remaining) : "0m")
    : "—";
  document.getElementById("statRemainingSub").textContent =
    budget && remaining <= 0 ? `${fmtMins(-remaining)} over` : "today's budget";

  document.getElementById("statStreak").textContent = String(streakUnderBudget());

  const avg = avgSeconds(7);
  document.getElementById("statAvg").textContent = avg ? fmtMins(avg) : "—";
  const saved = avg - total;
  document.getElementById("statSaved").textContent = avg
    ? (saved >= 0 ? `−${fmtMins(saved)}` : `+${fmtMins(-saved)}`)
    : "—";

  const msg = document.getElementById("budgetMsg");
  msg.classList.remove("warn", "over");
  if (!budget) {
    msg.textContent = "No daily budget set — open settings to give yourself one.";
  } else if (total >= budget) {
    msg.classList.add("over");
    msg.textContent = `Budget blown by ${fmtMins(total - budget)}. Put the phone face-down and go do the thing you were avoiding.`;
  } else if (pct >= 0.75) {
    msg.classList.add("warn");
    msg.textContent = `Only ${fmtMins(remaining)} left today. Spend it deliberately.`;
  } else if (total === 0) {
    msg.textContent = "Nothing logged yet today. Start a timer when you open a social app.";
  } else {
    msg.textContent = `${fmtMins(remaining)} of budget left. Good pace.`;
  }
}

function renderApps() {
  const grid = document.getElementById("appGrid");
  grid.innerHTML = "";
  document.getElementById("appEmptyState").classList.toggle("hidden", ST.apps.length > 0);

  ST.apps.forEach(app => {
    const used = appSeconds(app.id);
    const limit = app.limit * 60;
    const over = limit > 0 && used >= limit;
    const pct = limit ? Math.min(used / limit, 1) * 100 : 0;
    const running = ST.active && ST.active.appId === app.id;

    const tile = document.createElement("div");
    tile.className = "app-tile" + (running ? " running" : "") + (over ? " over" : "");
    tile.dataset.appId = app.id;
    tile.innerHTML = `
      <div class="app-top">
        <span class="app-emoji">${escapeHtml(app.emoji || "📱")}</span>
        <div class="app-meta">
          <p class="app-name">${escapeHtml(app.name)}</p>
          <p class="app-usage" data-usage>${usageText(app, used)}</p>
        </div>
        <button class="app-edit" data-act="edit" title="Edit ${escapeHtml(app.name)}">✎</button>
      </div>
      <div class="app-bar"><div class="app-bar-fill${over ? " over" : ""}" data-bar style="width:${pct}%"></div></div>
      <div class="app-actions">
        ${running
          ? `<button class="chip-btn stop" data-act="stop">■ Stop timer</button>`
          : `<button class="chip-btn primary" data-act="start">▶ Start timer</button>`}
        <button class="chip-btn" data-act="add" data-min="5">+5m</button>
        <button class="chip-btn" data-act="add" data-min="15">+15m</button>
        <button class="chip-btn" data-act="add" data-min="-5">−5m</button>
      </div>`;
    grid.appendChild(tile);
  });
}

function usageText(app, used) {
  const limit = app.limit * 60;
  if (!limit) return `${fmtMins(used)} today · no limit`;
  if (used >= limit) return `<span class="over-txt">${fmtMins(used)} / ${app.limit}m — ${fmtMins(used - limit)} over</span>`;
  return `${fmtMins(used)} / ${app.limit}m`;
}

function renderBanner() {
  const banner = document.getElementById("sessionBanner");
  if (!ST.active) { banner.classList.add("hidden"); return; }
  const app = getApp(ST.active.appId);
  banner.classList.remove("hidden");
  document.getElementById("sessionEmoji").textContent = app.emoji || "📱";
  document.getElementById("sessionName").textContent = app.name;
  const started = new Date(ST.active.startedAt);
  document.getElementById("sessionSub").textContent =
    `counting since ${String(started.getHours()).padStart(2, "0")}:${String(started.getMinutes()).padStart(2, "0")}`;
  const elapsed = (Date.now() - ST.active.startedAt) / 1000;
  document.getElementById("sessionClock").textContent = fmtClock(elapsed);
  banner.classList.toggle("over", app.limit > 0 && appSeconds(app.id) >= app.limit * 60);
}

function renderWeek() {
  const chart = document.getElementById("weekChart");
  chart.innerHTML = "";
  const keys = last7Keys();
  const budget = ST.settings.budget * 60;
  const max = Math.max(budget, ...keys.map(k => daySeconds(k)), 60);
  const today = dayKey();

  keys.forEach(key => {
    const secs = daySeconds(key);
    const d = new Date(key + "T00:00:00");
    const over = budget > 0 && secs > budget;
    const col = document.createElement("div");
    col.className = "week-col";
    col.innerHTML = `
      <span class="week-val">${secs ? fmtMins(secs) : "—"}</span>
      <div class="week-bar${over ? " over" : ""}${key === today ? " today" : ""}"
           style="height:${(secs / max) * 100}%" title="${key}: ${fmtMins(secs)}"></div>
      <span class="week-label">${"SMTWTFS"[d.getDay()]}</span>`;
    chart.appendChild(col);
  });

  const weekTotal = keys.reduce((a, k) => a + daySeconds(k), 0);
  document.getElementById("weekTotal").textContent = `${fmtMins(weekTotal)} total`;

  // Per-app breakdown across the same 7 days
  const bd = document.getElementById("breakdown");
  bd.innerHTML = "";
  const totals = ST.apps
    .map(app => ({ app, secs: keys.reduce((a, k) => a + appSeconds(app.id, k), 0) }))
    .filter(r => r.secs > 0)
    .sort((a, b) => b.secs - a.secs);

  if (!totals.length) {
    bd.innerHTML = `<p class="empty-state">No usage logged in the last 7 days.</p>`;
    return;
  }
  const top = totals[0].secs;
  totals.forEach(({ app, secs }) => {
    const row = document.createElement("div");
    row.className = "breakdown-row";
    row.innerHTML = `
      <span>${escapeHtml(app.emoji || "📱")}</span>
      <span class="bd-name">${escapeHtml(app.name)}</span>
      <span class="bd-bar"><span style="width:${(secs / top) * 100}%"></span></span>
      <span class="bd-val">${fmtMins(secs)}</span>`;
    bd.appendChild(row);
  });
}

function renderFocusTotal() {
  const secs = ST.focus[dayKey()] || 0;
  document.getElementById("focusTotal").textContent = secs
    ? `${fmtMins(secs)} of focus banked today.`
    : "No focus sessions today yet.";
}

function renderAll() {
  renderBanner();
  renderToday();
  renderApps();
  renderWeek();
  renderFocusTotal();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ================================================
   LIVE TICK (1s)
   ================================================ */
function tick() {
  if (ST.active) {
    renderBanner();
    renderToday();
    const tile = document.querySelector(`.app-tile[data-app-id="${ST.active.appId}"]`);
    if (tile) {
      const app = getApp(ST.active.appId);
      const used = appSeconds(app.id);
      const limit = app.limit * 60;
      tile.querySelector("[data-usage]").innerHTML = usageText(app, used);
      const bar = tile.querySelector("[data-bar]");
      bar.style.width = limit ? `${Math.min(used / limit, 1) * 100}%` : "0%";
      bar.classList.toggle("over", limit > 0 && used >= limit);
      tile.classList.toggle("over", limit > 0 && used >= limit);
    }
    checkLimits();
    checkNag();
  }
  tickFocus();
  if (ST.settings.bedBlock) maybeShowDowntime();
}

/* ================================================
   FOCUS SESSION
   ================================================ */
function startFocus(minutes) {
  if (!minutes || minutes < 1) { toast("Pick a length first."); return; }
  if (ST.active) stopSession();
  ST.focusSession = { endsAt: Date.now() + minutes * 60000, minutes };
  saveST();
  showFocusOverlay();
  notify("Focus session started", `${minutes} minutes. Phone down.`);
}

function endFocus(completed) {
  if (!ST.focusSession) return;
  const { minutes, endsAt } = ST.focusSession;
  const doneSec = Math.max(0, (minutes * 60000 - Math.max(0, endsAt - Date.now())) / 1000);
  const key = dayKey();
  ST.focus[key] = (ST.focus[key] || 0) + (completed ? minutes * 60 : doneSec);
  ST.focusSession = null;
  saveST();
  document.getElementById("focusOverlay").classList.add("hidden");
  renderAll();
  notify(
    completed ? "Focus session complete" : "Focus session ended early",
    completed ? `${minutes} minutes, phone-free. That's the whole point.`
              : `${fmtMins(doneSec)} banked. Next one, go the distance.`
  );
}

function showFocusOverlay() {
  document.getElementById("focusOverlay").classList.remove("hidden");
  tickFocus();
}

function tickFocus() {
  if (!ST.focusSession) return;
  const left = ST.focusSession.endsAt - Date.now();
  if (left <= 0) { endFocus(true); return; }
  const overlay = document.getElementById("focusOverlay");
  if (overlay.classList.contains("hidden")) overlay.classList.remove("hidden");
  document.getElementById("focusClock").textContent = fmtClock(left / 1000);
}

/* ================================================
   DOWNTIME
   ================================================ */
let downtimeDismissedUntil = 0;
function maybeShowDowntime() {
  const overlay = document.getElementById("bedOverlay");
  const shouldShow = ST.settings.bedBlock && inDowntime() && Date.now() > downtimeDismissedUntil;
  if (shouldShow && overlay.classList.contains("hidden") && !ST.focusSession) {
    document.getElementById("bedMsg").textContent =
      `It's past ${ST.settings.bedStart}. Nothing on that feed is worth tomorrow's morning.`;
    overlay.classList.remove("hidden");
  } else if (!shouldShow) {
    overlay.classList.add("hidden");
  }
}

/* ================================================
   HOLD-TO-CONFIRM BUTTONS
   ================================================ */
function attachHold(btn, ms, onComplete) {
  let raf = null, start = 0;
  const step = () => {
    const pct = Math.min((Date.now() - start) / ms, 1);
    btn.style.setProperty("--hold", `${pct * 100}%`);
    if (pct >= 1) { cancel(); onComplete(); return; }
    raf = requestAnimationFrame(step);
  };
  const begin = e => {
    e.preventDefault();
    start = Date.now();
    raf = requestAnimationFrame(step);
  };
  const cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    btn.style.setProperty("--hold", "0%");
  };
  btn.addEventListener("pointerdown", begin);
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, cancel));
}

/* ================================================
   APP EDITOR
   ================================================ */
let editingAppId = null;

function openAppModal(appId) {
  editingAppId = appId || null;
  const app = appId ? getApp(appId) : null;
  document.getElementById("appModalTitle").textContent = app ? `Edit ${app.name}` : "Add app";
  document.getElementById("appName").value = app ? app.name : "";
  document.getElementById("appEmoji").value = app ? app.emoji : "";
  document.getElementById("appLimit").value = app ? app.limit : 30;
  document.getElementById("deleteApp").classList.toggle("hidden", !app);
  document.getElementById("appModal").classList.remove("hidden");
  document.getElementById("appName").focus();
}

function saveAppFromModal() {
  const name = document.getElementById("appName").value.trim();
  const emoji = document.getElementById("appEmoji").value.trim() || "📱";
  const limit = Math.max(0, parseInt(document.getElementById("appLimit").value, 10) || 0);
  if (!name) { toast("Give the app a name."); return; }

  if (editingAppId) {
    const app = getApp(editingAppId);
    Object.assign(app, { name, emoji, limit });
  } else {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36).slice(-4);
    ST.apps.push({ id, name, emoji, limit });
  }
  saveST();
  document.getElementById("appModal").classList.add("hidden");
  renderAll();
  toast(`${name} saved.`);
}

function deleteCurrentApp() {
  if (!editingAppId) return;
  const app = getApp(editingAppId);
  if (!confirm(`Remove ${app.name}? Its logged history stays in your data.`)) return;
  if (ST.active && ST.active.appId === editingAppId) stopSession(true);
  ST.apps = ST.apps.filter(a => a.id !== editingAppId);
  saveST();
  document.getElementById("appModal").classList.add("hidden");
  renderAll();
  toast(`${app.name} removed.`);
}

/* ================================================
   SETTINGS
   ================================================ */
function openSettings() {
  const s = ST.settings;
  document.getElementById("setBudget").value = s.budget;
  document.getElementById("setNag").value = s.nagEvery;
  document.getElementById("setBedStart").value = s.bedStart;
  document.getElementById("setBedEnd").value = s.bedEnd;
  document.getElementById("setNotify").checked = s.notify;
  document.getElementById("setBedBlock").checked = s.bedBlock;
  document.getElementById("settingsDrawer").classList.remove("hidden");
}

async function saveSettings() {
  const wantNotify = document.getElementById("setNotify").checked;
  ST.settings.budget = Math.max(0, parseInt(document.getElementById("setBudget").value, 10) || 0);
  ST.settings.nagEvery = Math.max(0, parseInt(document.getElementById("setNag").value, 10) || 0);
  ST.settings.bedStart = document.getElementById("setBedStart").value || DEFAULT_SETTINGS.bedStart;
  ST.settings.bedEnd = document.getElementById("setBedEnd").value || DEFAULT_SETTINGS.bedEnd;
  ST.settings.bedBlock = document.getElementById("setBedBlock").checked;
  ST.settings.notify = wantNotify ? await askNotifyPermission() : false;
  document.getElementById("setNotify").checked = ST.settings.notify;
  saveST();
  document.getElementById("settingsDrawer").classList.add("hidden");
  renderAll();
  toast("Settings saved.");
}

/* ================================================
   EXPORT / IMPORT
   ================================================ */
function exportST() {
  const blob = new Blob([JSON.stringify(ST, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `screentime-${dayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Exported.");
}

function importST(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed !== "object") throw new Error("bad file");
      ST = parsed;
      loadSTDefaultsInto();
      saveST();
      renderAll();
      toast("Data imported.");
    } catch (err) {
      toast("That file wasn't valid screen time data.");
    }
  };
  reader.readAsText(file);
}

// Re-apply defaults over an imported blob without touching localStorage
function loadSTDefaultsInto() {
  if (!Array.isArray(ST.apps) || !ST.apps.length) ST.apps = DEFAULT_APPS.map(a => ({ ...a }));
  if (!ST.logs) ST.logs = {};
  if (!ST.focus) ST.focus = {};
  if (!ST.alerted) ST.alerted = {};
  ST.settings = Object.assign({}, DEFAULT_SETTINGS, ST.settings || {});
}

/* ================================================
   DARK MODE (shared with the diary)
   ================================================ */
function applyDarkMode(isDark) {
  document.body.classList.toggle("dark", isDark);
  document.getElementById("darkIcon").textContent = isDark ? "☀" : "☾";
  localStorage.setItem("darkMode", isDark ? "1" : "0");
}

/* ================================================
   INIT
   ================================================ */
function init() {
  loadST();
  applyDarkMode(localStorage.getItem("darkMode") === "1");

  const now = new Date();
  document.getElementById("todayDate").textContent =
    now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  renderAll();
  if (ST.focusSession) showFocusOverlay();
  if (ST.settings.bedBlock) maybeShowDowntime();
  if (ST.active) {
    const app = getApp(ST.active.appId);
    toast(`Timer for ${app.name} is still running from before.`);
  }

  // ---- app grid actions (delegated) ----
  document.getElementById("appGrid").addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const appId = btn.closest(".app-tile").dataset.appId;
    const act = btn.dataset.act;

    if (act === "start") startSession(appId);
    else if (act === "stop") stopSession();
    else if (act === "edit") openAppModal(appId);
    else if (act === "add") {
      const mins = parseInt(btn.dataset.min, 10);
      const key = dayKey();
      const current = loggedSeconds(appId, key);
      const next = Math.max(0, current + mins * 60);
      if (!ST.logs[key]) ST.logs[key] = {};
      ST.logs[key][appId] = next;
      saveST();
      checkLimits();
      renderAll();
      toast(`${getApp(appId).name}: ${fmtMins(next)} today.`);
    }
  });

  document.getElementById("sessionStopBtn").addEventListener("click", () => stopSession());
  document.getElementById("addAppBtn").addEventListener("click", () => openAppModal(null));
  document.getElementById("closeAppModal").addEventListener("click", () =>
    document.getElementById("appModal").classList.add("hidden"));
  document.getElementById("saveApp").addEventListener("click", saveAppFromModal);
  document.getElementById("deleteApp").addEventListener("click", deleteCurrentApp);

  // ---- settings ----
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("closeSettings").addEventListener("click", () =>
    document.getElementById("settingsDrawer").classList.add("hidden"));
  document.getElementById("saveSettings").addEventListener("click", saveSettings);
  document.getElementById("resetTodayBtn").addEventListener("click", () => {
    if (!confirm("Clear everything logged today?")) return;
    delete ST.logs[dayKey()];
    delete ST.alerted[dayKey()];
    if (ST.active) ST.active.startedAt = Date.now();
    saveST();
    renderAll();
    toast("Today cleared.");
  });

  // close drawers by tapping the backdrop
  document.querySelectorAll(".drawer-backdrop").forEach(bd => {
    bd.addEventListener("click", e => { if (e.target === bd) bd.classList.add("hidden"); });
  });

  // ---- focus ----
  let pickedFocus = 25;
  document.querySelectorAll("[data-focus]").forEach(btn => {
    btn.addEventListener("click", () => {
      pickedFocus = parseInt(btn.dataset.focus, 10);
      document.getElementById("focusCustom").value = "";
      document.querySelectorAll("[data-focus]").forEach(b => b.classList.toggle("selected", b === btn));
    });
  });
  document.getElementById("focusCustom").addEventListener("input", e => {
    const v = parseInt(e.target.value, 10);
    if (v > 0) {
      pickedFocus = v;
      document.querySelectorAll("[data-focus]").forEach(b => b.classList.remove("selected"));
    }
  });
  document.getElementById("focusStartBtn").addEventListener("click", () => startFocus(pickedFocus));
  attachHold(document.getElementById("focusQuitBtn"), 3000, () => endFocus(false));

  // ---- downtime ----
  attachHold(document.getElementById("bedDismissBtn"), 3000, () => {
    downtimeDismissedUntil = Date.now() + 10 * 60000; // 10 minutes of grace
    document.getElementById("bedOverlay").classList.add("hidden");
    toast("10 minutes. Then it's back.");
  });

  // ---- export / import / dark ----
  document.getElementById("stExportBtn").addEventListener("click", exportST);
  document.getElementById("stImportFile").addEventListener("change", e => {
    if (e.target.files[0]) importST(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("darkToggle").addEventListener("click", () =>
    applyDarkMode(!document.body.classList.contains("dark")));

  // ---- keep time honest when the tab is backgrounded ----
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderAll(); });
  window.addEventListener("focus", renderAll);
  window.addEventListener("beforeunload", () => { if (ST.active) saveST(); });

  tickTimer = setInterval(tick, 1000);

  // ---- PWA ----
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline install is optional */ });
  }
}

document.addEventListener("DOMContentLoaded", init);
