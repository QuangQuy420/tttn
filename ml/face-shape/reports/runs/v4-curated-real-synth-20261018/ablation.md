# Ablation (E1)

Generated 2026-10-18 from `data/v2/real-synth` by `make ablation`. Numbers come from the pipeline outputs; do not edit by hand.

Algorithm: **SVM (RBF)** (selected by `training.selection`: calibrated_cv) with its tuned params `{'clf__C': 30, 'clf__gamma': 0.01}`. Score: macro-F1 mean +/- std over 5-fold StratifiedGroupKFold by person on train+val (seed 42); the test split is not used.

| variant | images | features | CV macro F1 | std | delta vs full |
|---|---|---|---|---|---|
| Full features (baseline) | 2881 | 20 | 0.650 | 0.040 | +0.000 |
| (a) No roll alignment | 2881 | 20 | 0.634 | 0.040 | -0.016 |
| (b) Without length/width ratios | 2881 | 18 | 0.609 | 0.047 | -0.040 |
| (c) Without jaw/chin angles | 2881 | 16 | 0.640 | 0.041 | -0.010 |
| (d) Without contour features | 2881 | 17 | 0.628 | 0.043 | -0.021 |
| (e) IPD scaling instead of cheekbone width | 2881 | 19 | 0.644 | 0.045 | -0.006 |

- (b) drops lw_ratio, lw_ratio_ext; (c) drops jaw_angle_l, jaw_angle_r, jaw_angle_mean, chin_angle; (d) drops contour_curvature, width_profile_slope, symmetry.
- (e) divides lw_ratio, lw_ratio_ext, forehead_cheek, temple_cheek, jaw_cheek, jaw2_cheek, width_profile_slope, symmetry by `ipd_cheek` (x/cheek / (ipd/cheek) = x/ipd) and drops `ipd_cheek`; the other features are scale-free and unchanged.
- (a) recomputes all features from the saved landmarks without the eye-line roll alignment.
- Differences smaller than the fold std are within CV noise.
