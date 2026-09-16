/* ================================================
   ROAMGUIDE — cities/istanbul.js
   One city of the guidebook. The shape it has to keep, and the helpers
   it builds hours with, are in js/catalog.js.
   ================================================ */
(function (RG) {
  "use strict";
  const { daily, except, ALWAYS } = RG.catalog.hours;

  RG.catalog.register({
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
        history:
          "Justinian had it built in five years, finished in 537, and the story goes " +
          "that he walked in and said he had outdone Solomon. The first dome was too " +
          "flat and came down in an earthquake in 558; the replacement was raised " +
          "higher, and has stood for fifteen centuries.\n\nIt was the largest " +
          "enclosed space in the world for nearly a thousand years, and the cathedral " +
          "of Constantinople until the Fourth Crusade sacked it in 1204 and stripped " +
          "it for the churches of Venice. It became a mosque in 1453, a museum in " +
          "1935, and a mosque again in 2020. The Christian mosaics and the vast " +
          "calligraphic roundels are in the same room, which is the whole history of " +
          "the city in one glance.",
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
        history:
          "Built between 1609 and 1616 for Ahmed I, who was in his twenties and " +
          "wanted something to answer Hagia Sophia across the square. He put it on " +
          "the site of the Byzantine Great Palace, and paid for it out of the " +
          "treasury rather than war spoils, which was controversial — there had been " +
          "no victory to fund it.\n\nThe six minarets caused a second scandal, " +
          "matching the mosque at Mecca; the sultan's answer was to pay for a seventh " +
          "there. Inside are more than twenty thousand İznik tiles, and the blue that " +
          "gives it its English name only really appears high in the gallery, where " +
          "the tilemakers were given their head.",
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
        history:
          "Mehmed II began building in 1459, six years after taking the city, and the " +
          "Ottoman court ran from here for roughly four hundred years. It is not a " +
          "palace in the European sense — no grand staircase, no enfilade — but four " +
          "courtyards, each more private than the last, so that progress inward was " +
          "the whole architecture of power.\n\nThe harem was the sultan's household, " +
          "meaning his mother, wives, children and several hundred staff, and for " +
          "much of the seventeenth century the empire was effectively run from it. " +
          "The court moved to Dolmabahçe on the Bosphorus in 1856, wanting something " +
          "that looked European, which is why this survives.",
        tags: ["history", "view", "must-see"],
      },
      {
        id: "ist-cistern", name: "Basilica Cistern", local: "Yerebatan Sarnıcı",
        cat: "sight", lat: 41.0084, lon: 28.9779, min: 45, hours: daily("09:00-22:00"),
        price: { amount: 1300, note: "Adult; higher after 18:30" },
        blurb: "336 columns holding up a sixth-century reservoir, with two Medusa heads in the corner.",
        best: "Evening, when it's lit and cool and the day-trippers have gone.",
        tip: "The single best rainy-hour in the old city, and the coolest place in August.",
        history:
          "Built in 532 under Justinian to hold water for the Great Palace: eighty " +
          "thousand cubic metres, held up by 336 columns.\n\nAlmost none of the " +
          "columns were cut for it. They were taken from older buildings around the " +
          "empire, which is why no two match, and why two of them stand on carved " +
          "Medusa heads — one on her side, one upside down, used as nothing more than " +
          "the right size of block. The city forgot it was here. In 1545 a Frenchman " +
          "investigating rumours found locals lowering buckets through holes in their " +
          "basement floors, and occasionally pulling up fish.",
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
        history:
          "Mehmed II ordered the first covered market built in 1455, two years after " +
          "the conquest, starting with a masonry hall for the valuable trades — the " +
          "bedesten at the centre, which is still where the gold is.\n\nEverything " +
          "else grew around it over five centuries: sixty streets, four thousand " +
          "shops, its own police and mosques and fountains, laid out by trade rather " +
          "than by geography. The quarters are still roughly where they were. It has " +
          "burned and been shaken down repeatedly and been rebuilt each time to the " +
          "same plan, which is why a market from the 1450s still functions as one.",
        tags: ["shopping", "rain-proof"],
      },
      {
        id: "ist-misir", name: "Spice Bazaar & Eminönü", local: "Mısır Çarşısı",
        cat: "market", lat: 41.0165, lon: 28.9705, min: 60, hours: daily("08:00-19:30"),
        price: { amount: 0, note: "Free to enter" },
        blurb: "Saffron, lokum and dried fruit in an L-shaped hall by the ferry piers.",
        best: "Late afternoon, then straight onto a ferry.",
        tip: "The streets outside are cheaper than the hall itself and sell to locals.",
        history:
          "Built in 1664 as part of the New Mosque complex just outside. Ottoman " +
          "mosque foundations were funded by their own rents — the market was built " +
          "to pay for the mosque, and did, for centuries.\n\nIts Turkish name means " +
          "the Egyptian Market, after the Cairo trade that supplied it: pepper, " +
          "cinnamon, henna, and the tax revenue from Egypt that helped build it. The " +
          "hall is the tourist end now. The streets immediately west, where the city " +
          "buys its coffee, cheese and dried fruit by the kilo, are cheaper and " +
          "better.",
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
        history:
          "The Genoese built it in 1348 and called it the Tower of Christ. They had a " +
          "walled, self-governing colony on this side of the Golden Horn, granted by " +
          "a Byzantine empire too weak to refuse, and the tower was the high point of " +
          "their defences.\n\nThe Ottomans used it as a fire watchtower for " +
          "centuries. The best story attached to it is from the 1630s, when Hezârfen " +
          "Ahmed Çelebi is said to have fixed wings to himself, jumped from the top " +
          "and glided across the Bosphorus to Üsküdar — six kilometres, and into " +
          "Asia. The sultan rewarded him with a purse of gold and then exiled him to " +
          "Algeria, on the grounds that a man capable of that was capable of " +
          "anything.",
        tags: ["view", "sunset"],
      },
      {
        id: "ist-suleymaniye", name: "Süleymaniye Mosque", local: "Süleymaniye Camii",
        cat: "sacred", lat: 41.0165, lon: 28.9639, min: 60, hours: daily("09:00-18:00"),
        price: { amount: 0, note: "Free" },
        blurb: "Sinan's masterpiece on the third hill, calmer and better proportioned than its famous rival.",
        best: "Late afternoon, with tea in the terrace gardens after.",
        tip: "The courtyard's Golden Horn view is the best free one in the city.",
        history:
          "Sinan built it between 1550 and 1557, at the height of his powers and of " +
          "Süleyman's empire, and considered it his journeyman work — he called the " +
          "Selimiye at Edirne, built in his eighties, his masterpiece.\n\nIt was " +
          "never only a mosque. The complex came with a hospital, a medical school, " +
          "four colleges, a soup kitchen, a caravanserai and a bathhouse, laid out " +
          "down the hillside, most of it still standing. Sinan is buried in a small " +
          "tomb at the northern corner, in the angle of the wall, at a scale that " +
          "seems to have been his own choice.",
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
        history:
          "Scheduled steam ferries have crossed here since 1851, run by a company " +
          "founded for the purpose, and the crossing has been part of ordinary " +
          "commuting life ever since — this is a bus route that happens to run " +
          "between two continents.\n\nThe strait itself is why the city exists: " +
          "thirty kilometres of water joining the Black Sea to the Mediterranean, " +
          "narrow enough to fortify and impossible to bypass. Everything on the banks " +
          "— the palaces, the fortresses facing each other at the narrows, the wooden " +
          "yalı houses — was built by people who understood that whoever holds this " +
          "water holds the trade of two seas.",
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
    });
})(window.RG);
