# Face-shape classifiers - test results (E1)

Generated 2026-09-30 from `data` by `make evaluate` (summary regenerated from the saved `metrics_*.json`, no new test pass). Numbers come from the pipeline outputs; do not edit by hand.

Test set: 701 images, 94 persons, identity-disjoint from train/val (`processed/splits.csv`). Each method predicted the test set exactly once.

## Overall

| method | accuracy | macro precision | macro recall | macro F1 | weighted F1 | CV macro F1 | test Brier |
|---|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.194 | 0.082 | 0.182 | 0.111 | 0.124 | - | - |
| Rule v1 (literature) | 0.027 | 0.005 | 0.167 | 0.009 | 0.001 | - | - |
| Rule v1 (fitted) | 0.461 | 0.416 | 0.426 | 0.408 | 0.462 | - | - |
| SVM (RBF) **(best)** | 0.556 | 0.465 | 0.478 | 0.471 | 0.549 | 0.516 | 0.096 |
| Random Forest | 0.535 | 0.520 | 0.467 | 0.475 | 0.538 | 0.482 | 0.098 |
| XGBoost | 0.536 | 0.489 | 0.468 | 0.472 | 0.537 | 0.490 | 0.101 |

- Best model = highest CV macro-F1 on train+val (5-fold StratifiedGroupKFold by person, seed 42): **SVM (RBF)**. Test numbers were not used to choose it.
- Trained models are the calibrated versions (fit on train, sigmoid calibration on val); test Brier = mean one-vs-rest Brier score on test. Rule methods have no CV score or probabilities.
- Rule v0 runs the production code on normalized MediaPipe coordinates (its aspect-ratio issue included); Rule v1 and the trained models use the corrected pixel-space features.

## F1 per class

| method | OVAL (n=135) | ROUND (n=136) | SQUARE (n=138) | HEART (n=141) | DIAMOND (n=19) | OBLONG (n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 0.368 | 0.269 | 0.000 | 0.000 | 0.031 | 0.000 |
| Rule v1 (literature) | 0.000 | 0.000 | 0.000 | 0.000 | 0.053 | 0.000 |
| Rule v1 (fitted) | 0.297 | 0.562 | 0.736 | 0.237 | 0.080 | 0.539 |
| SVM (RBF) | 0.345 | 0.537 | 0.762 | 0.390 | 0.000 | 0.794 |
| Random Forest | 0.302 | 0.615 | 0.787 | 0.359 | 0.091 | 0.695 |
| XGBoost | 0.309 | 0.562 | 0.755 | 0.400 | 0.080 | 0.728 |

- **DIAMOND has only 19 test images** (and few persons); its per-class numbers have a wide margin of error and should not be over-read.
- Landmark-feature models in the literature reach roughly 50-70% accuracy; numbers reported on the original niten19 split are inflated by duplicate and identity leakage, so this identity-aware test set is expected to score lower.

## Predicted class counts (test)

Column sums of each method's test confusion matrix (`metrics_<method>.json`).

| method | OVAL (true n=135) | ROUND (true n=136) | SQUARE (true n=138) | HEART (true n=141) | DIAMOND (true n=19) | OBLONG (true n=132) |
|---|---|---|---|---|---|---|
| Rule v0 (production) | 235 | 354 | 0 | 0 | 111 | 1 |
| Rule v1 (literature) | 0 | 0 | 0 | 0 | 701 | 0 |
| Rule v1 (fitted) | 114 | 145 | 161 | 87 | 81 | 113 |
| SVM (RBF) | 149 | 136 | 135 | 136 | 0 | 145 |
| Random Forest | 156 | 150 | 116 | 149 | 3 | 127 |
| XGBoost | 137 | 156 | 119 | 154 | 6 | 129 |

- **SVM (RBF) (calibrated) never predicts DIAMOND on test.** Sigmoid calibration is fitted on val with its real class frequencies, which cancels the `class_weight` balancing of the model; the model was chosen by uncalibrated CV macro-F1, but the deployed decision is the argmax of the calibrated probabilities. The decision rule (e.g. prior correction) is deferred to plan 08.
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
| DIAMOND | 1.213 | 0.739 | 0.786 | 0.405 | 139.670 |
| HEART | 1.193 | 0.735 | 0.781 | 0.401 | 140.153 |
| OBLONG | 1.272 | 0.713 | 0.798 | 0.403 | 138.388 |
| OVAL | 1.199 | 0.722 | 0.790 | 0.400 | 137.979 |
| ROUND | 1.145 | 0.712 | 0.799 | 0.395 | 134.742 |
| SQUARE | 1.158 | 0.712 | 0.818 | 0.394 | 131.810 |

Per-method details: `metrics_<method>.json`, `classification_report_<method>.txt`, `confusion_<method>.png`.
