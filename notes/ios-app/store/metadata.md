# App Store Connect — every field, written out

Copy these in. Where a limit is given it is Apple's, and the text below
is inside it.

---

## Name (30 characters)

```
Inkwell: Handwritten Notes
```

## Subtitle (30 characters)

```
Write, draw, annotate. Local.
```

## Primary category

Productivity

## Secondary category

Education

---

## Promotional text (170 characters — editable without a new build)

```
Write by hand with the Apple Pencil, drop in photos and video, and mark up PDFs. Everything stays on your device — no account, no cloud, nothing to sign up for.
```

## Description (4000 characters)

```
Inkwell is a notebook you write in by hand.

Pick up the Apple Pencil and write. The ink thins and thickens with how
hard you press, the way a real pen does. Rest your hand on the screen —
once you've used the Pencil, fingers pan the page instead of drawing on
it. Two fingers always pinch to zoom, whatever you're holding.

WRITE
• A pressure-sensitive pen in any colour and five widths
• A highlighter that layers properly instead of painting over
• An eraser that lifts whole strokes rather than chewing holes in them
• A lasso to pick ink up and move, copy or delete it
• Draw a rough circle, box or line and hold still — it cleans up into
  the shape you meant

PAPER
Plain, ruled, grid, dotted, Cornell and manuscript. A4, Letter, square,
landscape, or a tall scrolling page for lectures. Change it on any page
at any time.

PUT THINGS ON THE PAGE
• Photos from your library or straight from the camera — drag, resize,
  rotate, round the corners
• Video that plays in place on the page
• Text boxes with the real keyboard, so dictation and autocorrect work
• Any file, attached to the page and kept with the notebook

PDFs
Import one and every page becomes a page you can write on. Annotate it,
highlight it, fill it in by hand, draw over it. Your marks live in the
notebook; the original file is untouched.

WORD AND POWERPOINT
Inkwell reads the text of .docx and .pptx files and lays it out as
editable text boxes you can annotate and write around. It reads the text
only — formatting, tables and layout are not kept, and edits cannot be
saved back into the original format. The file itself is attached to the
page so nothing is lost.

GET IT BACK OUT
Export a page as an image, a page or a whole notebook as a PDF, or the
entire library as a backup file that restores everything — handwriting,
photos and video included — on any device.

EVERYTHING STAYS ON YOUR DEVICE
There is no account to create, no subscription, and no server. Inkwell
has no analytics and makes no network requests of its own. Nothing you
write is uploaded anywhere, because there is nowhere for it to go.

The other side of that: there is no sync between devices, and nothing is
backed up for you. Use the backup export, and keep the file somewhere
other than the device that made it.

A few more things worth knowing before you buy:
• Handwriting is not converted to text and is not searchable. Search
  covers typed text, file names and notebook titles.
• An imported PDF page is annotated, not re-edited — you can write on a
  paragraph, not retype it and have the rest reflow.
• Exported PDFs are flattened, so text in them is not selectable. The
  backup file is the one that restores notes as notes.
• Reading .docx and .pptx needs iOS 16.4 or later.
```

## Keywords (100 characters, comma-separated, no spaces after commas)

```
notes,handwriting,apple pencil,pdf,annotate,notebook,ink,draw,markup,offline,private,journal,sketch
```

## Support URL

Your repository's issues page, or any page you'll actually read.

## Marketing URL

Optional. Leave blank rather than pointing at something unfinished.

---

## Privacy

**App Privacy → Data Collection: No, we do not collect data from this
app.**

This is true as shipped and worth keeping true. The app has no analytics
SDK, no crash reporter, no account system and makes no network request of
its own. The only outbound request in the whole codebase is the CDN
fallback for pdf.js in `js/pdfin.js`, and the iOS build bundles pdf.js
precisely so that request never happens.

If you ever add analytics, sync or a crash reporter, this answer has to
change before that build ships.

### Privacy policy text, if you're asked for one

```
Inkwell does not collect, transmit or store any personal data.

Everything you write, draw, photograph or import is stored on your device
only, in the app's own storage. It is never uploaded, and the developer
has no access to it and no way to obtain it.

The app contains no analytics, no advertising and no third-party SDKs
that collect data. It makes no network requests.

Photos, camera, and the photo library are used only when you choose to
put a photo or video on a page, and only for the item you pick. The copy
kept in the app stays on your device.

Deleting the app deletes everything in it. Export a backup first if you
want to keep your notebooks.
```

---

## Age rating

4+. Nothing in the app generates or fetches content.

## Export compliance

`ITSAppUsesNonExemptEncryption` is set to `false` by
`scripts/patch-ios.mjs`, so App Store Connect stops asking. That is
accurate: the app implements no encryption of its own, and makes no
network calls at all.

---

## Review notes

Paste this into "Notes" for the reviewer. The 4.2 question is the one
that gets apps like this rejected, and answering it before it is asked is
free.

```
Inkwell is a handwriting and note-taking app. It is fully functional with
no network connection — please feel free to test it in airplane mode.

It is not a web wrapper around a website: there is no remote URL, all
assets are bundled, and the app uses the camera, the photo library and
on-device PDF rendering. It makes no network requests of any kind.

To try the main features:
1. Tap + to create a notebook. Write on the page with a finger or Pencil.
2. Tap + in the toolbar to add a photo, a video or a text box.
3. Tap + > "PDF, as pages" and pick any PDF — each page becomes a page
   you can write on.
4. Tap the export icon to save a page as a PDF or image.

Note on the Word/PowerPoint feature: the app reads the text of .docx and
.pptx files and places it as editable text boxes. It does not claim to
preserve formatting or to save back into those formats, and the
description says so explicitly.

There is no account, no subscription and no data collection.
```
