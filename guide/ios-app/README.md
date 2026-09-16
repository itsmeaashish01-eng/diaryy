# RoamGuide for iOS

The App Store build. The app itself lives in `../` — this directory only
packages it, so there is no second copy of anything to keep in step.

**Everything here can be prepared on any machine. Everything from step 3 on
needs a Mac.** Building, signing and submitting an iOS app requires Xcode, and
Xcode only runs on macOS. There is no way around that.

---

## Before you start

| What | Why | Cost |
|---|---|---|
| A Mac | Xcode runs nowhere else | — |
| [Xcode](https://apps.apple.com/app/xcode/id497799835) | Builds and signs the app | Free |
| [Apple Developer Program](https://developer.apple.com/programs/) | Required to submit to the App Store at all | **$99/year** |
| CocoaPods (`sudo gem install cocoapods`) | Capacitor uses it for native dependencies | Free |

Without the paid account you can still build and run on your own iPhone over
USB for 7 days at a time. You cannot put it on the App Store.

---

## 1. Assemble the web app

```bash
cd guide/ios-app
npm install
npm run build
```

`www/` now holds the app with Leaflet and both typefaces bundled locally and the
service worker stripped out. Nothing it needs is fetched at launch — which
matters, because Apple is wary of apps that download their code at runtime.

## 2. Check it actually runs

```bash
npx serve www      # or: cd www && python3 -m http.server 8098
```

Open it, turn off your wifi, reload. The guidebook, the planner and your trips
should all still be there.

## 3. Create the Xcode project *(Mac)*

```bash
npm run ios:add
```

This runs the build, `npx cap add ios`, and then patches `Info.plist` with the
location permission string. Without that string iOS kills the app the moment it
asks for a position, and App Review rejects it besides.

Re-run `npm run ios:sync` after any change to the app in `../`.

## 4. Open it in Xcode *(Mac)*

```bash
npm run ios:open
```

In Xcode, select the **App** target:

- **Signing & Capabilities** → tick *Automatically manage signing*, pick your Team.
- **Bundle Identifier** → change `com.roamguide.app` to something you own,
  e.g. `com.yourname.roamguide`. It must be unique across the whole App Store
  and you cannot change it after the first submission.
- **General → Deployment Info** → set the minimum iOS version (14.0 is safe) and
  which devices you support. iPhone only is the simplest honest answer; ticking
  iPad means Apple expects iPad screenshots and an iPad-worthy layout.
- Set the version to `1.0` and the build number to `1`.

Run it on the simulator (⌘R). Set a position with **Features → Location → Custom
Location**, then open the Nearby tab.

## 5. Put it on your own phone first *(Mac)*

Plug the iPhone in, pick it as the run destination, ⌘R. Walk outside with it.
This is the only test that matters, and it costs nothing.

## 6. Submit *(Mac, paid account)*

1. [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → **+** →
   **New App**. Pick the bundle ID from step 4.
2. Fill in the listing from [`store/metadata.md`](store/metadata.md) — it has the
   name, subtitle, description, keywords, URLs and privacy answers written out.
3. Upload screenshots from `store/screenshots/`. **Regenerate them first on a
   machine with a network** (`npm run screenshots`) — the committed ones were
   made with the map stubbed, so the streets are a flat colour.
4. In Xcode: **Product → Archive**, then **Distribute App → App Store Connect**.
5. Back in App Store Connect, attach the build, answer the export-compliance
   question (already handled by the plist patch), and **Submit for Review**.

Review usually takes a day or two.

---

## What will get it rejected

Worth knowing before you spend the $99.

**Guideline 4.2 — Minimum Functionality.** Apple rejects apps that are a website
in a shell. The defence here is real and worth stating in the review notes: the
app ships a guidebook, works with no network, and uses CoreLocation. It is not
a web view pointed at a URL — `capacitor.config.json` has no `server.url`, and
every asset is bundled. **Do not add one.**

**Guideline 5.1.1 — purpose strings.** The location string must say what the app
does with the location, in plain language. `scripts/patch-ios.mjs` writes one
that does. Don't shorten it to "This app needs location".

**The OpenStreetMap tile server.** This is the one genuine blocker, and it is
not Apple's.

`tile.openstreetmap.org` is donated infrastructure with a
[usage policy](https://operations.osmfoundation.org/policies/tiles/) that rules
out apps distributing meaningful traffic to it. Fine for you and a few friends;
not fine for an App Store listing that might get thousands of users. Before
submitting, move to a provider with a free tier and an API key — MapTiler,
Stadia Maps and Thunderforest all serve OSM-based tiles and all have one — or
use Apple's own MapKit. It is a one-line change in `../js/livemap.js`:

```js
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
```

Attribution has to travel with whichever you pick.

---

## Why Capacitor, and not a rewrite

The app is HTML, CSS and JavaScript with no build step, and it already behaves
like an app: offline, installable, native-feeling. Capacitor wraps exactly that
in a native shell and gives it CoreLocation through
`@capacitor/geolocation` — `../js/live.js` uses the plugin when it is running
natively and the browser API otherwise, from one code path.

Rewriting in Swift would mean maintaining two guidebooks, two planners and two
sets of tests, to arrive at the same app.

## Layout

```
capacitor.config.json   app id, name, and where the web files come from
package.json            the three commands you need
scripts/build.mjs       assembles www/ — bundles Leaflet and the fonts
scripts/patch-ios.mjs   the Info.plist keys Capacitor doesn't write
scripts/screenshots.mjs App Store screenshots at the sizes Apple accepts
store/metadata.md       every text field App Store Connect asks for
store/screenshots/      generated; regenerate with a network before submitting
www/                    generated by build.mjs — not committed
ios/                    generated by `cap add ios` — not committed
```
