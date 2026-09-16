# RoamGuide

A tourist guide that plans the day, not just lists the sights.

Open `guide/index.html`. No build step, no server, no dependencies — the same
shape as the rest of this repository.

```
open guide/index.html          # macOS
xdg-open guide/index.html      # Linux
```

For the **Nearby** tab, serve it instead — browsers refuse location to a page
opened off a `file://` path, and no amount of permission-granting changes that:

```
python3 -m http.server 8000     # then http://localhost:8000/guide/
```

## What it does

**Explore** — a guidebook for six cities (Kyoto, Lisbon, Mexico City, Istanbul,
Rome, Marrakesh): what's worth your time, how long it takes, what it costs, when
it's open, the thing you'd only know the second time, and a couple of paragraphs
on how each place came to be there. Filter by city or by kind, search across all
of them, save what appeals, and add your own places — a bakery, a friend's
recommendation — which then behave exactly like the built-in ones.

**Nearby** — a walking guide to anywhere on earth. Switch on location and it
asks Wikipedia what has an article within a few hundred metres of you, and lays
the answers out nearest first: what each thing is, how far, which way, a picture
where there is one, and a walking route in Google or Apple Maps. It re-asks once
you've walked 150 m, so it keeps up.

Wikipedia has roughly two million articles with coordinates on them, which is
what makes this a guide to any street rather than to six cities. Coverage
follows Wikipedia's own — dense in city centres, thin in a residential suburb.
Empty means nobody wrote it up, and the app says so rather than implying there's
nothing there.

Where the curated guidebook has an entry for the same building it wins: a
paragraph written for a traveller beats an encyclopedia opening, and it comes
with the tip about the queue.

Your position stays in the tab. Nothing is stored or sent anywhere except the
coordinate Wikipedia needs to answer "what is near here".

**Trip** — days you can drop places into. The app then does the part a list
can't: it works out what time you'd actually arrive at each one, whether you'd
walk or ride between them, and what that does to the rest of the day.

It tells you when the plan doesn't hold:

- *Closed Mondays — this stop won't happen.*
- *Only 35m before it closes — you wanted 1h 30m.*
- *You'd arrive 20m after the 2:00 pm you pinned.*
- *Doesn't open until 1:00 pm — 4h to fill.*

**Tidy the order** reorders the day to cut the walking (nearest-neighbour, then
2-opt to undo the crossings), leaving any stop you've pinned a time to exactly
where it is. **Suggest a day** builds one from scratch: open when you'd get
there, close enough together to walk, and nothing you've already planned or
seen.

**Phrasebook** — enough of the local language to be polite, with a phonetic
third column and a copy button for when saying it isn't working.

**Practical** — transit, money, tipping, water, manners, emergency numbers,
plug types, and when in the year to come.

Each day can also be copied as text, exported as `.geojson` for a real map app,
or written straight into the diary next door — same browser, same date, appended
to whatever's already in that entry.

## Where this has to run

The Nearby tab has two requirements the rest of the app doesn't.

**A secure page.** Browsers refuse location to anything opened off a `file://`
path — double-clicking `index.html` will never work, however many permissions
you grant. It needs `https://` or `http://localhost`.

**Outbound network.** Wikipedia is the only part of RoamGuide that touches the
network, and a sandboxed viewer that blocks outbound requests — the claude.ai
artifact preview, for one — can't reach it. The app reports that as what it is
rather than showing an empty list and letting you assume the street is dull.

So for the live guide, host it. GitHub Pages does this free from this very
repository: **Settings → Pages → Source: Deploy from a branch → `main` → `/`
(root)**. It lands at `https://<username>.github.io/<repo>/guide/`, which is
https, can reach Wikipedia, and works on a phone. Locally,
`python3 -m http.server 8000` and `http://localhost:8000/guide/` does the same
on one machine.

Everything else — the guidebook, the history, the planner, the drawn map, the
distances and bearings — needs nothing at all and works on a plane.

## The map

Drawn, not loaded. It's an inline SVG built from the coordinates the app already
has: equirectangular, longitude squeezed by cos(latitude) so a city block stays
square, one scale on both axes so direction is honest, north up, with a scale
bar on a round number.

No tiles, no API key, no requests — which is the point. A map that needs the
network is missing exactly when you're lost. With location on it also carries
your own position and the accuracy circle around it, drawn to the same scale as
everything else, so a 2 km wifi fix looks like the vague claim it is instead of
borrowing the authority of a dot.

It shows relative position, distance and the order you'd walk them, and nothing
else. Turn-by-turn is a job for the map app already on the phone, so every place
and every leg of a day hands off to Google Maps, Apple Maps or OpenStreetMap
with a documented URL that opens the native app where it's installed.

## Files

| File | What's in it |
|---|---|
| `js/util.js` | Time, distance and money formatting; accent folding; clipboard and file saving |
| `js/geo.js` | Haversine distance, walk-or-ride estimates, route ordering, the map projection |
| `js/catalog.js` | The guidebook's shape: categories, hours helpers, `register()` |
| `js/cities/*.js` | One file per city — places, hours, history, phrases, practical notes |
| `js/store.js` | localStorage persistence, schema, migrations, trips and stops |
| `js/plan.js` | Opening hours, building a day, the warnings, suggesting a day |
| `js/map.js` | SVG map, Google/Apple/OSM hand-off, GeoJSON export |
| `js/live.js` | Geolocation, bearings, what's nearby, arrival, how much to trust the fix |
| `js/lookup.js` | The one networked part: Wikipedia, for buildings the guidebook doesn't cover |
| `js/ui.js` | Rendering |
| `js/app.js` | Bootstrap and every click |
| `selftest.mjs` | 68 offline checks over all of the above |

Each file hangs itself off `window.RG`, so load order in `index.html` matters —
`catalog.js` before the cities that register themselves with it.

## Tests

```
node guide/selftest.mjs
```

The modules are plain browser scripts, so the suite runs them in a `vm` sandbox
with just enough `window` to satisfy them. It covers the arithmetic (distances,
projections, time parsing past midnight), the planner (closures, waits, pinned
times you can't make, pace), the store (a place deleted in one place leaving no
dangling stops elsewhere), and the guidebook's own data — every place's
coordinates near its city, every set of hours parsing, every phrase complete,
every currency code formatting.

That last part earns its keep. It has caught an opening time written
`10:00-24:00`, which is not a time, and it fails the moment a new city is added
with a missing phrase column, an unparseable closing day or a coordinate in the
wrong hemisphere.

`ui.js` and `app.js` are left out — they need a DOM, and what they do is render
what the modules above decide.

CI runs this on every push, alongside the agents' suite.

## What's stored, and where

Everything lives in `localStorage` under `roamGuideData`, in your browser, on
your device. Nothing is uploaded and there is nothing to sign in to — which also
means clearing site data clears your trips. Settings has an export button;
`guide/` and the diary can both import what it writes.

The one thing it touches outside its own key is the diary's `diaryData`, and
only when you press **Send to diary** — appended to that date's entry, never
over the top of it.

## About the guidebook data

The six cities ship inside the app deliberately: a guide you can't read because
the hotel wifi is down is not a guide.

Opening hours, prices and closing days were right when they were written and
drift with seasons, holidays and refurbishments. Treat them as planning figures
rather than promises — the planner is only as good as they are, and a warning
about a Monday closure is worth nothing if the museum changed its mind. Check
anything you'd be sorry to get wrong; every place carries a link out.

Coordinates are accurate to the building, near enough for walking times and for
telling you what you're standing in front of.

The history on each place is a summary written to be read standing up, not a
citation. It sticks to what is well established, but it is prose, not a source —
where a date or an attribution matters to you, check it.

## Adding a city

Copy a file in `js/cities/`, and add a `<script>` for it to `index.html`. Each
one calls `RG.catalog.register()` as it loads, so nothing else needs editing.

A city needs `id`, `name`, `country`, `currency`, `language`, `dayBudget`,
`center`, `blurb`, `bestMonths`, a `basics` block, `places` and `phrases`. Each
place needs an id unique across the whole catalogue, `lat`/`lon`, a category from
`CATEGORIES`, `min` minutes, a `blurb`, a `history` of a couple of paragraphs
separated by a blank line, and seven days of `hours` (`daily()`, `except()` or
`ALWAYS`).

`node guide/selftest.mjs` will tell you what you missed — including a
coordinate more than 60 km from the city centre, which is almost always a
transposed pair or a dropped minus sign.
