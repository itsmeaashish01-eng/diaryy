"""C-arm cone-beam rendering: DSA cine frames, unsubtracted frames with a skull DRR,
3-D rotational angiography (shaded tubes) and labelled overlays.

Geometry: the C-arm rotates about the isocentre ``center``.  LAO/RAO (``lao`` > 0 =
LAO) rotates the DETECTOR toward the patient's left about the head-foot axis, CRAN/CAUD
(``cran`` > 0 = cranial) tilts the detector toward the head.  lao=0, cran=0 is the PA
frontal position (tube posterior, detector anterior).  Images are displayed as seen
from the detector looking toward the source, which gives the radiological conventions:
  AP  : patient's right on the viewer's LEFT, head up
  LAT : (LAO 90, detector on the patient's left) face to the viewer's LEFT.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace

import numpy as np
from scipy import sparse
from scipy.ndimage import gaussian_filter, map_coordinates, zoom

from .tree import VesselTree


# ----------------------------------------------------------------------------
# view geometry
# ----------------------------------------------------------------------------
@dataclass
class View:
    name: str = "AP"
    lao: float = 0.0           # deg, + = LAO (detector to patient's left), - = RAO
    cran: float = 0.0          # deg, + = cranial, - = caudal
    sid: float = 1000.0        # source-image distance, mm
    sod: float = 700.0         # source-object(isocentre) distance, mm
    det_mm: float = 300.0      # detector side length, mm
    size: int = 768            # pixels (square)
    center: tuple = (0.0, -14.0, -8.0)   # isocentre (RAS mm)
    roll: float = 0.0          # deg, in-plane image rotation

    def basis(self):
        a = math.radians(self.lao)
        b = math.radians(self.cran)
        d = np.array([-math.sin(a) * math.cos(b), math.cos(a) * math.cos(b), math.sin(b)])
        f = -d
        up_ref = np.array([0.0, 0.0, 1.0])
        r = np.cross(f, up_ref)
        if np.linalg.norm(r) < 1e-6:
            r = np.array([-1.0, 0.0, 0.0])
        r /= np.linalg.norm(r)
        u = np.cross(r, f)
        u /= np.linalg.norm(u)
        if self.roll:
            c, s = math.cos(math.radians(self.roll)), math.sin(math.radians(self.roll))
            r, u = c * r + s * u, -s * r + c * u
        src = np.asarray(self.center, float) - d * self.sod
        return src, d, r, u

    @property
    def pixel_mm(self):
        return self.det_mm / self.size

    @property
    def magnification(self):
        return self.sid / self.sod

    def project(self, P):
        """P (...,3) -> (x_px, y_px, depth_mm, mag).  x right, y down (row index)."""
        src, d, r, u = self.basis()
        q = np.asarray(P, float) - src
        depth = q @ d
        dep = np.maximum(depth, 1.0)
        xs = self.sid * (q @ r) / dep
        ys = self.sid * (q @ u) / dep
        px = self.size / 2.0 + xs / self.pixel_mm
        py = self.size / 2.0 - ys / self.pixel_mm
        return px, py, depth, self.sid / dep

    def pixel_rays(self, size=None):
        """Unit ray directions for every pixel centre (H,W,3) and the source."""
        n = size or self.size
        src, d, r, u = self.basis()
        pm = self.det_mm / n
        c = (np.arange(n) + 0.5 - n / 2.0) * pm
        X, Y = np.meshgrid(c, -c)
        det = src + d * self.sid
        P = det[None, None] + X[..., None] * r + Y[..., None] * u
        R = P - src
        R /= np.linalg.norm(R, axis=-1, keepdims=True)
        return src, R

    def key(self):
        return (round(self.lao, 3), round(self.cran, 3), self.sid, self.sod, self.det_mm, self.size,
                tuple(np.round(self.center, 2)), round(self.roll, 3))


HEAD_CENTER = (0.0, -14.0, -8.0)
VIEWS = {
    # frontal: Caldwell-like (petrous ridges in the lower orbits), patient's right on viewer's left
    "AP": View("AP", lao=0.0, cran=-12.0, center=HEAD_CENTER),
    "AP_TRUE": View("AP_TRUE", lao=0.0, cran=0.0, center=HEAD_CENTER),
    # Towne-like frontal for the posterior circulation (basilar foreshortened, occipital lobes up)
    "TOWNE": View("TOWNE", lao=0.0, cran=30.0, center=(0.0, -24.0, -20.0)),
    # lateral, detector on the patient's left: face to the viewer's LEFT
    "LAT": View("LAT", lao=90.0, cran=0.0, center=HEAD_CENTER),
    "LAT_R": View("LAT_R", lao=-90.0, cran=0.0, center=HEAD_CENTER),
    "LAT_POST": View("LAT_POST", lao=90.0, cran=0.0, center=(0.0, -36.0, -20.0)),
    "OBL_R": View("OBL_R", lao=-30.0, cran=-10.0, center=HEAD_CENTER),
    "OBL_L": View("OBL_L", lao=30.0, cran=-10.0, center=HEAD_CENTER),
    "NECK_AP": View("NECK_AP", lao=0.0, cran=0.0, det_mm=400.0, center=(0.0, -10.0, -150.0)),
    "NECK_LAT": View("NECK_LAT", lao=90.0, cran=0.0, det_mm=400.0, center=(0.0, -10.0, -130.0)),
    "ARCH_LAO": View("ARCH_LAO", lao=30.0, cran=0.0, det_mm=400.0, center=(0.0, 0.0, -215.0)),
}


def get_view(v="LAT", **over) -> View:
    """View preset by name (or a View) with field overrides, e.g. get_view('LAT', size=512)."""
    base = v if isinstance(v, View) else VIEWS[v]
    return replace(base, **over) if over else replace(base)


def rotational_view(angle_deg, elevation_deg=0.0, base="AP_TRUE", **over) -> View:
    """3-D RA spin position: angle 0 = PA, 90 = left lateral (LAO 90), 180 = AP, -90 = right lateral."""
    return get_view(base, lao=float(angle_deg), cran=float(elevation_deg), name=f"RA{angle_deg:+.0f}", **over)


# ----------------------------------------------------------------------------
# segments
# ----------------------------------------------------------------------------
@dataclass
class Segments:
    p0: np.ndarray
    p1: np.ndarray
    r: np.ndarray
    n0: np.ndarray        # global node of p0 (hemo.NodeIndex numbering)
    n1: np.ndarray
    vessel: np.ndarray    # vessel ordinal (NodeIndex.vids)
    is_vein: np.ndarray
    m0: np.ndarray = None  # unit normal of the (mitred) start plane, pointing along the segment
    m1: np.ndarray = None  # unit normal of the end plane

    def __post_init__(self):
        if self.m0 is None:
            ax = self.p1 - self.p0
            ax = ax / np.maximum(np.linalg.norm(ax, axis=1, keepdims=True), 1e-9)
            self.m0 = ax.copy()
            self.m1 = ax.copy()

    def __len__(self):
        return len(self.r)

    def subset(self, mask):
        return Segments(self.p0[mask], self.p1[mask], self.r[mask], self.n0[mask], self.n1[mask],
                        self.vessel[mask], self.is_vein[mask], self.m0[mask], self.m1[mask])


def segments_from_tree(tree: VesselTree, ix=None, skip_inside_parent=True) -> Segments:
    """Flatten a tree into tube segments (one per consecutive point pair)."""
    from .hemo import NodeIndex
    ix = ix or NodeIndex(tree)
    P0, P1, R, N0, N1, V, VE, M0, M1 = [], [], [], [], [], [], [], [], []
    tangents = {}
    for vid in ix.vids:
        v = tree[vid]
        n = v.n
        # mitre planes: bisector tangents at interior points -> gap-free bends
        seg = np.diff(v.points, axis=0)
        seg = seg / np.maximum(np.linalg.norm(seg, axis=1, keepdims=True), 1e-9)
        tg = np.empty((n, 3))
        tg[0] = seg[0]
        tg[-1] = seg[-1]
        if n > 2:
            b = seg[:-1] + seg[1:]
            bn = np.linalg.norm(b, axis=1, keepdims=True)
            tg[1:-1] = np.where(bn > 0.3, b / np.maximum(bn, 1e-9), seg[1:])
        tangents[vid] = tg
    # end-to-end continuations (single child starting at the parent's last point): share one mitre plane
    from collections import Counter
    ends = Counter(tree[v].parent for v in ix.vids
                   if tree[v].parent in tangents and tree[v].parent_index == tree[tree[v].parent].n - 1)
    for vid in ix.vids:
        v = tree[vid]
        if v.parent in tangents and v.parent_index == tree[v.parent].n - 1 and ends[v.parent] == 1:
            b = tangents[v.parent][-1] + tangents[vid][0]
            nb = np.linalg.norm(b)
            if nb > 0.3:
                tangents[v.parent][-1] = b / nb
                tangents[vid][0] = b / nb
    for k, vid in enumerate(ix.vids):
        v = tree[vid]
        o = ix.offset[vid]
        n = v.n
        keep = np.ones(n - 1, bool)
        tg = tangents[vid]
        if skip_inside_parent and v.parent is not None and v.parent in tree and \
                0 < (v.parent_index or 0) < tree[v.parent].n - 1:
            pv = tree[v.parent]
            rp = pv.radii[v.parent_index] * 0.9
            j = pv.points[v.parent_index]
            inside = np.linalg.norm(v.points - j, axis=1) < rp
            keep &= ~(inside[:-1] & inside[1:])
        idx = np.nonzero(keep)[0]
        if len(idx) == 0:
            continue
        P0.append(v.points[idx])
        P1.append(v.points[idx + 1])
        R.append(0.5 * (v.radii[idx] + v.radii[idx + 1]))
        N0.append(o + idx)
        N1.append(o + idx + 1)
        V.append(np.full(len(idx), k))
        VE.append(np.full(len(idx), v.system == "vein"))
        M0.append(tg[idx])
        M1.append(tg[idx + 1])
    if not P0:
        z = np.zeros((0, 3))
        e = np.zeros(0, int)
        return Segments(z, z, np.zeros(0), e, e, e, np.zeros(0, bool))
    return Segments(np.vstack(P0), np.vstack(P1), np.concatenate(R), np.concatenate(N0), np.concatenate(N1),
                    np.concatenate(V), np.concatenate(VE), np.vstack(M0), np.vstack(M1))


# ----------------------------------------------------------------------------
# exact chord-length stencils
# ----------------------------------------------------------------------------
_CLASSES = np.array([3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384])


def _chord_sample(dx, dy, C, deg, exu, eyu, ell, L, k, r_eff, sin_t, an0, an1, wn0, wn1, rn0, un0, rn1, un1, BIG):
    """Exact chord through a mitred cylinder for sample offsets (dx,dy) px from P0."""
    dg = C(deg)
    along = np.where(dg, 0.0, dx * C(exu) + dy * C(eyu))
    ox = dx - along * C(exu)
    oy = dy - along * C(eyu)
    ks = C(k)
    rho = np.sqrt(ox * ox + oy * oy) / ks
    re = C(r_eff)
    half = np.sqrt(np.clip(re * re - rho * rho, 0, None))
    sc = np.where(dg, 0.0, along / np.maximum(C(ell), 1e-9)) * C(L)
    o_n0 = (ox * C(rn0) - oy * C(un0)) / ks
    o_n1 = (ox * C(rn1) - oy * C(un1)) / ks
    st = C(sin_t)
    hl = np.where(st > 1e-4, half / np.maximum(st, 1e-4), BIG)
    lo = -hl
    hi = hl.copy()
    g0 = sc * C(an0) + o_n0
    w0 = C(wn0)
    with np.errstate(divide="ignore", invalid="ignore"):
        b0 = -g0 / w0
    pos0 = w0 > 1e-6
    neg0 = w0 < -1e-6
    lo = np.where(pos0, np.maximum(lo, b0), lo)
    hi = np.where(neg0, np.minimum(hi, b0), hi)
    hi = np.where(~pos0 & ~neg0 & (g0 < 0), -BIG, hi)
    g1 = (sc - C(L)) * C(an1) + o_n1
    w1 = C(wn1)
    with np.errstate(divide="ignore", invalid="ignore"):
        b1 = -g1 / w1
    pos1 = w1 > 1e-6
    neg1 = w1 < -1e-6
    hi = np.where(pos1, np.minimum(hi, b1), hi)
    lo = np.where(neg1, np.maximum(lo, b1), lo)
    hi = np.where(~pos1 & ~neg1 & (g1 > 0), -BIG, hi)
    chord = np.clip(hi - lo, 0, 4 * (C(L) + re))
    chord = np.where(rho < re, chord, 0.0)
    crs = dx * C(eyu) - dy * C(exu)
    return chord, rho, lo, crs, sc


def _stencils(view: View, segs: Segments, size=None, r_min_px=1.0, max_elems=3_000_000, need_shading=False, aa=2):
    """Yield dicts of per-(segment, pixel) samples for all segments.

    Each segment is a cylinder (radius = mean of its end radii) clipped by its two
    mitre planes (bisector planes at interior joints), so consecutive segments tile a
    smooth tube with neither gaps nor overlaps.  For every pixel ray the exact chord
    length through that solid is computed (local parallel-ray approximation per
    segment).  Thin vessels are drawn with at least ``r_min_px`` radius while
    conserving the projected iodine (thickness scaled by (r/r_eff)^2).

    keys: seg (int), pix (flat index), chord (mm) and, if need_shading, depth (mm of
    the entry point), sperp (signed rho/r), ex, ey (projected axis direction).
    """
    n = size or view.size
    if len(segs) == 0:
        return
    sv = replace(view, size=n)
    x0, y0, d0, m0 = sv.project(segs.p0)
    x1, y1, d1, m1 = sv.project(segs.p1)
    src, dvec, rv, uv = sv.basis()
    mid = 0.5 * (segs.p0 + segs.p1)
    w = mid - src
    w /= np.linalg.norm(w, axis=1, keepdims=True)
    ax3 = segs.p1 - segs.p0
    L = np.linalg.norm(ax3, axis=1)
    a = ax3 / np.maximum(L, 1e-9)[:, None]
    cos_s = (a * w).sum(1)                       # signed
    sin_t = np.sqrt(np.clip(1 - cos_s ** 2, 0, 1))
    k = 0.5 * (m0 + m1) / sv.pixel_mm            # px per mm at the segment depth
    r = segs.r
    r_eff = np.maximum(r, r_min_px / k)
    scale = (r / r_eff) ** 2
    rpx = r_eff * k
    # mitre plane coefficients
    an0 = (a * segs.m0).sum(1)
    an1 = (a * segs.m1).sum(1)
    wn0 = (w * segs.m0).sum(1)
    wn1 = (w * segs.m1).sum(1)
    rn0 = segs.m0 @ rv
    un0 = segs.m0 @ uv
    rn1 = segs.m1 @ rv
    un1 = segs.m1 @ uv
    # bounding boxes (mitred ends can stick out by ~r*tan(half bend angle))
    pad = rpx * 1.5 + 1
    xmin = np.floor(np.minimum(x0, x1) - pad)
    ymin = np.floor(np.minimum(y0, y1) - pad)
    xmax = np.ceil(np.maximum(x0, x1) + pad)
    ymax = np.ceil(np.maximum(y0, y1) + pad)
    vis = (xmax >= 0) & (ymax >= 0) & (xmin < n) & (ymin < n) & (d0 > 1) & (d1 > 1)
    B = np.maximum(xmax - xmin, ymax - ymin) + 1
    cls = np.minimum(np.searchsorted(_CLASSES, B), len(_CLASSES) - 1)
    ex = x1 - x0
    ey = y1 - y0
    ell = np.sqrt(ex * ex + ey * ey)
    deg = ell < 1e-3
    exu = np.where(deg, 1.0, ex / np.maximum(ell, 1e-9))
    eyu = np.where(deg, 0.0, ey / np.maximum(ell, 1e-9))
    BIG = 1e6
    for ci, Bc in enumerate(_CLASSES):
        sel = np.nonzero(vis & (cls == ci))[0]
        if len(sel) == 0:
            continue
        per = int(Bc) * int(Bc)
        step = max(1, max_elems // per)
        g = np.arange(int(Bc))
        GX, GY = np.meshgrid(g, g)
        GX = GX.ravel()
        GY = GY.ravel()
        for s0 in range(0, len(sel), step):
            s = sel[s0:s0 + step]
            px = xmin[s][:, None] + GX[None]
            py = ymin[s][:, None] + GY[None]
            # cheap centre-sample pre-pass: keep only pixels that any sub-sample can hit
            dxc = px + 0.5 - x0[s][:, None]
            dyc = py + 0.5 - y0[s][:, None]
            alc = np.where(deg[s][:, None], 0.0, dxc * exu[s][:, None] + dyc * eyu[s][:, None])
            oxc = dxc - alc * exu[s][:, None]
            oyc = dyc - alc * eyu[s][:, None]
            cand = (px >= 0) & (py >= 0) & (px < n) & (py < n) & \
                (oxc * oxc + oyc * oyc < (rpx[s][:, None] + 0.75) ** 2)
            ii, jj = np.nonzero(cand)
            if len(ii) == 0:
                continue
            sidx = s[ii]
            G = lambda arr: arr[sidx]  # noqa: E731
            fpx = px[ii, jj]
            fpy = py[ii, jj]
            subs = ((0.5, 0.5),) if aa <= 1 else tuple(((i + 0.5) / aa, (j + 0.5) / aa) for i in range(aa) for j in range(aa))
            chord = 0.0
            for (sx, sy) in subs:
                c_, rho, lo, crs, sc = _chord_sample(fpx + sx - G(x0), fpy + sy - G(y0), G, deg, exu, eyu, ell, L, k,
                                                     r_eff, sin_t, an0, an1, wn0, wn1, rn0, un0, rn1, un1, BIG)
                chord = chord + c_
            chord = chord * (G(scale) / len(subs))
            if len(subs) > 1 and need_shading:
                _, rho, lo, crs, sc = _chord_sample(fpx + 0.5 - G(x0), fpy + 0.5 - G(y0), G, deg, exu, eyu, ell, L, k,
                                                    r_eff, sin_t, an0, an1, wn0, wn1, rn0, un0, rn1, un1, BIG)
            m = chord > 1e-5
            if not m.any():
                continue
            out = {
                "seg": sidx[m],
                "pix": (fpy * n + fpx)[m].astype(np.int64),
                "chord": chord[m].astype(np.float32),
            }
            if need_shading:
                re = G(r_eff)
                tc = np.clip(sc / np.maximum(G(L), 1e-9), 0, 1)
                dep = G(d0) + G(d1 - d0) * tc + np.clip(lo, -4 * re, 4 * re)
                out["depth"] = dep[m].astype(np.float32)
                out["sperp"] = (np.sign(crs) * rho / np.maximum(re, 1e-6))[m].astype(np.float32)
                out["ex"] = G(exu)[m].astype(np.float32)
                out["ey"] = G(eyu)[m].astype(np.float32)
            yield out


class Projector:
    """Sparse (pixels x segments) iodine-thickness operator for one view.

    image_mm = A @ c_seg, where c_seg is each segment's lumen opacification (0..1).
    Build once per view, then every cine frame is a sparse mat-vec.
    """

    def __init__(self, view: View, segs: Segments, size=None, r_min_px=1.0, aa=2):
        self.view = view
        self.size = size or view.size
        self.segs = segs
        rows, cols, vals = [], [], []
        for st in _stencils(view, segs, self.size, r_min_px, aa=aa):
            rows.append(st["pix"])
            cols.append(st["seg"])
            vals.append(st["chord"])
        n = self.size
        if rows:
            rows = np.concatenate(rows)
            cols = np.concatenate(cols)
            vals = np.concatenate(vals)
        else:
            rows = cols = np.zeros(0, int)
            vals = np.zeros(0, np.float32)
        self.A = sparse.csr_matrix((vals, (rows, cols)), shape=(n * n, len(segs)), dtype=np.float32)

    @property
    def nnz(self):
        return self.A.nnz

    def image(self, c_seg):
        n = self.size
        return np.asarray(self.A @ np.asarray(c_seg, np.float32)).reshape(n, n)

    def images(self, C):
        """C (n_seg, n_t) -> (n_t, H, W)."""
        n = self.size
        out = self.A @ np.asarray(C, np.float32)
        return np.asarray(out).T.reshape(-1, n, n)


class BlushProjector:
    """Low-resolution splatting of parenchymal voxels (capillary blush)."""

    def __init__(self, view: View, pos, weight, blood_fraction=0.04, factor=4, size=None, spacing=3.0):
        self.view = view
        self.size = size or view.size
        self.factor = factor
        nl = self.size // factor
        self.nl = nl
        sv = replace(view, size=nl)
        x, y, d, m = sv.project(pos)
        area_obj = (sv.pixel_mm / m) ** 2
        val = weight * blood_fraction / area_obj
        x0 = np.floor(x - 0.5).astype(int)
        y0 = np.floor(y - 0.5).astype(int)
        fx = x - 0.5 - x0
        fy = y - 0.5 - y0
        rows, cols, vals = [], [], []
        idx = np.arange(len(pos))
        for oy, ox, wgt in ((0, 0, (1 - fx) * (1 - fy)), (0, 1, fx * (1 - fy)), (1, 0, (1 - fx) * fy), (1, 1, fx * fy)):
            xx = x0 + ox
            yy = y0 + oy
            ok = (xx >= 0) & (yy >= 0) & (xx < nl) & (yy < nl)
            rows.append((yy * nl + xx)[ok])
            cols.append(idx[ok])
            vals.append((val * wgt)[ok])
        self.B = sparse.csr_matrix((np.concatenate(vals).astype(np.float32), (np.concatenate(rows), np.concatenate(cols))),
                                   shape=(nl * nl, len(pos)))
        # smooth over ~0.7 voxel spacing (in low-res pixels at the isocentre)
        vox = float(spacing)
        px_obj = sv.pixel_mm / sv.magnification
        self.smooth = max(1.0, 0.7 * vox / px_obj) if len(pos) else 1.0

    def image(self, c_vox):
        nl = self.nl
        low = np.asarray(self.B @ np.asarray(c_vox, np.float32)).reshape(nl, nl)
        low = gaussian_filter(low, self.smooth)
        return zoom(low, self.size / nl, order=1)[: self.size, : self.size]


# ----------------------------------------------------------------------------
# skull DRR
# ----------------------------------------------------------------------------
_DRR_CACHE: dict = {}


def drr(view: View, size=None, spacing=1.5):
    """Bone path integral (density x mm) per pixel for the view (cached)."""
    from . import frame as F
    n = size or view.size
    key = (view.key(), n, spacing)
    if key in _DRR_CACHE:
        return _DRR_CACHE[key]
    vol, origin, h = F.bone_volume(spacing)
    nl = max(96, n // 2)
    src, R = replace(view, size=nl).pixel_rays()
    R = R.reshape(-1, 3)
    lo = origin
    hi = origin + (np.array(vol.shape[::-1]) - 1) * h
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = (lo - src) / R
        t2 = (hi - src) / R
    tmin = np.nanmax(np.minimum(t1, t2), axis=1)
    tmax = np.nanmin(np.maximum(t1, t2), axis=1)
    out = np.zeros(len(R))
    ok = tmax > tmin
    if ok.any():
        t_start = np.clip(tmin[ok].min(), 0, None)
        t_end = tmax[ok].max()
        ts = np.arange(t_start, t_end, h)
        chunk = max(1, 4_000_000 // len(ts))
        Rok = np.nonzero(ok)[0]
        jit = np.random.default_rng(7).uniform(0, h, len(R))
        for c0 in range(0, len(Rok), chunk):
            rr = Rok[c0:c0 + chunk]
            P = src[None, None] + R[rr][:, None, :] * (ts[None, :, None] + jit[rr][:, None, None])
            c = (P - origin) / h
            vals = map_coordinates(vol, [c[..., 2].ravel(), c[..., 1].ravel(), c[..., 0].ravel()], order=1,
                                   mode="constant", cval=0.0)
            out[rr] = vals.reshape(len(rr), len(ts)).sum(1) * h
    img = out.reshape(nl, nl)
    img = zoom(img, n / nl, order=1)[:n, :n]
    _DRR_CACHE[key] = img
    return img


# ----------------------------------------------------------------------------
# display / frame composition
# ----------------------------------------------------------------------------
@dataclass
class Display:
    mu: float = 0.55          # 1/mm: attenuation of fully opacified lumen in the log image
    bg: float = 0.80          # subtracted background grey level
    blur_px: float = 0.6      # detector/focal-spot blur (Gaussian sigma, px)
    noise: float = 0.008      # quantum noise s.d. at background
    blush_gain: float = 0.22  # scales the capillary blush (physical CBV path x this)
    misreg: float = 0.0       # 0..1: faint skull edges from subtraction misregistration
    mu_bone: float = 0.035    # 1/(density mm) for the unsubtracted DRR
    unsub_bg: float = 0.93
    seed: int = 0


def to_display(iodine_mm, disp: Display = None, mode="dsa", bone=None, rng=None):
    """Convert an iodine-thickness map to a display image in [0,1] (1 = white)."""
    disp = disp or Display()
    rng = rng if rng is not None else np.random.default_rng(disp.seed)
    io = np.asarray(iodine_mm, float)
    if mode == "dsa":
        img = disp.bg * np.exp(-disp.mu * io)
        if disp.misreg > 0 and bone is not None:
            sh = np.roll(bone, 1, axis=1) * 0.5 + np.roll(bone, 1, axis=0) * 0.5
            img = img * np.exp(-disp.mu_bone * disp.misreg * (bone - sh))
    elif mode == "unsub":
        b = bone if bone is not None else 0.0
        img = disp.unsub_bg * np.exp(-disp.mu_bone * b - disp.mu * io)
    else:
        raise ValueError(mode)
    if disp.blur_px > 0:
        img = gaussian_filter(img, disp.blur_px)
    if disp.noise > 0:
        img = img + rng.normal(0, 1, img.shape) * disp.noise * np.sqrt(np.clip(img / max(disp.bg, 1e-3), 0.02, None))
    return np.clip(img, 0, 1)


class RunRenderer:
    """Renders a cine run for one (tree, bolus, view).  Build once; frame(t) is cheap."""

    def __init__(self, tree: VesselTree, bolus, view: View, parenchyma=None, size=None, systems=("artery", "vein"),
                 display: Display = None, r_min_px=1.0):
        self.tree = tree
        self.bolus = bolus
        self.view = view
        self.size = size or view.size
        self.display = display or Display()
        segs = segments_from_tree(tree, bolus.ix)
        sysmask = np.zeros(len(segs), bool)
        if "artery" in systems:
            sysmask |= ~segs.is_vein
        if "vein" in systems:
            sysmask |= segs.is_vein
        self.segs = segs.subset(sysmask)
        self.proj = Projector(view, self.segs, self.size, r_min_px)
        self.blush = None
        if parenchyma is not None and len(bolus.tissue_pos):
            self.blush = BlushProjector(view, bolus.tissue_pos, bolus.tissue_w, parenchyma.blood_fraction,
                                        size=self.size, spacing=parenchyma.spacing)
        self._bone = None

    def bone(self):
        if self._bone is None:
            self._bone = drr(self.view, self.size)
        return self._bone

    def seg_conc(self, t):
        c = self.bolus.conc(t)
        return 0.5 * (c[self.segs.n0] + c[self.segs.n1])

    def iodine(self, t):
        img = self.proj.image(self.seg_conc(t))
        if self.blush is not None and self.display.blush_gain > 0:
            img = img + self.display.blush_gain * self.blush.image(self.bolus.tissue_conc(t))
        return img

    def frame(self, t, mode="dsa", frame_index=0):
        disp = self.display
        rng = np.random.default_rng(disp.seed * 7919 + frame_index)
        bone = self.bone() if (mode == "unsub" or disp.misreg > 0) else None
        return to_display(self.iodine(t), disp, mode, bone, rng)

    def frames(self, times, mode="dsa"):
        return [self.frame(t, mode, i) for i, t in enumerate(times)]

    def vessel_opacity(self, t):
        """dict vessel_id -> max lumen opacification at time t (for labels)."""
        return self.bolus.vessel_max_conc(t)


def default_times(n=30, t_end=9.0, t_start=0.0):
    return np.linspace(t_start, t_end, n)


# ----------------------------------------------------------------------------
# 3-D rotational angiography (shaded tubes, z-buffer)
# ----------------------------------------------------------------------------

def render_3dra(tree: VesselTree, view: View, bolus=None, t=None, min_opacity=0.15, systems=("artery",),
                size=None, ss=2, light=(-0.45, -0.6, 0.66), ambient=0.16, depth_cue=0.55, vessels=None,
                r_min_px=0.6, segs=None):
    """Shaded-surface 3D-RA rendering (white/grey vessels on black) for any C-arm angle.

    Vessels shown: ``vessels`` (ids) if given; else those whose opacification
    (at time t, or peak over the run if t is None) >= min_opacity when a bolus is
    given; else every vessel of ``systems``.
    """
    from .hemo import NodeIndex
    n = size or view.size
    N = n * ss
    ix = bolus.ix if bolus is not None else NodeIndex(tree)
    segs = segs if segs is not None else segments_from_tree(tree, ix)
    keep = np.zeros(len(segs), bool)
    if "artery" in systems:
        keep |= ~segs.is_vein
    if "vein" in systems:
        keep |= segs.is_vein
    if vessels is not None:
        ords = {ix.vids.index(v) for v in vessels if v in ix.offset}
        keep &= np.isin(segs.vessel, list(ords))
    elif bolus is not None:
        if t is None:
            amp = bolus.A
        else:
            amp = bolus.conc(t)
        keep &= np.maximum(amp[segs.n0], amp[segs.n1]) >= min_opacity
    s = segs.subset(keep)
    depth_all, pix_all, shade_all = [], [], []
    l = np.asarray(light, float)
    l /= np.linalg.norm(l)
    hv = l + np.array([0, 0, 1.0])
    hv /= np.linalg.norm(hv)
    for st in _stencils(view, s, N, r_min_px * ss, need_shading=True, aa=1):
        sp = np.clip(st["sperp"], -1, 1)
        # screen-space normal: perpendicular (ex,ey) rotated 90 deg -> (ey, -ex)
        nx = sp * st["ey"]
        ny = -sp * st["ex"]
        nz = np.sqrt(np.clip(1 - sp * sp, 0, 1))
        lam = np.clip(nx * l[0] + ny * l[1] + nz * l[2], 0, 1)
        spec = np.clip(nx * hv[0] + ny * hv[1] + nz * hv[2], 0, 1) ** 28
        shade_all.append((ambient + (1 - ambient) * lam * 0.85 + 0.35 * spec).astype(np.float32))
        depth_all.append(st["depth"])
        pix_all.append(st["pix"])
    img = np.zeros(N * N, np.float32)
    if pix_all:
        pix = np.concatenate(pix_all)
        dep = np.concatenate(depth_all)
        sh = np.concatenate(shade_all)
        order = np.lexsort((dep, pix))
        ps = pix[order]
        first = np.ones(len(ps), bool)
        first[1:] = ps[1:] != ps[:-1]
        win = order[first]
        d = dep[win]
        dn, df = np.percentile(d, 2), np.percentile(d, 98)
        cue = 1.0 - depth_cue * np.clip((d - dn) / max(df - dn, 1e-6), 0, 1)
        img[pix[win]] = sh[win] * cue
    img = img.reshape(N, N)
    if ss > 1:
        img = img.reshape(n, ss, n, ss).mean(axis=(1, 3))
    return np.clip(img, 0, 1)


# ----------------------------------------------------------------------------
# label overlay (leader lines + margin text, textbook style)
# ----------------------------------------------------------------------------
_FONT_PATHS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
               "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]


def _font(size):
    from PIL import ImageFont
    for p in _FONT_PATHS:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap(text, font, max_w, draw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _pack(ys, hs, lo, hi, gap=3):
    """1-D non-overlapping placement near desired centres ys (sorted)."""
    n = len(ys)
    pos = np.array(ys, float)
    for i in range(n):
        lo_i = lo + hs[i] / 2 if i == 0 else pos[i - 1] + hs[i - 1] / 2 + gap + hs[i] / 2
        pos[i] = max(pos[i], lo_i)
    for i in range(n - 1, -1, -1):
        hi_i = hi - hs[i] / 2 if i == n - 1 else pos[i + 1] - hs[i + 1] / 2 - gap - hs[i] / 2
        pos[i] = min(pos[i], hi_i)
    return pos


def label_overlay(img, tree: VesselTree, view: View, vessels=None, opacity=None, threshold=0.2,
                  margin=(240, 240), font_size=13, dark=False, title=None, footnote=None, max_labels=40):
    """Return a PIL RGB image: the frame with margin labels + leader lines.

    ``vessels``: ids to label (default: every labeled vessel).  ``opacity``: dict id ->
    opacification (e.g. RunRenderer.vessel_opacity(t)); vessels below ``threshold``
    are not labelled.  Duplicate names keep the most opacified instance.  A vessel may
    set meta['label_side'] = 'left'|'right' to force its side, and
    meta['extra_labels'] = [[text, point_index | [x,y,z]], ...] for additional labels
    (e.g. ICA segment names along one vessel, 'Thalamus blush').
    """
    from PIL import Image, ImageDraw
    a = np.asarray(img)
    if a.dtype != np.uint8:
        a = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    H, W = a.shape[:2]
    if a.ndim == 2:
        a = np.stack([a] * 3, -1)
    ml, mr = margin
    top = 26 if title else 6
    bot = 22 if footnote else 6
    bgc = (0, 0, 0) if dark else (255, 255, 255)
    fg = (235, 235, 235) if dark else (0, 0, 0)
    canvas = Image.new("RGB", (ml + W + mr, top + H + bot), bgc)
    canvas.paste(Image.fromarray(a), (ml, top))
    dr = ImageDraw.Draw(canvas)
    font = _font(font_size)
    sv = replace(view, size=H)
    cands = {}
    ids = vessels if vessels is not None else [v.id for v in tree if v.labeled or (v.meta or {}).get("extra_labels")]
    for vid in ids:
        if vid not in tree:
            continue
        v = tree[vid]
        op = 1.0 if opacity is None else float(opacity.get(vid, 0.0))
        if op < threshold:
            continue
        entries = []
        if v.name:
            entries.append((v.name, v.anchor_point()))
        for e in (v.meta or {}).get("extra_labels", []) or []:
            text, at = e[0], e[1]
            if isinstance(at, (int, np.integer)):
                pt = v.points[int(np.clip(at, -v.n, v.n - 1))]
            else:
                pt = np.asarray(at, float)
            entries.append((text, pt))
        for text, pt in entries:
            x, y, _, _ = sv.project(np.asarray(pt, float)[None])
            x, y = float(x[0]), float(y[0])
            if not (2 <= x < W - 2 and 2 <= y < H - 2):
                continue
            if text in cands and cands[text][0] >= op:
                continue
            cands[text] = (op, x, y, v)
    items = sorted(cands.items(), key=lambda kv: -kv[1][0])[:max_labels]
    sides = {"left": [], "right": []}
    for name, (op, x, y, v) in items:
        side = v.meta.get("label_side") if v.meta else None
        if side not in ("left", "right"):
            side = "left" if x < W / 2 else "right"
        sides[side].append((y, x, name))
    lh = font_size + 2
    for side, lst in sides.items():
        if not lst:
            continue
        lst.sort()
        maxw = (ml if side == "left" else mr) - 14
        wrapped = [_wrap(n, font, maxw, dr) for (_, _, n) in lst]
        hs = [len(w) * lh for w in wrapped]
        ys = _pack([e[0] for e in lst], hs, 0, H)
        for (ya, xa, name), lines, yc, hgt in zip(lst, wrapped, ys, hs):
            y0 = top + yc - hgt / 2
            for k, line in enumerate(lines):
                tw = dr.textlength(line, font=font)
                tx = ml - 8 - tw if side == "left" else ml + W + 8
                dr.text((tx, y0 + k * lh), line, font=font, fill=fg)
            ex = ml - 4 if side == "left" else ml + W + 4
            ey = top + yc
            ax_, ay_ = ml + xa, top + ya
            dr.line([(ex, ey), (ax_, ay_)], fill=fg, width=1)
    if title:
        dr.text((ml, 4), title, font=_font(font_size + 2), fill=fg)
    if footnote:
        dr.text((ml, top + H + 3), footnote, font=_font(font_size - 1), fill=fg)
    return canvas
