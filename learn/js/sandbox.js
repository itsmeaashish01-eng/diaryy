/* ================================================
   CODE CLINIC — sandbox.js
   Running your code, safely, and saying what happened in plain words.

     JavaScript   in a Web Worker made fresh for every run. It can't touch
                  the page, and if it loops forever it is simply thrown
                  away after a few seconds.
     HTML         in a sandboxed iframe with no access to this page's
                  storage. The checks run inside it and report back by
                  message, so they see exactly what you'd see.
     Python       Pyodide — real CPython compiled to WebAssembly — in a
                  module worker, loaded the first time you need it.

   jsHarness and PY_HARNESS are the graders. They are written to run in
   two places — the browser workers here, and node/python3 in
   selftest.mjs — so the suite checks each exercise's model answer with
   the very code that will grade yours.
   ================================================ */
window.CC = window.CC || {};

(function (CC) {
  "use strict";

  /* ================================================================
     JavaScript
     ================================================================ */

  /* Self-contained on purpose: it is stringified into a worker, so it
     may not refer to anything outside its own body. */
  function jsHarness(userCode, tests, prelude) {
    const MAX_LOGS = 300;
    const logs = [];

    function fmt(v, depth) {
      depth = depth || 0;
      if (typeof v === "string") return depth ? JSON.stringify(v) : v;
      if (v === undefined) return "undefined";
      if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
      if (typeof v === "number" && Object.is(v, -0)) return "0";
      if (v instanceof Error) return `${v.name}: ${v.message}`;
      if (typeof v === "bigint") return `${v}n`;
      if (v instanceof Map) return `Map(${v.size}) ${fmt(Object.fromEntries(v), depth + 1)}`;
      if (v instanceof Set) return `Set(${v.size}) ${fmt(Array.from(v), depth + 1)}`;
      if (v && typeof v === "object") {
        try {
          const seen = new WeakSet();
          return JSON.stringify(v, (k, x) => {
            if (x && typeof x === "object") {
              if (seen.has(x)) return "[Circular]";
              seen.add(x);
            }
            if (typeof x === "function") return `[Function ${x.name || "anonymous"}]`;
            if (x === undefined) return "undefined";
            if (typeof x === "number" && !Number.isFinite(x)) return String(x);
            return x;
          });
        } catch { return String(v); }
      }
      return String(v);
    }
    const push = (prefix) => (...a) => {
      if (logs.length < MAX_LOGS) logs.push(prefix + a.map((x) => fmt(x)).join(" ").slice(0, 4000));
    };
    const con = {
      log: push(""), info: push(""), debug: push(""),
      warn: push("⚠ "), error: push("✕ "),
      table: (rows) => push("")(rows),
    };

    /* Equality the way a person means it: same shape, same values, and
       NaN equal to itself. */
    function same(a, b) {
      if (Object.is(a, b) || (a === 0 && b === 0)) return true;
      if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
    }
    const show = (v) => fmt(v, 1);
    const label = (msg) => (msg ? `${msg}: ` : "");

    const $check = (cond, msg) => { if (!cond) throw new Error(msg || "check failed"); };
    const $eq = (actual, expected, msg) => {
      if (!same(actual, expected)) throw new Error(`${label(msg)}expected ${show(expected)}, got ${show(actual)}`);
    };
    const $near = (actual, expected, tol, msg) => {
      const t = tol == null ? 1e-6 : tol;
      if (typeof actual !== "number" || !(Math.abs(actual - expected) <= t)) {
        throw new Error(`${label(msg)}expected ${show(expected)} (±${t}), got ${show(actual)}`);
      }
    };
    const $throws = async (fn, msg) => {
      let threw = false;
      try { await fn(); } catch { threw = true; }
      if (!threw) throw new Error(msg || "expected an error to be thrown");
    };
    const $output = () => logs.join("\n");

    const NAMES = ["$check", "$eq", "$near", "$throws", "$output", "console", "__cc_register"];

    /* Where in *your* code did it go wrong? The stack names the file we
       gave it, and the lines before yours are ours to subtract. */
    const userLines = String(userCode).split("\n").length;
    function userLine(err, offset) {
      const m = String((err && err.stack) || "").match(/your-code\.js:(\d+)(?::\d+)?/g) || [];
      for (const hit of m) {
        const n = Number(hit.split(":")[1]) - offset;
        if (n >= 1 && n <= userLines) return n;
      }
      return null;
    }

    /* Browsers report a syntax error without saying where it is, so this
       works it out. The AsyncFunction constructor decides *whether* the
       code parses (it allows the top-level await and return the agent
       exercises use). Where is found by parsing ever-longer prefixes inside
       a block that never runs: an unfinished prefix complains about the
       end of input, so the first prefix that fails for the real reason is
       the line that has the mistake. And if the whole thing only fails at
       the end, something was opened and never closed. */
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const UNCLOSED = /end of input|unexpected end|unterminated template|missing \} after/i;
    function blockError(src) {
      try { (0, eval)("if (false) {\n" + src + "\n}"); return null; }
      catch (e) { return e; }
    }
    function syntaxProblem(code) {
      let fnErr = null;
      try { new AsyncFunction(code); } catch (e) { fnErr = e; }
      if (!fnErr) return null;
      const whole = blockError(code);
      if (whole && UNCLOSED.test(whole.message)) {
        return {
          message: "Something was opened and never closed — check that every {, ( and [ has its partner, and every string its closing quote.",
          line: null,
        };
      }
      // A block isn't an async function, so top-level await reads as an
      // error there; in that case the function parser's message stands.
      if (!whole || /await/i.test(whole.message)) return { message: fnErr.message, line: null };
      const lines = String(code).split("\n");
      for (let i = 1; i <= lines.length; i++) {
        const e = blockError(lines.slice(0, i).join("\n"));
        if (e && e.message === whole.message) return { message: whole.message, line: i };
      }
      return { message: whole.message, line: null };
    }

    async function main() {
      const testFns = (tests || []).map((t) => `async () => {\n${t.code}\n}`);
      const pre = prelude ? String(prelude) + "\n" : "";
      /* The tests are registered first so they exist even if your code
         returns early — they still see your functions, because they share
         the scope your code runs in. */
      const head =
        `(async function (${NAMES.join(", ")}) {\n"use strict";\n` +
        `__cc_register([${testFns.join(",\n")}]);\n`;
      const offset = head.split("\n").length - 1 + (pre ? pre.split("\n").length - 1 : 0);
      const src = head + pre + userCode + "\n})\n//# sourceURL=your-code.js";

      const result = { ok: false, error: null, logs, results: [] };

      // Compile your code alone first, so a mistake is reported as yours.
      const bad = syntaxProblem(userCode);
      if (bad) {
        result.error = { kind: "syntax", message: bad.message, line: bad.line };
        return result;
      }

      let registered = [];
      let fn;
      try { fn = (0, eval)(src); }
      catch (e) {
        result.error = { kind: "internal", message: `The course's own test code didn't compile: ${e.message}` };
        return result;
      }

      try {
        await fn($check, $eq, $near, $throws, $output, con, (fns) => { registered = fns; });
      } catch (e) {
        const line = userLine(e, offset);
        result.error = { kind: "runtime", message: `${(e && e.name) || "Error"}: ${(e && e.message) || e}`, line };
      }

      for (let i = 0; i < registered.length; i++) {
        const name = (tests[i] && tests[i].name) || `check ${i + 1}`;
        try {
          await registered[i]();
          result.results.push({ name, pass: true, message: "" });
        } catch (e) {
          const line = userLine(e, offset);
          const base = e && e.name && e.name !== "Error" ? `${e.name}: ${e.message}` : String((e && e.message) || e);
          result.results.push({ name, pass: false, message: base + (line ? ` (your line ${line})` : "") });
        }
      }
      result.ok = !result.error && result.results.every((r) => r.pass);
      return result;
    }

    return main();
  }

  const WORKER_SRC =
    `"use strict";\n${jsHarness.toString()}\n` +
    `self.onmessage = async (e) => {\n` +
    `  const d = e.data;\n` +
    `  let r;\n` +
    `  try { r = await jsHarness(d.code, d.tests, d.prelude); }\n` +
    `  catch (err) { r = { ok: false, error: { kind: "internal", message: String((err && err.message) || err) }, logs: [], results: [] }; }\n` +
    `  self.postMessage(r);\n` +
    `};\n`;

  let workerUrl = null;
  function jsWorkerUrl() {
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    return workerUrl;
  }

  /* One worker per run: nothing a previous attempt left lying around can
     make this one pass or fail. */
  function runJS(code, tests, opts) {
    const o = opts || {};
    const timeoutMs = o.timeoutMs || 4000;
    return new Promise((resolve) => {
      let w;
      try { w = new Worker(jsWorkerUrl()); }
      catch (e) {
        resolve({ ok: false, error: { kind: "internal", message: `This browser wouldn't start the code runner (${e.message}). Serve the folder (python3 -m http.server) or use the hosted page.` }, logs: [], results: [] });
        return;
      }
      const timer = setTimeout(() => {
        w.terminate();
        resolve({ ok: false, error: { kind: "timeout", message: `Stopped after ${timeoutMs / 1000} seconds. Is there a loop that never ends — a while whose condition never becomes false?` }, logs: [], results: [] });
      }, timeoutMs);
      w.onmessage = (e) => { clearTimeout(timer); w.terminate(); resolve(e.data); };
      w.onerror = (e) => {
        clearTimeout(timer);
        w.terminate();
        e.preventDefault();
        resolve({ ok: false, error: { kind: "internal", message: e.message || "The code runner failed to start." }, logs: [], results: [] });
      };
      w.postMessage({ code: String(code), tests: tests || [], prelude: o.prelude || "" });
    });
  }

  /* ================================================================
     HTML
     ================================================================ */

  const nonce = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* Inserted with no newlines, so a line number from the browser still
     matches the line in your editor. */
  function consoleShim(n) {
    return `<script>(function(){var N=${JSON.stringify(n)};function f(v){try{return typeof v==="string"?v:JSON.stringify(v)}catch(e){return String(v)}}function s(l,a){try{parent.postMessage({__cc:N,kind:"log",level:l,text:Array.prototype.map.call(a,f).join(" ")},"*")}catch(e){}}["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){s(k,arguments);return o.apply(console,arguments)}});window.addEventListener("error",function(e){s("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")])});})();</script>`;
  }

  function checkerScript(n, checks) {
    const payload = JSON.stringify(checks.map((c) => ({ name: c.name, code: c.code }))).replace(/</g, "\\u003c");
    return `<script>(function(){
var N=${JSON.stringify(n)}, CHECKS=${payload};
var AF=Object.getPrototypeOf(async function(){}).constructor;
function $check(c,m){if(!c)throw new Error(m||"check failed");}
function $q(s){return document.querySelector(s);}
function $qa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
function $style(el,p){if(typeof el==="string")el=$q(el);return el?getComputedStyle(el).getPropertyValue(p):"";}
function $text(el){if(typeof el==="string")el=$q(el);return el?(el.textContent||"").replace(/\\s+/g," ").trim():"";}
function $sleep(ms){return new Promise(function(r){setTimeout(r,ms||30);});}
function $type(el,v){if(typeof el==="string")el=$q(el);if(!el)throw new Error("couldn't find the input to type into");el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}
function $click(el){if(typeof el==="string")el=$q(el);if(!el)throw new Error("couldn't find the thing to click");el.click();}
function $eq(a,b,m){if(a!==b)throw new Error((m?m+": ":"")+"expected "+JSON.stringify(b)+", got "+JSON.stringify(a));}
function $rules(){var out=[];for(var i=0;i<document.styleSheets.length;i++){try{var r=document.styleSheets[i].cssRules;for(var j=0;j<r.length;j++)out.push(r[j]);}catch(e){}}return out;}
async function run(){var res=[];for(var i=0;i<CHECKS.length;i++){var c=CHECKS[i];try{await new AF("$check","$q","$qa","$style","$text","$sleep","$type","$click","$eq","$rules",c.code)($check,$q,$qa,$style,$text,$sleep,$type,$click,$eq,$rules);res.push({name:c.name,pass:true,message:""});}catch(e){res.push({name:c.name,pass:false,message:String(e&&e.message||e)});}}
parent.postMessage({__cc:N,kind:"checks",results:res},"*");}
function go(){setTimeout(run,60);}
if(document.readyState==="complete")go();else window.addEventListener("load",go);
})();</script>`;
  }

  function injectAtStart(html, snippet) {
    const head = html.match(/<head(\s[^>]*)?>/i);
    if (head) return html.slice(0, head.index + head[0].length) + snippet + html.slice(head.index + head[0].length);
    const tag = html.match(/<html(\s[^>]*)?>/i);
    if (tag) return html.slice(0, tag.index + tag[0].length) + snippet + html.slice(tag.index + tag[0].length);
    const dt = html.match(/<!doctype[^>]*>/i);
    if (dt) return html.slice(0, dt.index + dt[0].length) + snippet + html.slice(dt.index + dt[0].length);
    return snippet + html;
  }

  function injectAtEnd(html, snippet) {
    const i = html.toLowerCase().lastIndexOf("</body>");
    if (i >= 0) return html.slice(0, i) + snippet + html.slice(i);
    const j = html.toLowerCase().lastIndexOf("</html>");
    if (j >= 0) return html.slice(0, j) + snippet + html.slice(j);
    return html + snippet;
  }

  function composeHTML(html, checks, n) {
    let doc = injectAtStart(String(html), consoleShim(n));
    if (checks && checks.length) doc = injectAtEnd(doc, checkerScript(n, checks));
    return doc;
  }

  /* Renders into the iframe you hand it, so the preview the checks look at
     is the preview you're looking at. Logs stream to onLog as they come. */
  function runHTML(html, checks, frame, opts) {
    const o = opts || {};
    const n = nonce();
    const timeoutMs = o.timeoutMs || 5000;
    return new Promise((resolve) => {
      const logs = [];
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMsg);
        clearTimeout(timer);
        resolve({ logs, ...r });
      };
      function onMsg(e) {
        if (e.source !== frame.contentWindow || !e.data || e.data.__cc !== n) return;
        if (e.data.kind === "log") {
          const line = (e.data.level === "error" ? "✕ " : e.data.level === "warn" ? "⚠ " : "") + String(e.data.text).slice(0, 4000);
          if (logs.length < 300) logs.push(line);
          if (o.onLog) o.onLog(line);
        } else if (e.data.kind === "checks") {
          const results = Array.isArray(e.data.results) ? e.data.results.map((r) => ({
            name: String(r.name), pass: r.pass === true, message: String(r.message || ""),
          })) : [];
          finish({ ok: results.every((r) => r.pass), results, error: null });
        }
      }
      window.addEventListener("message", onMsg);
      const timer = setTimeout(() => {
        if (checks && checks.length) {
          finish({ ok: false, results: [], error: { kind: "timeout", message: "The checks never reported back. An unclosed <script> or <!-- comment can swallow the rest of a page — or a script on it is stuck in a loop." } });
        } else {
          finish({ ok: true, results: [], error: null });
        }
      }, timeoutMs);
      if (!checks || !checks.length) {
        frame.addEventListener("load", () => setTimeout(() => finish({ ok: true, results: [], error: null }), 150), { once: true });
      }
      frame.srcdoc = composeHTML(html, checks, n);
    });
  }

  /* ================================================================
     Python
     ================================================================ */

  const PY_HARNESS = String.raw`
import sys, io, json, traceback

def __cc_helpers(buf):
    def _check(cond, msg="check failed"):
        if not cond:
            raise AssertionError(msg)
    def _eq(actual, expected, msg=None):
        if actual != expected:
            raise AssertionError((msg + ": " if msg else "") + "expected " + repr(expected) + ", got " + repr(actual))
    def _near(actual, expected, tol=1e-6, msg=None):
        try:
            ok = abs(actual - expected) <= tol
        except TypeError:
            ok = False
        if not ok:
            raise AssertionError((msg + ": " if msg else "") + "expected " + repr(expected) + " (±" + str(tol) + "), got " + repr(actual))
    def _output():
        return buf.getvalue()
    return {"_check": _check, "_eq": _eq, "_near": _near, "_output": _output}

def __cc_user_line(tb):
    line = None
    for fr in traceback.extract_tb(tb):
        if fr.filename == "your_code.py":
            line = fr.lineno
    return line

def __cc_run(code, tests, prelude=""):
    buf = io.StringIO()
    ns = {"__name__": "__main__"}
    result = {"ok": False, "error": None, "logs": [], "results": []}
    saved = (sys.stdout, sys.stderr)
    sys.stdout = sys.stderr = buf
    try:
        if prelude:
            exec(compile(prelude, "<setup>", "exec"), ns)
        try:
            compiled = compile(code, "your_code.py", "exec")
        except SyntaxError as e:
            result["error"] = {"kind": "syntax", "message": str(e.msg), "line": e.lineno}
            return result
        try:
            exec(compiled, ns)
        except KeyboardInterrupt:
            raise
        except BaseException as e:
            result["error"] = {"kind": "runtime", "message": type(e).__name__ + ": " + str(e), "line": __cc_user_line(e.__traceback__)}
        ns.update(__cc_helpers(buf))
        for t in tests:
            try:
                exec(compile(t["code"], "<check>", "exec"), ns)
                result["results"].append({"name": t["name"], "pass": True, "message": ""})
            except AssertionError as e:
                result["results"].append({"name": t["name"], "pass": False, "message": str(e) or "check failed"})
            except KeyboardInterrupt:
                raise
            except BaseException as e:
                line = __cc_user_line(e.__traceback__)
                msg = type(e).__name__ + ": " + str(e) + (" (your line " + str(line) + ")" if line else "")
                result["results"].append({"name": t["name"], "pass": False, "message": msg})
        result["ok"] = result["error"] is None and all(r["pass"] for r in result["results"])
    finally:
        sys.stdout, sys.stderr = saved
        result["logs"] = buf.getvalue().splitlines()[:300]
    return result

def __cc_run_json(payload):
    p = json.loads(payload)
    return json.dumps(__cc_run(p.get("code", ""), p.get("tests", []), p.get("prelude", "")))
`;

  /* Pinned, because an unpinned CDN URL is a different program every time
     a new version ships. Override it (for a mirror on your own machine, or
     to try a newer release) with
       localStorage["codeClinic.pyodideBase"] = "http://localhost:8001/"   */
  const PYODIDE_VERSION = "314.0.7";
  const PYODIDE_CDN = `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`;

  function pyodideBase() {
    try {
      const o = localStorage.getItem("codeClinic.pyodideBase");
      if (o && /^https?:\/\//.test(o)) return o.endsWith("/") ? o : o + "/";
    } catch { /* fall through to the CDN */ }
    return PYODIDE_CDN;
  }

  function pyWorkerSource(base) {
    return `
const BASE = ${JSON.stringify(base)};
const HARNESS = ${JSON.stringify(PY_HARNESS)};
let py = null;
const ready = (async () => {
  const mod = await import(BASE + "pyodide.mjs");
  py = await mod.loadPyodide({ indexURL: BASE });
  py.runPython(HARNESS);
  return mod.version || "";
})();
ready.then(
  (v) => self.postMessage({ type: "ready", version: v }),
  (e) => self.postMessage({ type: "fatal", message: String((e && e.message) || e) })
);
self.onmessage = async (e) => {
  const d = e.data;
  try { await ready; } catch { return; }
  let out;
  try {
    py.globals.set("__cc_payload", JSON.stringify({ code: d.code, tests: d.tests, prelude: d.prelude }));
    out = JSON.parse(py.runPython("__cc_run_json(__cc_payload)"));
  } catch (err) {
    out = { ok: false, error: { kind: "internal", message: String((err && err.message) || err) }, logs: [], results: [] };
  }
  self.postMessage({ type: "result", id: d.id, result: out });
};
`;
  }

  /* A page opened straight from disk has an opaque origin, and browsers
     won't let its module workers load Pyodide from a CDN. Everything else
     in the course works from disk; Python needs the page served. */
  const SERVE_HINT = "Python needs this page to be served rather than opened from a file: in your repository folder run  python3 -m http.server 8000  and open http://localhost:8000/learn/ — or use the published site.";
  const fromDisk = () => typeof location !== "undefined" && location.protocol === "file:";

  const python = {
    state: "idle",          // idle | loading | ready | error
    version: "",
    message: "",
    worker: null,
    readyPromise: null,
    pending: new Map(),
    seq: 0,
    listeners: [],

    onStatus(fn) { this.listeners.push(fn); },
    setState(state, message) {
      this.state = state;
      this.message = message || "";
      this.listeners.forEach((fn) => { try { fn(state, this.message); } catch { /* ignore */ } });
    },

    load() {
      if (this.readyPromise) return this.readyPromise;
      this.setState("loading", "Loading Python — about 12 MB the first time, cached after that…");
      this.readyPromise = new Promise((resolve, reject) => {
        let w;
        try {
          const url = URL.createObjectURL(new Blob([pyWorkerSource(pyodideBase())], { type: "text/javascript" }));
          w = new Worker(url, { type: "module" });
        } catch (e) {
          this.readyPromise = null;
          this.setState("error", `This browser can't start Python here (${e.message}).`);
          reject(e);
          return;
        }
        this.worker = w;
        const giveUp = setTimeout(() => {
          this.reset();
          this.setState("error", "Python didn't finish loading. It comes from cdn.jsdelivr.net — if that's blocked on this network, the Python lessons can't run here (everything else still works).");
          reject(new Error("load timeout"));
        }, 120000);
        w.onmessage = (e) => {
          const d = e.data || {};
          if (d.type === "ready") {
            clearTimeout(giveUp);
            this.version = d.version;
            this.setState("ready", `Python ready (Pyodide ${d.version})`);
            resolve();
          } else if (d.type === "fatal") {
            clearTimeout(giveUp);
            this.reset();
            this.setState("error", fromDisk() ? SERVE_HINT : `Python couldn't load: ${d.message}. It comes from cdn.jsdelivr.net — check you're online.`);
            reject(new Error(d.message));
          } else if (d.type === "result") {
            const p = this.pending.get(d.id);
            if (p) { this.pending.delete(d.id); p(d.result); }
          }
        };
        w.onerror = (e) => {
          clearTimeout(giveUp);
          e.preventDefault();
          this.reset();
          this.setState("error", fromDisk() ? SERVE_HINT
            : `Python's worker failed to start${e.message ? `: ${e.message}` : ""}. It needs a recent browser and a connection to cdn.jsdelivr.net.`);
          reject(new Error(e.message || "worker failed"));
        };
      });
      return this.readyPromise;
    },

    reset() {
      if (this.worker) this.worker.terminate();
      this.worker = null;
      this.readyPromise = null;
      for (const resolve of this.pending.values()) {
        resolve({ ok: false, error: { kind: "internal", message: "Python was restarted." }, logs: [], results: [] });
      }
      this.pending.clear();
    },

    /* A runaway loop can't be interrupted without cross-origin isolation,
       which static hosting doesn't give us — so a stuck run costs a
       restart, and the next run reloads Python from the browser cache. */
    async run(code, tests, opts) {
      const o = opts || {};
      try { await this.load(); }
      catch (e) {
        return { ok: false, error: { kind: "internal", message: this.message || String(e.message) }, logs: [], results: [] };
      }
      const id = ++this.seq;
      const timeoutMs = o.timeoutMs || 10000;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          this.reset();
          this.setState("idle", "Python was restarted after a run that didn't finish.");
          resolve({ ok: false, error: { kind: "timeout", message: `Stopped after ${timeoutMs / 1000} seconds — is there a while loop that never ends? Python will restart on your next run.` }, logs: [], results: [] });
        }, timeoutMs);
        this.pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
        this.worker.postMessage({ id, code: String(code), tests: tests || [], prelude: o.prelude || "" });
      });
    },
  };

  CC.sandbox = {
    jsHarness, runJS,
    runHTML, composeHTML, injectAtStart, injectAtEnd,
    PY_HARNESS, PYODIDE_VERSION, pyodideBase, python,
  };
})(window.CC);
