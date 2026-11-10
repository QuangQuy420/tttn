"""Step `make simulate`: RecSim-style behavior simulator (plan 09, T3).

Synthetic users with a hidden persona browse the catalog for `days` days:
- persona: gender, face shape, price center/tolerance, Dirichlet tastes over frame shape /
  material / color / brand, face-fit sensitivity `gamma ~ Beta(1.2, 1.2)`, popularity bias,
  activity (sessions per day);
- utility `U(u,i) = w_shape*theta_shape + w_material*theta_material + w_color*mean(theta_color)
  + w_brand*theta_brand + w_face*gamma*M[face][shape] + w_price*price_fit + pop_bias*log(1+pop)
  +/- gender + Gumbel noise`, with `M = FACE_SHAPE_TO_FRAME_SHAPES / 10` (recommendation-service);
- Poisson sessions, each exposing `k` items (browse: softmax(U/T); homepage: popularity/random),
  views chosen ~ softmax(U/T) from the slate, then a strict funnel chain
  VIEW -> TRY_ON -> LIKE -> ADD_TO_CART -> PURCHASE with `P(step) = sigmoid(a + b*U)` (AC4);
- 5% of LIKEs that did not reach ADD_TO_CART are UNLIKEd later; <= 3 purchases per user, never
  the same product twice; taste drift for 20% of users at `days/2`; daily popularity feedback.

Outputs in `--out-dir` (default `data/sim/`): `interactions.parquet` (AC1), `personas.parquet`
(hidden truth, AC2 - never a feature input; `theta_shape_*` are the values before drift) and
`run_meta.json`. One `numpy.random.default_rng(seed)` drives everything and timestamps count from
the config `start_date`, so the same seed gives byte-identical parquet files (AC5).
The persona's face shape only generates behavior; `context` never carries `faceShape` (AC12).
"""
from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import yaml

from recsys.catalog import CATALOG_SOURCES, catalog_source_of, load_catalog
from recsys.common import PERSONAS_PARQUET, RUN_META_JSON, write_interactions, write_json, write_table

DAY_US = 86_400_000_000
SECOND_US = 1_000_000
VIEW, TRY_ON, LIKE, UNLIKE, ADD_TO_CART, PURCHASE = "VIEW", "TRY_ON", "LIKE", "UNLIKE", "ADD_TO_CART", "PURCHASE"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", type=Path, default=Path("configs/sim.yaml"))
    parser.add_argument("--seed", type=int, default=None, help="default: config `seed`")
    parser.add_argument("--users", type=int, default=None, help="default: config `users`")
    parser.add_argument("--days", type=int, default=None, help="default: config `days`")
    parser.add_argument("--out-dir", type=Path, default=Path("data/sim"))
    parser.add_argument("--catalog-url", default=None, help="default: config `catalog.url`")
    parser.add_argument("--catalog-source", choices=CATALOG_SOURCES, default="auto")
    parser.add_argument(
        "--publish", action="store_true", help="also publish the events to RabbitMQ (API catalog only)"
    )
    return parser


def _new_uuid(rng: np.random.Generator) -> str:
    return str(uuid.UUID(bytes=rng.bytes(16), version=4))


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + np.exp(-x))


def _softmax(values: np.ndarray, temperature: float) -> np.ndarray:
    z = values / temperature
    z = np.exp(z - z.max())
    return z / z.sum()


def _probs(table: dict[str, float], names: list[str], what: str) -> np.ndarray:
    if sorted(table) != sorted(names):
        raise ValueError(f"{what} must list exactly {names}, got {sorted(table)}")
    probs = np.array([float(table[name]) for name in names])
    return probs / probs.sum()


class Simulator:
    """One seeded simulation run over a normalized catalog (see `recsys.catalog`)."""

    def __init__(self, cfg: dict[str, Any], catalog, rng: np.random.Generator) -> None:
        from app.core.face_shape_mapping import FACE_SHAPE_TO_FRAME_SHAPES
        from app.ml.features import FRAME_SHAPES, MATERIAL_TYPES
        from app.schemas.recommend import FaceShape

        self.cfg = cfg
        self.rng = rng
        self.catalog = catalog
        self.n_items = len(catalog)
        self.product_ids = catalog["product_id"].tolist()
        self.frame_shapes = list(FRAME_SHAPES)
        self.face_shapes = [face.value for face in FaceShape]
        self.genders = ["MALE", "FEMALE"]

        # Face -> frame compatibility lookup, 6 x 8, scaled to 0..1 (roadmap C5).
        self.face_fit = np.zeros((len(self.face_shapes), len(self.frame_shapes)))
        for face, pairs in FACE_SHAPE_TO_FRAME_SHAPES.items():
            for frame, score in pairs:
                self.face_fit[self.face_shapes.index(face.value), self.frame_shapes.index(frame.value)] = score / 10.0

        # Item attributes; vocabularies in sorted order (never set order).
        self.brands = sorted(set(catalog["brand"]))
        self.colors = sorted({color for colors in catalog["colors"] for color in colors})
        self.item_shape = np.array([self.frame_shapes.index(s) for s in catalog["frame_shape"]])
        self.item_material = np.array(
            [MATERIAL_TYPES.index(m) if isinstance(m, str) else -1 for m in catalog["material_type"]]
        )
        self.item_brand = np.array([self.brands.index(b) for b in catalog["brand"]])
        self.item_gender = catalog["gender_target"].to_numpy()
        self.item_log_price = np.log(catalog["base_price"].to_numpy(dtype=float))
        # Row i = mean over the item's colors (all zero without variants -> color term 0).
        self.item_colors = np.zeros((self.n_items, len(self.colors)))
        for i, colors in enumerate(catalog["colors"]):
            for color in colors:
                self.item_colors[i, self.colors.index(color)] = 1.0 / len(colors)
        self.n_materials = len(MATERIAL_TYPES)

    # --- personas -------------------------------------------------------------------------

    def sample_personas(self, n_users: int) -> dict[str, np.ndarray]:
        rng, p = self.rng, self.cfg["persona"]
        n_shapes = len(self.frame_shapes)
        user_ids = np.array([_new_uuid(rng) for _ in range(n_users)])
        gender = rng.choice(len(self.genders), size=n_users, p=_probs(p["gender_probs"], self.genders, "gender_probs"))
        face = rng.choice(
            len(self.face_shapes), size=n_users, p=_probs(p["face_shape_probs"], self.face_shapes, "face_shape_probs")
        )
        log_mu, log_sigma = float(self.item_log_price.mean()), float(self.item_log_price.std())
        price_center = rng.lognormal(log_mu, max(log_sigma, 1e-6) * float(p["price_sigma_scale"]), size=n_users)
        price_tol = rng.uniform(*p["price_tol"], size=n_users)
        theta_shape = rng.dirichlet(np.full(n_shapes, float(p["alpha_shape"])), size=n_users)
        theta_material = rng.dirichlet(np.full(self.n_materials, float(p["alpha_material"])), size=n_users)
        theta_color = (
            rng.dirichlet(np.full(len(self.colors), float(p["alpha_color"])), size=n_users)
            if self.colors
            else np.zeros((n_users, 0))
        )
        theta_brand = rng.dirichlet(np.full(len(self.brands), float(p["alpha_brand"])), size=n_users)
        gamma = rng.beta(*p["gamma_beta"], size=n_users)
        pop_bias = rng.uniform(0.0, float(p["pop_bias_max"]), size=n_users)
        activity = rng.gamma(float(p["activity_shape"]), float(p["activity_scale"]), size=n_users)
        return {
            "user_id": user_ids,
            "gender": gender,
            "face": face,
            "price_center": price_center,
            "price_tol": price_tol,
            "theta_shape": theta_shape,
            "theta_material": theta_material,
            "theta_color": theta_color,
            "theta_brand": theta_brand,
            "gamma": gamma,
            "pop_bias": pop_bias,
            "activity": activity,
        }

    def base_utility(self, persona: dict[str, np.ndarray], theta_shape: np.ndarray) -> np.ndarray:
        """Users x items utility without the popularity term and the noise."""
        w = self.cfg["utility"]
        material_term = np.zeros((len(theta_shape), self.n_items))
        has_material = self.item_material >= 0
        material_term[:, has_material] = persona["theta_material"][:, self.item_material[has_material]]
        log_center = np.log(persona["price_center"])[:, None]
        tol = persona["price_tol"][:, None]
        price_fit = np.exp(-((self.item_log_price[None, :] - log_center) ** 2) / (2.0 * tol**2))
        user_gender = np.array(self.genders)[persona["gender"]][:, None]
        match = (self.item_gender[None, :] == "UNISEX") | (self.item_gender[None, :] == user_gender)
        gender_term = np.where(match, float(w["gender_match"]), -float(w["gender_mismatch_penalty"]))
        face_fit = self.face_fit[persona["face"]][:, self.item_shape]
        return (
            float(w["w_shape"]) * theta_shape[:, self.item_shape]
            + float(w["w_material"]) * material_term
            + float(w["w_color"]) * (persona["theta_color"] @ self.item_colors.T)
            + float(w["w_brand"]) * persona["theta_brand"][:, self.item_brand]
            + float(w["w_face"]) * persona["gamma"][:, None] * face_fit
            + float(w["w_price"]) * price_fit
            + gender_term
        )

    # --- behavior ---------------------------------------------------------------------------

    def run(self, n_users: int, days: int, start: datetime) -> tuple[dict[str, list[Any]], pa.Table, int]:
        rng, s, f, d = self.rng, self.cfg["session"], self.cfg["funnel"], self.cfg["drift"]
        persona = self.sample_personas(n_users)
        theta_shape = persona["theta_shape"].copy()
        drift_day = int(days * float(d["at_fraction"]))
        drifted = rng.random(n_users) < float(d["user_share"])
        theta_new = rng.dirichlet(np.full(len(self.frame_shapes), float(self.cfg["persona"]["alpha_shape"])), size=n_users)
        utility = self.base_utility(persona, theta_shape)

        # Poisson session arrivals per user over [0, days).
        horizon_us = days * DAY_US
        sessions: list[tuple[int, int]] = []
        for u in range(n_users):
            n_sessions = rng.poisson(persona["activity"][u] * days)
            for start_us in np.sort(rng.integers(0, horizon_us, size=n_sessions)):
                sessions.append((int(start_us), u))
        sessions.sort()

        start_us0 = int(start.timestamp()) * SECOND_US
        pop = np.zeros(self.n_items)
        pending_pop = np.zeros(self.n_items)
        current_day = 0
        drift_done = False
        liked: list[dict[int, int | None]] = [{} for _ in range(n_users)]  # item -> UNLIKE time (or None)
        purchased: list[set[int]] = [set() for _ in range(n_users)]
        events: list[tuple[int, str, int, int, str, str]] = []  # (t_us, event_id, user, item, type, context)
        k = min(int(s["k"]), self.n_items)
        temperature = float(s["t_browse"])
        noise = float(self.cfg["utility"]["noise_scale"])
        cap = int(f["max_purchases_per_user"])

        def emit(t_us: int, u: int, i: int, event_type: str, session_id: str) -> None:
            context: dict[str, Any] = {"sessionId": session_id}
            if event_type in (ADD_TO_CART, PURCHASE):
                context["quantity"] = 1
            events.append((t_us, _new_uuid(rng), u, i, event_type, json.dumps(context, sort_keys=True)))

        def gap(bounds: list[float]) -> int:
            return int(rng.uniform(*bounds) * SECOND_US)

        def step(name: str, value: float) -> bool:
            return rng.random() < _sigmoid(float(f[name]["a"]) + float(f[name]["b"]) * value)

        for session_start, u in sessions:
            day = session_start // DAY_US
            if day != current_day:
                pop += pending_pop  # daily popularity feedback (rich-get-richer)
                pending_pop[:] = 0.0
                current_day = day
            if not drift_done and day >= drift_day:
                theta_shape[drifted] = (1.0 - float(d["mix"])) * theta_shape[drifted] + float(d["mix"]) * theta_new[drifted]
                utility[drifted] = self.base_utility({key: v[drifted] for key, v in persona.items()}, theta_shape[drifted])
                drift_done = True

            u_session = utility[u] + persona["pop_bias"][u] * np.log1p(pop) + rng.gumbel(0.0, noise, size=self.n_items)
            if rng.random() < float(s["browse_share"]):
                slate = rng.choice(self.n_items, size=k, replace=False, p=_softmax(u_session, temperature))
            else:
                share = float(s["home_pop_share"])
                weights = share * (pop + 1.0) / (pop + 1.0).sum() + (1.0 - share) / self.n_items
                slate = rng.choice(self.n_items, size=k, replace=False, p=weights / weights.sum())
            n_views = min(k, 1 + int(rng.poisson(float(s["view_rate"]))))
            viewed = rng.choice(slate, size=n_views, replace=False, p=_softmax(u_session[slate], temperature))

            session_id = _new_uuid(rng)
            clock = start_us0 + session_start
            for i in (int(x) for x in viewed):
                value = float(u_session[i])
                emit(clock, u, i, VIEW, session_id)
                chain_t = clock
                if step("try_on", value):
                    chain_t += gap(s["step_gap_s"])
                    emit(chain_t, u, i, TRY_ON, session_id)
                    unlike_at = liked[u].get(i, -1)
                    already_liked = i in liked[u] and (unlike_at is None or unlike_at > chain_t)
                    if not already_liked and step("like", value):
                        chain_t += gap(s["step_gap_s"])
                        like_t = chain_t
                        emit(like_t, u, i, LIKE, session_id)
                        liked[u][i] = None
                        if step("add_to_cart", value):
                            chain_t += gap(s["step_gap_s"])
                            emit(chain_t, u, i, ADD_TO_CART, session_id)
                            if len(purchased[u]) < cap and i not in purchased[u] and step("purchase", value):
                                chain_t += gap(s["purchase_gap_s"])
                                emit(chain_t, u, i, PURCHASE, session_id)
                                purchased[u].add(i)
                                pending_pop[i] += 1.0
                        elif rng.random() < float(f["unlike_share"]):
                            unlike_t = like_t + int(rng.uniform(*f["unlike_delay_days"]) * DAY_US)
                            if unlike_t < start_us0 + horizon_us:
                                emit(unlike_t, u, i, UNLIKE, _new_uuid(rng))
                                liked[u][i] = unlike_t
                clock = chain_t + gap(s["view_gap_s"])

        events.sort(key=lambda e: (e[0], e[1]))
        columns = {
            "event_id": [e[1] for e in events],
            "user_id": [str(persona["user_id"][e[2]]) for e in events],
            "product_id": [self.product_ids[e[3]] for e in events],
            "event_type": [e[4] for e in events],
            "occurred_at": [e[0] for e in events],
            "source": ["simulator"] * len(events),
            "context": [e[5] for e in events],
        }
        return columns, self._personas_table(persona, drifted), len(events)

    def _personas_table(self, persona: dict[str, np.ndarray], drifted: np.ndarray) -> pa.Table:
        data: dict[str, pa.Array] = {
            "user_id": pa.array(persona["user_id"].tolist(), pa.string()),
            "gender": pa.array([self.genders[g] for g in persona["gender"]], pa.string()),
            "face_shape": pa.array([self.face_shapes[x] for x in persona["face"]], pa.string()),
            "price_center": pa.array(persona["price_center"], pa.float64()),
            "price_tol": pa.array(persona["price_tol"], pa.float64()),
        }
        for j, shape in enumerate(self.frame_shapes):
            data[f"theta_shape_{shape}"] = pa.array(persona["theta_shape"][:, j], pa.float64())
        data["gamma"] = pa.array(persona["gamma"], pa.float64())
        data["pop_bias"] = pa.array(persona["pop_bias"], pa.float64())
        data["activity"] = pa.array(persona["activity"], pa.float64())
        data["drifted"] = pa.array(drifted, pa.bool_())
        return pa.table(data)


def main() -> None:
    args = build_parser().parse_args()
    cfg = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    seed = int(cfg["seed"] if args.seed is None else args.seed)
    n_users = int(cfg["users"] if args.users is None else args.users)
    days = int(cfg["days"] if args.days is None else args.days)
    start = datetime.fromisoformat(str(cfg["start_date"])).astimezone(timezone.utc)

    catalog = load_catalog(args.catalog_source, args.catalog_url or cfg["catalog"]["url"])
    rng = np.random.default_rng(seed)
    columns, personas, n_events = Simulator(cfg, catalog, rng).run(n_users, days, start)

    out_dir: Path = args.out_dir
    interactions_path = out_dir / "interactions.parquet"
    write_interactions(columns, interactions_path)
    write_table(personas, out_dir / PERSONAS_PARQUET)
    source = catalog_source_of(catalog)
    write_json(
        {
            "catalog_source": source,
            "seed": seed,
            "users": n_users,
            "days": days,
            "start_date": start.isoformat(),
            "n_events": n_events,
        },
        out_dir / RUN_META_JSON,
    )

    counts = {t: columns["event_type"].count(t) for t in (VIEW, TRY_ON, LIKE, UNLIKE, ADD_TO_CART, PURCHASE)}
    gamma = personas.column("gamma").to_numpy()
    print(f"catalog: {len(catalog)} products ({source})")
    print(f"events: {n_events} ({n_events / max(1, n_users):.1f} per user) {counts}")
    print(f"gamma < 0.15: {np.mean(gamma < 0.15):.1%}, gamma > 0.85: {np.mean(gamma > 0.85):.1%}")
    print(f"wrote {interactions_path}, {out_dir / PERSONAS_PARQUET}, {out_dir / RUN_META_JSON}")

    if args.publish:
        from recsys.publish import publish_file

        publish_file(interactions_path)


if __name__ == "__main__":
    main()
