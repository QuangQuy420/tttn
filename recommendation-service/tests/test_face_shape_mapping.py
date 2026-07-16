"""Unit tests for the face-shape -> frame-shape scoring config
(`get_ranked_frame_shapes`) — a pure lookup, no product-service/FastAPI needed.

Deliberately minimal: checks the invariants the rest of the service relies on
(every FaceShape has an entry, every FrameShape appears exactly once per entry,
scores are sorted highest-first) plus a couple of concrete top-pick assertions
matching the documented styling heuristics, rather than re-asserting every score
in the table.
"""
from app.core.face_shape_mapping import FACE_SHAPE_TO_FRAME_SHAPES, get_ranked_frame_shapes
from app.schemas.recommend import FaceShape, FrameShape


def test_every_face_shape_has_a_ranking() -> None:
    for face_shape in FaceShape:
        ranked = get_ranked_frame_shapes(face_shape)
        assert len(ranked) == len(FrameShape)
        assert {frame_shape for frame_shape, _ in ranked} == set(FrameShape)


def test_scores_are_sorted_highest_first() -> None:
    for face_shape in FaceShape:
        scores = [score for _, score in get_ranked_frame_shapes(face_shape)]
        assert scores == sorted(scores, reverse=True)


def test_round_face_prefers_angular_frames_over_round_ones() -> None:
    ranked = dict(get_ranked_frame_shapes(FaceShape.ROUND))
    assert ranked[FrameShape.SQUARE] > ranked[FrameShape.ROUND]
    assert ranked[FrameShape.RECTANGLE] > ranked[FrameShape.ROUND]


def test_square_face_prefers_curved_frames_over_square_ones() -> None:
    ranked = dict(get_ranked_frame_shapes(FaceShape.SQUARE))
    assert ranked[FrameShape.ROUND] > ranked[FrameShape.SQUARE]
    assert ranked[FrameShape.OVAL] > ranked[FrameShape.SQUARE]


def test_mapping_table_has_exactly_the_six_face_shapes() -> None:
    assert set(FACE_SHAPE_TO_FRAME_SHAPES.keys()) == set(FaceShape)
