# ml/recommendation

Behavior simulator + dataset builder (plan `.planning/2026-09-29-09-recsys-behavior-dataset.md`)
and the train / evaluate / export steps (plan 10, see "Train & evaluate") for the personalized
ranker (AI 2 / PreferenceScore). Offline work, not a service.

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

Only code, `configs/` and `reports/` (dataset card, `preference_results.*`, `figures/`) are committed; everything under `data/` is git-ignored
(root `.gitignore`: `ml/**/data/`, `ml/**/*.parquet`).

## Train & evaluate (plan 10, PreferenceScore)

Plan `.planning/2026-09-29-10-preference-model-training.md`. Needs the dataset above
(`make all CATALOG_SOURCE=seed` first; `data/` is git-ignored). CPU only, about 4 minutes in total.

```bash
make train                          # ~3 min -> data/models/<name>/model.joblib + data/models/val_results.json
make evaluate                       # ~40 s  -> reports/preference_results.{md,csv,json} + reports/figures/*.png
make export RUN_NAME=v1-sim-20261110   # -> recommendation-service/models/preference/v1-sim-20261110-<algo>/
# real data (dataset built with `make dataset INTERACTIONS=data/real/interactions.parquet`):
make train evaluate DATASET_DIR=data/real/dataset
make export DATASET_DIR=data/real/dataset SOURCE=real RUN_NAME=v2-real-YYYYMMDD
```

| make target | module | output |
|---|---|---|
| `train` | `recsys.train` | `data/models/{lr,rf,xgb,xgbrank,<best binary>_ge1,<best binary>_ge3}/model.joblib` (+ `als/` when `implicit` is installed), `data/models/val_results.json` |
| `evaluate` | `recsys.evaluate` | `reports/preference_results.{md,csv,json}`, `reports/figures/{metrics_bar,reliability,feature_importance}.png` (committed) |
| `export` | `recsys.export` | `recommendation-service/models/preference/<run>-<algo>/{model.json or model.joblib, model_card.json}` |

Make variables: `DATASET_DIR` (default `$(SIM_DIR)/dataset`; `data/real/dataset` for real data),
`MODELS_DIR` (`data/models`), `TRAIN_SEED` (default 42: every estimator, the bootstrap and the
permutation importance; separate from the dataset `SEED`), `RUN_NAME` (`v<N>-<data>-<YYYYMMDD>`,
required by `export`), `SOURCE` (`simulated|real|mixed`, written to the model card).

- **Models:** baselines Popularity (`p_log_pop`) and Content-based (mean of `x_cos_shape`,
  `x_cos_material`, `x_color_affinity`, `x_brand_affinity`, `1 - min(x_price_abs_z, 3) / 3`); ALS
  only when `implicit` is installed (optional line in `requirements.txt`, otherwise skipped with a
  note, never exported). Logistic Regression, Random Forest, XGBoost binary (target `label >= 2`)
  and XGBoost ranker (`rank:ndcg`, graded labels, `qid = group_id`), small fixed grids, no early
  stopping. Ablation: the best binary family re-trained with `label >= 1` and `label >= 3`.
- **Selection (val only):** mean NDCG@10 inside the val groups (1 positive + 20 sampled
  negatives - a sampled metric, used only for tuning and choosing the best model). `train` reads
  only `train/val.parquet`; `evaluate` only loads the frozen models.
- **PreferenceScore:** sigmoid (Platt) of the raw score fitted on val, computed by
  `recommendation-service/app/ml/preference.py` (same code in training and serving). `a`, `b` and
  the raw score kind are stored in `val_results.json` and the model card (no calibrator file).
  The probabilities are relative to the 1:20 sampled negatives.
- **Test:** full ranking of each test user's `eval_candidates` block (no sampled metric), every
  test user, P/R/HitRate/NDCG @5 and @10 with 95% bootstrap CI (1000 user resamples), coverage@10,
  mean price of the top 10; a second table for users whose test label >= 2; the ablation table;
  Brier + reliability diagram; permutation importance of the best model on val. With one held-out
  product per user, Recall@K = HitRate@K and Precision@K = HitRate@K / K.
- **Export:** the best primary model (val NDCG@10), `model.json` (XGBoost native, load with
  `xgboost.Booster(model_file=...)`) or `model.joblib` (sklearn, `scikit-learn==1.9.1`,
  `joblib==1.6.0`), plus `model_card.json` (roadmap C1: calibration, params, val/test metrics,
  data summary, library versions, `uses_face_shape_features: false`). The script refuses an
  existing version folder and a model file >= 5 MB. Not loaded by the service until plan 11.
- **Reproducible:** the same `TRAIN_SEED` gives the same `reports/preference_results.csv` (within
  0.001; the optional ALS row excluded).

## Hybrid experiment (plan 12, PreferenceScore + FaceFit)

Plan `.planning/2026-09-29-12-facefit-hybrid-experiment.md`. Does recommendation + FaceFit beat
recommendation alone, for which users, and which `alpha` / `beta` / `PREFERENCE_NORM` should the
service use? Needs the simulated dataset (`data/sim/`), the exported model
`recommendation-service/models/preference/v1-sim-20261110-xgbrank/` and the AI-1 test
probabilities `ml/face-shape/reports/runs/v2-full-real-20261005/test_probabilities_svm.csv`
(`make test-probabilities` in `ml/face-shape`). Nothing is trained.

```bash
make experiment-hybrid    # -> reports/hybrid/{results_val.csv,results_test.csv,results.json,SUMMARY.md,figures/*.png}
```

| make target | module | output |
|---|---|---|
| `experiment-hybrid` | `recsys.experiment_hybrid` (+ `recsys.face_noise`) | `reports/hybrid/` (committed; `SUMMARY.md` is generated, never hand-edited) |

Make variables: `DATASET_DIR`, `SIM_DIR` (personas), `PREF_MODEL_DIR`, `FACE_PROBS`, `HYBRID_DIR`
(default `reports/hybrid`), `TRAIN_SEED` (noise draws + bootstrap, default 42),
`SERVICE_NORM` / `SERVICE_ALPHA` (`--service-norm` / `--service-alpha`, default `rank` / 0.6: the
service default chosen by product decision, reported in the "Mặc định của service" section and the
`service_default` block of `results.json` next to the val-selected config; must be on the alpha grid).

- **Scores:** `FinalScore = alpha * pref + (1 - alpha) * FaceFit` with the service code
  (`app.ml.hybrid.final_score`, `app.ml.face_fit.face_fit`). `pref` raw (`norm = none`) or
  rank-normalized per candidate list (`norm = rank`). alpha 0.0..1.0 step 0.1, plus 0.90..1.00
  step 0.01, 0.995, 0.999 for `none`; `facefit_filter` (FaceFit >= 0.5 first) and `popularity` rows.
- **Face scenarios:** `true` (persona shape), `noisy_soft` / `noisy_hard` (probabilities / argmax of
  a real AI-1 test image with the same true shape, 20 seeded draws per user, shared by every
  configuration and split).
- **Metrics / segments:** plan-10 P/R/HR/NDCG @5/@10 with 95% bootstrap CI, mean FaceFit@10 (true
  shape), frame-shape diversity@10, coverage@10; all users, gamma low/mid/high, true face shape.
- **Selection:** val only (sampled groups, `noisy_soft`, all users, NDCG@10; ties -> larger alpha,
  then `none`); test is reported once with the full alpha curves, plus a paired bootstrap of the
  per-user test NDCG@10 vs `pref_only` per scenario.
- **Reproducible:** the same `TRAIN_SEED` gives the same `results_*.csv`.

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
