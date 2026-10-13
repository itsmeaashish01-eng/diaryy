# Neuroangiography Atlas

A six-vessel cerebral angiography teaching atlas. Pick a vessel (right or
left ICA, ECA or vertebral), press **Inject**, and watch contrast move
through that vessel's territory: arterial filling, capillary blush, venous
drainage and washout, with labels attached to the vessels.

Open `index.html`. There is no build step, no dependency and no network
access. The simulated mode works immediately; nothing has to be uploaded.

```bash
python3 -m http.server 8000      # then http://localhost:8000/angio/
node angio/selftest.mjs          # offline checks of the model
```

## Three kinds of content, kept apart

| Tab | What it is | What it is not |
|---|---|---|
| **Simulated injection** | A teaching model of contrast transport drawn on an original **schematic** vascular graph. Every frame carries a "SIMULATED · not DSA · not patient anatomy · timing illustrative" banner. | Not a recording, not a projection of a real patient, not measured timing. |
| **Recorded DSA** | Plays real angiographic frames you load from disk, after you state the source, licence, injected vessel, projection and phases present. Shows labels only from a reviewed per-frame annotation file. | Nothing is bundled (see [Data sources](#data-sources-checked)). It never generates, interpolates or relabels frames. |
| **3D reconstruction** | Empty, and says why. | The 3D view in the simulated tab is the schematic model, not a reconstruction. |

## Why this approach

The request allowed replacing the proposed method if something worked
better. Choices that differ from "load a mesh and animate it":

- **A vascular graph, not a mesh.** Each vessel is a centreline with a
  radius, and vessels meet at shared junction nodes. So connectivity is
  real: contrast can only reach a branch through its parent, and the tests
  can check that. A surface mesh shows shape but carries no "this flows
  into that", which is why recolouring a mesh can't show a bolus front.
- **Transport on the graph.** Arrival time at every point is the fastest
  antegrade path from the catheter tip. The concentration at each point is
  a dispersing bolus, so you see a front advance, branches fill in order,
  and the vessel wash out behind it. Capillary blush and venous filling
  follow from the end-branches. The state at time *t* is a pure function of
  *t*, so playback, scrubbing and restart all agree exactly.
- **One coherent schematic instead of stitched patient meshes.** No openly
  licensed model found covers both carotid systems, all eight ECA branches
  and the vertebrobasilar system in one patient (see below). Mixing patients
  would misrepresent anatomy. A single editable schematic, clearly labelled
  as one, is more honest and covers every territory asked for.
- **Labels anchored in 3D.** Each label is fixed to a point a set fraction
  along its vessel and is re-projected every frame, so it follows rotation
  and zoom by construction. A greedy layout places the leader lines and
  avoids overlaps. The browser test measures the anchor-to-vessel distance
  after rotating and zooming: 0.00 px.
- **Orientation is computed, not assumed.** The R/L/A/P/S/I letters at the
  canvas edges come from the camera matrix. The self-test proves that AP
  puts the patient's right on screen-left, that "Right lateral" puts the
  face on screen-right, and so on.
- **Canvas 2D, no WebGL library.** About 4,600 graph samples draw
  comfortably at 60 fps, and this keeps the repository's no-dependency rule.

## Assets

| Asset | Source | Licence | Anatomical coverage | Orientation | Modifications |
|---|---|---|---|---|---|
| Schematic vascular model (`js/anatomy.js`) | Original work for this atlas, written from standard textbook anatomy (Bouthillier ICA segments; usual ECA, circle of Willis and vertebrobasilar branching). **Not patient-derived.** | Same as this repository | Bilateral CCA (catheter route), ICA C1–C7, ophthalmic, PCom, AChA, A1/ACom/A2, pericallosal, callosomarginal, frontopolar, Heubner, M1, lenticulostriates, anterior temporal, M2 trunks, five grouped MCA cortical branches; ECA plus superior thyroid, ascending pharyngeal, lingual, facial, occipital, posterior auricular, maxillary (with MMA), superficial temporal; VA V2–V4, PICA, AICA, SCA, basilar, P1, P2, thalamoperforators, calcarine, parieto-occipital, PCA temporal; schematic dural sinuses and deep veins. | Patient RAS in mm (+x right, +y anterior, +z superior), origin near the sella. Right side written once and mirrored, so the model is symmetric. | — |

Nothing from a patient dataset is incorporated. Patient models would each
need their own row and must not be merged.

The **Model coverage** panel in the app lists what is and is not modelled.
Structures that are absent or uncertain are named there and in
`anatomy.js` (`COVERAGE`, `MISSING`). Main gaps: cavernous ICA branches;
ECA–ICA/vertebral anastomoses; ECA and orbital venous drainage;
anatomical variants other than fetal PCA; spinal arteries; posterior
choroidal arteries. MCA cortical branches are grouped into five.

## The teaching model

Every number is in `js/model.js`, with comments explaining it:

- **Speed** grows with radius: `v = clamp(165·r, 90, 420)` mm/s.
- **Bolus**: a smoothed box as long as the injection (ICA 1.6 s, VA 1.4 s,
  ECA 1.2 s), blurring with transit time.
- **Capillary transit**: 2.6 s from end-artery to vein; veins at 140 mm/s.
- **Mixing** happens only where unopacified blood joins. Each of these is
  a slider under *Teaching assumptions*:

| Assumption | Default | Effect |
|---|---|---|
| ACom cross-filling | 30% | A carotid run faintly fills the opposite A2. Ipsilateral A1 only. |
| ICA→PCA via PCom | 35% | A carotid run shows the PCom and a faint PCA. *Fetal PCA* sets this to 100%. |
| Vertebral washback up PCom | 30% | Stops at the ICA. The carotid territory never fills from a vertebral run. |
| Basilar mixing | 65% | One vertebral's contrast meets the other vertebral's clear blood. |
| Reflux down the opposite V4 | 60% | Fills the opposite PICA, and no further. |
| Fetal PCA (both sides) | off | PCom 100%, P1 15%. |

An ECA run never fills intracranial arteries, because the anastomoses are
not modelled. Its venous drainage is not modelled either, so its last
phase is labelled "Washout (venous drainage not modelled)", not "Venous".

## Data sources checked

Checked 2026-10-13. These were research leads, not confirmed six-vessel
studies. None was incorporated.

| Source | What it actually contains | Licence | Why not used |
|---|---|---|---|
| [DSCA](https://github.com/jiongzhang-john/DSCA) (data: Zenodo 11255024) | Recorded DSA, 58 patients, 224 sequences: ICA 126, ECA 55, VA 43; AP and lateral; left and right hemispheres; vessel masks. **Arterial phase only** (capillary and venous frames removed by the authors). | Not stated on GitHub; Zenodo record unreachable from the build environment → **unverified** | Licence unconfirmed. Per-sequence vessel, side and projection labels unconfirmed. Download blocked (`zenodo.org` denied by the environment's network policy). Even once obtained, it can supply arterial-phase cine only. |
| [DIAS](https://zenodo.org/records/11637181) (code: [lseventeen/DIAS](https://github.com/lseventeen/DIAS), Apache-2.0) | Recorded DSA sequences with intracranial artery segmentation masks and scribbles (~120 sequences, 60 fully labelled). | CC BY 4.0, per the Zenodo record's indexed metadata. The page itself could not be opened. | Per-sequence injected vessel, side and projection not documented in the material that could be read. Masks are segmentation, not named-branch annotations. Download blocked here. |
| [OpenNeuro ds005096](https://github.com/OpenNeuroDatasets/ds005096) | TOF-MRA, 63 patients / 85 aneurysms; aneurysm and parent-artery segmentations, STLs, Slicer scenes. | CC0 (`dataset_description.json`) | Not DSA, no injection, no ECA or neck. Segmentations are aneurysm-focused. Usable later for a per-patient 3D reconstruction of the circle of Willis. |

**To add a recorded sequence**, the minimum is: a confirmed licence; the
injected vessel and side; the projection; the phases actually present; and,
for labels, per-frame reviewed positions. Until then, use the loader on the
Recorded DSA tab with your own frames.

### Annotation file for recorded frames

```json
{
  "reviewed": true,
  "reviewer": "initials or name",
  "frames": {
    "0": [{ "label": "R ICA C4", "x": 0.41, "y": 0.55 }],
    "1": [{ "label": "R ICA C4", "x": 0.41, "y": 0.54 }]
  }
}
```

`x` and `y` are fractions of the image width and height. A frame without
an entry shows no labels. Positions are never carried between frames.

## Verifying

- `node angio/selftest.mjs`: 37 offline checks. Graph connectivity. Each
  injection's origin, the territory it fills and the territories it must
  not fill. ACom/PCom shares. Vertebral reflux stopping at PICA. ECA with
  no venous phase. Laterality of every point. View orientation letters.
  Antegrade arrival order. Bolus front, washout, venous phase. Scrub
  determinism. Label anchors on their vessels after rotation.
- In a browser: each of the six buttons moves the catheter tip and changes
  the standard view (AP for ICA, ipsilateral lateral for ECA, Towne for
  vertebral). Inject plays, scrubbing shows any moment, Restart clears.

## Files

| File | Role |
|---|---|
| `js/anatomy.js` | The schematic model: junctions, vessels, coverage lists |
| `js/model.js` | Graph building, the six injections, transport, phases |
| `js/view.js` | Camera, view presets, orientation letters |
| `js/labels.js` | Label layout |
| `js/render.js` | Canvas drawing and hit-testing |
| `js/dsa.js` | Recorded DSA tab: checked sources, local loader |
| `js/app.js` | Controls and wiring; state in the URL hash (`#inj=L_VA&view=towne&t=2.4`) |

Scripts hang off `window.AG`, and their order in `index.html` matters.

## Moving it into another project

The folder is self-contained. Copy `angio/` anywhere a static file can be
served, or into an existing atlas as a sub-page. It needs no server code
and touches nothing outside `window.AG`.
