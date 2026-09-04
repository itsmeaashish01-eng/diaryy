/* ================================================
   SPEAK AGAIN — therapy-content.js
   The curriculum: letters, words, sentences, tasks.

   Everything the therapy engine drills on lives here so that a
   clinician or caregiver can read, check and extend the material
   without touching the program logic in therapy.js.

   Pictures are emoji so the whole app works offline with no assets.
   ================================================ */

/* ------------------------------------------------
   LEVELS — the gradual ladder
   Each level names what is being (re)built, and which exercise
   types are allowed at that stage. The engine only offers an
   exercise if it appears in the current level's list.
   ------------------------------------------------ */
const LEVELS = [
  {
    n: 1,
    name: "Sounds & Letters",
    blurb: "Hearing and saying single sounds. The foundation.",
    icon: "🔤",
    exercises: ["letter_say", "letter_pick", "minimal_pair", "listen_repeat"],
  },
  {
    n: 2,
    name: "First Words",
    blurb: "Short, everyday words you use most often.",
    icon: "🍎",
    exercises: ["listen_repeat", "name_picture", "match_word_picture", "yes_no"],
  },
  {
    n: 3,
    name: "Words & Meaning",
    blurb: "Longer words, and sorting what words mean.",
    icon: "🧠",
    exercises: ["name_picture", "match_word_picture", "odd_one_out", "yes_no", "listen_repeat"],
  },
  {
    n: 4,
    name: "Two Words Together",
    blurb: "Joining words into short phrases and finishing sentences.",
    icon: "🔗",
    exercises: ["cloze", "build_sentence", "follow_command", "match_word_picture", "name_picture"],
  },
  {
    n: 5,
    name: "Whole Sentences",
    blurb: "Building, reading and understanding full sentences.",
    icon: "📗",
    exercises: ["build_sentence", "read_aloud", "cloze", "follow_command", "self_monitor"],
  },
  {
    n: 6,
    name: "Questions & Talking",
    blurb: "Answering questions and telling someone about your day.",
    icon: "💬",
    exercises: ["wh_question", "describe_scene", "sequence_story", "self_monitor", "read_aloud"],
  },
];

/* ------------------------------------------------
   LETTERS & SOUNDS (Level 1)
   `sound` is how the sound is said out loud, spelled for the
   speech synthesiser so it models the phoneme, not the letter name.
   ------------------------------------------------ */
const LETTERS = [
  { l: "a", sound: "ah",  word: "apple",  e: "🍎" },
  { l: "b", sound: "buh", word: "ball",   e: "⚽" },
  { l: "c", sound: "kuh", word: "cat",    e: "🐱" },
  { l: "d", sound: "duh", word: "dog",    e: "🐶" },
  { l: "e", sound: "eh",  word: "egg",    e: "🥚" },
  { l: "f", sound: "fff", word: "fish",   e: "🐟" },
  { l: "g", sound: "guh", word: "girl",   e: "👧" },
  { l: "h", sound: "huh", word: "hat",    e: "🎩" },
  { l: "i", sound: "ih",  word: "ink",    e: "🖊️" },
  { l: "j", sound: "juh", word: "jam",    e: "🍯" },
  { l: "k", sound: "kuh", word: "key",    e: "🔑" },
  { l: "l", sound: "lll", word: "leg",    e: "🦵" },
  { l: "m", sound: "mmm", word: "milk",   e: "🥛" },
  { l: "n", sound: "nnn", word: "nose",   e: "👃" },
  { l: "o", sound: "oh",  word: "orange", e: "🍊" },
  { l: "p", sound: "puh", word: "pen",    e: "🖊️" },
  { l: "r", sound: "rrr", word: "rain",   e: "🌧️" },
  { l: "s", sound: "sss", word: "sun",    e: "☀️" },
  { l: "t", sound: "tuh", word: "tree",   e: "🌳" },
  { l: "u", sound: "uh",  word: "up",     e: "⬆️" },
  { l: "v", sound: "vvv", word: "van",    e: "🚐" },
  { l: "w", sound: "wuh", word: "water",  e: "💧" },
  { l: "y", sound: "yuh", word: "yes",    e: "👍" },
  { l: "z", sound: "zzz", word: "zip",    e: "🤐" },
];

/* ------------------------------------------------
   MINIMAL PAIRS (Level 1)
   Two words that differ by one sound. Used for "same or different?"
   listening practice — the classic test of sound discrimination
   that is often impaired in Wernicke's aphasia.
   ------------------------------------------------ */
const MINIMAL_PAIRS = [
  ["bat", "pat"], ["pin", "bin"], ["cat", "hat"], ["ten", "hen"],
  ["sea", "tea"], ["big", "pig"], ["door", "four"], ["map", "mat"],
  ["ship", "chip"], ["cap", "cup"], ["dog", "log"], ["run", "sun"],
  ["fan", "van"], ["kiss", "kids"], ["thin", "tin"], ["light", "night"],
  ["wet", "vet"], ["pear", "bear"], ["coat", "goat"], ["rice", "rise"],
];

/* ------------------------------------------------
   WORD BANK — the core lexicon
   w    = the word
   e    = picture (emoji)
   cat  = semantic category (drives yes/no and odd-one-out)
   syl  = number of syllables (easier words have fewer)
   tier = 1 easiest / most frequent … 3 hardest
   alive, edible, drink, big = simple semantic features used to
        generate true and false yes/no questions automatically.
   ------------------------------------------------ */
const WORDS = [
  /* --- animals --- */
  { w: "cat",      e: "🐱", cat: "animal", syl: 1, tier: 1, alive: true,  big: false },
  { w: "dog",      e: "🐶", cat: "animal", syl: 1, tier: 1, alive: true,  big: false },
  { w: "bird",     e: "🐦", cat: "animal", syl: 1, tier: 1, alive: true,  big: false },
  { w: "fish",     e: "🐟", cat: "animal", syl: 1, tier: 1, alive: true,  big: false },
  { w: "cow",      e: "🐄", cat: "animal", syl: 1, tier: 1, alive: true,  big: true  },
  { w: "horse",    e: "🐴", cat: "animal", syl: 1, tier: 2, alive: true,  big: true  },
  { w: "pig",      e: "🐷", cat: "animal", syl: 1, tier: 1, alive: true,  big: true  },
  { w: "duck",     e: "🦆", cat: "animal", syl: 1, tier: 1, alive: true,  big: false },
  { w: "bee",      e: "🐝", cat: "animal", syl: 1, tier: 2, alive: true,  big: false },
  { w: "frog",     e: "🐸", cat: "animal", syl: 1, tier: 2, alive: true,  big: false },
  { w: "sheep",    e: "🐑", cat: "animal", syl: 1, tier: 2, alive: true,  big: true  },
  { w: "bear",     e: "🐻", cat: "animal", syl: 1, tier: 2, alive: true,  big: true  },
  { w: "lion",     e: "🦁", cat: "animal", syl: 2, tier: 2, alive: true,  big: true  },
  { w: "rabbit",   e: "🐰", cat: "animal", syl: 2, tier: 2, alive: true,  big: false },
  { w: "monkey",   e: "🐵", cat: "animal", syl: 2, tier: 3, alive: true,  big: false },
  { w: "elephant", e: "🐘", cat: "animal", syl: 3, tier: 3, alive: true,  big: true  },
  { w: "butterfly",e: "🦋", cat: "animal", syl: 3, tier: 3, alive: true,  big: false },

  /* --- food & drink --- */
  { w: "apple",    e: "🍎", cat: "food", syl: 2, tier: 1, edible: true },
  { w: "bread",    e: "🍞", cat: "food", syl: 1, tier: 1, edible: true },
  { w: "egg",      e: "🥚", cat: "food", syl: 1, tier: 1, edible: true },
  { w: "cake",     e: "🍰", cat: "food", syl: 1, tier: 1, edible: true },
  { w: "soup",     e: "🍲", cat: "food", syl: 1, tier: 1, edible: true },
  { w: "rice",     e: "🍚", cat: "food", syl: 1, tier: 2, edible: true },
  { w: "cheese",   e: "🧀", cat: "food", syl: 1, tier: 2, edible: true },
  { w: "banana",   e: "🍌", cat: "food", syl: 3, tier: 2, edible: true },
  { w: "orange",   e: "🍊", cat: "food", syl: 2, tier: 2, edible: true },
  { w: "carrot",   e: "🥕", cat: "food", syl: 2, tier: 2, edible: true },
  { w: "pizza",    e: "🍕", cat: "food", syl: 2, tier: 2, edible: true },
  { w: "cookie",   e: "🍪", cat: "food", syl: 2, tier: 2, edible: true },
  { w: "milk",     e: "🥛", cat: "food", syl: 1, tier: 1, edible: true, drink: true },
  { w: "water",    e: "💧", cat: "food", syl: 2, tier: 1, edible: true, drink: true },
  { w: "tea",      e: "🍵", cat: "food", syl: 1, tier: 1, edible: true, drink: true },
  { w: "coffee",   e: "☕", cat: "food", syl: 2, tier: 2, edible: true, drink: true },

  /* --- body --- */
  { w: "hand",     e: "✋", cat: "body", syl: 1, tier: 1 },
  { w: "eye",      e: "👁️", cat: "body", syl: 1, tier: 1 },
  { w: "ear",      e: "👂", cat: "body", syl: 1, tier: 1 },
  { w: "nose",     e: "👃", cat: "body", syl: 1, tier: 1 },
  { w: "foot",     e: "🦶", cat: "body", syl: 1, tier: 1 },
  { w: "mouth",    e: "👄", cat: "body", syl: 1, tier: 1 },
  { w: "tooth",    e: "🦷", cat: "body", syl: 1, tier: 2 },
  { w: "arm",      e: "💪", cat: "body", syl: 1, tier: 1 },
  { w: "leg",      e: "🦵", cat: "body", syl: 1, tier: 1 },
  { w: "hair",     e: "💇", cat: "body", syl: 1, tier: 2 },

  /* --- clothes --- */
  { w: "hat",      e: "🎩", cat: "clothes", syl: 1, tier: 1 },
  { w: "shoe",     e: "👟", cat: "clothes", syl: 1, tier: 1 },
  { w: "coat",     e: "🧥", cat: "clothes", syl: 1, tier: 1 },
  { w: "sock",     e: "🧦", cat: "clothes", syl: 1, tier: 1 },
  { w: "shirt",    e: "👕", cat: "clothes", syl: 1, tier: 2 },
  { w: "dress",    e: "👗", cat: "clothes", syl: 1, tier: 2 },
  { w: "glove",    e: "🧤", cat: "clothes", syl: 1, tier: 3 },
  { w: "ring",     e: "💍", cat: "clothes", syl: 1, tier: 2 },
  { w: "glasses",  e: "👓", cat: "clothes", syl: 2, tier: 3 },

  /* --- kitchen --- */
  { w: "cup",      e: "🥤", cat: "kitchen", syl: 1, tier: 1 },
  { w: "spoon",    e: "🥄", cat: "kitchen", syl: 1, tier: 1 },
  { w: "fork",     e: "🍴", cat: "kitchen", syl: 1, tier: 1 },
  { w: "knife",    e: "🔪", cat: "kitchen", syl: 1, tier: 2 },
  { w: "plate",    e: "🍽️", cat: "kitchen", syl: 1, tier: 1 },
  { w: "bowl",     e: "🥣", cat: "kitchen", syl: 1, tier: 2 },
  { w: "pan",      e: "🍳", cat: "kitchen", syl: 1, tier: 2 },
  { w: "kettle",   e: "🫖", cat: "kitchen", syl: 2, tier: 3 },

  /* --- home --- */
  { w: "bed",      e: "🛏️", cat: "home", syl: 1, tier: 1, big: true },
  { w: "chair",    e: "🪑", cat: "home", syl: 1, tier: 1, big: true },
  { w: "door",     e: "🚪", cat: "home", syl: 1, tier: 1, big: true },
  { w: "key",      e: "🔑", cat: "home", syl: 1, tier: 1 },
  { w: "lamp",     e: "💡", cat: "home", syl: 1, tier: 2 },
  { w: "clock",    e: "🕐", cat: "home", syl: 1, tier: 1 },
  { w: "book",     e: "📖", cat: "home", syl: 1, tier: 1 },
  { w: "phone",    e: "📱", cat: "home", syl: 1, tier: 1 },
  { w: "window",   e: "🪟", cat: "home", syl: 2, tier: 2, big: true },
  { w: "soap",     e: "🧼", cat: "home", syl: 1, tier: 2 },
  { w: "mirror",   e: "🪞", cat: "home", syl: 2, tier: 3 },
  { w: "box",      e: "📦", cat: "home", syl: 1, tier: 2 },
  { w: "letter",   e: "✉️", cat: "home", syl: 2, tier: 2 },
  { w: "money",    e: "💵", cat: "home", syl: 2, tier: 2 },
  { w: "bag",      e: "👜", cat: "home", syl: 1, tier: 1 },
  { w: "pen",      e: "🖊️", cat: "home", syl: 1, tier: 1 },
  { w: "scissors", e: "✂️", cat: "home", syl: 2, tier: 3 },
  { w: "candle",   e: "🕯️", cat: "home", syl: 2, tier: 3 },
  { w: "towel",    e: "🧻", cat: "home", syl: 2, tier: 3 },

  /* --- vehicles --- */
  { w: "car",      e: "🚗", cat: "vehicle", syl: 1, tier: 1, big: true },
  { w: "bus",      e: "🚌", cat: "vehicle", syl: 1, tier: 1, big: true },
  { w: "train",    e: "🚆", cat: "vehicle", syl: 1, tier: 2, big: true },
  { w: "bike",     e: "🚲", cat: "vehicle", syl: 1, tier: 1, big: true },
  { w: "boat",     e: "⛵", cat: "vehicle", syl: 1, tier: 2, big: true },
  { w: "plane",    e: "✈️", cat: "vehicle", syl: 1, tier: 2, big: true },
  { w: "truck",    e: "🚚", cat: "vehicle", syl: 1, tier: 2, big: true },

  /* --- nature --- */
  { w: "sun",      e: "☀️", cat: "nature", syl: 1, tier: 1, big: true },
  { w: "moon",     e: "🌙", cat: "nature", syl: 1, tier: 1, big: true },
  { w: "star",     e: "⭐", cat: "nature", syl: 1, tier: 1 },
  { w: "tree",     e: "🌳", cat: "nature", syl: 1, tier: 1, alive: true, big: true },
  { w: "flower",   e: "🌸", cat: "nature", syl: 2, tier: 1, alive: true },
  { w: "rain",     e: "🌧️", cat: "nature", syl: 1, tier: 1 },
  { w: "snow",     e: "❄️", cat: "nature", syl: 1, tier: 1 },
  { w: "fire",     e: "🔥", cat: "nature", syl: 1, tier: 2 },
  { w: "leaf",     e: "🍃", cat: "nature", syl: 1, tier: 2 },
  { w: "mountain", e: "⛰️", cat: "nature", syl: 2, tier: 3, big: true },

  /* --- people --- */
  { w: "baby",     e: "👶", cat: "people", syl: 2, tier: 1, alive: true },
  { w: "man",      e: "👨", cat: "people", syl: 1, tier: 1, alive: true },
  { w: "woman",    e: "👩", cat: "people", syl: 2, tier: 1, alive: true },
  { w: "boy",      e: "👦", cat: "people", syl: 1, tier: 1, alive: true },
  { w: "girl",     e: "👧", cat: "people", syl: 1, tier: 1, alive: true },
  { w: "doctor",   e: "🧑‍⚕️", cat: "people", syl: 2, tier: 2, alive: true },
  { w: "teacher",  e: "🧑‍🏫", cat: "people", syl: 2, tier: 3, alive: true },

  /* --- places --- */
  { w: "house",    e: "🏠", cat: "place", syl: 1, tier: 1, big: true },
  { w: "school",   e: "🏫", cat: "place", syl: 1, tier: 2, big: true },
  { w: "shop",     e: "🏪", cat: "place", syl: 1, tier: 2, big: true },
  { w: "hospital", e: "🏥", cat: "place", syl: 3, tier: 3, big: true },
  { w: "park",     e: "🏞️", cat: "place", syl: 1, tier: 2, big: true },
  { w: "beach",    e: "🏖️", cat: "place", syl: 1, tier: 3, big: true },
];

/* Category names written so they drop straight into a sentence.
   Singular form follows "Is this …?" and "It is …".
   Group form follows "The others are all …". */
const CATEGORY_LABELS = {
  animal:  "an animal",
  food:    "something to eat or drink",
  body:    "a part of the body",
  clothes: "something you wear",
  kitchen: "something you use for eating or drinking",
  home:    "something in the house",
  vehicle: "something you travel in",
  nature:  "something outside",
  people:  "a person",
  place:   "a place",
};

const CATEGORY_GROUP = {
  animal:  "animals",
  food:    "things to eat or drink",
  body:    "parts of the body",
  clothes: "things you wear",
  kitchen: "things you use for eating or drinking",
  home:    "things in the house",
  vehicle: "things you travel in",
  nature:  "things outside",
  people:  "people",
  place:   "places",
};

/* Categories that overlap too much to make a fair "no" question:
   a spoon really is something in the house, so never ask that. */
const CATEGORY_CONFLICTS = {
  animal:  ["people", "nature"],
  food:    ["nature", "kitchen"],
  body:    ["people"],
  clothes: ["home"],
  kitchen: ["home", "food"],
  home:    ["kitchen", "clothes"],
  vehicle: [],
  nature:  ["animal", "food", "place"],
  people:  ["animal", "body"],
  place:   ["home", "nature"],
};

/* ------------------------------------------------
   SENTENCE COMPLETION (Level 4+)
   High-constraint sentences: the ending is almost forced, which
   makes the word much easier to produce. This is the bridge from
   single words to real speech for non-fluent (Broca's) speakers.
   `a` is the target word, `also` lists other acceptable answers.
   ------------------------------------------------ */
const CLOZE = [
  { s: "I sleep in a ___.",             a: "bed",    also: ["bedroom"] },
  { s: "I drink water from a ___.",     a: "cup",    also: ["glass"] },
  { s: "I eat soup with a ___.",        a: "spoon",  also: [] },
  { s: "I cut the bread with a ___.",   a: "knife",  also: [] },
  { s: "I sit on a ___.",               a: "chair",  also: ["sofa", "seat"] },
  { s: "I open the ___.",               a: "door",   also: ["window", "box"] },
  { s: "I wash my ___.",                a: "hands",  also: ["hand", "face", "hair"] },
  { s: "I brush my ___.",               a: "teeth",  also: ["tooth", "hair"] },
  { s: "I read a ___.",                 a: "book",   also: ["letter", "paper"] },
  { s: "I drive a ___.",                a: "car",    also: ["bus", "truck"] },
  { s: "The dog says ___.",             a: "woof",   also: ["bark"] },
  { s: "The cat says ___.",             a: "meow",   also: [] },
  { s: "Salt and ___.",                 a: "pepper", also: [] },
  { s: "Bread and ___.",                a: "butter", also: ["jam", "cheese"] },
  { s: "Knife and ___.",                a: "fork",   also: [] },
  { s: "Cup of ___.",                   a: "tea",    also: ["coffee", "water"] },
  { s: "The sun is in the ___.",        a: "sky",    also: [] },
  { s: "It is raining, take your ___.", a: "coat",   also: ["umbrella"] },
  { s: "I put my shoes on my ___.",     a: "feet",   also: ["foot"] },
  { s: "I put my hat on my ___.",       a: "head",   also: ["hair"] },
  { s: "I see with my ___.",            a: "eyes",   also: ["eye"] },
  { s: "I hear with my ___.",           a: "ears",   also: ["ear"] },
  { s: "I smell with my ___.",          a: "nose",   also: [] },
  { s: "I walk with my ___.",           a: "legs",   also: ["leg", "feet"] },
  { s: "Wash your hands with ___.",     a: "soap",   also: ["water"] },
  { s: "Lock the door with a ___.",     a: "key",    also: [] },
  { s: "I tell the time with a ___.",   a: "clock",  also: ["watch"] },
  { s: "I call my friend on the ___.",  a: "phone",  also: [] },
  { s: "The baby drinks ___.",          a: "milk",   also: [] },
  { s: "I buy food at the ___.",        a: "shop",   also: ["store", "market"] },
  { s: "Children learn at ___.",        a: "school", also: [] },
  { s: "The doctor works at the ___.",  a: "hospital", also: ["clinic", "surgery"] },
  { s: "One, two, ___.",                a: "three",  also: [] },
  { s: "Red, yellow and ___.",          a: "green",  also: ["blue"] },
  { s: "Day and ___.",                  a: "night",  also: [] },
  { s: "Yes and ___.",                  a: "no",     also: [] },
  { s: "Mum and ___.",                  a: "dad",    also: ["father"] },
  { s: "Happy ___.",                    a: "birthday", also: [] },
  { s: "Thank ___.",                    a: "you",    also: [] },
  { s: "Good ___.",                     a: "morning", also: ["night", "evening"] },
];

/* ------------------------------------------------
   SENTENCES FOR BUILDING & READING (Levels 5-6)
   `words` is the correct order; the engine shuffles them into
   chips to be put back in order. This targets the loss of
   grammar (agrammatism) typical of Broca's aphasia.
   tier 1 = 3 words, tier 2 = 4-5 words, tier 3 = 6+ words.
   ------------------------------------------------ */
const SENTENCES = [
  { words: ["I", "want", "water"],                          tier: 1 },
  { words: ["I", "am", "tired"],                            tier: 1 },
  { words: ["The", "dog", "barks"],                         tier: 1 },
  { words: ["She", "reads", "books"],                       tier: 1 },
  { words: ["He", "drinks", "tea"],                         tier: 1 },
  { words: ["I", "feel", "better"],                         tier: 1 },
  { words: ["Please", "help", "me"],                        tier: 1 },
  { words: ["The", "baby", "sleeps"],                       tier: 1 },
  { words: ["The", "cat", "drinks", "milk"],                tier: 2 },
  { words: ["I", "eat", "an", "apple"],                     tier: 2 },
  { words: ["The", "man", "opens", "the", "door"],          tier: 2 },
  { words: ["She", "washes", "her", "hands"],               tier: 2 },
  { words: ["We", "walk", "in", "the", "park"],             tier: 2 },
  { words: ["The", "bus", "is", "very", "late"],            tier: 2 },
  { words: ["I", "would", "like", "some", "coffee"],        tier: 2 },
  { words: ["My", "son", "called", "me", "today"],          tier: 2 },
  { words: ["The", "doctor", "will", "see", "you", "soon"], tier: 3 },
  { words: ["I", "am", "going", "to", "the", "shop"],       tier: 3 },
  { words: ["Can", "you", "pass", "me", "the", "salt"],     tier: 3 },
  { words: ["The", "children", "are", "playing", "outside"], tier: 3 },
  { words: ["I", "did", "not", "sleep", "well", "last", "night"], tier: 3 },
  { words: ["We", "are", "having", "dinner", "at", "six"],  tier: 3 },
];

/* ------------------------------------------------
   FOLLOWING INSTRUCTIONS (Levels 4-5)
   A shape-and-colour board in the style of the Token Test.
   Understanding spoken instructions of growing length is the
   clearest measure of receptive (Wernicke's) recovery.
   `steps` are matched against the tokens the person taps.
   ------------------------------------------------ */
const TOKEN_COLORS = [
  { name: "red",    hex: "#d95a5a" },
  { name: "blue",   hex: "#5a7fd9" },
  { name: "green",  hex: "#6b9e7e" },
  { name: "yellow", hex: "#d9b45a" },
];
const TOKEN_SHAPES = ["circle", "square", "triangle"];

/* Instruction templates. {1} and {2} are filled with tokens the
   engine picks from the board, so no two rounds are identical. */
const COMMAND_TEMPLATES = [
  { tier: 1, text: "Touch the {1}.",                     steps: 1 },
  { tier: 1, text: "Point to the {1}.",                  steps: 1 },
  { tier: 2, text: "Touch the {1}, then the {2}.",       steps: 2 },
  { tier: 2, text: "Touch the {2} after the {1}.",       steps: 2 },
  { tier: 3, text: "Before touching the {2}, touch the {1}.", steps: 2 },
];

/* ------------------------------------------------
   WH-QUESTIONS (Level 6)
   Open questions about everyday life. There is no single right
   answer, so these are scored by the person or their helper.
   `hint` offers a starting word when they get stuck.
   ------------------------------------------------ */
const WH_QUESTIONS = [
  { q: "What is your name?",              hint: "My name is…" },
  { q: "Where do you live?",              hint: "I live in…" },
  { q: "What did you eat this morning?",  hint: "I ate…" },
  { q: "Where do you sleep?",             hint: "I sleep in the…" },
  { q: "What do you drink in the morning?", hint: "I drink…" },
  { q: "Who lives with you?",             hint: "I live with…" },
  { q: "What day is it today?",           hint: "Today is…" },
  { q: "What is the weather like today?", hint: "It is…" },
  { q: "What do you like to watch?",      hint: "I like…" },
  { q: "Where do you buy your food?",     hint: "I go to the…" },
  { q: "How are you feeling today?",      hint: "I feel…" },
  { q: "What did you do yesterday?",      hint: "Yesterday I…" },
  { q: "What is your favourite food?",    hint: "I like…" },
  { q: "Who do you call on the phone?",   hint: "I call…" },
];

/* ------------------------------------------------
   PICTURE DESCRIPTION (Level 6)
   A small scene of pictures. The person says whatever they can
   and ticks off the words they managed — connected speech, but
   with the words visible as support.
   ------------------------------------------------ */
const SCENES = [
  {
    title: "Breakfast",
    pics: ["☕", "🍞", "🥚", "🪑", "🕐"],
    targets: ["coffee", "bread", "egg", "chair", "clock"],
    prompt: "Tell me about breakfast.",
  },
  {
    title: "At the park",
    pics: ["🌳", "🐶", "👦", "☀️", "🏞️"],
    targets: ["tree", "dog", "boy", "sun", "park"],
    prompt: "Tell me what is happening in the park.",
  },
  {
    title: "Getting dressed",
    pics: ["👕", "🧦", "👟", "🧥", "🎩"],
    targets: ["shirt", "socks", "shoes", "coat", "hat"],
    prompt: "Tell me how you get dressed.",
  },
  {
    title: "At the shop",
    pics: ["🏪", "👜", "💵", "🍎", "🥛"],
    targets: ["shop", "bag", "money", "apple", "milk"],
    prompt: "Tell me about going to the shop.",
  },
  {
    title: "Bedtime",
    pics: ["🛏️", "🌙", "📖", "💡", "🦷"],
    targets: ["bed", "moon", "book", "lamp", "teeth"],
    prompt: "Tell me what you do before bed.",
  },
];

/* ------------------------------------------------
   STORY SEQUENCING (Level 6)
   Put the steps of an everyday routine in order, then say them
   aloud. Practises the order of events as well as the words.
   ------------------------------------------------ */
const STORIES = [
  {
    title: "Making a cup of tea",
    steps: ["Fill the kettle", "Boil the water", "Put in the tea bag", "Add the milk", "Drink the tea"],
  },
  {
    title: "Going out",
    steps: ["Put on your coat", "Find your keys", "Open the door", "Lock the door", "Walk down the street"],
  },
  {
    title: "Washing up",
    steps: ["Fill the bowl with water", "Add the soap", "Wash the plates", "Dry the plates", "Put them away"],
  },
  {
    title: "Making toast",
    steps: ["Take out the bread", "Put it in the toaster", "Wait for the toast", "Spread the butter", "Eat it"],
  },
];

/* ------------------------------------------------
   ENCOURAGEMENT
   Shown after answers. Errors in aphasia are not carelessness,
   so nothing here scolds — a miss is simply "let's try together".
   ------------------------------------------------ */
const PRAISE = [
  "That's it!", "Well done!", "Yes — exactly.", "Lovely.",
  "Good work.", "Perfect.", "You got it.", "Nice one.",
];
const ENCOURAGE = [
  "Let's try that one together.",
  "Nearly. Listen once more.",
  "That's a hard one. Here it is again.",
  "No problem — we'll come back to it.",
  "Take your time. Listen again.",
];
