# Neurovascular Atlas — 3D neuraxis

The atlas is a single self-contained HTML file: 97 mapped structures, 15
locator plates, 26 vascular patterns and a 19-chapter reference book, opened
from a folder with no server and no network. This folder adds a third
dimension to it without changing any of that.

```
open atlas/Neurovascular-Atlas.html          # macOS
xdg-open atlas/Neurovascular-Atlas.html      # Linux
```

Keep `Stroke-Localization-Notes.pdf` beside it so the app's download links
work. `Neurovascular-Atlas.pdf` — the 129-page illustrated book — is not in
this repository; drop it in the same folder if you have it.

## What the 3D view adds

Every numbered marker in the atlas already carries three coordinates: which
plate it is on, how far it sits from the midline, and how deep it lies within
the plate. That is enough to stand the plates up in space and put the markers
back on them.

**06 · 3D neuraxis** is a sixth view alongside the existing five. The fifteen
plates are placed along the neuraxis in rostrocaudal order, each in the plane
its 2D map represents — transverse sections stacked by level, the cortical
surfaces as sagittal projections, the cerebellum as a dorsal projection behind
the brainstem. Drag to rotate, wheel or pinch to zoom, shift-drag to pan, click
a marker to inspect it. Arrow keys rotate the model when the canvas has focus,
and every structure is reachable from the lists beside it without a pointer.

Each plate keeps the landmarks its 2D map draws — the olive, the aqueduct, the
basis pontis, the limbs of the capsule, the cerebellar folia — so a plate in
the model and the same plate on the flat map read as one drawing. Two of them
carry more than orientation: the medullary decussation arcs and the internal
arcuate fibers sit directly under the dashed midline link that marks the
crossing.

The thing a flat plate cannot show is a **course**: a structure marked on
several plates is drawn as a line through them, so the corticospinal tract can
be followed from the posterior limb through the crus, the basis pontis and the
pyramid. Where the atlas names a classic decussation, the crossing is drawn as
a dashed link across the midline at that plate — the pyramidal and sensory
decussations, the superior cerebellar peduncle, the trochlear nerve. Every
other structure keeps its crossing rule as text, because inventing geometry
for it would be inventing anatomy.

Side, language dominance, the lesion simulation and the 26 vascular examples
all work as they do in the lesion explorer, and use the same text: a lesioned
structure turns red on every plate it crosses, which is what makes a vascular
pattern legible as a shape rather than a list.

The lesion explorer's map panel also gets a **2D / 3D** switch. In 3D it shows
the plate being studied among its own neighbours, and it drives the explorer
rather than duplicating it: clicking a marker there selects it in the app,
exactly as clicking the flat map would.

It is a schematic montage, and says so on screen. Relative plate sizes,
spacing and marker positions are teaching approximations — not MRI
coordinates, not infarct volumes, and not a validated localization model.

## How it is built

`Neurovascular-Atlas.html` is the shipped file and is what you open. It is the
original atlas plus an injected block, produced by:

```
node atlas/build.mjs                       # rebuild in place
node atlas/build.mjs in.html out.html      # or from a fresh copy
```

The build makes four small anchored edits to the app bundle — exporting its
data, colours, text helpers and plate outlines on `window.__ATLAS__`, adding
the nav entry, and rendering an empty host element for the new view — then
appends `src/neuraxis-3d.css` and `src/neuraxis-3d.js` with `src/geometry.mjs`
and `src/accents.mjs` inlined. The anatomy is never copied: the 3D view reads the atlas's own data,
so the two views cannot drift apart. Running the build on its own output is a
no-op, so the shipped file can be rebuilt in place.

There is no library behind the model. Canvas 2D, a hand-rolled camera and a
painter's-algorithm sort keep the file dependency-free and offline, which the
atlas requires; the plate outlines are sampled with the browser's own SVG path
implementation rather than a path parser.

## Tests

```
node atlas/selftest.mjs
```

Offline and dependency-free, like the rest of this repository. It checks the
geometry that places plates and markers — that the stack climbs, that patient
left stays on one side, that the plates drawn anterior-up are treated
differently from the dorsal-up sections, that the two-part outlines are split
before sampling, that projection and rotation behave — and that the build's
anchors still match the bundle, that the injection appears exactly once, and
that nothing in the shipped file reaches for the network.
