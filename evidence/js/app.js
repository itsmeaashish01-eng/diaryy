/* ================================================
   EVIDENCE DESK — app.js
   Start-up: theme, navigation, and the listening end of the bookmarklet.
   ================================================ */
(function (EV) {
  "use strict";
  const { store, ui } = EV;

  /* ---- theme -------------------------------------------------------- */

  function resolveTheme(theme) {
    if (theme === "dark" || theme === "light") return theme;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    const resolved = resolveTheme(store.settings().theme);
    document.body.classList.toggle("dark", resolved === "dark");
    document.getElementById("darkIcon").textContent = resolved === "dark" ? "☀" : "☾";
  }

  /* ---- a capture arriving from the bookmarklet ----------------------
     The page being read opened this one and is waiting to be told we are
     ready. Three things keep that from being a way for any site to write
     into the notebook: it only happens when this page was opened for it
     (#capture), the message must come from the window that opened us,
     and one capture is taken per load. What arrives is still treated as
     outside text — normalize() clips it and it is only ever shown as text. */
  function listenForCapture() {
    if (location.hash !== "#capture" || !window.opener) return;
    let got = false;

    window.addEventListener("message", (e) => {
      if (got || e.source !== window.opener) return;
      if (!e.data || e.data.ev !== "capture") return;
      got = true;
      history.replaceState(null, "", location.pathname + location.search);
      ui.makeNote(e.data.payload, "");
    });

    // Says nothing but "ready", so it does not matter who hears it.
    let tries = 0;
    const ping = setInterval(() => {
      if (got || ++tries > 20) return clearInterval(ping);
      try { window.opener.postMessage("ev-ready", "*"); } catch (e) { clearInterval(ping); }
    }, 250);
  }

  /* ---- go ----------------------------------------------------------- */

  function init() {
    store.load();
    applyTheme();

    document.querySelectorAll(".nav-tab").forEach((b) =>
      b.addEventListener("click", () => ui.show(b.dataset.view)));

    document.querySelector('[data-act="theme"]').addEventListener("click", () => {
      store.setSettings({ theme: resolveTheme(store.settings().theme) === "dark" ? "light" : "dark" });
      applyTheme();
    });

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (store.settings().theme === "auto") applyTheme();
      });
    }

    ui.show(store.notes().length ? "notes" : "capture");
    listenForCapture();
  }

  EV.app = { applyTheme };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window.EV);
