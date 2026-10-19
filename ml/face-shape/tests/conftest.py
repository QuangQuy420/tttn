"""Same import paths as the Makefile (`PYTHONPATH=../../face-processing-service:src`)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for path in (ROOT / "src", ROOT.parents[1] / "face-processing-service"):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))
