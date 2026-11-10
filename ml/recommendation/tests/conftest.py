"""Same import paths as the Makefile (`PYTHONPATH=../../recommendation-service:src`).

`smoke_run` = one tiny offline pipeline run shared by the whole session (plan 09 Testing notes):
`simulate --seed 1 --catalog-source seed` twice into two folders (AC5) + `build_dataset` on the
first, everything under pytest's tmp dir (never `data/` or `reports/`).
100 users / 30 days instead of 50 / 10: at 50 / 10 the funnel tail is 1-3 events and seed 3 gives
ADD_TO_CART == PURCHASE, so AC4's strict order is not stable; 100 / 30 kept it strict on seeds 1-10.
"""
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT.parents[1] / "recommendation-service"
for path in (ROOT / "src", SERVICE):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

USERS, DAYS, SIM_SEED = 100, 30, 1


def _run(module: str, *args: str) -> None:
    env = {**os.environ, "PYTHONPATH": f"{SERVICE}{os.pathsep}{ROOT / 'src'}"}
    result = subprocess.run(
        [sys.executable, "-m", module, *args], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, f"{module} failed:\n{result.stdout}\n{result.stderr}"


def _simulate(out_dir: Path) -> None:
    _run(
        "recsys.simulate",
        "--config", str(ROOT / "configs" / "sim.yaml"),
        "--users", str(USERS),
        "--days", str(DAYS),
        "--seed", str(SIM_SEED),
        "--catalog-source", "seed",
        "--out-dir", str(out_dir),
    )


@pytest.fixture(scope="session")
def smoke_run(tmp_path_factory: pytest.TempPathFactory) -> SimpleNamespace:
    base = tmp_path_factory.mktemp("recsys")
    sim, sim_again, card = base / "sim", base / "sim_again", base / "card"
    _simulate(sim)
    _simulate(sim_again)
    _run(
        "recsys.build_dataset",
        "--interactions", str(sim / "interactions.parquet"),
        "--catalog-source", "seed",
        "--card-dir", str(card),
        "--seed", "42",
    )
    return SimpleNamespace(sim=sim, sim_again=sim_again, dataset=sim / "dataset", card=card)
