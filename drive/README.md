# Lane Coach

A trainer for reading highway navigation cues on busy North Texas highways
around Denton, Fort Worth and Dallas. It covers lane guidance, exit numbers,
EXIT ONLY lanes, splits, left exits, frontage roads and stacked interchanges.

**This is an educational simulation, not Tesla software.** It isn't affiliated
with or endorsed by Tesla, Inc. The navigation card is an original Tesla-*style*
mock-up: it has a maneuver arrow, distance, exit number, lane strip and a blue
route line, but none of Tesla's code, artwork or data. The roads are schematic.
They are modeled on real corridors, but exit numbers, distances and lane counts
are illustrative. The page says this on every screen.

No build step, no server and no dependencies, like the rest of this repository.

## Opening it on a Mac

1. Get the files. Either clone the repository, or on GitHub choose
   **Code → Download ZIP** and double-click the zip in Downloads to unpack it.
2. Open `drive/index.html`:
   - **Finder:** go into the `drive` folder and double-click `index.html`.
     It opens in your default browser (Safari, Chrome and Firefox all work).
   - **Terminal:** from the repository folder, run

     ```
     open drive/index.html
     ```

     For a specific browser, run `open -a "Google Chrome" drive/index.html`.

That's all. It runs straight from the file, with no internet connection and no
install. If your browser ever refuses to run local files (some locked-down
work machines do), serve the folder instead:

```
cd drive
python3 -m http.server 8000      # then open http://localhost:8000
```

`python3` ships with macOS's Command Line Tools. Press Ctrl-C to stop it.

## What's in it

**Lane quiz.** Ten scenarios. Each shows the overhead sign, the navigation card
and a top-down picture of the road ahead, then asks which lane you should be
in. You can tap a lane on the road, use the lane buttons, or press `1`–`5`.
Every lane has its own explanation, so a wrong answer tells you what that lane
does, not just "wrong". The car then drives the lane you chose, so you see
where it leads. After that you get a short lesson and a tip. You can **Replay**
the drive, **Try again**, or **Drive this one** in Drive mode.

Your first answer to each scenario is the one that's scored. The dots across
the top show your progress; click any dot to go back to that scenario. If you
untick **Lane hints & route line**, the lane strip and blue line are hidden
until you answer, so you have to read the sign yourself.

**Drive.** The same scenarios, now moving. Your car rolls toward the maneuver
in traffic, the navigation counts down, and you change lanes in time:

| Key | Does |
|---|---|
| `←` `→` (or `A` `D`, or the ◀ ▶ buttons) | Change lanes |
| `↓` `↑` (or the ▼ ▲ buttons) | Ease off / speed up a little, to find a gap |
| `Space` | Pause |
| `R` | Restart |

The sim refuses a lane change in three cases, and says why:

- a car is alongside you;
- the dashed line has turned solid near the gore;
- the lanes aren't connected yet, e.g. you're still on the on-ramp.

Your car keeps its distance from the car ahead, like adaptive cruise, so you
only steer. The result card tells you whether you made it and how early you
were in position (half a mile is the habit to build). If you missed it, it
tells you what that costs and how you'd recover. Traffic can be None, Light or
Busy. Time runs 1.5–2.5× faster than real life so a drill takes under a
minute; the distances are true to the drawing.

**How to read it.** A one-page legend covering the navigation card, the signs,
the lane lines (dashed, wide dotted, solid, yellow edge) and North Texas
specifics: frontage roads, Texas U-turns, the I-35E/I-35W split, TEXpress
lanes and stacks.

## The scenarios

| Region | Drill | Teaches |
|---|---|---|
| Denton | I-35 split at Denton, to Fort Worth | Splits, keep right, reading E/W shields |
| Fort Worth | I-35W to I-30 at the Mixmaster | "Use the right two lanes", EXIT ONLY |
| Denton | I-35E in Lewisville to Main St | Frontage-road exits, Texas U-turns |
| Dallas | US 75 near SMU, going straight | Avoiding the EXIT ONLY trap |
| Dallas | I-35E to I-635 East | Two-lane exit with an option lane |
| Fort Worth | I-35W TEXpress entrance | Left-side entrances, "keep left" |
| Dallas | Entering I-30 in Grand Prairie | Short merge into an auxiliary lane |
| Fort Worth | An A/B exit pair on I-35W | The early-turn mistake |
| DFW | SH 114 to DFW Airport | Option lane on a busy exit |
| Dallas | The High Five, US 75 to I-635 East | Stacked ramp: "exit, then keep left" |

## How it's built

```
drive/
├── index.html      the page; scripts load in order at the bottom
├── style.css
├── selftest.mjs    node drive/selftest.mjs
└── js/
    ├── logic.js     road geometry, lane-change rules, the driving sim (no DOM)
    ├── scenarios.js the ten drills, as data
    ├── draw.js      canvas road, navigation card, lane arrows, overhead sign
    ├── quiz.js      Lane quiz mode
    ├── drive.js     Drive mode: clock, controls, result card
    └── app.js       tabs, keys, resize, remembered preferences
```

Everything hangs off `window.LC`. The scripts are plain `<script>` files, not
ES modules, because browsers block modules on pages opened from `file://`, and
opening the file directly is the whole point.

**A road is data, not a drawing.** Distance along the road is `s` in feet;
position across it is in lane widths, with lane `i` starting at `i`. Each lane
feeds a *branch*. A branch is a list of sideways moves that ease in over a
length: a ramp peels off to the right, a split sends two branches apart, an
on-ramp starts three lanes out and joins. An option lane feeds two branches
and forks. From that one description, `logic.js` works out:

- **Which lane changes are legal.** Two lanes must sit exactly one lane apart
  now, and still 400 ft ahead. Where they won't be, the line has turned solid.
- **Whether you made it.** Once no lane on your route can be reached from
  yours, the outcome is decided. You get "too late to get over" rather than a
  swerve across the gore.

`draw.js` draws from the same description. The lane lines come from the same
"are these lanes adjacent?" test, so a solid line on screen is always a lane
change the sim will refuse.

**Adding a scenario** means adding one object to `js/scenarios.js`. Copy a
similar one; the header comment lists the fields. The selftest then checks the
new drill:

- every "best" lane really reaches the route, and every "wrong" one doesn't;
- the sign covers each lane once;
- a careful driver can finish the drive in busy traffic with three different
  seeds;
- a driver who never moves misses it.

## Not doing

- **Real maps or real-time data.** It's a teaching diagram, and keeping it
  schematic is what makes the disclaimer true.
- **Tesla's look.** Tesla-style means the information a modern in-car
  navigation shows, laid out in the same order. It doesn't copy Tesla's
  artwork, fonts or trademarks.
- **Steering, braking or crash physics.** The skill being trained is choosing
  a lane and getting there early. Collisions would only add noise.
