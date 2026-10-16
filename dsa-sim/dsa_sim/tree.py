"""Vessel tree data model, spline builders and procedural distal-branch growth.

Topology convention (READ THIS):
  * Every vessel is a polyline ``points`` (N,3 mm) with ``radii`` (N,) sampled at
    <= ``MAX_STEP`` mm.  Control points passed to the builders are kept EXACTLY as
    samples (``ctrl_index`` lists their sample indices), so landmark junctions match.
  * A vessel with a parent joins it with its FIRST point: points[0] ==
    parent.points[parent_index].
  * ``flow_direction`` = +1: blood flows from points[0] to points[-1] (arteries,
    and veins/sinuses that carry blood AWAY from the junction).  -1: flow is toward
    points[0], i.e. INTO the parent (venous tributaries).  branch_from() picks the
    default from ``system``: artery -> +1, vein -> -1.
  * ``merges_into`` = (vessel_id, index): the vessel's downstream end also empties
    into that vessel (confluences: e.g. right VA -> basilar, both VAs -> ASA).
  * ``collateral`` vessels (ACom, PComm, anastomoses) join parent at points[0] and
    ``connects_to`` = (vessel_id, index) at points[-1]; contrast may cross in either
    direction, attenuated by ``fill_fraction``.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

MAX_STEP = 0.8  # mm, default sample spacing


# ----------------------------------------------------------------------------
# spline helpers
# ----------------------------------------------------------------------------

def _catmull_rom_span(P0, P1, P2, P3, t, alpha=0.5):
    def tj(ti, Pi, Pj):
        return ti + max(np.linalg.norm(Pj - Pi), 1e-6) ** alpha

    t0 = 0.0
    t1 = tj(t0, P0, P1)
    t2 = tj(t1, P1, P2)
    t3 = tj(t2, P2, P3)
    tt = t1 + (t2 - t1) * t[:, None]
    A1 = (t1 - tt) / (t1 - t0) * P0 + (tt - t0) / (t1 - t0) * P1
    A2 = (t2 - tt) / (t2 - t1) * P1 + (tt - t1) / (t2 - t1) * P2
    A3 = (t3 - tt) / (t3 - t2) * P2 + (tt - t2) / (t3 - t2) * P3
    B1 = (t2 - tt) / (t2 - t0) * A1 + (tt - t0) / (t2 - t0) * A2
    B2 = (t3 - tt) / (t3 - t1) * A2 + (tt - t1) / (t3 - t1) * A3
    return (t2 - tt) / (t2 - t1) * B1 + (tt - t1) / (t2 - t1) * B2


def spline_through(ctrl, step=MAX_STEP, smooth=True):
    """Centripetal Catmull-Rom curve through ``ctrl`` (M,3) resampled at <= ``step`` mm.

    Returns (points (N,3), ctrl_index list).  Control points are kept exactly.
    smooth=False gives a straight polyline (resampled).
    """
    C = np.asarray(ctrl, dtype=float)
    if C.ndim != 2 or C.shape[1] != 3 or len(C) < 2:
        raise ValueError("ctrl must be (M>=2, 3)")
    # drop consecutive duplicates
    keep = np.concatenate([[True], np.linalg.norm(np.diff(C, axis=0), axis=1) > 1e-6])
    C = C[keep]
    if len(C) < 2:
        raise ValueError("ctrl points are all identical")
    ext = np.vstack([2 * C[0] - C[1], C, 2 * C[-1] - C[-2]])
    out = [C[0][None]]
    idx = [0]
    fine_t = np.linspace(0, 1, 64)
    for i in range(len(C) - 1):
        if smooth and len(C) > 2:
            fine = _catmull_rom_span(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], fine_t)
        else:
            fine = C[i] + (C[i + 1] - C[i]) * fine_t[:, None]
        seg = np.linalg.norm(np.diff(fine, axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        n = max(1, int(math.ceil(s[-1] / step)))
        si = np.linspace(0, s[-1], n + 1)[1:]
        pts = np.stack([np.interp(si, s, fine[:, k]) for k in range(3)], 1)
        pts[-1] = C[i + 1]
        out.append(pts)
        idx.append(idx[-1] + len(pts))
    return np.vstack(out), idx


def arclength(points):
    p = np.asarray(points, float)
    if len(p) < 2:
        return np.zeros(len(p))
    return np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])


def _radii_for(points, ctrl_index, radius):
    """radius: scalar | (r_start, r_end) | per-control-point sequence | per-sample array."""
    n = len(points)
    s = arclength(points)
    if np.isscalar(radius):
        return np.full(n, float(radius))
    r = np.asarray(radius, float)
    if r.shape == (n,):
        return r.copy()
    if len(r) == len(ctrl_index):
        return np.interp(s, s[ctrl_index], r)
    if len(r) == 2:
        return np.interp(s, [0, s[-1] if s[-1] > 0 else 1], r)
    raise ValueError(f"radius spec of length {len(r)} does not match {len(ctrl_index)} control points")


def murray_child_radius(r_parent, ratio):
    """Child radius for a branch taking ``ratio`` of the parent cube-law flow (0<ratio<1)."""
    return float(r_parent) * float(ratio) ** (1.0 / 3.0)


# ----------------------------------------------------------------------------
# data model
# ----------------------------------------------------------------------------
@dataclass
class Vessel:
    id: str
    name: str                       # display label exactly as printed on images ('' = unlabeled twig)
    points: np.ndarray              # (N,3) mm
    radii: np.ndarray               # (N,) mm
    system: str = "artery"          # 'artery' | 'vein'
    group: str = ""                 # 'ICA','ECA','ACA','MCA','PCA','VB','CoW','neck','venous',...
    short_label: str = ""
    parent: str | None = None
    parent_index: int | None = None
    flow_direction: int = 1
    collateral: bool = False
    fill_fraction: float = 1.0
    connects_to: tuple | None = None    # (vessel_id, index) far end of a collateral
    merges_into: tuple | None = None    # (vessel_id, index) downstream confluence
    label_anchor: int | None = None     # point index for the label leader line
    territory: str | None = None        # e.g. 'MCA_R', 'PICA_L'
    side: str | None = None             # 'R' | 'L' | None
    ctrl_index: list = field(default_factory=list)
    velocity_scale: float = 1.0
    drains: list | None = None          # veins: territory tags drained (fallback if no parenchyma)
    meta: dict = field(default_factory=dict)

    @property
    def labeled(self):
        return bool(self.name)

    @property
    def n(self):
        return len(self.points)

    def arclength(self):
        return arclength(self.points)

    def length(self):
        return float(self.arclength()[-1])

    def index_at(self, at):
        """Point index from an arclength (float mm, negative = from the end), an int index,
        a fraction given as ('frac', f), or a 3-D point (nearest sample)."""
        if isinstance(at, (int, np.integer)) and not isinstance(at, bool):
            i = int(at)
            return i if i >= 0 else self.n + i
        if isinstance(at, tuple) and len(at) == 2 and at[0] == "frac":
            s = self.arclength()
            return int(np.argmin(np.abs(s - float(at[1]) * s[-1])))
        a = np.asarray(at, float)
        if a.ndim == 0:
            s = self.arclength()
            v = float(a)
            if v < 0:
                v = s[-1] + v
            return int(np.argmin(np.abs(s - v)))
        return int(np.argmin(np.linalg.norm(self.points - a, axis=1)))

    def tangent(self, i):
        i0 = max(0, i - 1)
        i1 = min(self.n - 1, i + 1)
        t = self.points[i1] - self.points[i0]
        return t / max(np.linalg.norm(t), 1e-9)

    def anchor_point(self):
        i = self.label_anchor if self.label_anchor is not None else self.n // 2
        return self.points[int(np.clip(i, 0, self.n - 1))]


class VesselTree:
    """Ordered collection of vessels with builder helpers."""

    def __init__(self):
        self.vessels: dict[str, Vessel] = {}
        self._twig_counter = 0
        self.meta: dict = {}

    # ---- basic container -------------------------------------------------
    def __contains__(self, vid):
        return vid in self.vessels

    def __getitem__(self, vid) -> Vessel:
        return self.vessels[vid]

    def __iter__(self):
        return iter(self.vessels.values())

    def __len__(self):
        return len(self.vessels)

    def get(self, vid, default=None):
        return self.vessels.get(vid, default)

    def ids(self):
        return list(self.vessels)

    def children(self, vid):
        return [v for v in self.vessels.values() if v.parent == vid]

    def labeled(self):
        return [v for v in self.vessels.values() if v.labeled]

    def by_group(self, group):
        return [v for v in self.vessels.values() if v.group == group]

    def remove(self, vid, recursive=True):
        if recursive:
            for c in self.children(vid):
                self.remove(c.id, True)
        self.vessels.pop(vid, None)

    def n_points(self):
        return int(sum(v.n for v in self.vessels.values()))

    def n_segments(self):
        return int(sum(v.n - 1 for v in self.vessels.values()))

    # ---- builders ----------------------------------------------------------
    def add_vessel(self, id, name, ctrl, radius, system="artery", group="", parent=None, parent_index=None,
                   smooth=True, step=MAX_STEP, **kw) -> Vessel:
        """Create a vessel from control points (spline through them).

        radius: scalar | (r_start, r_end) | one value per control point.
        If ``parent`` is given (id or Vessel) and parent_index is None, the vessel is
        attached at the parent sample nearest to ctrl[0] and ctrl[0] is snapped to it.
        Extra keyword arguments set Vessel fields (short_label, territory, side,
        label_anchor, collateral, fill_fraction, connects_to, merges_into,
        flow_direction, velocity_scale, drains, meta).
        """
        if id in self.vessels:
            raise KeyError(f"duplicate vessel id {id!r}")
        ctrl = np.array(ctrl, dtype=float)
        pid = parent.id if isinstance(parent, Vessel) else parent
        if pid is not None:
            if pid not in self.vessels:
                raise KeyError(f"parent {pid!r} not in tree (build order / ids?)")
            pv = self.vessels[pid]
            if parent_index is None:
                parent_index = pv.index_at(ctrl[0])
            parent_index = pv.index_at(int(parent_index))
            ctrl[0] = pv.points[parent_index]
        pts, cidx = spline_through(ctrl, step=step, smooth=smooth)
        radii = _radii_for(pts, cidx, radius)
        if "flow_direction" not in kw:
            kw["flow_direction"] = 1 if (system == "artery" or pid is None) else -1
        la = kw.pop("label_anchor", None)
        if la is not None:
            la = Vessel(id, name, pts, radii).index_at(la)
            la = int(np.clip(la, 0, len(pts) - 1))
        v = Vessel(id=id, name=name, points=pts, radii=radii, system=system, group=group, parent=pid,
                   parent_index=parent_index, ctrl_index=cidx, label_anchor=la, **kw)
        if v.label_anchor is None:
            v.label_anchor = v.n // 2
        self.vessels[id] = v
        return v

    def branch_from(self, parent, at, id, name, ctrl, radius, system=None, group=None, **kw) -> Vessel:
        """Add a branch leaving ``parent`` at ``at`` (arclength mm | -mm from end | int index |
        ('frac', f) | 3-D point).  ``ctrl`` are the branch control points AFTER the
        origin (the origin on the parent is prepended automatically).  system/group
        default to the parent's.  Arteries flow away from the junction, veins toward it."""
        pv = self.vessels[parent.id if isinstance(parent, Vessel) else parent]
        i = pv.index_at(at)
        ctrl = np.atleast_2d(np.asarray(ctrl, float))
        full = np.vstack([pv.points[i][None], ctrl])
        system = system or pv.system
        group = group if group is not None else pv.group
        kw.setdefault("side", pv.side)
        kw.setdefault("territory", pv.territory)
        return self.add_vessel(id, name, full, radius, system=system, group=group, parent=pv.id,
                               parent_index=i, **kw)

    def add_collateral(self, id, name, a, b, ctrl_mid=(), radius=0.6, fill_fraction=0.3, group="CoW", **kw):
        """Collateral/anastomosis between ``a`` = (vessel_id, at) and ``b`` = (vessel_id, at)."""
        va = self.vessels[a[0]]
        vb = self.vessels[b[0]]
        ia = va.index_at(a[1])
        ib = vb.index_at(b[1])
        mid = np.asarray(ctrl_mid, float).reshape(-1, 3)
        ctrl = np.vstack([va.points[ia][None], mid, vb.points[ib][None]])
        return self.add_vessel(id, name, ctrl, radius, system=va.system, group=group, parent=va.id,
                               parent_index=ia, collateral=True, fill_fraction=fill_fraction,
                               connects_to=(vb.id, ib), flow_direction=1, **kw)

    def set_merge(self, vid, target, at, snap=True):
        """Declare that vessel ``vid``'s downstream end empties into ``target`` at ``at``."""
        v = self.vessels[vid]
        t = self.vessels[target]
        j = t.index_at(at)
        v.merges_into = (t.id, j)
        if snap:
            end = -1 if v.flow_direction > 0 else 0
            v.points[end] = t.points[j]
        return v

    # ---- queries -------------------------------------------------------------
    def find_nearest(self, point, system=None, group=None, labeled_only=False):
        """(vessel_id, index, distance) of the nearest sample to ``point``."""
        p = np.asarray(point, float)
        best = (None, -1, np.inf)
        for v in self.vessels.values():
            if system and v.system != system:
                continue
            if group and v.group != group:
                continue
            if labeled_only and not v.labeled:
                continue
            d = np.linalg.norm(v.points - p, axis=1)
            i = int(np.argmin(d))
            if d[i] < best[2]:
                best = (v.id, i, float(d[i]))
        return best

    def all_points(self, system=None):
        vs = [v for v in self.vessels.values() if system is None or v.system == system]
        if not vs:
            return np.zeros((0, 3)), np.zeros(0)
        return np.vstack([v.points for v in vs]), np.concatenate([v.radii for v in vs])

    def validate(self, tol=0.6, verbose=True):
        """Check ids/parents/junctions; returns list of problem strings."""
        probs = []
        for v in self.vessels.values():
            if v.n < 2:
                probs.append(f"{v.id}: fewer than 2 points")
            if not np.all(np.isfinite(v.points)) or not np.all(np.isfinite(v.radii)):
                probs.append(f"{v.id}: non-finite geometry")
            if np.any(v.radii <= 0):
                probs.append(f"{v.id}: non-positive radius")
            if v.system not in ("artery", "vein"):
                probs.append(f"{v.id}: bad system {v.system}")
            if v.parent is not None:
                if v.parent not in self.vessels:
                    probs.append(f"{v.id}: missing parent {v.parent}")
                else:
                    pv = self.vessels[v.parent]
                    if not (0 <= (v.parent_index or 0) < pv.n):
                        probs.append(f"{v.id}: parent_index out of range")
                    elif np.linalg.norm(pv.points[v.parent_index] - v.points[0]) > tol:
                        probs.append(f"{v.id}: junction gap {np.linalg.norm(pv.points[v.parent_index]-v.points[0]):.2f} mm")
            for attr in ("connects_to", "merges_into"):
                ref = getattr(v, attr)
                if ref is not None:
                    if ref[0] not in self.vessels:
                        probs.append(f"{v.id}: {attr} -> missing {ref[0]}")
                    elif not (0 <= ref[1] < self.vessels[ref[0]].n):
                        probs.append(f"{v.id}: {attr} index out of range")
            if v.label_anchor is not None and not (0 <= v.label_anchor < v.n):
                probs.append(f"{v.id}: label_anchor out of range")
        if verbose and probs:
            print("[tree.validate]", len(probs), "problems:")
            for p in probs[:30]:
                print("   ", p)
        return probs

    def summary(self):
        from collections import Counter
        c = Counter((v.system, v.group) for v in self.vessels.values())
        return {
            "vessels": len(self.vessels),
            "labeled": len(self.labeled()),
            "points": self.n_points(),
            "segments": self.n_segments(),
            "by_group": {f"{k[0]}:{k[1]}": n for k, n in sorted(c.items())},
        }

    # ---- serialisation -------------------------------------------------------
    def to_dict(self, decimals=2):
        out = []
        for v in self.vessels.values():
            out.append({
                "id": v.id, "name": v.name, "short": v.short_label, "sys": v.system, "grp": v.group,
                "parent": v.parent, "pi": v.parent_index, "fd": v.flow_direction,
                "col": bool(v.collateral), "ff": v.fill_fraction,
                "conn": list(v.connects_to) if v.connects_to else None,
                "merge": list(v.merges_into) if v.merges_into else None,
                "anchor": v.label_anchor, "terr": v.territory, "side": v.side, "vs": v.velocity_scale,
                "drains": v.drains, "ctrl": list(map(int, v.ctrl_index)),
                "pts": np.round(v.points, decimals).ravel().tolist(),
                "r": np.round(v.radii, 3).tolist(),
                "meta": v.meta or None,
            })
        return {"format": "dsa_sim.tree/1", "frame": "RAS mm, origin AC", "meta": self.meta, "vessels": out}

    def to_json(self, path=None, decimals=2):
        d = self.to_dict(decimals)
        s = json.dumps(d, separators=(",", ":"))
        if path:
            with open(path, "w") as f:
                f.write(s)
        return s

    @classmethod
    def from_dict(cls, d):
        t = cls()
        t.meta = d.get("meta", {}) or {}
        for e in d["vessels"]:
            pts = np.asarray(e["pts"], float).reshape(-1, 3)
            v = Vessel(id=e["id"], name=e["name"], points=pts, radii=np.asarray(e["r"], float),
                       system=e["sys"], group=e["grp"], short_label=e.get("short", ""), parent=e["parent"],
                       parent_index=e["pi"], flow_direction=e["fd"], collateral=e["col"], fill_fraction=e["ff"],
                       connects_to=tuple(e["conn"]) if e.get("conn") else None,
                       merges_into=tuple(e["merge"]) if e.get("merge") else None,
                       label_anchor=e.get("anchor"), territory=e.get("terr"), side=e.get("side"),
                       ctrl_index=e.get("ctrl", []), velocity_scale=e.get("vs", 1.0), drains=e.get("drains"),
                       meta=e.get("meta") or {})
            t.vessels[v.id] = v
        return t

    @classmethod
    def from_json(cls, s_or_path):
        if isinstance(s_or_path, str) and s_or_path.lstrip().startswith("{"):
            return cls.from_dict(json.loads(s_or_path))
        with open(s_or_path) as f:
            return cls.from_dict(json.load(f))

    # ---- procedural twigs ------------------------------------------------------
    def grow_distal_branches(self, vessel, **kw):
        return grow_distal_branches(self, vessel, **kw)

    def _new_twig_id(self, base):
        self._twig_counter += 1
        return f"{base}~{self._twig_counter}"


# ----------------------------------------------------------------------------
# procedural distal branches (unlabeled cortical / cerebellar twigs)
# ----------------------------------------------------------------------------

def _unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


def _smooth_path(P, passes=2):
    P = P.copy()
    for _ in range(passes):
        if len(P) > 2:
            P[1:-1] = 0.25 * P[:-2] + 0.5 * P[1:-1] + 0.25 * P[2:]
    return P


def grow_distal_branches(tree: VesselTree, vessel, n_branches=6, start_frac=0.5, start_mm=None, depth=2,
                         sub_branches=(1, 2), seed=0, surface="brain", surface_depth=-0.8,
                         min_radius=0.15, length_per_radius=70.0, max_length=90.0,
                         branch_ratio=(0.55, 0.8), angle_deg=(35.0, 75.0), tortuosity=0.25,
                         step=1.0, bias=None, bias_weight=0.3, region: Callable | None = None,
                         keep_side=True, include_tip=True, avoid=True, avoid_dist=2.0, taper=0.7,
                         group=None, territory=None, max_snap=12.0) -> list:
    """Sprout realistic unlabeled tapering twigs from the distal part of ``vessel``.

    Twigs random-walk (persistent direction + ``tortuosity`` noise) on the implicit
    ``surface`` ('brain' | 'cerebrum' | 'cerebellum' | 'scalp' | callable sdf | None for
    free 3-D growth) at ``surface_depth`` mm (negative = outside the pia, i.e. in the
    subarachnoid space; pial arteries ~ -0.8).  Child radius = parent radius x
    U(branch_ratio) (asymmetric Murray-type bifurcations); twig length ~
    length_per_radius x radius; recursion ``depth`` with ``sub_branches`` (min,max)
    per twig; stops below ``min_radius``.  Avoids existing vessels (``avoid_dist``),
    optional ``region(points)->bool`` mask, ``keep_side`` forbids crossing the midline,
    ``bias`` = 3-vector or callable(points)->(K,3) steering.  Deterministic per seed.
    Returns the list of new vessel ids.
    """
    import zlib

    from scipy.spatial import cKDTree

    from . import frame as F

    v = tree[vessel.id if isinstance(vessel, Vessel) else vessel]
    rng = np.random.default_rng((int(seed) * 1000003 + zlib.crc32(v.id.encode())) % (2 ** 32))
    surf_fn = None
    if surface is not None:
        surf_fn = F._surface_fn(surface)
    group = group if group is not None else v.group
    territory = territory if territory is not None else v.territory
    fd = 1 if v.system == "artery" else -1

    s = v.arclength()
    s0 = start_mm if start_mm is not None else start_frac * s[-1]
    s0 = float(np.clip(s0, 0, s[-1]))
    seeds = []  # (origin, dir, radius, parent_id, parent_index)
    if n_branches > 0 and s[-1] > 1:
        base = np.linspace(s0, s[-1] * 0.97, n_branches + 2)[1:-1]
        jit = (s[-1] - s0) / (n_branches + 1) * 0.35
        sites = np.clip(base + rng.uniform(-jit, jit, len(base)), 0, s[-1])
        for sv in sites:
            i = v.index_at(float(sv))
            rp = v.radii[i]
            rc = rp * rng.uniform(*branch_ratio)
            if rc < min_radius:
                if rp * branch_ratio[1] < min_radius * 0.9:
                    continue
                rc = min_radius
            seeds.append((v.points[i], v.tangent(i), rc, v.id, i, True))
    if include_tip:
        seeds.append((v.points[-1], v.tangent(v.n - 1), max(v.radii[-1] * 0.92, min_radius), v.id, v.n - 1, False))

    side0 = None
    if keep_side:
        side0 = np.sign(v.points[-1][0]) if abs(v.points[-1][0]) > 3 else None

    new_ids = []
    for gen in range(depth + 1):
        if not seeds:
            break
        K = len(seeds)
        org = np.array([sd[0] for sd in seeds], float)
        tan = _unit(np.array([sd[1] for sd in seeds], float))
        rad = np.array([sd[2] for sd in seeds], float)
        rotate = np.array([sd[5] for sd in seeds], bool)
        # initial directions
        rnd = _unit(rng.normal(size=(K, 3)))
        if surf_fn is not None:
            nrm = _unit(F.sdf_gradient(surf_fn, org, 0.6))
            tan_t = tan - (tan * nrm).sum(1, keepdims=True) * nrm
            tan = np.where(np.linalg.norm(tan_t, axis=1, keepdims=True) > 0.2, _unit(tan_t), tan)
            rnd = rnd - (rnd * nrm).sum(1, keepdims=True) * nrm
        rnd = rnd - (rnd * tan).sum(1, keepdims=True) * tan
        rnd = _unit(rnd)
        ang = np.radians(rng.uniform(*angle_deg, K))[:, None]
        d = np.where(rotate[:, None], np.cos(ang) * tan + np.sin(ang) * rnd, tan)
        d = _unit(d)
        Lt = np.clip(length_per_radius * rad * rng.uniform(0.7, 1.3, K), 4 * step, max_length)
        pos = org.copy()
        alive = np.ones(K, bool)
        travel = np.zeros(K)
        paths = [[o.copy()] for o in org]
        existing, _ = tree.all_points(v.system)
        kd = cKDTree(existing) if (avoid and len(existing)) else None
        nsteps = int(math.ceil(Lt.max() / step))
        pending = []
        for k in range(nsteps):
            if not alive.any():
                break
            nd = d + rng.normal(size=(K, 3)) * tortuosity
            if bias is not None:
                b = bias(pos) if callable(bias) else np.broadcast_to(np.asarray(bias, float), (K, 3))
                nd = nd + bias_weight * _unit(np.asarray(b, float))
            if kd is not None and k > 2:
                probe = pos + d * step
                dist, idx = kd.query(probe, k=6, distance_upper_bound=avoid_dist + rad.max())
                rep = np.zeros((K, 3))
                for j in range(dist.shape[1]):
                    ok = np.isfinite(dist[:, j])
                    if not ok.any():
                        continue
                    q = np.zeros((K, 3))
                    q[ok] = kd.data[idx[ok, j]]
                    vec = probe - q
                    ahead = ((q - pos) * d).sum(1) > 0.2 * step
                    w = (ok & ahead)[:, None] / np.maximum(dist[:, j:j + 1], 0.3) ** 2
                    rep += np.where(np.isfinite(w), w, 0) * vec
                nd = nd + 0.8 * rep
            nd = _unit(nd)
            newp = pos + step * nd
            if surf_fn is not None:
                newp = F.project_to_surface(newp, surf_fn, surface_depth, iters=4)
            disp = np.linalg.norm(newp - pos, axis=1)
            lim = max_snap if k == 0 else 3.0 * step
            alive &= (disp < lim) & (disp > 0.05 * step)
            if region is not None and k > 2:
                alive &= np.asarray(region(newp), bool)
            if side0 is not None:
                alive &= ~((np.sign(newp[:, 0]) != side0) & (np.abs(newp[:, 0]) > 0.8))
            for j in np.nonzero(alive)[0]:
                if k == 0 and disp[j] > 1.5 * step:
                    nseg = int(math.ceil(disp[j] / step))
                    for t in np.linspace(0, 1, nseg + 1)[1:]:
                        paths[j].append(pos[j] + (newp[j] - pos[j]) * t)
                else:
                    paths[j].append(newp[j].copy())
                pending.append(newp[j].copy())
            d = np.where(alive[:, None], _unit(newp - pos), d)
            pos = np.where(alive[:, None], newp, pos)
            travel += np.where(alive, disp, 0)
            alive &= travel < Lt
            if kd is not None and k % 8 == 7 and pending:
                kd = cKDTree(np.vstack([kd.data, np.array(pending)]))
                pending = []
        next_seeds = []
        for j in range(K):
            P = np.array(paths[j])
            if len(P) < 4:
                continue
            P = _smooth_path(P)
            P[0] = org[j]
            r = np.linspace(rad[j], max(rad[j] * taper, min_radius * 0.8), len(P))
            vid = tree._new_twig_id(seeds[j][3])
            tw = Vessel(id=vid, name="", points=P, radii=r, system=v.system, group=group,
                        parent=seeds[j][3], parent_index=int(seeds[j][4]), flow_direction=fd,
                        territory=territory, side=v.side, ctrl_index=[0, len(P) - 1],
                        label_anchor=len(P) // 2, meta={"twig": True, "gen": gen})
            tree.vessels[vid] = tw
            new_ids.append(vid)
            if gen < depth:
                m = int(rng.integers(sub_branches[0], sub_branches[1] + 1))
                for _ in range(m):
                    ii = int(rng.uniform(0.25, 0.85) * (len(P) - 1))
                    rc = r[ii] * rng.uniform(*branch_ratio)
                    if rc >= min_radius:
                        next_seeds.append((P[ii], tw.tangent(ii), rc, vid, ii, True))
        seeds = next_seeds
    return new_ids
