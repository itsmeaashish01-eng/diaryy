# StrokeRounds

An offline rounding list and structured stroke-note builder for the stroke attending.
It replaces the paper "STROKE ROUND" sheet: one card per patient, the same field order
you already use, and a note you can copy straight into the chart.

Open `index.html` from any static host (or straight off disk) — there is no build step,
no dependencies, and no server.

## What it does

**Census** — one line per patient: room, name/initials, hospital day, territory, etiology,
NIHSS, open tasks, pending work-up, and whether you have rounded on them today.
Search, sort (room / name / hospital day / NIHSS / recently updated) and filter
(active, signed off, not rounded today, flagged, open tasks).

**Round tab** — today's entry: vitals, labs, any new investigation, NIHSS, exam,
assessment, plan, plus a task list. *Carry forward* pulls yesterday's exam, assessment,
plan and NIHSS into any field you have left blank. A new dated entry is created each
day, so the history builds itself.

**Work-up tab** — every item from the sheet (CTH, CTA, CTP, MRI with DWI/ADC/SWAN/FLAIR,
prior scans, TTE, bubble, TEE, long-term cardiac monitor, LDL, HbA1c, hypercoagulable
panel, DSA, EEG) as a four-state control — ordered / pending / done / n/a — with a
free-text result. The result box appears once you set a status, so the list stays
scannable. Underneath: the associated-condition block (CNS, cardiac, endocrine,
heme/onc, electrolytes-renal, infection, other).

**Profile tab** — history and trauma, location and vascular territory (tap-to-pick chips),
risk factors, TOAST etiology, thrombolysis and thrombectomy details, stroke prevention,
DVT prophylaxis, PT/OT/SLP, meds, notes, dispo.

**History tab** — every prior day's round, copyable individually.

**Note tab** — the whole thing rendered as text in the paper sheet's order. Copy it,
print it, or toggle *Show blanks* to print an empty sheet for the bedside.
*Copy sign-out* gives a short handoff blurb instead; Settings can copy or print the
whole active list as one handoff document.

**Tools** — NIHSS, mRS, CHA₂DS₂-VASc, HAS-BLED, ICH score and ABCD² (the NIHSS scorer
writes back to the patient), alteplase and tenecteplase weight-based dosing, ABC/2
hematoma volume, and reference cards for BP targets, antithrombotic timing and
secondary-prevention goals.

## Privacy

Everything is stored in this browser's `localStorage` on this device. There is no
account, no server, no analytics, and no network request of any kind after the page
loads. Consequences worth knowing:

- Clearing site data or deleting the app deletes the list. **Export a backup** (Settings →
  Export JSON) at the end of a service block.
- The optional passcode is a screen lock for a shared workstation, not encryption.
  Anyone with device access and developer tools can read the stored file.
- Follow your institution's policy on PHI on a personal device. Initials and a room
  number are usually enough to round from — the app never requires a real name.
- The chart is still the medical record. This is a scratchpad that produces text you
  paste into it, and the scales and dosing assist a clinician who already knows them.

## Install on a phone

It is a PWA, so it installs from the browser with no store involved:

- **iOS/iPadOS (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu → *Install app* / *Add to Home screen*.

Installed, it opens full-screen, works with no signal, and keeps its own data.

## Putting it in the app stores

The same folder wraps into a store binary without changing any code.

**Google Play** — the fastest route is a Trusted Web Activity via
[PWABuilder](https://www.pwabuilder.com): point it at the deployed URL, download the
Android package, sign it, upload to Play Console. The manifest and service worker here
already satisfy the installability checks.

**App Store** — iOS does not accept a TWA, so wrap it with
[Capacitor](https://capacitorjs.com):

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init StrokeRounds com.yourname.strokerounds --web-dir=.
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios        # then archive and upload from Xcode
```

Point `webDir` at this directory (the files are already flat and relative-path only).
Nothing in the code assumes a server, so the wrapped app runs entirely from the bundle.

Two things reviewers will ask about for a medical app:

1. **Data handling** — say plainly that data never leaves the device. That is true here
   and makes the privacy questionnaire short: no data collected, no third-party SDKs.
2. **Intended use** — this is a documentation and reference aid for clinicians, not a
   diagnostic device. Keep the disclaimer visible (Settings → About carries it) and
   avoid claiming it interprets images or recommends treatment.

For a store release you will also want: a real bundle id, a privacy policy URL,
screenshots at the required sizes, and — if you add any identifiable-data sync later —
a HIPAA review, which is a different project entirely.

## Files

```
index.html               shell and view containers
css/style.css            all styling, dark + light themes
js/store.js              data model, localStorage, export/import, demo record
js/scores.js             scales, dosing, reference tables
js/note.js               note / sign-out / handoff text builders
js/app.js                views, rendering, event handling
manifest.webmanifest     PWA metadata
sw.js                    offline cache of the app shell
icons/                   generated app icons
```

Data lives under the `strokeRounds.v1` key; settings under `strokeRounds.settings.v1`.
`Store.migrate()` fills in fields added after a record was written, so a backup from an
older version imports cleanly.
