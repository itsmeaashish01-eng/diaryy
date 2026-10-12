"""Engine unit / smoke tests (plain asserts; run:  python tests/test_engine.py [--quick]).

--quick skips writing the engine demo set (output/engine_demo) and the 30k-segment
timing benchmark.
"""
from __future__ import annotations

import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from dsa_sim import frame as F  # noqa: E402
from dsa_sim import hemo, render as R  # noqa: E402
from dsa_sim.tree import MAX_STEP, VesselTree  # noqa: E402

PASSED = []


def test(fn):
    def run():
        t0 = time.time()
        fn()
        PASSED.append(fn.__name__)
        print(f"  ok  {fn.__name__}  ({time.time() - t0:.2f}s)")
    run.__name__ = fn.__name__
    return run


# ----------------------------------------------------------------------------- frame
@test
def test_head_dimensions():
    ys = np.linspace(-130, 110, 2401)
    line = np.stack([np.zeros_like(ys), ys, np.full_like(ys, -5.0)], 1)
    outer = ys[F.skull_outer_sdf(line) < 0]
    ap = outer.max() - outer.min()
    assert 175 <= ap <= 186, ap
    xs = np.linspace(-90, 90, 1801)
    width = 0
    for y in (-40, -30, -20, -10):
        for z in (0, 10, 20, 30):
            l2 = np.stack([xs, np.full_like(xs, y), np.full_like(xs, z)], 1)
            o = xs[F.skull_outer_sdf(l2) < 0]
            width = max(width, o.max() - o.min())
    assert 140 <= width <= 150, width
    # brain inside the inner table everywhere
    P = np.random.default_rng(0).uniform(-90, 90, (40000, 3))
    inb = (F.brain_sdf(P) < 0) & (P[:, 2] > -66)       # (the cord continues below the foramen magnum)
    assert np.all(F.skull_inner_sdf(P[inb]) < -1.0)
    b = P[inb]
    assert 150 < b[:, 1].max() - b[:, 1].min() < 175
    assert 120 < b[:, 0].max() - b[:, 0].min() < 140


@test
def test_landmark_compartments():
    intracranial = ["ICA_clinoid_R", "ICA_terminus_R", "ICA_terminus_L", "MCA_genu_R", "ACom_center", "basilar_tip",
                    "VB_junction", "PCA_P1P2_R", "sylvian_point_L", "torcular", "SSS_vertex", "vein_of_Galen",
                    "straight_sinus_start", "venous_angle_R", "A1A2_junction_L", "PComm_origin_R"]
    for k in intracranial:
        assert F.skull_inner_sdf(F.LANDMARKS[k]) < 0, k
    extracranial = ["carotid_bifurcation_R", "ICA_C2_L", "VA_C6_foramen_entry_R", "aortic_arch_apex", "IJV_C2_R"]
    for k in extracranial:
        assert F.skull_inner_sdf(F.LANDMARKS[k]) > 0, k
    # cisternal arteries are outside the brain parenchyma
    for k in ["ICA_terminus_R", "basilar_tip", "VB_junction", "ACom_center", "PCA_P1P2_L"]:
        assert F.brain_sdf(F.LANDMARKS[k]) > -0.5, (k, F.brain_sdf(F.LANDMARKS[k]))
    # sinuses hug the inner table
    for k in ["SSS_anterior", "SSS_vertex", "SSS_lambda", "transverse_mid_R", "torcular"]:
        d = F.skull_inner_sdf(F.LANDMARKS[k])
        assert -7 < d < 0, (k, d)
    # bilateral symmetry
    for k in F.LANDMARKS:
        if k.endswith("_R") and k[:-2] + "_L" in F.LANDMARKS and not k.startswith(("VA_origin", "subclavian", "CCA_origin")):
            assert np.allclose(F.mirror(F.LANDMARKS[k]), F.LANDMARKS[k[:-2] + "_L"], atol=0.11), k
    # basilar lies in front of the brainstem and behind the clivus
    bas = np.linspace(F.L("VB_junction"), F.L("basilar_tip"), 20)
    assert np.all(F.brainstem_sdf(bas) > 0.5)
    assert np.all(bas[:, 1] < np.array([-7 - (-24 - z) * 18 / 42 for z in bas[:, 2]]) + 1)
    # carotid bifurcation at C3-C4
    assert abs(F.L("carotid_bifurcation", "R")[2] - F.vertebra_level_z("C3-C4")) < 6


@test
def test_projection_to_cortex():
    P = np.random.default_rng(1).uniform(-60, 60, (500, 3))
    Q = F.project_to_cortex(P, 1.5)
    assert np.percentile(np.abs(F.brain_sdf(Q) + 1.5), 95) < 0.3
    Q2 = F.project_to_cortex(P, -0.8, fast=False)
    assert np.percentile(np.abs(F.brain_sdf(Q2) - 0.8), 95) < 0.1
    cc = F.callosal_curve(3.0)
    assert cc.shape[1] == 3 and np.all(np.abs(cc[:, 0]) < 1e-9)
    assert set(F.lobe_of(np.array([[40, 30, 30], [40, -40, 40], [50, 0, -30], [20, -88, 5], [20, -60, -40]]))) == \
        {"frontal", "parietal", "temporal", "occipital", "cerebellum"}


# ----------------------------------------------------------------------------- tree
@test
def test_tree_spline_and_json():
    t = VesselTree()
    ctrl = [F.L("ICA_terminus", "R"), F.L("MCA_bifurcation", "R"), F.L("MCA_genu", "R"), (40, -5, 10)]
    v = t.add_vessel("M1_R", "MCA (M1)", ctrl, [1.5, 1.4, 1.3, 1.1], group="MCA", side="R")
    assert np.allclose(v.points[v.ctrl_index], np.array(ctrl, float))
    assert np.max(np.linalg.norm(np.diff(v.points, axis=0), axis=1)) <= MAX_STEP + 1e-6
    c = t.branch_from("M1_R", ("frac", 0.5), "br", "branch", [(30, 10, 0), (35, 20, 10)], (0.8, 0.5))
    assert c.parent == "M1_R" and np.allclose(c.points[0], v.points[c.parent_index])
    assert c.flow_direction == 1
    vein = t.add_vessel("SSS", "Superior sagittal sinus", [F.L("SSS_anterior"), F.L("SSS_vertex"), F.L("torcular")],
                        (1.5, 3.5), system="vein", group="venous")
    trib = t.branch_from("SSS", (0, -14, 74), "cv", "cortical vein", [(30, -14, 65)], 0.8)
    assert trib.flow_direction == -1 and vein.flow_direction == 1
    assert not t.validate(verbose=False)
    t2 = VesselTree.from_json(t.to_json(decimals=3))
    assert t2.ids() == t.ids()
    assert np.allclose(t2["br"].points, t["br"].points, atol=1e-3)
    assert t2["cv"].flow_direction == -1


@test
def test_grow_twigs():
    t = VesselTree()
    t.add_vessel("MCA", "x", [F.L("MCA_genu", "R"), (45, -10, 18), F.project_to_cortex((60, -30, 30), -0.8)],
                     (1.0, 0.7), group="MCA", side="R", territory="MCA_R")
    ids = t.grow_distal_branches("MCA", n_branches=5, depth=2, seed=3)
    assert len(ids) >= 5
    P = np.vstack([t[i].points[3:] for i in ids])
    assert np.percentile(np.abs(F.brain_sdf(P) - 0.8), 90) < 0.5     # on the pial shell
    assert np.all(P[:, 0] > 0)                                          # stays on the right
    for i in ids:
        tw = t[i]
        assert tw.radii.min() >= 0.1 and tw.radii[0] <= t[tw.parent].radii[tw.parent_index] + 1e-9
    t2 = VesselTree()
    t2.add_vessel("MCA", "x", [F.L("MCA_genu", "R"), (45, -10, 18), F.project_to_cortex((60, -30, 30), -0.8)],
                  (1.0, 0.7), group="MCA", side="R", territory="MCA_R")
    ids2 = t2.grow_distal_branches("MCA", n_branches=5, depth=2, seed=3)
    assert len(ids2) == len(ids) and np.allclose(t2[ids2[-1]].points, t[ids[-1]].points)
    assert not t.validate(verbose=False)


# ----------------------------------------------------------------------------- hemo
def _posterior_toy():
    t = VesselTree()
    for s in "RL":
        t.add_vessel(f"VA_{s}", "Vertebral artery", [F.L("VA_C6_foramen_entry", s), F.L("VA_C2_foramen", s),
                     F.L("VA_C1_exit", s), F.L("VA_C1_sulcus", s), F.L("VA_dural_entry", s), F.L("VB_junction")],
                     (1.9, 1.7), group="VB", side=s)
        t.branch_from(f"VA_{s}", F.L("VA_dural_entry", s) + (0, 4, 4), f"PICA_{s}", "PICA",
                      [(10 * (1 if s == 'R' else -1), -50, -60), (14 * (1 if s == 'R' else -1), -70, -50)], 0.75)
    t.branch_from("VA_L", -1, "basilar", "Basilar artery", [F.L("basilar_tip")], (1.8, 1.6), group="VB", side=None)
    t.set_merge("VA_R", "basilar", 0)
    for s in "RL":
        t.branch_from("basilar", -1, f"P1_{s}", "P1", [F.L("PCA_P1P2", s)], 1.0, side=s)
        t.branch_from(f"P1_{s}", -1, f"PCA_{s}", "PCA", [F.L("PCA_P2P3", s), F.L("calcarine_point", s)], (1.0, 0.7), side=s)
        t.add_vessel(f"ICA_{s}", "ICA", [F.L("ICA_skull_base_entry", s), F.L("ICA_cav_anterior_genu", s),
                     F.L("PComm_origin", s), F.L("ICA_terminus", s)], (2.3, 1.9), group="ICA", side=s)
        t.branch_from(f"ICA_{s}", -1, f"M1_{s}", "M1", [F.L("MCA_genu", s)], 1.4, side=s)
        t.add_collateral(f"PComm_{s}", "Posterior communicating artery", (f"ICA_{s}", F.L("PComm_origin", s)),
                         (f"P1_{s}", -1), radius=0.7, fill_fraction=0.6)
    return t


@test
def test_hemo_vertebral_confluence_and_pcomm():
    t = _posterior_toy()
    b = hemo.simulate(t, "VA_L")
    A = lambda vid: b.A[b.ix.vessel_slice(vid)]  # noqa: E731
    assert b.injection.vessel == "VA_L"
    assert 0.6 < A("basilar").max() < 0.86
    assert A("PCA_R").max() > 0.6 and A("PCA_L").max() > 0.6
    # contralateral VA: retrograde reflux decays away from the VB junction
    var = A("VA_R")
    assert var[-1] > 0.3 and var[0] < 0.05
    assert A("PICA_R").max() > 0.05                     # contralateral PICA via reflux
    assert A("PComm_R").max() > 0.2                      # PComm fills retrogradely
    assert A("M1_R").max() < 0.1                         # washed out by unopacified ICA flow
    # timing: distal later than proximal
    sl = b.ix.vessel_slice("PCA_L")
    assert b.tau[sl][-1] > b.tau[b.ix.vessel_slice("basilar")][0]


@test
def test_hemo_ica_demo_phases():
    from dsa_sim.demo import build_demo_tree
    t = build_demo_tree(twigs=True)
    b = hemo.simulate(t, "ICA_R")
    A = lambda vid: b.A[b.ix.vessel_slice(vid)]  # noqa: E731
    assert A("M1_R").min() > 0.8 and A("ECA_R").max() < 0.05 and A("CCA_R").max() < 0.05
    assert 0.1 < A("A1_L").max() < 0.5               # cross filling through the ACom
    ta, tc, tv = b.phase_times()
    assert 0.8 < ta < 2.6 and ta < tc < tv and 3.0 < tv < 6.5, (ta, tc, tv)
    c = b.vessel_conc("M1_R", np.array([0.0, 1.0, 2.0, 6.0]))
    assert c[:, 0].max() < 0.05 and c[:, 1].min() > 0.7 and c[:, 3].max() < 0.05
    cs = b.vessel_conc("SSS", np.array([1.0, 4.5, 12.0]))
    assert cs[:, 0].max() < 0.05 and cs[:, 1].max() > 0.3 and cs[:, 2].max() < 0.05


# ----------------------------------------------------------------------------- render
@test
def test_view_orientation():
    ap = R.get_view("AP_TRUE")
    lat = R.get_view("LAT")
    c = np.array(ap.center)
    x, y, _, _ = ap.project(np.array([c + (40, 0, 0), c + (-40, 0, 0), c + (0, 0, 40)]))
    assert x[0] < ap.size / 2 < x[1], "AP: patient right must be on viewer's left"
    assert y[2] < ap.size / 2, "AP: superior must be up"
    x, y, _, _ = lat.project(np.array([c + (0, 40, 0), c + (0, -40, 0), c + (0, 0, 40)]))
    assert x[0] < lat.size / 2 < x[1], "LAT: face must be on viewer's left"
    assert y[2] < lat.size / 2
    # magnification at the isocentre
    x, _, _, m = ap.project(np.array([c, c + (-10, 0, 0)]))
    assert abs(m[0] - ap.sid / ap.sod) < 1e-6
    assert abs((x[1] - x[0]) * ap.pixel_mm - 10 * ap.sid / ap.sod) < 1e-3
    # Towne: posterior-superior structures project upward relative to AP
    tw = R.get_view("TOWNE")
    p = np.array([[0, -80, 10.0], [0, -10, -50.0]])
    assert tw.project(p)[1][0] < tw.project(p)[1][1]


@test
def test_chord_integral_conserves_volume():
    from dsa_sim.render import Projector, Segments
    view = R.get_view("AP_TRUE", size=512)
    c = np.array(view.center)
    cases = [((c + (-10, 0, 0)), (c + (10, 0, 0)), 2.0),       # perpendicular to the beam
             ((c + (-8, -6, 4)), (c + (8, 6, -4)), 1.5),          # oblique
             ((c + (0, -10, 0)), (c + (0, 10, 0)), 1.0),          # end-on (along the beam)
             ((c + (-5, 0, 0)), (c + (5, 0, 0)), 0.12)]           # thinner than a pixel
    for p0, p1, r in cases:
        n = max(8, int(np.linalg.norm(np.asarray(p1) - p0) / 0.8))     # ~0.8 mm segments like real trees
        pts = np.linspace(p0, p1, n + 1)
        segs = Segments(pts[:-1], pts[1:], np.full(n, r), np.zeros(n, int), np.zeros(n, int), np.zeros(n, int),
                        np.zeros(n, bool))
        pr = Projector(view, segs)
        img = pr.image(np.ones(n))
        mag = view.sid / view.sod
        area = (view.pixel_mm / mag) ** 2
        vol = img.sum() * area
        true = math.pi * r * r * np.linalg.norm(np.asarray(p1) - p0)
        assert abs(vol / true - 1) < 0.06, (r, vol, true)
    # perpendicular centre-line thickness == diameter
    pts = np.linspace(c + (-10, 0, 0), c + (10, 0, 0), 41)
    segs = Segments(pts[:-1], pts[1:], np.full(40, 2.0), *(np.zeros(40, int),) * 3, np.zeros(40, bool))
    img = Projector(view, segs).image(np.ones(40))
    assert abs(img.max() - 4.0) < 0.1, img.max()


@test
def test_render_pipeline_small():
    from dsa_sim.demo import build_demo_tree
    from dsa_sim.parenchyma import Parenchyma
    t = build_demo_tree(twigs=False)
    par = Parenchyma.build(spacing=4.0)
    b = hemo.simulate(t, "ICA_R", parenchyma=par)
    for vn in ("LAT", "AP", "TOWNE"):
        rr = R.RunRenderer(t, b, R.get_view(vn, size=256), parenchyma=par)
        f0, f1, f9 = rr.frames([0.0, 1.5, 12.0])
        assert f0.shape == (256, 256) and 0 <= f1.min() and f1.max() <= 1
        assert f1.min() < 0.25                               # dense ICA visible in the arterial phase
        assert abs(np.median(f1) - rr.display.bg) < 0.05     # light grey background
        assert f9.min() > 0.55                               # washed out
    ra = R.render_3dra(t, R.rotational_view(45, size=192), bolus=b)
    assert ra.max() > 0.5 and np.median(ra) < 0.02
    im = R.label_overlay(f1, t, R.get_view("TOWNE", size=256), opacity=rr.vessel_opacity(1.5))
    assert im.size[0] > 256


def main():
    quick = "--quick" in sys.argv
    tests = [test_head_dimensions, test_landmark_compartments, test_projection_to_cortex, test_tree_spline_and_json,
             test_grow_twigs, test_hemo_vertebral_confluence_and_pcomm, test_hemo_ica_demo_phases,
             test_view_orientation, test_chord_integral_conserves_volume, test_render_pipeline_small]
    print("dsa_sim engine tests")
    for t in tests:
        t()
    print(f"{len(PASSED)}/{len(tests)} passed")
    if not quick:
        from dsa_sim.cli import OUTPUT_ROOT
        from dsa_sim.demo import run_engine_demo
        print("writing engine demo set ...")
        run_engine_demo(os.path.join(OUTPUT_ROOT, "engine_demo"))


if __name__ == "__main__":
    main()
