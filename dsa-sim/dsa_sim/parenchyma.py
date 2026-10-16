"""Brain parenchyma as coarse voxels for the capillary blush and venous drainage.

Each voxel (default 3 mm) inside the brain gets
  * a relative blood-volume weight (cortical ribbon 1.0, deep grey 1.25, thalamus
    1.35, white matter 0.45, cerebellar cortex 1.0, brainstem 0.6),
  * a lobe/region label (frame.lobe_of),
  * a feeding arterial node = the nearest arterial terminal / small-artery sample
    (computed lazily for a given NodeIndex, so territories follow the anatomy that
    was actually built).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import frame as F


@dataclass
class Parenchyma:
    pos: np.ndarray                 # (M,3) voxel centres, mm
    weight: np.ndarray              # (M,) relative blood volume x voxel volume (mm^3)
    region: np.ndarray              # (M,) object array of labels
    spacing: float = 3.0
    blood_fraction: float = 0.04    # cerebral blood volume fraction (~4 ml/100 g)
    _feed_cache: dict = field(default_factory=dict, repr=False)

    @classmethod
    def build(cls, spacing=3.0, ribbon_mm=7.0, bounds=((-70, 70), (-100, 76), (-78, 82))):
        g = F.grid_sdf("brain")
        axes = [np.arange(b[0] + spacing / 2, b[1], spacing) for b in bounds]
        X, Y, Z = np.meshgrid(*axes, indexing="ij")
        P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
        d = g(P)
        rng = np.random.default_rng(12345)
        P = P + rng.uniform(-0.5, 0.5, P.shape) * spacing   # jitter breaks grid aliasing in projections
        d = g(P)
        P = P[d < 0]
        d = d[d < 0]
        region = F.lobe_of(P)
        w = np.where(-d < ribbon_mm, 1.0, 0.45)
        w = np.where(region == "deep", 1.25, w)
        th = F.DEEP["thalamus"]
        thal = np.minimum(F.sd_ellipsoid(P, th[0], th[1]), F.sd_ellipsoid(P, np.array(th[0]) * [-1, 1, 1], th[1])) < 0
        w = np.where(thal, 1.35, w)
        w = np.where(region == "brainstem", 0.6, w)
        region = region.astype(object)
        region[thal] = "thalamus"
        return cls(pos=P, weight=w * spacing ** 3, region=region, spacing=float(spacing))

    def __len__(self):
        return len(self.pos)

    def feeding_nodes(self, ix, max_mm=25.0, small_r=0.65):
        """Nearest arterial feeder per voxel (terminal ends + samples of small arteries)."""
        key = (id(ix), ix.N)
        if key in self._feed_cache:
            return self._feed_cache[key]
        from scipy.spatial import cKDTree
        tree = ix.tree
        has_child = {v.parent for v in tree if v.parent is not None}
        cand = []
        for v in tree:
            if v.system != "artery" or v.collateral:
                continue
            sl = ix.vessel_slice(v.id)
            nodes = np.arange(sl.start, sl.stop)
            if v.id not in has_child:
                cand.append(nodes[-1:] if v.flow_direction >= 0 else nodes[:1])
            small = nodes[v.radii <= small_r]
            if len(small):
                cand.append(small[::2])
        if not cand:
            out = np.zeros(len(self.pos), int)
            self._feed_cache[key] = out
            return out
        cand = np.unique(np.concatenate(cand))
        kd = cKDTree(ix.pts[cand])
        dist, j = kd.query(self.pos, k=1)
        out = cand[j]
        far = dist > max_mm
        if far.any():
            art = np.nonzero(~ix.is_vein)[0]
            kd2 = cKDTree(ix.pts[art])
            _, j2 = kd2.query(self.pos[far], k=1)
            out[far] = art[j2]
        self._feed_cache[key] = out
        return out

    def territory_of(self, ix):
        """Territory tag (vessel.territory or group) of each voxel's feeder."""
        feed = self.feeding_nodes(ix)
        vids = ix.vids
        tags = np.array([(ix.tree[v].territory or ix.tree[v].group or v) for v in vids], dtype=object)
        return tags[ix.vessel_of[feed]]
