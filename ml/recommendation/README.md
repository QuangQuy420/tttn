# ml/recommendation

Behavior simulator + dataset builder for the personalized ranker (AI 2 / PreferenceScore,
plan `.planning/2026-09-29-09-recsys-behavior-dataset.md`). Offline work, not a service.

The feature code is **not** in this folder: the scripts import
`recommendation-service/app/ml/features.py` (`FEATURE_SCHEMA_VERSION = "rec-v1"`, 63 features), so
training and serving (plan 11) compute the same vector. The Makefile sets
`PYTHONPATH=../../recommendation-service:src`.

## Setup (Python 3.11 venv)

```bash
cd ml/recommendation
uv venv -p 3.11 .venv
uv pip install -p .venv/bin/python -r requirements.txt
```

The Makefile uses `.venv/bin/python` when it exists (override with `make all PYTHON=...`).

## Run

```bash
make all                       # simulate (2000 users, 90 days) -> dataset -> reports/dataset_card.{md,json}
make all CATALOG_SOURCE=seed   # same, offline, with the seed catalog (no stack needed)
# smoke run, nothing outside data/:
make all USERS=50 DAYS=10 SIM_SEED=1 CATALOG_SOURCE=seed SIM_DIR=data/smoke CARD_DIR=data/smoke/reports
```

The default run takes about one minute on a laptop (seed catalog: ~44k events, ~22 per user).

| make target | module | output |
|---|---|---|
| `simulate` | `recsys.simulate` | `data/sim/{interactions.parquet, personas.parquet, run_meta.json}` |
| `publish` | `recsys.publish` | events on RabbitMQ `behavior-events` -> `recommendation_db.interactions` |
| `export-real` | `recsys.export_real` | `data/real/interactions.parquet` |
| `dataset` | `recsys.build_dataset` | `data/sim/dataset/{train,val,test,eval_candidates}.parquet`, `dataset_meta.json` + the card |
| `card` | `recsys.dataset_card` | `reports/dataset_card.{md,json}` (committed; `CARD_DIR=` changes the folder) |

Every step is also `python -m recsys.<module> --help`. Make variables: `CONFIG`, `SIM_DIR`,
`INTERACTIONS`, `CATALOG_SOURCE` (`auto|api|seed`), `SEED` (negative sampling, default 42),
`SIM_SEED` / `USERS` / `DAYS` (default: `configs/sim.yaml`), `CARD_DIR`, `REAL_OUT`, `EXCLUDE_SOURCE`.
To build a dataset from real data: `make dataset INTERACTIONS=data/real/interactions.parquet`
(output in `data/real/dataset/`; the card shows the gamma section as "n/a").

Only code, `configs/` and `reports/` are committed; everything under `data/` is git-ignored
(root `.gitignore`: `ml/**/data/`, `ml/**/*.parquet`).

## Catalog

`--catalog-source auto` (default) reads `GET http://localhost:8080/api/products` through the gateway
(paged, `limit=100`) and falls back to `infra/seed/products.json` only on a connection error, with
a warning. Seed products have no ids, so their `product_id = uuid5(NAMESPACE_URL, "tttn-product:" + sku)`:
such a run is **offline only** - `publish` refuses it and its dataset cannot be mixed with real
exported interactions. `build_dataset` reuses the `catalog_source` recorded in `run_meta.json`.

## Simulator (`configs/sim.yaml`)

Each synthetic user has a hidden persona (`personas.parquet`, never a feature input): gender, face
shape, price center/tolerance, Dirichlet tastes over frame shape / material / color / brand,
face-fit sensitivity `gamma ~ Beta(1.2, 1.2)`, popularity bias, activity. Utility mixes those
tastes with `gamma * FACE_SHAPE_TO_FRAME_SHAPES / 10` (recommendation-service), price fit,
popularity and gender; sessions expose 12 items and views follow `softmax(U)`; the funnel
VIEW -> TRY_ON -> LIKE -> ADD_TO_CART -> PURCHASE is a strict chain with `sigmoid(a + b*U)` steps.
5% of LIKEs that did not reach the cart are UNLIKEd later, <= 3 purchases per user, 20% of users
drift their frame-shape taste at day `days/2` (`theta_shape_*` in `personas.parquet` are the
values before drift), popularity is updated daily from purchases. Users with no session in the
window have a persona but no event. The same `--seed` gives byte-identical parquet files.
The persona's face shape only drives behavior: `context` holds only `sessionId` (+ `quantity`).

## Dataset

Labels per roadmap C4 (VIEW 1, TRY_ON/LIKE 2, ADD_TO_CART 3, PURCHASE 4, negative 0; UNLIKE
cancels the earlier LIKE), temporal leave-last-out per user (>= 3 positives: last -> test,
second-last -> val), 20 negatives per positive (10 uniform + 10 popularity-weighted, never a
product the user touched), features only from events before the row's `ts`. Columns:
`user_id, product_id, group_id, label, ts, <63 features>`, rows ordered by `group_id` (one positive
+ its negatives = one ranking group). `eval_candidates.parquet` lists, per test user, every catalog
product except their train/val positives, for full-ranking evaluation (plan 10).

## Running against the stack (`publish`, `export-real`)

Start the stack from `infra/` (`docker compose up -d`; recommendation-service must be running so
its queue exists). Host ports from `infra/docker-compose.yml`: gateway `8080`
(`API_GATEWAY_PORT`), Postgres `5432`, RabbitMQ `5672`.

| env var | used by | default / example |
|---|---|---|
| catalog URL (`--catalog-url`, `configs/sim.yaml` `catalog.url`) | `simulate`, `build_dataset` | `http://localhost:8080/api/products` |
| `RABBITMQ_URL` | `publish` | `amqp://guest:guest@localhost:5672/` |
| `RECSYS_DB_URL` | `export-real` | `postgresql+psycopg://app:app@localhost:5432/recommendation_db` (user/password from `infra/.env`) |

```bash
make simulate CATALOG_SOURCE=api           # real product ids
make publish                               # or: python -m recsys.simulate ... --publish
RECSYS_DB_URL=postgresql+psycopg://app:app@localhost:5432/recommendation_db make export-real EXCLUDE_SOURCE=simulator
```

`publish` sends each row to exchange `behavior-events` (routing key `behavior.<eventType lowercase>`,
`source=simulator`, AMQP `message_id = eventId`, publisher confirms + `mandatory`, `--rate` events
per second, default 500). It refuses a file whose `run_meta.json` is missing or says
`catalog_source: seed`.

**Check AC7** (the events reached `recommendation_db`): compare the published count with

```bash
cd infra && docker compose exec postgres psql -U app -d recommendation_db \
  -c "SELECT count(*) FROM interactions WHERE source='simulator'"
```

This is valid on a database with no earlier simulator rows; otherwise look up a few `event_id`s
from the file (`... WHERE event_id IN ('<id>', ...)`). The consumer de-duplicates by `event_id`,
so publishing the same seeded file twice stores it once - the count only grows on the first
publish.

**Check AC6**: `export-real` writes the same columns and types as the simulator
(`event_id, user_id, product_id, event_type, occurred_at (timestamp[us, UTC]), source, context (JSON string)`),
so `make dataset INTERACTIONS=data/real/interactions.parquet` runs on it unchanged.
