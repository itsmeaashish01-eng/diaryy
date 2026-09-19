/* ================================================
   THE AI EMPLOYEE — sync.js
   Talking to the companion server, when there is one.

   The app works with no server at all; this is opt-in. When it is on,
   the browser copy is still the one you edit and the server copy is the
   one Slack reads and the other device pulls.

   Sync is manual and honest rather than clever. Every server write
   carries the version it was based on, so two devices that both changed
   things get told they disagree instead of one quietly winning. A
   one-person business does not need three-way merge; it needs to know
   which copy is which before it picks.

   The server address and token live under their own key, NOT in the
   business record — otherwise the token would ride along in every
   export and get uploaded to the very server it unlocks.
   ================================================ */
(function (AE) {
  "use strict";

  const KEY = "aiEmployeeServer";
  let net = typeof fetch === "function" ? fetch.bind(null) : null;

  /* Tests hand in their own. */
  function setFetch(fn) { net = fn; }

  function config() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (err) { raw = null; }
    return Object.assign({ url: "", token: "", lastVersion: null, lastSyncedAt: null }, raw || {});
  }

  function setConfig(patch) {
    const next = Object.assign(config(), patch);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (err) { /* private window */ }
    return next;
  }

  function forget() {
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
  }

  function configured() { return Boolean(config().url); }

  /* Trailing slashes, a pasted /health, a missing scheme — all things a
     person legitimately types into a box. */
  function normaliseUrl(input) {
    let url = String(input || "").trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    url = url.replace(/\/+$/, "").replace(/\/(health|api\/ping|api(\/business)?)$/, "");
    return url;
  }

  async function call(path, opts) {
    const cfg = config();
    if (!cfg.url) throw new Error("No server address set");
    if (!net) throw new Error("This browser has no fetch");
    const o = opts || {};
    const headers = Object.assign({}, o.headers || {});
    if (cfg.token) headers.Authorization = "Bearer " + cfg.token;
    if (o.body) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await net(cfg.url + path, {
        method: o.method || "GET",
        headers,
        body: o.body,
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(15000) : undefined,
      });
    } catch (err) {
      /* The browser will not say why a cross-origin request died, so
         guessing loudly is worse than naming the possibilities. */
      throw new Error("Couldn't reach the server — is it running, and does the address match?");
    }

    if (res.status === 401) throw new Error("The server rejected the token");
    let body = null;
    const text = await res.text();
    if (text) { try { body = JSON.parse(text); } catch (err) { body = { raw: text }; } }

    if (res.status === 409) {
      const err = new Error("The server has a newer copy than this browser last saw");
      err.code = "CONFLICT";
      err.current = body && body.current;
      throw err;
    }
    if (!res.ok) throw new Error((body && body.error) || `Server said ${res.status}`);
    return body;
  }

  /* Deliberately the authenticated endpoint. /health answers without a
     token, so testing against it would report "server is up" for a
     token that fails on the very next action. */
  async function health() {
    return call("/api/ping");
  }

  /* Bring the server's copy down. Returns the envelope; applying it is
     the caller's decision, because it replaces what is on screen. */
  async function pull() {
    const envelope = await call("/api/business");
    return envelope;
  }

  function applyPulled(envelope) {
    AE.store.set(envelope.data);
    setConfig({ lastVersion: envelope.version, lastSyncedAt: new Date().toISOString() });
    return envelope;
  }

  /* Send this browser's copy up. `force` drops the version check, which
     is only ever correct after a person has looked at both and chosen. */
  async function push(force) {
    const cfg = config();
    const headers = {};
    if (!force && cfg.lastVersion != null) headers["If-Match"] = String(cfg.lastVersion);
    const envelope = await call("/api/business", {
      method: "PUT",
      headers,
      body: JSON.stringify({ data: AE.store.data() }),
    });
    setConfig({ lastVersion: envelope.version, lastSyncedAt: new Date().toISOString() });
    return envelope;
  }

  /* What to say in Settings without making a request. */
  function status() {
    const cfg = config();
    if (!cfg.url) return { state: "off", label: "Not connected — everything stays in this browser." };
    if (cfg.lastSyncedAt) {
      return {
        state: "on",
        label: `Connected to ${cfg.url} · last synced ${AE.util.relDay(AE.util.isoDay(cfg.lastSyncedAt), new Date())} (version ${cfg.lastVersion})`,
      };
    }
    return { state: "ready", label: `Set to ${cfg.url} — nothing synced yet.` };
  }

  AE.sync = {
    KEY, setFetch, config, setConfig, forget, configured, normaliseUrl,
    health, pull, applyPulled, push, status,
  };
})(window.AE = window.AE || {});
