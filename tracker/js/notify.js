/* ================================================
   PRICE WATCH — notify.js
   Getting an alert off the screen and onto your phone.

   Channels, in order of how reliably they reach you when the tab isn't
   in front of you:
     ntfy      — free push to the ntfy app, no account. Best option.
     webhook   — Discord / Slack / anything that takes a POST.
     browser   — desktop notification; only while the tab is alive.
   ================================================ */
(function (PT) {
  "use strict";
  const { fetchWithTimeout } = PT.util;

  function inQuietHours(settings) {
    const q = settings.quietHours;
    if (!q || !q.enabled) return false;
    const h = new Date().getHours();
    // Ranges may wrap past midnight (23 -> 7).
    return q.from <= q.to ? h >= q.from && h < q.to : h >= q.from || h < q.to;
  }

  async function requestBrowserPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try { return await Notification.requestPermission(); }
    catch (e) { return "denied"; }
  }

  function browserNotify(title, body, tag) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    try {
      const n = new Notification(title, { body, tag, badge: "", icon: "" });
      n.onclick = () => { window.focus(); n.close(); };
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ntfy.sh: POST JSON to the server root. Using the JSON form rather than
     the X-Title header keeps this a simple CORS request. */
  async function ntfyNotify(cfg, title, body, tags, priority) {
    if (!cfg || !cfg.enabled || !cfg.topic) return false;
    const server = (cfg.server || "https://ntfy.sh").replace(/\/+$/, "");
    const res = await fetchWithTimeout(server, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: cfg.topic,
        title,
        message: body,
        tags: tags || ["moneybag"],
        priority: priority || 4,
      }),
    }, 12000);
    if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
    return true;
  }

  async function webhookNotify(cfg, title, body) {
    if (!cfg || !cfg.enabled || !cfg.url) return false;
    let payload;
    if (cfg.style === "slack") payload = { text: `*${title}*\n${body}` };
    else if (cfg.style === "discord") payload = { content: `**${title}**\n${body}` };
    else payload = { title, message: body, at: new Date().toISOString() };

    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
    if (cfg.noCors) {
      // Fire-and-forget: the request goes out, we just can't read the reply.
      opts.mode = "no-cors";
      await fetchWithTimeout(cfg.url, opts, 12000);
      return true;
    }
    const res = await fetchWithTimeout(cfg.url, opts, 12000);
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    return true;
  }

  let audioCtx = null;
  function beep(kind) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const notes = kind === "good" ? [660, 880] : [520, 400];
      notes.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.14 + 0.13);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + i * 0.14);
        osc.stop(audioCtx.currentTime + i * 0.14 + 0.15);
      });
    } catch (e) { /* audio is a nicety, never a failure */ }
  }

  /* Push one alert out through every enabled channel. Never throws —
     a dead webhook must not stop the poller. Returns a per-channel report. */
  async function dispatch(alert, settings) {
    const kindLabel = (PT.store.KINDS[alert.kind] || {}).label || "Watch";
    const title = `${kindLabel}: ${alert.watchLabel || "Price watch"}`;
    const body = alert.message;
    const report = {};

    if (inQuietHours(settings)) {
      return { quiet: true };
    }

    const n = settings.notify || {};
    if (n.browser) {
      report.browser = browserNotify(title, body, alert.watchId + ":" + alert.ruleType);
    }
    if (n.ntfy && n.ntfy.enabled) {
      try {
        report.ntfy = await ntfyNotify(
          n.ntfy, title, body,
          alert.severity === "good" ? ["moneybag", "chart_with_downwards_trend"] : ["warning"],
          alert.severity === "good" ? 4 : 3
        );
      } catch (e) { report.ntfy = "error: " + e.message; }
    }
    if (n.webhook && n.webhook.enabled) {
      try { report.webhook = await webhookNotify(n.webhook, title, body); }
      catch (e) { report.webhook = "error: " + e.message; }
    }
    if (settings.sound) beep(alert.severity);
    return report;
  }

  /* Used by the "Send test" buttons in Settings. */
  async function test(channel, settings) {
    const title = "Price Watch test";
    const body = "If you can read this, alerts will reach you here.";
    if (channel === "browser") {
      const perm = await requestBrowserPermission();
      if (perm !== "granted") throw new Error(`Permission is "${perm}"`);
      if (!browserNotify(title, body, "test")) throw new Error("Browser refused the notification");
      return "Sent";
    }
    if (channel === "ntfy") {
      const cfg = Object.assign({}, settings.notify.ntfy, { enabled: true });
      if (!cfg.topic) throw new Error("Pick a topic name first");
      await ntfyNotify(cfg, title, body, ["bell"], 3);
      return "Sent — check the ntfy app";
    }
    if (channel === "webhook") {
      const cfg = Object.assign({}, settings.notify.webhook, { enabled: true });
      if (!cfg.url) throw new Error("Enter a webhook URL first");
      await webhookNotify(cfg, title, body);
      return cfg.noCors ? "Sent (no reply readable in no-cors mode)" : "Sent";
    }
    throw new Error("Unknown channel");
  }

  PT.notify = { dispatch, test, requestBrowserPermission, beep, inQuietHours };
})(window.PT);
