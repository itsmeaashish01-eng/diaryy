# Inkwell

A notebook you write in by hand. Pen, highlighter, photos, video, PDFs and
typed text on real paper — stored on your own device, with no account, no
sync and no server.

It is the companion to the diary in this repository: the diary is for
typing, Inkwell is for the things typing can't hold — a diagram, a
margin note, a photo of a whiteboard, a page of a PDF you needed to argue
with.

```
open notes/index.html          # or: npx serve notes
node notes/selftest.mjs        # the offline test suite
```

Works in any modern browser. Add it to the home screen on an iPhone or
iPad and it runs full screen, offline, like an app. For the real App
Store build, see [`ios-app/`](ios-app/).

---

## What it does

**Writing.** A pressure-sensitive pen that thins and thickens with how
hard you press — real pressure from an Apple Pencil, a steady width from
a finger or a mouse. A highlighter that multiplies rather than paints
over, so overlapping marks stay readable. An eraser that removes whole
strokes rather than chewing holes in them. A lasso to pick ink up and
move, copy or delete it.

**Shape snapping.** Draw a rough circle, rectangle or line and hold the
pen still for a moment at the end: it cleans up into the shape you meant.
Deliberately conservative — a squiggle stays a squiggle, because turning
one into a rectangle is far more annoying than failing to straighten a
line.

**Paper.** Plain, ruled, grid, dotted, Cornell and manuscript, in A4,
Letter, square, landscape, or a tall scrolling page for lecture notes.
Changeable per page, at any time.

**Photos and video.** Insert from the library or straight from the
camera. Drag, resize, rotate, round the corners, add a shadow. Video
plays in place on the page. Both are stored as binary in the browser's
own database, not as base64 in a text field, so a 40 MB video costs 40 MB
rather than 55.

**Text.** Real text boxes, with the system keyboard, dictation, selection
and autocorrect — because they are `contenteditable` elements rather than
something re-implemented on a canvas. Four typefaces, any size, any
colour, aligned however you like. Typed text is what the search box
searches.

**PDFs.** Import one and every page becomes a page you can write on,
annotate, highlight and draw over. The original is untouched; your marks
live in the notebook.

**Word and PowerPoint.** A `.docx` or `.pptx` comes in as editable text
boxes, one block per paragraph or slide, with the original file attached
to the page. Read honestly: this extracts the words, not the formatting.

**Getting it back out.** A page as PNG, a page or a notebook as PDF, or
the whole library as a `.json` backup that restores everything —
including the photos and the video — on any device.

**Everything is local.** There is no account to make and no server to be
down. The flip side is stated plainly below.

---

## What it does not do, and why

An app that lists features and stays quiet about the edges wastes your
time later. These are the edges.

**Handwriting is not searchable.** Search covers typed text, file names
and notebook titles. Recognising handwriting means shipping a model or
calling a service; the first is tens of megabytes and the second would
mean sending your notes to someone else's computer, which is the one
thing this app is built not to do.

**A PDF is imported as pictures.** You can write over a paragraph, circle
it, strike it through, fill in a form by hand. You cannot retype the
original's own text and have the rest reflow — that would require the app
to be a PDF editor, which is a different and much larger program.

**Word and PowerPoint are one-way.** Text and paragraph breaks survive.
Styles, tables, columns, charts, master slides, speaker notes and tracked
changes do not, and there is no way to save your edits back into a
`.docx` or `.pptx`. The original file is kept attached so nothing is
lost. Older binary `.doc` and `.ppt` can be attached but not read.

**Exported PDFs and PNGs are flattened.** Each page becomes a picture, so
typed text in an export is not selectable or searchable. This is a
deliberate trade: see [`js/pdfout.js`](js/pdfout.js) for what writing a
PDF without a 400 KB dependency costs. The `.json` backup is the lossless
format — it is the one to keep.

**There is no sync.** Notes live on the device that wrote them. Moving
them means exporting a backup and restoring it on the other device.
Back up before you need to.

**Browsers can evict storage.** The app asks for persistent storage on
launch, which most browsers grant and Safari grants sometimes. It is not
a guarantee. This is the strongest argument for the backup button, and
the reason it is one tap from the shelf.

---

## How it is built

No framework, no build step, no bundler. Plain ES modules the browser
loads directly — the same way the rest of this repository works. Open
`index.html` from a file server and it runs.

```
index.html          the shelf and the editor, in one document
style.css           paper, ink, and the furniture around them
sw.js               offline caching of the app (not of your notes)
manifest.webmanifest
icons/              generated — `node icons/make-icons.mjs`
selftest.mjs        the offline test suite, run in CI
browsertest.mjs     the same app driven in a real browser (needs Playwright)

js/
  app.js            state and wiring; the pointer lives here
  store.js          IndexedDB: notebooks, pages, blobs
  canvas.js         three stacked canvases and what goes on each
  strokes.js        stroke geometry — pure, and the best-tested part
  paper.js          page sizes and paper templates
  objects.js        photos, video, text boxes, attachments
  tools.js          the pen tray, and what each tool remembers
  history.js        undo and redo, by snapshot
  ui.js             shelf, menus, sheets, toasts
  export.js         flattening a page; PNG, PDF and backup
  pdfout.js         a PDF writer, in about 150 lines, no dependency
  pdfin.js          PDF import (lazily loads pdf.js — the only dependency)
  office.js         .docx and .pptx, via the browser's own zlib

ios-app/            the App Store build — see its README
```

### Three decisions worth knowing about

**Three canvases, not one.** Paper, committed ink, and the stroke
currently under the pen. Without the split, every pointer move would
redraw a page that might hold four thousand strokes. With it, the pen
only repaints its own last few millimetres, and the hundredth stroke
costs what the first one did.

**Objects are DOM, ink is canvas.** A `<video>` cannot be a rectangle on
a canvas, and a text box that is not `contenteditable` gives up the
keyboard, selection, dictation and autocorrect that come free with the
real thing. The price is that `export.js` has to draw them a second way,
with `fillText` and a word wrapper, to flatten a page.

**Undo is snapshots, not commands.** A command stack is smaller and
cleverer, and it is exactly where this kind of app goes wrong: one
operation that forgets to write its inverse and undo starts quietly
corrupting pages. A page is a plain object, cloning it takes a few
hundred microseconds, and being certain that undo restores what was there
is worth more than the memory. Thirty steps deep, dropped on page turn.

### Palm rejection

Once a pen has touched the screen, fingers stop drawing and start
panning. Until then, one finger draws — otherwise a device without a
Pencil could not draw at all. Two fingers always pan and zoom, in any
tool. This is the rule every pen app converges on, and it is what makes
resting a hand on the glass possible.

---

## Tests

```bash
node notes/selftest.mjs
```

Forty-one checks, no browser, no network, no dependencies — it runs in CI
in about a second, alongside the other apps in this repository. What it
covers is the quiet stuff, the kind that is wrong without anyone
noticing:

- **Stroke geometry.** That smoothing keeps both endpoints, that
  simplification drops the middle of a straight line but never a corner,
  that an outline straddles its spine and closes at both caps, that the
  eraser catches what it touches and not what it doesn't, that a lasso
  takes whole strokes only, and that shape snapping recognises a circle
  while leaving a deliberate squiggle alone.
- **The PDF writer.** That every offset in the cross-reference table
  lands exactly on its own object — get that wrong and the file opens in
  one reader and not in another, which is the worst kind of bug to
  diagnose from a bug report.
- **The ZIP reader**, against an archive the test builds itself with
  node's own deflate, so there is no `.docx` binary checked into the
  repository and a change to the reader is caught immediately. Including
  that `slide10` does not sort before `slide2`.
- **Page geometry.** Where a dropped photo lands, that a resize from a
  corner keeps the aspect, that rotation snaps near square and not
  elsewhere, and that hit testing follows a rotated object.

### The other half

```bash
npm install playwright     # not a repo dependency, which is the point
node notes/browsertest.mjs
```

The unit suite cannot catch a panel that is invisible but still
swallowing every tap, or ink that renders as two end caps with nothing
between them. `browsertest.mjs` drives the real app in a real browser
through twenty-one steps — draw, erase, lasso, type, turn a page, export
a PDF, come back to the shelf, search — and fails on any console error
along the way. Both of those bugs were found there rather than on a
phone.

It needs Playwright, which is why it is not in CI: the point of the
other suite is that it needs nothing.

What neither can cover is how any of it feels under a pen. That needs a
phone and a hand.
