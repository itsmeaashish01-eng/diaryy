# App Store Connect — the text fields

Copy these in. Apple's character limits are noted; everything here is inside them.

---

## Name (30 max)

```
RoamGuide
```

## Subtitle (30 max)

```
What's around you, and why
```

*Counts 26.*

## Promotional text (170 max, changeable without a new build)

```
Point your phone at a street you don't know. RoamGuide tells you what the buildings are, how far each one is and which way — then gets out of the way.
```

## Description (4000 max)

```
RoamGuide is a walking guide to wherever you happen to be standing.

Switch on location and it tells you what is around you: the monument across the square, the church behind you, the building you have walked past twice without looking up. Each one comes with what it is, how far away it is, which way to turn, and a route in Google or Apple Maps.

It works almost anywhere. The nearby guide draws on around two million places that have been written up and given coordinates, so it has something to say in a city centre almost anywhere in the world — not only in the handful of cities a guidebook happens to cover.

AND IT PLANS THE DAY

Drop places into a day and RoamGuide does the part a list cannot. It works out what time you would actually arrive at each one, whether you would walk or take transit between them, and where the plan stops holding:

• Closed Mondays — this stop won't happen
• Only 35m before it closes — you wanted an hour and a half
• You'd arrive 20m after the 2:00 pm you pinned

Tidy the order and it reshuffles the day to cut the walking, leaving any timed ticket where it is. Ask it to suggest a day and it builds one that is open when you would get there.

A GUIDEBOOK THAT TRAVELS WITH YOU

Six cities ship inside the app — Kyoto, Lisbon, Mexico City, Istanbul, Rome and Marrakesh — each with the places worth your time, when they are open, what they cost, the thing you would only know the second time, and a couple of paragraphs on how each one came to be there.

There is a phrasebook for each, with a phonetic column for when saying it is not working, and a practical page: transit, money, tipping, water, manners, emergency numbers, plug types, when in the year to come.

IT WORKS WITHOUT A SIGNAL

The guidebook, the history, the planner and your trips are on the device. Map tiles you have already looked at stay on the map after the signal drops. A guide you cannot read because the hotel wifi is down is not a guide.

NO ACCOUNT, NO TRACKING

There is no sign-in, no analytics and no advertising. Your trips stay on your phone. Your position is used to answer "what is near me" and is not stored or sent anywhere — the single exception being the coordinate Wikipedia needs to answer the question, with nothing attached to it.

Track what you spend against a daily budget, export a day as text or GeoJSON, and add your own places, which then behave exactly like the built-in ones.
```

## Keywords (100 max, comma-separated, no spaces after commas)

```
travel,guide,walking,tour,offline,city,landmark,history,itinerary,sightseeing,nearby,trip,map
```

*Counts 93. Don't repeat words already in the name or subtitle — Apple indexes those anyway.*

## Support URL

```
https://github.com/itsmeaashish01-eng/diaryy/issues
```

## Marketing URL (optional)

```
https://itsmeaashish01-eng.github.io/diaryy/guide/
```

## Privacy Policy URL (required — the app uses location)

```
https://itsmeaashish01-eng.github.io/diaryy/guide/privacy.html
```

---

## App Privacy — the nutrition label

App Store Connect will ask a series of questions. The honest answers:

| Question | Answer |
|---|---|
| Do you collect data from this app? | **No** |

That single answer ends the questionnaire. It is accurate: nothing is collected, stored off-device, or transmitted to any server you control. The coordinate sent to Wikipedia is a request for information, not collection — but if you would rather be conservative, declare **Coarse Location → App Functionality → Not linked to identity → Not used for tracking**.

## Age rating

No objectionable content anywhere in the questionnaire. Expect **4+**.

## Category

- Primary: **Travel**
- Secondary: **Navigation**

## Export compliance

The app uses HTTPS and nothing else cryptographic. `ITSAppUsesNonExemptEncryption` is already set to `false` in Info.plist by `scripts/patch-ios.mjs`, which stops App Store Connect asking every single build.

## Review notes (the box reviewers actually read)

```
RoamGuide needs location to do the one thing it exists for: telling you what is around you while you walk. To try it, open the Nearby tab and tap "Switch on location". If the simulator has no position set, use Features → Location → Apple to place it in Cupertino, or Custom Location for a city centre with more written about it (for example 51.5080, -0.1281 — Trafalgar Square, London).

The app works with no network: the guidebook for six cities, their history, the day planner and your saved trips are all bundled. The Nearby list itself needs a connection, since it asks Wikipedia what is near the coordinate.

There is no account and nothing to sign into.
```
