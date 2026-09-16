/* ================================================
   MARGINALIA — server/video.mjs
   Turning a notebook into something that plays.

   Three outputs, in increasing order of how much has to be installed:

     1. A storyboard and a narration script. Always produced. Grounded
        and checked like everything else, so the script cites the pages
        it came from and you can hand it to someone else to read.

     2. A self-contained HTML player. Always produced, needs nothing.
        It advances itself, shows the on-screen text, and reads the
        narration aloud through the browser's own speech synthesis —
        which is a real voice, on every machine, with no model to
        download. Screen-record it and you have a video.

     3. An actual video file, when ffmpeg is on the machine. Frames are
        rendered by a headless browser from the same HTML, so the file
        looks exactly like the player. Narration is spoken by piper,
        espeak-ng or macOS `say` if any of them is installed; if none
        is, the video is silent and the captions carry the words.

   What is deliberately not here: any service, any upload, any key.
   ================================================ */

import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { json } from "./ollama.mjs";
import { systemFor, verifyEvidence } from "./grounding.mjs";
import { escapeXML as esc } from "./zip.mjs";

export const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          onScreen: { type: "array", items: { type: "string" } },
          narration: { type: "string" },
          evidence: { type: "string" },
          cite: { type: "string" },
        },
        required: ["heading", "narration", "evidence", "cite"],
      },
    },
  },
  required: ["title", "scenes"],
};

export function prompt({ topic, context, minutes = 3 }) {
  const scenes = Math.max(4, Math.min(12, Math.round(minutes * 3)));
  return [
    { role: "system", content: systemFor.script },
    {
      role: "user",
      content:
`Sources:
${context.manifest}

Passages:
${context.text}

Write a ${minutes}-minute explainer${topic ? ` about: ${topic}` : " about what these sources say"}. About ${scenes} scenes.

Return JSON:
- title: the title card.
- scenes: each with
  - heading: four words or fewer, shown large.
  - onScreen: two to four short lines shown as bullets. No citations in these.
  - narration: 25 to 55 words to be read aloud. Plain spoken English, no brackets, no bullet characters, no citation markers.
  - evidence: 5 to 25 words copied word for word from the passages.
  - cite: the passage label, like [S1:p4].

The first scene sets up the question. The last one says what is still unsettled or unknown, honestly.`,
    },
  ];
}

export async function storyboard({ topic, context, model, minutes = 3, signal }) {
  const { value, raw } = await json(prompt({ topic, context, minutes }), { model, schema: SCHEMA, signal, context: 8192 });
  if (!value || !Array.isArray(value.scenes) || !value.scenes.length) {
    const e = new Error("the model did not return a storyboard");
    e.status = 502;
    e.detail = String(raw || "").slice(0, 400);
    throw e;
  }
  const scenes = verifyEvidence(
    value.scenes.map((s) => ({
      heading: String(s.heading || "").trim().slice(0, 60),
      onScreen: (Array.isArray(s.onScreen) ? s.onScreen : []).map((t) => String(t).trim().slice(0, 90)).filter(Boolean).slice(0, 4),
      narration: String(s.narration || "").replace(/\[S\d+[^\]]*\]/g, "").replace(/\s+/g, " ").trim(),
      evidence: String(s.evidence || "").trim(),
      cite: String(s.cite || "").trim(),
    })),
    { blocks: context.blocks }
  ).map((s) => ({ ...s, seconds: secondsFor(s.narration) }));

  return {
    title: String(value.title || "Explainer").trim().slice(0, 120),
    scenes,
    seconds: scenes.reduce((n, s) => n + s.seconds, 0),
    check: {
      supported: scenes.filter((s) => s.verdict === "supported").length,
      weak: scenes.filter((s) => s.verdict === "weak").length,
      unsupported: scenes.filter((s) => s.verdict === "unsupported").length,
    },
  };
}

/* Roughly 150 words a minute, which is an unhurried reading pace, with
   a beat at each end so nothing is cut off. */
const secondsFor = (text) => Math.max(4, Math.round((String(text).split(/\s+/).length / 150) * 60) + 1.5);

export const narrationScript = (board) =>
  [`# ${board.title}`, "", `About ${Math.round(board.seconds)} seconds across ${board.scenes.length} scenes.`, ""]
    .concat(
      board.scenes.flatMap((s, i) => [
        `## ${i + 1}. ${s.heading}  (${s.seconds}s)`,
        "",
        s.onScreen.length ? `On screen: ${s.onScreen.join(" \u00b7 ")}` : "",
        "",
        s.narration,
        "",
        `> ${s.evidence} ${s.cite}${s.verdict === "supported" ? "" : `  [${s.verdict} — check this one]`}`,
        "",
      ])
    )
    .join("\n");

/* ---- the player ------------------------------------------------------ */
/*
   One file, no assets, no network. It plays itself, speaks through the
   browser, and falls back to a timer when speech synthesis is refused
   (which some browsers do until the page has been clicked).
*/

export function playerHTML(board, { diagramSVG = null } = {}) {
  const scenes = board.scenes.map((s) => ({
    heading: s.heading,
    onScreen: s.onScreen,
    narration: s.narration,
    cite: s.cite,
    seconds: s.seconds,
  }));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(board.title)}</title>
<style>
  :root { color-scheme: dark; --paper:#14131a; --ink:#f2efe9; --muted:#9a958c; --accent:#c98a5b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font-family: Georgia, "Iowan Old Style", serif; overflow:hidden; }
  #stage { width:100vw; height:100vh; display:flex; flex-direction:column;
           justify-content:center; padding:8vh 10vw; }
  h1 { font-size:5.2vw; margin:0 0 3vh; line-height:1.1; }
  ul { margin:0; padding:0; list-style:none; }
  li { font-size:2.4vw; margin:1.4vh 0; padding-left:1.6em; position:relative; opacity:0;
       animation:in .5s forwards; }
  li::before { content:""; position:absolute; left:0; top:.62em; width:.7em; height:2px; background:var(--accent); }
  @keyframes in { to { opacity:1; transform:none; } }
  #cap { position:fixed; left:0; right:0; bottom:7vh; text-align:center; font-size:1.7vw;
         padding:0 12vw; color:var(--ink); text-shadow:0 2px 12px #000; }
  #cite { position:fixed; right:2vw; bottom:2vh; font-size:1.1vw; color:var(--muted); }
  #bar { position:fixed; left:0; bottom:0; height:4px; background:var(--accent); width:0; }
  #start { position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
           background:rgba(10,9,14,.92); font-size:2vw; cursor:pointer; letter-spacing:.02em; }
  svg { max-width:70vw; max-height:45vh; }
</style></head>
<body>
<div id="stage"></div>
<div id="cap"></div><div id="cite"></div><div id="bar"></div>
<div id="start">click to play (with narration)</div>
<script>
const SCENES = ${JSON.stringify(scenes)};
const DIAGRAM = ${diagramSVG ? JSON.stringify(diagramSVG) : "null"};
const stage = document.getElementById("stage"), cap = document.getElementById("cap"),
      cite = document.getElementById("cite"), bar = document.getElementById("bar"),
      start = document.getElementById("start");
let i = 0;

function draw(scene) {
  stage.innerHTML = "";
  const h = document.createElement("h1"); h.textContent = scene.heading; stage.append(h);
  if (scene.onScreen && scene.onScreen.length) {
    const ul = document.createElement("ul");
    scene.onScreen.forEach((line, n) => {
      const li = document.createElement("li");
      li.textContent = line;
      li.style.animationDelay = (n * 0.35) + "s";
      ul.append(li);
    });
    stage.append(ul);
  } else if (DIAGRAM) {
    const wrap = document.createElement("div"); wrap.innerHTML = DIAGRAM; stage.append(wrap);
  }
  cap.textContent = scene.narration;
  cite.textContent = scene.cite || "";
}

function speak(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve(false);
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98; u.pitch = 1;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

async function play() {
  for (i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    draw(scene);
    bar.style.transition = "none"; bar.style.width = "0";
    requestAnimationFrame(() => {
      bar.style.transition = "width " + scene.seconds + "s linear";
      bar.style.width = "100%";
    });
    const spoken = await Promise.race([
      speak(scene.narration),
      new Promise((r) => setTimeout(() => r("timeout"), (scene.seconds + 12) * 1000)),
    ]);
    if (spoken === false) await new Promise((r) => setTimeout(r, scene.seconds * 1000));
  }
  cap.textContent = "";
  stage.innerHTML = '<h1 style="color:var(--muted)">end</h1>';
}

start.addEventListener("click", () => { start.remove(); play(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") speechSynthesis.cancel(); });
</script></body></html>`;
}

/* One still frame per scene, as its own HTML page, for the renderer to
   photograph. Same look as the player, no animation and no script. */
const FRAME_W = 1280;
const FRAME_H = 720;

function frameHTML(scene, board, index) {
  /* A fixed 1280x720 block pinned to the top-left corner, rather than
     anything measured against the viewport. Chrome's --screenshot
     includes the window chrome — a hundred-odd pixels of it — while
     chrome-headless-shell does not, so "the bottom of the viewport" is
     not a place you can rely on. The window is asked for generously
     and the frame is cropped back out of the corner afterwards, which
     lands identically on both. */
  const pct = Math.round(((index + 1) / board.scenes.length) * 100);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#14131a; }
  .frame { position:relative; width:${FRAME_W}px; height:${FRAME_H}px; overflow:hidden;
           background:#14131a; color:#f2efe9; font-family: Georgia, "Iowan Old Style", serif; }
  .body { position:absolute; left:110px; right:110px; top:70px; bottom:210px;
          display:flex; flex-direction:column; justify-content:center; }
  h1 { font-size:${index === 0 ? 56 : 44}px; margin:0 0 22px; line-height:1.12; }
  ul { padding:0; margin:0; }
  li { font-size:25px; margin:15px 0; padding-left:26px; position:relative; list-style:none; }
  li::before { content:""; position:absolute; left:0; top:14px; width:13px; height:2px; background:#c98a5b; }
  .cap { position:absolute; left:110px; right:110px; bottom:70px; font-size:21px; line-height:1.45; }
  .cite { position:absolute; right:26px; bottom:24px; font-size:13px; color:#9a958c; }
  .bar { position:absolute; left:0; bottom:0; height:5px; background:#c98a5b; width:${pct}%; }
</style></head><body><div class="frame">
  <div class="body">
    <h1>${esc(scene.heading)}</h1>
    <ul>${(scene.onScreen || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  </div>
  <div class="cap">${esc(scene.narration)}</div>
  <div class="cite">${esc(scene.cite || "")}</div><div class="bar"></div>
</div></body></html>`;
}

/* ---- what this machine can do ---------------------------------------- */

const CHROME_CANDIDATES = [
  process.env.MARGINALIA_CHROME,
  "google-chrome", "chromium", "chromium-browser", "microsoft-edge", "brave-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const which = (cmd) => {
  if (cmd.includes("/") || cmd.includes("\\")) return existsSync(cmd) ? cmd : null;
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  const out = (probe.stdout || "").trim().split("\n")[0];
  return probe.status === 0 && out ? out : null;
};

export function capabilities() {
  const ffmpeg = which(process.env.MARGINALIA_FFMPEG || "ffmpeg");
  let encoders = "";
  let demuxers = "";
  let decoders = "";
  if (ffmpeg) {
    const probe = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8", timeout: 20000 });
    encoders = (probe.stdout || "") + (probe.stderr || "");
    const probeIn = spawnSync(ffmpeg, ["-hide_banner", "-demuxers"], { encoding: "utf8", timeout: 20000 });
    demuxers = (probeIn.stdout || "") + (probeIn.stderr || "");
    const probeDec = spawnSync(ffmpeg, ["-hide_banner", "-decoders"], { encoding: "utf8", timeout: 20000 });
    decoders = (probeDec.stdout || "") + (probeDec.stderr || "");
  }
  let chrome = null;
  for (const c of CHROME_CANDIDATES) {
    const found = which(c);
    if (found) { chrome = found; break; }
  }
  const tts = ["piper", "espeak-ng", "espeak", "say"].map((t) => ({ name: t, path: which(t) })).find((t) => t.path) || null;
  return {
    ffmpeg,
    chrome,
    tts: tts ? tts.name : null,
    ttsPath: tts ? tts.path : null,
    h264: /\slibx264\b/.test(encoders),
    vp8: /libvpx/.test(encoders),
    /* Cut-down ffmpeg builds — the one Playwright ships, for instance —
       leave the concat demuxer out, and decode only one image format.
       Both are worked around rather than refused: frames go down a pipe
       instead of through a list, in whichever format this build can
       actually read. */
    concat: /(^|\s)concat(\s|$)/m.test(demuxers),
    frameFormat: /\spng\b/.test(decoders) ? "png" : /\smjpeg\b/.test(decoders) ? "jpg" : null,
    audioEncoder: /\saac\b/.test(encoders) ? "aac" : /libmp3lame/.test(encoders) ? "libmp3lame" : /libopus/.test(encoders) ? "libopus" : null,
    canRender: Boolean(
      ffmpeg && chrome &&
      (/\slibx264\b/.test(encoders) || /libvpx/.test(encoders)) &&
      (/\spng\b/.test(decoders) || /\smjpeg\b/.test(decoders))
    ),
  };
}

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let err = "";
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`))));
  });

/* ---- rendering -------------------------------------------------------- */

export async function render(board, outFile, { onProgress = () => {} } = {}) {
  const caps = capabilities();
  if (!caps.canRender) {
    const missing = [
      !caps.chrome && "a Chrome or Chromium browser",
      !caps.ffmpeg && "ffmpeg",
      caps.ffmpeg && !caps.frameFormat && "an ffmpeg that can read PNG or JPEG (this one is a cut-down build)",
      caps.ffmpeg && !caps.h264 && !caps.vp8 && "an ffmpeg with H.264 or VP8",
    ].filter(Boolean);
    const e = new Error(
      `can't render a video file here — ${missing.join(" and ")} not found. ` +
      `The player and the script are still yours; open the player and screen-record it, or install ffmpeg.`
    );
    e.status = 400;
    throw e;
  }

  const dir = mkdtempSync(join(tmpdir(), "marginalia-video-"));
  try {
    /* Frames. One screenshot per scene, at 720p, in whichever format
       this ffmpeg can read — the browser picks it from the extension. */
    const ext = caps.frameFormat;
    const frameAt = (i) => join(dir, `frame${String(i).padStart(3, "0")}.${ext}`);
    for (let i = 0; i < board.scenes.length; i++) {
      const page = join(dir, `scene${String(i).padStart(3, "0")}.html`);
      writeFileSync(page, frameHTML(board.scenes[i], board, i));
      await run(caps.chrome, [
        "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
        /* Taller than the frame on purpose: whatever the browser takes
           for its own furniture, the frame is still fully drawn. */
        `--window-size=${FRAME_W},${FRAME_H + 220}`, "--force-device-scale-factor=1",
        `--screenshot=${frameAt(i)}`,
        `file://${page}`,
      ], { timeout: 60000 });
      onProgress({ step: "frames", done: i + 1, total: board.scenes.length });
    }

    /* Narration, if anything on this machine can speak. */
    let audio = null;
    if (caps.tts && caps.audioEncoder) {
      try {
        audio = await speakAll(board, dir, caps, onProgress);
      } catch { audio = null; }                          // a silent video beats no video
    }

    onProgress({ step: "encoding" });
    const frames = board.scenes.map((_, i) => frameAt(i));
    const video = [
      /* Crop the frame back out of the top-left corner, then letterbox
         only if the screenshot came back smaller than asked. The pixel
         format is an output option rather than a `format` filter:
         `format` is one of the first things a slimmed-down ffmpeg
         build leaves out. */
      "-vf",
      `crop=min(iw\\,${FRAME_W}):min(ih\\,${FRAME_H}):0:0,` +
      `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=decrease,` +
      `pad=${FRAME_W}:${FRAME_H}:(ow-iw)/2:(oh-ih)/2`,
      "-pix_fmt", "yuv420p",
    ];
    const codec = caps.h264
      ? ["-c:v", "libx264", "-preset", "medium", "-crf", "21", "-r", "30"]
      : ["-c:v", "libvpx", "-b:v", "1200k", "-r", "24"];

    if (caps.concat) {
      const listFile = join(dir, "frames.txt");
      const lines = [];
      frames.forEach((frame, i) => lines.push(`file '${frame}'`, `duration ${board.scenes[i].seconds}`));
      lines.push(`file '${frames[frames.length - 1]}'`);            // the last one needs repeating
      writeFileSync(listFile, lines.join("\n"));

      const args = ["-y", "-f", "concat", "-safe", "0", "-i", listFile];
      if (audio) args.push("-i", audio);
      args.push(...video, ...codec);
      if (audio) args.push("-c:a", caps.audioEncoder, "-shortest");
      args.push(outFile);
      await run(caps.ffmpeg, args, { timeout: 600000 });
    } else {
      await pipeFrames(caps, frames, board.scenes.map((s) => s.seconds), [...video, ...codec, outFile], ext);
      audio = null;                                                 // such a build has no audio encoder either
    }

    return { file: outFile, silent: !audio, codec: caps.h264 ? "h264" : "vp8", tts: audio ? caps.tts : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* The fallback: hold each frame for its share of the running time by
   writing it down the pipe once per frame of video. At ten frames a
   second a three-minute explainer is eighteen hundred writes of an
   identical PNG, which the encoder collapses into almost nothing. */
async function pipeFrames(caps, frames, durations, tail, ext) {
  const fps = 10;
  /* Naming the input codec and the pipe explicitly: some builds will
     not guess either, and the failure ("output file does not contain
     any stream") says nothing about why. */
  const head = ["-y", "-f", "image2pipe", "-c:v", ext === "png" ? "png" : "mjpeg", "-framerate", String(fps), "-i", "pipe:0"];
  const child = spawn(caps.ffmpeg, [...head, ...tail], { stdio: ["pipe", "ignore", "pipe"] });
  /* If ffmpeg gives up early the pipe breaks; its own message is the
     one worth reporting, so swallow the EPIPE and wait for the exit. */
  child.stdin.on("error", () => {});
  let err = "";
  child.stderr.on("data", (d) => { err += d.toString(); });
  const finished = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-600)}`))));
  });

  try {
    for (let i = 0; i < frames.length; i++) {
      const png = readFileSync(frames[i]);
      const repeats = Math.max(1, Math.round(durations[i] * fps));
      for (let k = 0; k < repeats; k++) {
        if (child.stdin.destroyed) break;
        if (!child.stdin.write(png)) await new Promise((r) => child.stdin.once("drain", r));
      }
    }
    child.stdin.end();
  } catch (e) {
    child.kill();
    throw e;
  }
  await finished;
}

/* Speak each scene into its own wav, then concatenate. Each engine has
   its own idea of arguments; the shapes below are the ones that work
   with a default install. */
async function speakAll(board, dir, caps, onProgress) {
  const wavs = [];
  for (let i = 0; i < board.scenes.length; i++) {
    const wav = join(dir, `voice${String(i).padStart(3, "0")}.wav`);
    const text = board.scenes[i].narration;
    if (caps.tts === "piper") {
      const model = process.env.PIPER_VOICE;
      if (!model) throw new Error("piper needs PIPER_VOICE set to a .onnx voice file");
      await new Promise((resolve, reject) => {
        const child = spawn(caps.ttsPath, ["--model", model, "--output_file", wav], { stdio: ["pipe", "ignore", "pipe"] });
        child.on("error", reject);
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`piper exited ${code}`))));
        child.stdin.end(text);
      });
    } else if (caps.tts === "say") {
      await run(caps.ttsPath, ["-o", wav, "--data-format=LEF32@22050", text]);
    } else {
      await run(caps.ttsPath, ["-w", wav, "-s", "155", text]);
    }
    wavs.push(wav);
    onProgress({ step: "voice", done: i + 1, total: board.scenes.length });
  }
  const list = join(dir, "voice.txt");
  writeFileSync(list, wavs.map((w) => `file '${w}'`).join("\n"));
  const merged = join(dir, "voice.wav");
  await run(caps.ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", merged]);
  return merged;
}
