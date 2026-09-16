# RoamGuide

A tourist guide that plans the day, not just lists the sights.

Open `guide/index.html`. No build step, no server, no dependencies — the same
shape as the rest of this repository.

```
open guide/index.html          # macOS
xdg-open guide/index.html      # Linux
```

## What it does

**Explore** — a guidebook for four cities (Kyoto, Lisbon, Mexico City,
Istanbul): what's worth your time, how long it takes, what it costs, when it's
open, and the thing you'd only know the second time. Filter by city or by kind,
search across all of them, save what appeals, and add your own places — a
bakery, a friend's recommendation — which then behave exactly like the built-in
ones.

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

## The map

Drawn, not loaded. It's an inline SVG built from the coordinates the app already
has: equirectangular, longitude squeezed by cos(latitude) so a city block stays
square, one scale on both axes so direction is honest, north up, with a scale
bar on a round number.

No tiles, no API key, no requests — which is the point. A map that needs the
network is missing exactly when you're lost. It shows relative position,
distance and the order you'd walk them, and nothing else; every place links out
to OpenStreetMap for the version with streets on it.

## Files

| File | What's in it |
|---|---|
| `js/util.js` | Time, distance and money formatting; accent folding; clipboard and file saving |
| `js/geo.js` | Haversine distance, walk-or-ride estimates, route ordering, the map projection |
| `js/catalog.js` | The guidebook: cities, places, hours, phrases, practical notes |
| `js/store.js` | localStorage persistence, schema, migrations, trips and stops |
| `js/plan.js` | Opening hours, building a day, the warnings, suggesting a day |
| `js/map.js` | SVG map, OpenStreetMap links, GeoJSON export |
| `js/ui.js` | Rendering |
| `js/app.js` | Bootstrap and every click |
| `selftest.mjs` | 55 offline checks over all of the above |

Each file hangs itself off `window.RG`, so load order in `index.html` matters.

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

That last part earns its keep: it has already caught an opening time written
`10:00-24:00`, which is not a time.

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

The four cities ship inside the app deliberately: a guide you can't read because
the hotel wifi is down is not a guide.

Opening hours, prices and closing days were right when they were written and
drift with seasons, holidays and refurbishments. Treat them as planning figures
rather than promises — the planner is only as good as they are, and a warning
about a Monday closure is worth nothing if the museum changed its mind. Check
anything you'd be sorry to get wrong; every place carries a link out.

Coordinates are accurate to the building, near enough for walking times.

## Adding a city

Append to `cities` in `js/catalog.js`. It needs `id`, `name`, `country`,
`currency`, `language`, `dayBudget`, `center`, `blurb`, `bestMonths`, a `basics`
block, `places`, and `phrases`. Each place needs an id unique across the whole
catalogue, `lat`/`lon`, a category from `CATEGORIES`, `min` minutes, a `blurb`
and seven days of `hours` (`daily()`, `except()` or `ALWAYS`).

`node guide/selftest.mjs` will tell you what you missed — including a
coordinate more than 60 km from the city centre, which is almost always a
transposed pair or a dropped minus sign.
