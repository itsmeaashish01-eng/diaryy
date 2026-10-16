"""Anterior circulation: petrous -> supraclinoid ICA, ophthalmic artery, PComm (provisional),
anterior choroidal artery, ACA (A1, ACom, pericallosal, callosomarginal and all named medial
hemispheric branches, Heubner, medial lenticulostriates) and MCA (M1, lateral
lenticulostriates, superior / inferior divisions, insular M2 candelabra, opercular M3,
named cortical M4 branches) for both sides.

Anatomy follows Osborn (Diagnostic Cerebral Angiography) and Rhoton (Microsurgical anatomy
of the supratentorial arteries).  Coordinates are patient RAS mm with the AC at the origin
(see frame.py); all shared junctions are taken from ``frame.LANDMARKS`` exactly.  Geometry
is defined for the RIGHT side and mirrored (x -> -x) for the left with small deterministic
jitter so the two sides are naturally asymmetric.

Educational simulation - not for diagnostic use.
"""
from __future__ import annotations

import zlib

import numpy as np

from .. import frame as F
from ..frame import L
from ..tree import arclength, spline_through

SIDES = ("R", "L")

# star = branch of the anterior (superior) division of the MCA (as in the reference figure)
STAR_NOTE = "* = branches of the anterior (superior) division of MCA"


# ----------------------------------------------------------------------------
# geometry helpers
# ----------------------------------------------------------------------------
_HEMI_CACHE: dict = {}


def hemisphere_sdf(sg):
    """SDF of ONE cerebral hemisphere (sg=+1 right, -1 left): the cerebrum with the other
    side removed.  Used for medial-surface (ACA) vessels so that projections never jump
    across the 2.4 mm interhemispheric fissure."""
    key = float(sg)
    if key in _HEMI_CACHE:
        return _HEMI_CACHE[key]
    g = F.grid_sdf("cerebrum") if "cerebrum" in F._GRID_BOUNDS else F.cerebrum_sdf

    def f(p):
        p = np.asarray(p, float)
        q = p.copy()
        q[..., 0] = sg * np.abs(p[..., 0])
        return np.maximum(g(q), F.FALX_HALF - sg * p[..., 0])

    _HEMI_CACHE[key] = f
    return f


def _globe_sdf(c, r=12.0):
    c = np.asarray(c, float)

    def f(p):
        return np.linalg.norm(np.asarray(p, float) - c, axis=-1) - r
    return f


def radial_to_surface(P, center, fn, iso=0.0, tmax=160.0, iters=26):
    """Move points onto fn == iso along rays from ``center`` (inside) through each point."""
    P = np.atleast_2d(np.asarray(P, float))
    c = np.asarray(center, float)
    u = P - c
    u /= np.maximum(np.linalg.norm(u, axis=1, keepdims=True), 1e-9)
    lo = np.zeros(len(P))
    hi = np.full(len(P), tmax)
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        inside = fn(c + mid[:, None] * u) < iso
        lo = np.where(inside, mid, lo)
        hi = np.where(inside, hi, mid)
    return c + (0.5 * (lo + hi))[:, None] * u


def _resample(P, step):
    s = arclength(P)
    if s[-1] < 1e-6:
        return P[:1]
    n = max(1, int(np.ceil(s[-1] / step)))
    t = np.linspace(0, s[-1], n + 1)
    return np.stack([np.interp(t, s, P[:, k]) for k in range(3)], 1)


class Side:
    """Right-side coordinate tables -> this side (mirror + deterministic jitter)."""

    def __init__(self, s, seed=0):
        self.s = s
        self.sg = F.side_sign(s)
        self.rng = np.random.default_rng((seed * 7919 + zlib.crc32(f"anterior{s}".encode())) % 2 ** 32)
        # left hemisphere differs a bit more from the "template" than the right one
        self.j_deep = 0.35 if s == "R" else 0.8
        self.j_cort = 1.2 if s == "R" else 2.6
        self.hemi = hemisphere_sdf(self.sg)
        self.brain = F.grid_sdf("brain")

    # --- points -------------------------------------------------------------
    def p(self, x, y, z, j=None):
        """Deep (non-landmark) control point given in right-side coordinates."""
        q = np.array([self.sg * x, y, z], float)
        jj = self.j_deep if j is None else j
        if jj > 0:
            q += self.rng.normal(0.0, jj, 3)
        return q

    def pts(self, rows, j=None):
        return [self.p(*r, j=j) for r in rows]

    def lm(self, name):
        return L(name, self.s)

    def mirror_x(self, rows):
        return [np.array([self.sg * r[0], r[1], r[2]], float) for r in rows]

    # --- surface paths --------------------------------------------------------
    def cortical(self, rows, depth=-0.8, surface="convexity", wiggle=2.0, wavelength=15.0, step=4.0,
                 jitter=None, keep_first=False):
        """Pial path through right-side waypoints ``rows`` projected onto the cortex.

        surface: 'convexity' (radial projection onto the brain, lateral hemisphere centre),
        'medial' (this hemisphere's sdf, nearest-point projection) or 'globe'-like callable.
        Adds a gentle in-surface meander (gyral tortuosity).  Returns control points.
        """
        jj = self.j_cort if jitter is None else jitter
        W = np.array([[self.sg * r[0], r[1], r[2]] for r in rows], float)
        if jj > 0:
            n0 = 1 if keep_first else 0
            W[n0:] += self.rng.normal(0.0, jj, W[n0:].shape)
        if surface == "convexity":
            fn = self.brain
            center = np.array([self.sg * 14.0, -14.0, 4.0])
            proj = lambda Q: radial_to_surface(Q, center, fn, iso=-depth)  # noqa: E731
        elif surface == "medial":
            fn = self.hemi
            proj = lambda Q: F.project_to_surface(Q, fn, depth, iters=10)  # noqa: E731
        elif surface == "medial_radial":
            fn = self.hemi
            center = np.array([self.sg * 16.0, -10.0, 8.0])
            proj = lambda Q: radial_to_surface(Q, center, fn, iso=-depth)  # noqa: E731
        else:
            fn = surface
            proj = lambda Q: F.project_to_surface(Q, fn, depth, iters=10)  # noqa: E731
        if keep_first:
            first = W[0].copy()
            W[1:] = proj(W[1:])
        else:
            W = proj(W)
        dense, _ = spline_through(W, step=1.0)
        if wiggle > 0 and len(dense) > 4:
            s = arclength(dense)
            t = np.gradient(dense, axis=0)
            t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
            nrm = F.sdf_gradient(fn, dense, 0.6)
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
            b = np.cross(t, nrm)
            b /= np.maximum(np.linalg.norm(b, axis=1, keepdims=True), 1e-9)
            ph = self.rng.uniform(0, 2 * np.pi)
            lam = wavelength * self.rng.uniform(0.8, 1.25)
            amp = wiggle * np.sin(2 * np.pi * s / lam + ph) * np.clip(s / 8.0, 0, 1)
            amp += 0.5 * wiggle * np.sin(2 * np.pi * s / (0.43 * lam) + 2 * ph) * np.clip(s / 8.0, 0, 1)
            dense = dense + amp[:, None] * b
            dense = F.project_to_surface(dense, fn, depth, iters=6)
        if keep_first:
            dense[0] = first
        C = _resample(dense, step)
        C[0] = dense[0]
        C[-1] = dense[-1]
        return [c for c in C]


def _rkeys(ctrl, keys):
    """Per-control-point radii from (fraction_of_chord_length, radius) keys."""
    C = np.asarray(ctrl, float)
    s = arclength(C)
    f = s / max(s[-1], 1e-9)
    kf = np.array([k[0] for k in keys], float)
    kr = np.array([k[1] for k in keys], float)
    return list(np.interp(f, kf, kr))


def _add(tree, parent, at, vid, name, ctrl, rkeys, group, side, territory=None, **kw):
    """branch_from with radius keys (fractions along the full path incl. the origin)."""
    pv = tree[parent]
    i = pv.index_at(at)
    full = [pv.points[i]] + [np.asarray(c, float) for c in ctrl]
    radius = _rkeys(full, rkeys)
    return tree.branch_from(parent, i, vid, name, ctrl, radius, group=group, side=side,
                            territory=territory or pv.territory, **kw)


def _ctrl_s(v, k):
    """Arclength of control point k of vessel v."""
    return float(v.arclength()[v.ctrl_index[k]])


def _seed(seed, *names):
    return (int(seed) * 1009 + zlib.crc32("|".join(names).encode())) % 100000


# ----------------------------------------------------------------------------
# provisional PComm (the posterior part may own / replace it)
# ----------------------------------------------------------------------------

def _install_pcomm_guard(tree):
    """ENGINE_API lists the PComm under the posterior part while the anterior task also
    creates it.  We add a *provisional* PComm_X (meta['provisional'] = 'anterior') and wrap
    this tree instance's add_vessel so that (a) if a later part adds its own 'PComm_X' ours is
    dropped first (no duplicate-id crash, no double vessel) and (b) when 'P1_X' appears our
    PComm is connected to its end (collateral ICA <-> P1)."""
    if getattr(tree, "_anterior_pcomm_guard", False):
        return
    orig = tree.add_vessel

    def add_vessel(id, *a, **kw):
        old = tree.vessels.get(id)
        if old is not None and (old.meta or {}).get("provisional") == "anterior":
            for c in tree.children(id):
                tree.remove(c.id)
            tree.vessels.pop(id, None)
        v = orig(id, *a, **kw)
        if isinstance(id, str) and id.startswith("P1_") and id[3:] in SIDES:
            _link_pcomm(tree, id[3:])
        return v

    tree.add_vessel = add_vessel
    tree._anterior_pcomm_guard = True


def _link_pcomm(tree, s):
    pc = tree.get(f"PComm_{s}")
    p1 = tree.get(f"P1_{s}")
    if pc is None or p1 is None or (pc.meta or {}).get("provisional") != "anterior":
        return
    j = p1.index_at(pc.points[-1])
    if np.linalg.norm(p1.points[j] - pc.points[-1]) < 1.5:
        pc.connects_to = (p1.id, int(j))


# ----------------------------------------------------------------------------
# ICA (petrous -> terminus), OA, SHA, PComm, AChA
# ----------------------------------------------------------------------------

def _build_ica(tree, S: Side, seed):
    s = S.s
    terr = f"ICA_{s}"
    # --- petrous: vertical (C2 ascending) + horizontal (anteromedial) segments
    ctrl_p = [S.lm("ICA_skull_base_entry"), S.p(27.7, -13.8, -56.0), S.lm("ICA_petrous_genu"),
              S.p(25.0, -10.2, -49.0), S.p(20.8, -4.6, -46.4), S.lm("ICA_foramen_lacerum")]
    rk = [(0, 2.35), (0.3, 2.32), (1, 2.25)]
    parent = f"ICA_cervical_{s}"
    if parent in tree:
        pv = tree[parent]
        if np.linalg.norm(pv.points[-1] - ctrl_p[0]) > 1.0:
            print(f"[anterior] warning: {parent} does not end at ICA_skull_base_entry_{s}")
        pet = _add(tree, parent, -1, f"ICA_petrous_{s}", "ICA (vertical petrous segment)", ctrl_p[1:], rk,
                   "ICA", s, territory=terr)
    else:
        pet = tree.add_vessel(f"ICA_petrous_{s}", "ICA (vertical petrous segment)", ctrl_p, _rkeys(ctrl_p, rk),
                              group="ICA", side=s, territory=terr)
    ci = pet.ctrl_index
    pet.label_anchor = (ci[0] + ci[1]) // 2 + 2
    pet.meta["extra_labels"] = [["ICA (horizontal petrous segment)", (ci[3] + ci[4]) // 2]]
    pet.short_label = "C2"

    # --- lacerum + cavernous: ascending (posterior genu), horizontal, anterior genu, clinoid
    ctrl_c = [S.p(16.7, -2.3, -40.3), S.lm("ICA_cav_posterior_genu"), S.p(16.0, 2.0, -34.6),
              S.p(15.6, 7.0, -33.1), S.lm("ICA_cav_anterior_genu"), S.p(14.7, 13.7, -27.9),
              S.lm("ICA_clinoid")]
    cav = _add(tree, pet.id, -1, f"ICA_cavernous_{s}", "Cavernous segment ICA", ctrl_c,
               [(0, 2.25), (0.6, 2.2), (1, 2.05)], "ICA", s)
    ci = cav.ctrl_index
    cav.label_anchor = ci[3]
    cav.short_label = "C4"
    cav.meta["extra_labels"] = [["Presellar segment ICA", (ci[0] + ci[1]) // 2],
                                ["Anterior genu intracavernous segment ICA", (ci[5] + ci[6]) // 2]]

    # --- supraclinoid (ophthalmic + communicating segments) -> terminus
    ctrl_s = [S.lm("OA_origin"), S.p(13.45, 7.4, -19.6, j=0.15), S.lm("PComm_origin"), S.lm("AChA_origin"),
              S.lm("ICA_terminus")]
    ica = _add(tree, cav.id, -1, f"ICA_{s}", "Supraclinoid segment ICA", ctrl_s,
               [(0, 2.0), (0.4, 1.92), (1, 1.8)], "ICA", s)
    ica.label_anchor = ica.ctrl_index[2]
    ica.short_label = "C6-C7"
    return pet, cav, ica


def _build_oa(tree, S: Side, ica, seed):
    s = S.s
    oa = _add(tree, ica.id, S.lm("OA_origin"), f"OA_{s}", "Ophthalmic artery (OA)",
              [S.p(12.4, 13.6, -19.8), S.lm("optic_canal"), S.p(12.9, 21.6, -19.9), S.lm("orbit_apex"),
               S.p(19.4, 31.0, -22.3), S.p(21.0, 34.5, -20.6), S.p(18.4, 38.8, -17.4), S.p(14.5, 44.0, -16.6),
               S.p(12.2, 51.0, -16.4), S.p(10.6, 58.0, -16.6), S.p(9.6, 65.0, -18.0), S.p(9.0, 70.5, -20.5)],
              [(0, 0.75), (0.18, 0.66), (0.45, 0.55), (0.75, 0.42), (1, 0.32)], "ICA", s,
              territory=f"OA_{s}", label_anchor=S.p(16.0, 43.0, -17.0, j=0))
    # lacrimal artery (lateral, to the lacrimal gland)
    _add(tree, oa.id, S.p(19.4, 31.0, -22.3, j=0), f"OA_lacrimal_{s}", "Lacrimal artery",
         [S.p(25.0, 36.5, -19.5), S.p(31.0, 44.0, -16.5), S.p(37.0, 51.5, -15.0), S.p(41.0, 58.5, -16.0)],
         [(0, 0.36), (1, 0.24)], "ICA", s, label_anchor=-4)
    # posterior ciliary arteries -> choroid of the posterior globe (choroidal crescent)
    gc = S.lm("globe_center")
    ga = S.lm("orbit_apex")
    u_post = (ga - gc) / np.linalg.norm(ga - gc)
    globe = _globe_sdf(gc, 12.0)
    for k, (dx, dz) in enumerate(((3.5, -1.5), (-3.5, 2.0))):
        tgt = gc + 12.6 * u_post + np.array([S.sg * dx, 0.0, dz])
        mid = S.p(17.5 + 2 * k, 30.0 + 5, -23.5)
        cil = _add(tree, oa.id, S.p(16.2, 27.5, -22.6, j=0), f"OA_ciliary{k}_{s}", "",
                   [mid, 0.5 * (mid + tgt) + np.array([0, 0, -1.0]), tgt], [(0, 0.3), (1, 0.22)], "ICA", s)
        reg = lambda P, c=gc, u=u_post: ((np.asarray(P) - c) @ u) > 2.5  # noqa: E731
        tree.grow_distal_branches(cil.id, n_branches=0, depth=2, sub_branches=(2, 3), seed=_seed(seed, cil.id),
                                  surface=globe, surface_depth=0.5, min_radius=0.11, length_per_radius=75,
                                  max_length=16, branch_ratio=(0.6, 0.85), tortuosity=0.35, region=reg,
                                  keep_side=False, avoid_dist=1.0, max_snap=4.0)
    # supraorbital artery (under the orbital roof -> supraorbital notch -> forehead)
    so_end = [F.project_to_scalp(S.p(26.0, 85.0, 4.0, j=0.5), 2.5), F.project_to_scalp(S.p(26.0, 82.0, 22.0, j=0.8), 2.5)]
    _add(tree, oa.id, S.p(18.4, 38.8, -17.4, j=0), f"OA_supraorbital_{s}", "Supraorbital artery",
         [S.p(22.0, 46.0, -14.0), S.p(25.0, 56.0, -12.5), S.p(26.0, 66.0, -10.5), S.p(25.5, 72.5, -8.0)] + so_end,
         [(0, 0.34), (1, 0.2)], "ICA", s, label_anchor=-3)
    # anterior ethmoidal artery -> anterior falcine artery
    _add(tree, oa.id, S.p(12.2, 51.0, -16.4, j=0), f"OA_ethmoidal_{s}", "Anterior ethmoidal artery",
         [S.p(7.0, 52.0, -18.0), S.p(3.4, 54.0, -16.5), S.p(2.0, 56.5, -11.0), S.p(1.2, 58.5, -3.0, j=0.2)],
         [(0, 0.26), (1, 0.17)], "ICA", s, label_anchor=-3)
    # terminal: supratrochlear (forehead) + dorsal nasal
    _add(tree, oa.id, -1, f"OA_supratrochlear_{s}", "",
         [S.p(10.0, 75.5, -14.0), F.project_to_scalp(S.p(11.0, 85.0, 0.0, j=0.5), 2.5),
          F.project_to_scalp(S.p(12.0, 84.0, 16.0, j=0.8), 2.5)], [(0, 0.26), (1, 0.17)], "ICA", s)
    _add(tree, oa.id, -1, f"OA_dorsalnasal_{s}", "",
         [S.p(7.5, 75.0, -25.0), S.p(5.5, 78.5, -33.0)], [(0, 0.22), (1, 0.16)], "ICA", s)
    return oa


def _build_pcomm(tree, S: Side, ica, seed):
    s = S.s
    vid = f"PComm_{s}"
    if vid in tree:
        return tree[vid]
    r = 0.65 if s == "R" else 0.74
    conn = None
    if f"P1_{s}" in tree:
        p1 = tree[f"P1_{s}"]
        conn = (p1.id, p1.index_at(L("PCA_P1P2", s)))
    pc = _add(tree, ica.id, S.lm("PComm_origin"), vid, "Posterior communicating artery",
              [S.p(12.1, -0.6, -18.7), S.p(10.3, -5.6, -19.8), S.lm("PCA_P1P2")], [(0, r), (1, r * 0.95)],
              "CoW", s, territory=f"PCA_{s}", collateral=True, fill_fraction=0.3, connects_to=conn,
              label_anchor=("frac", 0.55))
    pc.meta["provisional"] = "anterior"
    return pc


def _build_acha(tree, S: Side, ica, seed):
    s = S.s
    ach = _add(tree, ica.id, S.lm("AChA_origin"), f"AChA_{s}", "Anterior choroidal artery",
               [S.p(14.7, 0.0, -16.2), S.p(14.2, -4.6, -16.1), S.p(15.6, -9.0, -15.5), S.p(18.6, -13.0, -14.4),
                S.p(22.0, -16.2, -13.3), S.p(25.4, -21.0, -10.8), S.p(27.4, -27.0, -6.4), S.p(27.9, -33.0, -1.0),
                S.p(26.8, -38.2, 4.0), S.p(24.8, -42.4, 8.4)],
              [(0, 0.55), (0.35, 0.45), (0.6, 0.36), (1, 0.24)], "ICA", s, territory=f"AChA_{s}",
              label_anchor=S.p(15.6, -9.0, -15.5, j=0))
    # capsular / thalamic perforators of the cisternal segment
    for k, (yy, zz) in enumerate(((-8.0, -6.0), (-12.0, -4.0))):
        _add(tree, ach.id, S.p(16.0 + 2 * k, yy, -15.0, j=0), f"AChA_perf{k}_{s}", "",
             [S.p(17.5 + 2 * k, yy - 1.5, zz), S.p(18.5 + 2 * k, yy - 3.0, zz + 8.0)], [(0, 0.18), (1, 0.14)],
             "ICA", s)
    # choroidal plexus twigs in the temporal horn / atrium
    tree.grow_distal_branches(ach.id, n_branches=3, start_frac=0.55, depth=1, sub_branches=(1, 1),
                              seed=_seed(seed, ach.id), surface=None, min_radius=0.12, length_per_radius=45,
                              max_length=12, branch_ratio=(0.6, 0.8), tortuosity=0.3, include_tip=True,
                              avoid_dist=1.0)
    return ach


def _build_sha(tree, S: Side, ica, seed):
    s = S.s
    return _add(tree, ica.id, S.p(13.45, 8.6, -20.9, j=0), f"SHA_{s}", "Superior hypophyseal artery",
                [S.p(9.5, 7.2, -21.2), S.p(5.2, 5.4, -20.2), S.p(2.0, 4.2, -18.6, j=0.2),
                 S.p(1.2, 4.6, -15.6, j=0.2)],
                [(0, 0.28), (1, 0.16)], "ICA", s, label_anchor=2)


# ----------------------------------------------------------------------------
# ACA
# ----------------------------------------------------------------------------

def _aca_region(sg):
    def reg(P):
        P = np.asarray(P)
        return (sg * P[:, 0] > 0.15) & (sg * P[:, 0] < 34.0) & (P[:, 1] > -84.0) & (P[:, 2] > -24.0)
    return reg


def _build_aca(tree, S: Side, ica, seed):
    s, sg = S.s, S.sg
    terr = f"ACA_{s}"
    a1 = _add(tree, ica.id, -1, f"A1_{s}", "A1 segment ACA",
              [S.p(9.4, 5.2, -10.9), S.p(5.4, 8.1, -8.3), S.lm("A1A2_junction")],
              [(0, 1.15), (1, 1.05)], "ACA", s, territory=terr, label_anchor=("frac", 0.4))
    # --- pericallosal (A2 infracallosal -> A3 precallosal around the genu -> A4/A5 over the body)
    cc = F.callosal_curve(4.5, x=sg * 2.2, n=60, start=0.0, end=0.93)
    cc = cc[cc[:, 1] > -46.0]
    cc = cc[(cc[:, 1] < 24.0) | (cc[:, 2] > -5.5)]
    cc = cc[::2]
    zw = 0.7 * np.sin(np.linspace(0, 7.5 * np.pi, len(cc)) + S.rng.uniform(0, 6.28))
    cc = cc + np.column_stack([sg * 0.35 * np.sin(np.linspace(0, 5 * np.pi, len(cc))), np.zeros(len(cc)), zw])
    ctrl = [S.p(1.55, 13.6, -7.0, j=0.15), S.p(1.9, 18.6, -7.4, j=0.25)] + [c for c in cc]
    peri = _add(tree, a1.id, -1, f"pericallosal_{s}", "Pericallosal branch ACA", ctrl,
                [(0, 1.05), (0.25, 0.95), (0.55, 0.78), (1, 0.55)], "ACA", s, territory=terr,
                label_anchor=S.p(2.2, 34.0, 1.0, j=0))
    hemi = S.hemi
    reg = _aca_region(sg)

    def medial_branch(vid, name, parent, at, rows, rk, twigs=(3, 2), first_lateral=None, anchor=("frac", 0.5),
                      surface="medial"):
        ctrl = S.cortical(rows, depth=-0.4, surface=surface, wiggle=1.6, wavelength=13.0, step=4.0)
        v = _add(tree, parent, at, vid, name, ctrl, rk, "ACA", s, territory=terr, label_anchor=anchor)
        if twigs:
            nb, dp = twigs
            tree.grow_distal_branches(v.id, n_branches=nb, depth=dp, start_frac=0.38, seed=_seed(seed, vid),
                                      surface=hemi, surface_depth=-0.5, min_radius=0.15, length_per_radius=62,
                                      max_length=45, branch_ratio=(0.55, 0.8), angle_deg=(30, 70),
                                      tortuosity=0.28, region=reg, keep_side=True, sub_branches=(1, 2))
        return v

    # orbitofrontal (medial orbitofrontal) branch: first cortical branch of A2, along the gyrus rectus
    medial_branch(f"ACA_orbitofrontal_{s}", "Orbitofrontal branch ACA", peri.id, 4.5,
                  [(2.4, 18.5, -13.5), (3.2, 26.0, -18.5), (3.6, 35.0, -19.5), (4.2, 44.0, -18.5),
                   (5.0, 52.0, -16.0), (6.0, 59.0, -12.0)],
                  [(0, 0.48), (1, 0.3)], twigs=(2, 1), anchor=("frac", 0.55))
    # frontopolar branch: from A2 below the genu, anteriorly to the frontal pole
    medial_branch(f"ACA_frontopolar_{s}", "Frontopolar branch ACA", peri.id, S.p(2.2, 26.0, -7.0, j=0),
                  [(1.0, 33.0, -4.0), (1.0, 42.0, -1.0), (1.0, 51.0, 3.0), (1.0, 59.0, 8.5), (3.0, 64.0, 14.0),
                   (10.0, 66.0, 20.0), (17.0, 65.0, 26.0)],
                  [(0, 0.55), (1, 0.32)], twigs=(3, 2), anchor=("frac", 0.4))

    # --- callosomarginal artery in the cingulate sulcus (arises at the genu, A3)
    cs = F.cingulate_curve(x=sg * 2.6, n=50, start=0.22, end=0.66)
    cs = cs[::3]
    cs = cs + np.column_stack([np.zeros(len(cs)), np.zeros(len(cs)),
                               0.9 * np.sin(np.linspace(0, 6 * np.pi, len(cs)) + S.rng.uniform(0, 6.28))])
    cma_ctrl = [S.p(2.4, 40.8, 13.0, j=0.2)] + [c for c in cs] + [S.p(2.3, -21.0, 43.5, j=0.3)]
    cma = _add(tree, peri.id, S.p(2.2, 36.6, 8.0, j=0), f"CMA_{s}", "Callosomarginal branch of ACA", cma_ctrl,
               [(0, 0.8), (0.5, 0.65), (1, 0.48)], "ACA", s, territory=terr,
               label_anchor=S.p(2.6, 43.0, 18.0, j=0))

    # internal frontal branches (from the CMA) -> up the medial SFG, over the vertex
    medial_branch(f"ACA_aif_{s}", "Anterior internal frontal branch", cma.id, S.p(2.6, 42.0, 22.0, j=0),
                  [(1.0, 47.0, 31.0), (1.0, 50.0, 43.0), (1.0, 47.0, 53.0), (5.0, 42.0, 61.0), (14.0, 39.0, 64.0),
                   (22.0, 37.0, 62.0)],
                  [(0, 0.55), (1, 0.32)], twigs=(4, 2), anchor=("frac", 0.45))
    medial_branch(f"ACA_mif_{s}", "Middle internal frontal branch", cma.id, S.p(2.6, 22.0, 37.0, j=0),
                  [(1.0, 22.5, 47.0), (1.0, 21.0, 58.0), (3.0, 18.0, 66.0), (11.0, 15.0, 70.0), (20.0, 12.0, 70.0),
                   (27.0, 10.0, 67.0)],
                  [(0, 0.55), (1, 0.32)], twigs=(4, 2), anchor=("frac", 0.4))
    medial_branch(f"ACA_pif_{s}", "Posterior internal frontal branch", cma.id, S.p(2.6, 3.0, 41.5, j=0),
                  [(1.0, 2.0, 52.0), (1.0, -1.0, 63.0), (3.0, -4.0, 71.0), (11.0, -7.0, 73.5), (20.0, -10.0, 72.0),
                   (27.0, -12.0, 68.0)],
                  [(0, 0.52), (1, 0.3)], twigs=(4, 2), anchor=("frac", 0.4))
    medial_branch(f"ACA_paracentral_{s}", "Paracentral lobule artery of ACA", cma.id, -1,
                  [(1.0, -25.0, 51.0), (1.0, -28.0, 61.0), (3.0, -31.0, 68.0), (10.0, -34.0, 70.5),
                   (18.0, -37.0, 69.5), (25.0, -40.0, 65.0)],
                  [(0, 0.48), (1, 0.3)], twigs=(4, 2), anchor=("frac", 0.35))
    # superior / inferior internal parietal (precuneal) branches from the distal pericallosal
    medial_branch(f"ACA_sip_{s}", "Superior internal parietal branch", peri.id, S.p(2.2, -25.0, 31.0, j=0),
                  [(1.0, -32.0, 40.0), (1.0, -40.0, 49.0), (1.0, -47.0, 56.0), (3.0, -53.0, 61.0),
                   (10.0, -57.0, 63.0), (18.0, -61.0, 61.0)],
                  [(0, 0.5), (1, 0.3)], twigs=(4, 2), anchor=("frac", 0.5))
    medial_branch(f"ACA_iip_{s}", "Inferior internal parietal branch", peri.id, S.p(2.2, -40.0, 22.0, j=0),
                  [(1.0, -48.0, 27.0), (1.0, -56.0, 32.0), (1.0, -63.0, 38.0), (1.0, -68.0, 45.0),
                   (4.0, -72.0, 51.0), (11.0, -74.0, 53.0)],
                  [(0, 0.46), (1, 0.28)], twigs=(3, 2), anchor=("frac", 0.45))
    # splenial / posterior pericallosal twigs over the splenium
    tree.grow_distal_branches(peri.id, n_branches=0, depth=1, sub_branches=(1, 2), seed=_seed(seed, peri.id),
                              surface=None, min_radius=0.15, length_per_radius=40, max_length=14,
                              tortuosity=0.25, include_tip=True, avoid_dist=1.5)
    # contralateral callosomarginal branch: crosses under the falx (above the callosum)
    # to the opposite cingulate sulcus and medial frontal cortex (Perlmutter & Rhoton 1978)
    ox = -sg
    cont_rows = [S.p(0.0, 27.0, 25.8, j=0.2), np.array([ox * 2.0, 23.5, 29.5]), np.array([ox * 2.6, 16.0, 36.5]),
                 np.array([ox * 2.6, 7.0, 40.5])]
    up = [np.array([ox * r[0], r[1], r[2]]) for r in ((1.0, 1.0, 50.0), (1.0, -3.0, 60.0), (2.0, -6.0, 68.0),
                                                       (8.0, -9.0, 72.5), (15.0, -11.0, 73.0))]
    up = F.project_to_surface(np.array(up), hemisphere_sdf(ox), 0.4, iters=10)
    cont = _add(tree, peri.id, S.p(2.2, 29.5, 23.6, j=0), f"ACA_contra_cma_{s}", "Contralateral callosomarginal branch",
                cont_rows + [u for u in up], [(0, 0.48), (0.5, 0.4), (1, 0.28)], "ACA", s, territory=terr,
                label_anchor=("frac", 0.62))
    cont.meta["crosses_midline"] = True
    tree.grow_distal_branches(cont.id, n_branches=2, depth=1, start_frac=0.55, seed=_seed(seed, cont.id),
                              surface=hemisphere_sdf(ox), surface_depth=-0.5, min_radius=0.15,
                              length_per_radius=60, max_length=35, region=_aca_region(ox), keep_side=True)
    return a1, peri, cma


# ----------------------------------------------------------------------------
# MCA
# ----------------------------------------------------------------------------
_SYL = None


def _fissure_z(y):
    global _SYL
    if _SYL is None:
        _SYL = F.sylvian_fissure("R", 60)
    ys = _SYL[::-1, 1]
    zs = _SYL[::-1, 2]
    return float(np.interp(y, ys, zs))


def _mca_region(sg):
    def reg(P):
        P = np.asarray(P)
        ax = sg * P[:, 0]
        return (ax > 22.0) & (P[:, 1] > -90.0) & (P[:, 2] > -46.0) & ((ax > 30.0) | (P[:, 2] < 40.0))
    return reg


# Right-side tables.  deep = insular (M2) + opercular (M3) control points (not projected),
# cort = cortical (M4) waypoints projected onto the convexity.  'at' = arclength on the parent.
MCA_BRANCHES = [
    # id,         name,                              parent, at,   deep pts,  cort pts, radii, twigs(n,depth)
    ("orbitofrontal", "Orbitofrontal branch MCA*", "sup", 2.5,
     [(36.6, 10.0, -5.6), (37.5, 13.6, -3.4), (42.5, 17.4, -5.6), (48.0, 19.6, -10.5)],
     [(53.5, 21.0, -15.0), (52.0, 29.0, -12.0), (48.0, 38.0, -10.0), (44.0, 47.0, -7.0), (38.0, 55.0, -4.0)],
     [(0, 0.75), (0.4, 0.6), (1, 0.38)], (3, 2)),
    ("frontal_operc", "", "sup", 4.5,
     [(37.4, 9.4, 1.0), (36.8, 11.2, 8.0), (35.6, 12.8, 13.0), (42.5, 13.0, 11.5), (50.5, 12.4, 3.0)],
     [(57.0, 12.5, -10.5), (59.0, 18.0, -1.0), (57.5, 25.0, 9.0), (54.5, 31.0, 17.0), (50.0, 38.0, 25.0)],
     [(0, 0.6), (0.4, 0.5), (1, 0.33)], (3, 2)),
    ("prefrontal", "Prefrontal branch MCA*", "sup", 6.5,
     [(38.0, 7.6, -0.6), (38.2, 8.2, 6.5), (37.4, 8.4, 13.0), (36.6, 8.0, 17.0), (43.5, 7.6, 14.5),
      (52.5, 6.6, 5.0)],
     [(60.0, 6.0, -7.0), (61.0, 12.0, 6.0), (58.5, 21.0, 21.0), (54.0, 30.0, 34.0), (47.5, 37.0, 46.0),
      (40.0, 41.0, 55.0)],
     [(0, 0.8), (0.4, 0.62), (1, 0.38)], (4, 2)),
    ("prerolandic", "Prerolandic artery MCA*", "sup", -1,
     [(39.0, 3.0, 2.5), (39.0, 1.4, 10.5), (38.4, -0.6, 18.6), (44.8, -1.6, 16.8), (53.5, -2.6, 8.5)],
     [(61.6, -3.4, -2.5), (62.5, -2.6, 10.0), (60.5, -3.6, 26.0), (56.5, -6.4, 40.0), (50.5, -9.0, 52.0),
      (43.0, -12.0, 61.0)],
     [(0, 0.82), (0.4, 0.63), (1, 0.38)], (4, 2)),
    ("rolandic", "Rolandic artery MCA*", "sup", -1,
     [(39.6, 1.2, 0.6), (39.7, -3.8, 9.0), (39.0, -8.2, 20.4), (45.0, -9.2, 18.2), (54.2, -10.2, 10.2)],
     [(62.6, -11.0, 1.6), (63.0, -12.4, 14.0), (61.5, -14.4, 28.0), (57.5, -18.4, 42.0), (51.5, -22.0, 54.0),
      (43.5, -26.0, 63.0)],
     [(0, 0.82), (0.4, 0.63), (1, 0.38)], (4, 2)),
    ("ant_temporal", "Anterior temporal branch MCA", "inf", 1.5,
     [(40.4, 2.8, -11.2), (47.0, 1.0, -13.0), (54.0, -1.0, -12.8)],
     [(60.5, -2.4, -11.0), (63.0, -6.0, -18.0), (62.0, -10.0, -26.0), (59.0, -14.0, -33.0), (55.0, -17.0, -38.0)],
     [(0, 0.65), (0.4, 0.52), (1, 0.34)], (3, 2)),
    ("mid_temporal", "Middle temporal branch MCA", "inf", 7.0,
     [(41.5, -3.6, -8.2), (47.5, -5.6, -8.4), (54.5, -7.6, -7.4)],
     [(61.5, -9.4, -6.2), (64.0, -15.0, -14.0), (64.0, -21.0, -22.0), (62.0, -27.0, -30.0), (58.0, -33.0, -36.0)],
     [(0, 0.68), (0.4, 0.55), (1, 0.34)], (3, 2)),
    ("ant_parietal", "Anterior parietal branch MCA", "inf", 11.0,
     [(40.4, -8.6, -1.2), (40.2, -12.4, 8.0), (39.2, -16.2, 20.4), (45.2, -17.2, 18.4), (54.2, -18.4, 12.2)],
     [(62.6, -19.4, 7.0), (62.6, -21.4, 18.0), (60.5, -24.4, 32.0), (55.5, -28.4, 46.0), (48.5, -32.0, 57.0),
      (40.0, -35.0, 64.0)],
     [(0, 0.78), (0.4, 0.6), (1, 0.37)], (4, 2)),
    ("post_temporal", "Posterior temporal branch MCA", "inf", 13.5,
     [(41.2, -10.6, -4.0), (46.5, -14.4, -3.4), (53.5, -17.4, -2.2)],
     [(62.0, -19.6, -0.6), (64.0, -26.0, -6.0), (63.0, -34.0, -12.0), (60.0, -43.0, -18.0), (55.0, -52.0, -22.0)],
     [(0, 0.7), (0.4, 0.56), (1, 0.34)], (3, 2)),
    ("post_parietal", "Posterior parietal branch MCA", "inf", -1,
     [(40.8, -16.4, 1.4), (40.3, -20.4, 9.4), (39.2, -24.2, 19.6), (45.2, -27.2, 19.0), (53.2, -30.2, 17.0)],
     [(60.0, -32.4, 14.0), (59.0, -37.0, 25.0), (55.0, -43.0, 36.0), (50.0, -50.0, 46.0), (43.0, -56.0, 55.0),
      (35.0, -61.0, 61.0)],
     [(0, 0.76), (0.4, 0.6), (1, 0.36)], (4, 2)),
    ("parietal2", "", "inf", -1,
     [(40.8, -16.8, 0.0), (40.5, -19.0, 9.0), (39.5, -20.6, 19.8), (46.0, -22.6, 18.2), (54.0, -24.6, 13.4)],
     [(61.6, -26.0, 10.0), (61.2, -28.0, 22.0), (57.5, -35.0, 37.0), (51.5, -41.0, 49.0), (44.5, -46.0, 58.0)],
     [(0, 0.6), (0.4, 0.5), (1, 0.32)], (3, 2)),
    ("angular", "Angular artery MCA", "inf", -1,
     [(40.8, -16.2, -0.4), (40.8, -22.0, 6.4), (40.6, -27.0, 13.2), "sylvian_point", (46.0, -34.2, 20.6),
      (52.0, -38.2, 21.2)],
     [(56.0, -41.0, 21.2), (56.0, -48.0, 25.0), (53.0, -56.0, 29.0), (49.0, -64.0, 32.0), (43.0, -72.0, 34.0),
      (36.0, -79.0, 35.0)],
     [(0, 0.85), (0.4, 0.65), (1, 0.38)], (4, 2)),
    ("temporo_occipital", "Temporo-occipital branch MCA", "inf", -1,
     [(41.2, -17.0, -2.4), (41.2, -23.0, 2.0), (47.0, -27.4, 3.6), (54.0, -30.4, 5.6)],
     [(60.5, -33.0, 7.0), (61.0, -42.0, 4.0), (59.0, -52.0, 1.0), (55.0, -62.0, 0.0), (49.0, -72.0, 1.0),
      (42.0, -82.0, 3.0), (36.0, -88.0, 4.0)],
     [(0, 0.78), (0.4, 0.6), (1, 0.36)], (4, 2)),
]


def _build_mca(tree, S: Side, ica, seed):
    s, sg = S.s, S.sg
    terr = f"MCA_{s}"
    m1 = _add(tree, ica.id, -1, f"M1_{s}", "MCA (M1)",
              [S.p(18.0, 3.4, -13.6), S.p(24.5, 4.9, -12.6), S.lm("MCA_bifurcation")],
              [(0, 1.45), (1, 1.36)], "MCA", s, territory=terr, label_anchor=("frac", 0.6))
    sup = _add(tree, m1.id, -1, f"MCA_sup_{s}", "MCA superior division (M2)",
               [S.p(35.4, 7.4, -8.6), S.p(37.4, 7.4, -5.2), S.p(38.6, 5.6, -1.6)],
               [(0, 1.05), (1, 0.92)], "MCA", s, territory=terr, label_anchor=("frac", 0.5))
    inf = _add(tree, m1.id, -1, f"MCA_inf_{s}", "MCA inferior division (M2)",
               [S.lm("MCA_genu"), S.p(39.2, -0.2, -7.6), S.p(40.2, -6.0, -5.6), S.p(40.7, -11.6, -3.4),
                S.p(40.9, -15.6, -1.0)],
               [(0, 1.12), (1, 0.92)], "MCA", s, territory=terr, label_anchor=("frac", 0.55))
    parents = {"sup": sup.id, "inf": inf.id}
    reg = _mca_region(sg)
    out = {}
    for (key, name, par, at, deep, cort, rk, (nb, dp)) in MCA_BRANCHES:
        vid = f"MCA_{key}_{s}"
        deep_pts = [S.lm(d) if isinstance(d, str) else S.p(*d) for d in deep]
        cort_pts = S.cortical(cort, depth=-0.8, surface="convexity", wiggle=2.2, wavelength=15.0, step=4.0)
        ctrl = deep_pts + cort_pts
        v = _add(tree, parents[par], at, vid, name, ctrl, rk, "MCA", s, territory=terr)
        k_exit = len(deep_pts) + 1  # ctrl index of the first cortical point (origin prepended)
        s_exit = _ctrl_s(v, k_exit)
        s_end = v.length()
        v.label_anchor = v.index_at(s_exit + 0.45 * (s_end - s_exit))
        v.meta["m4_start_mm"] = round(s_exit, 1)
        tree.grow_distal_branches(v.id, n_branches=nb, depth=dp, start_mm=s_exit + 5.0, seed=_seed(seed, vid),
                                  surface="brain", surface_depth=-0.8, min_radius=0.15, length_per_radius=62,
                                  max_length=50, branch_ratio=(0.55, 0.8), angle_deg=(30, 70), tortuosity=0.28,
                                  region=reg, keep_side=True, sub_branches=(1, 2))
        out[key] = v
    # temporopolar artery: early branch of M1 to the temporal pole
    tp_cort = S.cortical([(44.0, 19.5, -31.5), (47.0, 15.0, -37.5), (49.0, 9.0, -41.0)], depth=-0.8,
                         surface="convexity", wiggle=1.0, step=4.0, jitter=1.0)
    tp = _add(tree, m1.id, 9.0, f"MCA_temporopolar_{s}", "Temporopolar branch MCA",
              [S.p(25.0, 7.6, -15.6), S.p(32.0, 11.6, -20.0), S.p(38.5, 15.6, -25.5)] + tp_cort,
              [(0, 0.55), (1, 0.32)], "MCA", s, territory=terr, label_anchor=("frac", 0.55))
    tree.grow_distal_branches(tp.id, n_branches=2, depth=1, start_frac=0.6, seed=_seed(seed, tp.id),
                              surface="brain", surface_depth=-0.8, min_radius=0.15, length_per_radius=60,
                              max_length=30, region=reg, keep_side=True)
    out["temporopolar"] = tp
    return m1, sup, inf, out


# ----------------------------------------------------------------------------
# perforators (added last: small vessels, lowest label priority)
# ----------------------------------------------------------------------------

def _build_perforators(tree, S: Side, seed):
    s = S.s
    m1 = tree[f"M1_{s}"]
    a1 = tree[f"A1_{s}"]
    peri = tree[f"pericallosal_{s}"]
    # lateral lenticulostriate arteries (M1 superior surface -> anterior perforated substance ->
    # putamen / internal capsule; ascend, then curve posteromedially)
    lsa = []
    for k, s0 in enumerate((4.0, 6.5, 9.0, 11.5, 14.0, 16.5)):
        o = m1.points[m1.index_at(s0)]
        ox = abs(o[0])
        dx = 1.0 + 0.4 * k
        rows = [(ox + 0.6, o[1] - 0.3, o[2] + 3.5), (ox + dx, o[1] - 1.8, o[2] + 10.0),
                (ox + dx * 0.6, o[1] - 4.0, o[2] + 19.0), (ox - 1.6 - 0.2 * k, o[1] - 6.5, o[2] + 26.0 + k)]
        v = _add(tree, m1.id, s0, f"LSA_{k}_{s}", "Lateral lenticulostriate arteries" if k == 2 else "",
                 S.pts(rows, j=0.5), [(0, 0.36 if k in (1, 3) else 0.3), (1, 0.18)], "MCA", s,
                 territory=f"LSA_{s}", label_anchor=("frac", 0.55))
        lsa.append(v)
    # medial lenticulostriates (A1 -> medial anterior perforated substance)
    for k, s0 in enumerate((3.0, 6.0)):
        o = a1.points[a1.index_at(s0)]
        ox = abs(o[0])
        rows = [(ox - 0.4, o[1] - 0.6, o[2] + 4.0), (ox - 0.2, o[1] - 2.4, o[2] + 11.0),
                (ox + 0.6, o[1] - 4.4, o[2] + 17.0)]
        _add(tree, a1.id, s0, f"MLSA_{k}_{s}", "Medial lenticulostriate arteries" if k == 0 else "",
             S.pts(rows, j=0.4), [(0, 0.24), (1, 0.15)], "ACA", s, territory=f"ACA_{s}", label_anchor=-2)
    # recurrent artery of Heubner: proximal A2 -> doubles back above A1 -> lateral APS -> caudate head
    _add(tree, peri.id, 2.0, f"Heubner_{s}", "Recurrent artery of Heubner",
         [S.p(4.0, 11.4, -6.2), S.p(8.0, 9.4, -7.8), S.p(13.0, 7.2, -9.2), S.p(18.4, 6.4, -9.0),
          S.p(21.0, 7.0, -6.0), S.p(19.6, 8.2, 0.0), S.p(16.6, 9.6, 5.5)],
         [(0, 0.4), (0.6, 0.32), (1, 0.2)], "ACA", s, territory=f"ACA_{s}", label_anchor=3)
    return lsa


# ----------------------------------------------------------------------------
# public entry point
# ----------------------------------------------------------------------------

def build(tree, seed=0):
    """Add the anterior circulation (both sides) to ``tree``."""
    _install_pcomm_guard(tree)
    sides = {s: Side(s, seed) for s in SIDES}
    icas = {}
    for s in SIDES:
        S = sides[s]
        pet, cav, ica = _build_ica(tree, S, seed)
        icas[s] = ica
    # main labelled branches first (label priority follows insertion order)
    for s in SIDES:
        S = sides[s]
        _build_mca(tree, S, icas[s], seed)
        _build_aca(tree, S, icas[s], seed)
    # anterior communicating artery (collateral between the A1/A2 junctions)
    if "ACom" not in tree:
        tree.add_collateral("ACom", "Anterior communicating artery", ("A1_R", -1), ("A1_L", -1),
                            ctrl_mid=[(0.0, 10.5, -5.7)], radius=0.75, fill_fraction=0.35, group="CoW",
                            side=None, territory="ACA", label_anchor=1)
    for s in SIDES:
        S = sides[s]
        _build_oa(tree, S, icas[s], seed)
        _build_acha(tree, S, icas[s], seed)
        _build_pcomm(tree, S, icas[s], seed)
    for s in SIDES:
        S = sides[s]
        _build_sha(tree, S, icas[s], seed)
        _build_perforators(tree, S, seed)
    tree.meta.setdefault("notes", {})["anterior"] = STAR_NOTE
    return tree
