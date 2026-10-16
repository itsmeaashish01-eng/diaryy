"""Anatomy part 'neck_eca': aortic arch, great vessels, subclavian branches, common and
cervical internal carotid arteries, the external carotid artery with all its named
branches, and the extradural (V1-V3) vertebral arteries.

Canonical vessel ids created here (``X`` = ``R`` | ``L``):

    aortic_arch, brachiocephalic, subclavian_X, CCA_X
    ICA_cervical_X     child of CCA_X at its last point (= carotid_bifurcation_X);
                       LAST POINT EXACTLY ``ICA_skull_base_entry_X``  -> anterior part continues.
    VA_extradural_X    V1-V3, child of subclavian_X at ``VA_origin_X``; passes the C6..C1
                       transverse foramina, ``VA_C1_exit_X``, ``VA_C1_sulcus_X``;
                       LAST POINT EXACTLY ``VA_dural_entry_X``.  Display name
                       'Vertebral artery (extradural)'.  The posterior part continues V4 with
                       ``tree.branch_from(f"VA_extradural_{s}", -1, f"VA_{s}", "Vertebral artery (intradural)", ...)``.
    ECA_X, sup_thyroid_X, asc_pharyngeal_X, lingual_X, facial_X, angular_X, occipital_X,
    post_auricular_X, STA_X, STA_frontal_X, STA_parietal_X, IMA_X, MMA_X, MMA_frontal_X,
    MMA_parietal_X, acc_meningeal_X, inf_alveolar_X, deep_temporal_ant_X, deep_temporal_post_X,
    infraorbital_X, sphenopalatine_X, desc_palatine_X, ...
    thyrocervical_X, inf_thyroid_X, asc_cervical_X, transverse_cervical_X, suprascapular_X,
    costocervical_X, deep_cervical_X, supreme_intercostal_X, int_thoracic_X
    C1_anastomosis_X   collateral VA_extradural_X (V3, C1 level) <-> occipital_X,
                       name 'C1-anastomosis to occipital artery' (the posterior part should NOT
                       add a second one when this id exists).

Geometry follows Osborn (Diagnostic Cerebral Angiography) / Rhoton: CCA bifurcation at
C3-C4 with a posterolateral carotid bulb, ECA anteromedial to the ICA, branch order superior
thyroid -> ascending pharyngeal -> lingual -> facial -> occipital -> posterior auricular ->
terminal maxillary + superficial temporal behind the mandibular neck; MMA through the
foramen spinosum; VA from the first part of the subclavian into the C6 foramen, C2 and C1
loops, V3 over the posterior arch of C1.  The left VA is dominant (natural asymmetry).
All vessels of this part carry ``meta['part'] = 'neck_eca'`` and extracranial vessels
``meta['extracranial'] = True`` (dural MMA branches ``meta['dural'] = True``).
Deterministic for a given seed.
"""
from __future__ import annotations

import numpy as np

from .. import frame as F
from ..frame import L
from ..tree import arclength, spline_through

PART = "neck_eca"


# ----------------------------------------------------------------------------
# small geometry helpers
# ----------------------------------------------------------------------------

def _P(s, *pts):
    """Right-side design points -> side ``s`` (x mirrored for the left)."""
    a = np.array(pts, float).reshape(-1, 3)
    a[:, 0] *= F.side_sign(s)
    return a


def _jit(rng, pts, amp, keep=(0,)):
    """Deterministic small perturbation (natural variation / asymmetry); rows in keep stay exact."""
    p = np.array(pts, float)
    if amp <= 0:
        return p
    d = rng.normal(0.0, amp, p.shape)
    for k in keep:
        d[k] = 0.0
    return p + d


def _tangents(P):
    T = np.gradient(P, axis=0)
    return T / np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)


def _wavy(ctrl, rng, amp=2.0, wavelength=14.0, surface=None, depth=0.0, ref=(0.0, 0.0, 1.0),
          step=1.2, every=3, fade=6.0, keep_ctrl=False):
    """Dense control polyline through ``ctrl`` with a natural sinusoidal tortuosity.

    The offset is perpendicular to the path, tangent to ``surface`` when given (scalp /
    inner table), fading to zero at both ends (so junctions stay exact).  The amplitude
    and wavelength are modulated randomly so loops look irregular.  Points are projected
    back onto ``surface`` at ``depth``.  Returns (M,3) control points.
    """
    C = np.asarray(ctrl, float)
    P, cidx = spline_through(C, step=step)
    s = arclength(P)
    if s[-1] < 2 * fade + 1:
        return C
    T = _tangents(P)
    if surface is not None:
        Nn = F.cortex_normal(P, surface)
    else:
        r = np.asarray(ref, float)
        Nn = np.cross(T, r)
        bad = np.linalg.norm(Nn, axis=1) < 1e-3
        Nn[bad] = np.cross(T[bad], (1.0, 0.0, 0.0))
        Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
        Nn = np.cross(Nn, T)
    B = np.cross(T, Nn)
    B /= np.maximum(np.linalg.norm(B, axis=1, keepdims=True), 1e-9)
    lam = wavelength * rng.uniform(0.85, 1.15)
    phase = rng.uniform(0, 2 * np.pi)
    # smoothly modulated amplitude / instantaneous frequency
    knots = np.linspace(0, s[-1], max(3, int(s[-1] / (2.5 * wavelength)) + 2))
    a_mod = np.interp(s, knots, rng.uniform(0.45, 1.25, len(knots)))
    f_mod = np.interp(s, knots, rng.uniform(0.8, 1.25, len(knots)))
    theta = phase + 2 * np.pi * np.cumsum(np.gradient(s) * f_mod / lam)
    env = np.clip(s / fade, 0, 1) * np.clip((s[-1] - s) / fade, 0, 1)
    env = env * env * (3 - 2 * env)
    off = amp * a_mod * np.sin(theta) * env
    # a little out-of-plane component (true 3-D tortuosity) when free
    Q = P + off[:, None] * B
    if surface is None:
        Q = Q + (0.35 * amp * a_mod * np.sin(0.5 * theta + 1.3) * env)[:, None] * Nn
    else:
        Q = F.project_to_surface(Q, surface, depth, iters=6)
    sel = list(range(0, len(Q), every))
    if keep_ctrl:
        sel = sorted(set(sel) | set(cidx))
    if sel[-1] != len(Q) - 1:
        sel.append(len(Q) - 1)
    Q = Q[sel]
    Q[0] = C[0]
    Q[-1] = C[-1]
    return Q


def _on_surface(pts, surface, depth, keep=()):
    """Project control points onto a surface (rows in ``keep`` untouched)."""
    p = np.array(pts, float)
    q = F.project_to_surface(p, surface, depth, iters=10)
    for k in keep:
        q[k] = p[k]
    return q


# region masks for procedural twigs
def _extracranial(P):
    P = np.atleast_2d(P)
    return (F.skull_inner_sdf(P) > 1.5) & (P[:, 2] < -30.0)


def _face_neck(P):
    P = np.atleast_2d(P)
    return (F.skull_inner_sdf(P) > 2.0) & (P[:, 2] < -40.0) & (P[:, 2] > -215.0)


def _scalp_region(zmin):
    def f(P):
        P = np.atleast_2d(P)
        return P[:, 2] > zmin
    return f


def _dural_region(P):
    P = np.atleast_2d(P)
    return (P[:, 2] > -42.0) & (np.abs(P[:, 0]) > 6.0)


# ----------------------------------------------------------------------------
# builder
# ----------------------------------------------------------------------------
class _B:
    """Thin wrapper adding part metadata to everything we create."""

    def __init__(self, tree, seed):
        self.t = tree
        self.seed = int(seed)
        self.made = []

    def _tag(self, v, extracranial=True, dural=False):
        v.meta.setdefault("part", PART)
        if extracranial:
            v.meta["extracranial"] = True
        if dural:
            v.meta["dural"] = True
        self.made.append(v.id)
        return v

    def root(self, id, name, ctrl, radius, extracranial=True, **kw):
        return self._tag(self.t.add_vessel(id, name, ctrl, radius, **kw), extracranial)

    def br(self, parent, at, id, name, ctrl, radius, extracranial=True, dural=False, **kw):
        return self._tag(self.t.branch_from(parent, at, id, name, ctrl, radius, **kw), extracranial, dural)

    def coll(self, id, name, a, b, ctrl_mid, radius, fill_fraction, **kw):
        return self._tag(self.t.add_collateral(id, name, a, b, ctrl_mid=ctrl_mid, radius=radius,
                                               fill_fraction=fill_fraction, **kw))

    def twigs(self, vid, extracranial=True, dural=False, **kw):
        kw.setdefault("seed", self.seed + 7 * len(self.made) + 3)
        ids = self.t.grow_distal_branches(vid, **kw)
        for i in ids:
            self._tag(self.t[i], extracranial, dural)
        return ids


def _great_vessels(b: _B):
    t = b.t
    # ---- aortic arch (short segment: root -> proximal descending aorta)
    arch_ctrl = [L("aortic_root"), (17.0, 27.0, -285.0), L("ascending_aorta_top"), L("brachiocephalic_origin"),
                 L("aortic_arch_apex"), L("CCA_origin_L"), L("subclavian_origin_L"), L("aortic_isthmus"),
                 (-22.0, -26.0, -272.0), L("descending_aorta")]
    b.root("aortic_arch", "Aortic arch", arch_ctrl, [14.5, 14.2, 13.8, 13.0, 12.6, 12.3, 11.8, 11.3, 11.0, 10.8],
           group="neck", label_anchor=L("aortic_arch_apex"), meta={"label_side": "right"})
    # ---- brachiocephalic trunk
    b.br("aortic_arch", L("brachiocephalic_origin"), "brachiocephalic", "Brachiocephalic trunk",
         [(13.0, 15.0, -232.0), (17.5, 12.5, -218.0), L("BCT_bifurcation")], [6.2, 6.0, 5.8, 5.6],
         group="neck", label_anchor=("frac", 0.55))
    # ---- subclavian arteries (proximal, to the lateral border of the first rib)
    b.br("brachiocephalic", -1, "subclavian_R", "Right subclavian artery",
         [(26.0, 8.0, -203.5), L("VA_origin_R"), (35.0, 4.6, -198.6), L("subclavian_apex_R"), (46.0, 2.6, -197.2),
          (53.0, 0.6, -200.0), L("subclavian_lateral_R"), (72.0, -4.0, -213.0)],
         [4.6, 4.5, 4.4, 4.2, 4.1, 4.0, 3.9, 3.8, 3.7], group="neck", side="R", territory="SCA_R",
         label_anchor=L("subclavian_lateral_R"))
    b.br("aortic_arch", L("subclavian_origin_L"), "subclavian_L", "Left subclavian artery",
         [(-18.5, -4.6, -233.0), (-23.5, -4.6, -216.0), L("VA_origin_L"), (-34.0, -4.0, -200.6), L("subclavian_apex_L"),
          (-46.0, -3.0, -199.8), (-53.0, -2.5, -202.0), L("subclavian_lateral_L"), (-72.0, -4.0, -213.0)],
         [5.0, 4.7, 4.5, 4.35, 4.2, 4.1, 4.0, 3.9, 3.8, 3.7], group="neck", side="L", territory="SCA_L",
         label_anchor=L("subclavian_lateral_L"))
    # ---- common carotid arteries (no branches until the bifurcation at C3-C4)
    b.br("brachiocephalic", -1, "CCA_R", "Right common carotid artery",
         [(22.4, 9.4, -186.0), (23.5, 7.6, -163.0), (24.3, 5.2, -140.0), L("carotid_bifurcation_R")],
         [3.75, 3.65, 3.55, 3.5, 3.55], group="neck", side="R", territory="CCA_R", label_anchor=("frac", 0.62))
    b.br("aortic_arch", L("CCA_origin_L"), "CCA_L", "Left common carotid artery",
         [(-10.5, 8.0, -226.0), (-16.0, 9.0, -206.0), (-21.0, 8.2, -182.0), (-23.6, 6.2, -157.0),
          (-24.5, 4.2, -136.0), L("carotid_bifurcation_L")],
         [3.8, 3.75, 3.7, 3.6, 3.55, 3.5, 3.55], group="neck", side="L", territory="CCA_L",
         label_anchor=("frac", 0.72))


def _cervical_ica(b: _B, s):
    # bulb: posterolateral dilatation of the proximal ICA (diameter ~7.5 mm), then ~4.7 mm
    ctrl = [_P(s, (24.9, 0.6, -113.0))[0], L("ICA_bulb", s), _P(s, (26.4, -3.6, -102.0))[0],
            L("ICA_C2", s), _P(s, (27.5, -8.2, -86.5))[0], L("ICA_C1", s), _P(s, (27.4, -11.6, -69.0))[0],
            L("ICA_skull_base_entry", s)]
    rad = [3.3, 3.75, 3.6, 2.65, 2.42, 2.38, 2.35, 2.32, 2.3]
    v = b.br(f"CCA_{s}", -1, f"ICA_cervical_{s}", "ICA (cervical segment)", ctrl, rad, group="ICA", side=s,
             territory=f"ICA_{s}", label_anchor=L("ICA_C1", s) * 0.5 + L("ICA_C2", s) * 0.5)
    ib = v.index_at(L("ICA_bulb", s))
    v.meta["extra_labels"] = [["Carotid bulb", int(ib)]]
    return v


def _eca(b: _B, s, rng):
    t = b.t
    sg = F.side_sign(s)
    J = (lambda pts, a=1.2, keep=(0,): _jit(rng, pts, a if s == "L" else 0.35 * a, keep))
    # ------------------------------------------------------------------ ECA trunk
    eca_ctrl = [L("ECA_proximal", s)] + list(J(_P(s, (22.6, 8.2, -101.0), (25.6, 6.2, -91.0), (30.2, 1.6, -80.0),
                                                 (35.4, -3.4, -70.0), (40.0, -6.8, -62.5), (42.5, -8.0, -59.0)),
                                              0.8, keep=()))
    eca = b.br(f"CCA_{s}", -1, f"ECA_{s}", "External carotid artery", eca_ctrl,
               [2.3, 2.2, 2.05, 1.88, 1.72, 1.62, 1.55, 1.5], group="ECA", side=s, territory=f"ECA_{s}",
               label_anchor=("frac", 0.28))
    E = eca.id
    at = (lambda z: int(np.argmin(np.abs(eca.points[:, 2] - z))))   # ECA index at height z

    # ------------------------------------------------------------------ 1. superior thyroid
    st = b.br(E, at(-113.0), f"sup_thyroid_{s}", "Superior thyroid artery",
              J(_P(s, (21.2, 10.5, -114.5), (19.0, 15.0, -117.5), (17.3, 17.2, -124.0), (16.2, 17.0, -135.0),
                   (15.6, 16.0, -146.0), (16.0, 14.0, -154.0))),
              [1.05, 1.0, 0.95, 0.85, 0.75, 0.7, 0.6], label_anchor=3)
    b.br(st.id, 2, f"sup_laryngeal_{s}", "",
         _P(s, (15.0, 18.5, -117.0), (10.5, 21.0, -119.5), (6.5, 20.0, -123.0)), (0.45, 0.3))
    b.br(st.id, -1, f"sup_thyroid_ant_{s}", "",
         _P(s, (12.0, 19.0, -157.0), (7.0, 21.0, -160.0), (2.0, 21.5, -162.0)), (0.5, 0.3))
    b.br(st.id, -1, f"sup_thyroid_post_{s}", "",
         _P(s, (18.5, 9.0, -160.0), (19.0, 6.0, -168.0)), (0.45, 0.3))
    b.br(st.id, 4, f"sternomastoid_{s}", "", _P(s, (22.0, 14.0, -130.0), (30.0, 10.0, -138.0), (36.0, 6.0, -150.0)),
         (0.4, 0.25))

    # ------------------------------------------------------------------ 2. ascending pharyngeal
    ap = b.br(E, at(-111.5), f"asc_pharyngeal_{s}", "Ascending pharyngeal artery",
              J(_P(s, (21.0, 3.2, -108.0), (20.4, -0.8, -98.0), (20.0, -3.8, -88.0), (19.6, -6.6, -78.0),
                   (19.2, -8.6, -69.0), (18.8, -10.4, -63.5)), 0.6),
              [0.7, 0.68, 0.65, 0.6, 0.55, 0.5, 0.48], label_anchor=3)
    nm = b.br(ap.id, -1, f"neuromeningeal_{s}", "Neuromeningeal trunk (APA)",
              _P(s, (19.6, -16.0, -63.0), (19.4, -23.0, -63.5), (18.0, -29.0, -62.0), (13.0, -30.0, -55.0),
                 (9.0, -27.0, -46.0)), [0.42, 0.38, 0.35, 0.32, 0.28, 0.25], label_anchor=2)
    b.br(nm.id, 2, f"jugular_br_{s}", "", _P(s, (25.0, -23.5, -61.0), (31.0, -22.5, -58.5)), (0.3, 0.22))
    b.br(ap.id, -1, f"pharyngeal_trunk_{s}", "",
         _P(s, (17.2, -6.0, -58.0), (16.4, -2.0, -53.0), (15.5, 1.0, -49.0)), (0.38, 0.25))
    b.br(ap.id, 2, f"inf_pharyngeal_{s}", "", _P(s, (16.0, 1.0, -96.0), (12.0, 4.0, -92.0)), (0.3, 0.2))

    # ------------------------------------------------------------------ 3. lingual
    li = b.br(E, at(-105.5), f"lingual_{s}", "Lingual artery",
              J(_P(s, (20.8, 10.8, -103.0), (19.6, 14.0, -104.5), (18.6, 18.0, -108.5), (16.8, 24.0, -107.5),
                   (14.4, 30.0, -104.5), (12.4, 37.0, -99.5), (10.4, 45.0, -95.5), (8.4, 53.0, -92.5),
                   (6.0, 61.0, -90.5))),
              [1.1, 1.05, 1.0, 0.95, 0.9, 0.82, 0.72, 0.6, 0.5, 0.42], label_anchor=4)
    b.br(li.id, 5, f"dorsal_lingual_{s}", "", _P(s, (13.0, 31.5, -96.0), (11.5, 33.0, -88.0), (9.5, 35.0, -82.0)),
         (0.45, 0.3))
    b.br(li.id, 6, f"sublingual_{s}", "",
         _P(s, (13.0, 40.0, -103.5), (12.5, 48.0, -104.5), (10.0, 56.0, -102.5), (6.0, 62.0, -100.0)), (0.5, 0.3))
    # deep lingual tortuosity
    b.twigs(li.id, n_branches=3, depth=1, start_frac=0.45, surface=None, min_radius=0.18, length_per_radius=40,
            max_length=22, tortuosity=0.3, region=_face_neck, angle_deg=(35, 70))

    # ------------------------------------------------------------------ 4. facial (tortuous -> angular)
    fa_ctrl = J(_P(s, (24.6, 13.6, -97.5), (28.0, 17.0, -93.0), (31.2, 21.6, -99.5), (35.0, 24.6, -107.5),
                   (40.2, 23.6, -112.8), (45.4, 24.0, -113.0), (45.6, 30.5, -104.5), (42.6, 40.5, -96.5),
                   (37.6, 50.0, -90.0), (32.2, 58.0, -84.5), (28.4, 63.0, -76.0)), 1.0)
    fa = b.br(E, at(-100.0), f"facial_{s}", "Facial artery", fa_ctrl,
              [1.25, 1.2, 1.15, 1.1, 1.05, 1.0, 0.95, 0.88, 0.8, 0.74, 0.68, 0.62], label_anchor=6)
    # angular artery = terminal facial along the nose to the medial canthus
    ang = b.br(fa.id, -1, f"angular_{s}", "Angular artery (facial)",
               _P(s, (24.6, 68.0, -66.0), (21.4, 71.0, -55.0), (18.6, 72.0, -44.0), (16.6, 70.0, -34.0),
                  (15.0, 67.0, -26.0)), [0.6, 0.55, 0.5, 0.45, 0.4, 0.35], label_anchor=3)
    b.br(fa.id, int(fa.n * 0.86), f"sup_labial_{s}", "",
         _P(s, (27.0, 64.0, -79.5), (17.0, 69.5, -78.0), (8.0, 72.0, -77.5), (1.5, 72.5, -77.5)), (0.42, 0.28))
    b.br(fa.id, int(fa.n * 0.74), f"inf_labial_{s}", "",
         _P(s, (30.0, 59.0, -91.0), (20.0, 65.0, -94.0), (8.0, 67.5, -95.0), (1.5, 68.0, -95.0)), (0.4, 0.26))
    b.br(fa.id, 3, f"submental_{s}", "Submental artery",
         _P(s, (36.0, 28.0, -114.5), (30.0, 40.0, -120.5), (20.0, 53.0, -125.5), (10.0, 61.0, -127.5),
            (3.0, 64.0, -128.0)), [0.6, 0.55, 0.48, 0.4, 0.33, 0.28], label_anchor=3)
    b.br(fa.id, 1, f"asc_palatine_{s}", "",
         _P(s, (24.0, 17.0, -90.0), (20.5, 18.5, -81.0), (17.5, 20.0, -73.0)), (0.4, 0.25))
    b.br(ang.id, 2, f"lat_nasal_{s}", "", _P(s, (14.0, 76.0, -54.0), (8.0, 79.0, -52.0)), (0.3, 0.2))
    b.twigs(fa.id, n_branches=5, depth=1, start_frac=0.45, surface=None, min_radius=0.18, length_per_radius=38,
            max_length=24, tortuosity=0.3, region=_face_neck, angle_deg=(40, 80), include_tip=False)

    # ------------------------------------------------------------------ 5. occipital
    deep = J(_P(s, (28.2, 0.4, -90.0), (32.2, -8.0, -86.0), (37.0, -17.0, -80.5), (40.6, -25.5, -74.0),
                (42.6, -33.5, -69.2), (42.4, -42.0, -66.4), (40.6, -51.5, -64.6), (38.8, -61.0, -61.2),
                (37.6, -70.0, -56.0)), 0.8)
    scalp = _on_surface(_P(s, (37.0, -80.0, -48.0), (35.5, -88.0, -37.0), (33.5, -95.0, -24.0), (31.0, -99.0, -8.0),
                           (28.0, -99.0, 10.0), (24.0, -94.0, 27.0), (19.0, -85.0, 43.0), (14.0, -74.0, 55.0)),
                        "scalp", 2.5)
    scalp = _wavy(np.vstack([deep[-1:], scalp]), rng, amp=2.6, wavelength=15.0, surface="scalp", depth=2.5)
    deep_w = _wavy(deep, rng, amp=1.6, wavelength=13.0, ref=(0, 0, 1), every=3)
    occ_ctrl = np.vstack([deep_w, scalp[1:]])
    oc = b.br(E, at(-91.5), f"occipital_{s}", "Occipital artery", occ_ctrl, (1.08, 0.5),
              label_anchor=0, meta={"label_side": "right" if s == "R" else "left"})
    # caliber: ~1.05 in the neck, ~0.85 at the occiput, 0.5 at the vertex
    sarc = oc.arclength()
    oc.radii = np.interp(sarc, [0, 45, 95, sarc[-1]], [1.08, 0.98, 0.82, 0.5])
    oc.label_anchor = int(np.argmin(np.linalg.norm(oc.points - _P(s, (36.0, -85.0, -40.0))[0], axis=1)))
    occ_c1 = int(np.argmin(np.linalg.norm(oc.points - _P(s, (41.0, -50.0, -65.0))[0], axis=1)))
    desc = b.br(oc.id, occ_c1, f"occipital_desc_{s}", "Descending branch occipital artery",
                _wavy(_P(s, oc.points[occ_c1] * [sg, 1, 1], (39.0, -55.0, -78.0), (35.5, -59.0, -95.0),
                         (31.0, -61.5, -112.0), (27.5, -62.5, -121.0)), rng, amp=1.2, wavelength=12.0)[1:],
                (0.6, 0.4), label_anchor=("frac", 0.5))
    b.br(oc.id, int(np.argmin(np.linalg.norm(oc.points - _P(s, (42.6, -33.5, -69.2))[0], axis=1))),
         f"occ_mastoid_{s}", "", _P(s, (45.0, -38.0, -62.0), (46.0, -42.0, -55.0)), (0.32, 0.22))
    b.br(oc.id, int(np.argmin(np.linalg.norm(oc.points - _P(s, (37.0, -17.0, -80.5))[0], axis=1))),
         f"occ_scm_{s}", "", _P(s, (42.0, -14.0, -90.0), (46.0, -10.0, -104.0)), (0.35, 0.22))
    b.twigs(oc.id, n_branches=7, depth=2, start_mm=110.0, surface="scalp", surface_depth=2.5, min_radius=0.16,
            length_per_radius=70, max_length=55, tortuosity=0.28, region=_scalp_region(-60.0), angle_deg=(30, 70))

    # ------------------------------------------------------------------ 6. posterior auricular
    pa_ctrl = np.vstack([J(_P(s, (39.6, -11.5, -66.5), (46.6, -21.0, -60.5), (53.6, -27.5, -52.5),
                              (60.0, -31.0, -43.5)), 0.6, keep=()),
                         _on_surface(_P(s, (66.0, -34.0, -29.0), (67.0, -38.0, -13.0), (64.0, -45.0, 4.0),
                                        (58.0, -52.0, 20.0)), "scalp", 2.5)])
    pa = b.br(E, at(-70.5), f"post_auricular_{s}", "Posterior auricular artery", pa_ctrl,
              [0.72, 0.7, 0.66, 0.62, 0.58, 0.52, 0.48, 0.44, 0.4], label_anchor=4)
    b.br(pa.id, 4, f"auricular_br_{s}", "", _P(s, (65.0, -28.0, -38.0), (71.0, -25.0, -33.0), (76.0, -24.0, -26.0)),
         (0.35, 0.22))
    b.twigs(pa.id, n_branches=3, depth=1, start_frac=0.55, surface="scalp", surface_depth=2.5, min_radius=0.16,
            length_per_radius=60, max_length=40, tortuosity=0.28, region=_scalp_region(-50.0))

    # ------------------------------------------------------------------ 7a. superficial temporal
    sta_ctrl = np.vstack([J(_P(s, (47.0, -9.4, -54.0), (55.0, -9.2, -47.0), (62.4, -9.0, -40.5),
                               (67.2, -8.6, -33.0)), 0.5, keep=()),
                          _on_surface(_P(s, (70.0, -8.0, -24.0), (72.6, -6.8, -14.0), (73.8, -5.2, -5.0)),
                                      "scalp", 2.5)])
    sta = b.br(E, -1, f"STA_{s}", "Superficial temporal artery", sta_ctrl,
               [1.15, 1.12, 1.08, 1.05, 1.02, 1.0, 0.97, 0.95], label_anchor=4)
    fr = _on_surface(_P(s, (74.0, 4.0, 3.0), (70.0, 18.0, 13.0), (64.0, 31.0, 23.0), (56.0, 43.0, 32.0),
                        (46.0, 54.0, 41.0), (34.0, 63.0, 49.0), (22.0, 69.0, 55.0)), "scalp", 2.5)
    fr = _wavy(np.vstack([sta.points[-1], fr]), rng, amp=3.0, wavelength=17.0, surface="scalp", depth=2.5)
    stf = b.br(sta.id, -1, f"STA_frontal_{s}", "Frontal branch STA", fr[1:], (0.82, 0.42), label_anchor=("frac", 0.35))
    pr = _on_surface(_P(s, (74.0, -11.0, 7.0), (72.0, -17.0, 22.0), (67.0, -23.0, 38.0), (59.0, -28.0, 52.0),
                        (48.0, -31.0, 63.0), (35.0, -33.0, 72.0)), "scalp", 2.5)
    pr = _wavy(np.vstack([sta.points[-1], pr]), rng, amp=3.0, wavelength=17.0, surface="scalp", depth=2.5)
    stp = b.br(sta.id, -1, f"STA_parietal_{s}", "Parietal branch STA", pr[1:], (0.78, 0.42),
               label_anchor=("frac", 0.4))
    b.br(sta.id, 1, f"transverse_facial_{s}", "Transverse facial artery",
         _P(s, (57.0, 0.0, -51.5), (58.0, 12.0, -54.5), (55.5, 26.0, -57.0), (51.0, 40.0, -59.0)), (0.5, 0.32),
         label_anchor=2)
    b.br(sta.id, 4, f"zygomatico_orbital_{s}", "",
         _on_surface(_P(s, (70.0, 2.0, -26.0), (64.0, 18.0, -22.0), (56.0, 34.0, -20.0)), "scalp", 2.0), (0.38, 0.25))
    b.br(sta.id, 3, f"middle_temporal_{s}", "", _P(s, (66.0, -4.0, -30.0), (64.5, 2.0, -20.0)), (0.35, 0.25))
    for vb, n in ((stf.id, 7), (stp.id, 7)):
        b.twigs(vb, n_branches=n, depth=2, start_frac=0.12, surface="scalp", surface_depth=2.5, min_radius=0.16,
                length_per_radius=70, max_length=50, tortuosity=0.3, region=_scalp_region(-35.0),
                angle_deg=(30, 70))

    # ------------------------------------------------------------------ 7b. internal maxillary
    ima_ctrl = J(_P(s, (39.0, -5.6, -60.6), (35.0, -2.6, -60.2), (31.6, 1.8, -59.0), (30.0, 7.5, -57.0),
                    (29.6, 13.0, -55.5), (26.8, 18.5, -55.8), (22.4, 23.0, -52.0), (18.4, 26.8, -48.5)), 0.6, keep=())
    ima = b.br(E, -1, f"IMA_{s}", "Internal maxillary artery", ima_ctrl,
               [1.4, 1.35, 1.3, 1.22, 1.15, 1.1, 1.05, 0.98, 0.9], label_anchor=5)
    I = ima.id
    ima_at = (lambda p: int(np.argmin(np.linalg.norm(ima.points - _P(s, p)[0], axis=1))))
    # --- 1st (mandibular) part
    mma_trunk = [(31.6, -2.6, -55.0), (27.6, -2.9, -50.0), (24.0, -3.0, -44.5)]
    fs = L("foramen_spinosum", s)
    mma_in = _on_surface(_P(s, (28.0, -2.8, -45.0), (36.0, -2.0, -44.0), (44.0, -0.8, -41.5),
                            (50.0, 0.0, -37.5)), "inner_table", 1.0)
    mma = b.br(I, ima_at((33.0, -1.5, -60.0)), f"MMA_{s}", "Middle meningeal artery",
               np.vstack([_P(s, *mma_trunk[:2]), fs[None], mma_in]),
               [0.95, 0.92, 0.9, 0.88, 0.86, 0.84, 0.8, 0.78], label_anchor=2, dural=True)
    mfr = _on_surface(_P(s, (54.0, 6.0, -27.0), (57.5, 12.0, -12.0), (58.6, 17.0, 4.0), (54.0, 21.0, 22.0),
                         (46.0, 22.5, 38.0), (35.0, 21.5, 52.0), (22.0, 18.5, 62.0), (10.0, 15.0, 68.0)),
                      "inner_table", 1.0)
    mfr = _wavy(np.vstack([mma.points[-1], mfr]), rng, amp=1.0, wavelength=26.0, surface="inner_table", depth=1.0)
    mf = b.br(mma.id, -1, f"MMA_frontal_{s}", "Frontal branch MMA", mfr[1:], (0.68, 0.4), label_anchor=("frac", 0.45),
              dural=True)
    mpa = _on_surface(_P(s, (56.0, -10.0, -30.0), (60.0, -24.0, -18.0), (60.0, -38.0, -2.0), (55.5, -52.0, 16.0),
                         (47.0, -64.0, 32.0), (36.0, -73.0, 44.0)), "inner_table", 1.0)
    mpa = _wavy(np.vstack([mma.points[-1], mpa]), rng, amp=1.0, wavelength=26.0, surface="inner_table", depth=1.0)
    mp = b.br(mma.id, -1, f"MMA_parietal_{s}", "Parietal branch MMA", mpa[1:], (0.62, 0.38),
              label_anchor=("frac", 0.5), dural=True)
    # petrosquamous / middle branch
    b.br(mma.id, int(mma.n * 0.82), f"MMA_petrosquamous_{s}", "",
         _on_surface(_P(s, (52.0, -14.0, -38.0), (57.0, -30.0, -32.0), (55.0, -42.0, -29.0)), "inner_table", 1.0),
         (0.35, 0.25), dural=True)
    for vb, n in ((mf.id, 5), (mp.id, 4)):
        b.twigs(vb, extracranial=False, dural=True, n_branches=n, depth=1, start_frac=0.1, surface="inner_table",
                surface_depth=1.0, min_radius=0.16, length_per_radius=65, max_length=45, tortuosity=0.12,
                angle_deg=(30, 60), region=_dural_region)
    b.br(I, ima_at((32.0, 0.5, -59.6)), f"acc_meningeal_{s}", "Accessory meningeal artery",
         np.vstack([_P(s, (28.0, 1.2, -55.0), (23.5, 1.8, -49.0)), L("foramen_ovale", s)[None],
                    _P(s, (19.6, 2.8, -41.5), (17.6, 3.5, -38.0))]),
         [0.45, 0.42, 0.4, 0.36, 0.32, 0.28], label_anchor=2)
    ia = b.br(I, ima_at((36.0, -3.6, -60.4)), f"inf_alveolar_{s}", "Inferior alveolar artery",
              J(_P(s, (39.0, 0.0, -67.0), (41.6, 6.0, -78.0), (42.6, 13.0, -92.0), (41.6, 22.0, -103.0),
                   (38.6, 33.0, -110.5), (33.6, 44.0, -113.5), (28.6, 54.0, -112.0))),
              [0.62, 0.6, 0.58, 0.55, 0.5, 0.46, 0.42, 0.38], label_anchor=3)
    b.br(ia.id, -1, f"mental_{s}", "", _P(s, (27.0, 58.0, -110.0), (20.0, 63.0, -108.0)), (0.3, 0.2))
    # --- 2nd (pterygoid) part
    dta = b.br(I, ima_at((29.6, 13.0, -55.5)), f"deep_temporal_ant_{s}", "Anterior deep temporal artery",
               np.vstack([_P(s, (36.0, 16.0, -50.0), (44.0, 19.0, -42.0)),
                          _on_surface(_P(s, (52.0, 21.0, -32.0), (57.0, 20.0, -18.0), (60.0, 18.0, -4.0),
                                         (60.0, 15.0, 10.0)), "outer_table", -1.5)]),
               [0.58, 0.55, 0.52, 0.48, 0.44, 0.4, 0.34], label_anchor=4)
    dtp = b.br(I, ima_at((30.0, 7.5, -57.0)), f"deep_temporal_post_{s}", "Posterior deep temporal artery",
               np.vstack([_P(s, (37.0, 6.0, -52.0), (46.0, 4.5, -45.0)),
                          _on_surface(_P(s, (55.0, 3.0, -35.0), (60.0, 0.0, -20.0), (62.0, -4.0, -4.0),
                                         (61.0, -8.0, 10.0)), "outer_table", -1.5)]),
               [0.55, 0.52, 0.5, 0.46, 0.42, 0.38, 0.32], label_anchor=4)
    b.br(I, ima_at((31.0, 4.0, -58.5)), f"masseteric_{s}", "",
         _P(s, (38.0, 6.0, -58.0), (45.0, 8.0, -61.0), (50.0, 10.0, -70.0), (51.0, 12.0, -80.0)), (0.4, 0.25))
    b.br(I, ima_at((27.0, 18.5, -55.8)), f"buccal_{s}", "",
         _P(s, (30.0, 26.0, -61.0), (35.0, 36.0, -68.0), (38.0, 46.0, -75.0)), (0.38, 0.22))
    b.br(I, ima_at((24.0, 21.5, -53.5)), f"post_sup_alveolar_{s}", "",
         _P(s, (25.0, 26.0, -60.0), (27.5, 32.0, -67.0), (29.0, 38.0, -71.0)), (0.4, 0.25))
    for vb in (dta.id, dtp.id):
        b.twigs(vb, n_branches=2, depth=1, start_frac=0.45, surface="outer_table", surface_depth=-1.5,
                min_radius=0.16, length_per_radius=55, max_length=30, tortuosity=0.25, region=_scalp_region(-40.0))
    # --- 3rd (pterygopalatine) part: terminal branches from the PPF
    io = b.br(I, -1, f"infraorbital_{s}", "Infraorbital artery",
              _P(s, (20.5, 32.0, -46.5), (23.6, 41.0, -47.5), (26.4, 51.0, -49.0), (27.6, 59.0, -50.5),
                 (28.0, 64.5, -53.0), (30.0, 69.0, -58.0)), [0.6, 0.55, 0.5, 0.46, 0.42, 0.38, 0.32], label_anchor=3)
    b.br(io.id, -1, f"infraorbital_face_{s}", "", _P(s, (34.0, 70.0, -64.0), (38.0, 66.0, -70.0)), (0.28, 0.2))
    sp = b.br(I, -1, f"sphenopalatine_{s}", "Sphenopalatine artery",
              _P(s, (14.5, 28.4, -47.5), (9.6, 30.8, -46.5), (6.0, 34.0, -46.0)), [0.62, 0.58, 0.55, 0.5],
              label_anchor=2)
    b.br(sp.id, -1, f"post_lat_nasal_{s}", "",
         _P(s, (7.0, 42.0, -49.0), (8.0, 52.0, -52.0), (8.0, 62.0, -55.0)), (0.42, 0.25))
    b.br(sp.id, -1, f"post_septal_{s}", "",
         _P(s, (2.6, 40.0, -42.0), (1.8, 50.0, -46.0), (1.8, 60.0, -52.0), (2.0, 68.0, -58.0)), (0.4, 0.25))
    b.br(I, -1, f"desc_palatine_{s}", "Descending palatine artery",
         _P(s, (17.0, 28.6, -56.0), (16.0, 30.0, -66.0), (14.6, 36.0, -71.2), (12.0, 46.0, -71.8),
            (8.0, 56.0, -72.0), (4.0, 62.0, -72.0)), [0.5, 0.48, 0.45, 0.4, 0.35, 0.3, 0.25], label_anchor=2)
    b.br(I, -1, f"vidian_{s}", "", _P(s, (17.5, 20.0, -46.0), (17.0, 10.0, -45.0), (17.0, 3.0, -45.0)), (0.25, 0.18))
    return eca


def _vertebral(b: _B, s, rng):
    """V1 (origin -> C6 foramen), V2 (C6..C1 transverse foramina, C2 loop), V3 (C1 loop)."""
    sp = F.SPINE
    tf = f"transverse_foramen_{s}"
    j = (lambda p, a=0.6: p + np.array([rng.normal(0, a), rng.normal(0, a * 0.5), 0.0]))
    ctrl = [
        _P(s, (30.4, 0.5, -194.0))[0], _P(s, (28.6, -7.5, -183.0))[0], _P(s, (26.2, -15.0, -172.0))[0],
        L("VA_C6_foramen_entry", s), sp["C6"][tf] + [0, 0, 1.5],
        j(_P(s, (24.4, -21.6, -152.0))[0]), sp["C5"][tf], j(_P(s, (24.5, -21.4, -136.0))[0]), sp["C4"][tf],
        j(_P(s, (24.4, -23.0, -120.0))[0]), sp["C3"][tf], _P(s, (23.6, -25.0, -103.5))[0],
        L("VA_C2_foramen", s),
        _P(s, (24.8, -26.6, -90.0))[0], _P(s, (28.8, -27.6, -88.0))[0], _P(s, (31.2, -28.4, -85.0))[0],
        L("VA_C1_foramen", s), L("VA_C1_exit", s),
        _P(s, (30.6, -35.0, -74.4))[0], _P(s, (27.4, -44.0, -74.6))[0], L("VA_C1_sulcus", s),
        _P(s, (15.2, -51.0, -71.6))[0], _P(s, (13.0, -46.5, -68.6))[0], L("VA_dural_entry", s),
    ]
    dom = s == "L"            # left VA dominant
    r0, r1 = (2.1, 1.95) if dom else (1.85, 1.72)
    rad = np.linspace(r0, r1, len(ctrl) + 1)
    vid = f"VA_extradural_{s}"
    v = b.br(f"subclavian_{s}", L("VA_origin", s), vid, "Vertebral artery (extradural)", ctrl, rad,
             group="VB", side=s, territory=f"VA_{s}", label_anchor=L("VA_C1_sulcus", s))
    ci = v.ctrl_index
    v.meta["extra_labels"] = [["V1 segment VA (pre-foraminal)", int(ci[2])],
                              ["V2 segment VA (foraminal)", int(ci[8])],
                              ["V3 segment VA (atlas loop)", int(v.index_at(_P(s, (28.0, -42.0, -74.6))[0]))]]
    v.meta["label_side"] = "right" if s == "L" else "left"
    # small muscular / radicular branches of V2-V3
    for k, (lvl, d) in enumerate((("C5", (8.0, -14.0, 3.0)), ("C3", (8.0, -16.0, 2.0)), ("C2", (10.0, -18.0, 4.0)))):
        i0 = v.index_at(sp[lvl][tf])
        p0 = v.points[i0]
        dd = _P(s, d)[0]
        b.br(vid, i0, f"VA_muscular_{lvl}_{s}", "", [p0 + 0.5 * dd + [0, 0, -2], p0 + dd], (0.35, 0.22),
             group="VB")
    return v


def _subclavian_branches(b: _B, s, rng):
    sc = b.t[f"subclavian_{s}"]
    near = (lambda p: int(np.argmin(np.linalg.norm(sc.points - _P(s, p)[0], axis=1))))
    J = (lambda pts, a=0.8: _jit(rng, pts, a))
    # thyrocervical trunk (first part, just lateral to the VA)
    tct = b.br(sc.id, near((35.0, 4.6, -198.6)), f"thyrocervical_{s}", "Thyrocervical trunk",
               _P(s, (35.6, 5.6, -194.0), (36.2, 6.0, -189.5)), (1.3, 1.2), group="neck", label_anchor=1)
    it = b.br(tct.id, -1, f"inf_thyroid_{s}", "Inferior thyroid artery",
              J(_P(s, (34.0, 4.6, -184.0), (31.0, 0.8, -176.0), (28.0, -3.0, -170.0), (24.0, -0.5, -167.0),
                   (19.5, 5.5, -165.0), (15.5, 10.0, -164.0))), [0.95, 0.9, 0.85, 0.8, 0.72, 0.65, 0.58],
              group="neck", label_anchor=4)
    b.br(it.id, -1, f"inf_thyroid_br_{s}", "", _P(s, (12.0, 14.0, -158.0), (11.0, 16.0, -150.0)), (0.4, 0.28),
         group="neck")
    b.br(it.id, 3, f"asc_cervical_{s}", "Ascending cervical artery",
         J(_P(s, (29.8, -9.5, -161.0), (30.8, -13.5, -146.0), (31.0, -15.5, -130.0), (30.4, -17.5, -114.0),
              (29.6, -19.0, -100.0), (28.8, -20.5, -90.0)), 0.6), [0.5, 0.48, 0.44, 0.4, 0.36, 0.32, 0.28],
         group="neck", label_anchor=3)
    b.br(tct.id, -1, f"transverse_cervical_{s}", "Transverse cervical artery",
         J(_P(s, (41.0, 4.0, -189.0), (50.0, -2.0, -187.5), (61.0, -9.0, -185.0), (71.0, -17.0, -181.0))),
         [0.8, 0.75, 0.68, 0.6, 0.55], group="neck", label_anchor=3)
    b.br(tct.id, 0, f"suprascapular_{s}", "Suprascapular artery",
         J(_P(s, (40.0, 7.5, -197.0), (51.0, 9.0, -201.0), (64.0, 6.0, -204.0), (77.0, 0.0, -206.0))),
         [0.7, 0.68, 0.62, 0.56, 0.5], group="neck", label_anchor=3)
    # internal thoracic (inferior surface of the first part)
    b.br(sc.id, near((30.0, 5.5, -201.5)), f"int_thoracic_{s}", "Internal thoracic artery",
         J(_P(s, (32.5, 11.0, -209.0), (31.0, 20.0, -224.0), (29.0, 27.0, -244.0), (28.0, 29.5, -268.0)), 0.5),
         [1.15, 1.1, 1.05, 1.0, 0.95], group="neck", label_anchor=3)
    # costocervical trunk (second part, behind scalenus anterior)
    cct = b.br(sc.id, near((46.0, 2.6, -197.2)), f"costocervical_{s}", "Costocervical trunk",
               _P(s, (45.5, -6.0, -200.0), (43.5, -14.0, -203.0), (41.5, -20.0, -204.0)), (1.1, 1.0),
               group="neck", label_anchor=2)
    dc = b.br(cct.id, -1, f"deep_cervical_{s}", "Deep cervical artery",
              _wavy(np.vstack([cct.points[-1], J(_P(s, (37.0, -32.0, -198.0), (32.0, -44.0, -187.0),
                                                     (27.0, -53.0, -170.0), (24.0, -59.0, -150.0),
                                                     (23.0, -61.5, -134.0), (25.0, -62.0, -124.0)))]),
                    rng, amp=1.2, wavelength=16.0)[1:], (0.75, 0.45), group="neck", label_anchor=("frac", 0.6))
    b.br(cct.id, -1, f"supreme_intercostal_{s}", "Supreme intercostal artery",
         _P(s, (40.0, -24.0, -212.0), (38.0, -28.0, -226.0), (37.0, -30.0, -238.0)), (0.55, 0.45), group="neck",
         label_anchor=2)
    b.twigs(dc.id, n_branches=3, depth=1, start_frac=0.4, surface=None, min_radius=0.16, length_per_radius=40,
            max_length=25, tortuosity=0.3, region=_extracranial, include_tip=False)
    return dc


def _anastomoses(b: _B, s):
    t = b.t
    va = t[f"VA_extradural_{s}"]
    oc = t[f"occipital_{s}"]
    # C1 anastomosis: muscular branch of V3 (behind the lateral mass of C1) <-> occipital a.
    ia = va.index_at(_P(s, (28.6, -40.0, -74.6))[0])
    ib = int(np.argmin(np.linalg.norm(oc.points - _P(s, (40.8, -49.0, -65.0))[0], axis=1)))
    pa, pb = va.points[ia], oc.points[ib]
    mid = _P(s, (33.0, -41.5, -78.5), (37.5, -44.5, -77.0), (39.5, -47.5, -71.0))
    b.coll(f"C1_anastomosis_{s}", "C1-anastomosis to occipital artery", (va.id, ia), (oc.id, ib), mid,
           (0.5, 0.6), 0.55, group="VB", side=s, territory=f"VA_{s}", label_anchor=2)
    # occipital descending branch <-> deep cervical artery (posterior neck)
    if f"occipital_desc_{s}" in t and f"deep_cervical_{s}" in t:
        b.coll(f"occ_deep_cervical_anast_{s}", "", (f"occipital_desc_{s}", -1), (f"deep_cervical_{s}", -1),
               (), 0.35, 0.3, group="neck", side=s)
    # ascending cervical <-> VA (C2-C3 radicular/muscular anastomosis)
    if f"asc_cervical_{s}" in t:
        ac = t[f"asc_cervical_{s}"]
        iv = va.index_at(_P(s, (23.4, -26.0, -94.0))[0] + [0, 0, 6.0])
        b.coll(f"asc_cervical_VA_anast_{s}", "", (ac.id, -1), (va.id, iv),
               [0.5 * (ac.points[-1] + va.points[iv]) + _P(s, (1.5, 0.5, 2.0))[0]], 0.28, 0.25, group="neck", side=s)


def build(tree, seed=0):
    """Add the neck + ECA part (both sides) to ``tree``.  Deterministic per seed."""
    b = _B(tree, seed)
    _great_vessels(b)
    for s in ("R", "L"):
        rng = np.random.default_rng(1009 * (int(seed) + 1) + (0 if s == "R" else 17))
        _cervical_ica(b, s)
        _eca(b, s, rng)
        _vertebral(b, s, rng)
        _subclavian_branches(b, s, rng)
        _anastomoses(b, s)
    tree.meta.setdefault("parts_info", {})[PART] = {
        "vessels": len(b.made),
        "segments": int(sum(tree[v].n - 1 for v in b.made)),
        "ids": {"VA_extradural": ["VA_extradural_R", "VA_extradural_L"],
                "ICA_cervical": ["ICA_cervical_R", "ICA_cervical_L"]},
    }
    return tree
