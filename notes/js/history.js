/* ================================================
   INKWELL — history.js
   Undo and redo.

   Snapshots, not commands. A command stack is smaller and cleverer, and
   it is also where this kind of app goes wrong: one operation that
   forgets to write its inverse and undo starts quietly corrupting
   pages. A page is a plain object; cloning it is a few hundred
   microseconds; and being certain that undo restores exactly what was
   there is worth far more than the memory.

   The depth cap is what keeps that honest. Thirty steps on a page with
   a thousand strokes is a few megabytes, held only while the page is
   open — snapshots are dropped on page turn, not saved to disk.
   ================================================ */

const DEPTH = 30;

export class History extends EventTarget {
  constructor(depth = DEPTH) {
    super();
    this.depth = depth;
    this.past = [];
    this.future = [];
    this.baseline = null;
  }

  /* Call before a change, with the page as it is now. */
  record(page) {
    if (!page) return;
    this.past.push(snapshot(page));
    if (this.past.length > this.depth) this.past.shift();
    this.future.length = 0;
    this.changed();
  }

  undo(page) {
    if (!this.past.length) return null;
    this.future.push(snapshot(page));
    const prev = this.past.pop();
    this.changed();
    return prev;
  }

  redo(page) {
    if (!this.future.length) return null;
    this.past.push(snapshot(page));
    const next = this.future.pop();
    this.changed();
    return next;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  reset() {
    this.past.length = 0;
    this.future.length = 0;
    this.changed();
  }

  changed() { this.dispatchEvent(new CustomEvent("change")); }
}

/* Only the parts a user edit can touch. The blobs stay where they are —
   undoing a photo insert removes the object, and the bytes are cleaned
   up when the page is saved without them. */
function snapshot(page) {
  return {
    strokes: page.strokes.map((s) => ({ ...s, points: s.points.map((p) => p.slice()) })),
    objects: page.objects.map((o) => ({ ...o })),
    paper: page.paper,
    background: page.background ? { ...page.background } : null,
  };
}

export function applySnapshot(page, snap) {
  page.strokes = snap.strokes;
  page.objects = snap.objects;
  page.paper = snap.paper;
  page.background = snap.background;
  return page;
}
