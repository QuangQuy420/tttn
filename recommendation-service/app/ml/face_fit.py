"""FaceFitScore: how well a frame shape suits a user's face, in [0, 1].

`face_fit(probs, frame_shape) = Σ_s p(s) · M[s][frame_shape]`, where `p` are the face-shape
probabilities of an analysis (plan 08) and `M` is the static 0–10 compatibility table in
`app/core/face_shape_mapping.py` divided by 10 (missing pairs = 0). That table stays the
single source; it is only read here.

Pure (no FastAPI, no I/O) so the offline evaluation can import it too. FaceFit is added to
the preference score AFTER inference — never a model input (roadmap C5).
"""
from collections.abc import Mapping

from app.core.face_shape_mapping import FACE_SHAPE_TO_FRAME_SHAPES
from app.schemas.recommend import FaceShape, FrameShape

_TABLE_SCALE = 10.0

M: dict[FaceShape, dict[FrameShape, float]] = {
    face_shape: {
        frame_shape: dict(FACE_SHAPE_TO_FRAME_SHAPES.get(face_shape, [])).get(frame_shape, 0.0)
        / _TABLE_SCALE
        for frame_shape in FrameShape
    }
    for face_shape in FaceShape
}


def one_hot(face_shape: FaceShape) -> dict[FaceShape, float]:
    """Probabilities of an analysis that only knows its top-1 face shape."""
    return {shape: 1.0 if shape == face_shape else 0.0 for shape in FaceShape}


def face_fit(probs: Mapping[FaceShape, float], frame_shape: FrameShape | str) -> float:
    """Probability-weighted compatibility of `frame_shape` with the face, in [0, 1]."""
    frame = FrameShape(frame_shape)
    score = sum(float(p) * M[FaceShape(shape)][frame] for shape, p in probs.items())
    return min(1.0, max(0.0, score))
