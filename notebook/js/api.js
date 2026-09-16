/* ================================================
   MARGINALIA — js/api.js
   Talking to the local server.

   Two shapes of call. `get`, `post`, `del` are ordinary JSON; `events`
   subscribes to a server-sent-event stream, which is how anything
   slow reports itself — an answer arriving token by token, a hundred
   chunks being embedded, a video rendering.

   The streams are POSTs, so EventSource is no use (it only does GET).
   The reader below is the small amount of code that replaces it.
   ================================================ */

const json = async (res) => {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new Error((data && data.error) || `${res.status} ${res.statusText}`);
  return data;
};

export const get = (path) => fetch(path).then(json);

export const post = (path, body) =>
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  }).then(json);

export const del = (path) => fetch(path, { method: "DELETE" }).then(json);

export const upload = (path, file) =>
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-filename": encodeName(file.name) },
    body: file,
  }).then(json);

/* Header values must be latin1, and a paper's filename is as likely as
   not to have an em dash or an accent in it. */
const encodeName = (name) => String(name).replace(/[^\x20-\x7e]/g, "_");

/*
   events(path, body, handlers) -> { cancel() }

   handlers is a map of event name to callback, plus an optional
   `onError`. The promise resolves when the stream closes, so a caller
   can `await` the whole thing and still watch it arrive.
*/
export function events(path, body, handlers = {}) {
  const controller = new AbortController();
  const done = (async () => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      let message = text;
      try { message = JSON.parse(text).error || text; } catch { /* plain text */ }
      throw new Error(message || `${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        let event = "message";
        let data = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { parsed = { raw: data }; }
        if (event === "failed" && handlers.onError) handlers.onError(new Error(parsed.error || "something went wrong"));
        else if (handlers[event]) handlers[event](parsed);
      }
    }
  })();

  return { done, cancel: () => controller.abort() };
}
