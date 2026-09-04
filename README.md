# My Daily Diary + Speak Again

Two small offline web apps that share a look and a repository. No build step,
no server, no accounts — open the HTML file in a browser and everything is
saved locally.

| File | What it is |
| --- | --- |
| `index.html` | **My Daily Diary** — a year of daily entries, moods, to-dos and notes. |
| `therapy.html` | **Speak Again** — graded speech and language practice for people living with aphasia. |

The diary links to the practice app from the 🗣 button in its top bar, and the
practice app links back with the ✎ button.

---

## Speak Again — aphasia speech practice

### Please read this first

This is **home practice, not treatment.** It cannot diagnose anything, and it is
not a substitute for a speech and language therapist. Aphasia after a stroke or
brain injury recovers slowly and unevenly, over years rather than weeks, and
which exercises are worth someone's limited energy is a clinical judgement.
If you are working with a therapist, show them the levels and ask which ones to
practise; **Settings → Save a copy** writes a JSON file of the person's progress
that can be taken to an appointment.

Aphasia affects language, not intelligence. Nothing in this app should be read
as a test of the person using it.

### What it does

Practice is arranged as six steps, and only one step is open at a time. Each
step names what is being rebuilt and draws on the exercises that suit it:

| Level | Step | What it practises |
| --- | --- | --- |
| 1 | Sounds & Letters | single sounds, telling similar sounds apart |
| 2 | First Words | the most common everyday words |
| 3 | Words & Meaning | longer words, and what words have in common |
| 4 | Two Words Together | phrases, sentence endings, one-step instructions |
| 5 | Whole Sentences | building, reading and following full sentences |
| 6 | Questions & Talking | answering questions, describing, telling a story |

A session is about ten turns and takes roughly five minutes — deliberately
short, because attention tires quickly after a stroke. The next level opens
once the last twenty-four turns at the current one average 80% or better; any
level already reached can also be chosen by hand from the home screen.

### The two profiles

At the start the app asks which is harder. It changes the *mix* of exercises,
not what is available:

- **Getting words out (Broca's / non-fluent aphasia)** — understanding is
  largely intact but speech is slow and effortful, and grammar drops out.
  Practice leans on naming, repeating, finishing sentences and rebuilding word
  order.
- **Understanding words (Wernicke's / fluent aphasia)** — speech flows but words
  go astray, and following others is hard. Practice leans on listening,
  matching a spoken word to a picture, following instructions, and recording
  yourself to hear the difference between what was meant and what came out.
- **Both / not sure** — an even mix. Most people are somewhere in between, so
  this is a safe starting point.

### The sixteen exercises

*Listening:* find the letter · same or different · find the picture · yes or no ·
odd one out · follow the words · hear yourself

*Speaking:* say the sound · listen and repeat · name the picture · finish the
sentence · build a sentence · read out loud · answer a question · tell me about
it · put it in order

"Follow the words" is a Token Test-style board of coloured shapes, which is a
long-standing way of measuring how much spoken instruction someone can hold on
to. "Hear yourself" records the attempt and plays it back next to the model,
because in fluent aphasia the difficulty is often not making sounds but
noticing that the wrong ones came out.

### How it helps rather than tests

- **A hint ladder, not a right/wrong buzzer.** Pressing 💡 gives a clue about
  the meaning, then the first sound, then the first part of the word, then the
  whole word to say together. This is the cueing hierarchy used in naming
  therapy — the point is to get the word out, not to catch someone failing.
- **Errorless practice** (on by default, switchable in Settings) shows and says
  the right word *before* asking for it, so early on there is no chance to
  rehearse a wrong one.
- **Three outcomes, none of them failure:** on your own, with a hint, or
  together. "Together" still counts as a turn taken.
- **Nothing is timed** and nothing flashes. Words that go badly quietly come
  back sooner; words that go well are rested.
- **The person always has the last word on their own speech.** Browser speech
  recognition copes badly with aphasic speech, so it is off by default; when
  turned on it only ever *offers* a guess, which the person or their helper can
  overrule.

### Settings worth knowing about

Speaking speed (0.4×–1.2×, slow by default), the voice, text size, how many
pictures to choose between (2, 3 or 4 — fewer is easier), errorless practice,
computer listening, and the practice mix. The 🤝 button in the top bar opens a
short guide for whoever is sitting with the person, plus a plain-language
read-out of how each level is going and which words to come back to.

### Running it

Open `therapy.html` in any modern browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000/therapy.html
```

Speech output uses the browser's built-in voices. Recording yourself needs
microphone permission; if that is refused the exercise falls back to listening
to the model and saying it afterwards. Progress lives in `localStorage` under
`aphasiaTherapyData` and never leaves the device.

### Adding your own words

Everything drilled on lives in `therapy-content.js`, apart from the engine.
A word needs a picture, a category, a syllable count and a difficulty tier:

```js
{ w: "kettle", e: "🫖", cat: "kitchen", syl: 2, tier: 3 }
```

The optional `alive`, `edible`, `drink` and `big` flags are what the yes/no
questions are generated from. Personally relevant words — names, places, a
favourite meal — are usually worth more than any stock list, so this file is
meant to be edited.
