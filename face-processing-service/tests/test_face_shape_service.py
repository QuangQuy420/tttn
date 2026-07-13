"""Unit tests for the rule-based face-shape classifier (`classify_face_shape`) and the
image-decoding boundary check (`_decode_image`) — the two pieces of `face_shape_service`
that don't need a real MediaPipe model or a real photo to exercise (per AC7's intent for
"classifier thresholds... with synthetic landmark fixtures, no real image needed").

Deliberately minimal for now — the no-face/multiple-face detection paths need a real
MediaPipe FaceLandmarker call against a real image and are covered by manual testing;
broader coverage (incl. those paths, and the repositories) lands in a later test pass.
"""
import pytest

from app.db.models import FaceShape
from app.schemas.face import FaceMeasurements
from app.services.face_shape_service import InvalidImageError, _decode_image, classify_face_shape


def _measurements(lw: float, cj: float, fj: float) -> FaceMeasurements:
    """Build a `FaceMeasurements` with only the 3 ratios `classify_face_shape` reads set
    meaningfully — the raw width/length fields are unused by the classifier, so any
    placeholder value works for them."""
    return FaceMeasurements(
        face_length=0.4,
        forehead_width=0.3,
        cheekbone_width=0.35,
        jaw_width=0.3,
        length_to_width_ratio=lw,
        cheekbone_to_jaw_ratio=cj,
        forehead_to_jaw_ratio=fj,
    )


@pytest.mark.parametrize(
    ("lw", "cj", "fj", "expected"),
    [
        (1.3, 0.90, 1.00, FaceShape.OBLONG),
        (1.0, 0.70, 1.20, FaceShape.HEART),
        (1.0, 0.70, 0.80, FaceShape.DIAMOND),
        (1.0, 0.95, 1.00, FaceShape.SQUARE),
        (0.9, 0.85, 1.00, FaceShape.ROUND),
        (1.0, 0.85, 1.00, FaceShape.OVAL),
    ],
)
def test_classify_face_shape(lw: float, cj: float, fj: float, expected: FaceShape) -> None:
    shape, confidence = classify_face_shape(_measurements(lw, cj, fj))

    assert shape == expected
    assert 0.5 <= confidence <= 0.99


def test_decode_image_rejects_non_image_bytes() -> None:
    with pytest.raises(InvalidImageError):
        _decode_image(b"this is not a real image file")
