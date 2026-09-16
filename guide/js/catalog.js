/* ================================================
   ROAMGUIDE — catalog.js
   The built-in guidebook: four cities, what's worth your time in each,
   and the practical things a guidebook opens to.

   It ships inside the app on purpose. A guide you can't read because the
   hotel wifi is down is not a guide. Nothing here fetches anything.

   Opening hours, prices and closures are what they were when this was
   written and they drift — seasons, holidays, refurbishments. Treat them
   as planning figures, not promises; every place carries a link out to
   OpenStreetMap so you can check before you walk.
   ================================================ */
(function (RG) {
  "use strict";

  /* Hours are seven strings, Sunday first. "" means closed that day. */
  const daily = (h) => [h, h, h, h, h, h, h];
  const except = (h, closedDays, alt) => {
    const week = daily(h);
    (closedDays || []).forEach((d) => { week[d] = alt || ""; });
    return week;
  };
  const ALWAYS = daily("00:00-23:59");

  const CATEGORIES = {
    sight:    { label: "Landmark",  icon: "◈" },
    museum:   { label: "Museum",    icon: "▤" },
    sacred:   { label: "Temple",    icon: "⛩" },
    food:     { label: "Food",      icon: "◍" },
    market:   { label: "Market",    icon: "▦" },
    nature:   { label: "Outdoors",  icon: "❧" },
    view:     { label: "Viewpoint", icon: "△" },
    night:    { label: "After dark",icon: "☾" },
    transit:  { label: "Getting about", icon: "⇄" },
  };

  /* Rough cost of an ordinary day on the ground, in the local currency:
     a couple of transit rides, lunch, a coffee, one paid sight. Used as
     the starting budget when you add a city to a trip. */
  const cities = [
    {
      id: "kyoto",
      name: "Kyoto",
      country: "Japan",
      currency: "JPY",
      language: "Japanese",
      dayBudget: 9000,
      center: { lat: 35.0116, lon: 135.7681 },
      blurb:
        "A thousand years of capital, laid out on a grid and ringed by wooded hills. " +
        "The famous temples are famous for a reason; the trick is meeting them before " +
        "the coaches do.",
      bestMonths: "Late March to April for blossom, November for maples. June is rainy, " +
        "August is genuinely hot.",
      basics: {
        transit:
          "Buses reach more temples than the two subway lines do. Get an IC card (ICOCA, " +
          "Suica) and tap on and off everything, including convenience stores.",
        money:
          "More cash-led than you'd expect. Convenience-store ATMs take foreign cards; " +
          "small temples and market stalls often take nothing else.",
        tipping: "Not a custom. Leaving coins behind reads as forgetfulness, not generosity.",
        water: "Tap water is safe and good.",
        etiquette:
          "Shoes off where there's a step up and a shelf. Eating while walking is frowned on " +
          "in Nishiki and in Gion. In Gion's private lanes, photographing geiko is banned outright.",
        emergency: "110 police · 119 fire and ambulance",
        power: "100 V, type A/B plugs",
      },
      places: [
        {
          id: "kyo-fushimi", name: "Fushimi Inari Taisha", local: "伏見稲荷大社",
          cat: "sacred", lat: 34.9671, lon: 135.7727, min: 120, hours: ALWAYS,
          price: { amount: 0, note: "Free" },
          blurb: "Ten thousand vermilion gates climbing a wooded mountain behind the shrine.",
          best: "Before 7am, or after 8pm when it's lit and nearly empty.",
          tip: "The crowds thin out about fifteen minutes uphill. Most people turn back at the " +
               "first viewpoint; the loop to the summit takes two hours and is mostly yours.",
          tags: ["free", "sunrise", "hike", "iconic"],
        },
        {
          id: "kyo-kinkaku", name: "Kinkaku-ji (Golden Pavilion)", local: "金閣寺",
          cat: "sacred", lat: 35.0394, lon: 135.7292, min: 50, hours: daily("09:00-17:00"),
          price: { amount: 500, note: "Adult" },
          blurb: "A gold-leafed pavilion standing in its own reflection.",
          best: "At opening, or on a grey day when the gold does something stranger.",
          tip: "The path is one-way and takes about half an hour at a walk. It's a long way " +
               "northwest of everything else — pair it with Ryoan-ji, not with Gion.",
          tags: ["iconic", "garden"],
        },
        {
          id: "kyo-kiyomizu", name: "Kiyomizu-dera", local: "清水寺",
          cat: "sacred", lat: 34.9949, lon: 135.7850, min: 90, hours: daily("06:00-18:00"),
          price: { amount: 500, note: "Adult" },
          blurb: "A vast wooden stage on stilts over the hillside, with the city laid out below.",
          best: "Opens at six — an hour when the approach lanes belong to no one.",
          tip: "Walk down through Sannenzaka and Ninenzaka rather than back the way you came.",
          tags: ["view", "iconic", "early"],
        },
        {
          id: "kyo-arashiyama", name: "Arashiyama Bamboo Grove", local: "嵐山竹林",
          cat: "nature", lat: 35.0170, lon: 135.6716, min: 45, hours: ALWAYS,
          price: { amount: 0, note: "Free" },
          blurb: "A path through bamboo tall enough to green the light.",
          best: "Before 8am. By ten it is a queue with trees.",
          tip: "Keep going past the grove to the Ōkōchi Sansō villa gardens, which almost " +
               "nobody does, and which come with tea.",
          tags: ["free", "early", "walk"],
        },
        {
          id: "kyo-nishiki", name: "Nishiki Market", local: "錦市場",
          cat: "market", lat: 35.0050, lon: 135.7649, min: 60, hours: daily("09:30-18:00"),
          price: { amount: 0, note: "Free to wander" },
          blurb: "Five narrow blocks of pickles, knives, tamagoyaki and things on sticks.",
          best: "Late morning, before the lunch crush.",
          tip: "Eat at the stall you bought from — walking off with food is discouraged here. " +
               "Individual stalls keep their own days off.",
          tags: ["food", "rain-proof", "central"],
        },
        {
          id: "kyo-nijo", name: "Nijō Castle", local: "二条城",
          cat: "sight", lat: 35.0142, lon: 135.7481, min: 90, hours: except("08:45-17:00", [2]),
          price: { amount: 1300, note: "Castle and palace" },
          blurb: "The shogun's Kyoto residence, with floors built to chirp underfoot at intruders.",
          best: "Any time; the palace interior is the point and it's indoors.",
          tip: "Closed Tuesdays. Last admission is an hour before closing and enforced.",
          tags: ["history", "rain-proof"],
        },
        {
          id: "kyo-ginkaku", name: "Ginkaku-ji & the Philosopher's Path", local: "銀閣寺・哲学の道",
          cat: "nature", lat: 35.0270, lon: 135.7982, min: 100, hours: daily("08:30-17:00"),
          price: { amount: 500, note: "Temple entry; the canal path is free" },
          blurb: "A raked sand cone, a moss garden, and two kilometres of canal walk under cherry trees.",
          best: "Late afternoon, walking the path south as the light goes.",
          tip: "The path ends near Nanzen-ji and its brick aqueduct — carry on rather than doubling back.",
          tags: ["walk", "garden", "blossom"],
        },
        {
          id: "kyo-gion", name: "Gion & Hanamikoji", local: "祇園",
          cat: "night", lat: 35.0037, lon: 135.7753, min: 60, hours: ALWAYS,
          price: { amount: 0, note: "Free" },
          blurb: "Wooden machiya teahouses, lanterns, and the odd hurrying silhouette.",
          best: "Dusk, around six.",
          tip: "The side alleys off Hanamikoji are private property and photography is fined. " +
               "Shirakawa Canal, one street north, is prettier and unrestricted.",
          tags: ["free", "evening", "walk"],
        },
        {
          id: "kyo-pontocho", name: "Pontochō Alley", local: "先斗町",
          cat: "food", lat: 35.0060, lon: 135.7714, min: 90, hours: daily("17:00-23:00"),
          price: { amount: 3500, note: "Dinner, roughly" },
          blurb: "One lantern-lit lane wide enough for two people, lined with dinner.",
          best: "From six. Many places seat you only with a reservation.",
          tip: "Riverside places put out summer platforms over the Kamo from May to September.",
          tags: ["dinner", "evening"],
        },
      ],
      phrases: [
        { group: "Basics", items: [
          ["Hello", "こんにちは", "kon-nichi-wa"],
          ["Thank you", "ありがとうございます", "arigatō gozaimasu"],
          ["Excuse me / sorry", "すみません", "sumimasen"],
          ["Do you speak English?", "英語を話せますか", "eigo o hanasemasu ka"],
          ["I don't understand", "わかりません", "wakarimasen"],
        ]},
        { group: "Food", items: [
          ["A table for two, please", "二人です", "futari desu"],
          ["This one, please", "これをください", "kore o kudasai"],
          ["Is there meat in this?", "肉が入っていますか", "niku ga haitte imasu ka"],
          ["It was delicious", "ごちそうさまでした", "gochisōsama deshita"],
          ["The bill, please", "お会計お願いします", "o-kaikei onegai shimasu"],
        ]},
        { group: "Getting about", items: [
          ["Where is the station?", "駅はどこですか", "eki wa doko desu ka"],
          ["Does this bus go to…?", "このバスは…に行きますか", "kono basu wa … ni ikimasu ka"],
          ["How much is it?", "いくらですか", "ikura desu ka"],
          ["Can I pay by card?", "カードで払えますか", "kādo de haraemasu ka"],
        ]},
        { group: "Trouble", items: [
          ["Help!", "助けて", "tasukete"],
          ["I'm lost", "道に迷いました", "michi ni mayoimashita"],
          ["Please call a doctor", "医者を呼んでください", "isha o yonde kudasai"],
        ]},
      ],
    },

    {
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
          tags: ["iconic", "history"],
        },
        {
          id: "lis-pasteis", name: "Pastéis de Belém", local: "",
          cat: "food", lat: 38.6975, lon: -9.2032, min: 30, hours: daily("08:00-23:00"),
          price: { amount: 6, note: "Two custard tarts and a coffee" },
          blurb: "The custard tart, made to the 1837 recipe, in a warren of tiled rooms.",
          best: "Any time — the takeaway queue moves fast and the rooms at the back rarely fill.",
          tip: "The line out the door is for the counter. Walk past it and sit down instead.",
          tags: ["food", "cheap"],
        },
        {
          id: "lis-castelo", name: "Castelo de São Jorge", local: "",
          cat: "view", lat: 38.7139, lon: -9.1335, min: 90, hours: daily("09:00-21:00"),
          price: { amount: 15, note: "Adult" },
          blurb: "Moorish walls over the whole city, with peacocks and a camera obscura.",
          best: "Late afternoon into sunset.",
          tip: "The walk up through Alfama is the good part. Tram 28 stops short of the gate anyway.",
          tags: ["view", "sunset"],
        },
        {
          id: "lis-alfama", name: "Alfama & Miradouro de Santa Luzia", local: "",
          cat: "view", lat: 38.7118, lon: -9.1300, min: 75, hours: ALWAYS,
          price: { amount: 0, note: "Free" },
          blurb: "The quarter that survived the earthquake: stairs, washing lines, tiled terraces.",
          best: "Early morning, or around six when the fado houses start tuning up.",
          tip: "Getting lost here is the itinerary. Head downhill and you always reach the river.",
          tags: ["free", "walk", "view"],
        },
        {
          id: "lis-tram28", name: "Tram 28", local: "",
          cat: "transit", lat: 38.7160, lon: -9.1360, min: 50, hours: daily("06:00-23:00"),
          price: { amount: 3.20, note: "On board; less with a Viva card" },
          blurb: "A 1930s wooden tram grinding up the hills through the old quarters.",
          best: "Board at Martim Moniz at opening, or ride it in the evening.",
          tip: "Mid-route you won't get on. Standing by the door is where pockets get picked.",
          tags: ["iconic", "transit"],
        },
        {
          id: "lis-timeout", name: "Time Out Market", local: "Mercado da Ribeira",
          cat: "food", lat: 38.7067, lon: -9.1459, min: 75, hours: daily("10:00-00:00"),
          price: { amount: 18, note: "A plate and a drink" },
          blurb: "The old market hall, half of it now stalls run by the city's better kitchens.",
          best: "Early or late — 1pm and 8pm are shoulder-to-shoulder.",
          tip: "Seating is communal and unclaimed. Send someone to hold a bench first.",
          tags: ["food", "rain-proof"],
        },
        {
          id: "lis-azulejo", name: "Museu Nacional do Azulejo", local: "",
          cat: "museum", lat: 38.7248, lon: -9.1132, min: 90, hours: except("10:00-18:00", [1]),
          price: { amount: 5, note: "Adult" },
          blurb: "Five centuries of tile in a convent, including a 23-metre panorama of pre-earthquake Lisbon.",
          best: "A wet afternoon.",
          tip: "Closed Mondays. It's out east and quiet — the one big museum that never feels full.",
          tags: ["rain-proof", "quiet"],
        },
        {
          id: "lis-lxfactory", name: "LX Factory", local: "",
          cat: "night", lat: 38.7027, lon: -9.1786, min: 90, hours: daily("10:00-00:00"),
          price: { amount: 0, note: "Free to wander" },
          blurb: "A 19th-century industrial block under the bridge, now bookshops, roofs and dinner.",
          best: "Sunday for the market, or evening for the terraces.",
          tip: "Ler Devagar's bookshop, printing press and all, is worth the trip by itself.",
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
    },

    {
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
          tags: ["free", "central", "iconic"],
        },
        {
          id: "mex-templo", name: "Templo Mayor", local: "",
          cat: "museum", lat: 19.4346, lon: -99.1316, min: 100, hours: except("09:00-17:00", [1]),
          price: { amount: 100, note: "Adult; free for residents on Sunday" },
          blurb: "The excavated heart of Tenochtitlan, with a museum holding what came out of it.",
          best: "Opening time, before the sun is on the walkways.",
          tip: "Closed Mondays. Walk the ruins first, then the museum — it's ordered to make sense that way.",
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
          tags: ["rain-proof", "must-see"],
        },
        {
          id: "mex-chapultepec", name: "Castillo de Chapultepec", local: "",
          cat: "view", lat: 19.4204, lon: -99.1817, min: 120, hours: except("09:00-17:00", [1]),
          price: { amount: 95, note: "Adult" },
          blurb: "The only castle in the Americas to have housed actual royalty, on a hill over the park.",
          best: "Morning, paired with the museum across the park.",
          tip: "Closed Mondays. It's a real climb from the gate — the shuttle is worth it in the heat.",
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
          tags: ["book-ahead", "must-see"],
        },
        {
          id: "mex-coyoacan", name: "Coyoacán & Mercado de Coyoacán", local: "",
          cat: "market", lat: 19.3506, lon: -99.1625, min: 120, hours: daily("08:00-18:00"),
          price: { amount: 150, note: "Lunch at a stall" },
          blurb: "A colonial village swallowed by the city, with a market famous for tostadas.",
          best: "Weekend, when the plazas fill up.",
          tip: "Tostadas Coyoacán is the stall with the queue. Join it; it moves.",
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
    },

    {
      id: "istanbul",
      name: "Istanbul",
      country: "Türkiye",
      currency: "TRY",
      language: "Turkish",
      dayBudget: 2200,
      center: { lat: 41.0122, lon: 28.9760 },
      blurb:
        "Two continents, three empires and one strait doing all the work. The old city is " +
        "walkable end to end; everything else is a ferry ride.",
      bestMonths: "April to early June, and September to October. July and August are hot " +
        "and the queues are long.",
      basics: {
        transit:
          "Get an İstanbulkart from any machine — it works on trams, metro, buses and the " +
          "ferries, and one card can pay for several people.",
        money: "Cards are widely taken. Keep small notes for ferries, tea and the bazaar.",
        tipping: "Round up taxis, 10% in restaurants. Tea offered while you browse is hospitality, " +
          "not a contract to buy.",
        water: "Bottled water for drinking; tap water is chlorinated and fine for teeth.",
        etiquette: "Mosques: shoes off, shoulders and knees covered, hair covered for women — " +
          "scarves are lent at the door. Avoid visiting during the five daily prayers, " +
          "and Friday midday especially.",
        emergency: "112",
        power: "230 V, type F plugs",
      },
      places: [
        {
          id: "ist-ayasofya", name: "Hagia Sophia", local: "Ayasofya",
          cat: "sacred", lat: 41.0086, lon: 28.9802, min: 75, hours: daily("09:00-19:00"),
          price: { amount: 2800, note: "Foreign visitors, upper gallery" },
          blurb: "Byzantine cathedral, then mosque, then museum, now mosque again — and still " +
                 "the largest interior of its kind for a thousand years.",
          best: "First thing, or the last hour.",
          tip: "A working mosque: it closes to visitors around prayer times, and the ground " +
               "floor is for worshippers.",
          tags: ["iconic", "must-see"],
        },
        {
          id: "ist-sultanahmet", name: "Blue Mosque", local: "Sultanahmet Camii",
          cat: "sacred", lat: 41.0054, lon: 28.9768, min: 45, hours: daily("08:30-18:30"),
          price: { amount: 0, note: "Free; a donation box at the exit" },
          blurb: "Six minarets and twenty thousand İznik tiles going blue at the top of the dome.",
          best: "Mid-morning, between prayers.",
          tip: "Closed to visitors for roughly 90 minutes around each prayer call. Use the " +
               "visitors' entrance on the south side, not the courtyard gate.",
          tags: ["free", "iconic"],
        },
        {
          id: "ist-topkapi", name: "Topkapı Palace", local: "Topkapı Sarayı",
          cat: "museum", lat: 41.0115, lon: 28.9834, min: 180, hours: except("09:00-18:00", [2]),
          price: { amount: 3000, note: "Palace; the Harem is a separate ticket" },
          blurb: "Four courtyards of Ottoman court life, the treasury, and a terrace over the Bosphorus.",
          best: "At opening — the Harem queue builds fast.",
          tip: "Closed Tuesdays. Buy the Harem ticket at the same time; you can't add it later " +
               "without leaving.",
          tags: ["history", "view", "must-see"],
        },
        {
          id: "ist-cistern", name: "Basilica Cistern", local: "Yerebatan Sarnıcı",
          cat: "sight", lat: 41.0084, lon: 28.9779, min: 45, hours: daily("09:00-22:00"),
          price: { amount: 1300, note: "Adult; higher after 18:30" },
          blurb: "336 columns holding up a sixth-century reservoir, with two Medusa heads in the corner.",
          best: "Evening, when it's lit and cool and the day-trippers have gone.",
          tip: "The single best rainy-hour in the old city, and the coolest place in August.",
          tags: ["rain-proof", "evening"],
        },
        {
          id: "ist-kapali", name: "Grand Bazaar", local: "Kapalıçarşı",
          cat: "market", lat: 41.0106, lon: 28.9681, min: 90, hours: except("09:00-19:00", [0]),
          price: { amount: 0, note: "Free to enter" },
          blurb: "Four thousand shops under vaulted ceilings, trading here since 1461.",
          best: "Morning on a weekday.",
          tip: "Closed Sundays. Prices open high and are expected to be negotiated; " +
               "the gold and carpet quarters are where the real trade still is.",
          tags: ["shopping", "rain-proof"],
        },
        {
          id: "ist-misir", name: "Spice Bazaar & Eminönü", local: "Mısır Çarşısı",
          cat: "market", lat: 41.0165, lon: 28.9705, min: 60, hours: daily("08:00-19:30"),
          price: { amount: 0, note: "Free to enter" },
          blurb: "Saffron, lokum and dried fruit in an L-shaped hall by the ferry piers.",
          best: "Late afternoon, then straight onto a ferry.",
          tip: "The streets outside are cheaper than the hall itself and sell to locals.",
          tags: ["food", "shopping"],
        },
        {
          id: "ist-galata", name: "Galata Tower", local: "Galata Kulesi",
          cat: "view", lat: 41.0256, lon: 28.9744, min: 60, hours: daily("08:30-23:00"),
          price: { amount: 1500, note: "Adult" },
          blurb: "A Genoese watchtower with a 360° balcony over the Golden Horn.",
          best: "An hour before sunset — and expect to queue for it.",
          tip: "The balcony is narrow and one-way. The rooftop bars on Serdar-ı Ekrem street " +
               "sell the same view with a drink and no line.",
          tags: ["view", "sunset"],
        },
        {
          id: "ist-suleymaniye", name: "Süleymaniye Mosque", local: "Süleymaniye Camii",
          cat: "sacred", lat: 41.0165, lon: 28.9639, min: 60, hours: daily("09:00-18:00"),
          price: { amount: 0, note: "Free" },
          blurb: "Sinan's masterpiece on the third hill, calmer and better proportioned than its famous rival.",
          best: "Late afternoon, with tea in the terrace gardens after.",
          tip: "The courtyard's Golden Horn view is the best free one in the city.",
          tags: ["free", "view", "quiet"],
        },
        {
          id: "ist-bosphorus", name: "Bosphorus ferry to Üsküdar", local: "",
          cat: "transit", lat: 41.0175, lon: 28.9720, min: 60, hours: daily("07:00-23:00"),
          price: { amount: 30, note: "With an İstanbulkart" },
          blurb: "Twenty minutes to Asia past palaces and mosques, for the price of a bus ride.",
          best: "An hour before sunset, sitting on the right-hand side going over.",
          tip: "Skip the tourist cruises — the commuter ferry from Eminönü is the same water, " +
               "a fraction of the cost, and comes with tea.",
          tags: ["cheap", "view", "sunset"],
        },
      ],
      phrases: [
        { group: "Basics", items: [
          ["Hello", "Merhaba", "MER-ha-ba"],
          ["Thank you", "Teşekkürler", "teh-sheh-KUR-ler"],
          ["Please", "Lütfen", "LUT-fen"],
          ["Do you speak English?", "İngilizce biliyor musunuz?", "in-gi-LIZ-jeh bi-li-YOR mu-su-nuz"],
          ["Excuse me", "Affedersiniz", "af-fe-DER-si-niz"],
        ]},
        { group: "Food", items: [
          ["A table for two", "İki kişilik masa", "i-KI ki-shi-LIK MA-sa"],
          ["Without meat", "Etsiz", "et-SIZ"],
          ["Tea / coffee", "Çay / kahve", "chai / kah-VEH"],
          ["The bill, please", "Hesap, lütfen", "he-SAP LUT-fen"],
          ["It was very good", "Çok güzeldi", "chok gu-ZEL-di"],
        ]},
        { group: "Getting about", items: [
          ["Where is the ferry pier?", "İskele nerede?", "is-KE-le NE-re-de"],
          ["How much?", "Ne kadar?", "ne ka-DAR"],
          ["Is it far?", "Uzak mı?", "u-ZAK muh"],
          ["No thank you", "Hayır, teşekkürler", "ha-YUR teh-sheh-KUR-ler"],
        ]},
        { group: "Trouble", items: [
          ["Help!", "İmdat!", "im-DAT"],
          ["I'm lost", "Kayboldum", "kai-bol-DUM"],
          ["I need a doctor", "Doktora ihtiyacım var", "dok-to-RA ih-ti-ya-JUM var"],
        ]},
      ],
    },
  ];

  // ---- lookups ----
  const cityById = (id) => cities.find((c) => c.id === id) || null;

  /* Every built-in place, each stamped with the city it belongs to so a
     search across cities can still say where a result is. */
  function allPlaces() {
    const out = [];
    cities.forEach((c) => {
      c.places.forEach((p) => out.push(Object.assign({ city: c.id, cityName: c.name }, p)));
    });
    return out;
  }

  function placeById(id) {
    return allPlaces().find((p) => p.id === id) || null;
  }

  RG.catalog = {
    CATEGORIES, cities, cityById, allPlaces, placeById,
    hours: { daily, except, ALWAYS },
  };
})(window.RG);
