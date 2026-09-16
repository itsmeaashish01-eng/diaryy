/* ================================================
   ROAMGUIDE — cities/lisbon.js
   One city of the guidebook. The shape it has to keep, and the helpers
   it builds hours with, are in js/catalog.js.
   ================================================ */
(function (RG) {
  "use strict";
  const { daily, except, ALWAYS } = RG.catalog.hours;

  RG.catalog.register({
    id: "lisbon",
    name: "Lisbon",
    country: "Portugal",
    currency: "EUR",
    language: "Portuguese",
    dayBudget: 70,
    center: { lat: 38.7139, lon: -9.1394 },
    blurb:
      "Seven hills, tiled façades and a river the size of a sea. Everything worth seeing " +
      "is either at the top of a climb or at the bottom of one.",
    bestMonths: "March to May and September to October. August is hot and fully booked.",
    basics: {
      transit:
        "Metro for distance, tram 28 for the hills, and the Santa Justa lift mostly for the " +
        "queue. A Viva Viagem card zapped with credit works on all of it.",
      money: "Cards everywhere, though the smallest tascas still prefer cash.",
      tipping: "Round up, or 5–10% for a proper meal. The bread and olives on the table are " +
        "charged for if you eat them — waving them away is normal.",
      water: "Tap water is safe.",
      etiquette: "Lunch runs late, dinner later still — 8pm is early. Pickpockets work tram 28 " +
        "and the Santa Justa queue with real skill.",
      emergency: "112",
      power: "230 V, type F plugs",
    },
    places: [
      {
        id: "lis-belem-tower", name: "Torre de Belém", local: "",
        cat: "sight", lat: 38.6916, lon: -9.2160, min: 60, hours: except("09:30-18:00", [1]),
        price: { amount: 8, note: "Adult" },
        blurb: "A limestone watchtower in the river, carved with rope, artichokes and a rhinoceros.",
        best: "First thing. The staircase is single-file and the queue only grows.",
        tip: "Closed Mondays. The exterior is most of the pleasure — if the line is long, " +
             "walk on to the monastery and come back.",
        history:
          "Built between 1514 and 1519 under Manuel I to guard the mouth of the " +
          "Tagus, back when it stood on a small island in the middle of the river. " +
          "The 1755 earthquake and three centuries of silt moved the water; the tower " +
          "stayed put and the shore came to it.\n\nLook along the western face for a " +
          "rhinoceros carved into the base of a watchtower. It is thought to be the " +
          "first rhinoceros in European stone, and it is a copy of a copy: Dürer's " +
          "famous woodcut of 1515, which was itself drawn from written descriptions " +
          "of a real animal sent to Manuel I in Lisbon by the governor of Portuguese " +
          "India.",
        tags: ["iconic", "river"],
      },
      {
        id: "lis-jeronimos", name: "Mosteiro dos Jerónimos", local: "",
        cat: "sacred", lat: 38.6979, lon: -9.2065, min: 90, hours: except("09:30-18:00", [1]),
        price: { amount: 12, note: "Cloister; the church is free" },
        blurb: "Manueline stonework at the scale of a cathedral, paid for by the spice trade.",
        best: "Opening time, or after 4pm.",
        tip: "Closed Mondays. Book the cloister online; the church next door costs nothing " +
             "and holds Vasco da Gama.",
        history:
          "Begun in 1501 and funded, explicitly, by a five per cent tax on the spices " +
          "coming back from India — the building is the return on Vasco da Gama's " +
          "voyage, made visible. It took the better part of a century.\n\nThen on All " +
          "Saints' Day 1755 an earthquake, a fire and a tsunami destroyed most of " +
          "Lisbon in a morning. The monastery held. The stone survived almost intact " +
          "while the city below it did not, which is part of why the Manueline style " +
          "here feels less like a period and more like a survivor.",
        tags: ["iconic", "history"],
      },
      {
        id: "lis-pasteis", name: "Pastéis de Belém", local: "",
        cat: "food", lat: 38.6975, lon: -9.2032, min: 30, hours: daily("08:00-23:00"),
        price: { amount: 6, note: "Two custard tarts and a coffee" },
        blurb: "The custard tart, made to the 1837 recipe, in a warren of tiled rooms.",
        best: "Any time — the takeaway queue moves fast and the rooms at the back rarely fill.",
        tip: "The line out the door is for the counter. Walk past it and sit down instead.",
        history:
          "The recipe came out of the monastery next door. Convents used enormous " +
          "quantities of egg white to starch habits and clarify wine, and were left " +
          "with yolks; the answer, all over Portugal, was custard.\n\nWhen the " +
          "religious orders were dissolved in 1834 the monks sold the recipe to the " +
          "sugar refinery beside the monastery, which opened this shop in 1837 and " +
          "has made them to it ever since. The formula is held by a handful of people " +
          "at a time, who are not permitted to travel together — a story the shop is " +
          "happy to let you believe, and which appears to be true.",
        tags: ["food", "cheap"],
      },
      {
        id: "lis-castelo", name: "Castelo de São Jorge", local: "",
        cat: "view", lat: 38.7139, lon: -9.1335, min: 90, hours: daily("09:00-21:00"),
        price: { amount: 15, note: "Adult" },
        blurb: "Moorish walls over the whole city, with peacocks and a camera obscura.",
        best: "Late afternoon into sunset.",
        tip: "The walk up through Alfama is the good part. Tram 28 stops short of the gate anyway.",
        history:
          "Fortified since at least the Moorish period, on a hilltop that had been " +
          "settled long before that. Afonso Henriques took it in 1147 with the help " +
          "of an English and Flemish crusader fleet that had stopped in Lisbon on its " +
          "way to the Holy Land and was talked into staying for the siege.\n\nIt was " +
          "the royal palace until 1511 and a barracks and prison for centuries after. " +
          "Most of what you walk on is a 1940s reconstruction — the state stripped " +
          "away the later buildings to expose the medieval walls, a restoration " +
          "philosophy that has gone out of fashion but does give you the view.",
        tags: ["view", "sunset"],
      },
      {
        id: "lis-alfama", name: "Alfama & Miradouro de Santa Luzia", local: "",
        cat: "view", lat: 38.7118, lon: -9.1300, min: 75, hours: ALWAYS,
        price: { amount: 0, note: "Free" },
        blurb: "The quarter that survived the earthquake: stairs, washing lines, tiled terraces.",
        best: "Early morning, or around six when the fado houses start tuning up.",
        tip: "Getting lost here is the itinerary. Head downhill and you always reach the river.",
        history:
          "The name is Arabic — al-hamma, the hot springs — and the layout is older " +
          "than Portugal: a tangle that predates the grid by centuries because it was " +
          "never planned.\n\nIt survived 1755 when the district below it did not, and " +
          "the reason is geology. Alfama sits on dense bedrock; the Baixa below was " +
          "built on river sediment that liquefied in the shaking. Everything downhill " +
          "of here was rebuilt from nothing on an eighteenth-century grid. Everything " +
          "uphill is what Lisbon looked like before.",
        tags: ["free", "walk", "view"],
      },
      {
        id: "lis-tram28", name: "Tram 28", local: "",
        cat: "transit", lat: 38.7160, lon: -9.1360, min: 50, hours: daily("06:00-23:00"),
        price: { amount: 3.20, note: "On board; less with a Viva card" },
        blurb: "A 1930s wooden tram grinding up the hills through the old quarters.",
        best: "Board at Martim Moniz at opening, or ride it in the evening.",
        tip: "Mid-route you won't get on. Standing by the door is where pockets get picked.",
        history:
          "The little yellow cars are Remodelados, built in the 1930s and rebuilt " +
          "since, and they are still running for a practical reason rather than a " +
          "sentimental one: the route's gradients and the turning radius of the old " +
          "streets are beyond anything modern.\n\nThe network peaked at twenty-seven " +
          "lines before the buses and the metro took the flat ground. What is left " +
          "clings to the hills, which is where trams were always better than anything " +
          "else, and the 28 threads Graça, Alfama, Baixa and Estrela on a single " +
          "ticket.",
        tags: ["iconic", "transit"],
      },
      {
        id: "lis-timeout", name: "Time Out Market", local: "Mercado da Ribeira",
        cat: "food", lat: 38.7067, lon: -9.1459, min: 75, hours: daily("10:00-00:00"),
        price: { amount: 18, note: "A plate and a drink" },
        blurb: "The old market hall, half of it now stalls run by the city's better kitchens.",
        best: "Early or late — 1pm and 8pm are shoulder-to-shoulder.",
        tip: "Seating is communal and unclaimed. Send someone to hold a bench first.",
        history:
          "The Mercado da Ribeira has been the city's main food market since the " +
          "nineteenth century, in this iron-and-glass hall since 1892 — the same " +
          "moment, and much the same idea, as Les Halles in Paris.\n\nIn 2014 half of " +
          "it was handed to a magazine, which installed two dozen kitchens from " +
          "restaurants around the city under one roof. Purists grumble, and the other " +
          "half is still a working morning market for fruit, fish and flowers, which " +
          "is the part worth arriving early for.",
        tags: ["food", "rain-proof"],
      },
      {
        id: "lis-azulejo", name: "Museu Nacional do Azulejo", local: "",
        cat: "museum", lat: 38.7248, lon: -9.1132, min: 90, hours: except("10:00-18:00", [1]),
        price: { amount: 5, note: "Adult" },
        blurb: "Five centuries of tile in a convent, including a 23-metre panorama of pre-earthquake Lisbon.",
        best: "A wet afternoon.",
        tip: "Closed Mondays. It's out east and quiet — the one big museum that never feels full.",
        history:
          "The museum is in the Madre de Deus convent, founded in 1509, and the tiles " +
          "are arranged so you walk forward through five centuries of them. Azulejo " +
          "is from the Arabic az-zulayj, polished stone.\n\nPortugal industrialised " +
          "tile after 1755: it was cheap, it was waterproof, it survived fire, and " +
          "there was an entire capital to re-clad in a hurry. The museum's great " +
          "prize is a panorama of Lisbon twenty-three metres long, made before the " +
          "earthquake — which makes a decorative panel into the best surviving record " +
          "of a city that no longer exists.",
        tags: ["rain-proof", "quiet"],
      },
      {
        id: "lis-lxfactory", name: "LX Factory", local: "",
        cat: "night", lat: 38.7027, lon: -9.1786, min: 90, hours: daily("10:00-00:00"),
        price: { amount: 0, note: "Free to wander" },
        blurb: "A 19th-century industrial block under the bridge, now bookshops, roofs and dinner.",
        best: "Sunday for the market, or evening for the terraces.",
        tip: "Ler Devagar's bookshop, printing press and all, is worth the trip by itself.",
        history:
          "It opened in 1846 as one of the largest industrial complexes in the " +
          "country, spinning and weaving thread, and later printing — the presses of " +
          "a national newspaper ran here. Then the textile trade left, and the " +
          "buildings sat empty for the best part of two decades.\n\nReoccupation " +
          "began in 2008, deliberately without much renovation. The floors are the " +
          "factory floors and the signage is the factory signage, which is why it " +
          "does not feel like a development. The bookshop in the old printworks kept " +
          "the press.",
        tags: ["free", "evening", "shopping"],
      },
    ],
    phrases: [
      { group: "Basics", items: [
        ["Good morning", "Bom dia", "bong DEE-ah"],
        ["Thank you (m/f)", "Obrigado / Obrigada", "oh-bree-GAH-doo / -dah"],
        ["Please", "Por favor", "poor fah-VOR"],
        ["Do you speak English?", "Fala inglês?", "FAH-lah een-GLESH"],
        ["Sorry", "Desculpe", "dish-KOOL-peh"],
      ]},
      { group: "Food", items: [
        ["A table for two", "Uma mesa para dois", "OO-mah MEH-zah pah-rah doysh"],
        ["No thank you (to the bread)", "Não, obrigado", "nowng oh-bree-GAH-doo"],
        ["I'm vegetarian", "Sou vegetariano/a", "soh veh-zheh-tah-ree-AH-noo"],
        ["The bill, please", "A conta, por favor", "ah KON-tah poor fah-VOR"],
        ["A coffee", "Um café", "oong kah-FEH"],
      ]},
      { group: "Getting about", items: [
        ["Where is…?", "Onde fica…?", "ON-deh FEE-kah"],
        ["Does this go to Belém?", "Isto vai para Belém?", "EESH-too vye pah-rah beh-LENG"],
        ["How much?", "Quanto custa?", "KWAN-too KOOSH-tah"],
        ["Is it far on foot?", "É longe a pé?", "eh LON-zheh ah peh"],
      ]},
      { group: "Trouble", items: [
        ["Help!", "Socorro!", "soo-KOH-roo"],
        ["I've lost my bag", "Perdi a minha mala", "per-DEE ah MEEN-yah MAH-lah"],
        ["Call an ambulance", "Chame uma ambulância", "SHAH-meh oo-mah am-boo-LAN-see-ah"],
      ]},
    ],
    });
})(window.RG);
