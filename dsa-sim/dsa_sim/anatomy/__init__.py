"""Anatomy parts.  Each part is a module ``dsa_sim/anatomy/<part>.py`` exposing
``build(tree: VesselTree) -> None`` that adds its vessels to the shared tree.

Build order matters (later parts attach to vessels created by earlier ones):
    neck_eca  -> aortic arch, great vessels, subclavians, CCAs, cervical ICAs (to the
                 skull base), ECAs + branches (occipital, MMA, STA, ...)
    anterior  -> petrous/cavernous/supraclinoid ICA, OA, AChA, ACA, ACom, MCA
    posterior -> vertebral arteries (origin -> VB junction), PICA, AICA, SCA, basilar,
                 perforators, PCA, PComm collaterals, C1-occipital anastomosis
    venous    -> dural sinuses, deep and superficial veins, IJV
Missing parts are skipped (so each part can be developed and tested alone), but an
error *inside* an existing part is raised.
"""
from __future__ import annotations

import importlib
import time

from ..tree import VesselTree

PARTS = ("neck_eca", "anterior", "posterior", "venous")


def build_full_tree(parts=None, seed=0, verbose=True, validate=True) -> VesselTree:
    tree = VesselTree()
    tree.meta["seed"] = int(seed)
    built = []
    for part in (parts or PARTS):
        modname = f"{__name__}.{part}"
        try:
            mod = importlib.import_module(modname)
        except ModuleNotFoundError as e:
            if e.name == modname:
                if verbose:
                    print(f"[anatomy] part '{part}' not present - skipped")
                continue
            raise
        t0 = time.time()
        n0 = len(tree)
        import inspect
        if "seed" in inspect.signature(mod.build).parameters:
            mod.build(tree, seed=seed)
        else:
            mod.build(tree)
        built.append(part)
        if verbose:
            print(f"[anatomy] {part}: +{len(tree) - n0} vessels in {time.time() - t0:.1f}s")
    tree.meta["parts"] = built
    if validate:
        tree.validate(verbose=verbose)
    return tree
