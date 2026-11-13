/* ================================================
   EVIDENCE DESK — util.js
   Small shared helpers. Everything hangs off window.EV

   Nothing here touches the document when the file loads, so the
   selftest can run it in Node with no DOM at all.
   ================================================ */
window.EV = window.EV || {};

(function (EV) {
  "use strict";

  const uid = () =>
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  const clip = (s, n) => {
    const str = String(s == null ? "" : s);
    return str.length > n ? str.slice(0, n - 1).trimEnd() + "…" : str;
  };

  const squash = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  /* Only http(s) links are ever made clickable. A captured page is
     outside text, and `javascript:` in an href is the oldest trick there is. */
  function safeUrl(u) {
    try {
      const url = new URL(String(u));
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (e) {
      return "";
    }
  }

  function hostOf(u) {
    try {
      return new URL(String(u)).hostname.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  }

  function fmtDate(ms) {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  /* The one way anything reaches the page. Text goes in as text —
     there is deliberately no option here that takes HTML. */
  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "value") node.value = v;
      else if (k === "checked") node.checked = Boolean(v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Older Safari, or a page opened from a file: fall back to a selection.
      const ta = el("textarea", { value: text, style: "position:fixed;opacity:0" });
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  EV.util = { uid, clip, squash, safeUrl, hostOf, fmtDate, el, toast, copyText };
})(window.EV);
