/* ================================================
   MARGINALIA — server/ollama.mjs
   The only thing in here that talks to a model.

   Everything runs against Ollama on localhost, which means: no key, no
   bill, no upload, and the machine works on a train. The rest of the
   app never calls fetch() itself — it asks for `chat`, `stream` or
   `embed` and gets back plain values, so swapping in llama.cpp's
   server or LM Studio later is one file's worth of work.

   On a 24 GB laptop the sensible shapes are a 12–14B instruct model at
   four bits for writing (about 9 GB resident) and a small embedding
   model beside it (under 1 GB). RECOMMENDED below is the list the UI
   offers when a model isn't installed yet; it is advice, not a
   restriction, and anything `ollama list` shows can be chosen.
   ================================================ */

const HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");

/* How long Ollama should keep the weights in memory between requests.
   Its own default is five minutes, which on a laptop means that asking
   a question, reading the answer, thinking, and asking another one
   costs a second load of nine gigabytes from disk — twenty or thirty
   seconds of apparently nothing happening, blamed on the app. Half an
   hour suits how people actually read. OLLAMA_KEEP_ALIVE overrides it;
   "0" makes it unload immediately, which is what you want if something
   else on the machine needs the memory. */
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "30m";

export const RECOMMENDED = {
  chat: [
    { name: "qwen2.5:14b-instruct", ram: "~9 GB", note: "the all-rounder — best default at this size" },
    { name: "qwen3:14b", ram: "~9 GB", note: "newer, thinks before answering; slower per token" },
    { name: "gemma3:12b", ram: "~8 GB", note: "strong summariser, long context" },
    { name: "phi4:14b", ram: "~9 GB", note: "reasoning and maths above its weight" },
    { name: "mistral-nemo:12b", ram: "~7 GB", note: "fast, 128k context, good at structure" },
    { name: "llama3.1:8b", ram: "~5 GB", note: "leaves room for everything else" },
    { name: "qwen2.5:7b-instruct", ram: "~5 GB", note: "when you want the fans to stay quiet" },
  ],
  embed: [
    { name: "nomic-embed-text", ram: "~0.3 GB", note: "768 dims, the sane default" },
    { name: "mxbai-embed-large", ram: "~0.7 GB", note: "1024 dims, a little better on long passages" },
    { name: "bge-m3", ram: "~1.2 GB", note: "multilingual, 1024 dims" },
    { name: "all-minilm", ram: "~0.1 GB", note: "tiny and quick; fine for small libraries" },
  ],
};

const EMBED_HINT = /embed|bge|minilm|nomic|gte|e5|arctic/i;

export class OllamaDown extends Error {
  constructor(cause) {
    super(
      `Ollama isn't answering on ${HOST}. Start it with "ollama serve" ` +
      `(or open the Ollama app), then reload this page.`
    );
    this.name = "OllamaDown";
    this.cause = cause;
    this.status = 503;
  }
}

async function call(path, { method = "GET", body, signal, timeout = 600000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  const onAbort = () => ac.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(HOST + path, {
      method,
      signal: ac.signal,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Ollama said ${res.status}: ${text.slice(0, 400) || res.statusText}`);
      err.status = res.status === 404 ? 400 : 502;
      throw err;
    }
    return res;
  } catch (e) {
    if (e.name === "AbortError" && signal && signal.aborted) throw e;
    if (e.name === "AbortError") { const t = new Error("the model took too long to answer"); t.status = 504; throw t; }
    if (e instanceof TypeError || e.code === "ECONNREFUSED" || /fetch failed/i.test(e.message)) throw new OllamaDown(e);
    throw e;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/* What is installed, split into the two roles. The split is by name,
   which is how Ollama itself presents them; a model that is really an
   embedder but named oddly can still be typed in by hand. */
export async function models({ timeout = 15000 } = {}) {
  const res = await call("/api/tags", { timeout });
  const data = await res.json();
  const list = (data.models || []).map((m) => ({
    name: m.name,
    size: m.size || 0,
    family: (m.details && m.details.family) || "",
    parameters: (m.details && m.details.parameter_size) || "",
    quantization: (m.details && m.details.quantization_level) || "",
    modified: m.modified_at || "",
  }));
  return {
    host: HOST,
    chat: list.filter((m) => !EMBED_HINT.test(m.name)).sort(byName),
    embed: list.filter((m) => EMBED_HINT.test(m.name)).sort(byName),
    all: list.sort(byName),
    recommended: RECOMMENDED,
  };
}

const byName = (a, b) => a.name.localeCompare(b.name);

export async function running() {
  try {
    const res = await call("/api/ps", { timeout: 8000 });
    const data = await res.json();
    return (data.models || []).map((m) => ({ name: m.name, until: m.expires_at, vram: m.size_vram || 0 }));
  } catch { return []; }
}

/* ---- generation ---------------------------------------------------- */
/*
   One entry point, two shapes. `stream` yields token deltas as they
   arrive, which is what the chat view wants; `chat` waits and returns
   the whole string, which is what the summariser, the diagram builder
   and the deck writer want because they parse the result.
*/

export async function* stream(messages, { model, temperature = 0.2, context = 8192, predict, format, signal, stop } = {}) {
  const res = await call("/api/chat", {
    method: "POST",
    signal,
    body: {
      model,
      messages,
      stream: true,
      format,
      keep_alive: KEEP_ALIVE,
      options: {
        temperature,
        num_ctx: context,
        /* A cap on the answer's length. Not censorship — a stop valve:
           a small model asked for a summary will occasionally write
           until the heat death of the laptop. */
        ...(predict ? { num_predict: predict } : {}),
        ...(stop ? { stop } : {}),
      },
    },
  });
  let buf = "";
  for await (const piece of res.body) {
    buf += Buffer.from(piece).toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.error) throw new Error(obj.error);
      const delta = obj.message && obj.message.content;
      if (delta) yield { delta, done: false };
      if (obj.done) {
        yield {
          delta: "",
          done: true,
          stats: {
            tokens: obj.eval_count || 0,
            promptTokens: obj.prompt_eval_count || 0,
            seconds: obj.total_duration ? obj.total_duration / 1e9 : 0,
          },
        };
      }
    }
  }
}

export async function chat(messages, { onDelta, ...opts } = {}) {
  let out = "";
  let stats = null;
  for await (const part of stream(messages, opts)) {
    out += part.delta;
    /* Structured output is parsed rather than shown, but the caller
       still wants to prove to a waiting person that something is
       happening. */
    if (part.delta && onDelta) onDelta(part.delta, out.length);
    if (part.done) stats = part.stats;
  }
  return { text: out, stats };
}

/* Ask for JSON and get JSON. Ollama's `format` accepts a schema, which
   turns "please reply with JSON" from a hope into a constraint — the
   sampler simply cannot emit anything else. Models still occasionally
   wrap it in prose when the schema is refused, so the parse is
   forgiving. */
export async function json(messages, { schema, ...opts } = {}) {
  const { text, stats } = await chat(messages, { ...opts, format: schema || "json", temperature: opts.temperature ?? 0 });
  return { value: parseLoose(text), raw: text, stats };
}

export function parseLoose(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return JSON.parse(trimmed); } catch { /* fall through to salvage */ }
  const start = trimmed.search(/[[{]/);
  if (start < 0) return null;
  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/* ---- getting the model into memory before it is wanted -------------- */
/*
   The first question of a session pays for nine gigabytes to be read
   off disk, and from the outside that is indistinguishable from the
   application being slow. It isn't — it is a load that was always going
   to happen, at the worst possible moment. So it happens earlier: the
   page asks for a warm-up when someone clicks into the question box,
   which buys most of a minute's head start on a laptop.

   One token, then stop. That is enough to make Ollama load the weights;
   generating more would only make the warm-up itself slow.
*/
export async function warm(model, { signal } = {}) {
  if (!model) return { warmed: false };
  const started = Date.now();
  await chat([{ role: "user", content: "ready?" }], { model, predict: 1, context: 512, temperature: 0, signal });
  return { warmed: true, model, seconds: Number(((Date.now() - started) / 1000).toFixed(1)) };
}

/*
   How fast is this machine, with this model? Two numbers, both from
   Ollama's own counters rather than a stopwatch: how quickly it reads a
   prompt, and how quickly it writes. Everything a person needs to
   decide between a 14B and an 8B, and to know whether their GPU is
   being used at all.
*/
export async function benchmark(model, { signal } = {}) {
  const passage = (
    "Dense retrieval maps passages into a shared vector space, so that queries and passages " +
    "which mean the same thing land close together. Chunks of about nine hundred characters, " +
    "with a little overlap, keep an argument intact while staying small enough to cite. "
  ).repeat(4);

  const messages = [
    { role: "system", content: "You answer in two or three sentences." },
    { role: "user", content: `${passage}\n\nIn your own words, what does this passage say about chunk size?` },
  ];

  const started = Date.now();
  let firstToken = null;
  let text = "";
  let stats = null;
  for await (const part of stream(messages, { model, predict: 60, context: 2048, temperature: 0.2, signal })) {
    if (part.delta && firstToken === null) firstToken = (Date.now() - started) / 1000;
    text += part.delta;
    if (part.done) stats = part.stats;
  }

  const promptTokens = (stats && stats.promptTokens) || 0;
  const tokens = (stats && stats.tokens) || 0;
  const seconds = (stats && stats.seconds) || (Date.now() - started) / 1000;
  const writing = seconds > 0 ? tokens / seconds : 0;
  /* Time to the first token is the prompt being read, near enough, and
     it is the half that the passage count changes. */
  const reading = firstToken > 0 ? promptTokens / firstToken : 0;

  return {
    model,
    promptTokens,
    tokens,
    firstToken: Number((firstToken || 0).toFixed(2)),
    reading: Number(reading.toFixed(0)),
    writing: Number(writing.toFixed(1)),
    seconds: Number(seconds.toFixed(1)),
    sample: text.slice(0, 160),
  };
}

/* ---- embeddings ----------------------------------------------------- */
/*
   /api/embed is the current endpoint and takes a batch; /api/embeddings
   is the old one and takes a single string. Try the new one, fall back
   without complaining, because which one a given Ollama has depends on
   when it was installed.
*/

export async function embed(texts, { model, signal } = {}) {
  const input = Array.isArray(texts) ? texts : [texts];
  if (!input.length) return [];
  try {
    const res = await call("/api/embed", { method: "POST", signal, body: { model, input, keep_alive: KEEP_ALIVE } });
    const data = await res.json();
    if (Array.isArray(data.embeddings) && data.embeddings.length) return data.embeddings.map(normalise);
  } catch (e) {
    if (e instanceof OllamaDown || e.name === "AbortError") throw e;
  }
  const out = [];
  for (const one of input) {
    const res = await call("/api/embeddings", { method: "POST", signal, body: { model, prompt: one, keep_alive: KEEP_ALIVE } });
    const data = await res.json();
    out.push(normalise(data.embedding || []));
  }
  return out;
}

/* Store unit vectors. Then similarity is a dot product and nothing
   downstream has to remember to divide. */
function normalise(vec) {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(vec, (v) => v / norm);
}

export async function pull(model, onProgress) {
  const res = await call("/api/pull", { method: "POST", body: { model, stream: true }, timeout: 3600000 });
  let buf = "";
  for await (const piece of res.body) {
    buf += Buffer.from(piece).toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.error) throw new Error(obj.error);
        if (onProgress) onProgress(obj);
      } catch { /* progress noise */ }
    }
  }
}

export const host = HOST;
