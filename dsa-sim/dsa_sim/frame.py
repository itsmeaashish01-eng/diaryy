"""Head & neck geometric frame (patient RAS millimetres, origin = anterior commissure).

+x = patient Right, +y = Anterior, +z = Superior.  AC = (0,0,0), PC ~ (0,-26,0)
(AC-PC line horizontal, MNI-like but sized for an average adult skull:
outer table ~180 mm AP x 145 mm biparietal).

Everything here is analytic / implicit so that independently built anatomy
modules meet exactly.  Signed-distance-like functions return NEGATIVE inside.

Main public API (see ENGINE_API.md):
    LANDMARKS, L(name, side=None), mirror(p), side_sign(side)
    skull_inner_sdf, skull_outer_sdf, scalp_sdf, cranial_floor_z, tentorium_z
    brain_sdf, cerebrum_sdf, cerebellum_sdf, brainstem_sdf, inside_brain
    sdf_gradient, project_to_surface, project_to_cortex, project_to_inner_table,
    project_to_scalp, cortex_normal, lobe_of
    callosal_curve, cingulate_curve, SPINE, vertebra_level_z
    bone_density, bone_volume
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

# ----------------------------------------------------------------------------
# small helpers
# ----------------------------------------------------------------------------

def _a(p):
    return np.asarray(p, dtype=float)


def side_sign(side):
    """'R' -> +1, 'L' -> -1 (patient right is +x)."""
    if side in ("R", "r", "right", +1, 1):
        return 1.0
    if side in ("L", "l", "left", -1):
        return -1.0
    raise ValueError(f"bad side {side!r}")


def mirror(p):
    """Mirror point(s) across the midsagittal plane (x -> -x)."""
    q = np.array(p, dtype=float, copy=True)
    q[..., 0] *= -1.0
    return q


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=float) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def smin(a, b, k):
    """Polynomial smooth minimum (union of SDFs)."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1.0 - h) + a * h - k * h * (1.0 - h)


def smax(a, b, k):
    """Smooth maximum (intersection of SDFs)."""
    return -smin(-a, -b, k)


def sd_ellipsoid(p, c, s):
    """Approximate signed distance to an axis-aligned ellipsoid (centre c, semi-axes s)."""
    p = _a(p)
    s = _a(s)
    q = (p - _a(c)) / s
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm(q / s, axis=-1)
    return np.where(k1 > 1e-12, k0 * (k0 - 1.0) / np.maximum(k1, 1e-12), -np.min(s))


def sd_capsule(p, a, b, r):
    p = _a(p)
    a = _a(a)
    b = _a(b)
    pa = p - a
    ba = b - a
    h = np.clip((pa @ ba) / float(ba @ ba), 0.0, 1.0)
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - r


def _split(p):
    p = _a(p)
    return p[..., 0], p[..., 1], p[..., 2]


# ----------------------------------------------------------------------------
# skull (calvarial ellipsoid with a sheared, egg-shaped sagittal profile)
# ----------------------------------------------------------------------------
SKULL = dict(
    center_y=-14.0,      # AP centre of the calvarial ellipsoid
    semi_y=84.0,         # inner table half length  (inner AP 168 mm)
    semi_z=80.0,         # inner table half height above/below centre
    half_width=66.5,     # inner table max half width (inner breadth 133 mm)
    table=6.5,           # calvarial thickness (outer = inner + 6.5 mm)
    scalp=5.0,           # scalp soft tissue thickness
)


def _cz(y):
    """Sagittal centre height of the calvarial ellipsoid (lower posteriorly)."""
    d = y + 14.0
    return -3.0 + 0.11 * d - 0.06 * (np.sqrt(d * d + 100.0) - 10.0)


def _ax(y, z):
    """Half-width of the inner table: widest parietally, narrower frontally and at the base."""
    w = SKULL["half_width"] * (1.0 - 0.09 * ((y + 28.0) / 85.0) ** 2)
    return w * (1.0 - 0.12 * smoothstep(-10.0, -50.0, z))


def _calvarial_sdf(p, grow=0.0):
    x, y, z = _split(p)
    sx = _ax(y, z) + grow
    sy = SKULL["semi_y"] + grow
    sz = SKULL["semi_z"] + grow
    qx, qy, qz = x / sx, (y - SKULL["center_y"]) / sy, (z - _cz(y)) / sz
    k0 = np.sqrt(qx * qx + qy * qy + qz * qz)
    k1 = np.sqrt((qx / sx) ** 2 + (qy / sy) ** 2 + (qz / sz) ** 2)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-12)


# ----------------------------------------------------------------------------
# skull base (inner surface of the cranial floor) and tentorium
# ----------------------------------------------------------------------------
PETROUS_APEX = np.array([14.0, -12.0, -30.0])     # right side; mirror for left
PETROUS_LATERAL = np.array([56.0, -44.0, -30.0])  # petrous ridge meets transverse/sigmoid
_PR_U = (PETROUS_LATERAL[:2] - PETROUS_APEX[:2]) / np.linalg.norm(PETROUS_LATERAL[:2] - PETROUS_APEX[:2])
_PR_N = np.array([-_PR_U[1], _PR_U[0]])  # normal pointing antero-lateral (middle fossa side)
if _PR_N[0] < 0:
    _PR_N = -_PR_N


def petrous_ridge_distance(x, y):
    """Signed in-plane distance to the petrous ridge line (+ = middle fossa side, - = posterior fossa)."""
    ax = np.abs(x)
    return (ax - PETROUS_APEX[0]) * _PR_N[0] + (y - PETROUS_APEX[1]) * _PR_N[1]


def _sphenoid_ridge_y(ax):
    """AP position of the lesser sphenoid wing (anterior / middle fossa boundary)."""
    return 13.0 + np.clip(ax - 13.0, 0.0, None) * (12.0 / 37.0)


def clivus_z(y):
    """Height of the clival (endocranial) surface at AP position y (dorsum sellae -> basion)."""
    return -24.0 - (-7.0 - y) * (42.0 / 18.0)


def cranial_floor_z(x, y):
    """Height of the endocranial skull-base surface (cavity exists above it).

    anterior fossa ~ -18 (cribriform -24); middle fossa -47 laterally, sella and
    parasellar (cavernous sinus) region -37 medially; petrous ridge -30 dropping steeply posteriorly; clivus; foramen
    magnum is open (-200).  The calvarial ellipsoid closes the posterior fossa.
    """
    x = _a(x)
    y = _a(y)
    ax = np.abs(x)
    open_ = -200.0
    # anterior fossa
    h_ant = -18.0 + 5.0 * (ax / 30.0) ** 2 - 6.0 * np.exp(-(x / 7.0) ** 2)
    h_ant = np.minimum(h_ant, -6.0)
    # lateral middle / posterior fossa via petrous ridge
    d = petrous_ridge_distance(x, y)
    h_mid = -47.0
    h_pf = -70.0 + 6.0 * (ax / 50.0) ** 2          # occipital floor of the posterior fossa
    h_lat = np.where(d > 0, np.maximum(h_mid, -30.0 - 1.1 * d), np.maximum(h_pf, -30.0 - 3.0 * (-d)))
    # beyond the lateral end of the ridge (behind sigmoid) posterior fossa continues
    # medial strip: planum / sella / clivus / foramen magnum
    # planum (y>13) / sella + parasellar cavernous sinus floor (-37) / clivus (y<-7)
    h_med = np.where(y > 13.0, -22.0, np.where(y > -7.0, -37.0, np.minimum(clivus_z(y), -24.0)))
    fm = (y < -25.0) & (y > -60.0)
    h_med = np.where(fm, open_, np.where(y <= -60.0, h_pf, h_med))
    wl = smoothstep(11.0, 19.0, ax)
    h_back = h_med * (1.0 - wl) + h_lat * wl
    # anterior vs middle (sphenoid ridge)
    wa = smoothstep(-2.5, 2.5, y - _sphenoid_ridge_y(ax))
    h = h_ant * wa + h_back * (1.0 - wa)
    return h


# --- tentorium cerebelli --------------------------------------------------------
STRAIGHT_SINUS_START = np.array([0.0, -51.0, 5.0])   # falcotentorial junction (tentorial apex)
TORCULAR = np.array([0.0, -93.0, -20.0])             # confluence of sinuses (internal occipital protuberance)


def tentorium_z(x, y):
    """Height of the tentorium cerebelli at (x, y); NaN-free, defined for y < -12.

    Midline follows the straight sinus (apex -> torcular); laterally it descends to
    the petrous ridge (-30) and the transverse sinus groove (-30 -> -20 at torcular).
    In front of the apex (incisura) a virtual midline descends to the petrous apex.
    """
    x = _a(x)
    y = _a(y)
    ax = np.abs(x)
    y0, z0 = STRAIGHT_SINUS_START[1], STRAIGHT_SINUS_START[2]
    slope_ss = (z0 - TORCULAR[2]) / (y0 - TORCULAR[1])
    zm = np.where(y < y0, z0 + (y - y0) * slope_ss, z0 - (y - y0) * 0.85)
    # lateral attachment
    on_ridge = y >= -44.0
    x_att_r = PETROUS_APEX[0] + np.clip(-12.0 - y, 0.0, None) * (42.0 / 32.0)
    t = np.clip((y + 44.0) / 49.0, -1.0, 1.0)
    x_att_t = 56.0 * np.sqrt(np.clip(1.0 - t * t, 0.0, 1.0))
    x_att = np.where(on_ridge, x_att_r, x_att_t)
    x_att = np.maximum(x_att, 2.0)
    z_att = np.where(on_ridge, -30.0, -30.0 + np.clip(-44.0 - y, 0.0, None) * (10.0 / 49.0))
    f = np.clip(ax / x_att, 0.0, 1.0) ** 1.1
    return zm + (z_att - zm) * f


# ----------------------------------------------------------------------------
# cranial cavity, skull, scalp
# ----------------------------------------------------------------------------

def _height_sdf(z, h, hx, hy):
    """Signed distance-like value for the half space z > h(x,y) (negative inside)."""
    return (h - z) / np.sqrt(1.0 + hx * hx + hy * hy)


def _floor_terms(fn, x, y, e=0.5):
    h = fn(x, y)
    hx = (fn(x + e, y) - fn(x - e, y)) / (2 * e)
    hy = (fn(x, y + e) - fn(x, y - e)) / (2 * e)
    # clamp gradient on the steep clivus / petrous walls
    hx = np.clip(hx, -4, 4)
    hy = np.clip(hy, -4, 4)
    return h, hx, hy


def skull_inner_sdf(p):
    """Cranial cavity (inside of the inner table, above the skull base). Negative inside."""
    x, y, z = _split(p)
    e = _calvarial_sdf(p)
    h, hx, hy = _floor_terms(cranial_floor_z, x, y)
    return smax(e, _height_sdf(z, h, hx, hy), 2.0)


def skull_outer_sdf(p):
    """Outer table of the calvarium (ellipsoid grown by the table thickness)."""
    return _calvarial_sdf(p, grow=SKULL["table"])


def scalp_sdf(p):
    """Skin surface over the calvarium (outer table + scalp)."""
    return _calvarial_sdf(p, grow=SKULL["table"] + SKULL["scalp"])


# ----------------------------------------------------------------------------
# brain
# ----------------------------------------------------------------------------
CSF_GAP = 3.0         # cortex lies 3 mm inside the inner table
FALX_HALF = 1.2       # interhemispheric fissure half-width
TENT_GAP = 1.5        # half gap around the tentorium


def _cerebrum_floor(x, y):
    ax = np.abs(x)
    base = cranial_floor_z(x, y) + CSF_GAP
    tent = tentorium_z(x, y) + TENT_GAP
    d = petrous_ridge_distance(x, y)
    # behind the petrous ridge (and behind the dorsum medially) the tentorium is the floor
    w_post = 1.0 - smoothstep(-3.0, 3.0, d)
    w_post = np.where(ax < 14.0, smoothstep(-8.0, -14.0, y), w_post)
    w_post = np.maximum(w_post, smoothstep(-30.0, -40.0, y) * (ax >= 14.0))
    fl = base * (1.0 - w_post) + tent * w_post
    # medial diencephalon / basal forebrain floor (suprasellar & incisural region)
    med = (1.0 - smoothstep(13.0, 19.0, ax)) * smoothstep(14.0, 8.0, y) * smoothstep(-56.0, -46.0, y)
    fl = fl * (1.0 - med) + (-12.0) * med
    return fl


def cerebrum_sdf(p):
    x, y, z = _split(p)
    cav = skull_inner_sdf(p) + CSF_GAP
    h, hx, hy = _floor_terms(_cerebrum_floor, x, y)
    f = smax(cav, _height_sdf(z, h, hx, hy), 3.0)
    f = smax(f, FALX_HALF - np.abs(x), 1.5)
    return f


CEREBELLUM = dict(
    hemi_c=(23.0, -64.0, -38.0), hemi_s=(27.0, 27.0, 24.0),
    vermis_c=(0.0, -62.0, -34.0), vermis_s=(12.0, 25.0, 22.0),
)


def cerebellum_sdf(p):
    x, y, z = _split(p)
    c = CEREBELLUM
    hc = np.array(c["hemi_c"])
    f = np.minimum(sd_ellipsoid(p, hc, c["hemi_s"]), sd_ellipsoid(p, hc * [-1, 1, 1], c["hemi_s"]))
    f = smin(f, sd_ellipsoid(p, c["vermis_c"], c["vermis_s"]), 4.0)
    f = smax(f, skull_inner_sdf(p) + CSF_GAP, 2.0)
    f = smax(f, z - (tentorium_z(x, y) - TENT_GAP), 2.0)
    return f


BRAINSTEM = dict(
    midbrain=((0.0, -17.0, -5.0), (0.0, -27.0, -22.0), 10.5),
    pons_c=(0.0, -32.0, -34.0), pons_s=(16.0, 12.0, 13.0),
    medulla=((0.0, -34.0, -45.0), (0.0, -39.0, -64.0), 9.0),
    cord=((0.0, -39.0, -64.0), (0.0, -42.0, -100.0), 5.5),
)


def brainstem_sdf(p):
    b = BRAINSTEM
    f = sd_capsule(p, *b["midbrain"])
    f = smin(f, sd_ellipsoid(p, b["pons_c"], b["pons_s"]), 4.0)
    f = smin(f, sd_capsule(p, *b["medulla"]), 4.0)
    f = smin(f, sd_capsule(p, *b["cord"]), 3.0)
    return f


def brain_sdf(p):
    """Pial surface of the whole brain (cerebrum U cerebellum U brainstem). Negative inside."""
    return np.minimum(np.minimum(cerebrum_sdf(p), cerebellum_sdf(p)), brainstem_sdf(p))


def inside_brain(p):
    return brain_sdf(p) < 0.0


# ----------------------------------------------------------------------------
# projection onto implicit surfaces
# ----------------------------------------------------------------------------
SURFACES = {
    "brain": brain_sdf,
    "cortex": brain_sdf,
    "cerebrum": cerebrum_sdf,
    "cerebellum": cerebellum_sdf,
    "brainstem": brainstem_sdf,
    "inner_table": skull_inner_sdf,
    "outer_table": skull_outer_sdf,
    "scalp": scalp_sdf,
}


_GRID_BOUNDS = {
    "brain": ((-72.0, 72.0), (-102.0, 76.0), (-112.0, 86.0)),
    "cortex": ((-72.0, 72.0), (-102.0, 76.0), (-112.0, 86.0)),
    "cerebrum": ((-72.0, 72.0), (-102.0, 76.0), (-60.0, 86.0)),
    "cerebellum": ((-60.0, 60.0), (-100.0, -20.0), (-75.0, 5.0)),
    "inner_table": ((-76.0, 76.0), (-106.0, 80.0), (-78.0, 88.0)),
}
_GRID_SPACING = 1.25
_GRIDS: dict = {}


def _cache_dir():
    import os
    d = os.environ.get("DSA_SIM_CACHE", os.path.join(os.path.expanduser("~"), ".cache", "dsa_sim"))
    os.makedirs(d, exist_ok=True)
    return d


def _geometry_hash():
    import hashlib
    import inspect
    import sys
    src = inspect.getsource(sys.modules[__name__])
    return hashlib.sha1(src.encode()).hexdigest()[:12]


class GridSDF:
    """Trilinear-interpolated voxel cache of an analytic SDF (fast for vessel growth).

    Points outside the grid fall back to the analytic function.
    """

    def __init__(self, name, fn, bounds, spacing=_GRID_SPACING):
        import os
        self.name, self.fn, self.bounds, self.h = name, fn, bounds, float(spacing)
        self.lo = np.array([b[0] for b in bounds])
        self.shape = tuple(int(round((b[1] - b[0]) / spacing)) + 1 for b in bounds)
        path = os.path.join(_cache_dir(), f"sdf_{name}_{_geometry_hash()}_{spacing:g}.npy")
        grid = None
        if os.path.exists(path):
            try:
                grid = np.load(path)
                if grid.shape != self.shape:
                    grid = None
            except Exception:
                grid = None
        if grid is None:
            axes = [self.lo[k] + np.arange(self.shape[k]) * spacing for k in range(3)]
            grid = np.empty(self.shape, np.float32)
            Y, Z = np.meshgrid(axes[1], axes[2], indexing="ij")
            for i, xv in enumerate(axes[0]):
                P = np.stack([np.full_like(Y, xv), Y, Z], -1)
                grid[i] = fn(P)
            try:
                import glob
                for old in glob.glob(os.path.join(_cache_dir(), f"sdf_{name}_*_{spacing:g}.npy")):
                    if old != path:
                        os.remove(old)
                np.save(path, grid)
            except OSError:
                pass
        self.grid = grid

    def __call__(self, p):
        from scipy.ndimage import map_coordinates
        p = _a(p)
        shp = p.shape[:-1]
        q = p.reshape(-1, 3)
        c = (q - self.lo) / self.h
        inb = np.all((c >= 0) & (c <= np.array(self.shape) - 1), axis=1)
        out = np.empty(len(q))
        if inb.any():
            out[inb] = map_coordinates(self.grid, c[inb].T, order=1, mode="nearest")
        if (~inb).any():
            out[~inb] = self.fn(q[~inb])
        return out.reshape(shp)


def grid_sdf(name):
    """Cached GridSDF for a named surface (built once, stored under ~/.cache/dsa_sim)."""
    if name not in _GRIDS:
        _GRIDS[name] = GridSDF(name, SURFACES[name], _GRID_BOUNDS[name])
    return _GRIDS[name]


def _surface_fn(surface, fast=True):
    if callable(surface):
        return surface
    if fast and surface in _GRID_BOUNDS:
        return grid_sdf(surface)
    return SURFACES[surface]


def sdf_gradient(fn, p, e=0.25):
    if isinstance(fn, str):
        fn = _surface_fn(fn)
    p = _a(p)
    g = np.empty_like(p)
    for k in range(3):
        d = np.zeros(3)
        d[k] = e
        g[..., k] = (fn(p + d) - fn(p - d)) / (2 * e)
    return g


def project_to_surface(p, surface="brain", depth_mm=0.0, iters=8, fast=True):
    """Move point(s) onto the iso-surface fn = -depth_mm (depth_mm > 0 => inside).

    Newton iterations along the numerical gradient.  Works on (3,) or (N,3).
    ``surface``: name in SURFACES or a callable sdf.  fast=True uses the cached
    voxel SDF for brain/cerebrum/cerebellum/inner_table (+-0.1 mm).
    """
    fn = _surface_fn(surface, fast)
    p = np.array(p, dtype=float, copy=True)
    single = p.ndim == 1
    if single:
        p = p[None]
    e = 0.6 if isinstance(fn, GridSDF) else 0.25
    for _ in range(iters):
        f = fn(p) + depth_mm
        g = sdf_gradient(fn, p, e)
        gg = np.maximum((g * g).sum(-1), 1e-6)
        step = (f / gg)[:, None] * g
        n = np.linalg.norm(step, axis=-1, keepdims=True)
        step = np.where(n > 20.0, step * (20.0 / np.maximum(n, 1e-9)), step)
        p = p - step
        if np.max(np.abs(f)) < 0.02:
            break
    return p[0] if single else p


def project_to_cortex(p, depth_mm=1.0, surface="brain", iters=8, fast=True):
    """Project to the brain surface; depth_mm>0 puts the point that far below the pia
    (use ~0.5-1.5 mm for pial arteries/veins running in the subarachnoid space use
    depth_mm = -0.5 .. -1.5, i.e. just outside the pia)."""
    return project_to_surface(p, surface, depth_mm, iters, fast)


def project_to_inner_table(p, inset_mm=3.0, iters=8, fast=True):
    """Project onto the inner table, inset_mm inside the cranial cavity (dural sinuses ~3-4 mm)."""
    return project_to_surface(p, "inner_table", inset_mm, iters, fast)


def project_to_scalp(p, depth_mm=2.5, iters=8, fast=True):
    """Project onto the skin surface, depth_mm under the skin (scalp arteries ~2-3 mm)."""
    return project_to_surface(p, "scalp", depth_mm, iters, fast)


def cortex_normal(p, surface="brain"):
    g = sdf_gradient(_surface_fn(surface), _a(p), 0.6)
    return g / np.maximum(np.linalg.norm(g, axis=-1, keepdims=True), 1e-9)


# ----------------------------------------------------------------------------
# deep structures, corpus callosum, sylvian fissure, lobes
# ----------------------------------------------------------------------------
DEEP = {
    # name: (centre (right side, mirror for left), semi-axes)
    "thalamus": ((11.0, -16.0, 5.0), (8.0, 14.0, 8.0)),
    "caudate_head": ((13.0, 12.0, 8.0), (5.0, 9.0, 8.0)),
    "putamen": ((25.0, 2.0, 0.0), (5.5, 14.0, 9.0)),
    "globus_pallidus": ((19.0, -2.0, -2.0), (3.5, 8.0, 5.5)),
    "internal_capsule": ((19.0, 0.0, 6.0), (4.0, 16.0, 12.0)),
}


def deep_gray_sdf(p):
    """Union of thalami, caudate heads, putamina, pallida (both sides)."""
    p = _a(p)
    f = None
    for name in ("thalamus", "caudate_head", "putamen", "globus_pallidus"):
        c, s = DEEP[name]
        c = np.array(c)
        g = np.minimum(sd_ellipsoid(p, c, s), sd_ellipsoid(p, c * [-1, 1, 1], s))
        f = g if f is None else np.minimum(f, g)
    return f


# Dorsal surface of the corpus callosum in the midsagittal plane (y, z), rostrum -> splenium
_CC_YZ = np.array([
    (18, -6), (26, -2), (33, 6), (32, 15), (25, 22), (12, 27), (0, 28.5), (-12, 28.5),
    (-24, 26.5), (-34, 22), (-41, 15), (-45, 6), (-41, 0)], dtype=float)
_CC_CENTROID = np.array([-5.0, 12.0])


def _resample_polyline(P, n):
    P = np.asarray(P, float)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, P[:, k]) for k in range(P.shape[1])], axis=1)


def callosal_curve(offset_mm=2.5, x=0.0, n=80, start=0.0, end=1.0):
    """Points following the dorsal callosal surface, offset outward (sagittal plane).

    offset_mm ~2.5 -> callosal sulcus (pericallosal artery); ~12-14 -> cingulate
    sulcus (callosomarginal artery); ~7 -> inferior free margin of the falx
    (inferior sagittal sinus).  x = lateral offset (+ right).  start/end in [0,1]
    select the rostrum(0) .. splenium(1) portion.  Returns (n,3) mm.
    """
    from scipy.ndimage import gaussian_filter1d
    yz = _resample_polyline(_CC_YZ, 400)
    yz = np.stack([gaussian_filter1d(yz[:, 0], 6, mode="nearest"), gaussian_filter1d(yz[:, 1], 6, mode="nearest")], 1)
    t = np.gradient(yz, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True)
    nrm = np.stack([-t[:, 1], t[:, 0]], 1)
    sgn = np.sign(((yz - _CC_CENTROID) * nrm).sum(1).mean())
    yz = yz + sgn * nrm * offset_mm
    i0, i1 = int(start * 399), int(end * 399)
    yz = _resample_polyline(yz[i0:i1 + 1], n)
    return np.column_stack([np.full(len(yz), float(x)), yz[:, 0], yz[:, 1]])


def cingulate_curve(x=0.0, n=80, start=0.0, end=1.0):
    """Cingulate sulcus course (callosomarginal artery bed), ~13 mm above the callosum."""
    return callosal_curve(13.0, x=x, n=n, start=start, end=end)


# Sylvian fissure on the lateral convexity (right side), anterior -> posterior.
_SYLVIAN_SURFACE_R = np.array([(50, 16, -18), (56, 2, -9), (58, -14, 0), (58, -28, 9), (56, -40, 20)], float)
# Insular landmarks (right side): superior / inferior limiting (circular) sulci
_INSULA_SUP_R = np.array([(35, 14, 14), (38, 2, 19), (39, -12, 21), (39, -27, 19)], float)
_INSULA_INF_R = np.array([(38, 8, -9), (40, -6, -7), (41, -18, -2), (40, -28, 6)], float)


def sylvian_fissure(side="R", n=40):
    """Surface trace of the sylvian fissure on the lateral convexity, anterior->posterior."""
    P = _SYLVIAN_SURFACE_R.copy()
    P[:, 0] *= side_sign(side)
    P = _resample_polyline(P, n)
    return project_to_cortex(P, 0.0)


def insula_border(side="R", which="superior", n=30):
    """Superior or inferior limiting sulcus of the insula (M2 -> M3 turning points)."""
    P = (_INSULA_SUP_R if which.startswith("sup") else _INSULA_INF_R).copy()
    P[:, 0] *= side_sign(side)
    return _resample_polyline(P, n)


def _central_sulcus_y(z):
    return -18.0 + (75.0 - z) * 0.30


def _sylvian_z(y):
    return -12.0 + (10.0 - y) * 0.42


def lobe_of(p):
    """Coarse lobe label per point: frontal/parietal/temporal/occipital/insula/
    deep/cerebellum/brainstem/outside (string array)."""
    p = _a(p)
    single = p.ndim == 1
    if single:
        p = p[None]
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    fc, fb, fs = cerebrum_sdf(p), cerebellum_sdf(p), brainstem_sdf(p)
    out = np.full(len(p), "outside", dtype=object)
    in_c = (fc < 0.5) & (fc <= fb) & (fc <= fs)
    out[(fb < 0.5) & (fb < fc) & (fb <= fs)] = "cerebellum"
    out[(fs < 0.5) & (fs < fc) & (fs < fb)] = "brainstem"
    ax = np.abs(x)
    lab = np.where(y > _central_sulcus_y(z), "frontal", "parietal").astype(object)
    temporal = (z < _sylvian_z(y)) & (ax > 22) & (y > -70) & (y < 25)
    lab[temporal] = "temporal"
    occ = y < (-62.0 - 0.12 * z)
    lab[occ] = "occipital"
    ins = (ax > 30) & (ax < 41) & (y > -30) & (y < 18) & (z > -10) & (z < 21)
    lab[ins] = "insula"
    deep = (deep_gray_sdf(p) < 0)
    lab[deep] = "deep"
    out[in_c] = lab[in_c]
    return out[0] if single else out


# ----------------------------------------------------------------------------
# cervical spine
# ----------------------------------------------------------------------------
# vertebral body centres (x=0, y, z); transverse foramen = (+-24, y-3, z)
_SPINE_YZ = {
    "C1": (-30.0, -80.0),   # ring centre (anterior arch at y=-14)
    "C2": (-24.0, -95.0),
    "C3": (-21.0, -112.0),
    "C4": (-19.0, -128.0),
    "C5": (-18.0, -144.0),
    "C6": (-19.0, -160.0),
    "C7": (-22.0, -176.0),
    "T1": (-27.0, -193.0),
    "T2": (-32.0, -211.0),
    "T3": (-37.0, -229.0),
    "T4": (-42.0, -247.0),
}
SPINE = {}
for _lv, (_y, _z) in _SPINE_YZ.items():
    tf_x = 29.0 if _lv == "C1" else (23.0 if _lv == "C2" else 24.0)
    SPINE[_lv] = dict(
        body=np.array([0.0, _y, _z]),
        canal=np.array([0.0, _y - 18.0 if _lv != "C1" else -44.0, _z]),
        transverse_foramen_R=np.array([tf_x, _y - 3.0 if _lv != "C1" else -29.0, _z]),
        transverse_foramen_L=np.array([-tf_x, _y - 3.0 if _lv != "C1" else -29.0, _z]),
    )


def vertebra_level_z(level):
    """z (mm) of the centre of a vertebral level, e.g. 'C3', or a disc 'C3-C4'."""
    if "-" in level:
        a, b = level.split("-")
        return 0.5 * (SPINE[a]["body"][2] + SPINE[b]["body"][2])
    return float(SPINE[level]["body"][2])


# ----------------------------------------------------------------------------
# LANDMARKS  (exact shared junction coordinates, mm, RAS, origin = AC)
# ----------------------------------------------------------------------------
# Bilateral entries are defined for the RIGHT side and mirrored (x -> -x) to make
# the _L entry, unless an explicit _L value is given in _ASYM.
_BILATERAL = {
    # --- neck: carotid -------------------------------------------------------
    "carotid_bifurcation": ((24.0, 2.0, -117.0), "CCA ends / ICA+ECA begin, C3-C4 disc level (upper thyroid cartilage)"),
    "ICA_bulb": ((25.5, -1.0, -109.0), "carotid bulb (proximal cervical ICA, posterolateral to ECA)"),
    "ECA_proximal": ((22.0, 6.0, -109.0), "proximal ECA, anteromedial to the ICA, superior thyroid a. arises near here"),
    "ICA_C2": ((27.0, -6.0, -95.0), "cervical ICA at the C2 level (default ICA catheter tip)"),
    "ICA_C1": ((27.0, -10.0, -78.0), "cervical ICA at the C1 level, anterior to the C1 transverse process"),
    "ICA_skull_base_entry": ((27.0, -13.0, -61.0), "exocranial opening of the carotid canal (C1->C2 petrous)"),
    "ICA_petrous_genu": ((28.0, -14.0, -51.0), "vertical->horizontal petrous ICA genu"),
    "ICA_foramen_lacerum": ((17.0, 0.0, -44.0), "end of horizontal petrous ICA over foramen lacerum (C3 lacerum)"),
    "ICA_cav_posterior_genu": ((16.0, -3.0, -36.0), "posterior bend of cavernous ICA (C4 begins), lateral to dorsum"),
    "ICA_cav_anterior_genu": ((15.0, 11.0, -31.0), "anterior genu of the cavernous ICA (below anterior clinoid)"),
    "ICA_clinoid": ((14.0, 11.0, -24.0), "clinoid segment / distal dural ring (C5->C6)"),
    "OA_origin": ((13.5, 10.0, -22.0), "ophthalmic artery origin, superomedial supraclinoid ICA"),
    "optic_canal": ((11.0, 17.0, -18.0), "optic canal (optic nerve + ophthalmic artery)"),
    "orbit_apex": ((15.0, 26.0, -22.0), "orbital apex / annulus of Zinn"),
    "globe_center": ((32.0, 58.0, -30.0), "centre of the eye globe"),
    "PComm_origin": ((13.5, 4.5, -17.0), "PComm origin from posterior wall of the supraclinoid ICA (C7)"),
    "AChA_origin": ((13.8, 3.0, -15.0), "anterior choroidal artery origin, 2-4 mm above PComm"),
    "ICA_terminus": ((13.0, 2.0, -13.0), "ICA bifurcation into A1 and M1"),
    "A1A2_junction": ((1.2, 10.0, -6.0), "end of A1 at the ACom (ACom spans x=-1.2..+1.2)"),
    "MCA_bifurcation": ((32.0, 6.0, -11.0), "M1 bifurcation (superior/inferior trunks)"),
    "MCA_genu": ((37.0, 5.0, -9.0), "MCA genu at the limen insulae (M1->M2)"),
    "insula_center": ((38.0, -4.0, 4.0), "centre of the insular cortex surface"),
    "sylvian_point": ((40.0, -30.0, 19.0), "angiographic sylvian point (last M3 loop leaving the insula top)"),
    # --- posterior circulation ----------------------------------------------
    "PCA_P1P2": ((8.5, -10.0, -20.0), "P1/P2 junction where the PComm joins the PCA"),
    "PCA_P2P3": ((10.0, -40.0, -6.0), "P2/P3 junction at the quadrigeminal cistern"),
    "calcarine_point": ((8.0, -78.0, 4.0), "anterior calcarine fissure on the medial occipital surface"),
    "occipital_pole": ((10.0, -94.0, 4.0), "occipital pole (cortical surface)"),
    "VA_origin": ((31.0, 4.0, -201.0), "VA origin from the first part of the subclavian artery"),
    "VA_C6_foramen_entry": ((24.0, -22.0, -163.0), "VA enters the C6 transverse foramen (V1->V2)"),
    "VA_C2_foramen": ((23.0, -26.0, -94.0), "VA in the C2 transverse foramen"),
    "VA_C1_foramen": ((29.0, -29.0, -82.0), "VA enters the C1 transverse foramen (V2->V3)"),
    "VA_C1_exit": ((29.0, -30.0, -76.0), "VA exits the top of the C1 transverse foramen"),
    "VA_C1_sulcus": ((20.0, -51.0, -74.0), "V3 in the sulcus arteriosus on the posterior arch of C1"),
    "VA_dural_entry": ((13.0, -40.0, -66.0), "VA pierces the dura at the lateral foramen magnum (V3->V4)"),
    "subclavian_apex": ((40.0, 4.0, -196.0), "highest point of the subclavian arch"),
    "subclavian_lateral": ((62.0, -2.0, -206.0), "subclavian at the lateral border of the first rib"),
    # --- venous ----------------------------------------------------------------
    "jugular_bulb": ((34.0, -24.0, -55.0), "dome of the jugular bulb (sigmoid -> IJV)"),
    "jugular_foramen": ((34.0, -23.0, -62.0), "exocranial jugular foramen, IJV begins"),
    "IJV_C2": ((33.0, -10.0, -95.0), "internal jugular vein at C2, posterolateral to the ICA"),
    "IJV_low": ((30.0, 6.0, -190.0), "IJV near its junction with the subclavian vein"),
    "cavernous_sinus": ((15.0, 2.0, -32.0), "centre of the cavernous sinus"),
    "venous_angle": ((3.0, -4.0, 11.0), "foramen of Monro: thalamostriate + septal veins form the ICV"),
    # --- skull base / face (for ECA branches) --------------------------------
    "foramen_spinosum": ((24.0, -3.0, -44.5), "middle meningeal artery enters the skull"),
    "foramen_ovale": ((21.0, 2.0, -45.0), "foramen ovale (accessory meningeal a.)"),
    "mastoid_tip": ((50.0, -30.0, -66.0), "mastoid process tip (occipital artery passes medial)"),
    "mandible_angle": ((46.0, 2.0, -100.0), "angle of the mandible"),
    "condyle_mandible": ((50.0, -10.0, -48.0), "mandibular condyle, just anterior to the EAM"),
}

_MIDLINE = {
    "AC": ((0.0, 0.0, 0.0), "anterior commissure (origin)"),
    "PC": ((0.0, -26.0, 0.0), "posterior commissure"),
    "sella": ((0.0, 1.0, -30.0), "centre of the pituitary fossa"),
    "tuberculum_sellae": ((0.0, 8.0, -24.0), "tuberculum sellae"),
    "dorsum_sellae": ((0.0, -7.0, -23.0), "top of the dorsum sellae"),
    "optic_chiasm": ((0.0, 4.0, -13.0), "optic chiasm"),
    "ACom_center": ((0.0, 10.0, -6.0), "anterior communicating artery centre, above the chiasm"),
    "basilar_tip": ((0.0, -12.0, -22.0), "basilar apex / P1 origins in the interpeduncular cistern"),
    "VB_junction": ((0.0, -24.0, -54.0), "vertebrobasilar junction at the pontomedullary sulcus"),
    "clivus_mid": ((0.0, -16.0, -45.0), "midpoint of the endocranial clival surface"),
    "basion": ((0.0, -25.0, -66.0), "anterior margin of the foramen magnum"),
    "opisthion": ((0.0, -60.0, -70.0), "posterior margin of the foramen magnum"),
    "foramen_magnum": ((0.0, -42.0, -67.0), "centre of the foramen magnum"),
    "straight_sinus_start": (tuple(STRAIGHT_SINUS_START), "falcotentorial junction: VoG + ISS form the straight sinus"),
    "torcular": (tuple(TORCULAR), "torcular Herophili (confluence of sinuses)"),
    "vein_of_Galen": ((0.0, -44.0, -1.0), "great cerebral vein of Galen under the splenium"),
    "splenium": ((0.0, -45.0, 6.0), "posterior edge of the splenium"),
    "genu_cc": ((0.0, 33.0, 6.0), "anterior edge of the callosal genu"),
    "nasion": ((0.0, 79.0, -24.0), "nasion (soft-tissue/bony)"),
    "menton": ((0.0, 70.0, -130.0), "chin"),
    # --- great vessels (asymmetric) -----------------------------------------
    "aortic_root": ((14.0, 28.0, -305.0), "aortic root"),
    "ascending_aorta_top": ((16.0, 22.0, -262.0), "distal ascending aorta"),
    "aortic_arch_apex": ((2.0, 10.0, -242.0), "top of the aortic arch"),
    "aortic_isthmus": ((-20.0, -16.0, -252.0), "aortic isthmus (distal arch)"),
    "descending_aorta": ((-22.0, -32.0, -300.0), "proximal descending thoracic aorta"),
    "brachiocephalic_origin": ((9.0, 16.0, -244.0), "brachiocephalic (innominate) trunk origin"),
    "BCT_bifurcation": ((21.0, 10.0, -206.0), "innominate bifurcation behind right SC joint = R CCA & R subclavian origins"),
    "CCA_origin_R": ((21.0, 10.0, -206.0), "right CCA origin (= BCT bifurcation)"),
    "subclavian_origin_R": ((21.0, 10.0, -206.0), "right subclavian origin (= BCT bifurcation)"),
    "CCA_origin_L": ((-6.0, 6.0, -242.0), "left CCA origin from the arch"),
    "subclavian_origin_L": ((-16.0, -4.0, -246.0), "left subclavian origin from the arch"),
}

_ASYM_L = {
    # left side values that are NOT a mirror image of the right
    "VA_origin_L": ((-30.0, -4.0, -204.0), "left VA origin from the left subclavian"),
    "subclavian_apex_L": ((-38.0, -4.0, -199.0), "highest point of the left subclavian"),
    "subclavian_lateral_L": ((-62.0, -2.0, -206.0), "left subclavian at the first rib"),
}

LANDMARKS: dict[str, np.ndarray] = {}
LANDMARK_INFO: dict[str, str] = {}
for _k, (_v, _d) in _BILATERAL.items():
    LANDMARKS[_k + "_R"] = np.array(_v, float)
    LANDMARKS[_k + "_L"] = mirror(np.array(_v, float))
    LANDMARK_INFO[_k + "_R"] = _d + " (right)"
    LANDMARK_INFO[_k + "_L"] = _d + " (left)"
for _k, (_v, _d) in _MIDLINE.items():
    LANDMARKS[_k] = np.array(_v, float)
    LANDMARK_INFO[_k] = _d
for _k, (_v, _d) in _ASYM_L.items():
    LANDMARKS[_k] = np.array(_v, float)
    LANDMARK_INFO[_k] = _d


def _computed_landmarks():
    """Landmarks derived from the implicit skull/brain surfaces (rounded to 0.1 mm, exact SDFs)."""
    out = {}

    def put(name, p, info):
        out[name] = (np.round(np.asarray(p, float), 1), info)

    def inner(p, inset):
        return project_to_surface(p, "inner_table", inset, 12, fast=False)

    def surf(p, name, depth):
        return project_to_surface(p, name, depth, 12, fast=False)

    # dural sinuses on the inner table (inset 3.5 mm)
    put("SSS_anterior", inner((0.0, 70.0, -12.0), 3.5), "SSS origin at the foramen caecum / crista galli")
    put("SSS_bregma", inner((0.0, 40.0, 90.0), 3.5), "SSS at bregma (coronal suture)")
    put("SSS_vertex", inner((0.0, -14.0, 95.0), 3.5), "SSS at the vertex")
    put("SSS_lambda", inner((0.0, -75.0, 70.0), 3.5), "SSS at lambda")
    for s in ("R", "L"):
        sg = side_sign(s)
        put(f"transverse_mid_{s}", inner((sg * 45.0, -85.0, -24.0), 3.5), "mid transverse sinus")
        put(f"sigmoid_transverse_junction_{s}", inner((sg * 60.0, -47.0, -31.0), 4.0),
            "transverse -> sigmoid sinus junction (asterion)")
        put(f"sigmoid_mid_{s}", (sg * 48.0, -38.0, -44.0), "mid sigmoid sinus (mastoid groove, below the petrous base)")
        put(f"EAM_{s}", surf((sg * 75.0, -18.0, -38.0), "outer_table", 0.0), "external acoustic meatus (bony)")
        put(f"pterion_{s}", inner((sg * 70.0, 22.0, 8.0), 1.0), "pterion (inner table; MMA anterior branch)")
        put(f"temporal_pole_{s}", surf((sg * 40.0, 18.0, -32.0), "brain", 0.0), "temporal pole (cortex)")
        put(f"frontal_pole_{s}", surf((sg * 15.0, 80.0, 0.0), "brain", 0.0), "frontal pole (cortex)")
    put("vertex_scalp", surf((0.0, -14.0, 120.0), "scalp", 0.0), "vertex (skin)")
    put("inion", surf((0.0, -130.0, -22.0), "outer_table", 0.0), "external occipital protuberance")
    return out


for _k, (_v, _d) in _computed_landmarks().items():
    LANDMARKS[_k] = _v
    LANDMARK_INFO[_k] = _d


def L(name, side=None):
    """Landmark lookup.  L('ICA_terminus', 'R') == LANDMARKS['ICA_terminus_R'] (a copy)."""
    key = name if side is None else f"{name}_{'R' if side_sign(side) > 0 else 'L'}"
    if key not in LANDMARKS:
        raise KeyError(f"unknown landmark {key!r}")
    return LANDMARKS[key].copy()


# ----------------------------------------------------------------------------
# bone density (for the unsubtracted / mask DRR); crude but plausible
# ----------------------------------------------------------------------------

def _polyline_capsules(p, pts, r):
    pts = np.asarray(pts, float)
    f = None
    for a, b in zip(pts[:-1], pts[1:]):
        g = sd_capsule(p, a, b, r)
        f = g if f is None else np.minimum(f, g)
    return f


def _sym(pts):
    """Polyline mirrored and joined through the midline (U shapes)."""
    pts = np.asarray(pts, float)
    left = pts[::-1] * [-1, 1, 1]
    return np.concatenate([pts, left[1:]], 0) if abs(pts[-1, 0]) < 1e-6 else np.concatenate([pts, left], 0)


_MANDIBLE = _sym([(50, -10, -48), (48, -6, -70), (46, 2, -100), (38, 35, -118), (20, 60, -126), (0, 70, -128)])
_UPPER_TEETH = _sym([(28, 30, -76), (25, 50, -76), (15, 62, -76), (0, 67, -76)])
_LOWER_TEETH = _sym([(27, 32, -88), (24, 50, -88), (14, 61, -88), (0, 65, -88)])


def bone_density(p):
    """Relative bone density (0 = soft tissue, ~1 = cortical bone, ~1.7 = enamel)."""
    p = _a(p)
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    ax = np.abs(x)
    dens = np.zeros(x.shape)
    zmin, zmax = float(np.min(z)), float(np.max(z))
    # --- calvarium + skull base plate
    if zmax > -100.0:
        d_in = skull_inner_sdf(p)
        d_out = skull_outer_sdf(p)
        h = cranial_floor_z(x, y)
        t = np.where(y > 15, 5.0, 8.0)
        shell = (d_out < 0) & (d_in > 0) & (z > h - t)
        fm_hole = (ax < 15) & (y < -25) & (y > -60) & (z < -55)
        shell &= ~fm_hole
        cal = 0.45 + 0.55 * (np.exp(-np.clip(d_in, 0, None) / 1.3) + np.exp(-np.clip(-d_out, 0, None) / 1.3))
        dens = np.where(shell, np.minimum(cal, 1.0), dens)
    # petrous pyramids (dense) and clivus / sphenoid body
    pet = np.minimum(sd_capsule(p, (14, -14, -36), (50, -36, -40), 7.0),
                     sd_capsule(p, (-14, -14, -36), (-50, -36, -40), 7.0))
    dens = np.where(pet < 0, np.maximum(dens, 0.75 + 0.35 * np.exp(-np.clip(-pet, 0, None) / 2.0)), dens)
    sph = sd_ellipsoid(p, (0, 4, -44), (14, 14, 9))
    sph_air = sd_ellipsoid(p, (0, 8, -46), (10, 10, 6))
    dens = np.where((sph < 0) & (sph_air > 0), np.maximum(dens, 0.8), dens)
    dens = np.where(sph_air < 0, 0.0, dens)
    if zmin > 0.0:
        return dens
    # --- face
    orb_rim = None
    for s in (1, -1):
        c = np.array([s * 33.0, 64.0, -32.0])
        q = p - c
        rho = np.sqrt(q[..., 0] ** 2 + (q[..., 2] * 1.1) ** 2)
        tor = np.sqrt((rho - 19.0) ** 2 + (q[..., 1] * 1.3) ** 2) - 3.5
        orb_rim = tor if orb_rim is None else np.minimum(orb_rim, tor)
    dens = np.where(orb_rim < 0, 1.0, dens)
    zyg = np.minimum(_polyline_capsules(p, [(48, 62, -25), (52, 50, -50), (60, -5, -40)], 4.0),
                     _polyline_capsules(p, [(-48, 62, -25), (-52, 50, -50), (-60, -5, -40)], 4.0))
    dens = np.where(zyg < 0, 0.95, dens)
    mx = sd_ellipsoid(p, (0, 50, -58), (32, 22, 16))
    dens = np.where(np.abs(mx) < 1.6, np.maximum(dens, 0.7), dens)
    palate = (np.abs(z + 71) < 2.0) & (y > 18) & (y < 66) & (ax < 20)
    dens = np.where(palate, np.maximum(dens, 0.8), dens)
    sept = (ax < 1.2) & (y > 35) & (y < 75) & (z < -28) & (z > -70)
    dens = np.where(sept, np.maximum(dens, 0.5), dens)
    man = _polyline_capsules(p, _MANDIBLE, 6.0)
    dens = np.where(man < 0, np.maximum(dens, 0.6 + 0.5 * np.exp(-np.clip(-man, 0, None) / 1.5)), dens)
    teeth = np.minimum(_polyline_capsules(p, _UPPER_TEETH, 4.5), _polyline_capsules(p, _LOWER_TEETH, 4.5))
    dens = np.where(teeth < 0, 1.7, dens)
    # --- spine
    for lv, d in SPINE.items():
        b = d["body"]
        yb, zb = b[1], b[2]
        if zmin > zb + 16 or zmax < zb - 16:
            continue
        if lv == "C1":
            ring = _polyline_capsules(p, [(-20, -28, zb), (-12, -16, zb), (0, -14, zb), (12, -16, zb), (20, -28, zb),
                                          (14, -54, zb), (0, -62, zb), (-14, -54, zb), (-20, -28, zb)], 3.5)
            lm = np.minimum(sd_ellipsoid(p, (20, -28, zb), (8, 10, 7)), sd_ellipsoid(p, (-20, -28, zb), (8, 10, 7)))
            tp = np.minimum(sd_capsule(p, (20, -28, zb), (38, -30, zb), 4.0), sd_capsule(p, (-20, -28, zb), (-38, -30, zb), 4.0))
            vb = np.minimum(np.minimum(ring, lm), tp)
            dens_dens = sd_capsule(p, (0, -22, -72), (0, -22, -90), 5.0)
            vb = np.minimum(vb, dens_dens)
        else:
            vb = sd_ellipsoid(p, b, (9.5, 8.0, 6.5))
            arch = _polyline_capsules(p, [(9, yb - 5, zb), (12, yb - 16, zb), (0, yb - 28, zb), (-12, yb - 16, zb),
                                          (-9, yb - 5, zb)], 3.0)
            sp = sd_capsule(p, (0, yb - 28, zb), (0, yb - 40, zb - 4), 3.0)
            tpx = 32.0 if lv.startswith("C") else 30.0
            tp = np.minimum(sd_capsule(p, (8, yb - 3, zb), (tpx, yb - 4, zb), 3.5),
                            sd_capsule(p, (-8, yb - 3, zb), (-tpx, yb - 4, zb), 3.5))
            vb = np.minimum(np.minimum(vb, arch), np.minimum(sp, tp))
        if lv.startswith("C"):
            for k in ("transverse_foramen_R", "transverse_foramen_L"):
                tf = d[k]
                hole = np.sqrt((x - tf[0]) ** 2 + (y - tf[1]) ** 2) < 3.0
                vb = np.where(hole & (np.abs(z - zb) < 8), 1.0, vb)
        dens = np.where(vb < 0, np.maximum(dens, 0.6 + 0.45 * np.exp(-np.clip(-vb, 0, None) / 1.2)), dens)
    if zmin > -180.0:
        return dens
    # --- shoulder girdle
    clav = np.minimum(sd_capsule(p, (18, 30, -212), (80, 8, -200), 6.0), sd_capsule(p, (-18, 30, -212), (-80, 8, -200), 6.0))
    dens = np.where(clav < 0, np.maximum(dens, 0.9), dens)
    man_st = sd_ellipsoid(p, (0, 36, -228), (24, 5, 22))
    dens = np.where(man_st < 0, np.maximum(dens, 0.7), dens)
    return dens


BONE_BOUNDS = ((-84.0, 84.0), (-122.0, 100.0), (-268.0, 100.0))


@lru_cache(maxsize=4)
def bone_volume(spacing=1.5, bounds=BONE_BOUNDS):
    """Voxelised bone density.  Returns (vol[z, y, x] float32, origin(x,y,z), spacing).
    Cached in memory and on disk (~/.cache/dsa_sim)."""
    import os
    (x0, x1), (y0, y1), (z0, z1) = bounds
    path = os.path.join(_cache_dir(), f"bone_{_geometry_hash()}_{spacing:g}.npy")
    if os.path.exists(path):
        try:
            return np.load(path), np.array([x0, y0, z0]), float(spacing)
        except Exception:
            pass
    xs = np.arange(x0, x1 + 1e-6, spacing)
    ys = np.arange(y0, y1 + 1e-6, spacing)
    zs = np.arange(z0, z1 + 1e-6, spacing)
    vol = np.zeros((len(zs), len(ys), len(xs)), np.float32)
    Y, X = np.meshgrid(ys, xs, indexing="ij")
    for i, zz in enumerate(zs):
        P = np.stack([X, Y, np.full_like(X, zz)], -1)
        vol[i] = bone_density(P)
    from scipy.ndimage import gaussian_filter
    vol = gaussian_filter(vol, 0.6).astype(np.float32)   # anti-alias voxel terraces
    try:
        np.save(path, vol)
    except OSError:
        pass
    return vol, np.array([x0, y0, z0]), float(spacing)
