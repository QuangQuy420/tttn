"""Rule-based baselines for plan 07 (AC1, AC2).

- `CurrentRuleBaseline` ("Rule v0 (production)"): runs face-processing-service's own
  `_extract_measurements` + `classify_face_shape` (imported, not copied) on the **normalized**
  MediaPipe landmarks from `interim/landmarks.npz`, i.e. exactly what production does - including
  its normalized-coordinate aspect-ratio issue.
- `PrototypeRuleBaseline` ("Rule v1"): nearest prototype on 5 corrected features with per-feature
  tolerances, distance = sum(((x - p) / tol) ** 2); confidence = 1 - d(best) / d(runner-up).
  `literature()` starts from the face-metrics prototypes (MIT, https://github.com/MartinSaraka/face-metrics);
  `fitted(train)` replaces them with per-class medians of the train split.
"""
from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pandas as pd

PROTOTYPE_FEATURES = ("lw_ratio", "forehead_cheek", "jaw_cheek", "chin_jaw", "jaw_angle_mean")
PROTOTYPE_TOLERANCES = (0.12, 0.06, 0.06, 0.08, 10.0)
LITERATURE_PROTOTYPES = {
    "OVAL": (1.45, 0.92, 0.85, 0.5, 125.0),
    "ROUND": (1.25, 0.9, 0.95, 0.62, 135.0),
    "SQUARE": (1.3, 0.95, 1.0, 0.7, 115.0),
    "OBLONG": (1.65, 0.92, 0.9, 0.55, 125.0),
    "HEART": (1.4, 1.02, 0.78, 0.36, 125.0),
    "DIAMOND": (1.45, 0.8, 0.8, 0.4, 125.0),
}


class CurrentRuleBaseline:
    """The production if/else rule, scored on the same normalized landmarks it sees in production."""

    def predict(self, landmarks: np.ndarray) -> np.ndarray:
        """`landmarks`: `(N, 478, 2|3)` normalized MediaPipe coords -> `(N,)` UPPERCASE labels."""
        from app.services.face_shape_service import _extract_measurements, classify_face_shape

        labels = []
        for face in landmarks:
            points = [SimpleNamespace(x=float(p[0]), y=float(p[1])) for p in face]
            shape, _ = classify_face_shape(_extract_measurements(points))
            labels.append(shape.value)
        return np.asarray(labels)


class PrototypeRuleBaseline:
    """Nearest-prototype rule on `PROTOTYPE_FEATURES`."""

    def __init__(self, prototypes: dict[str, tuple[float, ...]]) -> None:
        self.classes_ = list(prototypes)
        self.prototypes_ = np.asarray([prototypes[c] for c in self.classes_], dtype=np.float64)
        self.tolerances_ = np.asarray(PROTOTYPE_TOLERANCES, dtype=np.float64)

    @classmethod
    def literature(cls) -> PrototypeRuleBaseline:
        return cls(LITERATURE_PROTOTYPES)

    @classmethod
    def fitted(cls, train: pd.DataFrame) -> PrototypeRuleBaseline:
        """Per-class medians of the train rows (needs `label` + `PROTOTYPE_FEATURES` columns)."""
        medians = train.groupby("label")[list(PROTOTYPE_FEATURES)].median()
        return cls({label: tuple(row) for label, row in medians.iterrows()})

    def distances(self, df: pd.DataFrame) -> np.ndarray:
        x = df[list(PROTOTYPE_FEATURES)].to_numpy(dtype=np.float64)
        diff = (x[:, None, :] - self.prototypes_[None, :, :]) / self.tolerances_
        return (diff**2).sum(axis=2)

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return np.asarray(self.classes_)[self.distances(df).argmin(axis=1)]

    def confidence(self, df: pd.DataFrame) -> np.ndarray:
        d = np.sort(self.distances(df), axis=1)
        return 1 - d[:, 0] / np.maximum(d[:, 1], 1e-12)

    def prototype_table(self) -> pd.DataFrame:
        return pd.DataFrame(self.prototypes_, index=self.classes_, columns=list(PROTOTYPE_FEATURES))
