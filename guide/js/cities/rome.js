/* ================================================
   ROAMGUIDE — cities/rome.js
   One city of the guidebook. The shape it has to keep, and the helpers
   it builds hours with, are in js/catalog.js.
   ================================================ */
(function (RG) {
  "use strict";
  const { daily, except, ALWAYS } = RG.catalog.hours;

  RG.catalog.register({
    id: "rome",
    name: "Rome",
    country: "Italy",
    currency: "EUR",
    language: "Italian",
    dayBudget: 90,
    center: { lat: 41.9028, lon: 12.4964 },
    blurb:
      "Three thousand years piled on the same seven hills, with an espresso bar in " +
      "the ground floor of most of it. The ruins are not in a museum quarter — they " +
      "are simply in the way, which is the thing nobody warns you about.",
    bestMonths: "April to June and September to October. August is 35°C and half the " +
      "city has shut up shop and gone to the coast.",
    basics: {
      transit:
        "The metro is only three lines — they couldn't dig further without hitting " +
        "ruins — so the centre is walked. Buses and trams fill the gaps; stamp your " +
        "ticket in the little machine on board or it isn't valid.",
      money:
        "Cards are taken nearly everywhere by law. Keep coins for the odd bar that " +
        "still charges differently for standing at the counter than sitting down.",
      tipping:
        "Largely not a custom. There's often a per-head 'coperto' on the bill already; " +
        "rounding up is plenty, and 10% is generous.",
      water:
        "Excellent, and free: the cast-iron 'nasoni' fountains all over the centre run " +
        "cold drinking water. Block the spout with a finger and it arches up to drink from.",
      etiquette:
        "Churches mean covered shoulders and knees, St Peter's especially — they turn " +
        "people away. Cappuccino after lunch is a tourist tell but nobody minds. Do mind " +
        "the restaurants with photo menus next to the big sights.",
      emergency: "112",
      power: "230 V, type F/L plugs",
    },
    places: [
      {
        id: "rom-colosseo", name: "Colosseum", local: "Colosseo",
        cat: "sight", lat: 41.8902, lon: 12.4922, min: 90, hours: daily("09:00-18:30"),
        price: { amount: 18, note: "Also covers the Forum and Palatine" },
        blurb: "Fifty thousand seats of travertine, still standing after an earthquake took the south side.",
        best: "First slot of the day, or the last two hours when the stone goes gold.",
        tip: "Timed entry, and it sells out days ahead in season — book direct rather than " +
             "from the men in costume outside. The ticket runs 24 hours and includes the " +
             "Forum, so don't try to do both in one exhausted afternoon.",
        history:
          "Vespasian began it around 72 AD on the site of the artificial lake in the " +
          "grounds of Nero's Golden House. That was the point: Nero had seized a " +
          "swathe of central Rome for a private palace after the fire of 64, and his " +
          "successors gave the ground back to the public in the most conspicuous way " +
          "available. Titus opened it in 80 with a hundred days of games.\n\nIts name " +
          "has nothing to do with its size. A colossal bronze statue of Nero stood " +
          "beside it, later rebranded as the sun god, and the building took the " +
          "nickname of its neighbour. For a thousand years afterwards it was a " +
          "quarry: the marble facing and the iron cramps holding the blocks together " +
          "went into churches and palaces across the city, which is why the whole " +
          "south side is missing.",
        tags: ["iconic", "must-see", "book-ahead"],
      },
      {
        id: "rom-foro", name: "Roman Forum & Palatine Hill", local: "Foro Romano",
        cat: "sight", lat: 41.8925, lon: 12.4853, min: 120, hours: daily("09:00-18:30"),
        price: { amount: 0, note: "On the Colosseum ticket" },
        blurb: "The civic centre of the ancient world, and the hill the emperors lived on above it.",
        best: "Morning, before the Forum turns into a sun trap with no shade in it.",
        tip: "Go in at the Palatine gate on Via di San Gregorio — the queue there is a " +
             "fraction of the Forum's, and you come down into the Forum from above.",
        history:
          "This was a marsh between hills until the seventh century BC, when it was " +
          "drained by the Cloaca Maxima — a sewer that still functions, in part, as a " +
          "storm drain. Everything that mattered in the Republic happened in the " +
          "space you are standing in.\n\nAfter Rome collapsed the Forum silted up " +
          "under ten metres of earth and rubble, and by the Renaissance it was " +
          "pasture: the Campo Vaccino, the cow field, with the tops of triumphal " +
          "arches sticking out of the grass. What you see is the result of excavation " +
          "that began in earnest in the nineteenth century and is still going on.",
        tags: ["history", "must-see"],
      },
      {
        id: "rom-pantheon", name: "Pantheon", local: "",
        cat: "sacred", lat: 41.8986, lon: 12.4769, min: 40, hours: daily("09:00-19:00"),
        price: { amount: 5, note: "Adult; free for under-18s" },
        blurb: "A 2,000-year-old concrete dome with a hole in the top, and still the largest unreinforced one on earth.",
        best: "Go when it's raining. The rain falls through the oculus and drains through holes in the floor.",
        tip: "Free to enter until 2023, ticketed since — buy online to skip the queue in the square.",
        history:
          "Agrippa built the first one in 27 BC. It burned; the building you are in " +
          "is Hadrian's, from around 126 AD, and he kept Agrippa's name across the " +
          "front, which has confused visitors for nineteen centuries.\n\nThe dome is " +
          "43.3 metres across and exactly that tall, so the interior contains a " +
          "perfect sphere. It is unreinforced concrete, and still the largest ever " +
          "poured — the mix gets progressively lighter toward the top, with pumice " +
          "near the oculus. It survived because in 609 the emperor gave it to the " +
          "pope and it became a church, which is the only thing that reliably saved a " +
          "Roman building.",
        tags: ["iconic", "rain-proof", "central"],
      },
      {
        id: "rom-vaticani", name: "Vatican Museums & Sistine Chapel", local: "Musei Vaticani",
        cat: "museum", lat: 41.9065, lon: 12.4536, min: 210, hours: except("08:00-19:00", [0]),
        price: { amount: 20, note: "Adult, booked online" },
        blurb: "Seven kilometres of galleries funnelling everyone, eventually, into the Sistine Chapel.",
        best: "The first entry of the day, or a Friday evening opening in season.",
        tip: "Closed Sundays, except the last Sunday of the month when it's free and " +
             "correspondingly impossible. The Sistine is at the very end and there is no " +
             "shortcut — pace yourself through the map gallery rather than admiring every hall.",
        history:
          "The collection starts with a single day in January 1506, when a statue was " +
          "dug out of a vineyard on the Esquiline and identified as the Laocoön, " +
          "known from Pliny and lost for centuries. Michelangelo was sent to look at " +
          "it. Julius II bought it within the month and put it on public display, and " +
          "the museums grew outward from that.\n\nThe Sistine Chapel is at the far " +
          "end because the route is designed to deliver you there. Michelangelo " +
          "painted the ceiling between 1508 and 1512, standing rather than lying, and " +
          "returned twenty-five years later to paint the Last Judgment on the altar " +
          "wall — by which point the confidence of the ceiling had gone somewhere " +
          "much darker.",
        tags: ["must-see", "book-ahead", "rain-proof"],
      },
      {
        id: "rom-sanpietro", name: "St Peter's Basilica", local: "Basilica di San Pietro",
        cat: "sacred", lat: 41.9022, lon: 12.4539, min: 90, hours: daily("07:00-19:00"),
        price: { amount: 0, note: "Free; €10 to climb the dome" },
        blurb: "The largest church ever built, holding Michelangelo's Pietà just inside the door.",
        best: "Seven in the morning, when it's a working church and nearly empty.",
        tip: "The security queue across the square is the real wait, not the door. Shoulders " +
             "and knees covered or you don't get in, in any weather.",
        history:
          "Constantine put a basilica here around 326, over a shrine in a Roman " +
          "cemetery that was already venerated as the grave of Peter. By 1500 it was " +
          "falling down, and Julius II decided to replace rather than repair it — a " +
          "decision that horrified a good many people.\n\nBuilding took from 1506 to " +
          "1626 and went through Bramante, Raphael, Michelangelo, who designed the " +
          "dome in his seventies and refused payment, and Bernini, who added the " +
          "colonnade to embrace the square. It was paid for partly by the sale of " +
          "indulgences in Germany, which is what Luther was objecting to in 1517. The " +
          "largest church in the world is, in a real sense, the reason the " +
          "Reformation happened.",
        tags: ["free", "iconic", "early"],
      },
      {
        id: "rom-trevi", name: "Trevi Fountain", local: "Fontana di Trevi",
        cat: "sight", lat: 41.9009, lon: 12.4833, min: 20, hours: ALWAYS,
        price: { amount: 0, note: "Free" },
        blurb: "An entire palace façade turned into a fountain, fed by an aqueduct from 19 BC.",
        best: "Before seven in the morning or after midnight. Any other hour it is a crowd with water behind it.",
        tip: "It's lit all night and the square never closes, which is the whole trick.",
        history:
          "The water arrives by the Aqua Virgo, built in 19 BC by Agrippa, which has " +
          "run almost continuously ever since and still feeds this fountain. The name " +
          "comes from a story about a girl who showed thirsty soldiers the " +
          "spring.\n\nThe fountain itself is much later: Nicola Salvi won the " +
          "commission in 1732 and it was finished in 1762, after his death. It is not " +
          "a free-standing monument but the end wall of the Palazzo Poli, turned into " +
          "a cliff with a sea god driving through it. The coin-throwing habit is " +
          "twentieth century and nets around a million euros a year, which goes to a " +
          "Catholic charity running supermarkets for the poor of Rome.",
        tags: ["free", "iconic", "early", "evening"],
      },
      {
        id: "rom-borghese", name: "Galleria Borghese", local: "",
        cat: "museum", lat: 41.9142, lon: 12.4922, min: 120, hours: except("09:00-19:00", [1]),
        price: { amount: 13, note: "Adult, timed slot" },
        blurb: "Bernini's marble that behaves like flesh, in a cardinal's garden villa.",
        best: "Any slot — but book it weeks out.",
        tip: "Closed Mondays, entry strictly in two-hour slots, and they genuinely turn " +
             "away anyone without a reservation. The best-value ticket in Rome if you get one.",
        history:
          "Scipione Borghese was made a cardinal at twenty-seven because his uncle " +
          "had just become Pope Paul V, and he spent the rest of his life assembling " +
          "this collection with the single-mindedness of a man who could not be " +
          "refused.\n\nHe found Bernini as a boy and commissioned the Apollo and " +
          "Daphne, the Pluto and Proserpina and the David from him in his early " +
          "twenties — the marble fingers pressing into a thigh are the work of a " +
          "sculptor of twenty-three. He acquired his Caravaggios by rather less " +
          "charming means, including having a painter imprisoned until a picture was " +
          "handed over. The two-hour ticket slots are a modern imposition and, given " +
          "the size of the rooms, entirely sensible.",
        tags: ["book-ahead", "quiet", "rain-proof"],
      },
      {
        id: "rom-campo", name: "Campo de' Fiori market", local: "",
        cat: "market", lat: 41.8955, lon: 12.4722, min: 45, hours: except("07:00-14:00", [0]),
        price: { amount: 0, note: "Free to wander" },
        blurb: "A morning market in the square where Giordano Bruno was burned; his statue still glowers at the Vatican.",
        best: "Before ten, while it's still a food market and not a stall of pasta-shaped souvenirs.",
        tip: "Closed Sundays, and packed up by two. The bakery on the corner, Forno Campo " +
             "de' Fiori, is the reason to come this early.",
        history:
          "Alone among the great squares of Rome, this one never had a church on it — " +
          "which is precisely why it was used for executions. The Inquisition burned " +
          "Giordano Bruno here in February 1600 for, among other things, maintaining " +
          "that the stars were other suns with worlds of their own.\n\nThe brooding " +
          "hooded statue went up in 1889, against fierce Vatican objection, put there " +
          "by a newly unified and anticlerical Italian state making a point. It faces " +
          "the Vatican deliberately. The market around his feet has run since 1869, " +
          "and the square is still one of the few in the centre where Romans buy food " +
          "rather than souvenirs.",
        tags: ["food", "central"],
      },
      {
        id: "rom-trastevere", name: "Trastevere", local: "",
        cat: "night", lat: 41.8891, lon: 12.4694, min: 120, hours: ALWAYS,
        price: { amount: 0, note: "Free to wander" },
        blurb: "Cobbles, ivy and washing lines across the river, and where Rome goes for dinner.",
        best: "From seven, starting at Piazza di Santa Maria before the tables fill.",
        tip: "Cross on the Ponte Sisto footbridge at dusk. The mosaics in Santa Maria in " +
             "Trastevere are twelfth-century and the church asks nothing to see them.",
        history:
          "The name means simply across the Tiber, and in antiquity that is what it " +
          "was: outside the city proper, where the dock workers, the sailors, the " +
          "Syrian and Jewish communities lived. Rome's first synagogue was " +
          "here.\n\nSanta Maria in Trastevere claims to stand on the site of one of " +
          "the earliest places of Christian worship in the city, from a period when " +
          "that was still illegal. The mosaics on its façade and apse are twelfth and " +
          "thirteenth century and glow at dusk when the lights come on, and the " +
          "church charges nothing to walk in and look at them.",
        tags: ["free", "evening", "walk", "food"],
      },
    ],
    phrases: [
      { group: "Basics", items: [
        ["Good morning", "Buongiorno", "bwon-JOR-noh"],
        ["Thank you", "Grazie", "GRAHT-tsyeh"],
        ["Please", "Per favore", "per fah-VOH-reh"],
        ["Do you speak English?", "Parla inglese?", "PAR-lah een-GLEH-zeh"],
        ["Excuse me", "Mi scusi", "mee SKOO-zee"],
      ]},
      { group: "Food", items: [
        ["A table for two", "Un tavolo per due", "oon TAH-voh-loh per DOO-eh"],
        ["Still / sparkling water", "Acqua naturale / frizzante", "AH-kwah nah-too-RAH-leh"],
        ["I'm vegetarian", "Sono vegetariano/a", "SOH-noh veh-jeh-tah-RYAH-noh"],
        ["The bill, please", "Il conto, per favore", "eel KON-toh per fah-VOH-reh"],
        ["A coffee", "Un caffè", "oon kaf-FEH"],
      ]},
      { group: "Getting about", items: [
        ["Where is…?", "Dov'è…?", "doh-VEH"],
        ["How much is it?", "Quanto costa?", "KWAN-toh KOS-tah"],
        ["Is it far?", "È lontano?", "eh lon-TAH-noh"],
        ["One ticket, please", "Un biglietto, per favore", "oon bee-LYET-toh"],
      ]},
      { group: "Trouble", items: [
        ["Help!", "Aiuto!", "ah-YOO-toh"],
        ["I'm lost", "Mi sono perso/a", "mee SOH-noh PER-soh"],
        ["I need a doctor", "Ho bisogno di un medico", "oh bee-ZOH-nyoh dee oon MEH-dee-koh"],
      ]},
    ],
  });
})(window.RG);
