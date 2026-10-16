"""Convenience entry point:  python run.py run --injection ICA_R --views LAT,AP"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dsa_sim.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
