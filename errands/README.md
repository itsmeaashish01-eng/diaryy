# Errands

Two things about the neighbourhood around home: **which grocery store is
cheapest for your list**, and **where the Tesla chargers are**. Home is set to
301 W Lombard St, Baltimore, MD 21201 to begin with. Change it with one button.

Open `errands/index.html`. No build step, no server and no dependencies, the same
as the rest of this repository. For "◎ Here" (your device's location), serve the
folder instead, because browsers won't share location with a `file://` page:

```
python3 -m http.server 8765     # then http://127.0.0.1:8765/errands/
```

## Groceries

**Stores near home.** The app asks OpenStreetMap (through the Overpass API) for
supermarkets, grocers, market halls, and Target/Walmart within a radius you
choose (½ mi to 10 mi), nearest first. Corner and convenience stores are a
checkbox. Tick the stores you want to compare. You can also add a store by hand
if OpenStreetMap doesn't have it.

**Prices are the ones you record.** This is the part that looks like a gap, and
it is one. No free service publishes shelf prices for every store. The chains
keep them on their own sites, behind bot protection and per-store logins, and
they change by ZIP code and by week. Rather than scrape that and break every
month, the app:

- gives every cell a 🔍 that opens **that store's own search for that item**.
  It uses the chain's search page where the URL is stable (Walmart, Target,
  Safeway, Harris Teeter, Whole Foods, Trader Joe's, Aldi) and a site search
  everywhere else;
- links each row to Instacart, which shows several local stores' prices side by
  side. They often run a little above shelf price, but it's a fast first look;
- takes a pasted receipt or list (`Milk, 1 gal 3.49`, one per line) for any
  store and fills the column in one go;
- dates every price and flags anything over 30 days old with ⚠.

**The comparison** is careful about blanks. A missing price is unknown, never
zero, so a store with half the list priced can't "win" by leaving out the
expensive half:

- If one or more stores have every item priced, the cheapest of those wins on
  the whole list.
- Failing that, stores are compared only on the items they all have a price for,
  and the verdict says so.
- It also works out the **split**: each item from its cheapest store, what that
  saves, and how many extra stops it costs. On a tie, the nearer store wins.

Put the size in the item name ("Eggs, dozen large") so every store is priced on
the same thing. Quantity multiplies into the totals.

## Tesla charging

Two sources are asked at once, and either one alone is still an answer:

- **OpenStreetMap**: charging stations tagged as Tesla by brand, operator,
  network, Wikidata id or Tesla socket. This is usually where the kW figure is.
- **The US Department of Energy's station locator** (NREL's Alternative Fuels
  Data Center API), filtered to the `Tesla` and `Tesla Destination` networks.
  Tesla's own data feeds it, so its stall counts win when the two disagree.

The same site found by both is merged into one entry (within 120 m). You can
filter by radius, show Superchargers or Destination chargers only, or also
show other networks for use with an adapter. The top card is the nearest
Supercharger, with directions from home.

The DOE API wants a key. Without one the app uses the shared `DEMO_KEY`, which
runs out after a few lookups an hour per IP. A free key from
<https://developer.nrel.gov/signup/> lifts that. Paste it into Settings. It
stays in the browser and is sent only to `developer.nrel.gov`.

Neither source knows **live stall availability or price per kWh**. Only the
Tesla app and tesla.com/findus have those, and the page says so.

## Offline, and the built-in list

Each lookup is saved, so the page opens with the last answer and refreshes it
when it's more than a week old. If nothing has ever been reachable, it shows
`SEED` in `js/places.js`: seven downtown-Baltimore food stores and the McHenry
Row and Boston Street Superchargers, checked in October 2026 and marked "Built-in
list" on screen. Their coordinates are accurate to the block. When the live
lookup arrives, any price you recorded against a built-in store moves to its
live twin (same name, within 400 m), so going online orphans nothing.

The map is Leaflet on OpenStreetMap tiles. Without the network it says why it's
empty, and the lists still work.

## Your data

Everything is stored in localStorage under `errandsData`: home, list, prices, the
compared stores and the last lookups. Settings → Download backup gives you a
JSON file, and Restore reads it back on another device. Addresses go to
OpenStreetMap's Nominatim geocoder only when you change home. Your coordinates
go only to the two place lookups above.

## Files

| File | What it does |
|---|---|
| `js/util.js` | Distances, money, the `h()` DOM builder (text only, never HTML) |
| `js/places.js` | Overpass and DOE queries and readers, merge, seed list, store search links |
| `js/basket.js` | The comparison: totals, common items, split, pasted-receipt reader |
| `js/store.js` | localStorage state, seed-to-live price migration, backup |
| `js/map.js` | The one Leaflet map, moved between tabs |
| `js/app.js` | The page |
| `selftest.mjs` | Offline checks: the sums, the readers against fixture answers, the seed list |

```
node errands/selftest.mjs
```
