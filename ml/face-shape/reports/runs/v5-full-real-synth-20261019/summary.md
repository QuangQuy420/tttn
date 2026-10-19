# Face-shape classifiers - test results (E1)

Generated 2026-10-19 from `data/datasets/full-real-synth` by `make evaluate` (summary regenerated from the saved `metrics_*.json`, no new test pass). Numbers come from the pipeline outputs; do not edit by hand.

Test set: 701 images, 94 persons, identity-disjoint from train/val (`processed/splits.csv`). Each method predicted the test set exactly once.

## Overall

| method | accuracy | macro precision | macro recall | macro F1 | weighted F1 | CV macro F1 | CV macro F1 (calibrated) | test Brier |
|---|---|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.194 | 0.082 | 0.182 | 0.111 | 0.124 | - | - | - |
| Rule v1 (literature) | 0.027 | 0.005 | 0.167 | 0.009 | 0.001 | - | - | - |
| Rule v1 (fitted) | 0.464 | 0.422 | 0.405 | 0.407 | 0.470 | - | - | - |
| SVM (RBF) | 0.525 | 0.472 | 0.505 | 0.478 | 0.521 | 0.611 | 0.584 | 0.104 |
| Random Forest | 0.511 | 0.464 | 0.469 | 0.458 | 0.514 | 0.599 | 0.580 | 0.101 |
| XGBoost **(best)** | 0.521 | 0.472 | 0.478 | 0.469 | 0.521 | 0.604 | 0.591 | 0.103 |

- Best model = highest CV macro-F1 of the calibrated pipeline (fit + calibrate) on train+val (5-fold StratifiedGroupKFold by person, seed 42): **XGBoost** - the same model that is exported. Test numbers were not used to choose it.
- Trained models are the calibrated versions (fit on train, sigmoid calibration on val, sample_weight=balanced); test Brier = mean one-vs-rest Brier score on test. CV macro F1 = uncalibrated tuning score; CV macro F1 (calibrated) = person-grouped CV of the whole fit + calibrate pipeline (`calibration.json`). Rule methods have no CV score or probabilities.
- Rule v0 runs the production code on normalized MediaPipe coordinates (its aspect-ratio issue included); Rule v1 and the trained models use the corrected pixel-space features.

## F1 per class

| method | OVAL (n=135) | ROUND (n=136) | SQUARE (n=138) | HEART (n=141) | DIAMOND (n=19) | OBLONG (n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.368 | 0.269 | 0.000 | 0.000 | 0.031 | 0.000 |
| Rule v1 (literature) | 0.000 | 0.000 | 0.000 | 0.000 | 0.053 | 0.000 |
| Rule v1 (fitted) | 0.297 | 0.589 | 0.751 | 0.246 | 0.026 | 0.533 |
| SVM (RBF) | 0.270 | 0.531 | 0.723 | 0.361 | 0.212 | 0.770 |
| Random Forest | 0.274 | 0.580 | 0.742 | 0.324 | 0.119 | 0.711 |
| XGBoost | 0.238 | 0.592 | 0.762 | 0.344 | 0.154 | 0.727 |

- **DIAMOND has only 19 test images** (and few persons); its per-class numbers have a wide margin of error and should not be over-read.
- Landmark-feature models in the literature reach roughly 50-70% accuracy; numbers reported on the original niten19 split are inflated by duplicate and identity leakage, so this identity-aware test set is expected to score lower.

## Predicted class counts (test)

Column sums of each method's test confusion matrix (`metrics_<method>.json`).

| method | OVAL (true n=135) | ROUND (true n=136) | SQUARE (true n=138) | HEART (true n=141) | DIAMOND (true n=19) | OBLONG (true n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 235 | 354 | 0 | 0 | 111 | 1 |
| Rule v1 (literature) | 0 | 0 | 0 | 0 | 701 | 0 |
| Rule v1 (fitted) | 121 | 180 | 131 | 119 | 57 | 93 |
| SVM (RBF) | 117 | 150 | 133 | 103 | 47 | 151 |
| Random Forest | 113 | 171 | 110 | 118 | 48 | 141 |
| XGBoost | 109 | 175 | 114 | 138 | 33 | 132 |

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
| DIAMOND | 1.236 | 0.731 | 0.782 | 0.409 | 139.339 |
| HEART | 1.203 | 0.735 | 0.781 | 0.404 | 140.139 |
| OBLONG | 1.276 | 0.717 | 0.796 | 0.407 | 138.312 |
| OVAL | 1.208 | 0.724 | 0.791 | 0.402 | 137.207 |
| ROUND | 1.154 | 0.710 | 0.803 | 0.395 | 133.836 |
| SQUARE | 1.172 | 0.712 | 0.822 | 0.397 | 131.401 |

Per-method details: `metrics_<method>.json`, `classification_report_<method>.txt`, `confusion_<method>.png`.
