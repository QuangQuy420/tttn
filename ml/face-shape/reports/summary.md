# Face-shape classifiers - test results (E1)

Generated 2026-10-05 from `data` by `make evaluate`. Numbers come from the pipeline outputs; do not edit by hand.

Test set: 701 images, 94 persons, identity-disjoint from train/val (`processed/splits.csv`). Each method predicted the test set exactly once.

## Overall

| method | accuracy | macro precision | macro recall | macro F1 | weighted F1 | CV macro F1 | CV macro F1 (calibrated) | test Brier |
|---|---|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.194 | 0.082 | 0.182 | 0.111 | 0.124 | - | - | - |
| Rule v1 (literature) | 0.027 | 0.005 | 0.167 | 0.009 | 0.001 | - | - | - |
| Rule v1 (fitted) | 0.461 | 0.416 | 0.426 | 0.408 | 0.462 | - | - | - |
| SVM (RBF) **(best)** | 0.541 | 0.486 | 0.495 | 0.485 | 0.544 | 0.516 | 0.486 | 0.101 |
| Random Forest | 0.509 | 0.470 | 0.468 | 0.460 | 0.519 | 0.482 | 0.469 | 0.101 |
| XGBoost | 0.516 | 0.481 | 0.466 | 0.465 | 0.530 | 0.490 | 0.480 | 0.105 |

- Best model = highest CV macro-F1 of the calibrated pipeline (fit + calibrate) on train+val (5-fold StratifiedGroupKFold by person, seed 42): **SVM (RBF)** - the same model that is exported. Test numbers were not used to choose it.
- Trained models are the calibrated versions (fit on train, sigmoid calibration on val, sample_weight=balanced); test Brier = mean one-vs-rest Brier score on test. CV macro F1 = uncalibrated tuning score; CV macro F1 (calibrated) = person-grouped CV of the whole fit + calibrate pipeline (`calibration.json`). Rule methods have no CV score or probabilities.
- Rule v0 runs the production code on normalized MediaPipe coordinates (its aspect-ratio issue included); Rule v1 and the trained models use the corrected pixel-space features.

## F1 per class

| method | OVAL (n=135) | ROUND (n=136) | SQUARE (n=138) | HEART (n=141) | DIAMOND (n=19) | OBLONG (n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.368 | 0.269 | 0.000 | 0.000 | 0.031 | 0.000 |
| Rule v1 (literature) | 0.000 | 0.000 | 0.000 | 0.000 | 0.053 | 0.000 |
| Rule v1 (fitted) | 0.297 | 0.562 | 0.736 | 0.237 | 0.080 | 0.539 |
| SVM (RBF) | 0.325 | 0.536 | 0.768 | 0.372 | 0.121 | 0.790 |
| Random Forest | 0.273 | 0.620 | 0.779 | 0.283 | 0.098 | 0.705 |
| XGBoost | 0.302 | 0.580 | 0.756 | 0.355 | 0.067 | 0.729 |

- **DIAMOND has only 19 test images** (and few persons); its per-class numbers have a wide margin of error and should not be over-read.
- Landmark-feature models in the literature reach roughly 50-70% accuracy; numbers reported on the original niten19 split are inflated by duplicate and identity leakage, so this identity-aware test set is expected to score lower.

## Predicted class counts (test)

Column sums of each method's test confusion matrix (`metrics_<method>.json`).

| method | OVAL (true n=135) | ROUND (true n=136) | SQUARE (true n=138) | HEART (true n=141) | DIAMOND (true n=19) | OBLONG (true n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 235 | 354 | 0 | 0 | 111 | 1 |
| Rule v1 (literature) | 0 | 0 | 0 | 0 | 701 | 0 |
| Rule v1 (fitted) | 114 | 145 | 161 | 87 | 81 | 113 |
| SVM (RBF) | 136 | 129 | 133 | 112 | 47 | 144 |
| Random Forest | 121 | 161 | 111 | 113 | 63 | 132 |
| XGBoost | 110 | 164 | 116 | 118 | 70 | 123 |

- Calibration is fitted on val with balanced sample weights (weight per class = n / (k * n_c)), so the sigmoid keeps the class balancing of the models instead of re-learning val's real class frequencies (unweighted, as in v1, it cancelled `class_weight` and the calibrated SVM never predicted DIAMOND). The calibrated probabilities are therefore "balanced-prior": comparable across classes, not real-world class frequencies.
- Rule v1 (literature) predicts DIAMOND for 701 of 701 test images, because the literature prototype scales (e.g. forehead_cheek ~0.92) do not match our features (~0.72).

## v1 -> v2

v1 = the archived first test pass in `v1-fs-20260930/` (unweighted sigmoid calibration, selection by uncalibrated tuning CV, exported as fs-20260930-svm); v2 = this run.

| method | v1 macro F1 | v2 macro F1 | v1 DIAMOND F1 | v2 DIAMOND F1 | v1 DIAMOND predicted | v2 DIAMOND predicted | v1 test Brier | v2 test Brier |
|---|---|---|---|---|---|---|---|---|
| SVM (RBF) | 0.471 | 0.485 | 0.000 | 0.121 | 0 | 47 | 0.0960 | 0.1013 |
| Random Forest | 0.475 | 0.460 | 0.091 | 0.098 | 3 | 63 | 0.0978 | 0.1015 |
| XGBoost | 0.472 | 0.465 | 0.080 | 0.067 | 6 | 70 | 0.1006 | 0.1053 |

- This is the second test pass. v1 (fs-20260930-svm) was evaluated once on 2026-09-30; v2 changes only the calibration weights and the selection rule - a decision-rule defect, not tuning on test. Grids, features and splits are unchanged.

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
| DIAMOND | 1.213 | 0.739 | 0.786 | 0.405 | 139.670 |
| HEART | 1.193 | 0.735 | 0.781 | 0.401 | 140.153 |
| OBLONG | 1.272 | 0.713 | 0.798 | 0.403 | 138.388 |
| OVAL | 1.199 | 0.722 | 0.790 | 0.400 | 137.979 |
| ROUND | 1.145 | 0.712 | 0.799 | 0.395 | 134.742 |
| SQUARE | 1.158 | 0.712 | 0.818 | 0.394 | 131.810 |

Per-method details: `metrics_<method>.json`, `classification_report_<method>.txt`, `confusion_<method>.png`.
