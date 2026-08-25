# My Daily Diary + Screen Time

A two-part personal app that runs entirely in the phone's browser. No account, no
server, no data leaving the device — everything lives in `localStorage`.

| Page | What it does |
|---|---|
| `index.html` | The daily diary: entries, moods, to-dos, notes, search, stats |
| `screentime.html` | Social-media screen-time control: budgets, timers, limits, focus sessions, downtime |

## Screen Time — what it does

- **Per-app timers.** Tap *Start timer* when you open Instagram, *Stop* when you put
  the phone down. The timer is stored as a timestamp, so it keeps counting if you
  switch apps, lock the phone, or close the tab — and it survives a reload.
- **Manual logging.** `+5m` / `+15m` / `−5m` for time you forgot to track.
- **Daily budget.** One number for all social apps, shown as a ring with time
  remaining, plus a per-app daily limit.
- **Nudges.** A reminder every N minutes inside a session, an alert when an app hits
  its limit, and another when the whole day's budget is spent. Uses system
  notifications when you grant permission, and falls back to on-screen toasts.
- **Focus sessions.** 15/25/50/90 minutes or a custom length. A full-screen countdown
  takes over the page; quitting early needs a deliberate 3-second hold.
- **Downtime.** Set a cut-off (default 22:30–07:00). Inside that window the app opens
  onto a block screen; dismissing it takes a 3-second hold and buys 10 minutes.
- **History.** 7-day bar chart, per-app breakdown, days-under-budget streak, 7-day
  average and how much you're up or down against it today.
- **Export / import.** JSON, via the ⤓ / ⤒ buttons.

## Honest limitation

This is a web app. It can track, budget, warn, nag and get in your way — it
**cannot force-close Instagram or block another app**, because browsers have no such
power on iOS or Android. For hard blocking, run this alongside the OS feature:

- **Android:** Settings → Digital Wellbeing → *App timers* / *Focus mode*
- **iOS:** Settings → Screen Time → *App Limits* / *Downtime*

Use the OS for the wall; use this for the budget, the log, the streak and the
friction that makes you notice what you're doing.

## Install it on your phone

It's a PWA, so it goes on the home screen and works offline.

1. Put the files somewhere the phone can reach over **HTTPS** (GitHub Pages,
   Netlify, Vercel — any static host). Service workers and notifications need HTTPS
   (`localhost` also works for testing).
2. Open `screentime.html` in the phone's browser.
3. **Android/Chrome:** menu → *Add to Home screen* / *Install app*.
   **iOS/Safari:** Share → *Add to Home Screen*.
4. Open it from the home-screen icon — it launches full-screen, with no browser bars.
5. Open ⚙ Settings and turn on notifications the first time.

### GitHub Pages in one step

Repo → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/`.
The app appears at `https://<user>.github.io/<repo>/screentime.html`.

## Run it locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/screentime.html
```

## Files

```
index.html            diary page
screentime.html       screen time page
style.css             shared design tokens + diary styles
screentime.css        screen time styles
script.js             diary logic
screentime.js         screen time logic
manifest.webmanifest  PWA manifest (install metadata)
sw.js                 service worker (offline cache)
icons/                app icons (192 / 512)
```

Screen-time data is stored under the `screenTimeData` key; the diary keeps using
`diaryData`. Clearing the browser's site data wipes both — export first.
