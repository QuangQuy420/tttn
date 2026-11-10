"""Plan 2026-09-29-09 (behavior simulator + dataset builder): main flow on one tiny seeded run.

AC6 (`export_real`) and real publishing (AC7 end to end) need Postgres / RabbitMQ: not covered here.
"""
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pytest

import app.ml.features as F
from app.schemas.recommend import FrameShape
from recsys.build_dataset import positives_and_touched
from recsys.catalog import load_catalog, to_products

FUNNEL = ["VIEW", "TRY_ON", "LIKE", "ADD_TO_CART", "PURCHASE"]
META_COLUMNS = ["user_id", "product_id", "group_id", "label", "ts"]
SPLITS = ("train", "val", "test")


def _interactions(run) -> pd.DataFrame:
    return pq.read_table(run.sim / "interactions.parquet").to_pandas()


def _split(run, name: str) -> pd.DataFrame:
    return pq.read_table(run.dataset / f"{name}.parquet").to_pandas()


def _all_rows(run) -> pd.DataFrame:
    return pd.concat([_split(run, name).assign(split=name) for name in SPLITS], ignore_index=True)


def _sha256(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_interactions_have_the_c3_columns_and_simulator_source(smoke_run):
    """AC1 (+ AC12: simulated context never carries faceShape)."""
    df = _interactions(smoke_run)
    assert list(df.columns) == ["event_id", "user_id", "product_id", "event_type", "occurred_at", "source", "context"]
    assert len(df) > 0
    assert set(df["event_type"]) <= {"VIEW", "TRY_ON", "LIKE", "UNLIKE", "ADD_TO_CART", "PURCHASE"}
    assert set(df["source"]) == {"simulator"}
    assert df["event_id"].is_unique
    assert not any("faceShape" in json.loads(ctx) for ctx in df["context"])


def test_personas_hold_the_hidden_truth_columns(smoke_run):
    """AC2."""
    personas = pq.read_table(smoke_run.sim / "personas.parquet").to_pandas()
    expected = ["user_id", "gender", "face_shape", "price_center", "price_tol"]
    expected += [f"theta_shape_{shape.value}" for shape in FrameShape]
    expected += ["gamma", "pop_bias", "activity", "drifted"]
    assert sorted(personas.columns) == sorted(expected)
    assert len(personas) == 100
    assert set(personas["gender"]) <= {"MALE", "FEMALE"}


def test_same_seed_gives_identical_files(smoke_run):
    """AC5."""
    for name in ("interactions.parquet", "personas.parquet", "run_meta.json"):
        assert _sha256(smoke_run.sim / name) == _sha256(smoke_run.sim_again / name), name


def test_funnel_counts_strictly_decrease(smoke_run):
    """AC4 (100 users / 30 days, see conftest)."""
    counts = _interactions(smoke_run)["event_type"].value_counts()
    funnel = [int(counts.get(t, 0)) for t in FUNNEL]
    assert all(a > b for a, b in zip(funnel, funnel[1:])), dict(zip(FUNNEL, funnel))


def test_labels_follow_c4_and_unlike_cancels_like():
    """AC8: builder's label step on a hand-made log (VIEW=1, TRY_ON/LIKE=2, ADD_TO_CART=3, PURCHASE=4)."""
    t0 = datetime(2026, 6, 1, tzinfo=timezone.utc)

    def ev(product: str, event_type: str, minutes: int) -> F.Event:
        return F.Event(user_id="u1", product_id=product, event_type=event_type, occurred_at=t0 + timedelta(minutes=minutes))

    log = [
        ev("a", "VIEW", 0), ev("a", "LIKE", 1), ev("a", "UNLIKE", 2),  # LIKE cancelled -> VIEW label 1
        ev("b", "LIKE", 3), ev("b", "UNLIKE", 4),  # nothing left -> no row, still touched
        ev("c", "VIEW", 5), ev("c", "TRY_ON", 6), ev("c", "ADD_TO_CART", 7), ev("c", "PURCHASE", 8),
        ev("d", "VIEW", 9), ev("d", "LIKE", 10),
        ev("e", "TRY_ON", 11),
    ]
    positives, touched = positives_and_touched(log, F.EVENT_LABELS, F.apply_unlike_cancellation)

    assert positives == {
        ("u1", "a"): (t0, 1),
        ("u1", "c"): (t0 + timedelta(minutes=5), 4),
        ("u1", "d"): (t0 + timedelta(minutes=9), 2),
        ("u1", "e"): (t0 + timedelta(minutes=11), 2),
    }
    assert touched["u1"] == {"a", "b", "c", "d", "e"}


def test_each_group_has_one_positive_and_untouched_negatives(smoke_run):
    """AC9."""
    rows = _all_rows(smoke_run)
    n_catalog = json.loads((smoke_run.dataset / "dataset_meta.json").read_text())["n_catalog_products"]
    history = _interactions(smoke_run).groupby("user_id")["product_id"].apply(set).to_dict()

    for _, group in rows.groupby("group_id"):
        user = group["user_id"].iloc[0]
        assert (group["user_id"] == user).all() and group["ts"].nunique() == 1
        positives, negatives = group[group["label"] > 0], group[group["label"] == 0]
        assert len(positives) == 1
        assert len(negatives) == min(20, n_catalog - len(history[user]))
        assert negatives["product_id"].is_unique
        assert not set(negatives["product_id"]) & history[user]


def test_temporal_leave_last_out_split(smoke_run):
    """AC10."""
    positives = _all_rows(smoke_run).query("label > 0")
    assert positives.groupby(["user_id", "product_id"]).size().max() == 1
    checked = 0
    for user, rows in positives.groupby("user_id"):
        by_split = {name: rows[rows["split"] == name] for name in SPLITS}
        if len(rows) < 3:
            assert set(rows["split"]) == {"train"}, user
            continue
        assert len(by_split["test"]) == 1 and len(by_split["val"]) == 1, user
        test_ts, val_ts = by_split["test"]["ts"].iloc[0], by_split["val"]["ts"].iloc[0]
        assert test_ts >= val_ts >= by_split["train"]["ts"].max(), user
        checked += 1
    assert checked > 0


def test_stored_features_use_only_events_before_ts(smoke_run):
    """AC11: recompute a few groups' features by brute force from events with occurred_at < ts."""
    df = _interactions(smoke_run)
    events = [
        F.Event(user_id=u, product_id=p, event_type=t, occurred_at=ts.to_pydatetime())
        for u, p, t, ts in zip(df["user_id"], df["product_id"], df["event_type"], df["occurred_at"])
    ]
    catalog = to_products(load_catalog("seed"))
    edges = F.price_band_edges(catalog)
    names = F.feature_names()

    test = _split(smoke_run, "test")
    train = _split(smoke_run, "train")
    group_ids = sorted(test["group_id"].unique())
    sample = pd.concat(
        [
            test[test["group_id"].isin([group_ids[0], group_ids[-1]])],
            train[train["group_id"] == train["group_id"].max()],
        ]
    )
    assert len(sample) > 0
    for row in sample.itertuples(index=False):
        ts = row.ts.to_pydatetime()
        before = [e for e in events if e.occurred_at < ts]
        stats = F.ProductStats()
        for event in before:
            stats.add(event)
        profile = F.build_user_profile([e for e in before if e.user_id == row.user_id], catalog, ts)
        product = catalog[row.product_id]
        product_features = F.build_product_features(product, stats.snapshot(row.product_id, ts), edges, ts)
        expected, _ = F.vectorize(profile, product_features, F.build_cross_features(profile, product))
        stored = np.array([getattr(row, name) for name in names], dtype=np.float32)
        np.testing.assert_allclose(stored, expected.astype(np.float32), rtol=1e-5, atol=1e-6)


def test_feature_columns_match_schema_without_face(smoke_run):
    """AC12."""
    names = F.feature_names()
    assert len(names) == 63
    for name in (*SPLITS, "eval_candidates"):
        columns = pq.read_schema(smoke_run.dataset / f"{name}.parquet").names
        assert columns[:5] == META_COLUMNS
        assert columns[5:] == names
        assert not [c for c in columns if "face" in c.lower()]


def test_dataset_card_reports_the_required_stats(smoke_run):
    """AC13 + AC3 (gamma shares) + AC4 (funnel ratios in the card)."""
    card = json.loads((smoke_run.card / "dataset_card.json").read_text())
    assert (smoke_run.card / "dataset_card.md").is_file()
    df = _interactions(smoke_run)
    stats = card["interactions_stats"]
    n_catalog = card["dataset_meta"]["n_catalog_products"]

    assert card["feature_schema_version"] == F.FEATURE_SCHEMA_VERSION == "rec-v1"
    assert stats["n_users"] == df["user_id"].nunique()
    assert n_catalog == len(load_catalog("seed"))
    expected_by_type = {t: int((df["event_type"] == t).sum()) for t in (*FUNNEL, "UNLIKE")}
    assert {t: stats["events_by_type"][t] for t in expected_by_type} == expected_by_type
    n_pairs = len(df[["user_id", "product_id"]].drop_duplicates())
    assert stats["sparsity"] == pytest.approx(1 - n_pairs / (df["user_id"].nunique() * n_catalog), abs=1e-4)
    assert set(stats["funnel"]["step_ratio"]) == {f"{b}/{a}" for a, b in zip(FUNNEL, FUNNEL[1:])}

    personas = pq.read_table(smoke_run.sim / "personas.parquet").to_pandas()
    gamma = card["personas"]
    assert gamma["gamma_share_below_0_15"] == pytest.approx(float(np.mean(personas["gamma"] < 0.15)), abs=1e-4)
    assert gamma["gamma_share_above_0_85"] == pytest.approx(float(np.mean(personas["gamma"] > 0.85)), abs=1e-4)
    assert sum(b["count"] for b in gamma["gamma_histogram"]) == len(personas)


def test_publish_refuses_a_seed_catalog_run(smoke_run, monkeypatch, capsys):
    """AC7 (offline part): seed product ids are uuid5(sku), so publishing must stop before any broker call."""
    import pika

    from recsys.publish import publish_file

    def no_broker(*args, **kwargs):
        raise AssertionError("publish must refuse before connecting to RabbitMQ")

    monkeypatch.setattr(pika, "BlockingConnection", no_broker)
    with pytest.raises(SystemExit) as exc:
        publish_file(smoke_run.sim / "interactions.parquet")
    assert exc.value.code == 1
    assert "seed" in capsys.readouterr().err
