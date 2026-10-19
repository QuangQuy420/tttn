# reports/ - face-shape dataset + model reports

Everything here is generated from the pipeline outputs (do not edit numbers by hand). Run from
`ml/face-shape/`. The sample smoke run writes the same files to `data/sample/reports/` instead.

## Dataset (plan 06, `make card`)

| file | content |
|---|---|
| `dataset_card.md` | final counts per class/split, DIAMOND shortfall, dedup / identity / face-filter stats, sources + licenses, limitations |
| `class_balance.png` | images per class and split |

## Models - experiment E1 (plan 07)

Protocol: identity-aware split from `processed/splits.csv` (no person is in two splits). Tuning and
ablation use only train+val with `StratifiedGroupKFold` by `person_id` (`training.cv_folds`, seed
`training.seed`), scoring macro-F1. The final models are refit on train and calibrated (sigmoid) on
val. The test split is read only by `make evaluate`, once per final method. The best model is the one
with the highest CV macro-F1, never chosen by test numbers.

| file | step | content |
|---|---|---|
| `tuning_<algo>.csv` | `make train` (tune) | every GridSearchCV candidate (`cv_results_`) sorted by rank - SVM, Random Forest, XGBoost |
| `tuning.json` | `make train` (tune) | best params + CV macro-F1 (mean, std) per algorithm; XGBoost says "chưa làm" when not installed |
| `calibration.json` | `make train` (calibrate) | Brier score (mean one-vs-rest) on val before/after sigmoid calibration (SVM has no "before": `probability=False`) |
| `calibration_<algo>.png` | `make train` (calibrate) | reliability diagram (top-label confidence vs accuracy) on val |
| `metrics_<method>.json` | `make evaluate` | test accuracy, macro/weighted F1, per-class precision/recall/F1/support, confusion matrix, CV macro-F1 and test Brier (trained models) |
| `classification_report_<method>.txt` | `make evaluate` | sklearn `classification_report` on test |
| `confusion_<method>.png` | `make evaluate` | test confusion matrix: counts + row-normalized (recall), labels in `config.yaml` `classes` order |
| `summary.md` | `make evaluate` | cross-method table (E1 main table), per-class F1, best model, DIAMOND small-sample note, Rule v1 prototypes |
| `summary.md` - predicted class counts | `make evaluate` (or `PYTHONPATH=../../face-processing-service:src .venv/bin/python -m faceshape.evaluation.evaluate --config config.yaml --data-dir data --out-dir reports --summary-only`, which rebuilds it from the saved `metrics_*.json` without a new test pass) | test predictions per class (confusion column sums); notes that the calibrated SVM never predicts DIAMOND (sigmoid calibration on val cancels `class_weight` balancing; the decision rule is deferred to plan 08) and that Rule v1 (literature) predicts DIAMOND for every image |
| `ablation.md` | `make ablation` | best algorithm: CV macro-F1 without roll alignment, without length/width ratios, jaw/chin angles or contour features, and with IPD scaling |

Methods (`<method>`): `rule_v0` = current production rule of face-processing-service (run on the same
normalized landmarks it sees in production); `rule_v1_literature` / `rule_v1_fitted` = nearest-prototype
rule with face-metrics prototypes / per-class train medians; `svm`, `rf`, `xgb` = calibrated trained models.

The exported best model (`make export`) goes to
`face-processing-service/models/face_shape/<version>/` (`model.joblib` + `model_card.json`).
