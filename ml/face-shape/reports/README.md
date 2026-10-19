# reports/ - face-shape dataset + model reports

Everything here is generated from the pipeline outputs (do not edit numbers by hand). Run from
`ml/face-shape/`. The sample smoke run writes the same files to `data/runs/sample/reports/` instead.

```
reports/
  README.md        <- this index
  dataset/         <- dataset card (`make card`)
  runs/<run>/      <- one folder per training run (`make train evaluate ablation [export] RUN_NAME=<run>`)
  comparisons/<YYYYMMDD>-<topic>/   <- read-only comparisons across runs (saved test metrics only)
```

The local data (git-ignored, plan 2026-10-19) lives in `ml/face-shape/data/`:

```
data/
  inputs/raw/          downloaded images (`make download`)
  inputs/curated/      filtered real + generated images (plan 2026-10-18)
  datasets/<name>/     one dataset = interim/ + processed/ (`--data-dir`, Makefile `DATA=`)
  runs/<run>/models/   calibrated models of one run (`--models-dir`, Makefile `MODELS=`; default from `RUN_NAME`)
  runs/sample/         scratch outputs of the sample runs (reports/, models/, export/)
  logs/
```

## Run names

Every training run is named `v<N>-<data>-<YYYYMMDD>` (lowercase, max 60 characters): `N` counts up,
`<data>` says what the model was trained on (`full-real`, `curated-real`, `curated-real-synth`,
`full-real-synth`, ...), the date is the training day. The same name is used for the reports
(`reports/runs/<run>/`), the local models of the run (`data/runs/<run>/models/`)
and the exported model (`<run>-<algo>`, e.g. `v2-full-real-20261005-svm`).

`make train`, `calibrate`, `evaluate`, `ablation` and `export` fail without `RUN_NAME=` (or an explicit
`REPORTS=` folder; then `train`, `calibrate`, `evaluate` and `export` also need `MODELS=`); `export` always
needs `RUN_NAME`. Example: `make train evaluate ablation export RUN_NAME=v6-full-real-20261101` (trains on
`DATA=data/datasets/full-real` by default). The Python modules need `--out-dir` (`calibrate`/`export` need
`--models-dir`, `evaluate` too unless `--summary-only`; `export` needs `--run-name`).

| run | dataset (`data/datasets/`) | train data | date | best model | test macro-F1 | exported model id | deployed |
|---|---|---|---|---|---|---|---|
| [`v1-full-real-20260930`](runs/v1-full-real-20260930/summary.md) | `full-real` | every real image of the train split (3,521), unweighted calibration | 2026-09-30 | SVM (RBF) | 0.471 | `v1-full-real-20260930-svm` | no (kept for rollback) |
| [`v2-full-real-20261005`](runs/v2-full-real-20261005/summary.md) | `full-real` | same images as v1, balanced calibration | 2026-10-05 | SVM (RBF) | 0.485 | `v2-full-real-20261005-svm` | **yes** |
| [`v3-curated-real-20261018`](runs/v3-curated-real-20261018/summary.md) | `curated-real` | curated real train images (1,158) | 2026-10-18 | SVM (RBF) | 0.480 | - | no |
| [`v4-curated-real-synth-20261018`](runs/v4-curated-real-synth-20261018/summary.md) | `curated-real-synth` | curated real (1,158) + synthetic (1,022) | 2026-10-18 | SVM (RBF) | 0.476 | - | no |
| [`v5-full-real-synth-20261019`](runs/v5-full-real-synth-20261019/summary.md) | `full-real-synth` | every real train image (3,521) + synthetic (1,022) | 2026-10-19 | XGBoost | 0.469 | - | no |

All runs are scored on the same old test split (701 real images). Best model = highest CV macro-F1
(`training.selection`), never chosen by test numbers. Test macro-F1 comes from `metrics_<best>.json`
of each run (= `test_macro_f1` in the exported `model_card.json`).

Notes:
- `runs/v1-full-real-20260930/` keeps the reports of the first test pass unchanged (its `README.md` is
  the old copy of this file); its dataset card is `dataset/` (see its `ARCHIVE.md`).
- Each run keeps its models in `data/runs/<run>/models/` (v2 = the deployed model's run; the v1 models
  were overwritten by v2 before the layout change), so a new run never overwrites another run's models.
- The `ablation.md` of every run still says "Generated ... from" its old local data root (`data` for
  v1/v2, `data/v2/<exp>` for v3-v5) - the layout before plan 2026-10-19; it can only be rebuilt by
  re-running `make ablation`. The `summary.md` of v2-v5 was rebuilt with `--summary-only` and names the
  new dataset (`data/datasets/<name>`).

## Dataset (plan 06, `make card` -> `dataset/`)

| file | content |
|---|---|
| `dataset/dataset_card.md` | final counts per class/split, DIAMOND shortfall, dedup / identity / face-filter stats, sources + licenses, limitations |
| `dataset/class_balance.png` | images per class and split |

`CARD_DIR=` changes the folder (`make sample` writes the card to `data/runs/sample/reports/`).

## Files of a run (`runs/<run>/`) - experiment E1 (plan 07)

Protocol: identity-aware split from `processed/splits.csv` (no person is in two splits). Tuning and
ablation use only train+val with `StratifiedGroupKFold` by `person_id` (`training.cv_folds`, seed
`training.seed`), scoring macro-F1. The final models are refit on train and calibrated (sigmoid) on
val. The test split is read only by `make evaluate`, once per final method. The best model is the one
with the highest CV macro-F1, never chosen by test numbers.

Calibration fix (plan 2026-10-05, `config.yaml` `training`):
- `calibration_weight: balanced` fits the sigmoid on val with balanced sample weights (n / (k * n_c)
  per class). Unweighted (`null`, v1) the sigmoid re-learns val's real class frequencies (DIAMOND ~3%),
  which cancels `class_weight` - the v1 calibrated SVM never predicted DIAMOND on test. With balanced
  weights the probabilities are "balanced-prior" (comparable across classes, not real-world frequencies).
- `selection: calibrated_cv` picks the final model by the person-grouped CV macro-F1 of the whole
  "fit + calibrate" pipeline (`cv_macro_f1_calibrated` in `calibration.json`), i.e. the model that is
  exported; `tuning_cv` = v1 rule (uncalibrated tuning CV). Evaluate, ablation and export use the same rule.
- `make calibrate` re-runs only the calibration step (keeps `tuning.json`).
- `runs/v1-full-real-20260930/` keeps the reports of the first test pass unchanged; the `summary.md`
  of v2 compares v1 and v2 (`--v1-dir reports/runs/v1-full-real-20260930`) and states that v2 is the second test pass.

| file | step | content |
|---|---|---|
| `tuning_<algo>.csv` | `make train` (tune) | every GridSearchCV candidate (`cv_results_`) sorted by rank - SVM, Random Forest, XGBoost |
| `tuning.json` | `make train` (tune) | best params + CV macro-F1 (mean, std) per algorithm; XGBoost says "chưa làm" when not installed |
| `calibration.json` | `make train` / `make calibrate` | `sample_weight` of the calibration; Brier score (mean one-vs-rest) on val before/after sigmoid calibration (SVM has no "before": `probability=False`); per algorithm `cv_macro_f1_calibrated` (+ `_std`) = grouped CV macro-F1 of fit + calibrate on train+val, and `cv_diamond_predicted` = DIAMOND predictions over the held-out folds |
| `calibration_<algo>.png` | `make train` (calibrate) | reliability diagram (top-label confidence vs accuracy) on val |
| `metrics_<method>.json` | `make evaluate` | test accuracy, macro/weighted F1, per-class precision/recall/F1/support, confusion matrix, CV macro-F1 and test Brier (trained models) |
| `classification_report_<method>.txt` | `make evaluate` | sklearn `classification_report` on test |
| `confusion_<method>.png` | `make evaluate` | test confusion matrix: counts + row-normalized (recall), labels in `config.yaml` `classes` order |
| `summary.md` | `make evaluate` | cross-method table (E1 main table, uncalibrated + calibrated CV macro-F1), per-class F1, best model, DIAMOND small-sample note, v1 -> v2 table (only with `--v1-dir`, i.e. the v2 run), Rule v1 prototypes |
| `summary.md` - predicted class counts | `make evaluate` (or `PYTHONPATH=../../face-processing-service:src .venv/bin/python -m faceshape.evaluation.evaluate --config config.yaml --data-dir data/datasets/full-real --out-dir reports/runs/v2-full-real-20261005 --summary-only --v1-dir reports/runs/v1-full-real-20260930`, which rebuilds it from the saved `metrics_*.json` without a new test pass and needs no `--models-dir`; for v3-v5 use `--data-dir data/datasets/<dataset> --out-dir reports/runs/<run>` and no `--v1-dir`) | test predictions per class (confusion column sums); warns when a calibrated model never predicts DIAMOND, explains the balanced calibration (which fixes the v1 SVM's 0 DIAMOND predictions) and notes that Rule v1 (literature) predicts DIAMOND for every image |
| `ablation.md` | `make ablation` | selected algorithm (`training.selection`): CV macro-F1 without roll alignment, without length/width ratios, jaw/chin angles or contour features, and with IPD scaling |

Methods (`<method>`): `rule_v0` = current production rule of face-processing-service (run on the same
normalized landmarks it sees in production); `rule_v1_literature` / `rule_v1_fitted` = nearest-prototype
rule with face-metrics prototypes / per-class train medians; `svm`, `rf`, `xgb` = calibrated trained models.

## v3-v5 - curated dataset (plan 2026-10-18, `make curated`)

Experiments on the curated dataset in `data/inputs/curated/` (1,605 selected real images + 1,022 synthetic
portraits). `make curated` runs `curated-synth` (identity/landmarks/features of the synthetic images
in `data/datasets/synth/`; no near-duplicate dedup, only an exact-duplicate check), `curated-data`,
`curated-train` (train + evaluate + ablation per run) and `curated-compare`. The datasets go to
`data/datasets/{curated-real,curated-real-synth,full-real-synth}/` and the models to
`data/runs/<run>/models/`; `data/datasets/full-real/`, the v1/v2 reports and the deployed model are not
changed, and nothing is exported.

Protocol: val and test are the old real-only val/test splits (701 / 701 images, same `person_id`s);
real features are copied from `data/datasets/full-real/processed/features.parquet`, not recomputed. Synthetic images
are train only (`person_id` prefixed `syn-`). No person is in two splits.

| path | content |
|---|---|
| `runs/v3-curated-real-20261018/` | train = curated real images of the old train split (1,158) - same files as E1 (`tuning*`, `calibration*`, `metrics_*`, `confusion_*`, `summary.md`, `ablation.md`) |
| `runs/v4-curated-real-synth-20261018/` | train = those 1,158 + every synthetic image that passed the landmark filters - same files |
| `runs/v5-full-real-synth-20261019/` | train = every real image of the old train split (3,521) + every synthetic image - same files |
| `comparisons/20261019-curated-vs-current/compare.md` | deployed v2 vs v3 vs v4 vs v5 (best model of each run): macro-F1, accuracy, per-class F1, DIAMOND predicted, test Brier, images per class x split x origin (real / synthetic), caveats (repeated test pass, DIAMOND n=19, CV of v4/v5 also scores synthetic images, synthetic dedup) |
| `comparisons/20261019-curated-vs-current/compare_f1.png` | grouped bars: test F1 per class + macro-F1, one bar per model |

The `summary.md` of each curated run (v3-v5) keeps the stock "predicted exactly once" wording;
`compare.md` states that these runs are a repeated pass on the same test split.

The exported best model (`make export RUN_NAME=<run>`) goes to
`face-processing-service/models/face_shape/<run>-<algo>/` (`model.joblib` + `model_card.json`).
