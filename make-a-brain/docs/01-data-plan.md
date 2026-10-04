# Make a Brain — Deliverable 1: data plan

Status: **draft for clinical-lead review**. Nothing here is built yet.
Date: 2026-10-04.

Each licence or fact has a status:

- **Checked**: I read it in the primary file myself this session.
- **Reported**: a secondary source (search index, README) says so, but I could not open the primary page from this environment (nature.com, ncbi, OSF and G-Node are blocked by the network proxy).
- **From memory**: my recollection, not checked. It must be confirmed before we ship.

---

## 1. Key decision: one coordinate space

The 2 mm QC rule, the slice mode and the lesion localizer all need every mesh
in the **same** space as the MRI underneath it. So I recommend:

> **Canonical space: ICBM 2009c Nonlinear Asymmetric (MNI152NLin2009cAsym), mm, RAS+.**
> Every structure must come from a dataset already in that space, or from a published, documented transform into it.

Consequences:

1. **BodyParts3D and Z-Anatomy can't be the main anatomy layer.** Each is a single
   subject in its own coordinate frame, with no published transform to MNI. Putting
   them into MNI space would need a non-rigid registration that we would have to
   write ourselves. That moves the anatomy, which breaks accuracy rule 2, and they
   would not pass the 2 mm check. There is also a rule-1 problem. BodyParts3D
   meshes were drawn as polygon models from one subject's scan (Mitsuhashi et al.
   2009). Z-Anatomy builds on BodyParts3D and adds hand-modelled parts. Both
   involve some sculpting, from memory, to be confirmed. My recommendation is to
   leave them out of v1. At most, use them later as a separately labelled context
   layer ("illustrative, single subject, not to scale with the MRI") that cannot
   be used for snapping or lesion work. **This is your call.**
2. **SPL/NAC atlas (Open Anatomy):** same problem. It is a single subject in native space. I would hold it for v2, and its licence is unverified (see §4).
3. **Volumetric atlases get meshed.** Marching cubes on a published label volume
   produces geometry from the data, not new geometry. We keep the vertices in mm
   at their atlas positions. Smoothing is limited, and the pipeline reports the
   Hausdorff distance between the smoothed mesh and the raw voxel boundary for
   every structure. Any structure over 1 mm fails.

### Left/right convention (fixed for every view)

- Atlas data is RAS+: +x = **patient right**, +y = anterior, +z = superior.
- glTF is right-handed and Y-up. The mapping is **glTF (x, y, z) = (MNI x, MNI z, −MNI y)**. That is a proper rotation with no mirroring, so patient right stays +x.
- Units stay in **mm** (no 0.001 scale). The scale is recorded in the manifest so nobody "fixes" it.
- 3D views show the patient as seen from the named direction. Every view carries permanent **R / L / A / P / S / I** markers that are computed from the camera, not hard-coded.
- 2D MRI slices default to **radiological convention** (patient left on screen right), with a neurological toggle. The current convention is always written on screen.
- Every build runs an automated L/R test: the centroid of each "left" mesh must have MNI x < 0.

---

## 2. Datasets

| # | Dataset | Supplies | Space / resolution | Licence | Licence status |
|---|---|---|---|---|---|
| A | **ICBM 2009c / 2009b NLin Asym** (Fonov et al. 2009, 2011) | MRI for slice mode; QC reference | 2009c at 1 mm, 2009b at 0.5 mm, same space | MNI permissive licence (copy, modify, redistribute with copyright notice) | From memory |
| B | **CIT168 subcortical atlas** (Pauli, Nili & Tyszka 2018) | Striatum, pallidum, STN, SN, RN, accumbens | 0.7 mm; MNI152 2009c version provided (from memory) | Paper CC BY 4.0 (reported). Data on OSF (doi:10.17605/OSF.IO/JKZWP), data licence not yet seen. Crowd-sourcing repo is MIT (checked) | **Open item** |
| C | **CerebrA** (Manera et al. 2020) | Thalamus, cerebellum, vermis, ventricles; DKT cortex later | ICBM 2009c, 1 mm (reported) | Search index lists both **CC0** and **CC BY-ND 4.0**. My guess is that CC BY-ND applies to the bioRxiv preprint and CC0 to the data. **ND would ban meshing**, so this must be confirmed | **Blocking open item** |
| D | **FreeSurfer brainstem module** (Iglesias et al. 2015), run by us on the 2009c T1 | Midbrain, pons, medulla, superior cerebellar peduncle | Sub-mm output | FreeSurfer licence (free, registration needed). The output is our derived data, with MNI licence terms | From memory |
| E | **Arterial territories atlas** (Liu et al. 2023, *Sci Data* 10:74) | v2 vascular territories | 1 mm, 181×217×181 grid (checked) | **CC BY-SA 4.0** (checked, LICENSE file) | Checked |
| F | **HCP-1065 tractography atlas** (Yeh 2022, *Nat Commun* 13:4933) | v2 pathways (population average) | ICBM 2009a NLin Asym | CC BY-SA 4.0 (reported) | Reported |
| G | **FreeSurfer thalamic nuclei** (Iglesias et al. 2018) | v2 thalamic nuclei | Template-run, sub-mm | As D | From memory |
| H | **Brainstem Navigator** (Bianciardi lab) / **Harvard AAN atlas** (Edlow et al. 2012) | v2 brainstem nuclei | MNI | Unknown | **Unverified** |
| I | **SUIT dentate atlas** (Diedrichsen et al. 2011) | Dentate nucleus | SUIT/MNI | Unknown (possibly non-commercial) | **Unverified** |
| J | BodyParts3D (CC BY-SA 2.1 JP), Z-Anatomy (CC BY-SA 4.0) | Context layer only, if you approve | Native single-subject | As stated in your brief | Not rechecked |
| K | SPL/NAC Brain Atlas (Open Anatomy) | Held for v2 | Native single-subject | Unknown | **Unverified** |

**ShareAlike:** anything built from E or F (and J) must ship as CC BY-SA 4.0. The app code can use a separate licence. The manifest records the licence for each asset.

**Avoid:** Harvard-Oxford and XTRACT (FSL licence, non-commercial) and the Morel thalamic atlas (not open).

---

## 3. The 20 structures for deliverable 3

Bilateral structures get separate L and R meshes (34 meshes in all: 14 bilateral pairs and 6 midline structures). Names are
TA2-style. **I have not checked any TA2 term against the FIPAT 2019 text.** They
are flagged for checking in deliverable 2.

| # | Structure (TA2 English) | Common aliases | Group | Source | Limitations to show |
|---|---|---|---|---|---|
| 1 | Caudate nucleus | caudate | Striatum | B | Population average (168 subjects). Tail is thin and may break into pieces at 0.7 mm |
| 2 | Putamen | — | Striatum | B | Population average |
| 3 | Nucleus accumbens | ventral striatum (loosely) | Striatum | B | Boundary with caudate/putamen is a protocol choice, not a visible edge |
| 4 | Globus pallidus, lateral segment | GPe, external pallidum | Pallidum | B | Population average |
| 5 | Globus pallidus, medial segment | GPi, internal pallidum | Pallidum | B | GPe/GPi split relies on the medial medullary lamina, which is hard to see on MRI |
| 6 | Subthalamic nucleus | STN | Subthalamus | B | Small (~100–150 mm³, from memory). Low-resolution mesh |
| 7 | Substantia nigra, compact part | SNc | Midbrain nuclei | B | Divided from SNr by contrast, not histology. Schematic |
| 8 | Substantia nigra, reticular part | SNr | Midbrain nuclei | B | As above |
| 9 | Red nucleus | — | Midbrain nuclei | B | Population average |
| 10 | Thalamus | dorsal thalamus | Diencephalon | C | Whole thalamus only, no nuclei in v1 |
| 11 | Midbrain | mesencephalon | Brainstem: midbrain | D | **Automated segmentation.** Upper and lower boundaries need your review |
| 12 | Pons | — | Brainstem: pons | D | As above |
| 13 | Medulla oblongata | medulla | Brainstem: medulla | D | Lower end is cut off where the template ends |
| 14 | Superior cerebellar peduncle | brachium conjunctivum | Cerebellar peduncles | D | Automated segmentation |
| 15 | Cerebellar hemisphere | cerebellum | Cerebellum | C | Folia are not resolved at 1 mm, so it is a smooth envelope |
| 16 | Vermis | cerebellar vermis | Cerebellum | C (vermal lobule labels, from memory) | Will merge lobule labels; if CerebrA lacks them → listed missing |
| 17 | Lateral ventricle | — | Ventricles | C | Template ventricles are average size |
| 18 | Temporal horn of lateral ventricle | inferior horn | Ventricles | C | Slit-like, often only partly captured at 1 mm |
| 19 | Third ventricle | — | Ventricles | C | Interthalamic adhesion is not modelled |
| 20 | Fourth ventricle | — | Ventricles | C | Lateral recesses and foramina are not resolved |

Proposed colour families, consistent everywhere: striatum in warm reds and
oranges, pallidum in violets, midbrain nuclei in ambers, thalamus in green,
brainstem levels as three steps of one blue scale, cerebellum in teal, and
ventricles in pale cyan, see-through. A colour-blind-safe set will be checked
with a simulator in deliverable 3.

---

## 4. Known gaps: listed as missing, not faked

| Structure | Why missing | Possible future source |
|---|---|---|
| Cerebral aqueduct | ~1–2 mm across, not labelled in B, C or D | None found yet |
| Interventricular foramen, lateral and median apertures | Too small, not labelled | None |
| Choroid plexus | Not labelled | None |
| Internal capsule as a mesh | Not a label in B or C | F (tract-derived), shown as a population tract |
| Dentate nucleus | Licence unverified (I) | I, if licence allows |
| Claustrum | In the CIT168 contributor label list (checked), but I don't know if it is in the released atlas | B, if released |
| Cranial nerve nuclei | No openly licensed MNI-space atlas confirmed | H (unverified); otherwise **missing**, which blocks v2 feature 8 |
| Cranial nerves outside the brainstem | MNI datasets cover the brain only | Possibly J as a context layer, if you accept it |
| Thalamic nuclei | Out of v1 scope | G |
| AICA vs PICA territories | **The atlas merges them** as "inferior cerebellar" (checked in E's label table) | None found. Lesion localizer must say "AICA/PICA (combined)" |
| Brainstem perforator territories (paramedian, short and long circumferential) | E has only "basilar" L/R (checked) | None found, which limits medial medullary and Weber localization |

---

## 5. QC findings so far (on real files)

I downloaded the arterial territories atlas (E) and checked it:

1. **No MNI origin in the header.** The affine is a flipped identity with zero
   translation (qform_code 0, sform_code 2). The world coordinates in the file are
   therefore not MNI mm. The pipeline must assign the standard origin for the
   181×217×181 grid and then confirm it by overlay. It must not trust the header.
2. **This grid is not the 2009c grid** (2009c 1 mm is 193×229×193, from memory). E needs a published 6th-generation→2009c transform (e.g. from TemplateFlow) followed by the 2 mm check. This resampling must be disclosed in E's limitations note.
3. **The label text table has errors. The volume is consistent.** The right-side
   MCA parietal, temporal and occipital rows reuse the left abbreviations
   (MCAPL, MCATL, MCAOL). The level-2 names for intensities 5 and 6 are swapped
   on the temporal PCA rows. I cross-tabulated level-1 against level-2 voxels:
   odd = left and even = right throughout, and the left labels sit on the −x side
   of the volume. **The pipeline will take names from intensity values, never from
   the abbreviation column.**
4. About 250 voxels disagree between levels 1 and 2 (e.g. 227 voxels of right
   lateral lenticulostriate become ventricle at level 2). This is a negligible
   number of voxels but will be documented.
5. **Anterior choroidal artery grouping:** the atlas puts "anterior choroidal and
   thalamoperforators" under the **PCA** at level 2. Clinically, the anterior
   choroidal artery is usually an ICA branch. We should show it as its own
   territory and not inherit the PCA grouping. **Clinical decision needed.**
6. Licence wording: E's label file says CC BY-SA 4.0 but links to the CC **BY**
   legal code. The repo LICENSE file is BY-SA, so we treat it as **BY-SA**.

**Not done yet:** the 2 mm overlay check for the 20 structures. That needs meshes
(deliverable 2). The pipeline will report, for each structure, the mean and
maximum surface distance to its source label after the 2009c resample. For data
already in 2009c (B, C, D) any error should be meshing only. It will also run the
L/R test from §1.

---

## 6. Open questions for you

1. Can BodyParts3D and Z-Anatomy be left out of the anatomical layer (§1)? If not, may they be a clearly labelled context layer?
2. Is automated FreeSurfer brainstem segmentation acceptable for midbrain, pons and medulla, provided you review the boundaries on screenshots?
3. Should the anterior choroidal territory be split from PCA (§5.5)?
4. Is it acceptable for v2 to show AICA and PICA as one combined territory?
5. Should licences be confirmed before deliverable 2 starts? This matters most for CerebrA (ND?) and the CIT168 data. I can't reach OSF or G-Node from this environment, so either you or the environment's network settings need to provide access.

## 7. Uncertain statements in this document

- CIT168 data licence; whether a 2009c version exists; the exact released label set (my list of 16 is from memory).
- CerebrA licence; whether it has vermal lobule labels.
- MNI 2009 licence wording; 2009a, b and c sharing one space; the 2009c grid size.
- FreeSurfer licence terms for derived outputs.
- How far BodyParts3D and Z-Anatomy were artist-modelled.
- STN volume; all TA2 terms.
- Whether HCP-1065 includes dentato-rubro-thalamic, spinothalamic and medial lemniscus tracts, and the Papez components.
- Licences of Brainstem Navigator, the Harvard AAN atlas, SUIT and the SPL/NAC atlas.

## References

- Fonov V, et al. Unbiased average age-appropriate atlases for pediatric studies. *NeuroImage* 2011;54:313–327. Also Fonov V, et al. *NeuroImage* 2009;47:S102.
- Pauli WM, Nili AN, Tyszka JM. A high-resolution probabilistic in vivo atlas of human subcortical brain nuclei. *Sci Data* 2018;5:180063.
- Manera AL, Dadar M, Fonov V, Collins DL. CerebrA, registration and manual label correction of Mindboggle-101 atlas for MNI-ICBM152 template. *Sci Data* 2020;7:237.
- Klein A, Tourville J. 101 labeled brain images and a consistent human cortical labeling protocol. *Front Neurosci* 2012;6:171.
- Iglesias JE, et al. Bayesian segmentation of brainstem structures in MRI. *NeuroImage* 2015;113:184–195.
- Iglesias JE, et al. A probabilistic atlas of the human thalamic nuclei combining ex vivo MRI and histology. *NeuroImage* 2018;183:314–326.
- Liu CF, et al. Digital 3D brain MRI arterial territories atlas. *Sci Data* 2023;10:74. Data: github.com/Chin-Fu-Liu/Arterial_Atlas.
- Yeh FC. Population-based tract-to-region connectome of the human brain and its hierarchical topology. *Nat Commun* 2022;13:4933.
- Diedrichsen J, et al. Imaging the deep cerebellar nuclei: a probabilistic atlas and normalization procedure. *NeuroImage* 2011;54:1786–1794.
- Edlow BL, et al. Neuroanatomic connectivity of the human ascending arousal system. *J Neuropathol Exp Neurol* 2012;71:531–546.
- Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Res* 2009;37:D782–D785.
- FIPAT. *Terminologia Anatomica*, 2nd ed. 2019.
