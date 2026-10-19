# Ablation (E1)

Generated 2026-10-05 from `data` by `make ablation`. Numbers come from the pipeline outputs; do not edit by hand.

Algorithm: **SVM (RBF)** (selected by `training.selection`: calibrated_cv) with its tuned params `{'clf__C': 10, 'clf__gamma': 0.01}`. Score: macro-F1 mean +/- std over 5-fold StratifiedGroupKFold by person on train+val (seed 42); the test split is not used.

| variant | images | features | CV macro F1 | std | delta vs full |
|---|---|---|---|---|---|
| Full features (baseline) | 4222 | 20 | 0.516 | 0.067 | +0.000 |
| (a) No roll alignment | 4222 | 20 | 0.513 | 0.072 | -0.003 |
| (b) Without length/width ratios | 4222 | 18 | 0.469 | 0.057 | -0.047 |
| (c) Without jaw/chin angles | 4222 | 16 | 0.508 | 0.065 | -0.008 |
| (d) Without contour features | 4222 | 17 | 0.508 | 0.075 | -0.008 |
| (e) IPD scaling instead of cheekbone width | 4222 | 19 | 0.515 | 0.063 | -0.000 |

- (b) drops lw_ratio, lw_ratio_ext; (c) drops jaw_angle_l, jaw_angle_r, jaw_angle_mean, chin_angle; (d) drops contour_curvature, width_profile_slope, symmetry.
- (e) divides lw_ratio, lw_ratio_ext, forehead_cheek, temple_cheek, jaw_cheek, jaw2_cheek, width_profile_slope, symmetry by `ipd_cheek` (x/cheek / (ipd/cheek) = x/ipd) and drops `ipd_cheek`; the other features are scale-free and unchanged.
- (a) recomputes all features from the saved landmarks without the eye-line roll alignment.
- Differences smaller than the fold std are within CV noise.
