/* ================================================
   MARGINALIA — js/app.js
   The page's own wiring.

   State is deliberately small and flat: which notebook, which sources
   are ticked, which models are chosen, and whatever the last answer
   cited. Everything else is asked for again when it is needed, because
   the server is on the same machine and a fetch to localhost costs
   nothing — where a stale cache costs a wrong page number in a
   citation, which is the one thing this application cannot afford.
   ================================================ */

import { get, post, del, upload, events } from "./api.js";
import { markdown, verifiedMarkdown, groundingBar, verdictTag, escapeHTML } from "./render.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  notebooks: [],
  notebook: null,
  selected: new Set(),          // source ids to search; empty means all of them
  models: { chat: [], embed: [], recommended: null },
  passages: new Map(),          // "S1:p4" -> passage text from the last retrieval
  pages: new Map(),             // sourceId -> [{ number, text }]
  diagram: null,
  deck: null,
  board: null,
  found: [],                    // the last catalogue search
  refs: [],                     // references resolved out of a source
};

const remember = (k, v) => { try { localStorage.setItem(`marginalia.${k}`, v); } catch { /* private mode */ } };
const recall = (k) => { try { return localStorage.getItem(`marginalia.${k}`); } catch { return null; } };

function toast(message, ms = 4200) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), ms);
}

const busy = (button, on, label) => {
  if (!button) return;
  button.disabled = on;
  if (on) { button.dataset.label = button.textContent; button.textContent = label || "working…"; }
  else if (button.dataset.label) button.textContent = button.dataset.label;
};

/* ---- models and health --------------------------------------------- */

async function loadModels() {
  const data = await get("/api/models");
  state.models = data;
  const chat = $("#chatModel");
  const embed = $("#embedModel");

  chat.innerHTML = data.chat.length
    ? data.chat.map((m) => `<option value="${escapeHTML(m.name)}">${escapeHTML(m.name)}${m.parameters ? ` · ${escapeHTML(m.parameters)}` : ""}</option>`).join("")
    : `<option value="">none installed</option>`;
  embed.innerHTML =
    `<option value="">keywords only</option>` +
    data.embed.map((m) => `<option value="${escapeHTML(m.name)}">${escapeHTML(m.name)}</option>`).join("");

  const savedChat = recall("chatModel");
  const savedEmbed = recall("embedModel");
  if (savedChat && data.chat.some((m) => m.name === savedChat)) chat.value = savedChat;
  if (savedEmbed && data.embed.some((m) => m.name === savedEmbed)) embed.value = savedEmbed;
  else if (data.embed.length) embed.value = data.embed[0].name;

  if (!data.chat.length && data.recommended) {
    const first = data.recommended.chat[0];
    toast(`No models installed yet. In a terminal: ollama pull ${first.name} (${first.ram})`, 12000);
  }
}

async function health() {
  const el = $("#health");
  try {
    const h = await get("/api/health");
    if (h.ollama.up) {
      el.textContent = `ollama · ${h.ollama.chat} models`;
      el.className = "health up";
    } else {
      el.textContent = "ollama not running";
      el.className = "health down";
      el.title = h.ollama.error || "";
    }
    if (h.video) showTools(h.video, h.ocr);
    else if (h.probing) tools();                     // the answer is on its way
  } catch {
    el.textContent = "server unreachable";
    el.className = "health down";
  }
}

/* What ffmpeg, a browser and an OCR engine can do between them. Asked
   once, separately from health, because finding out means launching
   those programs and nobody should wait for that to read a PDF. */
let toolsAsked = false;
async function tools() {
  if (toolsAsked) return;
  toolsAsked = true;
  try {
    const t = await get("/api/tools");
    showTools(t.video, t.ocr);
  } catch { toolsAsked = false; }
}

function showTools(video, ocr) {
  if (!video) return;
  $("#videoCaps").textContent = video.canRender
    ? `This machine can render a file: ${video.h264 ? "MP4" : "WebM"}${video.tts ? `, narrated by ${video.tts}` : ", silent (the player speaks aloud instead)"}.` +
      (ocr && ocr.available ? ` Scans can be read with ${ocr.engine}.` : "")
    : "No ffmpeg or browser found for rendering — you still get the storyboard, the script, and a player that reads itself aloud." +
      (ocr && ocr.available ? ` Scans can be read with ${ocr.engine}.` : "");
  if (state.board) $("#renderBtn").disabled = !video.canRender;
}

/* ---- notebooks ------------------------------------------------------ */

async function loadNotebooks(selectId) {
  const { notebooks } = await get("/api/notebooks");
  state.notebooks = notebooks;
  const list = $("#notebookList");
  list.innerHTML = notebooks.length
    ? notebooks.map((n) => `
        <li data-id="${escapeHTML(n.id)}" class="${n.id === selectId ? "active" : ""}">
          <span class="t">${escapeHTML(n.title)}</span>
          <span class="n">${n.sources} src · ${n.pages}p</span>
        </li>`).join("")
    : `<li class="muted small" style="cursor:default">No notebooks yet — press +</li>`;

  const wanted = selectId || recall("notebook") || (notebooks[0] && notebooks[0].id);
  if (wanted && notebooks.some((n) => n.id === wanted)) await openNotebook(wanted);
}

async function openNotebook(id) {
  state.notebook = await get(`/api/notebooks/${id}`);
  state.selected.clear();
  state.passages.clear();
  state.pages.clear();
  remember("notebook", id);
  $$("#notebookList li").forEach((li) => li.classList.toggle("active", li.dataset.id === id));
  drawSources();
  drawNotes();
  drawRefSources();
  $("#thread").innerHTML = `<div class="empty"><h3>${escapeHTML(state.notebook.title)}</h3>
    <p>${state.notebook.sources.length
      ? "Ask anything about the sources on the left. Every sentence will carry the page it came from."
      : "Add a PDF on the left to begin."}</p></div>`;
}

function drawSources() {
  const nb = state.notebook;
  const list = $("#sourceList");
  if (!nb) { list.innerHTML = ""; return; }
  drawRefSources();
  $("#sourceCount").textContent = nb.sources.length
    ? `${nb.sources.length} · ${nb.sources.reduce((n, s) => n + (s.pageCount || 0), 0)} pages`
    : "";

  list.innerHTML = nb.sources.map((s) => `
    <li data-id="${escapeHTML(s.id)}" class="${state.selected.has(s.id) ? "selected" : ""}">
      <div class="row">
        <div>
          <div class="title">${escapeHTML(s.title)}</div>
          <div class="meta">
            ${s.pageCount} pages · ${(s.chars / 1000).toFixed(0)}k chars ·
            <span class="badge ${s.indexed ? "indexed" : ""}">${s.indexed ? `${s.indexed.chunks} chunks${s.indexed.embedModel ? " · embedded" : ""}` : "not indexed"}</span>
          </div>
        </div>
        <button class="icon-btn drop-source" title="Remove from the notebook">×</button>
      </div>
      ${(s.warnings || []).map((w) => `<div class="warn">${escapeHTML(w)}</div>`).join("")}
      ${looksScanned(s) ? `<button class="linklike ocr-source" data-ocr="${escapeHTML(s.id)}">read it with OCR</button>` : ""}
    </li>`).join("");
}

/* A PDF with almost no text on the page is a photograph of a page. The
   button only appears where it would actually do something. */
const looksScanned = (s) =>
  s.kind === "pdf" && (s.chars < (s.pageCount || 1) * 200 || (s.warnings || []).some((w) => /scan|OCR|no text/i.test(w)));

/* Ticking sources narrows every question, summary and diagram to them.
   Nothing ticked means the whole notebook, which is what people
   expect and what they get by default. */
$("#sourceList").addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest("[data-ocr]")) return runOCR(id);
  if (e.target.closest(".drop-source")) {
    if (!confirm("Remove this source from the notebook? The file is deleted from the library.")) return;
    await del(`/api/notebooks/${state.notebook.id}/sources/${id}`);
    state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
    state.selected.delete(id);
    drawSources();
    return;
  }
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  drawSources();
});

const sourceIds = () => (state.selected.size ? [...state.selected] : null);

const ask = () => ({
  model: $("#chatModel").value,
  embedModel: $("#embedModel").value || null,
  sourceIds: sourceIds(),
  pace: $("#pace").value,
});

/* A clock, for the waits that cannot be streamed. Knowing a thing has
   been going for eighteen seconds is the difference between waiting and
   wondering whether it has died. */
function waiting(el, what) {
  const started = Date.now();
  el.innerHTML = `<div class="waiting"><span>${escapeHTML(what)}<span class="dots"></span></span><span class="elapsed"></span></div>`;
  const elapsed = el.querySelector(".elapsed");
  const timer = setInterval(() => {
    elapsed.textContent = `${Math.round((Date.now() - started) / 1000)}s`;
  }, 500);
  return {
    say(text) { const line = el.querySelector(".waiting span"); if (line) line.firstChild.textContent = text; },
    stop() { clearInterval(timer); },
    seconds: () => (Date.now() - started) / 1000,
  };
}

/* What the last answer cost, in the terms that matter on a laptop:
   how long before it started (the model reading the passages) and how
   fast it wrote. Shown because a person who can see the cost can make
   a sensible decision about the pace control; a spinner teaches
   nothing. */
let slowWarned = false;
function speedLine(stats, firstToken) {
  if (!stats) return "";
  if (stats.cached) {
    return `<div class="speed">from memory — you asked this before${stats.asked > 1 ? ` (${stats.asked} times)` : ""}. ` +
      `<button class="linklike again">ask it again properly</button></div>`;
  }
  const bits = [];
  if (firstToken != null) bits.push(`${firstToken}s reading ${stats.promptTokens || "?"} tokens`);
  if (stats.rate) bits.push(`${stats.rate} tokens/s writing`);
  if (!bits.length) return "";
  const slow = stats.slow;
  if (slow && !slowWarned) {
    slowWarned = true;
    toast("That was slow. Try the pace control (top right) on Fast, or a smaller model — llama3.1:8b is two to three times quicker.", 14000);
  }
  return `<div class="speed${slow ? " slow" : ""}">${bits.join(" · ")}</div>`;
}

function requireNotebook() {
  if (!state.notebook) { toast("Make a notebook first."); return false; }
  if (!state.notebook.sources.length) { toast("Add a PDF first — there is nothing to read yet."); return false; }
  if (!$("#chatModel").value) { toast("No model selected. Install one with: ollama pull qwen2.5:14b-instruct"); return false; }
  return true;
}

/* ---- adding sources -------------------------------------------------- */

async function addFiles(files) {
  if (!state.notebook) { await newNotebook(files[0] ? files[0].name.replace(/\.[a-z0-9]+$/i, "") : "Notebook"); }
  for (const file of files) {
    toast(`Reading ${file.name}…`, 60000);
    try {
      const { source } = await upload(`/api/notebooks/${state.notebook.id}/sources`, file);
      state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
      drawSources();
      toast(
        (source.warnings || []).length
          ? `${source.title}: ${source.warnings[0]}`
          : `${source.title} — ${source.pageCount} pages read.`,
        (source.warnings || []).length ? 12000 : 3500
      );
    } catch (e) {
      toast(`${file.name}: ${e.message}`, 9000);
    }
  }
  await loadNotebooks(state.notebook.id);
}

$("#browse").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (e) => addFiles([...e.target.files]));

const drop = $("#drop");
["dragenter", "dragover"].forEach((type) =>
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("over"); })
);
["dragleave", "drop"].forEach((type) =>
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove("over"); })
);
drop.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files]));

$("#addUrl").addEventListener("click", async () => {
  const url = prompt("Address of a paper or page to add:");
  if (!url) return;
  if (!state.notebook) await newNotebook("Notebook");
  try {
    toast("Fetching…", 30000);
    const { source } = await post(`/api/notebooks/${state.notebook.id}/sources/url`, { url });
    state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
    drawSources();
    toast(`${source.title} — ${source.pageCount} pages.`);
  } catch (e) { toast(e.message, 8000); }
});

async function newNotebook(defaultTitle) {
  const title = defaultTitle || prompt("What is this notebook about?", "Untitled notebook");
  if (!title) return;
  const nb = await post("/api/notebooks", { title });
  await loadNotebooks(nb.id);
}
$("#newNotebook").addEventListener("click", () => newNotebook());
$("#notebookList").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li) openNotebook(li.dataset.id);
});

/* ---- indexing -------------------------------------------------------- */

$("#indexBtn").addEventListener("click", async () => {
  if (!state.notebook || !state.notebook.sources.length) return toast("Nothing to index yet.");
  const embedModel = $("#embedModel").value || null;
  const box = $("#indexProgress");
  const bar = box.querySelector(".bar");
  const label = box.querySelector(".label");
  box.classList.remove("hidden");
  busy($("#indexBtn"), true, "indexing…");
  let current = "";
  try {
    await events(`/api/notebooks/${state.notebook.id}/index`, { embedModel }, {
      source: (s) => { current = s.title; label.textContent = s.skipped ? `${s.title} — already done` : `${s.title} — ${s.chunks} chunks`; },
      progress: (p) => {
        bar.style.setProperty("--pct", `${Math.round((p.done / p.total) * 100)}%`);
        label.textContent = `${current} — ${p.done} of ${p.total} chunks`;
      },
      indexed: () => { bar.style.setProperty("--pct", "100%"); },
      done: () => toast(embedModel ? "Indexed and embedded." : "Chunked. Pick an embedding model for search by meaning."),
      onError: (e) => toast(e.message, 9000),
    }).done;
  } catch (e) {
    toast(e.message, 9000);
  } finally {
    busy($("#indexBtn"), false);
    setTimeout(() => box.classList.add("hidden"), 2500);
    state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
    drawSources();
  }
});

/* ---- evidence -------------------------------------------------------- */

function notePassages(passages) {
  for (const p of passages) state.passages.set(p.label.replace(/[[\]]/g, ""), p);
}

async function showEvidence(sourceIndex, page) {
  const nb = state.notebook;
  const source = nb.sources[sourceIndex - 1];
  const body = $("#evidenceBody");
  $(".layout").classList.add("showing-evidence");
  if (!source) { body.innerHTML = `<p class="muted small">This citation names source ${sourceIndex}, which this notebook does not have.</p>`; return; }

  const key = `S${sourceIndex}${page ? `:p${page}` : ""}`;
  const passage = state.passages.get(key);
  body.innerHTML = `<p class="muted small">Loading ${escapeHTML(source.title)}${page ? `, page ${page}` : ""}…</p>`;

  if (!state.pages.has(source.id)) {
    const { pages } = await get(`/api/notebooks/${nb.id}/sources/${source.id}/pages`);
    state.pages.set(source.id, pages);
  }
  const pages = state.pages.get(source.id);
  const full = page ? pages.find((p) => p.number === Number(page)) : null;

  body.innerHTML = `
    <div class="passage">
      <div class="where">${escapeHTML(source.title)}${page ? ` · page ${page}` : ""}</div>
      ${passage ? `<div class="text">${escapeHTML(passage.preview)}…</div>` : `<div class="muted small">The retrieved passage is not in this view; the whole page is below.</div>`}
    </div>
    ${full ? `<div class="passage"><div class="where">page ${full.number}, in full</div><div class="text">${escapeHTML(full.text.slice(0, 6000))}</div></div>` : ""}
    <p class="small"><a href="/api/notebooks/${nb.id}/sources/${source.id}/file" target="_blank">open the original PDF</a></p>`;
}

document.addEventListener("click", (e) => {
  const cite = e.target.closest(".cite");
  if (cite) showEvidence(Number(cite.dataset.source), cite.dataset.page);
  const again = e.target.closest(".again");
  if (again) {
    const turn = again.closest(".turn");
    const asked = turn && turn.previousElementSibling;
    if (asked && asked.classList.contains("you")) sendQuestion(asked.textContent.trim(), { fresh: true });
  }
});
$("#closeEvidence").addEventListener("click", () => $(".layout").classList.remove("showing-evidence"));

/* ---- getting the model ready ------------------------------------------ */
/*
   Loading nine gigabytes takes as long as it takes, but it does not
   have to happen while somebody waits for an answer. Clicking into the
   question box, or opening a tab that will need the model, is enough
   warning to start.
*/
const warmed = new Set();
function warm() {
  const model = $("#chatModel").value;
  if (!model || warmed.has(model)) return;
  warmed.add(model);
  post("/api/warm", { model }).catch(() => warmed.delete(model));
}

$("#question").addEventListener("focus", warm, { once: false });
$("#tabs").addEventListener("click", (e) => { if (e.target.closest(".tab")) warm(); });
$("#chatModel").addEventListener("change", warm);

/* ---- how fast is this machine? ---------------------------------------- */

$("#measure").addEventListener("click", async () => {
  const model = $("#chatModel").value;
  if (!model) return toast("No model selected.");
  busy($("#measure"), true, "measuring…");
  try {
    const b = await post("/api/benchmark", { model });
    const verdict =
      b.writing >= 20 ? "That is quick — a GPU is doing the work." :
      b.writing >= 10 ? "Comfortable." :
      b.writing >= 5 ? "Usable, but a smaller model would feel much better." :
      "Slow. Try llama3.1:8b or qwen2.5:7b-instruct, and the Fast pace.";
    toast(
      `${model}: reads about ${b.reading} tokens/s, writes ${b.writing} tokens/s ` +
      `(${b.firstToken}s to the first word). ${verdict}`,
      16000
    );
  } catch (e) {
    toast(e.message, 9000);
  } finally {
    busy($("#measure"), false);
  }
});

/* ---- asking ---------------------------------------------------------- */

$("#askForm").addEventListener("submit", (e) => { e.preventDefault(); sendQuestion(); });

$("#question").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
});

const history = [];

async function sendQuestion(text, { fresh = false } = {}) {
  if (!requireNotebook()) return;
  const input = $("#question");
  const question = (text || input.value).trim();
  if (!question) return;
  if (!text) input.value = "";

  const thread = $("#thread");
  if (thread.querySelector(".empty")) thread.innerHTML = "";
  thread.insertAdjacentHTML("beforeend", `<div class="turn you"><div class="who">you</div>${escapeHTML(question)}</div>`);

  const turn = document.createElement("div");
  turn.className = "turn";
  turn.innerHTML = `<div class="who">marginalia</div><div class="passages"></div><div class="prose">…</div>`;
  thread.append(turn);
  thread.scrollTop = thread.scrollHeight;

  const chips = turn.querySelector(".passages");
  const prose = turn.querySelector(".prose");
  let answer = "";
  let stats = null;
  let firstToken = null;
  const clock = waiting(prose, "reading the passages");

  try {
    await events(`/api/notebooks/${state.notebook.id}/ask`, { ...ask(), question, fresh, history: fresh ? [] : history.slice(-6) }, {
      context: (ctx) => {
        notePassages(ctx.passages);
        chips.innerHTML =
          `<span class="chip" style="cursor:default" title="how the passages were found">${ctx.retrieval}</span>` +
          ctx.passages.map((p) => `<button class="chip cite" data-source="${p.label.match(/S(\d+)/)[1]}" data-page="${p.page}">${escapeHTML(p.label)}</button>`).join("");
      },
      first: (f) => { firstToken = f.cached ? null : f.seconds; clock.stop(); },
      stats: (s) => { stats = s; },
      token: (t) => {
        answer += t.delta;
        prose.innerHTML = markdown(answer);
        thread.scrollTop = thread.scrollHeight;
      },
      verified: (report) => {
        clock.stop();
        prose.innerHTML = verifiedMarkdown(answer, report) + groundingBar(report) + speedLine(stats, firstToken);
        turn.insertAdjacentHTML("beforeend",
          `<div class="grounding"><button class="ghost small keep">keep as a note</button></div>`);
        turn.querySelector(".keep").addEventListener("click", async () => {
          await post(`/api/notebooks/${state.notebook.id}/notes`, {
            title: question.slice(0, 80), body: answer, kind: "answer", citations: report.citations,
          });
          state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
          drawNotes();
          toast("Kept in Notes.");
        });
      },
      onError: (err) => { clock.stop(); prose.innerHTML = `<p class="muted">${escapeHTML(err.message)}</p>`; },
    }).done;
    history.push({ role: "user", content: question }, { role: "assistant", content: answer });
  } catch (e) {
    prose.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    clock.stop();
  }
}

/* ---- summaries -------------------------------------------------------- */

$("#summariseBtn").addEventListener("click", async () => {
  if (!requireNotebook()) return;
  const out = $("#summaryOut");
  const clock = waiting(out, "reading the sources");
  busy($("#summariseBtn"), true);
  let text = "";
  let stats = null;
  try {
    await events(`/api/notebooks/${state.notebook.id}/summarise`, {
      ...ask(), kind: $("#summaryKind").value, focus: $("#summaryFocus").value.trim() || null,
    }, {
      stats: (s) => { stats = s; },
      token: (t) => { clock.stop(); text += t.delta; out.innerHTML = markdown(text); },
      verified: (report) => {
        clock.stop();
        out.innerHTML = verifiedMarkdown(text, report) + groundingBar(report) + speedLine(stats, null) +
          `<div class="grounding"><button class="ghost small" id="keepSummary">keep as a note</button></div>`;
        $("#keepSummary").addEventListener("click", async () => {
          await post(`/api/notebooks/${state.notebook.id}/notes`, {
            title: `Summary — ${$("#summaryKind").value}`, body: text, kind: "summary",
          });
          state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
          drawNotes();
          toast("Kept in Notes.");
        });
      },
      onError: (e) => { out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`; },
    }).done;
  } catch (e) {
    out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    clock.stop();
    busy($("#summariseBtn"), false);
  }
});

/* Diagrams, decks and plans come back as JSON — there is no half a
   diagram to show — so what streams is progress rather than content:
   what the model is reading, and how much it has written so far. */
function streamed(path, body, clock, writingLabel) {
  return new Promise((resolve, reject) => {
    let result = null;
    events(path, body, {
      reading: (r) => clock.say(`reading ${r.passages} passages (${(r.chars / 1000).toFixed(1)}k characters)`),
      progress: (p) => clock.say(p.chars ? `${writingLabel} — ${p.chars} characters` : writingLabel),
      done: (d) => { result = d; },
      onError: (e) => reject(e),
    }).done.then(
      () => (result ? resolve(result) : reject(new Error("the model stopped before it finished"))),
      reject
    );
  });
}

/* ---- diagram ---------------------------------------------------------- */

$("#diagramBtn").addEventListener("click", async () => {
  if (!requireNotebook()) return;
  const out = $("#diagramOut");
  const clock = waiting(out, "reading the sources");
  busy($("#diagramBtn"), true, "drawing…");
  try {
    const graph = await streamed(`/api/notebooks/${state.notebook.id}/diagram`, {
      ...ask(), kind: $("#diagramKind").value, topic: $("#diagramTopic").value.trim() || null,
      theme: document.body.classList.contains("dark") ? "dark" : "light",
    }, clock, "working out the shape");
    state.diagram = graph;
    $("#diagramSvg").disabled = false;
    $("#diagramMermaid").disabled = false;
    out.innerHTML = `
      ${graph.svg}
      <div class="diagram-meta">
        <p><strong>${escapeHTML(graph.title)}</strong> — ${escapeHTML(graph.summary || "")}</p>
        ${graph.missing ? `<p class="muted"><em>Not covered by these sources: ${escapeHTML(graph.missing)}</em></p>` : ""}
        <p class="small muted">${graph.check.supported} of ${graph.nodes.length} boxes quote the page they cite.
          ${graph.check.unsupported ? "Dashed boxes could not be found in the sources — check them." : ""}</p>
        <table class="node-table">
          <tr><th>Box</th><th>Evidence</th><th>From</th><th></th></tr>
          ${graph.nodes.map((n) => `
            <tr>
              <td>${escapeHTML(n.label)}</td>
              <td class="muted">${escapeHTML(n.evidence)}</td>
              <td>${n.cite ? `<button class="cite" data-source="${(n.cite.match(/S(\d+)/) || [])[1] || 1}" data-page="${n.page || ""}">${escapeHTML(n.cite)}</button>` : ""}</td>
              <td>${verdictTag(n.verdict)}</td>
            </tr>`).join("")}
        </table>
      </div>`;
  } catch (e) {
    out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    clock.stop();
    busy($("#diagramBtn"), false);
  }
});

$("#diagramSvg").addEventListener("click", async () => {
  const { url, name } = await post(`/api/notebooks/${state.notebook.id}/diagram/export`, {
    graph: state.diagram, theme: document.body.classList.contains("dark") ? "dark" : "light",
  });
  window.open(url, "_blank");
  toast(`Saved ${name} in the notebook's out/ folder.`);
});

$("#diagramMermaid").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.diagram.mermaid);
    toast("Mermaid source copied.");
  } catch {
    toast("Clipboard refused; the Mermaid source is in the saved SVG's sibling file.");
  }
});

/* ---- slides ------------------------------------------------------------ */

$("#deckBtn").addEventListener("click", async () => {
  if (!requireNotebook()) return;
  const out = $("#deckOut");
  const clock = waiting(out, "reading the sources");
  busy($("#deckBtn"), true, "writing…");
  try {
    const deck = await streamed(`/api/notebooks/${state.notebook.id}/deck`, {
      ...ask(), topic: $("#deckTopic").value.trim() || null, diagram: $("#deckDiagram").checked,
      theme: document.body.classList.contains("dark") ? "dark" : "light",
    }, clock, "writing the slides");
    state.deck = deck;
    $("#deckExport").disabled = false;
    out.innerHTML = `
      <div class="slide"><h3>${escapeHTML(deck.title)}</h3><p class="muted">${escapeHTML(deck.subtitle || "")}</p>
        <p class="small muted">${escapeHTML(deck.sourceLine)}</p></div>
      ${deck.slides.map((s) => `
        <div class="slide">
          <h3>${escapeHTML(s.title)}</h3>
          ${s.diagram ? (s.diagram.svg || (deck.diagram && deck.diagram.svg) || "") : ""}
          <ul>${(s.bullets || []).map((b) => `
            <li>${escapeHTML(b.text)}
              ${b.cite ? `<button class="cite" data-source="${(b.cite.match(/S(\d+)/) || [])[1] || 1}" data-page="${b.page || ""}">${escapeHTML(b.cite)}</button>` : ""}
              ${b.verdict && b.verdict !== "supported" ? verdictTag(b.verdict) : ""}
            </li>`).join("")}</ul>
          ${s.quote ? `<blockquote class="muted">${escapeHTML(s.quote)}</blockquote>` : ""}
          ${s.notes ? `<div class="notes">${escapeHTML(s.notes)}</div>` : ""}
        </div>`).join("")}
      ${deck.closing ? `<div class="slide"><h3>In one sentence</h3><p>${escapeHTML(deck.closing)}</p></div>` : ""}
      <p class="small muted">${deck.check.supported} of ${deck.check.bullets} bullets quote their page.</p>`;
  } catch (e) {
    out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    clock.stop();
    busy($("#deckBtn"), false);
  }
});

$("#deckExport").addEventListener("click", async () => {
  busy($("#deckExport"), true, "saving…");
  try {
    const { url, name } = await post(`/api/notebooks/${state.notebook.id}/deck/export`, state.deck);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    toast(`${name} saved and downloading.`);
  } catch (e) { toast(e.message, 8000); }
  finally { busy($("#deckExport"), false); }
});

/* ---- study plan --------------------------------------------------------- */

$("#planBtn").addEventListener("click", async () => {
  if (!requireNotebook()) return;
  const out = $("#planOut");
  const clock = waiting(out, "reading the sources");
  busy($("#planBtn"), true, "planning…");
  try {
    const plan = await streamed(`/api/notebooks/${state.notebook.id}/plan`, {
      ...ask(), goal: $("#planGoal").value.trim() || null,
      days: Number($("#planDays").value) || 7, minutes: Number($("#planMinutes").value) || 60,
    }, clock, "working out an order");
    out.innerHTML = `
      <p class="prose">${escapeHTML(plan.overview)}</p>
      <p class="small muted">${plan.sessions.length} sessions · about ${Math.round(plan.totalMinutes / 60)} hours in total</p>
      ${plan.sessions.map((s) => `
        <div class="session">
          <div class="day">Day ${s.day} · ${s.minutes} min ${verdictTag(s.verdict)}</div>
          <h3>${escapeHTML(s.title)}</h3>
          <div class="read"><strong>Read:</strong> ${escapeHTML(s.read)}
            ${s.cite ? `<button class="cite" data-source="${(s.cite.match(/S(\d+)/) || [])[1] || 1}" data-page="${s.page || ""}">${escapeHTML(s.cite)}</button>` : ""}</div>
          ${s.why ? `<div class="check">${escapeHTML(s.why)}</div>` : ""}
          <div class="check"><strong>You should be able to answer:</strong> ${escapeHTML(s.check)}</div>
          ${s.recall.length ? `<ul class="recall">${s.recall.map((q) => `<li>${escapeHTML(q)}</li>`).join("")}</ul>` : ""}
        </div>`).join("")}
      ${plan.gaps ? `<p class="muted"><em>Not in your sources: ${escapeHTML(plan.gaps)}</em></p>` : ""}
      <button class="ghost" id="keepPlan">keep as a note</button>`;
    $("#keepPlan").addEventListener("click", async () => {
      const body = plan.sessions.map((s) => `Day ${s.day} (${s.minutes}m) — ${s.title}\nRead: ${s.read}\nCheck: ${s.check}`).join("\n\n");
      await post(`/api/notebooks/${state.notebook.id}/notes`, { title: plan.goal || "Study plan", body, kind: "plan" });
      state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
      drawNotes();
      toast("Kept in Notes.");
    });
  } catch (e) {
    out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    clock.stop();
    busy($("#planBtn"), false);
  }
});

/* ---- video --------------------------------------------------------------- */

$("#storyboardBtn").addEventListener("click", async () => {
  if (!requireNotebook()) return;
  const out = $("#videoOut");
  out.innerHTML = "<p class='muted'>writing the script…</p>";
  busy($("#storyboardBtn"), true, "writing…");
  try {
    const board = await post(`/api/notebooks/${state.notebook.id}/storyboard`, {
      ...ask(), topic: $("#videoTopic").value.trim() || null, minutes: Number($("#videoMinutes").value) || 3,
      diagramSVG: state.diagram ? state.diagram.svg : null,
    });
    state.board = board;
    $("#renderBtn").disabled = !(board.capabilities && board.capabilities.canRender);
    out.innerHTML = `
      <p><strong>${escapeHTML(board.title)}</strong> · ${board.scenes.length} scenes · about ${Math.round(board.seconds)}s</p>
      <p class="small">
        <a href="${board.player}" target="_blank">open the player</a> (it reads itself aloud) ·
        <a href="${board.script}" target="_blank">narration script</a>
      </p>
      ${board.scenes.map((s, i) => `
        <div class="scene">
          <h3>${i + 1}. ${escapeHTML(s.heading)} <span class="muted small">${s.seconds}s</span> ${verdictTag(s.verdict)}</h3>
          ${s.onScreen.length ? `<div class="onscreen">on screen: ${s.onScreen.map(escapeHTML).join(" · ")}</div>` : ""}
          <p class="narration">${escapeHTML(s.narration)}</p>
          <p class="small muted">“${escapeHTML(s.evidence)}”
            ${s.cite ? `<button class="cite" data-source="${(s.cite.match(/S(\d+)/) || [])[1] || 1}" data-page="${s.page || ""}">${escapeHTML(s.cite)}</button>` : ""}</p>
        </div>`).join("")}`;
  } catch (e) {
    out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    busy($("#storyboardBtn"), false);
  }
});

$("#renderBtn").addEventListener("click", async () => {
  if (!state.board) return;
  busy($("#renderBtn"), true, "rendering…");
  const out = $("#videoOut");
  const status = document.createElement("p");
  status.className = "small muted";
  out.prepend(status);
  try {
    await events(`/api/notebooks/${state.notebook.id}/video`, state.board, {
      progress: (p) => { status.textContent = p.step === "frames" ? `frame ${p.done} of ${p.total}…` : p.step === "voice" ? `narrating scene ${p.done} of ${p.total}…` : "encoding…"; },
      done: (r) => {
        status.innerHTML = `<a href="${r.url}" target="_blank">${escapeHTML(r.name)}</a> is ready${r.silent ? " (silent — no speech engine found)" : ` (narrated by ${escapeHTML(r.tts)})`}.`;
        toast("Video rendered.");
      },
      onError: (e) => { status.textContent = e.message; },
    }).done;
  } catch (e) {
    status.textContent = e.message;
  } finally {
    busy($("#renderBtn"), false);
  }
});

/* ---- notes ---------------------------------------------------------------- */

function drawNotes() {
  const list = $("#noteList");
  const notes = (state.notebook && state.notebook.notes) || [];
  list.innerHTML = notes.length
    ? notes.map((n) => `
        <div class="note" data-id="${escapeHTML(n.id)}">
          <h3>${escapeHTML(n.title)}</h3>
          <div class="body">${markdown(n.body)}</div>
          <div class="meta"><span>${n.kind}</span><span>${new Date(n.created).toLocaleString()}</span>
            <button class="linklike drop-note">delete</button></div>
        </div>`).join("")
    : `<p class="muted small">Nothing kept yet. Answers, summaries and plans can be kept here with one click.</p>`;
}

$("#noteAdd").addEventListener("click", async () => {
  if (!state.notebook) return toast("Make a notebook first.");
  const title = $("#noteTitle").value.trim() || "Note";
  const body = $("#noteBody").value.trim();
  if (!body) return toast("Nothing to keep.");
  await post(`/api/notebooks/${state.notebook.id}/notes`, { title, body });
  $("#noteTitle").value = ""; $("#noteBody").value = "";
  state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
  drawNotes();
});

$("#noteList").addEventListener("click", async (e) => {
  if (!e.target.closest(".drop-note")) return;
  const id = e.target.closest(".note").dataset.id;
  await del(`/api/notebooks/${state.notebook.id}/notes/${id}`);
  state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
  drawNotes();
});

/* ---- OCR --------------------------------------------------------------- */
/*
   Long-running and worth watching: a hundred-page scan is minutes, not
   seconds. When it finishes the old index is gone — it described text
   that no longer exists — so the person is told to rebuild it.
*/

async function runOCR(sourceId) {
  const source = state.notebook.sources.find((s) => s.id === sourceId);
  if (!source) return;
  toast(`Reading ${source.title} with OCR — this takes a while…`, 600000);
  try {
    await events(`/api/notebooks/${state.notebook.id}/sources/${sourceId}/ocr`, { language: recall("ocrLanguage") || "eng" }, {
      started: (caps) => toast(`OCR running (${caps.engine})…`, 600000),
      progress: (p) => {
        if (p.total) toast(`OCR: page ${p.done} of ${p.total}…`, 600000);
        else if (p.step === "rendering") toast("OCR: rendering the pages…", 600000);
      },
      done: (r) => toast(`${r.note} Rebuild the index to search it.`, 12000),
      onError: (e) => toast(e.message, 15000),
    }).done;
  } catch (e) {
    toast(e.message, 15000);
  }
  state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
  drawSources();
}

/* ---- finding papers ----------------------------------------------------- */
/*
   The only outward-facing part of the application. Results are records
   until somebody presses Add; that press is what fetches a file, and
   only from a catalogue that says the file is open.
*/

const chosenProviders = () => $$("#providerPicks input:checked").map((i) => i.value);

async function loadProviders() {
  try {
    const { providers } = await get("/api/discover/providers");
    const saved = (recall("providers") || "arxiv,openalex,crossref").split(",");
    $("#providerPicks").innerHTML = providers.map((p) => `
      <label class="check" title="${escapeHTML(p.note)}">
        <input type="checkbox" value="${escapeHTML(p.id)}" ${saved.includes(p.id) ? "checked" : ""} /> ${escapeHTML(p.label)}
      </label>`).join("");
    $("#providerPicks").addEventListener("change", () => remember("providers", chosenProviders().join(",")));
  } catch { /* the tab still works; a failed search will say why */ }
}

$("#findBtn").addEventListener("click", async () => {
  const query = $("#findQuery").value.trim();
  if (!query) return toast("Search for what?");
  const out = $("#findOut");
  out.innerHTML = "<p class='muted'>asking the catalogues…</p>";
  busy($("#findBtn"), true, "searching…");
  try {
    const found = await post("/api/discover/search", { query, providers: chosenProviders(), limit: 10 });
    state.found = found.results;
    out.innerHTML =
      (found.problems.length
        ? `<p class="muted small">${found.problems.map((p) => `${escapeHTML(p.provider)}: ${escapeHTML(p.error)}`).join(" · ")}</p>`
        : "") +
      (found.results.length
        ? found.results.map((paper, i) => paperCard(paper, i, "found")).join("")
        : "<p class='muted'>Nothing came back. Try fewer words, or tick another catalogue.</p>");
  } catch (e) {
    out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    busy($("#findBtn"), false);
  }
});

$("#findQuery").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#findBtn").click(); });

function paperCard(paper, index, prefix) {
  return `
    <div class="paper" data-list="${prefix}" data-index="${index}">
      <h3>${escapeHTML(paper.title)}</h3>
      <div class="who">${escapeHTML(paper.authors.slice(0, 5).join(", "))}${paper.authors.length > 5 ? " et al." : ""}
        ${paper.year ? ` · ${paper.year}` : ""}${paper.venue ? ` · ${escapeHTML(paper.venue)}` : ""}</div>
      ${paper.abstract ? `<div class="abstract">${escapeHTML(paper.abstract.slice(0, 340))}${paper.abstract.length > 340 ? "…" : ""}</div>` : ""}
      <div class="row">
        ${paper.openAccess
          ? `<button class="primary add-paper">Add to notebook</button><span class="oa">open access</span>`
          : `<span class="closed">no free copy found — record only</span>`}
        ${paper.url ? `<a class="small" href="${escapeHTML(paper.url)}" target="_blank" rel="noreferrer">open the page</a>` : ""}
        <span class="tagline">${escapeHTML(paper.from.join(" · "))}${paper.citedBy != null ? ` · cited ${paper.citedBy}` : ""}</span>
      </div>
    </div>`;
}

document.addEventListener("click", async (e) => {
  const button = e.target.closest(".add-paper");
  if (!button) return;
  const card = button.closest(".paper");
  const list = card.dataset.list === "refs" ? state.refs : state.found;
  const paper = list[Number(card.dataset.index)];
  if (!paper) return;
  if (!state.notebook) await newNotebook("Reading list");
  busy(button, true, "fetching…");
  try {
    const { source } = await post(`/api/notebooks/${state.notebook.id}/discover/add`, paper);
    state.notebook = await get(`/api/notebooks/${state.notebook.id}`);
    drawSources();
    card.classList.add("added");
    button.textContent = "added";
    toast(`${source.title} — ${source.pageCount} pages. Rebuild the index to search it.`, 7000);
  } catch (err) {
    busy(button, false);
    toast(err.message, 10000);
  }
});

function drawRefSources() {
  const select = $("#refSource");
  if (!select) return;
  const sources = (state.notebook && state.notebook.sources) || [];
  select.innerHTML = sources.length
    ? sources.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.title)}</option>`).join("")
    : `<option value="">no sources yet</option>`;
}

$("#refBtn").addEventListener("click", async () => {
  const sourceId = $("#refSource").value;
  if (!sourceId) return toast("Add a paper first.");
  const out = $("#refOut");
  out.innerHTML = "<p class='muted'>reading the reference list…</p>";
  busy($("#refBtn"), true, "looking up…");
  state.refs = [];
  let found = 0;
  try {
    await events(`/api/notebooks/${state.notebook.id}/sources/${sourceId}/references`, { limit: 25 }, {
      entries: (e) => { found = e.found; out.innerHTML = `<p class="muted small">${e.found} reference(s) in the bibliography; looking up the first 25…</p>`; },
      reference: (item) => {
        if (!item.match) return;
        state.refs.push(item.match);
        out.insertAdjacentHTML("beforeend", paperCard(item.match, state.refs.length - 1, "refs"));
      },
      done: (d) => out.insertAdjacentHTML("afterbegin",
        `<p class="muted small">${d.resolved} of ${d.total || found} references identified. The rest could not be matched to a catalogue record.</p>`),
      onError: (e) => { out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`; },
    }).done;
  } catch (e) {
    out.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
  } finally {
    busy($("#refBtn"), false);
  }
});

/* ---- chrome ---------------------------------------------------------------- */

$("#tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab.dataset.tab));
});

$("#pace").addEventListener("change", (e) => remember("pace", e.target.value));
$("#chatModel").addEventListener("change", (e) => remember("chatModel", e.target.value));
$("#embedModel").addEventListener("change", (e) => remember("embedModel", e.target.value));

$("#darkToggle").addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  remember("dark", dark ? "1" : "0");
  $("#darkToggle").textContent = dark ? "☀" : "☾";
});
if (recall("dark") === "1" || (recall("dark") === null && matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.body.classList.add("dark");
  $("#darkToggle").textContent = "☀";
}

/* ---- go ------------------------------------------------------------------ */

(async function start() {
  const savedPace = recall("pace");
  if (savedPace) $("#pace").value = savedPace;

  /* All four at once. They do not depend on each other, and serialising
     them meant the notebook list waited for a question about ffmpeg. */
  const [, models] = await Promise.allSettled([
    health(),
    loadModels(),
    loadProviders(),
    loadNotebooks(),
  ]);
  if (models.status === "rejected") toast(`Could not list models: ${models.reason.message}`, 8000);

  /* Polling a background tab helps nobody, and on a laptop it is the
     difference between the fans staying off and not. */
  setInterval(() => { if (document.visibilityState === "visible") health(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") health(); });
})();
