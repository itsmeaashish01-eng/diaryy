"""Small self-contained demo tree (crude right carotid territory + a few veins).

Used by tests/test_engine.py and ``python -m dsa_sim.cli demo``.  It exercises every
engine feature (landmark joins, branch_from, collateral, twig growth, veins) but it
is NOT the full anatomy - that is built by dsa_sim.anatomy.build_full_tree().
"""
from __future__ import annotations

import numpy as np

from . import frame as F
from .tree import VesselTree


def build_demo_tree(seed=0, twigs=True) -> VesselTree:
    L = F.L
    t = VesselTree()
    # --- neck
    t.add_vessel("CCA_R", "Common carotid artery", [L("CCA_origin_R"), (22.5, 7.0, -165.0), L("carotid_bifurcation", "R")],
                 (3.6, 3.4), group="neck", side="R")
    t.branch_from("CCA_R", -1, "ICA_cervical_R", "ICA (cervical segment)",
                  [L("ICA_bulb", "R"), L("ICA_C2", "R"), L("ICA_C1", "R"), L("ICA_skull_base_entry", "R")],
                  [3.2, 3.0, 2.4, 2.35, 2.3], group="ICA", territory="ICA_R", label_anchor=("frac", 0.6))
    t.branch_from("CCA_R", -1, "ECA_R", "External carotid artery",
                  [L("ECA_proximal", "R"), (24.0, 12.0, -90.0), (30.0, 10.0, -70.0)], (2.0, 1.4), group="ECA",
                  territory="ECA_R")
    # --- intracranial ICA (petrous -> terminus)
    t.branch_from("ICA_cervical_R", -1, "ICA_R", "Cavernous segment ICA",
                  [L("ICA_petrous_genu", "R"), L("ICA_foramen_lacerum", "R"), L("ICA_cav_posterior_genu", "R"),
                   L("ICA_cav_anterior_genu", "R"), L("ICA_clinoid", "R"), L("OA_origin", "R"), L("PComm_origin", "R"),
                   L("AChA_origin", "R"), L("ICA_terminus", "R")],
                  [2.3, 2.3, 2.2, 2.1, 2.0, 1.95, 1.9, 1.85, 1.8, 1.8], group="ICA", label_anchor=L("ICA_cav_anterior_genu", "R"))
    ica = t["ICA_R"]
    ci = ica.ctrl_index
    ica.name = "Cavernous segment ICA"
    ica.label_anchor = (ci[3] + ci[4]) // 2
    ica.meta["extra_labels"] = [["ICA (vertical petrous segment)", (ci[0] + ci[1]) // 2],
                                ["ICA (horizontal petrous segment)", (ci[1] + ci[2]) // 2],
                                ["Supraclinoid segment ICA", (ci[7] + ci[8]) // 2]]
    t.branch_from("ICA_R", L("OA_origin", "R"), "OA_R", "Ophthalmic artery (OA)",
                  [L("optic_canal", "R"), L("orbit_apex", "R"), (22.0, 40.0, -24.0), (18.0, 58.0, -18.0)],
                  (0.75, 0.4), group="ICA", label_anchor=-6)
    # --- MCA
    m1 = t.branch_from("ICA_R", -1, "M1_R", "MCA (M1)", [L("MCA_bifurcation", "R"), L("MCA_genu", "R")], (1.5, 1.35),
                       group="MCA", territory="MCA_R")
    targets = {
        "Prerolandic artery": [(38.0, 4.0, 4.0), (39.0, 2.0, 18.0), (52.0, 2.0, 30.0), (52.0, -2.0, 52.0)],
        "Angular artery MCA": [(39.0, -14.0, 2.0), (40.0, -26.0, 16.0), (54.0, -42.0, 26.0), (48.0, -62.0, 38.0)],
        "Temporo-occipital branch MCA": [(40.0, -10.0, -6.0), (46.0, -30.0, -2.0), (58.0, -50.0, -8.0), (52.0, -72.0, -4.0)],
    }
    for k, (nm, pts) in enumerate(targets.items()):
        pts = np.array(pts)
        pts[-1] = F.project_to_cortex(pts[-1], -0.8)
        pts[-2] = F.project_to_cortex(pts[-2], -0.8)
        v = t.branch_from(m1, -1, f"MCA_br{k}_R", nm, pts, (1.1, 0.7), group="MCA", label_anchor=-3)
        if twigs:
            t.grow_distal_branches(v.id, n_branches=5, depth=2, start_frac=0.55, seed=seed + k)
    # --- ACA (pericallosal) + ACom collateral stub to the left A1
    t.branch_from("ICA_R", -1, "A1_R", "ACA (A1)", [(7.0, 7.0, -10.0), L("A1A2_junction", "R")], (1.15, 1.05),
                  group="ACA", territory="ACA_R")
    cc = F.callosal_curve(3.0, x=2.0, n=24, start=0.08, end=0.95)
    peri = t.branch_from("A1_R", -1, "pericallosal_R", "Pericallosal branch ACA",
                         np.vstack([(1.8, 18.0, -4.0), cc]), (1.05, 0.55), group="ACA", label_anchor=8)
    if twigs:
        t.grow_distal_branches(peri.id, n_branches=6, depth=1, start_frac=0.2, seed=seed + 11, surface="brain",
                               angle_deg=(50, 85))
    t.add_vessel("A1_L", "ACA (A1) left", [L("ICA_terminus", "L"), (-7.0, 7.0, -10.0), L("A1A2_junction", "L")],
                 (1.1, 1.0), group="ACA", side="L", territory="ACA_L")
    t.add_collateral("ACom", "Anterior communicating artery", ("A1_R", -1), ("A1_L", -1), radius=0.75,
                     fill_fraction=0.35)
    # --- veins: SSS -> torcular -> right transverse/sigmoid -> IJV, one cortical vein
    sss = t.add_vessel("SSS", "Superior sagittal sinus",
                       [L("SSS_anterior"), L("SSS_bregma"), L("SSS_vertex"), L("SSS_lambda"), L("torcular")],
                       (1.2, 3.6), system="vein", group="venous", flow_direction=1, label_anchor=("frac", 0.45))
    t.branch_from(sss, -1, "TS_R", "Transverse sinus",
                  [L("transverse_mid_R"), L("sigmoid_transverse_junction_R"), L("sigmoid_mid_R"), L("jugular_bulb_R"),
                   L("jugular_foramen_R"), L("IJV_C2_R")], (3.6, 4.2), system="vein", group="venous",
                  flow_direction=1)
    p_end = F.project_to_cortex((56.0, -20.0, 20.0), -1.0)
    p_mid = F.project_to_cortex((36.0, -16.0, 62.0), -1.0)
    cv = t.branch_from(sss, (0.0, -14.0, 74.0), "trolard_R", "Vein of Trolard", [p_mid, p_end], (1.3, 0.7),
                       system="vein", group="venous", label_anchor=4)
    if twigs:
        t.grow_distal_branches(cv.id, n_branches=4, depth=1, start_frac=0.3, seed=seed + 21, surface="brain",
                               surface_depth=-1.2)
    return t


def build_stress_tree(target_segments=30000, seed=0):
    """Demo tree densified with extra procedural twigs (for timing benchmarks)."""
    t = build_demo_tree(seed=seed)
    rng = np.random.default_rng(seed)
    k = 0
    while t.n_segments() < target_segments and k < 400:
        cands = [v for v in t if v.system == "artery" and v.group in ("MCA", "ACA") and v.n > 6
                 and v.radii[0] > 0.25]
        v = cands[int(rng.integers(len(cands)))]
        t.grow_distal_branches(v.id, n_branches=6, depth=1, start_frac=0.1, seed=seed + 100 + k, include_tip=False,
                               min_radius=0.12)
        k += 1
    return t


def run_engine_demo(out_dir, n_frames=12, size=768, verbose=True):
    """Build the demo tree, simulate a right ICA injection and write the engine demo set."""
    import json
    import os
    import time

    from . import hemo
    from . import io_utils as IO
    from . import render as R
    from .parenchyma import Parenchyma

    os.makedirs(out_dir, exist_ok=True)
    timing = {}
    t0 = time.time()
    tree = build_demo_tree()
    timing["demo_tree_build_s"] = round(time.time() - t0, 2)
    timing["demo_tree"] = tree.summary()
    par = Parenchyma.build()
    t0 = time.time()
    b = hemo.simulate(tree, "ICA_R", parenchyma=par)
    timing["hemo_s"] = round(time.time() - t0, 3)
    timing["phase_peaks_s(arterial,capillary,venous)"] = [round(x, 2) for x in b.phase_times()]
    times = R.default_times(n_frames, 9.0)
    files = []
    for vn in ("LAT", "AP"):
        view = R.get_view(vn, size=size)
        t0 = time.time()
        rr = R.RunRenderer(tree, b, view, parenchyma=par)
        timing[f"{vn}_projector_build_s"] = round(time.time() - t0, 3)
        t0 = time.time()
        frames = rr.frames(times)
        timing[f"{vn}_per_frame_s"] = round((time.time() - t0) / len(times), 4)
        files.append(IO.save_mp4(frames, os.path.join(out_dir, f"demo_{vn}_cine.mp4"), fps=3))
        files.append(IO.save_gif(frames, os.path.join(out_dir, f"demo_{vn}_cine.gif"), fps=3, scale=0.5))
        m = IO.montage([f[::2, ::2] for f in frames], cols=6, labels=[f"{t:.1f} s" for t in times])
        p = os.path.join(out_dir, f"demo_{vn}_montage.png")
        m.save(p, optimize=True)
        files.append(p)
        ta = 1.5
        lab = R.label_overlay(rr.frame(ta), tree, view, opacity=rr.vessel_opacity(ta),
                              title=f"Engine demo: right ICA injection, {vn}, t = {ta:.1f} s",
                              footnote="Educational simulation - crude demo tree, not the full anatomy")
        p = os.path.join(out_dir, f"demo_{vn}_labeled.png")
        lab.save(p, optimize=True)
        files.append(p)
        if vn == "LAT":
            files.append(IO.save_png(rr.frame(ta, mode="unsub"), os.path.join(out_dir, "demo_LAT_unsubtracted.png")))
    segs = R.segments_from_tree(tree, b.ix)
    t0 = time.time()
    ra = R.render_3dra(tree, R.rotational_view(90, size=size), bolus=b, segs=segs)
    timing["3dra_frame_s"] = round(time.time() - t0, 3)
    files.append(IO.save_png(ra, os.path.join(out_dir, "demo_3dra_LAT.png")))
    amp = {vid: float(b.A[b.ix.vessel_slice(vid)].max()) for vid in b.ix.vids if tree[vid].system == "artery"}
    lab = R.label_overlay(ra, tree, R.rotational_view(90, size=size), opacity=amp, threshold=0.15, dark=True,
                          title="Engine demo: 3D rotational angiogram (LAO 90)")
    p = os.path.join(out_dir, "demo_3dra_labeled.png")
    lab.save(p, optimize=True)
    files.append(p)
    spin = [R.render_3dra(tree, R.rotational_view(a, size=320), bolus=b, segs=segs) for a in range(0, 360, 30)]
    files.append(IO.save_gif(spin, os.path.join(out_dir, "demo_3dra_spin.gif"), fps=6))
    tree.to_json(os.path.join(out_dir, "demo_tree.json"), decimals=1)
    files.append(os.path.join(out_dir, "demo_tree.json"))
    # --- timing benchmark on a ~30k segment tree
    t0 = time.time()
    st = build_stress_tree(30000)
    timing["stress_tree_build_s"] = round(time.time() - t0, 1)
    timing["stress_segments"] = st.n_segments()
    t0 = time.time()
    sb = hemo.simulate(st, "ICA_R", parenchyma=par)
    timing["stress_hemo_s"] = round(time.time() - t0, 2)
    view = R.get_view("LAT", size=768)
    t0 = time.time()
    srr = R.RunRenderer(st, sb, view, parenchyma=par)
    timing["stress_projector_build_s"] = round(time.time() - t0, 2)
    timing["stress_nnz"] = int(srr.proj.nnz)
    t0 = time.time()
    sf = srr.frames(times)
    timing["stress_per_frame_s"] = round((time.time() - t0) / len(times), 4)
    timing["stress_first_frame_incl_build_s"] = round(timing["stress_projector_build_s"] + timing["stress_per_frame_s"], 2)
    t0 = time.time()
    sra = R.render_3dra(st, R.rotational_view(90, size=768), bolus=sb)
    timing["stress_3dra_frame_s"] = round(time.time() - t0, 2)
    files.append(IO.save_png(sf[3], os.path.join(out_dir, "stress_LAT_frame.png")))
    files.append(IO.save_png(sra, os.path.join(out_dir, "stress_3dra_LAT.png")))
    with open(os.path.join(out_dir, "timings.json"), "w") as f:
        json.dump(timing, f, indent=1)
    if verbose:
        print(json.dumps(timing, indent=1))
    return files, timing
