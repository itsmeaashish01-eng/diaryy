"""Contrast bolus simulation on the directed vessel graph.

Model (per point/node of every vessel):
  * arterial nodes get a lumen opacification amplitude A (0..1), a mean bolus
    delay tau (s, after injection start) and a dispersion sigma (s);
  * c(t) = A * [Gcdf(t - t0 - tau) - Gcdf(t - t0 - tau - T)]   (boxcar of length T
    convolved with a mean-zero gamma variate of shape k and s.d. sigma);
  * arteries: label-setting search from the catheter maximising A (ties: earliest
    tau).  Antegrade edges keep A; retrograde edges decay exp(-ds/lambda)
    (catheter reflux, contralateral VA reflux at the VB confluence); confluence
    inflows are diluted by unopacified flow; collaterals (ACom/PComm/anastomoses)
    cross in either direction attenuated by fill_fraction x cube-law mixing;
  * tissue elements (parenchyma voxels, or arterial terminals as fallback) get the
    capillary blush and drain into the nearest small vein node (capillary transit);
  * veins: flow-weighted moment mixing in topological order downstream.
Velocity v(r) = v_ref (r/r_ref)^v_exp (mm/s), venous v_vein(r) likewise.
"""
from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

import numpy as np
from scipy.special import gammainc

from .tree import VesselTree


@dataclass
class HemoParams:
    v_ref: float = 300.0          # mm/s mean velocity at r_ref (ICA ~ 30-35 cm/s)
    r_ref: float = 2.0
    v_exp: float = 0.8
    v_min: float = 25.0
    v_vein_ref: float = 150.0     # mm/s at r_ref (sinuses ~15-25 cm/s, cortical veins ~5 cm/s)
    v_vein_exp: float = 0.7
    v_vein_min: float = 20.0
    sigma0: float = 0.12          # s, dispersion at the catheter
    disp_coeff: float = 0.10      # s^2 added per s of transit
    gamma_shape: float = 3.0
    retro_decay_mm: float = 6.0   # reflux length scale (catheter / generic retrograde)
    retro_speed: float = 0.3      # fraction of antegrade speed for reflux
    confluence_dilution: float = 0.3
    confluence_reflux_decay_mm: float = 25.0
    collateral_speed: float = 0.5
    collateral_mixing: float = 2.5
    cap_transit: float = 2.0      # s arteriole -> venule (capillary + venular transit)
    cap_sigma: float = 0.9        # s dispersion added in the capillary bed
    blush_delay: float = 1.4      # s, capillary blush lags arterial arrival
    venous_disp: float = 0.06     # s^2 per s of venous transit
    min_amp: float = 0.02
    drain_max_mm: float = 30.0    # tissue -> vein drainage search radius
    drain_vein_max_r: float = 1.3 # tissue drains into veins thinner than this (if any nearby)


# Named catheter positions.  ``vessels`` are tried in order (canonical ids, see
# ENGINE_API.md); ``at`` is a landmark name or (landmark, offset) used to pick the
# catheter index; if no candidate exists the nearest artery to ``at`` is used.
INJECTIONS = {
    "ICA_R": dict(vessels=["ICA_cervical_R", "ICA_R"], at="ICA_C2_R", amp=0.85, duration=1.5, rate=6.0),
    "ICA_L": dict(vessels=["ICA_cervical_L", "ICA_L"], at="ICA_C2_L", amp=0.85, duration=1.5, rate=6.0),
    "CCA_R": dict(vessels=["CCA_R"], at=("carotid_bifurcation_R", (0, 0, -30)), amp=0.8, duration=1.5, rate=8.0),
    "CCA_L": dict(vessels=["CCA_L"], at=("carotid_bifurcation_L", (0, 0, -30)), amp=0.8, duration=1.5, rate=8.0),
    "ECA_R": dict(vessels=["ECA_R"], at="ECA_proximal_R", amp=0.8, duration=1.5, rate=3.0),
    "ECA_L": dict(vessels=["ECA_L"], at="ECA_proximal_L", amp=0.8, duration=1.5, rate=3.0),
    "VA_R": dict(vessels=["VA_R"], at=("VA_C6_foramen_entry_R", (0, 1, 22)), amp=0.85, duration=1.5, rate=5.0),
    "VA_L": dict(vessels=["VA_L"], at=("VA_C6_foramen_entry_L", (0, 1, 22)), amp=0.85, duration=1.5, rate=5.0),
    "arch": dict(vessels=["aortic_arch", "aorta"], at="ascending_aorta_top", amp=0.35, duration=1.2, rate=20.0),
}


@dataclass
class Injection:
    vessel: str
    index: int
    amp: float = 0.85
    duration: float = 1.5
    t0: float = 0.0
    name: str = ""


def resolve_injection(tree: VesselTree, spec="ICA_R", t0=0.0, **over) -> Injection:
    """Turn a preset name / dict / Injection into a concrete catheter node."""
    from . import frame as F

    if isinstance(spec, Injection):
        return spec
    name = spec if isinstance(spec, str) else spec.get("name", "custom")
    d = dict(INJECTIONS[spec]) if isinstance(spec, str) else dict(spec)
    d.update(over)
    at = d.get("at")
    if isinstance(at, tuple) and len(at) == 2 and isinstance(at[0], str):
        pt = F.LANDMARKS[at[0]] + np.asarray(at[1], float)
    elif isinstance(at, str):
        pt = F.LANDMARKS[at]
    elif at is not None:
        pt = np.asarray(at, float)
    else:
        pt = None
    vid, idx = None, None
    for cand in d.get("vessels", []):
        if cand in tree:
            vid = cand
            idx = tree[cand].index_at(pt) if pt is not None else tree[cand].n // 5
            break
    if vid is None:
        if pt is None:
            raise KeyError(f"injection {name}: no vessel candidate in tree and no landmark")
        vid, idx, dist = tree.find_nearest(pt, system="artery")
        if vid is None:
            raise KeyError("tree has no arteries")
    return Injection(vessel=vid, index=int(idx), amp=float(d.get("amp", 0.85)),
                     duration=float(d.get("duration", 1.5)), t0=float(d.get("t0", t0)), name=name)


# ----------------------------------------------------------------------------
# graph indexing
# ----------------------------------------------------------------------------
class NodeIndex:
    """Global node numbering: node = offset[vessel] + point_index."""

    def __init__(self, tree: VesselTree):
        self.tree = tree
        self.vids = tree.ids()
        self.offset = {}
        o = 0
        for vid in self.vids:
            self.offset[vid] = o
            o += tree[vid].n
        self.N = o
        self.pts = np.vstack([tree[v].points for v in self.vids]) if self.vids else np.zeros((0, 3))
        self.rad = np.concatenate([tree[v].radii for v in self.vids]) if self.vids else np.zeros(0)
        self.vessel_of = np.concatenate([np.full(tree[v].n, k) for k, v in enumerate(self.vids)]) if self.vids else np.zeros(0, int)
        self.is_vein = np.concatenate([np.full(tree[v].n, tree[v].system == "vein") for v in self.vids]) if self.vids else np.zeros(0, bool)

    def node(self, vid, i):
        v = self.tree[vid]
        i = int(i) if i >= 0 else v.n + int(i)
        return self.offset[vid] + i

    def vessel_slice(self, vid):
        o = self.offset[vid]
        return slice(o, o + self.tree[vid].n)


def _speed(r, p: HemoParams, vein=False):
    if vein:
        return np.maximum(p.v_vein_min, p.v_vein_ref * (np.asarray(r) / p.r_ref) ** p.v_vein_exp)
    return np.maximum(p.v_min, p.v_ref * (np.asarray(r) / p.r_ref) ** p.v_exp)


# ----------------------------------------------------------------------------
# arterial propagation
# ----------------------------------------------------------------------------

def _arterial_edges(tree: VesselTree, ix: NodeIndex, p: HemoParams):
    """Adjacency list: adj[u] = list of (v, factor, dt)."""
    adj = [[] for _ in range(ix.N)]
    inflow = {}  # node -> list of (u, edge position in adj[u]) for antegrade flow edges

    def add(u, v, f, dt, flow=False):
        adj[u].append([v, f, dt])
        if flow:
            inflow.setdefault(v, []).append((u, len(adj[u]) - 1))

    conf_inflow_vessels = set()
    for vid in ix.vids:
        v = tree[vid]
        if v.system != "artery":
            continue
        o = ix.offset[vid]
        ds = np.linalg.norm(np.diff(v.points, axis=0), axis=1)
        rm = 0.5 * (v.radii[1:] + v.radii[:-1])
        sp = _speed(rm, p) * v.velocity_scale
        if v.collateral:
            L = max(float(ds.sum()), 1e-6)
            ff = float(np.clip(v.fill_fraction, 0, 1))
            for i in range(v.n - 1):
                f = ff ** (ds[i] / L) if ff > 0 else 0.0
                dt = ds[i] / (sp[i] * p.collateral_speed)
                add(o + i, o + i + 1, f, dt)
                add(o + i + 1, o + i, f, dt)
            # ends: junctions with cube-law mixing into the receiving vessel
            ends = []
            if v.parent is not None and v.parent in tree:
                ends.append((o, ix.node(v.parent, v.parent_index), tree[v.parent].radii[v.parent_index]))
            if v.connects_to is not None and v.connects_to[0] in tree:
                tv = tree[v.connects_to[0]]
                ends.append((o + v.n - 1, ix.node(tv.id, v.connects_to[1]), tv.radii[v.connects_to[1]]))
            for (cn, tn, rt) in ends:
                rc = v.radii[0] if cn == o else v.radii[-1]
                mix = min(1.0, p.collateral_mixing * (rc / max(rt, 1e-3)) ** 3)
                add(tn, cn, 1.0, 0.0)          # into the collateral
                add(cn, tn, mix, 0.0)          # out of the collateral into the target
            continue
        fwd = v.flow_direction >= 0
        for i in range(v.n - 1):
            a, b = (o + i, o + i + 1) if fwd else (o + i + 1, o + i)
            dt = ds[i] / sp[i]
            add(a, b, 1.0, dt, flow=True)
            add(b, a, math.exp(-ds[i] / p.retro_decay_mm), dt / p.retro_speed)
        if v.parent is not None and v.parent in tree and tree[v.parent].system == "artery":
            pn = ix.node(v.parent, v.parent_index)
            if fwd:
                add(pn, o, 1.0, 0.0, flow=True)
                add(o, pn, 1.0, 0.0)  # retrograde out of a branch: decay comes from its rev edges
            else:
                add(o, pn, 1.0, 0.0, flow=True)
                add(pn, o, 1.0, 0.0)
        if v.merges_into is not None and v.merges_into[0] in tree:
            tn = ix.node(v.merges_into[0], v.merges_into[1])
            end = o + (v.n - 1 if fwd else 0)
            add(end, tn, 1.0, 0.0, flow=True)
            add(tn, end, 1.0, 0.0)
            conf_inflow_vessels.add(vid)

    # confluence dilution + stronger reflux into confluence inflows
    for node, lst in inflow.items():
        srcv = {ix.vessel_of[u] for u, _ in lst}
        if len(srcv) < 2:
            continue
        r3 = np.array([ix.rad[u] ** 3 for u, _ in lst])
        w = r3 / r3.sum()
        for (u, k), wi in zip(lst, w):
            adj[u][k][1] = 1.0 - p.confluence_dilution * (1.0 - wi)
            conf_inflow_vessels.add(ix.vids[ix.vessel_of[u]])
    lam = p.confluence_reflux_decay_mm
    for vid in conf_inflow_vessels:
        v = tree[vid]
        o = ix.offset[vid]
        ds = np.linalg.norm(np.diff(v.points, axis=0), axis=1)
        fwd = v.flow_direction >= 0
        for i in range(v.n - 1):
            a, b = (o + i, o + i + 1) if fwd else (o + i + 1, o + i)
            for e in adj[b]:
                if e[0] == a:
                    e[1] = math.exp(-ds[i] / lam)
    return adj


def _propagate(adj, src, amp, min_amp):
    N = len(adj)
    A = np.zeros(N)
    tau = np.full(N, np.inf)
    done = np.zeros(N, bool)
    h = [(-amp, 0.0, src)]
    A[src] = amp
    tau[src] = 0.0
    while h:
        na, t, u = heapq.heappop(h)
        if done[u]:
            continue
        done[u] = True
        a = -na
        for v, f, dt in adj[u]:
            if done[v]:
                continue
            a2 = a * f
            if a2 < min_amp:
                continue
            t2 = t + dt
            if a2 > A[v] + 1e-12 or (abs(a2 - A[v]) <= 1e-12 and t2 < tau[v]):
                A[v] = a2
                tau[v] = t2
                heapq.heappush(h, (-a2, t2, v))
    tau[~np.isfinite(tau)] = 0.0
    return A, tau


# ----------------------------------------------------------------------------
# tissue elements and veins
# ----------------------------------------------------------------------------

def _terminal_elements(tree: VesselTree, ix: NodeIndex):
    """Fallback tissue elements = distal ends of arterial vessels without children."""
    has_child = {v.parent for v in tree if v.parent is not None}
    nodes, w = [], []
    for v in tree:
        if v.system != "artery" or v.collateral or v.id in has_child:
            continue
        nodes.append(ix.node(v.id, v.n - 1 if v.flow_direction >= 0 else 0))
        w.append(max(v.radii[-1], 0.1) ** 3)
    return np.array(nodes, int), np.array(w, float)


def _venous_solve(tree: VesselTree, ix: NodeIndex, p: HemoParams, src_nodes, src_w, src_A, src_tau, src_var):
    """Flow-weighted moment propagation through the venous DAG."""
    N = ix.N
    F = np.zeros(N)
    M0 = np.zeros(N)
    M1 = np.zeros(N)
    M2 = np.zeros(N)
    np.add.at(F, src_nodes, src_w)
    np.add.at(M0, src_nodes, src_w * src_A)
    np.add.at(M1, src_nodes, src_w * src_A * src_tau)
    np.add.at(M2, src_nodes, src_w * src_A * (src_var + src_tau ** 2))
    out = [[] for _ in range(N)]
    indeg = np.zeros(N, int)
    vein_nodes = np.nonzero(ix.is_vein)[0]

    def add(u, v, dt):
        out[u].append((v, dt))
        indeg[v] += 1

    for vid in ix.vids:
        v = tree[vid]
        if v.system != "vein":
            continue
        o = ix.offset[vid]
        ds = np.linalg.norm(np.diff(v.points, axis=0), axis=1)
        rm = 0.5 * (v.radii[1:] + v.radii[:-1])
        sp = _speed(rm, p, vein=True) * v.velocity_scale
        fwd = v.flow_direction >= 0
        for i in range(v.n - 1):
            a, b = (o + i, o + i + 1) if fwd else (o + i + 1, o + i)
            add(a, b, ds[i] / sp[i])
        if v.parent is not None and v.parent in tree and tree[v.parent].system == "vein":
            pn = ix.node(v.parent, v.parent_index)
            if fwd:
                add(pn, o, 0.0)
            else:
                add(o, pn, 0.0)
        tgt = v.merges_into or (v.connects_to if v.collateral else None)
        if tgt is not None and tgt[0] in tree:
            end = o + (v.n - 1 if fwd else 0)
            add(end, ix.node(tgt[0], tgt[1]), 0.0)
    # Kahn topological order (cycles broken by forcing remaining nodes)
    from collections import deque
    q = deque(int(n) for n in vein_nodes if indeg[n] == 0)
    seen = np.zeros(N, bool)
    order = []
    while True:
        while q:
            u = q.popleft()
            if seen[u]:
                continue
            seen[u] = True
            order.append(u)
            for v, _ in out[u]:
                indeg[v] -= 1
                if indeg[v] <= 0 and not seen[v]:
                    q.append(v)
        rest = [n for n in vein_nodes if not seen[n]]
        if not rest:
            break
        q.append(int(rest[0]))  # break a cycle
    D = p.venous_disp
    for u in order:
        if not out[u] or F[u] <= 0:
            continue
        rs = np.array([ix.rad[v] ** 3 for v, _ in out[u]])
        fr = rs / rs.sum()
        for (v, dt), f in zip(out[u], fr):
            m0 = M0[u] * f
            m1 = M1[u] * f
            m2 = M2[u] * f
            F[v] += F[u] * f
            M0[v] += m0
            M1[v] += m1 + m0 * dt
            M2[v] += m2 + 2 * m1 * dt + m0 * dt * dt + m0 * D * dt
    A = np.where(F > 0, M0 / np.maximum(F, 1e-12), 0.0)
    tau = np.where(M0 > 0, M1 / np.maximum(M0, 1e-12), 0.0)
    var = np.where(M0 > 0, M2 / np.maximum(M0, 1e-12) - tau ** 2, p.cap_sigma ** 2)
    return A, tau, np.maximum(var, 1e-4), F


# ----------------------------------------------------------------------------
# public result object
# ----------------------------------------------------------------------------
@dataclass
class Bolus:
    ix: NodeIndex
    A: np.ndarray
    tau: np.ndarray
    sigma: np.ndarray
    T: float
    t0: float
    k: float
    injection: Injection
    params: HemoParams
    tissue_pos: np.ndarray = field(default_factory=lambda: np.zeros((0, 3)))
    tissue_w: np.ndarray = field(default_factory=lambda: np.zeros(0))
    tissue_A: np.ndarray = field(default_factory=lambda: np.zeros(0))
    tissue_tau: np.ndarray = field(default_factory=lambda: np.zeros(0))
    tissue_sigma: np.ndarray = field(default_factory=lambda: np.zeros(0))
    venous_flow: np.ndarray = field(default_factory=lambda: np.zeros(0))

    @staticmethod
    def curve(t, A, tau, sigma, T, t0=0.0, k=3.0):
        """c(t) for arrays of (A, tau, sigma); t scalar or (nt,) -> (..., nt)."""
        t = np.atleast_1d(np.asarray(t, float))
        A = np.asarray(A, float)[..., None]
        tau = np.asarray(tau, float)[..., None]
        sg = np.maximum(np.asarray(sigma, float)[..., None], 1e-3)
        th = sg / math.sqrt(k)
        x = t - t0 - tau + k * th
        g1 = gammainc(k, np.clip(x, 0, None) / th)
        g2 = gammainc(k, np.clip(x - T, 0, None) / th)
        return A * (g1 - g2)

    def conc(self, t, nodes=None):
        """Lumen opacification (0..1) of nodes at time(s) t -> (n_nodes,) or (n_nodes, nt)."""
        sl = slice(None) if nodes is None else nodes
        c = self.curve(t, self.A[sl], self.tau[sl], self.sigma[sl], self.T, self.t0, self.k)
        return c[..., 0] if np.isscalar(t) else c

    def vessel_conc(self, vid, t):
        return self.conc(t, self.ix.vessel_slice(vid))

    def vessel_max_conc(self, t):
        """dict vessel_id -> max opacification over its points at time t."""
        c = self.conc(t)
        out = {}
        for vid in self.ix.vids:
            out[vid] = float(c[self.ix.vessel_slice(vid)].max())
        return out

    def tissue_conc(self, t):
        c = self.curve(t, self.tissue_A, self.tissue_tau, self.tissue_sigma, self.T, self.t0, self.k)
        return c[..., 0] if np.isscalar(t) else c

    def arrival(self, nodes=None):
        """Time of 50 % opacification rise per node (s), inf if never opacified."""
        sl = slice(None) if nodes is None else nodes
        sg = self.sigma[sl]
        t = self.t0 + self.tau[sl] - 0.3 * sg
        return np.where(self.A[sl] > self.params.min_amp, t, np.inf)

    def phase_times(self):
        """Rough (arterial, capillary, venous) peak times for reporting/QA."""
        art = ~self.ix.is_vein & (self.A > 0.1)
        vein = self.ix.is_vein & (self.A > 0.05)
        ta = float(np.median(self.tau[art])) + self.t0 + self.T / 2 if art.any() else float("nan")
        tc = float(np.median(self.tissue_tau)) + self.t0 + self.T / 2 if len(self.tissue_tau) else float("nan")
        tv = float(np.median(self.tau[vein])) + self.t0 + self.T / 2 if vein.any() else float("nan")
        return ta, tc, tv


def simulate(tree: VesselTree, injection="ICA_R", params: HemoParams | None = None, parenchyma=None,
             t0=0.0, **inj_over) -> Bolus:
    """Run the bolus model.  ``parenchyma``: a parenchyma.Parenchyma (optional; gives the
    capillary blush and tissue->vein drainage); otherwise arterial terminals act as tissue."""
    from scipy.spatial import cKDTree

    p = params or HemoParams()
    inj = resolve_injection(tree, injection, t0=t0, **inj_over)
    ix = NodeIndex(tree)
    adj = _arterial_edges(tree, ix, p)
    src = ix.node(inj.vessel, inj.index)
    A, tau = _propagate(adj, src, inj.amp, p.min_amp)
    A[ix.is_vein] = 0.0
    tau[ix.is_vein] = 0.0
    var = p.sigma0 ** 2 + p.disp_coeff * tau

    # --- tissue elements
    if parenchyma is not None and len(parenchyma.pos):
        tpos = parenchyma.pos
        tw = parenchyma.weight
        feed = parenchyma.feeding_nodes(ix)
    else:
        feed, tw = _terminal_elements(tree, ix)
        tpos = ix.pts[feed] if len(feed) else np.zeros((0, 3))
    if len(feed):
        tA = A[feed]
        ttau = tau[feed]
        tvar = var[feed]
    else:
        tA = ttau = tvar = np.zeros(0)

    # --- venous drainage
    vein_nodes = np.nonzero(ix.is_vein)[0]
    vA = np.zeros(ix.N)
    vtau = np.zeros(ix.N)
    vvar = np.full(ix.N, p.cap_sigma ** 2)
    vF = np.zeros(ix.N)
    if len(vein_nodes) and len(tpos):
        small = vein_nodes[ix.rad[vein_nodes] <= p.drain_vein_max_r]
        cand = small if len(small) >= 10 else vein_nodes
        kd = cKDTree(ix.pts[cand])
        dist, j = kd.query(tpos, k=1)
        far = dist > p.drain_max_mm
        if far.any():
            kd2 = cKDTree(ix.pts[vein_nodes])
            d2, j2 = kd2.query(tpos[far], k=1)
            dnode = cand[j]
            dnode[far] = vein_nodes[j2]
        else:
            dnode = cand[j]
        vA, vtau, vvar, vF = _venous_solve(tree, ix, p, dnode, tw, tA, ttau + p.cap_transit,
                                          tvar + p.cap_sigma ** 2)
    A = np.where(ix.is_vein, vA, A)
    tau = np.where(ix.is_vein, vtau, tau)
    var = np.where(ix.is_vein, vvar, var)
    b = Bolus(ix=ix, A=A, tau=tau, sigma=np.sqrt(var), T=inj.duration, t0=inj.t0, k=p.gamma_shape,
              injection=inj, params=p, tissue_pos=tpos, tissue_w=tw, tissue_A=tA,
              tissue_tau=ttau + p.blush_delay, tissue_sigma=np.sqrt(tvar + p.cap_sigma ** 2), venous_flow=vF)
    return b
