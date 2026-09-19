# Inkwell for iOS

The App Store build. The app itself lives in `../` — this directory only
packages it, so there is no second copy of anything to keep in step.

**Everything here can be prepared on any machine. Everything from step 3
on needs a Mac.** Building, signing and submitting an iOS app requires
Xcode, and Xcode only runs on macOS. There is no way around that, and no
amount of cleverness in this repository changes it.

---

## Before you start

| What | Why | Cost |
|---|---|---|
| A Mac | Xcode runs nowhere else | — |
| [Xcode](https://apps.apple.com/app/xcode/id497799835) | Builds and signs the app | Free |
| [Apple Developer Program](https://developer.apple.com/programs/) | Required to submit to the App Store at all | **$99/year** |
| CocoaPods (`sudo gem install cocoapods`) | Capacitor uses it for native dependencies | Free |
| An iPad with an Apple Pencil, ideally | The pressure curve cannot be judged on a simulator | — |

Without the paid account you can still build and run on your own iPhone
or iPad over USB, for seven days at a time. You cannot put it on the App
Store.

---

## 1. Assemble the web app

```bash
cd notes/ios-app
npm install
npm run build
```

`www/` now holds the app with pdf.js and both typefaces bundled locally
and the service worker stripped out. Nothing it needs is fetched at
launch — which matters, because Apple is wary of apps that download their
code at runtime.

## 2. Check it actually runs

```bash
npx serve www      # or: cd www && python3 -m http.server 8098
```

Open it, turn off your wifi, reload. Write a page, insert a photo, import
a PDF, export it again. All of it should work with the network off. If
importing a PDF fails here, `vendor/pdfjs/` didn't get bundled — re-run
`npm run build` and read what it printed.

## 3. Create the Xcode project *(Mac)*

```bash
npm run ios:add
```

This runs the build, `npx cap add ios`, and then patches `Info.plist`
with the camera, microphone and photo-library permission strings. Without
those, iOS kills the app the moment it asks — not an error, a crash — and
App Review rejects it besides.

Re-run `npm run ios:sync` after any change to the app in `../`.

## 4. Open it in Xcode *(Mac)*

```bash
npm run ios:open
```

In Xcode, select the **App** target:

- **Signing & Capabilities** → tick *Automatically manage signing*, pick
  your Team.
- **Bundle Identifier** → change `com.inkwell.notes` to something you
  own, e.g. `com.yourname.inkwell`. It must be unique across the whole
  App Store and you cannot change it after the first submission.
- **General → Deployment Info** → minimum iOS **16.4**. This is not the
  usual "14 is safe": the `.docx` and `.pptx` reader uses
  `DecompressionStream`, which Safari only shipped in 16.4. Setting it
  lower means those imports fail on older devices with no warning.
- Tick **iPhone** and **iPad**. Unlike most apps this one genuinely wants
  the iPad — it is where the Pencil is — and Apple will then expect iPad
  screenshots too.
- Set the version to `1.0` and the build number to `1`.

Run it on the simulator (⌘R) to check it launches. You cannot judge the
pen on a simulator.

## 5. Put it on your own iPad first *(Mac)*

Plug it in, pick it as the run destination, ⌘R. Then write a page of real
notes with the Pencil, with your hand resting on the glass. This is the
only test that matters, and it costs nothing.

What to look for, in order of how much it would matter:

- Does the ink keep up, or does it lag behind the nib?
- Does resting your palm do anything it shouldn't?
- Does the pressure curve feel like a pen, or like a width slider?
- Does a two-finger pinch zoom the page, and does the ink stay sharp
  afterwards?

Each of those is tunable in `../js/strokes.js` (`smooth`, `radiusAt`) and
`../js/canvas.js` (`MAX_RENDER_SCALE`).

## 6. Submit *(Mac, paid account)*

1. [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** →
   **+** → **New App**. Pick the bundle ID from step 4.
2. Fill in the listing from [`store/metadata.md`](store/metadata.md) — it
   has the name, subtitle, description, keywords and privacy answers
   written out.
3. Screenshots: take them on a real device with real handwriting on the
   page. Apple wants 6.9" and 6.5" iPhone sizes, plus 13" iPad if you
   ship for iPad.
4. In Xcode: **Product → Archive**, then **Distribute App → App Store
   Connect**.
5. Back in App Store Connect, attach the build, answer the
   export-compliance question (already handled by the plist patch), and
   **Submit for Review**.

Review usually takes a day or two.

---

## What will get it rejected

Worth knowing before you spend the $99.

**Guideline 4.2 — Minimum Functionality.** Apple rejects apps that are a
website in a shell. The defence here is real and worth stating in the
review notes: the app works with no network at all, uses the camera and
the photo library, renders PDFs on-device, and does the whole of its work
offline. It is not a web view pointed at a URL —
`capacitor.config.json` has no `server.url`, and every asset is bundled.
**Do not add one.**

**Guideline 5.1.1 — purpose strings.** The camera, microphone and photo
strings must say what the app does with each and why.
`scripts/patch-ios.mjs` writes ones that do. Don't shorten them to "This
app needs the camera".

**Guideline 2.1 — incomplete information.** If the listing says the app
edits Word documents, review will open a `.docx`, find that formatting is
gone and that there is no way to save one back, and reject it. The
description in `store/metadata.md` is written carefully for that reason:
it says *reads the text of*. Keep it that way. The honest wording is also
the one that gets fewer one-star reviews.

**Data collection.** Answer "No" to every data-collection question,
because it is true — there is no analytics, no account, no network call
the app makes on its own. Do not add one casually later; it changes the
privacy label and the answer you gave.

---

## Why Capacitor, and not a rewrite in Swift

The app is HTML, CSS and JavaScript with no build step, and it already
behaves like an app: offline, installable, native-feeling. The parts that
sound like they would need native code turn out not to:

- **Apple Pencil pressure** arrives through `PointerEvent.pressure` in
  WKWebView. The same code path that reads a mouse reads the Pencil.
- **Palm rejection** is `pointerType`, which WKWebView reports correctly.
- **Photos, camera and video** are `<input type="file" accept capture>`,
  which iOS wires to the real pickers.
- **PDF rendering** is pdf.js, bundled.
- **Storage** is IndexedDB, which WKWebView backs with SQLite on disk.

A Swift rewrite would mean maintaining two ink engines, two exporters and
two sets of tests, to arrive at the same app. The place it would win is
the last few milliseconds of pen latency, which PencilKit gets from being
in the compositor. If that turns out to matter more than everything else
after step 5, the ink layer is the only part that would need to change —
which is roughly why it is a file of its own.

## Layout

```
capacitor.config.json   app id, name, and where the web files come from
package.json            the four commands you need
scripts/build.mjs       assembles www/ — bundles pdf.js and the fonts
scripts/patch-ios.mjs   the Info.plist keys Capacitor doesn't write
store/metadata.md       every text field App Store Connect asks for
www/                    generated by build.mjs — not committed
ios/                    generated by `cap add ios` — not committed
```
