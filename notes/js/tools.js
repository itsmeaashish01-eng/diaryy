/* ================================================
   INKWELL — tools.js
   The pen tray: which tool, what colour, how wide.

   Tool settings live in localStorage rather than IndexedDB. They are a
   few hundred bytes, they are read on every pointer down, and losing
   them costs you one tap — the opposite trade from the notes.

   Each tool remembers its own colour and width, which sounds like a
   detail and is the difference between an app that feels like a pen
   tray and one that feels like a settings screen. Switching to the
   highlighter and back should not lose where the pen was.
   ================================================ */

const KEY = "inkwell.tools.v1";

export const TOOL = {
  PEN: "pen",
  HIGHLIGHTER: "highlighter",
  ERASER: "eraser",
  LASSO: "lasso",
  TEXT: "text",
  HAND: "hand",
};

/* Colours that read on cream paper and still read on a dark one. The
   pure-black slot is deliberately a very dark grey: ink on paper is
   never #000, and against a bright page it is harsh to look at. */
export const INK_COLORS = [
  "#1f2529", "#3f4bd8", "#c2352f", "#1d7a4c",
  "#b36a12", "#7a3fa8", "#0f7d8f", "#5a4a3a",
];

export const HIGHLIGHT_COLORS = [
  "#ffe14d", "#8fe36b", "#6ac8ff", "#ff9ecb", "#ffab5e", "#c6a8ff",
];

export const PEN_SIZES = [2, 4, 7, 12, 20];
export const HIGHLIGHTER_SIZES = [18, 30, 46];
export const ERASER_SIZES = [12, 26, 48, 90];

const DEFAULTS = {
  active: TOOL.PEN,
  pen: { color: INK_COLORS[0], size: 4, opacity: 1 },
  highlighter: { color: HIGHLIGHT_COLORS[0], size: 30, opacity: 0.38 },
  eraser: { size: 26, strokeMode: true },
  text: { color: "#2b3138", size: 30, font: "sans", align: "left" },
  shapeSnap: true,
  // Once a Pencil has touched the screen, fingers stop drawing and
  // start panning. Same rule as every other pen app, and the only one
  // that makes resting a hand on the page workable.
  pencilOnly: "auto",
  recent: [],
};

export class Tools extends EventTarget {
  constructor() {
    super();
    this.state = load();
    this.sawPen = false;
  }

  get active() { return this.state.active; }

  set active(tool) {
    if (this.state.active === tool) return;
    this.state.active = tool;
    this.changed();
  }

  /* The settings for whichever tool is in hand. Eraser, lasso and hand
     have no colour, so callers check `tool` before reading one. */
  get current() {
    const t = this.state.active;
    if (t === TOOL.PEN) return { tool: t, ...this.state.pen };
    if (t === TOOL.HIGHLIGHTER) return { tool: t, ...this.state.highlighter };
    if (t === TOOL.ERASER) return { tool: t, ...this.state.eraser };
    if (t === TOOL.TEXT) return { tool: t, ...this.state.text };
    return { tool: t };
  }

  set(tool, patch) {
    if (!this.state[tool]) return;
    Object.assign(this.state[tool], patch);
    if (patch.color) this.remember(patch.color);
    this.changed();
  }

  toggle(key) {
    this.state[key] = !this.state[key];
    this.changed();
  }

  /* The last few colours picked from the wheel, so a custom colour does
     not have to be found twice. */
  remember(color) {
    if (!color) return;
    const recent = this.state.recent.filter((c) => c !== color);
    recent.unshift(color);
    this.state.recent = recent.slice(0, 8);
  }

  /* Palm rejection. In "auto" the rule only comes into force once a pen
     has been seen, because on a device without one it would mean no
     drawing at all. */
  shouldDraw(pointerType) {
    if (pointerType === "pen") { this.sawPen = true; return true; }
    if (pointerType === "mouse") return true;
    if (this.state.pencilOnly === "always") return false;
    if (this.state.pencilOnly === "never") return true;
    return !this.sawPen;
  }

  changed() {
    save(this.state);
    this.dispatchEvent(new CustomEvent("change"));
  }
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      ...DEFAULTS, ...raw,
      pen: { ...DEFAULTS.pen, ...raw.pen },
      highlighter: { ...DEFAULTS.highlighter, ...raw.highlighter },
      eraser: { ...DEFAULTS.eraser, ...raw.eraser },
      text: { ...DEFAULTS.text, ...raw.text },
      recent: Array.isArray(raw.recent) ? raw.recent : [],
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}
