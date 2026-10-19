# Ablation (E1)

Generated 2026-10-18 from `data/v2/real` by `make ablation`. Numbers come from the pipeline outputs; do not edit by hand.

Algorithm: **SVM (RBF)** (selected by `training.selection`: calibrated_cv) with its tuned params `{'clf__C': 3, 'clf__gamma': 0.01}`. Score: macro-F1 mean +/- std over 5-fold StratifiedGroupKFold by person on train+val (seed 42); the test split is not used.

| variant | images | features | CV macro F1 | std | delta vs full |
|---|---|---|---|---|---|
| Full features (baseline) | 1859 | 20 | 0.531 | 0.025 | +0.000 |
| (a) No roll alignment | 1859 | 20 | 0.522 | 0.032 | -0.009 |
| (b) Without length/width ratios | 1859 | 18 | 0.429 | 0.051 | -0.102 |
| (c) Without jaw/chin angles | 1859 | 16 | 0.523 | 0.028 | -0.008 |
| (d) Without contour features | 1859 | 17 | 0.515 | 0.031 | -0.016 |
| (e) IPD scaling instead of cheekbone width | 1859 | 19 | 0.532 | 0.021 | +0.001 |

- (b) drops lw_ratio, lw_ratio_ext; (c) drops jaw_angle_l, jaw_angle_r, jaw_angle_mean, chin_angle; (d) drops contour_curvature, width_profile_slope, symmetry.
- (e) divides lw_ratio, lw_ratio_ext, forehead_cheek, temple_cheek, jaw_cheek, jaw2_cheek, width_profile_slope, symmetry by `ipd_cheek` (x/cheek / (ipd/cheek) = x/ipd) and drops `ipd_cheek`; the other features are scale-free and unchanged.
- (a) recomputes all features from the saved landmarks without the eye-line roll alignment.
- Differences smaller than the fold std are within CV noise.
