/* ================================================
   LANE COACH — scenarios.js
   The drills. Each one is a stretch of schematic highway, the
   navigation cue a driver would see, the overhead sign, and what
   each lane choice leads to. Both the quiz and the drive read these.

   Roads are modeled on real North Texas corridors, but they are
   teaching diagrams: exit numbers, distances and lane counts are
   illustrative, and the real roads get restriped. The page says so.

   Shape of a scenario (see drive/README.md for the long version):
     lanes[i]    arrows, which branch it feeds (go), quiz verdict + why
     branches    how each road drifts sideways along s (feet), whether
                 it is on the route, and what happens if you end up there
     startLane   where you are at the start (lane 0 is the far left)
     quizAt      where along the road the quiz freezes the picture
   ================================================ */
window.LC = window.LC || {};

(function (LC) {
  "use strict";

  const up = ["up"];
  const right = ["right"];

  LC.scenarios = [
    /* ---------------------------------------------------------------- */
    {
      id: "denton-split",
      title: "The Denton split: to Fort Worth",
      region: "Denton",
      place: "I-35 southbound at Denton, where I-35E and I-35W divide",
      skills: ["Highway split", "Right two lanes"],
      prompt: "You're headed to Fort Worth in the far-left lane, and the interstate splits about half a mile ahead. Which lane should you be in before the split?",
      startLane: 0,
      quizAt: 2700,
      nav: { maneuver: "keep-right", exit: null, road: "I-35W S", toward: "Fort Worth" },
      sign: {
        panels: [
          { lanes: [0, 1], shield: "35E", dir: "SOUTH", lines: ["Dallas"] },
          { lanes: [2, 3], shield: "35W", dir: "SOUTH", lines: ["Fort Worth"] },
        ],
      },
      lanes: [
        { arrows: ["bear-left"], go: "e", quiz: "wrong",
          why: "This lane belongs to I-35E — it carries you toward Dallas. You need two lane changes from here, so start now while you have half a mile." },
        { arrows: ["bear-left"], go: "e", quiz: "wrong",
          why: "Still an I-35E lane. One more move to the right puts you on I-35W." },
        { arrows: ["bear-right"], go: "w", quiz: "best",
          why: "The inner of the two Fort Worth lanes. A calm place to ride through the split." },
        { arrows: ["bear-right"], go: "w", quiz: "best",
          why: "An I-35W lane toward Fort Worth. Fine — just expect traffic joining from Denton on-ramps on your right." },
      ],
      branches: {
        e: { label: "I-35E S · Dallas", onRoute: false,
             moves: [{ at: 5200, to: -1.6, len: 1000 }],
             miss: "You stayed on I-35E toward Dallas. There's no quick way back across — navigation would send you west on a crosstown highway, easily 15 extra minutes." },
        w: { label: "I-35W S · Fort Worth", onRoute: true,
             moves: [{ at: 5200, to: 1.6, len: 1000 }] },
      },
      lesson: "At a split, the interstate divides into two equal highways — nobody really 'exits'. The overhead signs share the lanes out between the two routes, and the navigation says 'Keep right' with the right-hand lanes highlighted. Be in a lane for your route at least half a mile early; the last few hundred feet before the split are a solid line.",
      tip: "Read the shield, not just the city. I-35E goes to Dallas and I-35W to Fort Worth; both are plain 'I-35' north of Denton.",
      note: "Schematic: here the Dallas lanes are on the left and the Fort Worth lanes on the right, as the cities sit on a map. The real split has been rebuilt — follow its signs.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "mixmaster",
      title: "“Use the right two lanes”",
      region: "Fort Worth",
      place: "I-35W southbound approaching I-30 at the Mixmaster, downtown Fort Worth",
      skills: ["Right two lanes", "EXIT ONLY", "Stacked interchange"],
      prompt: "The navigation says “Use the right two lanes to take Exit 51A to I-30 West.” You're in the second lane from the left. Where do you need to be?",
      startLane: 1,
      quizAt: 2500,
      nav: { maneuver: "exit-right", exit: "51A", road: "I-30 W", toward: "Weatherford" },
      sign: {
        panels: [
          { lanes: [0, 1, 2], shield: "35W", dir: "SOUTH", lines: ["Waco"] },
          { lanes: [3, 4], exit: "51A", shield: "30", dir: "WEST", lines: ["Weatherford"] },
        ],
        exitOnly: [3, 4],
      },
      lanes: [
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Far left: three lane changes from the exit. That's too many to make calmly in half a mile of downtown traffic." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "This lane carries on south on I-35W through downtown." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "So close — but this lane goes straight. “Right two lanes” counts from the right edge of the road: move over one more." },
        { arrows: right, go: "exit", quiz: "best", exitOnly: true,
          why: "The left of the two exit lanes. A good choice: cars joining from the right won't squeeze you." },
        { arrows: right, go: "exit", quiz: "best", exitOnly: true,
          why: "The right-most exit lane. Correct — watch for traffic entering from downtown ramps on your right." },
      ],
      branches: {
        thru: { label: "I-35W S", onRoute: false,
                miss: "You stayed on I-35W south of downtown. Navigation reroutes from the next exits — five minutes or more." },
        exit: { label: "I-30 W · Weatherford", onRoute: true,
                moves: [{ at: 5000, to: 3, len: 700 }] },
      },
      lesson: "“Use the right two lanes” counts from the right-hand edge. Here both are EXIT ONLY — note the yellow plaque — so the highway keeps three lanes and hands two to the ramp. Either exit lane works. Get into one before the dashed line turns solid.",
      tip: "Counting lanes at 65 mph is hard. Glance at the lane strip on the navigation card instead: highlighted arrows are your lanes.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "frontage",
      title: "Exiting to the frontage road",
      region: "Denton",
      place: "I-35E southbound in Lewisville, Denton County",
      skills: ["Frontage road", "Right exit"],
      prompt: "Your exit for Main Street is coming up. You're in the second lane from the left. Which lane should you be in?",
      startLane: 1,
      quizAt: 2000,
      nav: { maneuver: "exit-right", exit: "454A", road: "Main St", toward: "FM 1171", then: "Then continue on the frontage road" },
      sign: {
        panels: [
          { lanes: [0, 1, 2], shield: "35E", dir: "SOUTH", lines: ["Dallas"] },
          { lanes: [3], exit: "454A", lines: ["Main St", "FM 1171"] },
        ],
      },
      decor: [
        { type: "parallel", lat: 5.5, lanes: 2, label: "Frontage road — one-way" },
        { type: "cross", at: 6400, label: "Main St" },
      ],
      lanes: [
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Too far left — three lanes from the ramp." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Two lane changes still to make. Start now, one at a time, and signal for each." },
        { arrows: up, go: "thru", quiz: "ok",
          why: "Next to the exit lane, so you can still make it. Move right now — you don't want to be doing this at the ramp." },
        { arrows: ["up", "right"], go: ["thru", "ramp"], quiz: "best",
          why: "The ramp leaves from this lane. You're set." },
      ],
      branches: {
        thru: { label: "I-35E S · Dallas", onRoute: false,
                miss: "You missed the ramp. Take the next exit, then use the U-turn lane under the bridge to come back along the other frontage road — a few minutes." },
        ramp: { label: "Exit 454A → frontage road", onRoute: true,
                moves: [{ at: 4200, to: 2.5, len: 700 }] },
      },
      lesson: "Texas exits usually drop you onto a frontage road — also called an access or service road — a one-way street that runs beside the highway. You then drive along it to a traffic light at the cross street. That's why the exit for a street comes early: the ramp is often a quarter to half a mile before the street itself.",
      tip: "Missed it? Stay on the highway, take the next exit, and use the “Texas U-turn” lane under the bridge to come back the other way. Never stop, reverse or cut across the gore.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "exit-only-trap",
      title: "Don't get trapped in an EXIT ONLY lane",
      region: "Dallas",
      place: "US 75 (Central Expressway) northbound near SMU, Dallas",
      skills: ["EXIT ONLY", "Going straight"],
      prompt: "Your route continues straight on US 75 for six more miles. You merged in on the right and you're still in the right lane. Which lane should you settle into?",
      startLane: 3,
      quizAt: 1900,
      nav: { maneuver: "straight", exit: null, road: "US-75 N", toward: "Sherman", distanceText: "6.0 mi" },
      sign: {
        panels: [
          { lanes: [0, 1, 2], shield: "75", dir: "NORTH", lines: ["Sherman"] },
          { lanes: [3], exit: "5A", lines: ["Mockingbird Ln"] },
        ],
        exitOnly: [3],
      },
      lanes: [
        { arrows: up, go: "main", quiz: "ok",
          why: "Stays on US 75, but the left lane is for passing. You'll have faster traffic stacking up behind you for six miles." },
        { arrows: up, go: "main", quiz: "best",
          why: "A middle lane is the calm choice when the next turn is miles away: nothing exits from it and nothing merges into it." },
        { arrows: up, go: "main", quiz: "best",
          why: "Good — a straight-through lane, clear of the EXIT ONLY lane beside you." },
        { arrows: right, go: "exit", quiz: "wrong", exitOnly: true,
          why: "This lane turns into the Mockingbird Ln exit. Stay in it and you're forced off the highway." },
      ],
      branches: {
        main: { label: "US-75 N · Sherman", onRoute: true },
        exit: { label: "Exit 5A · Mockingbird Ln", onRoute: false,
                moves: [{ at: 4300, to: 3, len: 600 }],
                miss: "The EXIT ONLY lane carried you off at Mockingbird Ln. On the frontage road, go through the light and take the next entrance ramp back onto US 75 — about three minutes." },
      },
      lesson: "Lanes can end by turning into an exit. The clues are the yellow EXIT ONLY plaque on the sign and a wide, short-dashed lane line. When the navigation shows no maneuver for miles, a middle lane is the safest home: exits and on-ramps happen on the right.",
      tip: "Texas highways often post “Left lane for passing only”. Cruise in the middle; use the left to pass.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "option-lane",
      title: "Two-lane exit with an option lane",
      region: "Dallas",
      place: "I-35E southbound approaching I-635 (LBJ Freeway), Farmers Branch",
      skills: ["Option lane", "EXIT ONLY", "Multi-lane exit"],
      prompt: "You're taking I-635 East toward Garland. The exit is a two-lane exit. You're in the second lane from the left. Which lanes can take you there?",
      startLane: 1,
      quizAt: 2500,
      nav: { maneuver: "exit-right", exit: "444", road: "I-635 E", toward: "Garland" },
      sign: {
        panels: [
          { lanes: [0, 1, 2], shield: "35E", dir: "SOUTH", lines: ["Dallas"] },
          { lanes: [3, 4], exit: "444", shield: "635", dir: "EAST", lines: ["Garland"] },
        ],
        exitOnly: [4],
      },
      lanes: [
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Far left: four lane changes from the exit. You won't make it calmly in half a mile." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "This lane stays on I-35E. You need to be at least two lanes to the right." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Close, but this one goes straight. The option lane is right beside you — move over now." },
        { arrows: ["up", "right"], go: ["thru", "exit"], quiz: "best",
          why: "The option lane: its arrow shows both straight and exit. You can take the exit from here and still have a way out if you change your mind." },
        { arrows: right, go: "exit", quiz: "best", exitOnly: true,
          why: "EXIT ONLY — this lane has to take the exit, and that's exactly where you're going." },
      ],
      branches: {
        thru: { label: "I-35E S · Dallas", onRoute: false,
                miss: "You stayed on I-35E. The next exit is about a mile on — navigation reroutes, a few minutes lost." },
        exit: { label: "I-635 E · Garland", onRoute: true,
                moves: [{ at: 5000, to: 3, len: 700 }] },
      },
      lesson: "A two-lane exit often has an option lane. The far-right lane is EXIT ONLY (yellow plaque), and the lane next to it has a shared arrow — it can go either way. Lane guidance highlights both. Either works: pick one early and stay in it.",
      tip: "The yellow EXIT ONLY plaque hangs over lanes that cannot continue. If you're going straight, get out from under it.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "texpress-left",
      title: "A left-side entrance: TEXpress lanes",
      region: "Fort Worth",
      place: "I-35W northbound, north of downtown Fort Worth",
      skills: ["Left exit", "Toll lanes"],
      prompt: "Your route uses the TEXpress toll lanes, and the entrance is about half a mile ahead. You're in a middle lane. Where should you be?",
      startLane: 2,
      quizAt: 2200,
      nav: { maneuver: "keep-left", exit: null, road: "TEXpress lanes", toward: "Toll", then: "Entrance on the left" },
      sign: {
        panels: [
          { lanes: [0], left: true, shield: "TEXpress", lines: ["Entrance", "Toll"] },
          { lanes: [1, 2, 3], shield: "35W", dir: "NORTH", lines: ["Denton"] },
        ],
      },
      decor: [
        { type: "parallel", lat: -3.5, lanes: 2, label: "TEXpress — toll", toll: true },
      ],
      lanes: [
        { arrows: ["bear-left", "up"], go: ["thru", "tex"], quiz: "best",
          why: "The entrance leaves from the far-left lane. Get here early: managed-lane entrances are short, and the next one is miles away." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "One lane short. The entrance won't come to you — move left while the line is still dashed." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Middle lanes carry straight on in the free lanes." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "The right lane is the opposite side from a left entrance." },
      ],
      branches: {
        thru: { label: "I-35W N · free lanes", onRoute: false,
                miss: "You stayed in the free lanes. Not a disaster — carry on, or use the next TEXpress entrance a few miles up." },
        tex: { label: "TEXpress (toll)", onRoute: true,
               moves: [{ at: 4400, to: -2.5, len: 600 }] },
      },
      lesson: "Not every exit is on the right. In North Texas the TEXpress managed lanes run down the middle of highways like I-35W, I-35E and I-635, so you enter and leave them from the far-left lane. When the navigation arrow says “Keep left”, move left — and do it early, because the left lane usually carries the fastest traffic.",
      tip: "TEXpress lanes are tolled — with a toll tag, or a bill by mail that costs more — and the price changes with traffic. Signs show the current price before each entrance.",
      note: "Schematic: real entrances and exits to the managed lanes vary by corridor. The lesson is reading “Keep left”.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "short-merge",
      title: "Short merge, quick exit",
      region: "Dallas",
      place: "Entering I-30 eastbound in Grand Prairie",
      skills: ["Short merge", "Auxiliary lane"],
      prompt: "You've just merged onto I-30 from an on-ramp. Your exit is the very next one, about a quarter mile ahead. Which lane?",
      startLane: 3,
      quizAt: 1350,
      nav: { maneuver: "exit-right", exit: "32", road: "Belt Line Rd", toward: "Grand Prairie" },
      sign: {
        panels: [
          { lanes: [0, 1, 2], shield: "30", dir: "EAST", lines: ["Dallas"] },
          { lanes: [3], exit: "32", lines: ["Belt Line Rd"] },
        ],
        exitOnly: [3],
      },
      lanes: [
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Three lanes over and back again in a quarter mile? There's no way back in time." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Two lane changes over and two back, through cars that are getting on and off. Not in this distance." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Moving left means crossing back through merging traffic in under a quarter mile — two risky moves to end up where you started." },
        { arrows: right, go: "aux", quiz: "best", exitOnly: true,
          why: "Stay put. The lane you merged into is an auxiliary lane that runs straight to the next exit." },
      ],
      branches: {
        thru: { label: "I-30 E · Dallas", onRoute: false,
                miss: "You moved over and couldn't get back in time. Next exit, then the frontage road back — a few minutes." },
        aux: { label: "Exit 32 · Belt Line Rd", onRoute: true, start: 3,
               moves: [{ at: 300, to: 0, len: 700 }, { at: 2600, to: 3, len: 600 }] },
      },
      lesson: "Between ramps that are close together, Texas highways often add an auxiliary lane: traffic joins from one ramp and leaves at the next. It's a weave — cars crossing in both directions in a short space. If your exit is the next one, stay in the auxiliary lane, hold your speed, and let through traffic sort itself out around you.",
      tip: "On a short merge, speed matters more than the gap: get up to highway speed on the ramp so you can slot in, rather than slowing at the end of it.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "early-exit",
      title: "Early-turn mistake: the first ramp isn't yours",
      region: "Fort Worth",
      place: "An A/B exit pair on I-35W southbound, Fort Worth",
      skills: ["Early turn", "EXIT ONLY", "Exit numbers"],
      prompt: "The navigation says “In 0.7 mi, take Exit 56B.” You're in the right lane, and a ramp is coming up just ahead on the right. Where should you be?",
      startLane: 4,
      quizAt: 1900,
      nav: { maneuver: "exit-right", exit: "56B", road: "Main St", toward: "Stockyards" },
      sign: {
        panels: [
          { lanes: [0, 1, 2, 3], shield: "35W", dir: "SOUTH", lines: ["Downtown Fort Worth"] },
          { lanes: [4], exit: "56A", lines: ["Northside Dr"] },
        ],
        exitOnly: [4],
      },
      lanes: [
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Too far left: you'd need to work all the way back right for 56B." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Clear of the trap, but too far left — two moves back right for 56B." },
        { arrows: up, go: "thru", quiz: "ok",
          why: "You're past the trap, but you'll need to move right again for 56B. Doable — 0.7 mi is enough." },
        { arrows: up, go: "target", quiz: "best", exitOnly: true,
          why: "Straight past 56A, and this lane becomes the exit for 56B. Move here before the line by the 56A ramp turns solid." },
        { arrows: right, go: "decoy", quiz: "wrong", exitOnly: true,
          why: "This ramp is Exit 56A — one exit too early. The sign says 56A; your navigation says 56B. Taking the first ramp you see is the most common navigation mistake." },
      ],
      branches: {
        thru: { label: "I-35W S · Downtown", onRoute: false,
                miss: "You went past both exits. Navigation reroutes from the next exit — a few minutes." },
        decoy: { label: "Exit 56A · Northside Dr", onRoute: false,
                 moves: [{ at: 3000, to: 5, len: 600 }],
                 miss: "Early turn: you took Exit 56A, one exit too soon. You're on the frontage road — follow it through the lights to Main St, and let the navigation reroute." },
        target: { label: "Exit 56B · Main St", onRoute: true,
                  moves: [{ at: 5600, to: 2.5, len: 600 }] },
      },
      lesson: "Exits often come in A/B pairs a few hundred feet to a mile apart, and the right lane may be EXIT ONLY for the first of them. Match the exit number on the sign to the one on your navigation, and check the distance: if the navigation still says 0.7 mi, the ramp in front of you is not yours.",
      tip: "Count down with the navigation. If the ramp you're about to take is much closer than the distance it shows, it's the wrong ramp.",
      note: "A generic A/B pair: the exit numbers and street names are placeholders.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "dfw-airport",
      title: "Airport exit with an option lane",
      region: "DFW",
      place: "SH 114 eastbound in Grapevine, approaching DFW Airport",
      skills: ["Option lane", "Multi-lane exit", "Busy exit"],
      prompt: "You're headed into DFW Airport, and you're in the far-left lane. The airport exit is a two-lane exit. Which lanes can take you there?",
      startLane: 0,
      quizAt: 2400,
      nav: { maneuver: "exit-right", exit: null, road: "International Pkwy", toward: "DFW Airport", then: "Then follow signs for your terminal" },
      sign: {
        panels: [
          { lanes: [0, 1], shield: "114", dir: "EAST", lines: ["Irving", "Dallas"] },
          { lanes: [2, 3], shield: "✈", lines: ["DFW Airport", "International Pkwy"] },
        ],
        exitOnly: [3],
      },
      lanes: [
        { arrows: up, go: "thru", quiz: "wrong",
          why: "The left lane carries on along SH 114 toward Irving and Dallas. Two lanes to go." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Still a straight-through lane. The exit lanes are the two to your right." },
        { arrows: ["up", "right"], go: ["thru", "exit"], quiz: "best",
          why: "The option lane: it can exit or go straight. A good pick — you're on your way in, with a way out if you've misread the sign." },
        { arrows: right, go: "exit", quiz: "best", exitOnly: true,
          why: "EXIT ONLY to the airport. Committed, which is what you want." },
      ],
      branches: {
        thru: { label: "SH 114 E · Irving", onRoute: false,
                miss: "You stayed on SH 114. Navigation reroutes from the next exit — around five minutes, which matters on the way to a flight." },
        exit: { label: "DFW Airport", onRoute: true,
                moves: [{ at: 4800, to: 3, len: 700 }] },
      },
      lesson: "Airport exits carry plenty of people who've never driven them, so expect hesitation and late lane changes around you. A two-lane exit with an option lane gives you two good lanes. Pick one early, hold it, and let the late deciders go around you.",
      tip: "Inside the airport the road splits again for terminals and parking. Watch the navigation's “then” line and the terminal-letter signs.",
    },

    /* ---------------------------------------------------------------- */
    {
      id: "high-five",
      title: "Stacked interchange: exit, then keep left",
      region: "Dallas",
      place: "US 75 northbound at I-635 — the High Five, Dallas",
      skills: ["Stacked interchange", "Two-step maneuver"],
      prompt: "The navigation says “Take Exit 19 toward I-635 East, then keep left.” The exit is two lanes wide. You're in the second lane from the left. Which lane sets you up best?",
      startLane: 1,
      quizAt: 2300,
      nav: { maneuver: "exit-right", exit: "19", road: "I-635 E", toward: "Garland", then: "Then keep left" },
      sign: {
        panels: [
          { lanes: [0, 1, 2], shield: "75", dir: "NORTH", lines: ["Sherman"] },
          { lanes: [3, 4], exit: "19", shield: "635", dir: "EAST · WEST", lines: ["Garland · Irving"] },
        ],
        exitOnly: [3, 4],
      },
      lanes: [
        { arrows: up, go: "thru", quiz: "wrong",
          why: "This lane stays on US 75 through the interchange." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Still on US 75. The exit is two lanes to your right." },
        { arrows: up, go: "thru", quiz: "wrong",
          why: "Straight through on US 75. The exit lanes are the two beside you." },
        { arrows: right, go: "east", quiz: "best", exitOnly: true,
          why: "The left-hand exit lane. When the ramp splits, the left fork is I-635 East — you'll already be on that side." },
        { arrows: right, go: "west", quiz: "ok", exitOnly: true,
          why: "You're on the ramp, but on the I-635 West side. You'd have to change lanes on a short, curving ramp to fix it — possible, not comfortable." },
      ],
      branches: {
        thru: { label: "US-75 N", onRoute: false,
                miss: "You stayed on US 75 past I-635. Navigation reroutes from the next exit — five to ten minutes in traffic." },
        east: { label: "I-635 E · Garland", onRoute: true,
                moves: [{ at: 4600, to: 2.4, len: 600 }, { at: 5800, to: 1.6, len: 600 }] },
        west: { label: "I-635 W · Irving", onRoute: false,
                moves: [{ at: 4600, to: 2.4, len: 600 }, { at: 5800, to: 3.6, len: 600 }],
                miss: "You took the right fork onto I-635 West — the wrong direction. Navigation reroutes, usually off at the next exit and back: ten minutes or more on LBJ." },
      },
      lesson: "Stacked interchanges like Dallas's High Five (US 75 × I-635) and Fort Worth's Mixmaster pile ramps on several levels, and a ramp often splits again soon after it leaves the highway. Navigation shows this as a two-step instruction — “Take Exit 19, then keep left” — so pick the exit lane on the side of the second step.",
      tip: "Watch for the small “then” line under the main instruction. It tells you which side of the ramp to favor before you get there.",
      note: "Schematic: the real High Five has five levels and ramps leaving from both sides. This drill teaches the “exit, then keep left” pattern.",
    },
  ];
})(window.LC);
