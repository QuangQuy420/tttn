# Ablation (E1)

Generated 2026-10-19 from `data/v2/all-synth` by `make ablation`. Numbers come from the pipeline outputs; do not edit by hand.

Algorithm: **XGBoost** (selected by `training.selection`: calibrated_cv) with its tuned params `{'learning_rate': 0.05, 'max_depth': 4, 'n_estimators': 400}`. Score: macro-F1 mean +/- std over 5-fold StratifiedGroupKFold by person on train+val (seed 42); the test split is not used.

| variant | images | features | CV macro F1 | std | delta vs full |
|---|---|---|---|---|---|
| Full features (baseline) | 5244 | 20 | 0.603 | 0.068 | +0.000 |
| (a) No roll alignment | 5244 | 20 | 0.599 | 0.067 | -0.004 |
| (b) Without length/width ratios | 5244 | 18 | 0.520 | 0.064 | -0.082 |
| (c) Without jaw/chin angles | 5244 | 16 | 0.582 | 0.064 | -0.021 |
| (d) Without contour features | 5244 | 17 | 0.583 | 0.066 | -0.020 |
| (e) IPD scaling instead of cheekbone width | 5244 | 19 | 0.578 | 0.069 | -0.024 |

- (b) drops lw_ratio, lw_ratio_ext; (c) drops jaw_angle_l, jaw_angle_r, jaw_angle_mean, chin_angle; (d) drops contour_curvature, width_profile_slope, symmetry.
- (e) divides lw_ratio, lw_ratio_ext, forehead_cheek, temple_cheek, jaw_cheek, jaw2_cheek, width_profile_slope, symmetry by `ipd_cheek` (x/cheek / (ipd/cheek) = x/ipd) and drops `ipd_cheek`; the other features are scale-free and unchanged.
- (a) recomputes all features from the saved landmarks without the eye-line roll alignment.
- Differences smaller than the fold std are within CV noise.
