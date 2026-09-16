/* ================================================
   ROAMGUIDE — cities/marrakesh.js
   One city of the guidebook. The shape it has to keep, and the helpers
   it builds hours with, are in js/catalog.js.
   ================================================ */
(function (RG) {
  "use strict";
  const { daily, except, ALWAYS } = RG.catalog.hours;

  RG.catalog.register({
    id: "marrakesh",
    name: "Marrakesh",
    country: "Morocco",
    currency: "MAD",
    language: "Darija & French",
    dayBudget: 600,
    center: { lat: 31.6295, lon: -7.9811 },
    blurb:
      "A walled red city on the edge of the Atlas, built around a square that empties " +
      "every morning and becomes a food market every night. The medina is a deliberate " +
      "maze and no map survives contact with it.",
    bestMonths: "March to May and October to November. July and August pass 40°C, and " +
      "December nights are properly cold.",
    basics: {
      transit:
        "The medina is walked — cars can't get down most of it and mopeds will anyway. " +
        "Petits taxis are metered by law and by custom are not; agree the fare before " +
        "you get in, or ask for the meter and be prepared to walk away.",
      money:
        "Cash runs the medina. Dirhams are a closed currency — you can't get them before " +
        "you arrive and can't legally take them out, so change at the end.",
      tipping:
        "Constant and small. A few dirhams for the man who carries a bag, 10% in a " +
        "restaurant, coins for the car-park attendant who appeared from nowhere.",
      water: "Bottled. The mint tea is safe, endless and comes with everything.",
      etiquette:
        "Friday is the quiet day and lunch is couscous. Cover shoulders and knees — more " +
        "so away from the tourist streets. Anyone who tells you the square is closed, or " +
        "that your riad is this way, is walking you to a shop. A firm 'la shukran' is enough.",
      emergency: "19 police · 15 ambulance",
      power: "220 V, type C/E plugs",
    },
    places: [
      {
        id: "mar-jemaa", name: "Jemaa el-Fnaa", local: "جامع الفناء",
        cat: "night", lat: 31.6258, lon: -7.9891, min: 90, hours: ALWAYS,
        price: { amount: 0, note: "Free; pay for any photo you take" },
        blurb: "An empty square by day that grows a hundred food stalls, storytellers and " +
               "musicians at sunset, and has done for a thousand years.",
        best: "Dusk. Stand on a café terrace on the east side and watch the stalls assemble.",
        tip: "The snake charmers, water sellers and henna artists charge for photographs " +
             "and will insist afterwards if you didn't ask first. Agree a price, or don't " +
             "raise the camera.",
        history:
          "The square is as old as the city, which the Almoravids founded in 1070 as " +
          "a base for their empire in the Sahara. Its name is argued about; the most " +
          "common reading is assembly of the dead, which is usually explained by " +
          "executions once displayed here.\n\nWhat it does is unusual enough that " +
          "UNESCO invented a category for it. In 2001 Jemaa el-Fnaa was one of the " +
          "first places named a Masterpiece of the Oral and Intangible Heritage of " +
          "Humanity — not for its buildings, which are unremarkable, but for the " +
          "storytellers, the halqa circles, the musicians and the practice of " +
          "gathering here after dark, which has been continuous for something close " +
          "to a thousand years.",
        tags: ["free", "evening", "food", "iconic"],
      },
      {
        id: "mar-koutoubia", name: "Koutoubia Mosque", local: "مسجد الكتبية",
        cat: "sacred", lat: 31.6236, lon: -7.9934, min: 30, hours: ALWAYS,
        price: { amount: 0, note: "Free; gardens only" },
        blurb: "The 12th-century minaret the whole city is measured against — no building " +
               "may stand taller, and none does.",
        best: "Floodlit after dark, from the rose gardens on the south side.",
        tip: "Non-Muslims can't go in, so this is an outside visit. The ruins of the earlier " +
             "mosque, misaligned with Mecca and rebuilt, are marked in the ground beside it.",
        history:
          "The Almohads took Marrakesh in 1147 and set about replacing the city their " +
          "predecessors had built. They put up a mosque here, then discovered — or " +
          "decided — that it was misaligned with Mecca, so they demolished it and " +
          "built the present one alongside in the 1150s.\n\nThe foundations of the " +
          "first are still marked in the ground next to the second, which makes this " +
          "one of the few places you can see an architectural mistake preserved at " +
          "full scale. The minaret is seventy-seven metres and set the pattern for " +
          "the Giralda in Seville and the Hassan Tower in Rabat. Its name comes from " +
          "the booksellers, the koutoubiyyin, who once had their stalls at its foot.",
        tags: ["free", "iconic", "evening"],
      },
      {
        id: "mar-bahia", name: "Bahia Palace", local: "قصر الباهية",
        cat: "sight", lat: 31.6218, lon: -7.9832, min: 60, hours: daily("09:00-17:00"),
        price: { amount: 70, note: "Adult" },
        blurb: "A grand vizier's palace of painted cedar ceilings, courtyards and zellij tilework.",
        best: "At opening, before the tour groups arrive around ten.",
        tip: "Almost entirely unfurnished, which sounds like a criticism and isn't — the " +
             "ceilings are the point and you can actually see them.",
        history:
          "Begun in the 1860s by Si Moussa, a grand vizier who had been born a slave, " +
          "and enormously extended by his son Ba Ahmed, who effectively ruled Morocco " +
          "as regent in the 1890s. He bought up neighbouring houses one by one, which " +
          "is why the plan wanders — there was no master design, only " +
          "acquisition.\n\nBa Ahmed died in 1900, and within days the sultan's men " +
          "had stripped the palace of everything portable, down to the door fittings. " +
          "His family were turned out. The emptiness you walk through is not neglect; " +
          "it is the record of what happens when a powerful man in an absolute " +
          "monarchy dies without protection.",
        tags: ["history", "quiet"],
      },
      {
        id: "mar-saadien", name: "Saadian Tombs", local: "قبور السعديين",
        cat: "sight", lat: 31.6177, lon: -7.9892, min: 45, hours: daily("09:00-17:00"),
        price: { amount: 70, note: "Adult" },
        blurb: "A sultan's mausoleum walled up for three centuries and only rediscovered " +
               "from the air in 1917.",
        best: "First thing. It's small and the queue is the whole experience otherwise.",
        tip: "The Hall of Twelve Columns is viewed from a doorway through a single-file " +
             "corridor — go early or you'll shuffle for twenty minutes to glance at it.",
        history:
          "Ahmad al-Mansur, the greatest of the Saadian sultans, built these tombs " +
          "for his dynasty at the end of the sixteenth century, and spared nothing: " +
          "Italian marble, Atlas cedar, gold leaf over stucco.\n\nWhen the Alaouites " +
          "took over, Moulay Ismail set about erasing the Saadians from Morocco — but " +
          "these were graves, and destroying them was out of the question. So he had " +
          "the complex walled up, with only an obscure passage from the mosque next " +
          "door left open. They stayed sealed for two centuries. A French aerial " +
          "survey in 1917 spotted the enclosure from the air, and a doorway was cut.",
        tags: ["history", "early"],
      },
      {
        id: "mar-souks", name: "The souks", local: "الأسواق",
        cat: "market", lat: 31.6300, lon: -7.9860, min: 120, hours: daily("09:00-20:00"),
        price: { amount: 0, note: "Free to wander" },
        blurb: "Kilometres of covered lanes, sorted by trade: dyers, leather, lanterns, " +
               "slippers, spices, each to its own quarter.",
        best: "Mid-morning on any day but Friday, when much of it shuts around midday prayer.",
        tip: "The first price is an opening bid, not an insult — expect to settle nearer a " +
             "third of it, cheerfully. Head north from Jemaa el-Fnaa and downhill always " +
             "returns you to the square.",
        history:
          "Marrakesh was founded as a trading post where the trans-Saharan caravan " +
          "routes met the Atlas passes, and what came north was gold and salt and " +
          "what went south was manufactured goods. The souks are the retail end of " +
          "that trade, still sorted the medieval way — by craft, not by " +
          "customer.\n\nEach quarter had its own guild, its own street, and often its " +
          "own fondouk where the caravans unloaded. Several of those courtyards are " +
          "still there behind unmarked doors, now workshops. The dyers' souk, where " +
          "skeins of wool are hung across the alley to dry, is doing what it has done " +
          "since the city was founded, and remains the most photographed lane in " +
          "Morocco for good reason.",
        tags: ["shopping", "walk"],
      },
      {
        id: "mar-majorelle", name: "Jardin Majorelle & the YSL Museum", local: "حديقة ماجوريل",
        cat: "nature", lat: 31.6417, lon: -8.0033, min: 75, hours: daily("08:00-18:00"),
        price: { amount: 170, note: "Garden; the museum is a separate ticket" },
        blurb: "A painter's cobalt-blue garden of cacti and bamboo, bought and saved by " +
               "Yves Saint Laurent.",
        best: "The first slot of the day — it's small, and by eleven it's shoulder to shoulder.",
        tip: "Book online for a timed entry; the on-the-day queue outside in the sun is long. " +
             "It's in Gueliz, a half-hour walk or a short taxi from the medina.",
        history:
          "Jacques Majorelle, a French painter who came to Morocco in 1917 for his " +
          "health, bought this plot in 1923 and spent forty years making a garden of " +
          "it — collecting cacti and palms from five continents and painting the " +
          "walls, pots and pergolas in an intense cobalt he mixed himself and gave " +
          "his name to.\n\nHe opened it to the public in 1947 to pay for its upkeep, " +
          "and after his death it fell into disrepair. In 1980 Yves Saint Laurent and " +
          "Pierre Bergé, who had been visiting for years, found it about to be sold " +
          "to a hotel developer and bought it instead. Saint Laurent's ashes were " +
          "scattered in the rose garden in 2008, and there is a memorial to him among " +
          "the bamboo.",
        tags: ["book-ahead", "garden", "early"],
      },
      {
        id: "mar-secret", name: "Le Jardin Secret", local: "الحديقة السرية",
        cat: "nature", lat: 31.6316, lon: -7.9878, min: 45, hours: daily("09:30-18:30"),
        price: { amount: 100, note: "Adult; tower extra" },
        blurb: "A riad garden in the middle of the medina, restored around its original " +
               "thousand-year-old irrigation system.",
        best: "Midday, when the medina is hot and loud and this is neither.",
        tip: "The single best place in the old city to sit down for half an hour. Climb the " +
             "tower for the medina roofline and the Atlas behind it.",
        history:
          "There has been a riad on this plot since the Saadian period; the present " +
          "one was built in the 1860s for a caïd of the Atlas, abandoned for decades, " +
          "and opened to the public in 2016 after a long restoration.\n\nIts water is " +
          "the interesting part. The garden is still fed by the khettara — " +
          "underground channels, dug by hand and vented by shafts, that bring " +
          "meltwater from the foothills of the Atlas under the plain to the city. The " +
          "system is a thousand years old, it is what made a city possible here at " +
          "all, and this is one of the few places you can see it still doing its job.",
        tags: ["quiet", "garden", "central"],
      },
      {
        id: "mar-benyoussef", name: "Medersa Ben Youssef", local: "مدرسة ابن يوسف",
        cat: "sight", lat: 31.6320, lon: -7.9868, min: 60, hours: daily("09:00-18:00"),
        price: { amount: 50, note: "Adult" },
        blurb: "A 16th-century Quranic school around a courtyard of carved cedar, stucco " +
               "and tile, with 130 student cells upstairs.",
        best: "Early or late; the courtyard reflections are best with the sun off the pool.",
        tip: "Reopened in 2022 after a long restoration. The tiny upstairs cells are the " +
             "part people skip and shouldn't.",
        history:
          "Founded by the Marinids in the fourteenth century and rebuilt on a far " +
          "grander scale by the Saadian sultan Abdallah al-Ghalib in 1564. It was the " +
          "largest Quranic school in Morocco, with around nine hundred students " +
          "living in the hundred and thirty cells on the upper floors.\n\nThose cells " +
          "are tiny, many with no window, arranged around light wells — and after the " +
          "carved cedar and stucco of the courtyard downstairs, they are the thing " +
          "that stays with you. It stopped teaching in 1960, opened as a monument, " +
          "and was closed again for a thorough restoration that ran to 2022.",
        tags: ["history", "must-see"],
      },
      {
        id: "mar-menara", name: "Menara Gardens", local: "حدائق المنارة",
        cat: "nature", lat: 31.6136, lon: -8.0206, min: 45, hours: daily("08:00-18:00"),
        price: { amount: 0, note: "Free; small charge for the pavilion" },
        blurb: "An olive grove around a 12th-century reservoir, with the Atlas in the water " +
               "on a clear day.",
        best: "Late afternoon, when the light is on the mountains.",
        tip: "Locals picnic here and it's genuinely a city park, not a sight — which is why " +
             "it's worth the taxi out.",
        history:
          "The basin was dug by the Almohads in the twelfth century as a reservoir " +
          "for the olive groves and the city, filled by the same khettara channels " +
          "from the Atlas that watered the medina.\n\nIt is engineering, not " +
          "decoration — the pavilion at the end is a nineteenth-century Alaouite " +
          "addition, a place for a sultan to spend an afternoon. Marrakchis have " +
          "picnicked here for as long as anyone can remember, and still do, " +
          "particularly on Fridays. On a clear day the High Atlas stands in the " +
          "water, which is the shot on half the postcards in Morocco.",
        tags: ["free", "quiet", "view"],
      },
    ],
    phrases: [
      { group: "Basics", items: [
        ["Hello", "السلام عليكم", "salam alaykum"],
        ["Thank you", "شكرا", "shukran"],
        ["Please", "عافاك", "afak"],
        ["No thank you", "لا شكرا", "la shukran"],
        ["Do you speak English?", "واش كتهضر بالإنجليزية؟", "wash kat-hdar b-inglizia"],
      ]},
      { group: "Food", items: [
        ["Without meat", "بلا لحم", "bla lham"],
        ["Water", "الما", "el-ma"],
        ["Mint tea", "أتاي بالنعناع", "atay b-nanaa"],
        ["It's delicious", "بنين", "bnin"],
        ["The bill, please", "الحساب عافاك", "l-hsab afak"],
      ]},
      { group: "Getting about", items: [
        ["Where is…?", "فين كاين…؟", "fin kayn"],
        ["How much?", "بشحال؟", "bshhal"],
        ["That's too expensive", "غالي بزاف", "ghali bezzaf"],
        ["The meter, please", "الكونتور عافاك", "el-kuntur afak"],
      ]},
      { group: "Trouble", items: [
        ["Help me", "عاوني", "awni"],
        ["I'm lost", "توضرت", "twadart"],
        ["I need a doctor", "خاصني طبيب", "khassni tbib"],
      ]},
    ],
  });
})(window.RG);
