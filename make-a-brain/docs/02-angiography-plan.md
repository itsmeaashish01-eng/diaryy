# Angiography simulator: plan and status

Status: **prototype for clinical-lead review.** Date: 2026-10-11.
Prototype: `angio-prototype/index.html`. Open it in a browser; no server needed.

The goal is a real-time biplane DSA simulator with right and left ICA, ECA
and vertebral injections. It plays a cine through the arterial, capillary and
venous phases, and every branch is labelled.

I'm taking the "3rd phase" to mean the **capillary (parenchymal) phase**, so the
three phases are arterial, capillary and venous. Please correct me if you meant
something else, such as the late venous or sinus phase.

## 1. What works today

| Part | Status | Data |
|---|---|---|
| Biplane AP + lateral layout, R/L/A/P/S/I markers | Working | — |
| Real-time cine: 1 s on screen = 1 s after injection; optional 3 frames/s stepping; scrub bar; keyboard controls | Working; checked (1.0 s → 3.0 s after 2 s of play) | — |
| Injections: R/L ICA, R/L vertebral | Working | — |
| **Capillary phase blush** per injection | Working, **real data** | Liu et al. 2023 territories atlas, CC BY-SA 4.0 |
| Variants: fetal PCom, AComm cross-fill, anterior choroidal + thalamoperforators | Working (they change which territories fill) | Same |
| Territory name on hover or tap | Working | Same |
| Blush weighted by grey/white matter (GM + 0.5 x WM) | Working | ICBM 2009a tissue maps (copy bundled with nilearn) |
| Alignment check: territory atlas vs template brain | **Dice 0.929** at the assumed MNI origin. The best integer shift (−2 mm in x) only reaches 0.931, so the atlas is within the 2 mm limit. The build fails below 0.9 | — |
| Angio-monitor display: round field, frame counter, pulsed 3 f/s, simulated detector noise, time-density curve | Working (noise and blur are display effects only) | — |
| Build-time orientation test (AP: patient right on the viewer's left; lateral: A/P) | Working. It caught a real A/P flip in the lateral view, which is now fixed | — |
| **Arterial phase vessel tree with branch labels** | **Not built.** No dataset reachable (see §3) | — |
| **Venous phase: veins and sinuses** | **Not built.** No dataset reachable | — |
| **ECA injections** | **Disabled.** ECA territory (scalp, dura, face) is outside every brain atlas | — |

## 2. How the simulation will work once vessel data is in

1. **Geometry:** a labelled 3D centreline graph with a radius at each point
   (e.g. SWC or VTP files), in MNI 2009c. The geometry stays exactly as the
   source gives it.
2. **Projection:** each frame is a digitally reconstructed radiograph. For each
   pixel, contrast density is the ray's path length through the opacified
   lumen. Because the tree is 3D, any C-arm angle is free. That gives true
   Towne/transorbital AP, lateral and working obliques with a rotation slider.
   Today's AP is a straight AP; real vertebral runs are usually Towne-angled.
3. **Timing:** arrival time at each node is the path length from the catheter
   tip divided by the flow speed for that vessel class. Washout per node follows
   a gamma-variate curve. The capillary blush in each territory starts when
   contrast reaches its feeding branches, and veins fill after a set transit
   delay. **All speeds and delays are model parameters. They are not patient
   measurements, and you will sign them off.**
4. **Labels:** the label for every segment comes from the dataset's annotation,
   never assigned by hand. A segment the source doesn't label stays unlabelled.

Branches to label once data allows. **Each one depends on the dataset
actually containing it:**

- **ICA:** cervical, petrous, cavernous (meningohypophyseal trunk, inferolateral trunk), ophthalmic, superior hypophyseal, PCom, anterior choroidal, terminal bifurcation.
- **ACA:** A1, AComm, recurrent artery of Heubner, A2, orbitofrontal, frontopolar, callosomarginal, pericallosal.
- **MCA:** M1 and the lateral lenticulostriates, M2 superior and inferior divisions, M3/M4 cortical branches.
- **Vertebrobasilar:** V1–V4, PICA, anterior spinal, basilar, AICA, pontine perforators, SCA.
- **PCA:** P1 thalamoperforators, P2 medial and lateral posterior choroidal, thalamogeniculate, temporal branches, calcarine, parieto-occipital.
- **ECA:** superior thyroid, ascending pharyngeal, lingual, facial, occipital, posterior auricular, maxillary (middle meningeal and accessory meningeal), superficial temporal.
- **Veins:**
  - Sinuses: superior and inferior sagittal, straight, torcular, transverse, sigmoid, jugular bulb, cavernous, superior and inferior petrosal.
  - Superficial veins: superficial middle cerebral, vein of Trolard, vein of Labbé.
  - Deep veins: internal cerebral, basal vein of Rosenthal, vein of Galen.
  - Posterior fossa veins: precentral cerebellar, vermian, petrosal.

## 3. Candidate datasets (none could be downloaded here)

This environment can reach only GitHub, PyPI and npm. NITRC, Zenodo, figshare,
Kitware and brain-development.org are all blocked.

| Dataset | Gives | Licence | Problem |
|---|---|---|---|
| **BraVa** (cng.gmu.edu/brava; NITRC) | Hand-traced arterial trees from about 61 healthy adults, SWC format, the six main trees off the circle of Willis | **Unverified** | Native subject space. Need to check for MNI alignment and branch-level labels |
| **TopBrain 2025** (Zenodo) | Whole-brain vessel labels. MRA labels include ECA, STA, MMA and maxillary; CTA labels include veins and sinuses | OpenData Swiss: credit the source; commercial use needs permission (reported) | 25 training cases; label lists need checking per modality |
| **TopCoW** (Zenodo) | Circle of Willis, 13 labelled parts | Reported as non-commercial; unverified | Circle of Willis only |
| **Statistical cerebral artery atlas** (Mouches & Forkert 2019, *Sci Data*) | Population artery atlas in MNI space | Unverified | May be vessel probability only, without labelled branches |
| **VENAT** (Huck et al. 2019, figshare) | Venous atlas from 7T QSM, 20 subjects | Unverified (preprint is CC BY-NC-ND) | May lack the dural sinuses |
| **IXI MRA** | Raw TOF MRA from about 570 healthy subjects | CC BY-SA 3.0 (from memory) | Images only. We would have to segment and label vessels ourselves, which needs your decision and review |

**Best route:** BraVa for the ICA and vertebral trees, TopBrain for ECA branches
and veins, and the territory atlas (already in) for the capillary phase. This
needs either network access to those hosts, or you to download the files and
add them to the repo.

## 4. Statements I'm unsure of: please check

- The 2:1 grey-to-white matter blood volume ratio used to weight the blush is approximate, from memory.
- The tissue maps are the symmetric 2009a template, while the territory atlas grid is the older standard MNI grid. Overlap is good (Dice 0.93), but this is not a voxel-exact registration.

- Phase windows in the prototype: arterial 0–2.5 s, capillary 2.5–4.5 s, venous from 4.5 s. Capillary blush curve: starts at 1.5 s, peaks at 3.5 s. These are approximate teaching values from memory, not sourced. A standard reference such as Osborn, *Diagnostic Cerebral Angiography* (2nd ed., 1999) should replace them.
- Vertebral injection fills both PCAs, and the contralateral inferior cerebellar territory fills by reflux. The second part varies between patients; it is the prototype's default.
- Default display: AP with patient right on the viewer's left; lateral with anterior on the viewer's left. Please confirm your department's convention. The lateral view has a toggle.
- Territory atlas caveats: the territories are drawn from where infarcts occurred, not from perfusion. Grey and white matter are treated as having the same blood volume. AICA and PICA are merged. Anterior choroidal is mixed with thalamoperforators.
- I have not checked any dataset licence in §3 against its primary source.
