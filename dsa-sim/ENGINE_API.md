# dsa_sim engine API (for anatomy authors)

Educational simulation of cerebral DSA cine runs from a CTA-space vessel model.
**Anatomy agents write exactly one module `dsa_sim/anatomy/<part>.py` exposing
`build(tree, seed=0)` and must not edit the core files** (`frame, tree, hemo,
parenchyma, render, io_utils, cli, demo`). Everything below is the contract.

```text
dsa_sim/
  frame.py       geometry: coordinate frame, skull/brain implicit surfaces, LANDMARKS
  tree.py        VesselTree / Vessel, spline builders, grow_distal_branches()
  hemo.py        contrast bolus simulation (injection presets, collaterals, veins)
  parenchyma.py  brain voxels -> capillary blush + venous drainage territories
  render.py      C-arm geometry, DSA frames, unsubtracted DRR, 3D-RA, label overlay
  io_utils.py    PNG / GIF / MP4 writers, montage, size checks
  cli.py         `python -m dsa_sim.cli {demo,run,tree,landmarks}` + render_run()
  demo.py        tiny demo tree + engine demo / benchmark
  anatomy/__init__.py   build_full_tree(): neck_eca -> anterior -> posterior -> venous
```

Quick start (what an anatomy module looks like):

```python
# dsa_sim/anatomy/anterior.py
from .. import frame as F
from ..frame import L                 # landmark lookup  L('ICA_terminus', 'R')

def build(tree, seed=0):
    for s in ("R", "L"):
        parent = f"ICA_cervical_{s}"
        ctrl = [L("ICA_skull_base_entry", s), L("ICA_petrous_genu", s), ..., L("ICA_terminus", s)]
        if parent in tree:                      # join the neck part exactly at its last point
            ica = tree.branch_from(parent, -1, f"ICA_{s}", "Supraclinoid segment ICA", ctrl[1:],
                                   [2.3, 2.25, ...], group="ICA", side=s, territory=f"ICA_{s}")
        else:                                   # stand-alone development: start a root here
            ica = tree.add_vessel(f"ICA_{s}", "Supraclinoid segment ICA", ctrl, [...], group="ICA", side=s)
        m1 = tree.branch_from(ica, -1, f"M1_{s}", "MCA (M1)", [L("MCA_bifurcation", s), L("MCA_genu", s)],
                              (1.45, 1.35), group="MCA", territory=f"MCA_{s}")
        ...
        tree.grow_distal_branches(some_m4.id, n_branches=6, depth=2, seed=seed + k)
```

Note: `branch_from` prepends the origin on the parent to `ctrl`, so a per-control-point radius list
has `len(ctrl) + 1` values (origin first).

Test your part alone: `build_full_tree(parts=["anterior"])` (missing parts are skipped), then
`cli.render_run(tree, "ICA_R", views=("LAT","AP"), out_dir=...)` and **Read the PNGs**.

---------------------------------------------------------------------------------------------

## 1. Coordinate frame and conventions

* Patient **RAS millimetres**: `+x` = patient **Right**, `+y` = **Anterior**, `+z` = **Superior**.
* Origin = **anterior commissure** (AC); AC-PC line horizontal (PC = (0,-26,0)), MNI-like but
  sized for an average adult: skull outer table 180 mm AP x 145 mm biparietal (inner 168 x 133);
  brain ~162 x 127 mm, vertex of the brain z = +75, scalp vertex z = +89.
* Right-side structures have `x > 0`.  Left = `frame.mirror(right)` (x -> -x) unless the
  landmark table says otherwise (great vessels are asymmetric).
* Units: mm, seconds. Radii are **radii** (not diameters).
* All implicit functions return **negative inside** (signed-distance-like, ~1 mm per unit near
  the surface).
* Display conventions (render.py): **AP: patient right on viewer's left; LAT (LAO 90,
  detector on the patient's left): face to the viewer's LEFT** (as in the reference images).

### Head geometry summary (frame.py)
| structure | model |
|---|---|
| calvarium | egg-shaped ellipsoid, inner table `skull_inner_sdf`, outer = +6.5 mm `skull_outer_sdf`, scalp +5 mm `scalp_sdf` |
| skull base | height field `cranial_floor_z(x,y)`: anterior fossa ~-18 (cribriform -24); lesser sphenoid wing at y = 13 + 0.32(abs(x)-13); middle fossa floor -47; sella + parasellar (cavernous sinus) -37; petrous ridge from `PETROUS_APEX` (14,-12,-30) to (56,-44,-30) (`petrous_ridge_distance`); clivus `clivus_z(y)` from dorsum (-7,-24) to basion (-25,-66); foramen magnum open; posterior fossa floor ~-70 |
| tentorium | `tentorium_z(x,y)`: straight-sinus ridge from `straight_sinus_start` (0,-51,5) to `torcular` (0,-93,-20), down to the petrous ridge/transverse sinus (-30 -> -20) laterally, incisura in front |
| cerebrum | inner table - 3 mm CSF, cut by the fossa floors (+3 mm) and tentorium (+1.5), interhemispheric fissure abs(x) < 1.2 mm (`cerebrum_sdf`) |
| cerebellum | two hemispheres (+-23,-64,-38) semi (27,27,24) + vermis, under the tentorium (`cerebellum_sdf`) |
| brainstem | midbrain capsule, pons ellipsoid (0,-32,-34) semi (16,12,13), medulla, cord down the canal (`brainstem_sdf`) |
| deep grey | `DEEP` ellipsoids: thalamus (+-11,-16,5) semi (8,14,8), caudate head, putamen, pallidum (`deep_gray_sdf`) |
| corpus callosum | `callosal_curve(offset_mm, x, n, start, end)` dorsal callosal surface rostrum(0)->splenium(1): offset 2.5-3 = callosal sulcus (pericallosal a.), ~13 = cingulate sulcus (`cingulate_curve`, callosomarginal a.), ~7 = free falx margin (ISS) |
| sylvian fissure / insula | `sylvian_fissure(side, n)` lateral-surface trace ant->post; `insula_border(side, 'superior'/'inferior', n)` = circular sulci (M2->M3 genus); insula surface at abs(x) ~ 38-40 |
| lobes | `lobe_of(points)` -> 'frontal','parietal','temporal','occipital','insula','deep','cerebellum','brainstem','outside' |
| spine | `SPINE['C1'..'T4']` dicts with `body`, `canal`, `transverse_foramen_R/_L` (x=+-24, C2 +-23, C1 +-29); `vertebra_level_z('C3-C4')` |
| bone | `bone_density(p)` / `bone_volume()` (cached voxels) for the unsubtracted DRR only |

### frame.py functions
```python
L(name, side=None) -> np.ndarray(3)          # copy of LANDMARKS[name] or LANDMARKS[f"{name}_{R|L}"]
LANDMARKS: dict[str, ndarray]; LANDMARK_INFO: dict[str, str]
side_sign('R'|'L') -> +1.|-1. ;  mirror(p)   # x -> -x
skull_inner_sdf(p), skull_outer_sdf(p), scalp_sdf(p)
brain_sdf(p) (= min(cerebrum, cerebellum, brainstem)), cerebrum_sdf, cerebellum_sdf, brainstem_sdf, deep_gray_sdf
inside_brain(p) -> bool
cranial_floor_z(x, y), tentorium_z(x, y), clivus_z(y), petrous_ridge_distance(x, y)
project_to_surface(p, surface="brain", depth_mm=0.0, iters=8, fast=True)
    # p (3,) or (N,3). Moves points onto the iso-surface sdf == -depth_mm (depth>0 = inside).
    # surface: 'brain'|'cortex'|'cerebrum'|'cerebellum'|'brainstem'|'inner_table'|'outer_table'|'scalp' or callable.
project_to_cortex(p, depth_mm=1.0, surface="brain")   # pial vessels: depth_mm = -0.5 .. -1.5 (just outside pia)
project_to_inner_table(p, inset_mm=3.0)               # dural sinuses ~3.5 mm, meningeal arteries ~1 mm
project_to_scalp(p, depth_mm=2.5)                     # scalp arteries (STA, occipital)
cortex_normal(p, surface="brain") -> unit outward normals
sdf_gradient(fn_or_name, p, e=0.25)
grid_sdf(name) -> GridSDF   # voxel-cached sdf (+-0.1 mm), what fast=True uses; ~/.cache/dsa_sim
lobe_of(p); callosal_curve(...); cingulate_curve(...); sylvian_fissure(...); insula_border(...)
SPINE, vertebra_level_z(level); DEEP, BRAINSTEM, CEREBELLUM, SKULL, PETROUS_APEX, STRAIGHT_SINUS_START, TORCULAR
smoothstep, smin, smax, sd_ellipsoid, sd_capsule   # helpers if you need custom constraint surfaces
```
Example: a pial MCA branch end point on the convexity and a twig region mask
```python
p_end = F.project_to_cortex((58, -30, 30), depth_mm=-0.8)
in_mca = lambda P: np.isin(F.lobe_of(P), ["frontal", "parietal", "temporal", "insula"]) & (np.abs(P[:, 0]) > 25)
```

---------------------------------------------------------------------------------------------

## 2. LANDMARKS (exact shared junctions)

Join vessels **exactly** at these points: pass them as control points (the spline keeps control
points as exact samples) and attach with `branch_from(parent, -1, ...)` / `set_merge` /
`add_collateral`. `_{R,L}` = both sides exist (`L` = mirror of `R` unless listed separately).
Print the full table any time with `python -m dsa_sim.cli landmarks`.

| landmark | x | y | z | anatomical meaning |
|---|---:|---:|---:|---|
| `carotid_bifurcation_{R,L}` | 24.0 | 2.0 | -117.0 | CCA ends / ICA+ECA begin, C3-C4 disc level (upper thyroid cartilage) |
| `ICA_bulb_{R,L}` | 25.5 | -1.0 | -109.0 | carotid bulb (proximal cervical ICA, posterolateral to ECA) |
| `ECA_proximal_{R,L}` | 22.0 | 6.0 | -109.0 | proximal ECA, anteromedial to the ICA, superior thyroid a. arises near here |
| `ICA_C2_{R,L}` | 27.0 | -6.0 | -95.0 | cervical ICA at the C2 level (default ICA catheter tip) |
| `ICA_C1_{R,L}` | 27.0 | -10.0 | -78.0 | cervical ICA at the C1 level, anterior to the C1 transverse process |
| `ICA_skull_base_entry_{R,L}` | 27.0 | -13.0 | -61.0 | exocranial opening of the carotid canal (C1->C2 petrous) |
| `ICA_petrous_genu_{R,L}` | 28.0 | -14.0 | -51.0 | vertical->horizontal petrous ICA genu |
| `ICA_foramen_lacerum_{R,L}` | 17.0 | 0.0 | -44.0 | end of horizontal petrous ICA over foramen lacerum (C3 lacerum) |
| `ICA_cav_posterior_genu_{R,L}` | 16.0 | -3.0 | -36.0 | posterior bend of cavernous ICA (C4 begins), lateral to dorsum |
| `ICA_cav_anterior_genu_{R,L}` | 15.0 | 11.0 | -31.0 | anterior genu of the cavernous ICA (below anterior clinoid) |
| `ICA_clinoid_{R,L}` | 14.0 | 11.0 | -24.0 | clinoid segment / distal dural ring (C5->C6) |
| `OA_origin_{R,L}` | 13.5 | 10.0 | -22.0 | ophthalmic artery origin, superomedial supraclinoid ICA |
| `optic_canal_{R,L}` | 11.0 | 17.0 | -18.0 | optic canal (optic nerve + ophthalmic artery) |
| `orbit_apex_{R,L}` | 15.0 | 26.0 | -22.0 | orbital apex / annulus of Zinn |
| `globe_center_{R,L}` | 32.0 | 58.0 | -30.0 | centre of the eye globe |
| `PComm_origin_{R,L}` | 13.5 | 4.5 | -17.0 | PComm origin from posterior wall of the supraclinoid ICA (C7) |
| `AChA_origin_{R,L}` | 13.8 | 3.0 | -15.0 | anterior choroidal artery origin, 2-4 mm above PComm |
| `ICA_terminus_{R,L}` | 13.0 | 2.0 | -13.0 | ICA bifurcation into A1 and M1 |
| `A1A2_junction_{R,L}` | 1.2 | 10.0 | -6.0 | end of A1 at the ACom (ACom spans x=-1.2..+1.2) |
| `MCA_bifurcation_{R,L}` | 32.0 | 6.0 | -11.0 | M1 bifurcation (superior/inferior trunks) |
| `MCA_genu_{R,L}` | 37.0 | 5.0 | -9.0 | MCA genu at the limen insulae (M1->M2) |
| `insula_center_{R,L}` | 38.0 | -4.0 | 4.0 | centre of the insular cortex surface |
| `sylvian_point_{R,L}` | 40.0 | -30.0 | 19.0 | angiographic sylvian point (last M3 loop leaving the insula top) |
| `PCA_P1P2_{R,L}` | 8.5 | -10.0 | -20.0 | P1/P2 junction where the PComm joins the PCA |
| `PCA_P2P3_{R,L}` | 10.0 | -40.0 | -6.0 | P2/P3 junction at the quadrigeminal cistern |
| `calcarine_point_{R,L}` | 8.0 | -78.0 | 4.0 | anterior calcarine fissure on the medial occipital surface |
| `occipital_pole_{R,L}` | 10.0 | -94.0 | 4.0 | occipital pole (cortical surface) |
| `VA_origin_R` | 31.0 | 4.0 | -201.0 | VA origin from the first part of the subclavian artery |
| `VA_origin_L` | -30.0 | -4.0 | -204.0 | left VA origin from the left subclavian |
| `VA_C6_foramen_entry_{R,L}` | 24.0 | -22.0 | -163.0 | VA enters the C6 transverse foramen (V1->V2) |
| `VA_C2_foramen_{R,L}` | 23.0 | -26.0 | -94.0 | VA in the C2 transverse foramen |
| `VA_C1_foramen_{R,L}` | 29.0 | -29.0 | -82.0 | VA enters the C1 transverse foramen (V2->V3) |
| `VA_C1_exit_{R,L}` | 29.0 | -30.0 | -76.0 | VA exits the top of the C1 transverse foramen |
| `VA_C1_sulcus_{R,L}` | 20.0 | -51.0 | -74.0 | V3 in the sulcus arteriosus on the posterior arch of C1 |
| `VA_dural_entry_{R,L}` | 13.0 | -40.0 | -66.0 | VA pierces the dura at the lateral foramen magnum (V3->V4) |
| `subclavian_apex_R` | 40.0 | 4.0 | -196.0 | highest point of the subclavian arch |
| `subclavian_apex_L` | -38.0 | -4.0 | -199.0 | highest point of the left subclavian |
| `subclavian_lateral_R` | 62.0 | -2.0 | -206.0 | subclavian at the lateral border of the first rib |
| `subclavian_lateral_L` | -62.0 | -2.0 | -206.0 | left subclavian at the first rib |
| `jugular_bulb_{R,L}` | 34.0 | -24.0 | -55.0 | dome of the jugular bulb (sigmoid -> IJV) |
| `jugular_foramen_{R,L}` | 34.0 | -23.0 | -62.0 | exocranial jugular foramen, IJV begins |
| `IJV_C2_{R,L}` | 33.0 | -10.0 | -95.0 | internal jugular vein at C2, posterolateral to the ICA |
| `IJV_low_{R,L}` | 30.0 | 6.0 | -190.0 | IJV near its junction with the subclavian vein |
| `cavernous_sinus_{R,L}` | 15.0 | 2.0 | -32.0 | centre of the cavernous sinus |
| `venous_angle_{R,L}` | 3.0 | -4.0 | 11.0 | foramen of Monro: thalamostriate + septal veins form the ICV |
| `foramen_spinosum_{R,L}` | 24.0 | -3.0 | -44.5 | middle meningeal artery enters the skull |
| `foramen_ovale_{R,L}` | 21.0 | 2.0 | -45.0 | foramen ovale (accessory meningeal a.) |
| `mastoid_tip_{R,L}` | 50.0 | -30.0 | -66.0 | mastoid process tip (occipital artery passes medial) |
| `mandible_angle_{R,L}` | 46.0 | 2.0 | -100.0 | angle of the mandible |
| `condyle_mandible_{R,L}` | 50.0 | -10.0 | -48.0 | mandibular condyle, just anterior to the EAM |
| `AC` | 0.0 | 0.0 | 0.0 | anterior commissure (origin) |
| `PC` | 0.0 | -26.0 | 0.0 | posterior commissure |
| `sella` | 0.0 | 1.0 | -30.0 | centre of the pituitary fossa |
| `tuberculum_sellae` | 0.0 | 8.0 | -24.0 | tuberculum sellae |
| `dorsum_sellae` | 0.0 | -7.0 | -23.0 | top of the dorsum sellae |
| `optic_chiasm` | 0.0 | 4.0 | -13.0 | optic chiasm |
| `ACom_center` | 0.0 | 10.0 | -6.0 | anterior communicating artery centre, above the chiasm |
| `basilar_tip` | 0.0 | -12.0 | -22.0 | basilar apex / P1 origins in the interpeduncular cistern |
| `VB_junction` | 0.0 | -24.0 | -54.0 | vertebrobasilar junction at the pontomedullary sulcus |
| `clivus_mid` | 0.0 | -16.0 | -45.0 | midpoint of the endocranial clival surface |
| `basion` | 0.0 | -25.0 | -66.0 | anterior margin of the foramen magnum |
| `opisthion` | 0.0 | -60.0 | -70.0 | posterior margin of the foramen magnum |
| `foramen_magnum` | 0.0 | -42.0 | -67.0 | centre of the foramen magnum |
| `straight_sinus_start` | 0.0 | -51.0 | 5.0 | falcotentorial junction: VoG + ISS form the straight sinus |
| `torcular` | 0.0 | -93.0 | -20.0 | torcular Herophili (confluence of sinuses) |
| `vein_of_Galen` | 0.0 | -44.0 | -1.0 | great cerebral vein of Galen under the splenium |
| `splenium` | 0.0 | -45.0 | 6.0 | posterior edge of the splenium |
| `genu_cc` | 0.0 | 33.0 | 6.0 | anterior edge of the callosal genu |
| `nasion` | 0.0 | 79.0 | -24.0 | nasion (soft-tissue/bony) |
| `menton` | 0.0 | 70.0 | -130.0 | chin |
| `aortic_root` | 14.0 | 28.0 | -305.0 | aortic root |
| `ascending_aorta_top` | 16.0 | 22.0 | -262.0 | distal ascending aorta |
| `aortic_arch_apex` | 2.0 | 10.0 | -242.0 | top of the aortic arch |
| `aortic_isthmus` | -20.0 | -16.0 | -252.0 | aortic isthmus (distal arch) |
| `descending_aorta` | -22.0 | -32.0 | -300.0 | proximal descending thoracic aorta |
| `brachiocephalic_origin` | 9.0 | 16.0 | -244.0 | brachiocephalic (innominate) trunk origin |
| `BCT_bifurcation` | 21.0 | 10.0 | -206.0 | innominate bifurcation behind right SC joint = R CCA & R subclavian origins |
| `CCA_origin_R` | 21.0 | 10.0 | -206.0 | right CCA origin (= BCT bifurcation) |
| `subclavian_origin_R` | 21.0 | 10.0 | -206.0 | right subclavian origin (= BCT bifurcation) |
| `CCA_origin_L` | -6.0 | 6.0 | -242.0 | left CCA origin from the arch |
| `subclavian_origin_L` | -16.0 | -4.0 | -246.0 | left subclavian origin from the arch |
| `SSS_anterior` | 0.0 | 65.4 | -11.2 | SSS origin at the foramen caecum / crista galli |
| `SSS_bregma` | 0.0 | 27.4 | 65.2 | SSS at bregma (coronal suture) |
| `SSS_vertex` | 0.0 | -11.7 | 73.7 | SSS at the vertex |
| `SSS_lambda` | 0.0 | -60.1 | 52.4 | SSS at lambda |
| `transverse_mid_{R,L}` | 36.5 | -76.9 | -21.5 | mid transverse sinus |
| `sigmoid_transverse_junction_{R,L}` | 51.7 | -45.1 | -26.8 | transverse -> sigmoid sinus junction (asterion) |
| `sigmoid_mid_{R,L}` | 48.0 | -38.0 | -44.0 | mid sigmoid sinus (mastoid groove, below the petrous base) |
| `EAM_{R,L}` | 64.3 | -18.2 | -32.3 | external acoustic meatus (bony) |
| `pterion_{R,L}` | 58.6 | 17.5 | 7.0 | pterion (inner table; MMA anterior branch) |
| `temporal_pole_{R,L}` | 44.6 | 20.1 | -34.9 | temporal pole (cortex) |
| `frontal_pole_{R,L}` | 10.7 | 65.5 | 0.4 | frontal pole (cortex) |
| `vertex_scalp` | 0.0 | -10.9 | 88.8 | vertex (skin) |
| `inion` | 0.0 | -104.4 | -21.8 | external occipital protuberance |

Spine helper points (right side, mirror for left) for V2 of the vertebral artery:
`SPINE[lv]['transverse_foramen_R']` for lv in C6..C2 = (24,-22,-160), (24,-21,-144), (24,-22,-128),
(24,-24,-112), (23,-27,-95); C1 = (29,-29,-80).

---------------------------------------------------------------------------------------------

## 3. Part ownership, build order and canonical vessel ids

`anatomy.build_full_tree(parts=None, seed=0, verbose=True, validate=True)` imports, in order,
`neck_eca`, `anterior`, `posterior`, `venous` (missing modules are skipped; errors inside a
module are raised) and calls `build(tree, seed=seed)` (or `build(tree)`). A later part may
attach to vessels of an earlier part **by canonical id**; always fall back to a root vessel
(`add_vessel` starting at the landmark) when the parent id is absent so each part renders alone.

| part | owns | canonical ids that others rely on (sides `_R`/`_L`) |
|---|---|---|
| `neck_eca` | aortic arch, brachiocephalic, subclavians, CCAs, **cervical ICA up to `ICA_skull_base_entry`**, ECA and all its branches (STA, MMA, occipital, facial, lingual, sup. thyroid, IMA, asc. pharyngeal, post. auricular), optional thyrocervical/costocervical trunks | `aortic_arch`, `brachiocephalic`, `subclavian_X`, `CCA_X` (ends exactly at `carotid_bifurcation_X`), `ICA_cervical_X` (child of CCA at its last point; **last point exactly `ICA_skull_base_entry_X`**), `ECA_X`, `occipital_X` (passes posterior to the mastoid near C1 for the C1 anastomosis), `MMA_X` |
| `anterior` | petrous/cavernous/supraclinoid ICA, OA, AChA, ACA (A1, ACom, A2, pericallosal, callosomarginal, frontopolar, orbitofrontal, internal frontal, paracentral, parietal branches), MCA (M1..M4 named branches, lenticulostriates), recurrent artery of Heubner | `ICA_X` (**the segment that ends exactly at `ICA_terminus_X` and passes exactly through `PComm_origin_X`**; you may split the ICA into consecutive continuation vessels, e.g. `ICA_petrous_X` -> `ICA_cavernous_X` -> `ICA_X`), `M1_X`, `A1_X` (ends at `A1A2_junction_X`), `ACom`, `pericallosal_X` |
| `posterior` | vertebral arteries **from the subclavian (VA_origin) to the VB junction**, PICA, AICA, SCA, basilar + pontine perforators, P1-P4 PCA and branches (temporal, calcarine, parieto-occipital, splenial, choroidals), thalamoperforators, **PComm (collateral ICA_X <-> P1_X)**, anterior spinal artery, C1 anastomosis to the occipital artery | `VA_X` (last point exactly `VB_junction`; passes the C6..C1 foramina, `VA_C1_sulcus_X`, `VA_dural_entry_X`), `basilar` (child of `VA_L` at its last point; `set_merge('VA_R','basilar',0)`), `P1_X` (ends at `PCA_P1P2_X`), `PCA_X`, `PComm_X` |
| `venous` | all veins and dural sinuses incl. IJV | `SSS`, `ISS`, `straight_sinus`, `vein_of_Galen`, `ICV_X`, `basal_vein_X`, `transverse_X`, `sigmoid_X`, `IJV_X`, `cavernous_sinus_X` |

Injection presets (hemo.INJECTIONS) look for these ids first and otherwise use the artery
nearest to the landmark: `ICA_R/L` -> `ICA_cervical_X` at `ICA_C2_X`; `CCA_R/L` -> `CCA_X`
30 mm below the bifurcation; `ECA_R/L` -> `ECA_X` at `ECA_proximal_X`; `VA_R/L` -> `VA_X` at
the C5 level; `arch` -> `aortic_arch` at `ascending_aorta_top`.

### Reference calibers (radius = diameter / 2, mm; Osborn / Rhoton typical adult values)
| vessel | radius | vessel | radius |
|---|---|---|---|
| aorta | 14 | brachiocephalic | 6 |
| subclavian | 4.5 | CCA | 3.5 |
| carotid bulb | 3.5-4 | cervical ICA | 2.4 |
| petrous / cavernous ICA | 2.25 | supraclinoid ICA | 1.9 |
| OA | 0.7 | PComm | 0.6-0.75 (fetal 1.0) |
| AChA | 0.5 | M1 | 1.4-1.5 |
| M2 | 1.0-1.1 | M3 | 0.7 | 
| M4 / cortical | 0.4-0.5 | A1 | 1.1 |
| ACom | 0.75 | A2 / pericallosal | 1.0 -> 0.8 |
| callosomarginal | 0.75 | lenticulostriate | 0.3-0.4 |
| VA (V2-V4) | 1.8-2.0 | basilar | 2.0 -> 1.6 |
| P1 / P2 | 1.05 / 1.0 | SCA | 0.7 |
| AICA | 0.55 | PICA | 0.75 |
| thalamoperforators / choroidals | 0.25-0.4 | anterior spinal | 0.3 |
| ECA | 2.2 | STA / occipital / facial | 1.1 / 1.0 / 1.2 |
| MMA | 0.9 | IMA | 1.2 |
| SSS | 2 (frontal) -> 4.5 (torcular) | transverse / sigmoid | 4.0 / 4.2 |
| IJV | 5-6 | straight sinus | 2.2 |
| vein of Galen | 3 | ICV / basal vein | 1.2 / 1.0 |
| cortical veins / Trolard / Labbe | 0.8-1.5 | cavernous sinus (as a tube) | 3 |

### Segment budget (keeps every run fast; 30k segments renders in ~2.5 s build + 0.05 s/frame)
neck_eca <= 10k segments, anterior <= 30k, posterior <= 20k, venous <= 15k (segment ~0.8 mm).

---------------------------------------------------------------------------------------------

## 4. tree.py

### Topology convention
* `points` (N,3) mm and `radii` (N,) sampled every <= 0.8 mm (`MAX_STEP`); control points are kept
  exactly (`ctrl_index` = their sample indices).
* A child joins its parent with its **first point**: `child.points[0] == parent.points[parent_index]`.
* `flow_direction=+1`: flow from points[0] to points[-1] (arteries; sinuses carrying blood away from
  the junction, e.g. transverse sinus from the torcular). `-1`: flow toward points[0], i.e. INTO the
  parent (venous tributaries). `branch_from` default: artery +1, vein -1. Roots default +1.
* `merges_into=(vid, idx)`: the vessel's downstream end also empties into `vid` (confluence:
  right VA -> basilar, both VAs -> anterior spinal artery, vein emptying into a second sinus).
* `collateral=True` with `connects_to=(vid, idx)`: ACom, PComm, leptomeningeal / C1 anastomoses.
  Contrast may cross in either direction with `fill_fraction` (0..1) and cube-law mixing into the
  receiving vessel (big receivers wash it out: PComm reflux into the ICA stays local).

### Vessel fields
```python
Vessel(id, name, points, radii, system='artery'|'vein', group='', short_label='', parent=None,
       parent_index=None, flow_direction=1, collateral=False, fill_fraction=1.0, connects_to=None,
       merges_into=None, label_anchor=None, territory=None, side=None, ctrl_index=[],
       velocity_scale=1.0, drains=None, meta={})
# name: label text EXACTLY as printed ('' = unlabeled twig). label_anchor: point index of the leader line.
# territory: e.g. 'MCA_R','ACA_L','PCA_R','PICA_L' (used for reporting / parenchyma.territory_of).
# meta['label_side'] = 'left'|'right'  forces the label column.
# meta['extra_labels'] = [[text, point_index or [x,y,z]], ...]  more labels on one vessel
#   (e.g. ICA segment names, 'Thalamus blush', 'Tonsil').
# velocity_scale: multiply the caliber-derived flow velocity (e.g. 0.5 for a slow collateral).
v.index_at(at)  # at: int index (negative from end) | float arclength mm (negative = from end) |
                #     ('frac', f) | 3-D point (nearest sample)
v.arclength(), v.length(), v.tangent(i), v.anchor_point(), v.labeled, v.n
```

### VesselTree
```python
tree = VesselTree()
tree.add_vessel(id, name, ctrl, radius, system="artery", group="", parent=None, parent_index=None,
                smooth=True, step=0.8, **fields) -> Vessel
    # ctrl (M>=2,3): centripetal Catmull-Rom through all control points (smooth=False: polyline)
    # radius: scalar | (r_start, r_end) | one value per control point | one per sample
    # parent given & parent_index None -> attaches at the parent sample nearest ctrl[0] (ctrl[0] snapped)
tree.branch_from(parent, at, id, name, ctrl, radius, system=None, group=None, **fields) -> Vessel
    # origin = parent.points[parent.index_at(at)] is prepended to ctrl; inherits system/group/side/territory
tree.add_collateral(id, name, a=(vid, at), b=(vid, at), ctrl_mid=(), radius=0.6, fill_fraction=0.3,
                    group="CoW", **fields) -> Vessel
tree.set_merge(vid, target, at, snap=True)       # downstream end of vid empties into target
tree.grow_distal_branches(vessel_id, **kw) -> [new ids]   # see below
tree.find_nearest(point, system=None, group=None, labeled_only=False) -> (vid, index, distance)
tree[vid], vid in tree, tree.get(vid), tree.ids(), tree.children(vid), tree.labeled(), tree.by_group(g)
tree.remove(vid, recursive=True), tree.all_points(system=None) -> (P, r)
tree.validate(tol=0.6, verbose=True) -> [problems]  # junction gaps, bad refs, radii, NaN
tree.summary(); tree.n_points(); tree.n_segments()
tree.to_json(path=None, decimals=2) / VesselTree.from_json(path_or_str)   # compact browser format:
    # {"format":"dsa_sim.tree/1","vessels":[{"id","name","short","sys","grp","parent","pi","fd","col",
    #   "ff","conn","merge","anchor","terr","side","vs","drains","ctrl","pts":[x,y,z,...],"r":[...]}]}
spline_through(ctrl, step=0.8, smooth=True) -> (points, ctrl_index);  murray_child_radius(r_parent, flow_ratio)
```
Examples
```python
pc = tree.add_collateral("PComm_R", "Posterior communicating artery",
                         ("ICA_R", L("PComm_origin", "R")), ("P1_R", -1), radius=0.7, fill_fraction=0.5)
tree.branch_from("VA_L", -1, "basilar", "Basilar artery", [L("basilar_tip")], (2.0, 1.6), group="VB")
tree.set_merge("VA_R", "basilar", 0)
cv = tree.branch_from("SSS", L("SSS_vertex"), "cv1", "", [F.project_to_cortex((40,-10,60), -1.0)], (1.2, 0.6),
                      system="vein", group="venous")       # tributary: flow toward the SSS (fd=-1)
```

### grow_distal_branches (unlabeled cortical / cerebellar twigs)
```python
tree.grow_distal_branches(vessel, n_branches=6, start_frac=0.5, start_mm=None, depth=2, sub_branches=(1, 2),
    seed=0, surface="brain", surface_depth=-0.8, min_radius=0.15, length_per_radius=70.0, max_length=90.0,
    branch_ratio=(0.55, 0.8), angle_deg=(35, 75), tortuosity=0.25, step=1.0, bias=None, bias_weight=0.3,
    region=None, keep_side=True, include_tip=True, avoid=True, avoid_dist=2.0, taper=0.7,
    group=None, territory=None, max_snap=12.0) -> list[str]
```
* Sprouts `n_branches` twigs between `start_frac` (or `start_mm`) and the end of `vessel`, plus a tip
  continuation (`include_tip`), each recursively branching `depth` times.
* Twigs random-walk on `surface` (any `frame.SURFACES` name, a callable sdf, or `None` = free 3-D for
  perforators/neck) at `surface_depth` (negative = just outside the pia). Child radius = parent radius
  x U(`branch_ratio`) (asymmetric Murray-type bifurcations), taper to `taper` x start, length ~
  `length_per_radius` x radius, stop below `min_radius`. Avoids existing vessels; `region(points)->bool`
  confines growth (e.g. a territory); `keep_side` forbids crossing the midline; `bias` = 3-vector or
  callable steering (e.g. toward the vertex for ACA twigs). Deterministic for a given seed.
* Twig ids are `<parent>~<n>`, `name=''`, inherit group/territory/system (vein twigs flow toward
  their parent). Grow twigs only from vessels that already lie on the target surface.

---------------------------------------------------------------------------------------------

## 5. hemo.py (contrast bolus)

```python
bolus = hemo.simulate(tree, injection="ICA_R", params=None, parenchyma=None, t0=0.0, **overrides)
# injection: preset name (INJECTIONS), dict(vessels=[...], at=landmark|(landmark, offset)|xyz, amp, duration)
#            or hemo.Injection(vessel, index, amp=0.85, duration=1.5, t0=0.0)
bolus.conc(t, nodes=None)          # lumen opacification 0..1 per node (t scalar or array)
bolus.vessel_conc(vid, t); bolus.vessel_max_conc(t) -> {vid: max}; bolus.tissue_conc(t)
bolus.A, bolus.tau, bolus.sigma    # per node amplitude, mean delay (s), dispersion (s)
bolus.ix.node(vid, i), bolus.ix.vessel_slice(vid), bolus.phase_times() -> (arterial, capillary, venous)
```
Model: c(t) = A [Gcdf(t - t0 - tau) - Gcdf(t - t0 - tau - T)] (injection boxcar T convolved with a
gamma variate of s.d. sigma; sigma^2 = sigma0^2 + D tau). Arteries: label-setting search from the
catheter maximising A then earliest tau; velocity v(r) = 300 mm/s (r/2 mm)^0.8 (min 25 mm/s);
retrograde reflux decays exp(-ds/6 mm) (catheter reflux), confluence inflows are diluted by
`1 - 0.3 (1 - r^3 share)` and the non-injected inflow refluxes (decay 25 mm; contralateral VA ->
PICA); collaterals as described in section 4. Tissue: every parenchyma voxel is fed by its nearest
arterial terminal/small artery (r <= 0.65), blushes `blush_delay` = 1.4 s later, and drains after
`cap_transit` = 2.0 s into the nearest vein sample with r <= 1.3 mm (within 30 mm); veins mix
flow-weighted moments downstream (v_vein(r) = 150 mm/s (r/2)^0.7). Default ICA run: arterial peak
~1.5-2 s, capillary ~3 s, venous ~4-5 s, washout by ~8-9 s. All constants: `hemo.HemoParams`.
**Consequences for anatomy authors:** give veins enough small tributaries over the cortex and deep
grey matter (each voxel drains to a vein <= 30 mm away), make arterial twigs reach every territory,
and put perforators where you want deep blush (thalamoperforators -> thalamus blush).

## 6. parenchyma.py
```python
par = Parenchyma.build(spacing=3.0, ribbon_mm=7.0)    # ~40k voxels; weights: cortex 1, WM 0.45, deep 1.25, thalamus 1.35
par.pos, par.weight, par.region; par.feeding_nodes(bolus.ix); par.territory_of(bolus.ix)
```

## 7. render.py
```python
view = render.get_view("LAT", size=768)     # presets: AP (Caldwell-like, CAUD 12), AP_TRUE, TOWNE (CRAN 30),
                                            # LAT (LAO 90, face left), LAT_R, LAT_POST, OBL_R, OBL_L,
                                            # NECK_AP, NECK_LAT, ARCH_LAO
View(name, lao=0, cran=0, sid=1000, sod=700, det_mm=300, size=768, center=(0,-14,-8), roll=0)
view.project(P) -> (x_px, y_px, depth_mm, magnification)     # x right, y down
render.rotational_view(angle_deg, elevation_deg=0, size=...)  # 3D-RA spin: 0 = PA, 90 = left lateral
rr = render.RunRenderer(tree, bolus, view, parenchyma=par, systems=("artery","vein"), display=Display())
img = rr.frame(t, mode="dsa"|"unsub")        # float [0,1], 1 = white; DSA: dark vessels on light grey
frames = rr.frames(render.default_times(30, 9.0)); rr.vessel_opacity(t) -> {vid: opacification}
render.render_3dra(tree, view, bolus=None, t=None, min_opacity=0.15, systems=("artery",), size=None, ss=2)
render.label_overlay(img, tree, view, vessels=None, opacity=None, threshold=0.2, margin=(240,240),
                     font_size=13, dark=False, title=None, footnote=None) -> PIL.Image
render.Display(mu=0.55, bg=0.80, blur_px=0.6, noise=0.008, blush_gain=0.22, misreg=0.0, mu_bone=0.035)
render.segments_from_tree(tree, ix); render.Projector(view, segs).image(c_seg); render.drr(view)
```
Rendering is an exact chord-length projection of mitred cylinders (gap-free bends, 2x2 supersampled,
iodine-conserving minimum width 1 px) into a sparse pixels x segments matrix built once per view;
each cine frame is one sparse mat-vec (~0.05 s for 30k segments at 768 px). Labels: margin text +
leader lines to `label_anchor`, only for vessels opacified above `threshold`, duplicates by name keep
the most opacified (so bilateral vessels can share a name).

## 8. io_utils.py and cli.py
```python
io_utils.save_png(img, path); save_mp4(frames, path, fps=4, crf=20)   # H.264 yuv420p
io_utils.save_gif(frames, path, fps=4, scale=None, colors=128); montage(images, cols, labels=None)
io_utils.check_sizes(dir, max_file_mb=10, max_total_mb=60)
cli.render_run(tree, injection="ICA_R", views=("LAT","AP"), out_dir=None, n_frames=30, t_end=9.0, fps=4,
               size=768, labels=True, gif=True, mp4=True, ra_frames=24, ra_size=448, parenchyma=True)
```
```bash
python -m dsa_sim.cli demo                                  # engine demo -> output/engine_demo
python -m dsa_sim.cli run --injection ICA_R,VA_L --views LAT,AP,TOWNE --frames 30
python -m dsa_sim.cli tree --json output/tree.json          # full anatomy JSON for a browser viewer
python -m dsa_sim.cli landmarks                             # landmark table
python tests/test_engine.py [--quick]
```
Output limits: no file > 10 MB, total output < 60 MB (GIFs are written at 0.5 scale, 64 colours; prefer MP4).

## 9. Known limitations
* Brain surface is smooth (no gyri); the sylvian fissure / insula are given as curves, not carved.
* Skull base / face bone model is crude (unsubtracted mode only); DSA mode is the primary output.
* Hemodynamics are phenomenological (no pressure solve); collateral filling is set by `fill_fraction`.
* Velocity is caliber-driven; aneurysms, stenoses, AVMs are not modelled (use `velocity_scale`).
