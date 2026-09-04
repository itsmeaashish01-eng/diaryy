/* ================================================
   SPEAK AGAIN — therapy.js
   The practice engine.

   How it works, in one paragraph:
   the person picks a profile (words won't come out / words are hard
   to understand / both), and the app builds a short session of about
   ten turns from the exercises allowed at their current level. Every
   turn is scored one of three ways — said it on their own, said it
   after a hint, or did it together — and those scores decide when the
   next level opens and which words come back for review. Nothing is
   timed and nothing is marked wrong in red.

   Data lives in localStorage under "aphasiaTherapyData".
   ================================================ */

/* ------------------------------------------------
   EXERCISE CATALOGUE
   mode "say"  = the person has to produce speech (harder in Broca's)
   mode "hear" = the person has to understand   (harder in Wernicke's)
   The mode is what lets one profile get more of the practice it needs.
   ------------------------------------------------ */
const EXERCISES = {
  letter_say:        { name: "Say the sound",      icon: "🔤", mode: "say",  desc: "Hear a letter sound and say it back." },
  letter_pick:       { name: "Find the letter",    icon: "🔍", mode: "hear", desc: "Hear a sound and point to the letter." },
  minimal_pair:      { name: "Same or different",  icon: "👂", mode: "hear", desc: "Two words. Do they sound the same?" },
  listen_repeat:     { name: "Listen and repeat",  icon: "🔁", mode: "say",  desc: "Hear a word and say it back." },
  name_picture:      { name: "Name the picture",   icon: "🖼", mode: "say",  desc: "Say what you can see. Hints if you need them." },
  match_word_picture:{ name: "Find the picture",   icon: "👆", mode: "hear", desc: "Hear a word and point to it." },
  yes_no:            { name: "Yes or no",          icon: "✅", mode: "hear", desc: "Simple questions about what words mean." },
  odd_one_out:       { name: "Odd one out",        icon: "🧩", mode: "hear", desc: "Three go together. One does not." },
  cloze:             { name: "Finish the sentence",icon: "✏️", mode: "say",  desc: "The last word is almost there already." },
  build_sentence:    { name: "Build a sentence",   icon: "🧱", mode: "say",  desc: "Put the words in the right order." },
  read_aloud:        { name: "Read out loud",      icon: "📖", mode: "say",  desc: "Read a sentence, one word at a time." },
  follow_command:    { name: "Follow the words",   icon: "🎯", mode: "hear", desc: "Do what the voice asks you to do." },
  self_monitor:      { name: "Hear yourself",      icon: "🎙", mode: "hear", desc: "Record yourself and listen back." },
  wh_question:       { name: "Answer a question",  icon: "❓", mode: "say",  desc: "Questions about your own day." },
  describe_scene:    { name: "Tell me about it",   icon: "🗨", mode: "say",  desc: "Say what you see, in your own words." },
  sequence_story:    { name: "Put it in order",    icon: "🔢", mode: "say",  desc: "Order the steps, then say them." },
};

/* How many turns in one session, and how strong the profile bias is. */
const SESSION_LENGTH = 10;
const PROFILE_WEIGHTS = {
  broca:    { say: 3, hear: 1 },   /* trouble getting words out → more producing */
  wernicke: { say: 1, hear: 3 },   /* trouble understanding     → more listening */
  mixed:    { say: 1, hear: 1 },
};

/* A level opens when recent work at the level before it is this good. */
const MASTERY_TO_UNLOCK = 0.8;   /* 80% */
const MIN_ATTEMPTS_TO_UNLOCK = 20;
const MASTERY_WINDOW = 24;       /* only the last 24 turns count */

/* ------------------------------------------------
   STATE
   ------------------------------------------------ */
const DEFAULT_STATE = {
  name: "",
  profile: "mixed",
  level: 1,
  unlocked: 1,
  dark: false,
  settings: {
    rate: 0.75,          /* speech synthesis rate — slow by default */
    voiceURI: "",
    size: "normal",
    choices: 3,          /* how many pictures in a choosing task */
    errorless: true,     /* model the answer before asking for it   */
    asr: false,          /* let the browser try to recognise speech */
  },
  words: {},             /* word -> { seen, solo, cued, miss, last } */
  levels: {},            /* level -> { history: ["solo","cued",...] } */
  sessions: [],          /* one row per finished session             */
  streak: 0,
  lastDay: "",
};

let state = structuredClone(DEFAULT_STATE);

/* Everything about the session currently being played. */
let session = null;

function load() {
  try {
    const raw = localStorage.getItem("aphasiaTherapyData");
    if (raw) {
      /* Merge onto the defaults so a saved file from an older version
         still opens after new settings are added. */
      const saved = JSON.parse(raw);
      state = Object.assign(structuredClone(DEFAULT_STATE), saved);
      state.settings = Object.assign(structuredClone(DEFAULT_STATE.settings), saved.settings || {});
    }
  } catch (e) {
    console.warn("Could not load progress:", e);
  }
}

function save() {
  try {
    localStorage.setItem("aphasiaTherapyData", JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save progress:", e);
    showToast("⚠ Could not save. Try saving a copy from Settings.");
  }
}

/* ------------------------------------------------
   SMALL HELPERS
   ------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);

/* Draw n different items from an array. */
function sample(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let toastTimer;
function showToast(msg, ms = 2400) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

/* Compare what was heard with what was wanted.
   Aphasic speech is often close but not exact, and browser speech
   recognition is unreliable on top of that, so the match is
   deliberately forgiving — it is a helper, never a judge. */
function similar(said, target) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const a = norm(said), b = norm(target);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  /* Levenshtein distance, turned into a 0-1 score. */
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    }
  }
  return 1 - d[m][n] / Math.max(m, n);
}

/* Break a word into rough syllable chunks, for the "cup — c-up" hint. */
function syllabify(word) {
  const parts = word.toLowerCase().match(/[^aeiou]*[aeiou]+(?:[^aeiou]*$|[^aeiouy]*(?=[aeiou]))/gi);
  return (parts && parts.length) ? parts.join(" · ") : word;
}

/* ------------------------------------------------
   SPEECH OUT — the model voice
   Aphasia practice depends on hearing a clear, slow model, so this
   is used everywhere: instructions, targets, feedback.
   ------------------------------------------------ */
let voices = [];

function loadVoices() {
  voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const sel = $("voiceSelect");
  if (!sel) return;
  sel.innerHTML = "";
  const english = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith("en"));
  (english.length ? english : voices).forEach(v => {
    const o = document.createElement("option");
    o.value = v.voiceURI;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
  if (state.settings.voiceURI) sel.value = state.settings.voiceURI;
}

/* Say something. Resolves when the voice has finished so exercises
   can wait for the model before asking for a response. */
function speak(text, opts = {}) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = opts.rate != null ? opts.rate : state.settings.rate;
    u.pitch = 1;
    const v = voices.find(x => x.voiceURI === state.settings.voiceURI);
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    /* Safety net: some browsers never fire onend for short utterances. */
    setTimeout(resolve, 400 + String(text).length * 120);
    window.speechSynthesis.speak(u);
  });
}

/* Say a word slowly, with a pause, twice — the standard way to give
   a model for repetition. */
async function model(text) {
  await speak(text);
}

/* ------------------------------------------------
   SPEECH IN — optional, and never the final word
   Browser recognition copes badly with aphasic speech. It is off by
   default; when on, it only ever *offers* a guess, and the person or
   their helper still decides whether the attempt was good.
   ------------------------------------------------ */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function asrAvailable() { return !!SpeechRec; }

function listenOnce() {
  return new Promise((resolve) => {
    if (!SpeechRec) { resolve(null); return; }
    try {
      recognition = new SpeechRec();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 5;
      let done = false;
      recognition.onresult = (ev) => {
        done = true;
        const alts = [];
        for (let i = 0; i < ev.results[0].length; i++) alts.push(ev.results[0][i].transcript);
        resolve(alts);
      };
      recognition.onerror = () => { if (!done) { done = true; resolve(null); } };
      recognition.onend = () => { if (!done) { done = true; resolve([]); } };
      recognition.start();
    } catch (e) {
      resolve(null);
    }
  });
}

function stopListening() {
  try { if (recognition) recognition.stop(); } catch (e) { /* already stopped */ }
}

/* ------------------------------------------------
   PROGRESS MATHS
   ------------------------------------------------ */
/* A turn is worth 1 alone, 0.5 with a hint, 0 when done together. */
const SCORE = { solo: 1, cued: 0.5, miss: 0 };

function levelRecord(n) {
  if (!state.levels[n]) state.levels[n] = { history: [] };
  return state.levels[n];
}

/* How well the recent turns at this level have gone, 0-1. */
function mastery(n) {
  const h = levelRecord(n).history.slice(-MASTERY_WINDOW);
  if (!h.length) return 0;
  return h.reduce((s, r) => s + SCORE[r], 0) / h.length;
}

function attemptsAt(n) { return levelRecord(n).history.length; }

/* Open the next level once the current one is comfortable. */
function checkUnlock() {
  const n = state.level;
  if (n >= LEVELS.length) return false;
  const ready = mastery(n) >= MASTERY_TO_UNLOCK && attemptsAt(n) >= MIN_ATTEMPTS_TO_UNLOCK;
  if (ready && state.unlocked < n + 1) {
    state.unlocked = n + 1;
    return true;
  }
  return false;
}

/* Words the person got wrong recently, so they can come back sooner. */
function wordsNeedingReview() {
  return Object.entries(state.words)
    .filter(([, s]) => s.miss + s.cued > s.solo)
    .sort((a, b) => (a[1].last || 0) - (b[1].last || 0))
    .map(([w]) => w);
}

function recordWord(word, result) {
  if (!word) return;
  const w = state.words[word] || { seen: 0, solo: 0, cued: 0, miss: 0, last: 0 };
  w.seen++; w[result]++; w.last = Date.now();
  state.words[word] = w;
}

function masteredWordCount() {
  return Object.values(state.words).filter(w => w.solo >= 2 && w.solo > w.miss).length;
}

/* ------------------------------------------------
   HOME SCREEN
   ------------------------------------------------ */
function showScreen(id) {
  ["setupScreen", "homeScreen", "sessionScreen", "summaryScreen"]
    .forEach(s => $(s).classList.toggle("hidden", s !== id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  const lv = LEVELS[state.level - 1];
  $("helloText").textContent = state.name ? `Hello, ${state.name}` : "Hello";
  $("homeLevelTitle").textContent = `Level ${lv.n} · ${lv.name}`;
  $("homeLevelBlurb").textContent = lv.blurb;

  /* Progress ring — 327 is the circumference of the r=52 circle. */
  const pct = Math.round(mastery(state.level) * 100);
  $("ringPct").textContent = `${pct}%`;
  $("ringFill").style.strokeDashoffset = String(327 - (327 * pct) / 100);

  $("startSubText").textContent = `${SESSION_LENGTH} turns · about 5 minutes`;

  /* Numbers */
  $("statStreak").textContent = state.streak;
  $("statSessions").textContent = state.sessions.length;
  $("statWords").textContent = masteredWordCount();
  const recent = state.sessions.slice(-5);
  if (recent.length) {
    const tot = recent.reduce((s, r) => s + r.total, 0);
    const sc = recent.reduce((s, r) => s + r.solo + r.cued * 0.5, 0);
    $("statAccuracy").textContent = `${Math.round((sc / tot) * 100)}%`;
  } else {
    $("statAccuracy").textContent = "—";
  }

  /* The ladder of levels */
  const ladder = $("levelLadder");
  ladder.innerHTML = "";
  LEVELS.forEach(l => {
    const locked = l.n > state.unlocked;
    const m = Math.round(mastery(l.n) * 100);
    const row = document.createElement("button");
    row.className = "level-row" + (l.n === state.level ? " current" : "") + (locked ? " locked" : "");
    row.disabled = locked;
    row.innerHTML = `
      <span class="level-emoji">${l.icon}</span>
      <span class="level-info">
        <span class="level-name">Level ${l.n} · ${l.name}</span>
        <span class="level-blurb">${l.blurb}</span>
        <span class="level-bar"><span style="width:${locked ? 0 : m}%"></span></span>
      </span>
      <span class="level-state">${locked ? "🔒" : (l.n === state.level ? "▶" : (m >= 80 ? "✓" : "·"))}</span>`;
    row.addEventListener("click", () => {
      if (locked) return;
      state.level = l.n;
      save();
      renderHome();
      showToast(`Level ${l.n} — ${l.name}`);
    });
    ladder.appendChild(row);
  });

  /* Single-exercise practice, limited to what this level uses */
  const grid = $("practiceGrid");
  grid.innerHTML = "";
  lv.exercises.forEach(key => {
    const ex = EXERCISES[key];
    if (!ex) return;
    const tile = document.createElement("button");
    tile.className = "practice-tile";
    tile.innerHTML = `
      <span class="pt-icon">${ex.icon}</span>
      <span class="pt-name">${ex.name}</span>
      <span class="pt-desc">${ex.desc}</span>
      <span class="pt-for">${ex.mode === "say" ? "saying" : "listening"}</span>`;
    tile.addEventListener("click", () => startSession(key));
    grid.appendChild(tile);
  });
}

/* ================================================
   BUILDING A SESSION
   ================================================ */

/* Which words are fair game at a level: short and common first,
   longer and rarer as the levels go up. */
function wordPool(level) {
  if (level <= 2) return WORDS.filter(w => w.tier === 1);
  if (level === 3) return WORDS.filter(w => w.tier <= 2);
  return WORDS;
}

/* Prefer a word that went badly last time, otherwise take a new one.
   This is the spaced-review part: misses come back, successes rest. */
function chooseWord(level, used) {
  const pool = wordPool(level).filter(w => !used.has(w.w));
  if (!pool.length) return pick(wordPool(level));
  const due = wordsNeedingReview();
  const dueHere = pool.filter(w => due.includes(w.w));
  /* Roughly one turn in three revisits something difficult. */
  const w = (dueHere.length && Math.random() < 0.35) ? pick(dueHere) : pick(pool);
  used.add(w.w);
  return w;
}

/* Choose the exercise types for a session, biased by the profile. */
function pickTypes(level, n) {
  const allowed = LEVELS[level - 1].exercises.filter(k => EXERCISES[k]);
  const weights = PROFILE_WEIGHTS[state.profile] || PROFILE_WEIGHTS.mixed;
  const bag = [];
  allowed.forEach(k => {
    const w = weights[EXERCISES[k].mode];
    for (let i = 0; i < w; i++) bag.push(k);
  });
  const out = [];
  let lastType = "";
  for (let i = 0; i < n; i++) {
    /* Avoid three of the same exercise in a row — variety keeps
       attention, and attention fatigues quickly after a stroke. */
    let t = pick(bag), guard = 0;
    while (t === lastType && bag.length > 2 && guard++ < 8) t = pick(bag);
    out.push(t);
    lastType = t;
  }
  return out;
}

function buildSession(onlyType) {
  const level = state.level;
  const types = onlyType ? Array(SESSION_LENGTH).fill(onlyType) : pickTypes(level, SESSION_LENGTH);
  const used = new Set();
  return types.map(t => makeItem(t, level, used)).filter(Boolean);
}

/* Turn an exercise type into a concrete turn with its content. */
function makeItem(type, level, used) {
  const choices = Number(state.settings.choices) || 3;

  switch (type) {
    case "letter_say": {
      const L = pick(LETTERS);
      return { type, letter: L };
    }
    case "letter_pick": {
      const L = pick(LETTERS);
      const others = sample(LETTERS.filter(x => x.l !== L.l), choices - 1);
      return { type, letter: L, options: shuffle([L, ...others]) };
    }
    case "minimal_pair": {
      /* Half the turns are the same word twice, so "same" is a real answer. */
      const p = pick(MINIMAL_PAIRS);
      const same = Math.random() < 0.5;
      return { type, pair: same ? [p[0], p[0]] : shuffle(p), same };
    }
    case "listen_repeat": {
      return { type, word: chooseWord(level, used) };
    }
    case "name_picture": {
      return { type, word: chooseWord(level, used), cue: 0 };
    }
    case "match_word_picture": {
      const target = chooseWord(level, used);
      /* Distractors from the same category are harder; mix both so the
         task gets harder as the level rises. */
      const pool = wordPool(level).filter(w => w.w !== target.w);
      const sameCat = pool.filter(w => w.cat === target.cat);
      const near = level >= 3 && sameCat.length >= choices - 1;
      const others = sample(near ? sameCat : pool, choices - 1);
      return { type, word: target, options: shuffle([target, ...others]) };
    }
    case "yes_no":
      return makeYesNo(level, used);
    case "odd_one_out": {
      const cats = [...new Set(wordPool(level).map(w => w.cat))];
      const catA = pick(cats);
      const inA = wordPool(level).filter(w => w.cat === catA);
      if (inA.length < 3) return makeItem("match_word_picture", level, used);
      const catB = pick(cats.filter(c => c !== catA));
      const odd = pick(wordPool(level).filter(w => w.cat === catB));
      const three = sample(inA, 3);
      return { type, odd, options: shuffle([...three, odd]), cat: catA };
    }
    case "cloze": {
      const c = pick(CLOZE);
      return { type, cloze: c, word: WORDS.find(w => w.w === c.a) || null, cue: 0 };
    }
    case "build_sentence": {
      const tier = level <= 4 ? 1 : (level === 5 ? 2 : 3);
      const pool = SENTENCES.filter(s => s.tier <= tier);
      return { type, sentence: pick(pool), tries: 0 };
    }
    case "read_aloud": {
      const tier = level <= 5 ? 2 : 3;
      const pool = SENTENCES.filter(s => s.tier <= tier);
      return { type, sentence: pick(pool) };
    }
    case "follow_command":
      return makeCommand(level);
    case "self_monitor": {
      /* At level 6 record a whole sentence, before that a single word. */
      if (level >= 6) return { type, target: pick(SENTENCES.filter(s => s.tier <= 2)).words.join(" ") };
      const w = chooseWord(level, used);
      return { type, word: w, target: w.w };
    }
    case "wh_question":
      return { type, q: pick(WH_QUESTIONS) };
    case "describe_scene":
      return { type, scene: pick(SCENES), said: [] };
    case "sequence_story":
      return { type, story: pick(STORIES), tries: 0 };
    default:
      return { type: "listen_repeat", word: chooseWord(level, used) };
  }
}

/* Yes/no questions are generated from the word's features, so they
   never run out. Every question points at the picture on screen
   ("Is this an animal?") rather than naming the word again — shorter
   to hold in mind, and it works for words like "milk" and "rice"
   that have no comfortable article. */
function makeYesNo(level, used) {
  const w = chooseWord(level, used);

  /* Questions whose answer is yes. */
  const trueQs = [`Is this ${CATEGORY_LABELS[w.cat]}?`];
  if (w.edible) trueQs.push("Can you eat this?");
  if (w.drink)  trueQs.push("Can you drink this?");
  if (w.alive)  trueQs.push("Is this alive?");
  if (w.big)    trueQs.push("Is this bigger than a shoe?");

  /* Questions whose answer is no. Categories that overlap with the
     real one are ruled out so the answer is never arguable. */
  const banned = [w.cat, ...(CATEGORY_CONFLICTS[w.cat] || [])];
  if (w.edible) banned.push("food");
  if (w.alive) banned.push("animal", "people", "nature");
  const otherCats = Object.keys(CATEGORY_LABELS).filter(c => !banned.includes(c));
  const falseQs = [];
  if (otherCats.length) falseQs.push(`Is this ${CATEGORY_LABELS[pick(otherCats)]}?`);
  if (!w.edible) falseQs.push("Can you eat this?");
  if (!w.alive)  falseQs.push("Is this alive?");
  if (!w.big)    falseQs.push("Is this bigger than a car?");

  const yes = falseQs.length ? Math.random() < 0.5 : true;
  return { type: "yes_no", word: w, q: pick(yes ? trueQs : falseQs), answer: yes };
}

/* A Token-Test style board: six distinct coloured shapes. */
function makeCommand(level) {
  const combos = [];
  TOKEN_COLORS.forEach(c => TOKEN_SHAPES.forEach(s => combos.push({ color: c, shape: s })));
  const board = sample(combos, 6);
  const tier = level <= 4 ? 1 : (level === 5 ? 2 : 3);
  const tpl = pick(COMMAND_TEMPLATES.filter(t => t.tier <= tier));
  const targets = sample(board, tpl.steps);
  const nameOf = (t) => `${t.color.name} ${t.shape}`;
  let text = tpl.text.replace("{1}", nameOf(targets[0]));
  if (targets[1]) text = text.replace("{2}", nameOf(targets[1]));
  return { type: "follow_command", board, targets, text, tapped: [] };
}

/* ================================================
   RUNNING A SESSION
   ================================================ */
function startSession(onlyType) {
  session = {
    items: buildSession(onlyType),
    index: 0,
    results: [],
    onlyType: onlyType || null,
    level: state.level,
  };
  showScreen("sessionScreen");
  renderDots();
  showItem();
}

function renderDots() {
  const dots = $("sessionDots");
  dots.innerHTML = "";
  session.items.forEach((_, i) => {
    const d = document.createElement("span");
    const r = session.results[i];
    d.className = "dot" + (r ? ` ${r === "solo" ? "done" : r === "cued" ? "cued" : "miss"}` : (i === session.index ? " now" : ""));
    dots.appendChild(d);
  });
  $("sessionCount").textContent = `${Math.min(session.index + 1, session.items.length)} / ${session.items.length}`;
}

/* --- shared bits of exercise UI --- */
function setInstruction(text) { $("taskInstruction").textContent = text; }
function setStage(html) { $("stage").innerHTML = html; }
function clearFeedback() { const f = $("feedback"); f.textContent = ""; f.className = "feedback"; }

function setControls(buttons) {
  const c = $("controls");
  c.innerHTML = "";
  buttons.filter(Boolean).forEach(b => {
    const el = document.createElement("button");
    el.className = "btn " + (b.cls || "");
    el.innerHTML = b.label;
    if (b.id) el.id = b.id;
    el.addEventListener("click", () => b.onClick(el));
    c.appendChild(el);
  });
}

function feedback(text, cls = "") {
  const f = $("feedback");
  f.innerHTML = text;
  f.className = "feedback " + cls;
}

/* Finish the current turn and move on.
   result is "solo", "cued" or "miss". */
function finishItem(result, opts = {}) {
  const item = session.items[session.index];
  session.results[session.index] = result;

  /* Remember how this word went, and add the turn to the level's record. */
  if (item.word && item.word.w) recordWord(item.word.w, result);
  levelRecord(session.level).history.push(result);
  save();
  renderDots();

  if (result === "solo") {
    feedback(pick(PRAISE), "good");
    setControls([]);
    setTimeout(nextItem, 1500);
  } else {
    feedback(opts.message || pick(ENCOURAGE), "soft");
    setControls([{ label: "Next →", cls: "primary big", onClick: nextItem }]);
  }
}

function nextItem() {
  session.index++;
  if (session.index >= session.items.length) { endSession(); return; }
  renderDots();
  showItem();
}

/* Draw whichever exercise is next. */
function showItem() {
  clearFeedback();
  const item = session.items[session.index];
  const fn = RENDER[item.type];
  if (!fn) { nextItem(); return; }
  fn(item);
}

/* ================================================
   THE EXERCISES — listening / understanding
   These are the ones weighted up for Wernicke's aphasia.
   ================================================ */
const RENDER = {};

/* --- Hear a sound, point to the letter --- */
RENDER.letter_pick = (item) => {
  setInstruction("Which letter makes this sound?");
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  item.options.forEach(L => {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<span class="c-emoji">${L.l.toUpperCase()}</span>`;
    b.addEventListener("click", () => {
      const right = L.l === item.letter.l;
      b.classList.add(right ? "right" : "wrong");
      [...grid.children].forEach(c => c.disabled = true);
      if (right) {
        finishItem("solo");
      } else {
        /* Show where it was, and say it again, before moving on. */
        [...grid.children].forEach((c, i) => {
          if (item.options[i].l === item.letter.l) c.classList.add("right");
        });
        speak(item.letter.sound);
        finishItem("miss", { message: `That one was <strong>${item.letter.l.toUpperCase()}</strong> — as in ${item.letter.word}.` });
      }
    });
    grid.appendChild(b);
  });
  setStage("");
  $("stage").appendChild(grid);
  setControls([{ label: "🔊 Listen again", cls: "listen", onClick: () => speak(item.letter.sound) }]);
  speak(item.letter.sound);
};

/* --- Two words: same or different? --- */
RENDER.minimal_pair = (item) => {
  setInstruction("Are these two words the same?");
  setStage(`<div class="big-card"><span class="big-emoji">👂</span></div>`);

  const playPair = async () => {
    await speak(item.pair[0]);
    await new Promise(r => setTimeout(r, 450));
    await speak(item.pair[1]);
  };

  const answer = (saidSame, btn, other) => {
    const right = saidSame === item.same;
    btn.classList.add(right ? "right" : "wrong");
    other.disabled = true; btn.disabled = true;
    if (right) finishItem("solo");
    else finishItem("miss", { message: `They were <strong>${item.pair[0]}</strong> and <strong>${item.pair[1]}</strong>.` });
  };

  const row = document.createElement("div");
  row.className = "binary-row";
  const same = document.createElement("button");
  same.className = "binary"; same.textContent = "Same";
  const diff = document.createElement("button");
  diff.className = "binary"; diff.textContent = "Different";
  same.addEventListener("click", () => answer(true, same, diff));
  diff.addEventListener("click", () => answer(false, diff, same));
  row.append(same, diff);
  $("stage").appendChild(row);

  setControls([{ label: "🔊 Listen again", cls: "listen", onClick: playPair }]);
  playPair();
};

/* --- Hear a word, point to the picture --- */
RENDER.match_word_picture = (item) => {
  setInstruction("Which one is it?");
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  item.options.forEach(w => {
    const b = document.createElement("button");
    b.className = "choice";
    /* At the earliest levels the written word is shown too, so reading
       can support listening. Later the picture stands alone. */
    b.innerHTML = `<span class="c-emoji">${w.e}</span>${state.level <= 3 ? `<span class="c-word">${w.w}</span>` : ""}`;
    b.addEventListener("click", () => {
      const right = w.w === item.word.w;
      [...grid.children].forEach(c => c.disabled = true);
      b.classList.add(right ? "right" : "wrong");
      if (right) { finishItem("solo"); return; }
      [...grid.children].forEach((c, i) => { if (item.options[i].w === item.word.w) c.classList.add("right"); });
      speak(item.word.w);
      finishItem("miss", { message: `This one is the <strong>${item.word.w}</strong>.` });
    });
    grid.appendChild(b);
  });
  setStage("");
  $("stage").appendChild(grid);
  setControls([{ label: "🔊 Say it again", cls: "listen", onClick: () => speak(item.word.w) }]);
  speak(item.word.w);
};

/* --- Yes or no --- */
RENDER.yes_no = (item) => {
  setInstruction("Yes or no?");
  setStage(`
    <div class="big-card">
      <span class="big-emoji">${item.word.e}</span>
      <span class="read-sentence" style="font-size:calc(1.5rem * var(--scale))">${item.q}</span>
    </div>`);

  const row = document.createElement("div");
  row.className = "binary-row";
  const yes = document.createElement("button");
  yes.className = "binary"; yes.innerHTML = "👍 Yes";
  const no = document.createElement("button");
  no.className = "binary"; no.innerHTML = "👎 No";
  const answer = (said, btn) => {
    yes.disabled = true; no.disabled = true;
    const right = said === item.answer;
    btn.classList.add(right ? "right" : "wrong");
    if (right) finishItem("solo");
    else finishItem("miss", { message: `The answer is <strong>${item.answer ? "yes" : "no"}</strong>.` });
  };
  yes.addEventListener("click", () => answer(true, yes));
  no.addEventListener("click", () => answer(false, no));
  row.append(yes, no);
  $("stage").appendChild(row);

  setControls([{ label: "🔊 Ask me again", cls: "listen", onClick: () => speak(item.q) }]);
  speak(item.q);
};

/* --- Odd one out --- */
RENDER.odd_one_out = (item) => {
  setInstruction("Which one does not belong?");
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  item.options.forEach(w => {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<span class="c-emoji">${w.e}</span><span class="c-word">${w.w}</span>`;
    b.addEventListener("click", () => {
      const right = w.w === item.odd.w;
      [...grid.children].forEach(c => c.disabled = true);
      b.classList.add(right ? "right" : "wrong");
      if (right) {
        speak(`Yes. The others are all ${CATEGORY_GROUP[item.cat]}.`);
        finishItem("solo");
      } else {
        [...grid.children].forEach((c, i) => { if (item.options[i].w === item.odd.w) c.classList.add("right"); });
        finishItem("miss", { message: `Three of them are ${CATEGORY_GROUP[item.cat]}. The <strong>${item.odd.w}</strong> is not.` });
      }
    });
    grid.appendChild(b);
  });
  setStage("");
  $("stage").appendChild(grid);
  setControls([]);
  speak(`Which one does not belong?`);
};

/* --- Follow a spoken instruction --- */
RENDER.follow_command = (item) => {
  setInstruction("Do what you hear.");
  item.tapped = [];
  const board = document.createElement("div");
  board.className = "token-board";

  item.board.forEach(tok => {
    const b = document.createElement("button");
    b.className = "token";
    const s = document.createElement("span");
    s.className = `shape ${tok.shape}`;
    if (tok.shape === "triangle") s.style.borderBottom = `62px solid ${tok.color.hex}`;
    else s.style.background = tok.color.hex;
    b.appendChild(s);
    b.addEventListener("click", () => {
      if (b.disabled) return;
      b.classList.add("tapped");
      item.tapped.push(tok);
      const step = item.tapped.length - 1;
      /* Check each tap as it happens so a wrong one stops the turn. */
      if (item.tapped[step] !== item.targets[step]) {
        [...board.children].forEach(c => c.disabled = true);
        b.classList.add("wrong");
        item.targets.forEach(t => {
          const idx = item.board.indexOf(t);
          board.children[idx].classList.add("right");
        });
        finishItem("miss", { message: `The instruction was: “${item.text}”` });
        return;
      }
      b.classList.add("right");
      if (item.tapped.length === item.targets.length) {
        [...board.children].forEach(c => c.disabled = true);
        finishItem("solo");
      }
    });
    board.appendChild(b);
  });

  setStage("");
  $("stage").appendChild(board);
  setControls([
    { label: "🔊 Say it again", cls: "listen", onClick: () => speak(item.text) },
    { label: "👁 Show me the words", onClick: () => feedback(`“${item.text}”`, "soft") },
  ]);
  speak(item.text);
};

/* ================================================
   THE EXERCISES — speaking / producing
   These are the ones weighted up for Broca's aphasia.

   Every speaking turn works the same way, because consistency
   matters more than novelty here:
     🔊 hear the model   →  💡 hints, one step stronger each press
     🎤 optional computer listening
     ✅ "I said it"  or  🤝 "say it together"
   Nobody is ever timed, and the hint ladder can always be climbed.
   ================================================ */

/* A clue about the meaning, built from the word's features. */
function semanticCue(w) {
  const bits = [];
  if (w.cat === "food") {
    /* "something to eat or drink" plus "you can eat it" says the same
       thing twice, so for food go straight to which one it is. */
    bits.push(w.drink ? "You can drink it." : "You can eat it.");
  } else {
    bits.push(`It is ${CATEGORY_LABELS[w.cat] || "a thing"}.`);
    if (w.edible) bits.push("You can eat it.");
  }
  if (w.alive) bits.push("It is alive.");
  if (w.big)   bits.push("It is big.");
  bits.push(`It has ${w.syl} ${w.syl === 1 ? "beat" : "beats"}.`);
  return bits.join(" ");
}

/* The sound a letter makes, for "it starts with…" hints. */
function firstSound(word) {
  const L = LETTERS.find(x => x.l === word[0].toLowerCase());
  return L ? L.sound : word[0];
}

/* Give the next hint up the ladder. Each press is a stronger cue:
   meaning → first sound → first part → the whole word.
   This is the standard cueing hierarchy used in naming therapy. */
async function giveCue(item, target, wordObj) {
  item.cue = (item.cue || 0) + 1;
  const first = target.split(" ")[0];

  if (item.cue === 1 && wordObj) {
    const c = semanticCue(wordObj);
    feedback(c, "soft");
    await speak(c);
    return;
  }
  if (item.cue <= 2) {
    feedback(`It starts with <strong>${first[0].toUpperCase()}</strong> — “${firstSound(first)}”`, "soft");
    await speak(firstSound(first));
    return;
  }
  if (item.cue === 3) {
    const chunk = syllabify(first).split(" · ")[0];
    feedback(`<strong>${chunk}…</strong>`, "soft");
    revealWord(chunk + "…");
    await speak(chunk);
    return;
  }
  /* Last rung: the whole thing, said slowly, to say together. */
  feedback(`Say it with me: <strong>${target}</strong>`, "soft");
  revealWord(target);
  await speak(target, { rate: Math.max(0.4, state.settings.rate - 0.15) });
}

/* Naming shows "?" until a hint uncovers the word. */
function revealWord(text) {
  const el = $("nameWord");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("masked");
}

/* Build the control bar for any speaking turn. */
function productionControls(item, target, wordObj, opts = {}) {
  const buttons = [];

  buttons.push({
    label: "🔊 Hear it",
    cls: "listen",
    onClick: () => speak(target),
  });

  if (!opts.noCues) {
    buttons.push({
      label: "💡 Hint",
      onClick: () => giveCue(item, target, wordObj),
    });
  }

  if (state.settings.asr && asrAvailable()) {
    buttons.push({
      label: "🎤 Let me try",
      onClick: async (el) => {
        el.classList.add("recording");
        el.innerHTML = "🎤 Listening…";
        feedback("Say it now.", "soft");
        const alts = await listenOnce();
        el.classList.remove("recording");
        el.innerHTML = "🎤 Let me try";
        if (!alts || !alts.length) {
          feedback("I did not catch that. Use the buttons below.", "soft");
          return;
        }
        const best = alts.reduce((b, a) => Math.max(b, similar(a, target)), 0);
        if (best >= 0.65) {
          feedback(`${pick(PRAISE)} <span class="heard">(heard “${alts[0]}”)</span>`, "good");
          setTimeout(() => scoreProduction(item, "auto"), 700);
        } else {
          feedback(`<span class="heard">The computer heard “${alts[0]}”. It is often wrong — you decide.</span>`, "soft");
        }
      },
    });
  }

  buttons.push({
    label: "✅ I said it",
    cls: "good",
    onClick: () => scoreProduction(item, "self"),
  });

  buttons.push({
    label: "🤝 Say it together",
    onClick: async () => {
      item.cue = 9;
      feedback(`<strong>${target}</strong>`, "soft");
      await speak(target, { rate: Math.max(0.4, state.settings.rate - 0.15) });
      scoreProduction(item, "together");
    },
  });

  setControls(buttons);
}

/* Turn "how it went" into one of the three scores. */
function scoreProduction(item, how) {
  if (how === "together") { finishItem("miss", { message: "Good — saying it together counts too." }); return; }
  const cued = (item.cue || 0) > 0;
  finishItem(cued ? "cued" : "solo");
}

/* --- Say a letter sound --- */
RENDER.letter_say = (item) => {
  const L = item.letter;
  setInstruction("Listen, then say the sound.");
  setStage(`
    <div class="big-card">
      <span class="big-word">${L.l.toUpperCase()} ${L.l}</span>
      <span class="syllables">“${L.sound}”</span>
      <span class="big-emoji" style="font-size:calc(2.6rem * var(--scale))">${L.e}</span>
      <span class="syllables">as in ${L.word}</span>
    </div>`);
  productionControls(item, L.sound, null, { noCues: true });
  speak(L.sound);
};

/* --- Hear a word, say it back --- */
RENDER.listen_repeat = (item) => {
  const w = item.word;
  setInstruction("Listen, then say it back.");
  setStage(`
    <div class="big-card">
      <span class="big-emoji">${w.e}</span>
      <span class="big-word">${w.w}</span>
      <span class="syllables">${syllabify(w.w)}</span>
    </div>`);
  productionControls(item, w.w, w);
  speak(w.w);
};

/* --- Name the picture (with the word hidden) --- */
RENDER.name_picture = (item) => {
  const w = item.word;
  setInstruction("What is this?");

  /* Errorless practice: hear the right word first, so there is no
     chance to rehearse a wrong one. Switched off as skill returns. */
  const errorless = state.settings.errorless;
  setStage(`
    <div class="big-card">
      <span class="big-emoji">${w.e}</span>
      <span class="big-word ${errorless ? "" : "masked"}" id="nameWord">${errorless ? w.w : "?"}</span>
    </div>`);
  productionControls(item, w.w, w);
  if (errorless) speak(w.w);
};

/* --- Finish the sentence --- */
RENDER.cloze = (item) => {
  const c = item.cloze;
  setInstruction("Finish the sentence.");
  setStage(`<div class="read-sentence">${c.s.replace("___", "<span class='hi'>&nbsp;&nbsp;?&nbsp;&nbsp;</span>")}</div>`);
  productionControls(item, c.a, item.word);
  /* Say the sentence, trailing off, which pulls the last word out. */
  speak(c.s.replace("___", "..."));
};

/* --- Read a sentence out loud --- */
RENDER.read_aloud = (item) => {
  const text = item.sentence.words.join(" ");
  setInstruction("Read this out loud.");
  setStage(`<div class="read-sentence">${text}</div>`);
  productionControls(item, text, null, { noCues: true });
};

/* --- Answer a question about your own life --- */
RENDER.wh_question = (item) => {
  setInstruction("Answer the question.");
  setStage(`
    <div class="big-card" style="padding:2rem 1.5rem">
      <span class="big-emoji" style="font-size:calc(3rem * var(--scale))">❓</span>
      <span class="read-sentence" style="font-size:calc(1.7rem * var(--scale))">${item.q.q}</span>
    </div>`);
  setControls([
    { label: "🔊 Ask me again", cls: "listen", onClick: () => speak(item.q.q) },
    { label: "💡 Start me off", onClick: async () => {
        item.cue = 1;
        feedback(`<strong>${item.q.hint}</strong>`, "soft");
        await speak(item.q.hint);
      } },
    { label: "✅ I answered", cls: "good", onClick: () => scoreProduction(item, "self") },
    { label: "🤝 Skip this one", onClick: () => finishItem("miss", { message: "That's fine — it will come round again." }) },
  ]);
  speak(item.q.q);
};

/* --- Put words in order, then say the sentence --- */
RENDER.build_sentence = (item) => {
  const correct = item.sentence.words;
  setInstruction("Put the words in order.");
  setStage(`
    <div class="chip-slots" id="slots"><span class="slot-hint">Tap the words below</span></div>
    <div class="chip-tray" id="tray"></div>`);

  const slots = $("slots"), tray = $("tray");
  const placed = [];

  const redrawSlots = () => {
    slots.innerHTML = placed.length ? "" : `<span class="slot-hint">Tap the words below</span>`;
    placed.forEach((word, i) => {
      const chip = document.createElement("button");
      chip.className = "chip placed";
      chip.textContent = word;
      chip.addEventListener("click", () => {   /* tap again to take it back */
        placed.splice(i, 1);
        redrawSlots(); redrawTray();
      });
      slots.appendChild(chip);
    });
  };

  const redrawTray = () => {
    tray.innerHTML = "";
    /* Words still waiting, counted so duplicates behave. */
    const remaining = [...item.shuffled];
    placed.forEach(p => {
      const i = remaining.indexOf(p);
      if (i > -1) remaining.splice(i, 1);
    });
    remaining.forEach(word => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = word;
      chip.addEventListener("click", () => { placed.push(word); redrawSlots(); redrawTray(); });
      tray.appendChild(chip);
    });
  };

  item.shuffled = item.shuffled || shuffle([...correct]);
  redrawSlots(); redrawTray();

  const check = () => {
    if (placed.length !== correct.length) { feedback("Use all the words.", "soft"); return; }
    const ok = placed.every((w, i) => w === correct[i]);
    if (ok) {
      const text = correct.join(" ");
      feedback("That is the right order. Now say it.", "good");
      speak(text);
      setInstruction("Now say it out loud.");
      setControls([
        { label: "🔊 Hear it again", cls: "listen", onClick: () => speak(text) },
        { label: "✅ I said it", cls: "good", onClick: () => finishItem(item.tries === 0 ? "solo" : "cued") },
        { label: "🤝 Say it together", onClick: async () => { await speak(text, { rate: 0.55 }); finishItem("cued"); } },
      ]);
      return;
    }
    item.tries++;
    if (item.tries === 1) {
      feedback("Not quite. Try moving one word.", "soft");
      return;
    }
    /* Second miss: show the answer rather than let frustration build. */
    placed.length = 0;
    correct.forEach(w => placed.push(w));
    redrawSlots(); redrawTray();
    speak(correct.join(" "));
    finishItem("miss", { message: `The sentence is: <strong>${correct.join(" ")}</strong>` });
  };

  setControls([
    { label: "🔊 Hear the sentence", cls: "listen", onClick: () => speak(correct.join(" ")) },
    { label: "↺ Clear", onClick: () => { placed.length = 0; redrawSlots(); redrawTray(); } },
    { label: "✓ Check", cls: "primary", onClick: check },
  ]);
};

/* --- Put the steps of a routine in order --- */
RENDER.sequence_story = (item) => {
  const correct = item.story.steps;
  setInstruction(item.story.title);
  setStage(`
    <p class="lead" style="text-align:center">Put the steps in order, first to last.</p>
    <div class="chip-slots" id="slots"><span class="slot-hint">Tap the steps below</span></div>
    <div class="chip-tray" id="tray"></div>`);

  const slots = $("slots"), tray = $("tray");
  const placed = [];
  item.shuffled = item.shuffled || shuffle([...correct]);

  const redraw = () => {
    slots.innerHTML = placed.length ? "" : `<span class="slot-hint">Tap the steps below</span>`;
    placed.forEach((s, i) => {
      const chip = document.createElement("button");
      chip.className = "chip placed";
      chip.textContent = `${i + 1}. ${s}`;
      chip.addEventListener("click", () => { placed.splice(i, 1); redraw(); });
      slots.appendChild(chip);
    });
    tray.innerHTML = "";
    item.shuffled.filter(s => !placed.includes(s)).forEach(s => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = s;
      chip.addEventListener("click", () => { placed.push(s); redraw(); });
      tray.appendChild(chip);
    });
  };
  redraw();

  const check = () => {
    if (placed.length !== correct.length) { feedback("Use all the steps.", "soft"); return; }
    const ok = placed.every((s, i) => s === correct[i]);
    if (ok) {
      feedback("That is the right order. Now tell me the story.", "good");
      setInstruction("Say each step out loud.");
      setControls([
        { label: "🔊 Hear it", cls: "listen", onClick: () => speak(correct.join(", then ")) },
        { label: "✅ I said it", cls: "good", onClick: () => finishItem(item.tries === 0 ? "solo" : "cued") },
      ]);
      return;
    }
    item.tries++;
    if (item.tries === 1) { feedback("Close. Try swapping two steps.", "soft"); return; }
    placed.length = 0;
    correct.forEach(s => placed.push(s));
    redraw();
    finishItem("miss", { message: "Here is the order. Read it through with me." });
  };

  setControls([
    { label: "↺ Clear", onClick: () => { placed.length = 0; redraw(); } },
    { label: "✓ Check", cls: "primary", onClick: check },
  ]);
};

/* --- Say what you can see --- */
RENDER.describe_scene = (item) => {
  const sc = item.scene;
  setInstruction(sc.prompt);
  setStage(`
    <div class="scene-pics">${sc.pics.join(" ")}</div>
    <p class="lead" style="text-align:center">Tap each word once you have said it. Any order, no rush.</p>
    <div class="target-list" id="targets"></div>`);

  const list = $("targets");
  sc.targets.forEach(word => {
    const b = document.createElement("button");
    b.className = "target-word";
    b.textContent = word;
    b.addEventListener("click", () => {
      const i = item.said.indexOf(word);
      if (i > -1) { item.said.splice(i, 1); b.classList.remove("said"); }
      else { item.said.push(word); b.classList.add("said"); speak(word); }
    });
    list.appendChild(b);
  });

  setControls([
    { label: "🔊 Hear the question", cls: "listen", onClick: () => speak(sc.prompt) },
    { label: "✅ Done", cls: "good", onClick: () => {
        const share = item.said.length / sc.targets.length;
        if (share >= 0.6) finishItem("solo");
        else if (share >= 0.3) finishItem("cued", { message: `${item.said.length} of ${sc.targets.length} words — that is real talking.` });
        else finishItem("miss", { message: "Let's go through the words together." });
      } },
  ]);
  speak(sc.prompt);
};

/* --- Record yourself and listen back ---
   Hearing your own speech next to the model is the core exercise for
   Wernicke's aphasia, where the difficulty is not making sounds but
   noticing that what came out was not what was meant. */
RENDER.self_monitor = (item) => {
  const target = item.target;
  setInstruction("Say it, then listen to yourself.");
  setStage(`
    <div class="big-card">
      ${item.word ? `<span class="big-emoji">${item.word.e}</span>` : ""}
      <span class="big-word" style="font-size:calc(2.2rem * var(--scale))">${target}</span>
    </div>
    <div class="record-row" id="recRow"></div>`);

  let recorder = null, chunks = [], audioURL = null;
  item.tries = 0;

  const drawControls = () => {
    const btns = [
      { label: "🔊 Hear the model", cls: "listen", onClick: () => speak(target) },
    ];
    if (!recorder) {
      btns.push({ label: audioURL ? "🎙 Record again" : "🎙 Record me", cls: "primary", onClick: startRec });
    } else {
      btns.push({ label: "⏹ Stop", cls: "recording", onClick: stopRec });
    }
    if (audioURL) {
      btns.push({ label: "▶ Hear myself", onClick: () => new Audio(audioURL).play() });
      btns.push({ label: "✅ They matched", cls: "good", onClick: () => finishItem(item.tries <= 1 ? "solo" : "cued") });
      btns.push({ label: "🔁 Not the same", onClick: () => {
          feedback("Good noticing — that is the skill. Listen once more, then try again.", "soft");
          speak(target);
        } });
    }
    setControls(btns);
  };

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        audioURL = URL.createObjectURL(new Blob(chunks, { type: chunks[0] ? chunks[0].type : "audio/webm" }));
        recorder = null;
        item.tries++;
        $("recRow").innerHTML = "";
        feedback("Now listen back. Did it match?", "soft");
        drawControls();
      };
      recorder.start();
      $("recRow").innerHTML = `<span class="rec-dot"></span><span>Recording…</span>`;
      feedback("", "");
      drawControls();
    } catch (e) {
      /* No microphone, or permission refused — fall back to judging
         from memory rather than blocking the exercise. */
      feedback("No microphone here. Say it after the model instead.", "soft");
      setControls([
        { label: "🔊 Hear the model", cls: "listen", onClick: () => speak(target) },
        { label: "✅ I said it", cls: "good", onClick: () => finishItem("solo") },
        { label: "🤝 Say it together", onClick: async () => { await speak(target, { rate: 0.55 }); finishItem("cued"); } },
      ]);
    }
  }

  function stopRec() { if (recorder) recorder.stop(); }

  drawControls();
  speak(target);
};

/* ================================================
   END OF SESSION
   ================================================ */
function endSession() {
  const counts = { solo: 0, cued: 0, miss: 0 };
  session.results.forEach(r => { if (counts[r] != null) counts[r]++; });
  const total = session.results.length || 1;

  /* Streak: one practice on a day is enough to keep it going. */
  const today = todayKey();
  if (state.lastDay !== today) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    state.streak = (state.lastDay === yesterday) ? state.streak + 1 : 1;
    state.lastDay = today;
  }

  state.sessions.push({
    date: today, level: session.level, type: session.onlyType || "mixed",
    solo: counts.solo, cued: counts.cued, miss: counts.miss, total,
  });

  const unlocked = checkUnlock();
  save();

  /* Fill in the summary screen. */
  const score = (counts.solo + counts.cued * 0.5) / total;
  $("summaryEmoji").textContent = score >= 0.8 ? "🌟" : score >= 0.5 ? "👏" : "💪";
  $("summaryTitle").textContent = score >= 0.8 ? "Really good work" : score >= 0.5 ? "Well done" : "You showed up";
  $("summaryLead").textContent = score >= 0.5
    ? `${counts.solo + counts.cued} of ${total} turns went well.`
    : "Every practice counts, even the hard ones.";

  const setBar = (barId, valId, n) => {
    $(barId).style.width = `${(n / total) * 100}%`;
    $(valId).textContent = n;
  };
  setBar("barSolo", "valSolo", counts.solo);
  setBar("barCued", "valCued", counts.cued);
  setBar("barMissed", "valMissed", counts.miss);

  const note = $("unlockNote");
  if (unlocked) {
    const next = LEVELS[state.unlocked - 1];
    note.innerHTML = `🎉 <strong>Level ${next.n} is open: ${next.name}</strong><br>${next.blurb}`;
    note.classList.remove("hidden");
    speak(`Well done. Level ${next.n} is open.`);
  } else {
    note.classList.add("hidden");
  }

  session = null;
  showScreen("summaryScreen");
}

/* ================================================
   SETTINGS, SAVING AND HELPERS
   ================================================ */
function applySettings() {
  document.body.classList.toggle("dark", !!state.dark);
  $("darkIcon").textContent = state.dark ? "☀" : "☾";
  document.body.classList.remove("size-large", "size-huge");
  if (state.settings.size === "large") document.body.classList.add("size-large");
  if (state.settings.size === "huge") document.body.classList.add("size-huge");

  $("rateRange").value = state.settings.rate;
  $("rateVal").textContent = `${Number(state.settings.rate).toFixed(2)}×`;
  $("sizeSelect").value = state.settings.size;
  $("choicesSelect").value = String(state.settings.choices);
  $("errorlessToggle").checked = !!state.settings.errorless;
  $("asrToggle").checked = !!state.settings.asr;
  $("profileSelect").value = state.profile;

  /* Computer listening cannot be offered where the browser has none. */
  if (!asrAvailable()) {
    $("asrToggle").checked = false;
    $("asrToggle").disabled = true;
    $("asrHelp").textContent = "This browser cannot listen. Chrome or Edge can; either way, you can always score the attempt yourself.";
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `speak-again-progress-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Saved a copy of your progress.");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== "object" || !data.settings) throw new Error("not a progress file");
      state = Object.assign(structuredClone(DEFAULT_STATE), data);
      state.settings = Object.assign(structuredClone(DEFAULT_STATE.settings), data.settings);
      save();
      applySettings();
      renderHome();
      showToast("Progress loaded.");
    } catch (e) {
      showToast("⚠ That file could not be read.");
    }
  };
  reader.readAsText(file);
}

/* The guidance panel — what a helper needs to know to run a session
   well, plus a plain-language read-out of how things are going. */
function renderHelper() {
  const rows = LEVELS.map(l => {
    const m = Math.round(mastery(l.n) * 100);
    const a = attemptsAt(l.n);
    const status = l.n > state.unlocked ? "not open yet" : (a === 0 ? "not started" : `${m}% over last ${Math.min(a, MASTERY_WINDOW)} turns`);
    return `<tr><td>${l.n}. ${l.name}</td><td>${status}</td></tr>`;
  }).join("");

  const shaky = wordsNeedingReview().slice(0, 12);

  $("helperBody").innerHTML = `
    <h4>How to sit with someone during practice</h4>
    <ul>
      <li>Face them, and give them time. Long pauses are normal — waiting is doing something.</li>
      <li>Do not finish their word for them unless they ask. Use the <strong>Hint</strong> button instead: it gives the meaning first, then the first sound, then the whole word.</li>
      <li>Accept any attempt that is close. Getting the sound started matters more than getting it perfect.</li>
      <li>Stop while it is still going well. Two short sessions beat one long one.</li>
      <li>Speaking is separate from thinking. Aphasia does not change what someone knows or feels.</li>
    </ul>

    <h4>What the three scores mean</h4>
    <ul>
      <li><strong>On your own</strong> — said or chosen without help.</li>
      <li><strong>With a hint</strong> — got there after one or more cues. This is real progress.</li>
      <li><strong>Together</strong> — done alongside the model. Not a failure; it is how new words go in.</li>
    </ul>

    <h4>Which mix to choose</h4>
    <ul>
      <li><strong>Getting words out (Broca's)</strong> — speech is slow and effortful but understanding is largely intact. Practice leans on naming, repeating and sentence building.</li>
      <li><strong>Understanding words (Wernicke's)</strong> — speech flows but words go astray and instructions are hard to follow. Practice leans on listening, matching, and hearing yourself back.</li>
      <li>Most people are somewhere in between. <strong>Both</strong> is a safe choice.</li>
    </ul>

    <h4>Progress by level</h4>
    <table class="helper-table">
      <tr><th>Level</th><th>Recent score</th></tr>
      ${rows}
    </table>
    <p style="margin-top:0.5rem">A level opens the next one at ${Math.round(MASTERY_TO_UNLOCK * 100)}% or better across ${MIN_ATTEMPTS_TO_UNLOCK} turns. You can also open any unlocked level by hand from the list on the home screen.</p>

    <h4>Words to come back to</h4>
    <p>${shaky.length ? shaky.join(", ") : "Nothing is standing out yet."}</p>

    <h4>Please note</h4>
    <p>This is home practice, not treatment, and it cannot diagnose anything. Recovery after stroke is slow and uneven, and it continues for years. A speech and language therapist can tell you which levels are worth the effort right now — the “Save a copy” button in Settings makes a file you can take to an appointment.</p>`;
}

/* ================================================
   WIRING IT ALL UP
   ================================================ */
function init() {
  load();
  applySettings();

  /* Voices arrive asynchronously in most browsers. */
  loadVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;

  /* --- setup screen --- */
  document.querySelectorAll(".profile-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".profile-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      state.profile = card.dataset.profile;
      state.name = $("nameInput").value.trim();
      state.setupDone = true;
      save();
      applySettings();
      renderHome();
      showScreen("homeScreen");
      showToast(state.name ? `Welcome, ${state.name}.` : "Welcome.");
    });
  });

  /* --- home --- */
  $("startSessionBtn").addEventListener("click", () => startSession(null));

  /* --- session --- */
  $("quitBtn").addEventListener("click", () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    stopListening();
    session = null;
    renderHome();
    showScreen("homeScreen");
  });

  /* --- summary --- */
  $("againBtn").addEventListener("click", () => startSession(null));
  $("homeBtn").addEventListener("click", () => { renderHome(); showScreen("homeScreen"); });

  /* --- top bar --- */
  $("darkToggle").addEventListener("click", () => {
    state.dark = !state.dark;
    save();
    applySettings();
  });
  $("settingsBtn").addEventListener("click", () => $("settingsOverlay").classList.remove("hidden"));
  $("closeSettings").addEventListener("click", () => $("settingsOverlay").classList.add("hidden"));
  $("helperBtn").addEventListener("click", () => { renderHelper(); $("helperOverlay").classList.remove("hidden"); });
  $("closeHelper").addEventListener("click", () => $("helperOverlay").classList.add("hidden"));

  /* Clicking the dark backdrop closes a panel. */
  ["settingsOverlay", "helperOverlay"].forEach(id => {
    $(id).addEventListener("click", (e) => { if (e.target === $(id)) $(id).classList.add("hidden"); });
  });

  /* --- settings --- */
  $("rateRange").addEventListener("input", (e) => {
    state.settings.rate = Number(e.target.value);
    $("rateVal").textContent = `${state.settings.rate.toFixed(2)}×`;
    save();
  });
  $("voiceSelect").addEventListener("change", (e) => { state.settings.voiceURI = e.target.value; save(); });
  $("testVoiceBtn").addEventListener("click", () => speak("Here is what my voice sounds like."));
  $("sizeSelect").addEventListener("change", (e) => { state.settings.size = e.target.value; save(); applySettings(); });
  $("choicesSelect").addEventListener("change", (e) => { state.settings.choices = Number(e.target.value); save(); });
  $("errorlessToggle").addEventListener("change", (e) => { state.settings.errorless = e.target.checked; save(); });
  $("asrToggle").addEventListener("change", (e) => {
    state.settings.asr = e.target.checked;
    save();
    if (e.target.checked) showToast("The computer will offer a guess. You still decide.");
  });
  $("profileSelect").addEventListener("change", (e) => { state.profile = e.target.value; save(); renderHome(); });

  $("exportBtn").addEventListener("click", exportData);
  $("importFile").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); });
  $("resetBtn").addEventListener("click", () => {
    if (!confirm("Start over? All progress on this device will be erased.")) return;
    localStorage.removeItem("aphasiaTherapyData");
    state = structuredClone(DEFAULT_STATE);
    applySettings();
    showScreen("setupScreen");
    showToast("Everything has been cleared.");
  });

  /* Escape closes whatever is open. */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    $("settingsOverlay").classList.add("hidden");
    $("helperOverlay").classList.add("hidden");
  });

  /* Stop the voice if the page is hidden mid-sentence. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && window.speechSynthesis) window.speechSynthesis.cancel();
  });

  /* First visit goes to setup; afterwards straight to the home screen. */
  if (state.setupDone) {
    renderHome();
    showScreen("homeScreen");
  } else {
    showScreen("setupScreen");
  }
}

document.addEventListener("DOMContentLoaded", init);
