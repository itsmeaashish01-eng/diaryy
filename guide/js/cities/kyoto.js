/* ================================================
   ROAMGUIDE — cities/kyoto.js
   One city of the guidebook. The shape it has to keep, and the helpers
   it builds hours with, are in js/catalog.js.
   ================================================ */
(function (RG) {
  "use strict";
  const { daily, except, ALWAYS } = RG.catalog.hours;

  RG.catalog.register({
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
        history:
          "Founded in 711, and so older than Kyoto itself — the capital moved here " +
          "eighty years later. It belongs to Inari, the kami of rice, and therefore " +
          "of harvests, and therefore, as the economy changed under it, of business " +
          "and money.\n\nEvery one of the thousands of gates was paid for by " +
          "somebody. Turn round on the way up and you can read the backs: a company " +
          "name and a date, going back through the Edo period, when donating a torii " +
          "to thank Inari for a good year became the done thing. Some of the names on " +
          "the mountain no longer exist; the gates outlast the businesses that bought " +
          "them.",
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
        history:
          "Built in 1397 as a retirement villa for Ashikaga Yoshimitsu, the third " +
          "shogun, who covered the top two floors in gold leaf and had the whole " +
          "thing turned into a Zen temple in his will.\n\nWhat you are looking at is " +
          "not that building. In 1950 a novice monk of the temple burned it to the " +
          "ground, an act Yukio Mishima turned into a novel and a great deal of " +
          "national soul-searching. The reconstruction went up in 1955, and in 1987 " +
          "was re-gilded in leaf five times thicker than the original — the copy is, " +
          "by that measure, more golden than the thing it copies.",
        tags: ["iconic", "garden"],
      },
      {
        id: "kyo-kiyomizu", name: "Kiyomizu-dera", local: "清水寺",
        cat: "sacred", lat: 34.9949, lon: 135.7850, min: 90, hours: daily("06:00-18:00"),
        price: { amount: 500, note: "Adult" },
        blurb: "A vast wooden stage on stilts over the hillside, with the city laid out below.",
        best: "Opens at six — an hour when the approach lanes belong to no one.",
        tip: "Walk down through Sannenzaka and Ninenzaka rather than back the way you came.",
        history:
          "Founded in 778 around a spring the temple is named for — kiyomizu, pure " +
          "water — which still runs off the hillside in three streams below the main " +
          "hall.\n\nThe great stage is a 1633 rebuild under the shogun Iemitsu, " +
          "thirteen metres up on a lattice of keyaki pillars joined without a single " +
          "nail. In the Edo period a belief took hold that surviving a jump from it " +
          "would have your wish granted. The temple's own records list 234 attempts " +
          "and a survival rate near 85%, which says as much about the vegetation " +
          "below as the drop. The practice was banned in 1872.",
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
        history:
          "Aristocrats came out here to look at the moon and the maples from the " +
          "Heian period onward, which is why the bridge is called Togetsukyo, the " +
          "moon-crossing bridge.\n\nThe bamboo is not wild. Groves like this are " +
          "worked: culms are cut on a cycle, thinned to let light down, and the whole " +
          "thing would close over within a few seasons if left alone. The sound the " +
          "grove makes has been listed by the Ministry of the Environment as one of " +
          "the hundred soundscapes of Japan, which is a very Japanese thing to have a " +
          "list of.",
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
        history:
          "There was a fish market on this street by around 1310, and the reason was " +
          "geology: cold, clean groundwater sat close to the surface here, and " +
          "fishmongers sank wells to keep the catch. The shogunate licensed it " +
          "formally in 1615.\n\nIt has been \"Kyoto's kitchen\" ever since, which " +
          "increasingly means two trades in one lane — the pickle and tofu and knife " +
          "shops that supply the city's restaurants, and the skewers and samples " +
          "aimed at visitors. Look up: many of the shopfronts still carry the family " +
          "name and the year the business started, and several run past three hundred " +
          "years.",
        tags: ["food", "rain-proof", "central"],
      },
      {
        id: "kyo-nijo", name: "Nijō Castle", local: "二条城",
        cat: "sight", lat: 35.0142, lon: 135.7481, min: 90, hours: except("08:45-17:00", [2]),
        price: { amount: 1300, note: "Castle and palace" },
        blurb: "The shogun's Kyoto residence, with floors built to chirp underfoot at intruders.",
        best: "Any time; the palace interior is the point and it's indoors.",
        tip: "Closed Tuesdays. Last admission is an hour before closing and enforced.",
        history:
          "Tokugawa Ieyasu built it in 1603 as his Kyoto residence, and used it to " +
          "announce that he was shogun. Two hundred and sixty-four years later, in " +
          "the same building, the fifteenth and last Tokugawa shogun handed power " +
          "back to the emperor. The dynasty opened and closed in one room.\n\nThe " +
          "corridors of the Ninomaru palace are laid so the floorboards chirp against " +
          "their nails underfoot — uguisubari, nightingale floors. Whether they were " +
          "built as an alarm or simply wore that way is argued about; either way you " +
          "cannot cross them quietly, and you will try.",
        tags: ["history", "rain-proof"],
      },
      {
        id: "kyo-ginkaku", name: "Ginkaku-ji & the Philosopher's Path", local: "銀閣寺・哲学の道",
        cat: "nature", lat: 35.0270, lon: 135.7982, min: 100, hours: daily("08:30-17:00"),
        price: { amount: 500, note: "Temple entry; the canal path is free" },
        blurb: "A raked sand cone, a moss garden, and two kilometres of canal walk under cherry trees.",
        best: "Late afternoon, walking the path south as the light goes.",
        tip: "The path ends near Nanzen-ji and its brick aqueduct — carry on rather than doubling back.",
        history:
          "Ashikaga Yoshimasa built this in 1482 in conscious answer to his " +
          "grandfather's Golden Pavilion, and the silver it is named for was never " +
          "applied — the country was in the middle of the Ōnin War, which had burned " +
          "much of Kyoto, and there was no money.\n\nWhat came out of the villa " +
          "instead was the Higashiyama culture: the tea ceremony, flower arranging, " +
          "ink painting and noh took the shape they still hold around Yoshimasa's " +
          "circle here. The cone of raked sand in the garden, the Kogetsudai, is " +
          "meant for looking at the moon, and nobody is certain when it was first " +
          "piled up.",
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
        history:
          "Gion grew up as teahouses serving pilgrims walking to Yasaka Shrine, and " +
          "by the 1700s had become the city's licensed entertainment quarter. The " +
          "wooden machiya fronts are narrow because houses were taxed on their street " +
          "frontage — the buildings run a surprising distance back.\n\nKyoto had well " +
          "over a thousand geiko and maiko in the 1920s. There are a few hundred now, " +
          "working five districts, of which this is the largest. They are not " +
          "performers for the street: the private lanes off Hanamikoji are exactly " +
          "that, private, and the fines posted for photographing them there are real.",
        tags: ["free", "evening", "walk"],
      },
      {
        id: "kyo-pontocho", name: "Pontochō Alley", local: "先斗町",
        cat: "food", lat: 35.0060, lon: 135.7714, min: 90, hours: daily("17:00-23:00"),
        price: { amount: 3500, note: "Dinner, roughly" },
        blurb: "One lantern-lit lane wide enough for two people, lined with dinner.",
        best: "From six. Many places seat you only with a reservation.",
        tip: "Riverside places put out summer platforms over the Kamo from May to September.",
        history:
          "The strip is built on land reclaimed from the Kamo river in 1670, which is " +
          "why it is precisely one alley wide — that is how much ground there was. It " +
          "was licensed as an entertainment district in 1712.\n\nFrom May to " +
          "September the restaurants along the east side extend platforms out over " +
          "the river on stilts. The practice is called kawayuka, it is centuries old, " +
          "the dates are fixed by agreement across the whole street, and it exists " +
          "for one reason: before air conditioning, the only cool air in Kyoto in " +
          "August sat just above the water.",
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
    });
})(window.RG);
