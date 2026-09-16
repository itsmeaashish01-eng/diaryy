/* ================================================
   ROAMGUIDE — install.js
   Getting it onto a home screen.

   Two different worlds. Chrome and friends fire beforeinstallprompt and
   hand you a real install button. iOS fires nothing at all: Safari's
   Add to Home Screen is a menu item and always has been, so the only
   honest thing is to describe where it is.

   And it has to be Safari. Add to Home Screen doesn't exist in Chrome
   or Firefox on iOS — they're all WebKit underneath, but only Safari
   has the menu item — so telling an iOS Chrome user to tap Share would
   send them looking for something that isn't there.
   ================================================ */
(function (RG) {
  "use strict";

  let deferred = null;     // the beforeinstallprompt event, where there is one
  let listeners = [];
  const onChange = (fn) => listeners.push(fn);
  const emit = () => listeners.forEach((fn) => fn());

  /* Pure, so it can be checked against real user-agent strings without
     a browser. `standalone` is whether we're already running installed. */
  function detect(ua, standalone) {
    const s = String(ua || "");
    const iOS = /iPad|iPhone|iPod/.test(s) ||
      // iPadOS 13+ reports itself as a Mac; the touch points give it away.
      (/Macintosh/.test(s) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
    // CriOS, FxiOS, EdgiOS: other browsers on iOS, none of which can install.
    const iOSOtherBrowser = iOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(s);
    const android = /Android/.test(s);

    let platform = "desktop";
    if (iOSOtherBrowser) platform = "ios-other";
    else if (iOS) platform = "ios-safari";
    else if (android) platform = "android";

    return { installed: Boolean(standalone), platform, iOS };
  }

  function isStandalone() {
    if (typeof window === "undefined") return false;
    if (window.navigator && window.navigator.standalone) return true;   // iOS
    return Boolean(window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches);
  }

  function state() {
    const d = detect(
      typeof navigator !== "undefined" ? navigator.userAgent : "",
      isStandalone()
    );
    d.canPrompt = Boolean(deferred);
    return d;
  }

  function listen() {
    if (typeof window === "undefined") return;
    window.addEventListener("beforeinstallprompt", (e) => {
      // Hold it, so the offer sits in Settings rather than ambushing
      // someone mid-sentence.
      e.preventDefault();
      deferred = e;
      emit();
    });
    window.addEventListener("appinstalled", () => {
      deferred = null;
      emit();
    });
  }

  /* Returns "accepted" | "dismissed" | "unavailable". */
  async function prompt() {
    if (!deferred) return "unavailable";
    deferred.prompt();
    let outcome = "dismissed";
    try {
      const choice = await deferred.userChoice;
      outcome = (choice && choice.outcome) || "dismissed";
    } catch (e) { /* treated as dismissed */ }
    deferred = null;
    emit();
    return outcome;
  }

  RG.install = { detect, isStandalone, state, listen, prompt, onChange };
})(window.RG);
