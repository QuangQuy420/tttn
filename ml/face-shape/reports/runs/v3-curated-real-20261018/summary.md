# Face-shape classifiers - test results (E1)

Generated 2026-10-19 from `data/datasets/curated-real` by `make evaluate` (summary regenerated from the saved `metrics_*.json`, no new test pass). Numbers come from the pipeline outputs; do not edit by hand.

Test set: 701 images, 94 persons, identity-disjoint from train/val (`processed/splits.csv`). Each method predicted the test set exactly once.

## Overall

| method | accuracy | macro precision | macro recall | macro F1 | weighted F1 | CV macro F1 | CV macro F1 (calibrated) | test Brier |
|---|---|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.194 | 0.082 | 0.182 | 0.111 | 0.124 | - | - | - |
| Rule v1 (literature) | 0.027 | 0.005 | 0.167 | 0.009 | 0.001 | - | - | - |
| Rule v1 (fitted) | 0.462 | 0.422 | 0.450 | 0.414 | 0.461 | - | - | - |
| SVM (RBF) **(best)** | 0.553 | 0.475 | 0.491 | 0.480 | 0.546 | 0.531 | 0.495 | 0.102 |
| Random Forest | 0.524 | 0.480 | 0.465 | 0.466 | 0.535 | 0.500 | 0.484 | 0.102 |
| XGBoost | 0.518 | 0.453 | 0.460 | 0.452 | 0.514 | 0.472 | 0.478 | 0.107 |

- Best model = highest CV macro-F1 of the calibrated pipeline (fit + calibrate) on train+val (5-fold StratifiedGroupKFold by person, seed 42): **SVM (RBF)** - the same model that is exported. Test numbers were not used to choose it.
- Trained models are the calibrated versions (fit on train, sigmoid calibration on val, sample_weight=balanced); test Brier = mean one-vs-rest Brier score on test. CV macro F1 = uncalibrated tuning score; CV macro F1 (calibrated) = person-grouped CV of the whole fit + calibrate pipeline (`calibration.json`). Rule methods have no CV score or probabilities.
- Rule v0 runs the production code on normalized MediaPipe coordinates (its aspect-ratio issue included); Rule v1 and the trained models use the corrected pixel-space features.

## F1 per class

| method | OVAL (n=135) | ROUND (n=136) | SQUARE (n=138) | HEART (n=141) | DIAMOND (n=19) | OBLONG (n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.368 | 0.269 | 0.000 | 0.000 | 0.031 | 0.000 |
| Rule v1 (literature) | 0.000 | 0.000 | 0.000 | 0.000 | 0.053 | 0.000 |
| Rule v1 (fitted) | 0.275 | 0.568 | 0.728 | 0.243 | 0.128 | 0.541 |
| SVM (RBF) | 0.264 | 0.646 | 0.773 | 0.322 | 0.073 | 0.803 |
| Random Forest | 0.333 | 0.647 | 0.781 | 0.305 | 0.047 | 0.682 |
| XGBoost | 0.279 | 0.605 | 0.733 | 0.305 | 0.068 | 0.720 |

- **DIAMOND has only 19 test images** (and few persons); its per-class numbers have a wide margin of error and should not be over-read.
- Landmark-feature models in the literature reach roughly 50-70% accuracy; numbers reported on the original niten19 split are inflated by duplicate and identity leakage, so this identity-aware test set is expected to score lower.

## Predicted class counts (test)

Column sums of each method's test confusion matrix (`metrics_<method>.json`).

| method | OVAL (true n=135) | ROUND (true n=136) | SQUARE (true n=138) | HEART (true n=141) | DIAMOND (true n=19) | OBLONG (true n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 235 | 354 | 0 | 0 | 111 | 1 |
| Rule v1 (literature) | 0 | 0 | 0 | 0 | 701 | 0 |
| Rule v1 (fitted) | 105 | 149 | 164 | 81 | 90 | 112 |
| SVM (RBF) | 107 | 152 | 139 | 120 | 36 | 147 |
| Random Forest | 111 | 167 | 118 | 115 | 67 | 123 |
| XGBoost | 94 | 175 | 132 | 128 | 40 | 132 |

- Calibration is fitted on val with balanced sample weights (weight per class = n / (k * n_c)), so the sigmoid keeps the class balancing of the models instead of re-learning val's real class frequencies (unweighted, as in v1, it cancelled `class_weight` and the calibrated SVM never predicted DIAMOND). The calibrated probabilities are therefore "balanced-prior": comparable across classes, not real-world class frequencies.
- Rule v1 (literature) predicts DIAMOND for 701 of 701 test images, because the literature prototype scales (e.g. forehead_cheek ~0.92) do not match our features (~0.72).

## Rule v1 prototypes

Literature prototypes (face-metrics, MIT) - defined on other landmarks, so their scale can differ from these features (compare with the fitted medians below):

| class | lw_ratio | forehead_cheek | jaw_cheek | chin_jaw | jaw_angle_mean |
|---|---|---|---|---|---|
| OVAL | 1.450 | 0.920 | 0.850 | 0.500 | 125.000 |
| ROUND | 1.250 | 0.900 | 0.950 | 0.620 | 135.000 |
| SQUARE | 1.300 | 0.950 | 1.000 | 0.700 | 115.000 |
| OBLONG | 1.650 | 0.920 | 0.900 | 0.550 | 125.000 |
| HEART | 1.400 | 1.020 | 0.780 | 0.360 | 125.000 |
| DIAMOND | 1.450 | 0.800 | 0.800 | 0.400 | 125.000 |

Fitted prototypes - per-class medians of the train split:

| class | lw_ratio | forehead_cheek | jaw_cheek | chin_jaw | jaw_angle_mean |
|---|---|---|---|---|---|
| DIAMOND | 1.216 | 0.740 | 0.785 | 0.403 | 139.383 |
| HEART | 1.189 | 0.734 | 0.784 | 0.396 | 139.772 |
| OBLONG | 1.271 | 0.716 | 0.796 | 0.402 | 138.434 |
| OVAL | 1.204 | 0.726 | 0.790 | 0.399 | 138.232 |
| ROUND | 1.144 | 0.715 | 0.800 | 0.395 | 134.717 |
| SQUARE | 1.166 | 0.715 | 0.817 | 0.395 | 132.148 |

Per-method details: `metrics_<method>.json`, `classification_report_<method>.txt`, `confusion_<method>.png`.
