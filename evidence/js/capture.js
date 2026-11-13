/* ================================================
   EVIDENCE DESK — capture.js
   Getting a page you are reading into the notebook.

   A web page cannot read another tab, and that is a good thing. So the
   reading is done from inside the page you are on, by you, on a click:

     the bookmarklet   runs grab() in the page, opens the notebook, and
                       hands the result across with postMessage
     paste             copy the page (or part of it), paste it here; the
                       links survive because the clipboard carries HTML

   Both end in the same shape — a "capture" — and normalize() is the only
   door into the app. Whatever arrives is somebody else's text: it gets
   clipped, type-checked, and its links reduced to http(s) before anything
   else sees it.
   ================================================ */
(function (EV) {
  "use strict";
  const { clip, squash, safeUrl } = EV.util;

  const MAX_TEXT = 60000;   // about 15 pages; more than any one answer runs to
  const MAX_LINKS = 300;

  /* Runs inside the page being read, pasted there as source text by the
     bookmarklet — so it must stand alone: no closures, no EV, old-style
     syntax that any browser's bookmark bar will accept.

     If you have selected a decent chunk of text, that is what's taken;
     otherwise the main column of the page. */
  function grab() {
    var d = document;
    var sel = String(window.getSelection ? window.getSelection() : "").trim();
    var root = d.querySelector("main,[role=main],article") || d.body;
    var full = sel.length > 200 ? sel : (root.innerText || "");
    var h = d.querySelector("h1");
    var seen = {}, links = [];
    var as = root.querySelectorAll("a[href]");
    for (var i = 0; i < as.length && links.length < 300; i++) {
      var a = as[i], u = a.href;
      if (!/^https?:/.test(u)) continue;
      var t = (a.innerText || a.title || "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (seen[u + "|" + t]) continue;
      seen[u + "|" + t] = 1;
      var p = a.closest ? a.closest("li,p,div") : null;
      var c = p ? (p.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400) : "";
      links.push({ t: t, u: u, c: c });
    }
    return {
      v: 1,
      url: location.href,
      title: d.title,
      question: ((h && h.innerText) || d.title || "").replace(/\s+/g, " ").trim().slice(0, 300),
      text: full.slice(0, 60000),
      truncated: full.length > 60000,
      links: links
    };
  }

  /* The bookmark itself. It waits for the notebook to say it is ready
     rather than guessing how long a page takes to load. If the notebook
     never answers — a popup blocker, or a site that cuts the link between
     a page and the windows it opens — the capture goes to the clipboard
     instead, where the paste box will take it. */
  function bookmarklet(notebookUrl) {
    const target = new URL(notebookUrl);
    target.hash = "capture";
    const code =
      "(function(){var p=(" + grab.toString() + ")();" +
      "var o=" + JSON.stringify(target.origin) + ",w=window.open(" + JSON.stringify(target.href) + "),done=0;" +
      "function fb(){if(done)return;done=1;var s=JSON.stringify(p);" +
      "if(navigator.clipboard){navigator.clipboard.writeText(s).then(function(){" +
      "alert('Evidence Desk: page copied. Open Evidence Desk and paste it into the Capture box.')}," +
      "function(){alert('Evidence Desk could not open or copy. Select the page text, copy it, and paste it into the Capture box.')})}}" +
      "if(!w){fb();return}" +
      "addEventListener('message',function f(e){if(e.source===w&&e.data==='ev-ready'&&!done){done=1;" +
      "w.postMessage({ev:'capture',payload:p},o);removeEventListener('message',f)}});" +
      "setTimeout(fb,6000)})()";
    return "javascript:" + encodeURIComponent(code);
  }

  /* A paste that carried HTML. DOMParser builds a document that never
     runs scripts or loads anything, which is exactly the amount of trust
     a clipboard deserves. */
  function fromHtml(html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
    const links = [];
    doc.querySelectorAll("a[href]").forEach((a) => {
      const p = a.closest("li,p,div");
      links.push({
        t: a.textContent,
        u: a.getAttribute("href"),
        c: p ? p.textContent : "",
      });
    });
    return { links };
  }

  /* A plain-text paste: either the JSON the bookmarklet left on the
     clipboard, or simply words. Bare URLs in the words still count. */
  function fromText(text) {
    const raw = String(text || "");
    if (raw.trimStart().startsWith("{")) {
      try {
        const j = JSON.parse(raw);
        if (j && j.v === 1 && typeof j.text === "string") return j;
      } catch (e) { /* not ours — treat as words */ }
    }
    const links = [];
    for (const line of raw.split(/\n/)) {
      const m = line.match(/https?:\/\/[^\s<>"')\]]+/g);
      if (!m) continue;
      for (const u of m) {
        const rest = squash(line.replace(u, ""));
        links.push({ t: rest, u: u.replace(/[.,;]+$/, ""), c: squash(line) });
      }
    }
    return { text: raw, links };
  }

  function normalize(p) {
    const src = p && typeof p === "object" ? p : {};
    const str = (v) => (typeof v === "string" ? v : "");
    const text = str(src.text).replace(/\r/g, "").replace(/ /g, " ");
    const links = [];
    const seen = new Set();
    for (const l of Array.isArray(src.links) ? src.links : []) {
      if (links.length >= MAX_LINKS) break;
      if (!l || typeof l !== "object") continue;
      const u = safeUrl(str(l.u));
      if (!u) continue;
      const t = clip(squash(str(l.t)), 300);
      if (seen.has(u + "|" + t)) continue;
      seen.add(u + "|" + t);
      links.push({ t, u, c: clip(squash(str(l.c)), 400) });
    }
    return {
      url: safeUrl(str(src.url)),
      title: clip(squash(str(src.title)), 300),
      question: clip(squash(str(src.question)), 300),
      text: text.slice(0, MAX_TEXT),
      truncated: Boolean(src.truncated) || text.length > MAX_TEXT,
      links,
    };
  }

  EV.capture = { grab, bookmarklet, fromHtml, fromText, normalize, MAX_TEXT };
})(window.EV);
