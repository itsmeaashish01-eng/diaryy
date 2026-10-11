"""dsa_sim - simulated cerebral DSA from a CTA-space 3-D vessel model (educational).

Modules: frame (geometry + LANDMARKS), tree (VesselTree), hemo (contrast bolus),
parenchyma (capillary blush), render (C-arm projection, DSA, 3D-RA, labels),
io_utils (PNG/GIF/MP4), cli.  Anatomy parts live in dsa_sim.anatomy.
"""
__version__ = "0.1.0"

from . import frame  # noqa: F401
from .tree import Vessel, VesselTree  # noqa: F401
