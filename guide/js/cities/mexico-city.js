/* ================================================
   ROAMGUIDE — cities/mexico-city.js
   One city of the guidebook. The shape it has to keep, and the helpers
   it builds hours with, are in js/catalog.js.
   ================================================ */
(function (RG) {
  "use strict";
  const { daily, except, ALWAYS } = RG.catalog.hours;

  RG.catalog.register({
    id: "mexico-city",
    name: "Mexico City",
    country: "Mexico",
    currency: "MXN",
    language: "Spanish",
    dayBudget: 1200,
    center: { lat: 19.4326, lon: -99.1332 },
    blurb:
      "An Aztec capital, a viceregal one and a modern megacity stacked on the same lakebed, " +
      "all of it sinking gently and eating extremely well.",
    bestMonths: "March to May is dry and warm. Rain comes most afternoons June to September " +
      "and usually clears by evening.",
    basics: {
      transit:
        "The metro is cheap, vast and packed; front carriages are reserved for women and " +
        "children at busy times. Use app taxis or authorised sitios rather than flagging one down.",
      money: "Cards in restaurants and museums, cash for markets, tips and street food. " +
        "Withdraw inside banks where you can.",
      tipping: "10–15% in restaurants, small change for the person bagging your groceries " +
        "and for washroom attendants.",
      water: "Don't drink the tap water. Every hotel and restaurant serves purified — " +
        "ice in established places is made from it.",
      etiquette: "Altitude is 2,240 m: the first day will wind you, so take it slowly and " +
        "go easy on the mezcal. Sunday is family day and the big parks are joyful and rammed.",
      emergency: "911",
      power: "127 V, type A/B plugs",
    },
    places: [
      {
        id: "mex-zocalo", name: "Zócalo & Catedral Metropolitana", local: "",
        cat: "sight", lat: 19.4326, lon: -99.1332, min: 75, hours: daily("08:00-20:00"),
        price: { amount: 0, note: "Free; small charge for the bell towers" },
        blurb: "One of the largest squares on earth, with a cathedral visibly sinking into the old lakebed.",
        best: "Early, or at flag-lowering around six.",
        tip: "Stand inside the cathedral doors and look along the floor — the slope is unmistakable.",
        history:
          "You are standing on the ceremonial precinct of Tenochtitlan. After 1521 " +
          "the Spanish levelled it and built their own capital on the rubble, " +
          "deliberately and on the same axis, and the cathedral went up from 1573 " +
          "partly out of the stones of the temple it replaced.\n\nThe city sits on " +
          "the bed of a drained lake, and drained clay compacts. The cathedral has " +
          "sunk more than two metres, unevenly, and by the 1990s was in real danger; " +
          "engineers saved it by excavating under the high side to let it settle back " +
          "level. Stand inside the west door and sight along the floor — the slope is " +
          "not subtle.",
        tags: ["free", "central", "iconic"],
      },
      {
        id: "mex-templo", name: "Templo Mayor", local: "",
        cat: "museum", lat: 19.4346, lon: -99.1316, min: 100, hours: except("09:00-17:00", [1]),
        price: { amount: 100, note: "Adult; free for residents on Sunday" },
        blurb: "The excavated heart of Tenochtitlan, with a museum holding what came out of it.",
        best: "Opening time, before the sun is on the walkways.",
        tip: "Closed Mondays. Walk the ruins first, then the museum — it's ordered to make sense that way.",
        history:
          "The Great Temple of the Mexica, rebuilt seven times, each new pyramid " +
          "swallowing the last — which is why the excavation looks like a set of " +
          "nested boxes. Twin shrines on top, to the rain god and the war god.\n\nIt " +
          "was lost for four and a half centuries. Then in February 1978 electricity " +
          "workers digging behind the cathedral hit a carved stone disc eight tonnes " +
          "in weight: Coyolxauhqui, the moon goddess, dismembered. Everything you can " +
          "walk over here has been uncovered since, in the middle of a working city, " +
          "by demolishing the colonial blocks above it.",
        tags: ["history", "central"],
      },
      {
        id: "mex-antropologia", name: "Museo Nacional de Antropología", local: "",
        cat: "museum", lat: 19.4260, lon: -99.1863, min: 210, hours: except("09:00-18:00", [1]),
        price: { amount: 95, note: "Adult" },
        blurb: "The great museum of Mesoamerica: the Sun Stone, Teotihuacan, the Maya rooms.",
        best: "Weekday morning. Allow more time than you think.",
        tip: "Closed Mondays. Twenty-three halls will defeat you — do the ground floor's Mexica " +
             "and Maya rooms properly and let the rest go.",
        history:
          "Opened in 1964, and as much a monument as the things in it. The courtyard " +
          "is covered by a single concrete umbrella — four thousand square metres " +
          "carried on one fluted column, with water running down it all day.\n\nThe " +
          "Sun Stone at the centre of the Mexica hall was dug up in the Zócalo in " +
          "1790, twenty-four tonnes of basalt, and spent most of the next century " +
          "mounted on the outside wall of the cathedral. The halls are arranged so " +
          "the ground floor is archaeology and the floor above is the living cultures " +
          "descended from it, directly overhead. That was a deliberate argument, and " +
          "it is still being made.",
        tags: ["rain-proof", "must-see"],
      },
      {
        id: "mex-chapultepec", name: "Castillo de Chapultepec", local: "",
        cat: "view", lat: 19.4204, lon: -99.1817, min: 120, hours: except("09:00-17:00", [1]),
        price: { amount: 95, note: "Adult" },
        blurb: "The only castle in the Americas to have housed actual royalty, on a hill over the park.",
        best: "Morning, paired with the museum across the park.",
        tip: "Closed Mondays. It's a real climb from the gate — the shuttle is worth it in the heat.",
        history:
          "The hill was sacred to the Mexica and held their aqueduct's spring; the " +
          "name is Nahuatl for grasshopper hill. The castle on top was begun in 1785 " +
          "as a viceregal retreat and never really settled into one purpose.\n\nIt " +
          "became the military academy, and in 1847 the last stand against the " +
          "invading United States army was made here by cadets — the Niños Héroes, " +
          "six of them, commemorated by the columns below. Maximilian and Carlota " +
          "lived here in the 1860s and laid out the boulevard now called Reforma so " +
          "he could ride to work. It was the presidential residence until 1939, when " +
          "Cárdenas declined to live in a castle.",
        tags: ["view", "history"],
      },
      {
        id: "mex-bellas-artes", name: "Palacio de Bellas Artes", local: "",
        cat: "sight", lat: 19.4352, lon: -99.1412, min: 75, hours: except("10:00-18:00", [1]),
        price: { amount: 90, note: "Murals; performances priced separately" },
        blurb: "Marble art-nouveau outside, art-deco within, and Rivera's murals upstairs.",
        best: "Late morning. Photograph it from the Sears café across the street.",
        tip: "Closed Mondays. Rivera's 'Man at the Crossroads' — the one Rockefeller destroyed — " +
             "was repainted here.",
        history:
          "Commissioned by Porfirio Díaz in 1904 for the centenary of independence, " +
          "in Italian marble, by an Italian architect. The marble was too heavy for a " +
          "lakebed: the building began sinking before it was finished, and it has " +
          "dropped several metres since.\n\nThen the Revolution arrived and work " +
          "stopped for two decades. It was completed in 1934 in art deco, so the " +
          "outside is turn-of-the-century Europe and the inside is modern Mexico — an " +
          "accident of history that reads as a statement. Upstairs is Rivera's Man, " +
          "Controller of the Universe, repainted here after Rockefeller had the New " +
          "York original destroyed for including Lenin.",
        tags: ["central", "rain-proof"],
      },
      {
        id: "mex-frida", name: "Museo Frida Kahlo (Casa Azul)", local: "",
        cat: "museum", lat: 19.3551, lon: -99.1626, min: 90, hours: except("10:00-17:30", [1]),
        price: { amount: 320, note: "Timed ticket, weekday" },
        blurb: "The cobalt-blue house in Coyoacán where she was born, painted and died.",
        best: "The first slot of the day.",
        tip: "Closed Mondays and sells out days ahead — book online before you fly. " +
             "Walk-ups are routinely turned away.",
        history:
          "Frida Kahlo was born in this house in 1907, and died in it in 1954. She " +
          "lived here with Diego Rivera, left, and came back; the blue is the blue " +
          "they painted it.\n\nLeon Trotsky and Natalia Sedova stayed here from 1937 " +
          "to 1939, having been offered asylum in Mexico at Rivera's urging, until a " +
          "falling-out moved them a few streets away — where an assassin reached him " +
          "in 1940. The house opened as a museum in 1958. Her studio is left as it " +
          "was, wheelchair at the easel, and the mirror above the bed is the one she " +
          "painted herself in.",
        tags: ["book-ahead", "must-see"],
      },
      {
        id: "mex-coyoacan", name: "Coyoacán & Mercado de Coyoacán", local: "",
        cat: "market", lat: 19.3506, lon: -99.1625, min: 120, hours: daily("08:00-18:00"),
        price: { amount: 150, note: "Lunch at a stall" },
        blurb: "A colonial village swallowed by the city, with a market famous for tostadas.",
        best: "Weekend, when the plazas fill up.",
        tip: "Tostadas Coyoacán is the stall with the queue. Join it; it moves.",
        history:
          "Cortés based himself in Coyoacán while Tenochtitlan was being rebuilt as " +
          "the Spanish capital, which makes this village, briefly, the seat of " +
          "government of New Spain.\n\nIt stayed a village outside the city until the " +
          "twentieth century swallowed it, and kept the plazas, the low colonial " +
          "houses and the pace. Kahlo and Rivera lived here, Trotsky died here, and " +
          "Buñuel wrote here. The market is the ordinary kind, which is the point — " +
          "its tostada stalls are a genuine local institution rather than a restored " +
          "one.",
        tags: ["food", "walk"],
      },
      {
        id: "mex-xochimilco", name: "Xochimilco canals", local: "",
        cat: "nature", lat: 19.2637, lon: -99.1057, min: 180, hours: daily("09:00-18:00"),
        price: { amount: 600, note: "Per boat per hour, not per person" },
        blurb: "The last of the lake: painted trajineras poled through Aztec market gardens.",
        best: "Sunday for the full floating party; a weekday for birds and quiet.",
        tip: "The price is per boat and fixed by law — it's posted at the embarcadero. " +
             "Agree the hours before you board.",
        history:
          "The canals are the last working fragment of the lake the Aztecs built " +
          "their capital in. The strips of land between them are chinampas: beds " +
          "raised out of lake mud and staked with willow, which produce several " +
          "harvests a year and fed Tenochtitlan.\n\nThey are still farmed. Behind the " +
          "painted party boats there is a functioning agricultural system a thousand " +
          "years old, on UNESCO's list since 1987 and under real pressure from the " +
          "city's thirst and its sinking water table. Take a boat on a weekday and " +
          "you will see the farms rather than the floating mariachi.",
        tags: ["unesco", "day-out"],
      },
      {
        id: "mex-teotihuacan", name: "Teotihuacán", local: "",
        cat: "sight", lat: 19.6925, lon: -98.8438, min: 300, hours: daily("09:00-15:00"),
        price: { amount: 100, note: "Adult; transport on top" },
        blurb: "Pyramids on an avenue two kilometres long, built by a people whose name is lost.",
        best: "At opening. There is no shade on the Avenue of the Dead.",
        tip: "An hour out from Terminal del Norte by bus. Last entry is well before closing, " +
             "and the pyramids themselves may be closed to climbing.",
        history:
          "At its height around 450 AD perhaps 125,000 people lived here, which made " +
          "it one of the largest cities on earth, with apartment compounds laid out " +
          "on a grid two kilometres long. Around 550 the centre was burned, " +
          "apparently deliberately, and the city emptied.\n\nWe do not know what they " +
          "called themselves, what language they spoke, or who burned it. The names " +
          "are all Aztec, applied centuries later by people who found the ruins " +
          "abandoned and assumed, reasonably, that only gods could have built them: " +
          "Teotihuacan means roughly the place where the gods were created. The " +
          "Avenue of the Dead is not a road to anywhere. It is an axis, and it points " +
          "a few degrees east of north for reasons still argued over.",
        tags: ["day-trip", "unesco", "early"],
      },
    ],
    phrases: [
      { group: "Basics", items: [
        ["Good morning", "Buenos días", "BWEH-nos DEE-as"],
        ["Thank you", "Gracias", "GRAH-syas"],
        ["Please", "Por favor", "por fah-VOR"],
        ["Do you speak English?", "¿Habla inglés?", "AH-blah een-GLES"],
        ["Excuse me", "Disculpe", "dees-KOOL-peh"],
      ]},
      { group: "Food", items: [
        ["What do you recommend?", "¿Qué me recomienda?", "keh meh reh-koh-MYEN-dah"],
        ["Not spicy, please", "Sin picante, por favor", "seen pee-KAN-teh"],
        ["I'm vegetarian", "Soy vegetariano/a", "soy veh-heh-tah-RYAH-no"],
        ["The bill, please", "La cuenta, por favor", "lah KWEN-tah"],
        ["Is the water purified?", "¿El agua es purificada?", "el AH-gwah es poo-ree-fee-KAH-dah"],
      ]},
      { group: "Getting about", items: [
        ["Where is the metro?", "¿Dónde está el metro?", "DON-deh es-TAH el MEH-tro"],
        ["How much is the fare?", "¿Cuánto cuesta el pasaje?", "KWAN-toh KWES-tah"],
        ["Please take me to…", "Lléveme a…, por favor", "YEH-veh-meh ah"],
        ["Is it safe to walk here?", "¿Es seguro caminar aquí?", "es seh-GOO-ro kah-mee-NAR ah-KEE"],
      ]},
      { group: "Trouble", items: [
        ["Help!", "¡Auxilio!", "owk-SEE-lyo"],
        ["I need a doctor", "Necesito un médico", "neh-seh-SEE-toh oon MEH-dee-koh"],
        ["I've been robbed", "Me robaron", "meh roh-BAH-ron"],
      ]},
    ],
    });
})(window.RG);
