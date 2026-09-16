# Marginalia

A research notebook that runs on your own laptop. You put PDFs in; it
reads them, answers questions about them with the page numbers attached,
draws the diagram, writes the deck, plans the reading, and scripts the
video — using open-weight models through [Ollama](https://ollama.com),
with no account, no key and nothing uploaded. It only touches the
network when you ask it to go and fetch a paper, and then only to the
open catalogues.

It is the shape of NotebookLM, built on three rules that the hosted ones
can't quite make:

1. **Nothing leaves the machine.** The files stay in
   `notebook/private/`, the model runs on your own silicon, and the
   server listens on 127.0.0.1 only. The one outward-facing tab is
   *Find papers*, which sends the words in its search box to arXiv and
   friends — never anything from your notebook.
2. **Every claim carries its page.** Answers, summaries, slides, plans,
   diagram boxes and narration all cite `[S1:p4]`, and clicking it shows
   the passage.
3. **The citations are checked.** After the model writes, each cited
   sentence is compared against the passage it named. Sentences that
   aren't there are marked in the text — not dropped, not hidden. That
   mark is the feature.

```bash
node notebook/server/server.mjs      # then open http://127.0.0.1:8099
node notebook/server/selftest.mjs    # 69 checks, no model and no network needed
```

Node 18 or newer. No dependencies, no build step, no `npm install`.

---

## Setting it up

**1. Install Ollama** — <https://ollama.com/download>, or `curl -fsSL
https://ollama.com/install.sh | sh` on Linux. Then pull two models: one
that writes, one that turns passages into vectors.

On a 24 GB laptop, this pair leaves plenty of room for everything else:

```bash
ollama pull qwen2.5:14b-instruct    # ~9 GB resident, the all-rounder
ollama pull nomic-embed-text        # ~0.3 GB, 768 dimensions
```

Other sensible writers, all offered in the model menu:

| Model | Resident | Why you'd pick it |
|---|---|---|
| `qwen2.5:14b-instruct` | ~9 GB | Best default at this size. Follows the citation format reliably. |
| `qwen3:14b` | ~9 GB | Newer, reasons before answering. Slower per token. |
| `gemma3:12b` | ~8 GB | Strong summariser, long context. |
| `phi4:14b` | ~9 GB | Reasoning and maths above its weight. |
| `mistral-nemo:12b` | ~7 GB | Fast, 128k context, good at structured output. |
| `llama3.1:8b` | ~5 GB | When you want the fans to stay quiet. |

And embedders: `nomic-embed-text` (768d, default), `mxbai-embed-large`
(1024d, a little better on long passages), `bge-m3` (multilingual),
`all-minilm` (tiny).

Quantisation is the thing to watch, not parameter count. A 14B model at
Q4 is about 9 GB; the same model at Q8 is about 16 GB and will not leave
room for the embedder, the browser and your editor at once.

**2. Start it.**

```bash
node notebook/server/server.mjs
```

It prints what it found — the library path, which models are installed,
and whether this machine can render video — then serves
<http://127.0.0.1:8099>.

**3. Use it.** Make a notebook, drop PDFs on the left, press *Build the
index*, and ask.

---

## What each tab does

**Ask** — a question against the sources. Retrieval is hybrid: BM25 and
vector similarity are run separately and their rankings fused, because
embeddings miss exact terms (a model number, a gene, an author) and
keywords miss paraphrase. The passages used are shown as chips above the
answer before a single token is written, so you can see what it was given
to work from. Each sentence is then checked against the passage it cites.

**Summarise** — brief, detailed, Q&A, timeline, or *critique*, which asks
what is well supported in the sources and what is asserted without
support.

**Diagram** — flowchart, concept map, architecture, timeline, argument
map or comparison. Every box must quote the page it came from, and the
quotation is verified before the diagram is drawn. A box whose evidence
isn't in your sources is drawn **dashed**, with the reason in the table
underneath. Layout is deterministic (layered, barycentre-ordered), so the
same graph always draws the same way. Export as SVG, or copy it as
Mermaid.

**Slides** — a deck written as an argument rather than a list of nouns:
one claim per slide, evidence under it, speaker notes with the page
numbers spelled out. Exports a real `.pptx` where the diagram is made of
native shapes, not a screenshot — so you can drag the boxes around in
PowerPoint, Keynote or LibreOffice.

**Study plan** — days, minutes a day, and a goal. Each session names what
to read by page, what question it should leave you able to answer, and a
few recall questions for later. It will tell you when your sources don't
cover the goal.

**Video** — a storyboard and narration script, always; a self-contained
HTML player that reads itself aloud through the browser's own speech
synthesis, always; and an actual video file when ffmpeg and a Chromium
are on the machine. Narration is spoken by `piper`, `espeak-ng` or macOS
`say` if one is installed — otherwise the file is silent and the captions
carry the words.

**Find papers** — the one part of Marginalia that leaves the machine,
and only when you press something. It searches four open catalogues —
arXiv, Crossref, OpenAlex and PubMed — merges what comes back into one
row per paper (the arXiv preprint and the published record are the same
work, so they are shown as one), and offers *Add* on the ones with a
free copy. It will also read the bibliography out of a paper you already
have, look each entry up by DOI, arXiv id or title, and offer those —
which turns "this cites something interesting" into a source in two
clicks. Nothing from your notebook is ever sent: only the words in the
search box, or the reference line being looked up.

Setting `MARGINALIA_CONTACT=you@example.com` puts a contact address in
the user agent, which is what Crossref and OpenAlex ask for in exchange
for their faster pool. It is optional and sent nowhere else.

**Notes** — anything worth keeping. Answers, summaries and plans go here
with one click, citations intact.

**OCR** — a PDF whose pages are pictures shows a *read it with OCR*
button. It drives `ocrmypdf` if you have it (best: it writes a new PDF
with a text layer under the image) or `tesseract` with poppler's
`pdftoppm`. Neither is bundled — an OCR engine is a hundred megabytes and
most PDFs don't need one — so if neither is installed the app names the
single command that would install it on your platform. Afterwards the
old index is discarded, because chunks describing text that no longer
exists would still be cited.

---

## How it works

```
notebook/
  index.html  style.css  js/          the page: no framework, no webfont, no CDN
  server/
    server.mjs      HTTP + SSE; the only process you run
    pdf.mjs         PDF → text, from scratch (see below)
    rag.mjs         chunking, BM25, vectors, rank fusion
    grounding.mjs   the prompts, and the verification after them
    diagram.mjs     schema-constrained graph → verified → laid out → SVG
    deck.mjs        slides
    study.mjs       study plans
    video.mjs       storyboard, player, ffmpeg rendering
    pptx.mjs        PowerPoint, written by hand
    zip.mjs         because a .pptx is a zip
    discover.mjs    arXiv, Crossref, OpenAlex, PubMed; bibliography lookup
    ocr.mjs         drives ocrmypdf or tesseract when a source is a scan
    ollama.mjs      the only file that talks to a model
    selftest.mjs    69 checks against stub models and stub catalogues
  private/library/  your notebooks — not committed, see private/README.md
```

**The PDF reader is not a library.** `pdf.mjs` indexes the objects,
inflates the compressed ones (including the object streams modern writers
hide half the file in), walks the page tree, interprets the content
stream's text operators, maps bytes back to characters through each
font's ToUnicode CMap, and puts the spaces and line breaks back from the
glyph positions and real advance widths. It detects two-column layouts by
looking for a vertical band of white space that almost no line crosses,
and reads each column to the bottom before starting the other — without
that, half the papers anyone reads come out as sentences spliced from
both columns, and those splices end up embedded, retrieved and quoted.

It also knows what it cannot do: a scan with no OCR layer comes back
empty and says so, and suggests `ocrmypdf in.pdf out.pdf`.

**Verification is a similarity test, not a proof.** `quoteSupport()`
scores a sentence against the passage it cites using word overlap and
three-word shingles, so word order counts for something. Above 0.5 is
"supported", above 0.22 "weak", below that "unsupported". It reliably
catches the thing that actually goes wrong — a fluent sentence that came
from the model's memory instead of from your page — and it will
occasionally mark a fair paraphrase as weak. Treat the marks as a reading
aid, not a verdict.

**Nothing is cached that could go stale into a citation.** Indexes are
kept on disk beside the source and rebuilt when the embedding model
changes; everything else is asked for again.

---

## If it feels slow

Three different things get called "slow", and they have different causes.

**The page takes seconds to appear.** It shouldn't — the page, the
stylesheet and the notebook list are a few milliseconds each. If it
does, something is blocking the server: check the terminal it is running
in. (An earlier version probed for ffmpeg, a browser and an OCR engine
on every health check, synchronously, which stalled everything; that now
happens once, in the background.)

**The first answer takes forever, then later ones are quick.** That is
Ollama loading the model: nine gigabytes off disk into memory. Marginalia
now asks it to keep the model resident for thirty minutes
(`OLLAMA_KEEP_ALIVE` changes it), so you pay that once rather than every
time you pause to think. `ollama ps` shows what is currently loaded.

**Every answer is slow.** That is the model itself, and it is a hardware
question rather than a code one:

- On a laptop with no usable GPU, a 14B model at four bits writes at
  roughly 3–6 words a second, and has to read the passages before it
  starts. `llama3.1:8b` or `qwen2.5:7b-instruct` are two to three times
  faster and, for answering from passages that are already in front of
  them, very nearly as good.
- Apple silicon uses the GPU automatically. On Windows and Linux, check
  that Ollama found your card: `ollama ps` names the processor it is
  using, and a line saying 100% CPU on a machine with a GPU means the
  driver or CUDA/ROCm runtime is missing.
- Indexing is the embedding model, not the writer, and runs once per
  source. A hundred-page paper is a minute or two.

---

## Privacy

`notebook/private/` is in `.gitignore`. Your PDFs, extracted text,
vectors, notes and exports live there and are never committed — which
matters in this repository in particular, because two scheduled workflows
push commits back to it every hour.

The server binds to 127.0.0.1 and refuses cross-origin requests. It
makes outward calls in exactly three places, each of them something you
pressed: fetching a URL you typed into *add a URL*, searching the
catalogues from *Find papers*, and downloading a paper you chose to add.
Your sources, notes, questions and answers are never part of any of
them.

---

## Known limits

- **Scanned PDFs need an OCR engine installed.** The button is there and
  drives it; the engine itself is `apt install ocrmypdf` (or `brew`, or
  `pip`) and is not bundled.
- **Tables and equations come out as text.** Readable, usually not
  beautiful. Figures are not read at all — no vision model is involved.
- **Three-column layouts and margin notes** can still interleave.
- **Diagrams are as good as the retrieval.** If the right passages aren't
  in the top twelve, the diagram will be thin. Tick specific sources to
  narrow it.
- **The verifier can't catch a true-sounding sentence that happens to
  paraphrase the right passage badly.** It catches invention, not
  subtlety.
- **Video rendering needs ffmpeg and a Chromium.** Without them you still
  get the storyboard, the script and the player.

- **A paywalled paper can only be shown as a record.** The catalogues say
  whether a free copy exists; when none does, there is nothing to fetch,
  and Marginalia will not pretend otherwise.
- **Reference matching is best-effort.** A DOI or an arXiv id is exact; a
  title is matched on word overlap, and an entry with neither and an
  unusual title will simply not resolve.

## Next

Worth building, roughly in order of how much they'd improve a day's work:

- Reading figures with a local vision model (`qwen2.5-vl`, `llava`) so a
  diagram in a paper can become a diagram in a notebook.
- Following the citation graph outward more than one hop, with a view of
  what everything in the notebook cites in common.
- Cross-notebook search, for when the answer is in something you read
  last year.
- Anki export from the recall questions the study plan already writes.
- A model-comparison view: same question, two models, answers side by
  side with their grounding scores.
