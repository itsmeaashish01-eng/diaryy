"""Project the arterial territories atlas into AP and lateral views for the
angiography prototype's capillary (parenchymal) phase.

Source: Liu CF et al. Digital 3D brain MRI arterial territories atlas.
Sci Data 2023;10:74. https://github.com/Chin-Fu-Liu/Arterial_Atlas
Licence: CC BY-SA 4.0, so the output file is CC BY-SA 4.0 too.

Each output pixel is the blood-volume-weighted path length of the ray through
that territory: the sum along the ray of (grey matter probability + 0.5 x
white matter probability), taken from the ICBM 2009a template tissue maps
(the copies bundled with nilearn). The 2:1 grey-to-white blood volume ratio is
an approximation flagged for clinical review. Values are stored as uint8 and
multiplied by `scale`.
Names come from the intensity values (the atlas text table has typos; see
docs/01-data-plan.md section 5), never from the abbreviation column.

The atlas header has no MNI origin, so the standard 181x217x181 grid is
assumed: voxel (i, j, k) -> MNI (90 - i, j - 126, k - 72). The script reports
the Dice overlap between all territories and the template brain mask as a
check on that assumption (0.929 at the time of writing; the best integer shift,
-2 mm in x, raised it only to 0.931).

Usage: python3 -I angio_territory_projections.py ArterialAtlas.nii \
           mni_icbm152_gm_tal_nlin_sym_09a_converted.nii.gz \
           mni_icbm152_wm_tal_nlin_sym_09a_converted.nii.gz out.js
"""
import base64
import json
import sys

import nibabel as nib
import numpy as np

# Level-1 intensities. Odd = patient left, even = patient right; checked by
# centroid against the LAS affine (left labels sit at higher i).
LABELS = {
    1: "ACA L", 2: "ACA R",
    3: "Medial lenticulostriate L", 4: "Medial lenticulostriate R",
    5: "Lateral lenticulostriate L", 6: "Lateral lenticulostriate R",
    7: "MCA frontal L", 8: "MCA frontal R",
    9: "MCA parietal L", 10: "MCA parietal R",
    11: "MCA temporal L", 12: "MCA temporal R",
    13: "MCA occipital L", 14: "MCA occipital R",
    15: "MCA insular L", 16: "MCA insular R",
    17: "PCA temporal L", 18: "PCA temporal R",
    19: "PCA occipital L", 20: "PCA occipital R",
    21: "Posterior choroidal + thalamoperforators L",
    22: "Posterior choroidal + thalamoperforators R",
    23: "Anterior choroidal + thalamoperforators L",
    24: "Anterior choroidal + thalamoperforators R",
    25: "Basilar (pons/midbrain) L", 26: "Basilar (pons/midbrain) R",
    27: "Superior cerebellar L", 28: "Superior cerebellar R",
    29: "Inferior cerebellar (AICA+PICA, merged) L",
    30: "Inferior cerebellar (AICA+PICA, merged) R",
}


def _centroid_col(b64, width):
    a = np.frombuffer(base64.b64decode(b64), dtype=np.uint8).reshape(-1, width)
    cols = a.sum(axis=0)
    return (cols * np.arange(width)).sum() / cols.sum()


def check_orientation(layers, ni, nj):
    """Fail the build if left/right or anterior/posterior is flipped."""
    # AP columns: patient right on the viewer's left, so every left
    # territory must sit right of its right-side partner.
    for lab in range(1, 31, 2):
        l = _centroid_col(layers[lab]["ap"], ni)
        r = _centroid_col(layers[lab + 1]["ap"], ni)
        if not l > r:
            sys.exit(f"AP orientation: label {lab} (left) not right of {lab + 1}")
    # Lateral data columns run posterior -> anterior: frontal MCA must be
    # at a higher column than occipital PCA.
    front = _centroid_col(layers[8]["lat"], nj)
    occ = _centroid_col(layers[20]["lat"], nj)
    if not front > occ:
        sys.exit("lateral orientation: frontal not anterior to occipital")


def tissue_weight(shape, gm_path, wm_path):
    """Resample GM + 0.5 WM onto the atlas grid (both are integer-mm grids)."""
    gm, wm = nib.load(gm_path), nib.load(wm_path)
    if not np.allclose(gm.affine, wm.affine) or nib.aff2axcodes(gm.affine) != ("R", "A", "S"):
        sys.exit("unexpected tissue map geometry")
    g = gm.get_fdata() / gm.get_fdata().max()
    w = wm.get_fdata() / wm.get_fdata().max()
    inv = np.linalg.inv(gm.affine)
    ni, nj, nk = shape
    i, j, k = np.arange(ni), np.arange(nj), np.arange(nk)
    ti = np.rint(inv[0, 0] * (90 - i) + inv[0, 3]).astype(int)
    tj = np.rint(inv[1, 1] * (j - 126) + inv[1, 3]).astype(int)
    tk = np.rint(inv[2, 2] * (k - 72) + inv[2, 3]).astype(int)
    vi = (ti >= 0) & (ti < g.shape[0])
    vj = (tj >= 0) & (tj < g.shape[1])
    vk = (tk >= 0) & (tk < g.shape[2])
    out = np.zeros(shape, np.float32)
    sel = np.ix_(ti[vi], tj[vj], tk[vk])
    out[np.ix_(vi, vj, vk)] = g[sel] + 0.5 * w[sel]
    brain = np.zeros(shape, bool)
    brain[np.ix_(vi, vj, vk)] = (g[sel] + w[sel]) > 0.5
    return out, brain


def main(src, gm_path, wm_path, out):
    img = nib.load(src)
    vol = np.asarray(img.dataobj)
    if vol.ndim == 4:
        vol = vol[..., 0]
    vol = np.rint(vol).astype(np.int16)
    # The header carries no MNI origin, only orientation; insist on it.
    if nib.aff2axcodes(img.affine) != ("L", "A", "S"):
        sys.exit(f"unexpected orientation {nib.aff2axcodes(img.affine)}")
    ni, nj, nk = vol.shape
    weight, brain = tissue_weight(vol.shape, gm_path, wm_path)
    terr = (vol >= 1) & (vol <= 32)
    dice = 2 * (terr & brain).sum() / (terr.sum() + brain.sum())
    print(f"alignment check: Dice(territories, template brain) = {dice:.3f}")
    if dice < 0.9:
        sys.exit("territories do not line up with the template; check the origin")
    raw = {}
    for lab, name in LABELS.items():
        m = vol == lab
        if not m.any():
            sys.exit(f"label {lab} ({name}) is empty")
        wm_ = np.where(m, weight, 0)
        raw[lab] = (name, wm_.sum(axis=1).T[::-1, :], wm_.sum(axis=0).T[::-1, :])
    peak = max(max(a.max(), b.max()) for _, a, b in raw.values())
    scale = float(np.floor(255 / peak))
    layers = {}
    for lab, (name, ap, lat) in raw.items():
        # AP: summed along anterior-posterior (j). Rows: superior at top.
        # Columns: i ascending = patient right -> left, so patient right sits
        # on the viewer's left (frontal radiographic convention).
        # Lateral: summed along left-right (i). Columns: j ascending =
        # posterior -> anterior; the viewer flips it to anterior-left.
        ap = np.rint(ap * scale).astype(np.uint8)
        lat = np.rint(lat * scale).astype(np.uint8)
        layers[lab] = {
            "name": name,
            "ap": base64.b64encode(ap.astype(np.uint8).tobytes()).decode(),
            "lat": base64.b64encode(lat.astype(np.uint8).tobytes()).decode(),
        }
    check_orientation(layers, ni, nj)
    meta = {
        "source": "Liu CF et al. Sci Data 2023;10:74 (Arterial_Atlas, level 1)",
        "licence": "CC BY-SA 4.0",
        "apShape": [nk, ni],
        "latShape": [nk, nj],
        "units": "blood-volume-weighted path length (mm) = value / scale",
        "scale": scale,
        "tissue": "ICBM 2009a sym GM/WM probability (nilearn copy), GM + 0.5 WM",
        "alignmentDice": round(float(dice), 3),
        "layers": layers,
    }
    with open(out, "w") as f:
        f.write("// Generated by pipeline/angio_territory_projections.py. "
                "Do not edit. CC BY-SA 4.0 (derived from Liu et al. 2023).\n")
        f.write("window.TERRITORY_PROJECTIONS = ")
        json.dump(meta, f, separators=(",", ":"))
        f.write(";\n")


if __name__ == "__main__":
    main(*sys.argv[1:5])
