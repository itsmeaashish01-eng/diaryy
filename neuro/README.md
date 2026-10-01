# Neuro Multiverse

A neurology education site for students: new evidence, what's cool in neurology,
and **Quantum Stroke** (stroke neuroanatomy, recent trials, and the code-stroke
workflow). It also previews the Neurology Atlas and the Stroke App, with free
and Pro plans.

Open `index.html` in a browser. It's plain HTML, CSS and JS, with no build step.

## Sections

| Section | What's there |
|---|---|
| Hero | Animated neural network, links to Learn and Quantum Stroke |
| Time is brain | Live count of neurons lost at 1.9 million per minute |
| Learn | Six tracks (localisation, exam, headache, epilepsy, movement, neuromuscular) |
| What's cool | BCI speech, glymphatics, p-tau217, SMA therapy, focused ultrasound |
| Quantum Stroke | Vascular territory explorer, 8 trial briefs, code-stroke timeline, last-known-well window check |
| Atlas & App | Free atlas plate (brainstem rule of 4), locked Pro plate, Stroke App mock-up |
| Plans | Student (free), Pro, Institution |
| Instagram | Six post tiles linking to the Neuro Multiverse account |
| Sign-up | Email + role form for the monthly round-up |

## Things to set

At the top of `script.js`:

- `instagramHandle` — your Instagram username without the @.
- `signupEndpoint` — the URL the sign-up form posts `{ email, role }` to
  (Formspree, Buttondown, Mailchimp, or your own API). Until it's set, the form
  tells visitors sign-ups open soon.

Prices on the Plans section ($6/month Pro) are placeholders.

Content to edit:

- Vascular territories: `TERRITORIES` in `script.js`
- Trials: `TRIALS` in `script.js`
- Window check rules: `windowOptions()` in `script.js`

Everything here is for education only, not clinical decision support.
