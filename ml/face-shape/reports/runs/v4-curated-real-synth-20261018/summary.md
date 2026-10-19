# Face-shape classifiers - test results (E1)

Generated 2026-10-19 from `data/datasets/curated-real-synth` by `make evaluate` (summary regenerated from the saved `metrics_*.json`, no new test pass). Numbers come from the pipeline outputs; do not edit by hand.

Test set: 701 images, 94 persons, identity-disjoint from train/val (`processed/splits.csv`). Each method predicted the test set exactly once.

## Overall

| method | accuracy | macro precision | macro recall | macro F1 | weighted F1 | CV macro F1 | CV macro F1 (calibrated) | test Brier |
|---|---|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.194 | 0.082 | 0.182 | 0.111 | 0.124 | - | - | - |
| Rule v1 (literature) | 0.027 | 0.005 | 0.167 | 0.009 | 0.001 | - | - | - |
| Rule v1 (fitted) | 0.412 | 0.405 | 0.362 | 0.364 | 0.416 | - | - | - |
| SVM (RBF) **(best)** | 0.525 | 0.476 | 0.511 | 0.476 | 0.524 | 0.650 | 0.654 | 0.102 |
| Random Forest | 0.509 | 0.454 | 0.454 | 0.445 | 0.508 | 0.620 | 0.618 | 0.103 |
| XGBoost | 0.509 | 0.465 | 0.468 | 0.454 | 0.510 | 0.618 | 0.614 | 0.107 |

- Best model = highest CV macro-F1 of the calibrated pipeline (fit + calibrate) on train+val (5-fold StratifiedGroupKFold by person, seed 42): **SVM (RBF)** - the same model that is exported. Test numbers were not used to choose it.
- Trained models are the calibrated versions (fit on train, sigmoid calibration on val, sample_weight=balanced); test Brier = mean one-vs-rest Brier score on test. CV macro F1 = uncalibrated tuning score; CV macro F1 (calibrated) = person-grouped CV of the whole fit + calibrate pipeline (`calibration.json`). Rule methods have no CV score or probabilities.
- Rule v0 runs the production code on normalized MediaPipe coordinates (its aspect-ratio issue included); Rule v1 and the trained models use the corrected pixel-space features.

## F1 per class

| method | OVAL (n=135) | ROUND (n=136) | SQUARE (n=138) | HEART (n=141) | DIAMOND (n=19) | OBLONG (n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.368 | 0.269 | 0.000 | 0.000 | 0.031 | 0.000 |
| Rule v1 (literature) | 0.000 | 0.000 | 0.000 | 0.000 | 0.053 | 0.000 |
| Rule v1 (fitted) | 0.297 | 0.533 | 0.482 | 0.265 | 0.041 | 0.565 |
| SVM (RBF) | 0.232 | 0.613 | 0.742 | 0.361 | 0.180 | 0.727 |
| Random Forest | 0.292 | 0.637 | 0.738 | 0.251 | 0.056 | 0.693 |
| XGBoost | 0.260 | 0.608 | 0.724 | 0.336 | 0.114 | 0.685 |

- **DIAMOND has only 19 test images** (and few persons); its per-class numbers have a wide margin of error and should not be over-read.
- Landmark-feature models in the literature reach roughly 50-70% accuracy; numbers reported on the original niten19 split are inflated by duplicate and identity leakage, so this identity-aware test set is expected to score lower.

## Predicted class counts (test)

Column sums of each method's test confusion matrix (`metrics_<method>.json`).

| method | OVAL (true n=135) | ROUND (true n=136) | SQUARE (true n=138) | HEART (true n=141) | DIAMOND (true n=19) | OBLONG (true n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 235 | 354 | 0 | 0 | 111 | 1 |
| Rule v1 (literature) | 0 | 0 | 0 | 0 | 701 | 0 |
| Rule v1 (fitted) | 134 | 232 | 82 | 146 | 30 | 77 |
| SVM (RBF) | 89 | 164 | 129 | 114 | 70 | 135 |
| Random Forest | 105 | 184 | 106 | 106 | 52 | 148 |
| XGBoost | 88 | 193 | 108 | 133 | 51 | 128 |

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
| DIAMOND | 1.239 | 0.731 | 0.781 | 0.409 | 139.278 |
| HEART | 1.220 | 0.734 | 0.781 | 0.406 | 139.901 |
| OBLONG | 1.280 | 0.722 | 0.794 | 0.412 | 138.290 |
| OVAL | 1.218 | 0.726 | 0.792 | 0.404 | 136.706 |
| ROUND | 1.165 | 0.711 | 0.808 | 0.394 | 132.500 |
| SQUARE | 1.198 | 0.713 | 0.826 | 0.401 | 131.438 |

Per-method details: `metrics_<method>.json`, `classification_report_<method>.txt`, `confusion_<method>.png`.
