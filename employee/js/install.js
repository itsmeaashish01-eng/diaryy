/* ================================================
   THE AI EMPLOYEE — install.js
   Getting it onto a home screen or a dock.

   Two different worlds. Chrome and friends fire beforeinstallprompt and
   hand you a real install button. iOS fires nothing at all: Safari's
   Add to Home Screen is a menu item and always has been, so the only
   honest thing is to describe where it is.

   And it has to be Safari. Add to Home Screen doesn't exist in Chrome
   or Firefox on iOS — they're all WebKit underneath, but only Safari
   has the menu item — so telling an iOS Chrome user to tap Share would
   send them looking for something that isn't there.
   ================================================ */
(function (AE) {
  "use strict";

  let deferred = null;      // the beforeinstallprompt event, where there is one
  const listeners = [];
  const onChange = (fn) => listeners.push(fn);
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });

  /* Pure, so it can be checked against real user-agent strings without a
     browser. `standalone` is whether we're already running installed. */
  function detect(ua, standalone, touchPoints) {
    const s = String(ua || "");
    const iOS = /iPad|iPhone|iPod/.test(s) ||
      // iPadOS 13+ reports itself as a Mac; the touch points give it away.
      (/Macintosh/.test(s) && Number(touchPoints || 0) > 1);
    // CriOS, FxiOS, EdgiOS, OPiOS: other browsers on iOS, none of which install.
    const iOSOtherBrowser = iOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(s);
    const android = /Android/.test(s);

    let platform = "desktop";
    if (iOSOtherBrowser) platform = "ios-other";
    else if (iOS) platform = "ios-safari";
    else if (android) platform = "android";

    return { installed: Boolean(standalone), platform, iOS };
  }

  /* What to tell someone, given where they are. One sentence each,
     because the instruction is the whole point. */
  function advice(state) {
    if (state.installed) return "Installed — this is running as its own app.";
    if (state.canPrompt) return "Install it and it opens from your dock or home screen, offline.";
    switch (state.platform) {
      case "ios-safari":
        return "On iPhone: tap Share, then Add to Home Screen.";
      case "ios-other":
        return "Add to Home Screen only exists in Safari on iOS — open this page there to install it.";
      case "android":
        return "In Chrome: menu, then Install app or Add to Home screen.";
      default:
        return "In Chrome or Edge: the install icon at the right of the address bar.";
    }
  }

  function isStandalone() {
    if (typeof window === "undefined") return false;
    if (window.navigator && window.navigator.standalone) return true;   // iOS
    return Boolean(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function state() {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const d = detect(nav.userAgent, isStandalone(), nav.maxTouchPoints);
    d.canPrompt = Boolean(deferred);
    d.advice = advice(Object.assign({ canPrompt: Boolean(deferred) }, d));
    return d;
  }

  function listen() {
    if (typeof window === "undefined") return;
    window.addEventListener("beforeinstallprompt", (ev) => {
      /* Hold it, so the offer sits in Settings rather than ambushing
         someone mid-invoice. */
      ev.preventDefault();
      deferred = ev;
      emit();
    });
    window.addEventListener("appinstalled", () => { deferred = null; emit(); });
  }

  /* Returns "accepted" | "dismissed" | "unavailable". */
  async function prompt() {
    if (!deferred) return "unavailable";
    deferred.prompt();
    let outcome = "dismissed";
    try {
      const choice = await deferred.userChoice;
      outcome = (choice && choice.outcome) || "dismissed";
    } catch (err) { /* treated as dismissed */ }
    deferred = null;
    emit();
    return outcome;
  }

  AE.install = { detect, advice, isStandalone, state, listen, prompt, onChange };
})(window.AE = window.AE || {});
