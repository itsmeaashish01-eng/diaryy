"""Command line / Python entry points.

    python -m dsa_sim.cli demo                      # engine demo -> output/engine_demo
    python -m dsa_sim.cli run --injection ICA_R --views LAT,AP --frames 30
    python -m dsa_sim.cli tree --json output/tree.json
    python -m dsa_sim.cli landmarks                 # markdown table of LANDMARKS
"""
from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np

from . import hemo
from . import io_utils as IO
from . import render as R

PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_ROOT = os.path.join(PKG_ROOT, "output")

DISCLAIMER = "Educational simulation - not for diagnostic use"


def pick_phase_times(rr: R.RunRenderer, times):
    """(arterial, capillary, venous) representative frame times from the bolus."""
    b = rr.bolus
    best_t = times[0]
    lab = [v.id for v in rr.tree if v.labeled and v.system == "artery"]
    counts = []
    for t in times:
        op = b.vessel_max_conc(t)
        counts.append(sum(op.get(v, 0) > 0.3 for v in lab))
    counts = np.array(counts)
    if counts.max() > 0:
        ok = np.nonzero(counts >= 0.9 * counts.max())[0]
        best_t = times[ok[len(ok) // 2]]
    ta, tc, tv = b.phase_times()
    tc = tc if np.isfinite(tc) else best_t + 1.5
    tv = tv if np.isfinite(tv) else best_t + 3.0
    snap = lambda x: float(times[int(np.argmin(np.abs(np.asarray(times) - x)))])  # noqa: E731
    return snap(best_t), snap(tc), snap(tv)


def render_run(tree, injection="ICA_R", views=("LAT", "AP"), out_dir=None, n_frames=30, t_end=9.0, fps=4,
               size=768, labels=True, gif=True, mp4=True, ra_frames=24, ra_size=448, parenchyma=True,
               display=None, params=None, prefix=None, label_threshold=0.25, verbose=True, gif_every=2):
    """Simulate one injection and write cine runs + key frames + 3D-RA for each view.

    Returns a dict with paths and timings.  Usable from Python by anatomy agents.
    """
    from .parenchyma import Parenchyma
    out_dir = out_dir or os.path.join(OUTPUT_ROOT, "runs", str(injection))
    os.makedirs(out_dir, exist_ok=True)
    prefix = prefix or str(injection)
    info = {"injection": str(injection), "files": [], "timing": {}}
    t0 = time.time()
    par = Parenchyma.build() if parenchyma else None
    bolus = hemo.simulate(tree, injection, params=params, parenchyma=par)
    info["timing"]["hemo_s"] = round(time.time() - t0, 2)
    info["catheter"] = [bolus.injection.vessel, bolus.injection.index]
    times = R.default_times(n_frames, t_end)
    for vname in views:
        view = R.get_view(vname, size=size)
        t1 = time.time()
        rr = R.RunRenderer(tree, bolus, view, parenchyma=par, display=display)
        tb = time.time() - t1
        t1 = time.time()
        frames = rr.frames(times)
        tf = (time.time() - t1) / len(times)
        info["timing"][f"{vname}_build_s"] = round(tb, 2)
        info["timing"][f"{vname}_per_frame_s"] = round(tf, 3)
        base = os.path.join(out_dir, f"{prefix}_{vname}")
        stamp = [f"t = {t:4.1f} s" for t in times]
        if mp4:
            info["files"].append(IO.save_mp4(frames, base + "_cine.mp4", fps=fps))
        if labels:
            lab_frames = []
            for t, fr, st in zip(times, frames, stamp):
                op = rr.vessel_opacity(t)
                lab_frames.append(R.label_overlay(fr, tree, view, opacity=op, threshold=label_threshold,
                                                  title=f"{injection} injection, {vname} - {st}",
                                                  footnote=DISCLAIMER))
            if mp4:
                info["files"].append(IO.save_mp4(lab_frames, base + "_cine_labeled.mp4", fps=fps))
            if gif:
                info["files"].append(IO.save_gif(lab_frames[::gif_every], base + "_cine_labeled.gif", fps=fps / gif_every,
                                                 scale=0.5, colors=64))
        elif gif:
            info["files"].append(IO.save_gif(frames[::gif_every], base + "_cine.gif", fps=fps / gif_every, scale=0.5,
                                             colors=64))
        for ph, t in zip(("arterial", "capillary", "venous"), pick_phase_times(rr, times)):
            fr = rr.frame(t)
            info["files"].append(IO.save_png(fr, base + f"_{ph}.png"))
            if labels:
                im = R.label_overlay(fr, tree, view, opacity=rr.vessel_opacity(t), threshold=label_threshold,
                                     title=f"{injection} injection, {vname}, {ph} phase (t = {t:.1f} s)",
                                     footnote=DISCLAIMER)
                p = base + f"_{ph}_labeled.png"
                im.save(p, optimize=True)
                info["files"].append(p)
    if ra_frames:
        t1 = time.time()
        segs = R.segments_from_tree(tree, bolus.ix)
        spin = []
        for ang in np.linspace(0, 360, ra_frames, endpoint=False):
            v = R.rotational_view(90 + ang, size=ra_size)
            spin.append(R.render_3dra(tree, v, bolus=bolus, segs=segs))
        info["timing"]["3dra_per_frame_s"] = round((time.time() - t1) / ra_frames, 3)
        info["files"].append(IO.save_gif(spin, os.path.join(out_dir, f"{prefix}_3dra_spin.gif"), fps=8))
        for vname in views:
            view = R.get_view(vname, size=size)
            img = R.render_3dra(tree, view, bolus=bolus, segs=segs)
            amp = {vid: float(bolus.A[bolus.ix.vessel_slice(vid)].max()) for vid in bolus.ix.vids
                   if tree[vid].system == "artery"}
            im = R.label_overlay(img, tree, view, opacity=amp, threshold=0.15, dark=True,
                                 title=f"3D rotational angiogram ({injection}), {vname}", footnote=DISCLAIMER)
            p = os.path.join(out_dir, f"{prefix}_3dra_{vname}_labeled.png")
            im.save(p, optimize=True)
            info["files"].append(p)
    info["timing"]["total_s"] = round(time.time() - t0, 1)
    with open(os.path.join(out_dir, f"{prefix}_info.json"), "w") as f:
        json.dump(info, f, indent=1)
    if verbose:
        print(json.dumps(info["timing"]))
    return info


# ----------------------------------------------------------------------------

def _cmd_demo(a):
    from .demo import run_engine_demo
    run_engine_demo(os.path.join(OUTPUT_ROOT, "engine_demo"))


def _cmd_run(a):
    if a.tree:
        from .tree import VesselTree
        tree = VesselTree.from_json(a.tree)
    else:
        from .anatomy import build_full_tree
        tree = build_full_tree(seed=a.seed)
    views = [v.strip() for v in a.views.split(",") if v.strip()]
    for inj in a.injection.split(","):
        render_run(tree, inj.strip(), views, out_dir=a.out and os.path.join(a.out, inj.strip()),
                   n_frames=a.frames, t_end=a.t_end, fps=a.fps, size=a.size, labels=not a.no_labels,
                   gif=not a.no_gif, mp4=not a.no_mp4, ra_frames=a.ra_frames, parenchyma=not a.no_parenchyma)


def _cmd_tree(a):
    from .anatomy import build_full_tree
    tree = build_full_tree(seed=a.seed)
    print(json.dumps(tree.summary(), indent=1))
    if a.json:
        IO.ensure_dir(a.json)
        tree.to_json(a.json, decimals=a.decimals)
        print("wrote", a.json, f"{os.path.getsize(a.json) / 1e6:.1f} MB")


def _cmd_landmarks(a):
    from . import frame as F
    print("| name | x | y | z | meaning |\n|---|---:|---:|---:|---|")
    for k, v in F.LANDMARKS.items():
        print(f"| `{k}` | {v[0]:.1f} | {v[1]:.1f} | {v[2]:.1f} | {F.LANDMARK_INFO.get(k, '')} |")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="dsa_sim", description="Simulated cerebral DSA (educational)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("demo", help="engine demo (crude tree) -> output/engine_demo")
    r = sub.add_parser("run", help="simulate injections on the full anatomy")
    r.add_argument("--injection", default="ICA_R", help="comma list of presets: " + ",".join(hemo.INJECTIONS))
    r.add_argument("--views", default="LAT,AP")
    r.add_argument("--frames", type=int, default=30)
    r.add_argument("--t-end", type=float, default=9.0)
    r.add_argument("--fps", type=float, default=4)
    r.add_argument("--size", type=int, default=768)
    r.add_argument("--ra-frames", type=int, default=24)
    r.add_argument("--seed", type=int, default=0)
    r.add_argument("--tree", default=None, help="load a tree JSON instead of building the anatomy")
    r.add_argument("--out", default=None)
    r.add_argument("--no-labels", action="store_true")
    r.add_argument("--no-gif", action="store_true")
    r.add_argument("--no-mp4", action="store_true")
    r.add_argument("--no-parenchyma", action="store_true")
    t = sub.add_parser("tree", help="build the full anatomy and export JSON")
    t.add_argument("--json", default=os.path.join(OUTPUT_ROOT, "tree.json"))
    t.add_argument("--decimals", type=int, default=1)
    t.add_argument("--seed", type=int, default=0)
    sub.add_parser("landmarks", help="print the landmark table (markdown)")
    a = ap.parse_args(argv)
    {"demo": _cmd_demo, "run": _cmd_run, "tree": _cmd_tree, "landmarks": _cmd_landmarks}[a.cmd](a)


if __name__ == "__main__":
    main()
