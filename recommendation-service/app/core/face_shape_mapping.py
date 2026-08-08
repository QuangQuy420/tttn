"""Face-shape -> frame-shape scoring config — a local, hand-maintained table (per this
service's README: "Maps face shape -> suitable frame shapes (config) and scores
candidates", collaborative/content-based filtering explicitly out of scope).

Kept as static Python config so the service owns its scoring rules directly.

Each `FaceShape` maps to an ordered list of `(FrameShape, score)` pairs, highest score
first. Scores are on a 0-10 scale, purely relative within one face shape (used to rank
candidates against each other, not compared across different face shapes).

Styling heuristics used (standard eyewear-styling advice: pair the frame shape against
the face shape for contrast, and avoid a frame that echoes the face's own outline):
- ROUND face (soft curves, similar width/length, no strong angles): angular frames add
  definition and make the face look less round/wide. SQUARE/RECTANGLE score highest,
  CAT_EYE and WAYFARER next tier (some structure, still wearable), ROUND/OVAL frames
  score lowest since they mirror rather than contrast the face's roundness.
- SQUARE face (strong jaw, broad forehead, angular): the opposite logic — curved/round
  frames soften the angles. ROUND and OVAL score highest, CAT_EYE and AVIATOR next
  (curved bottom edge softens the jaw), RECTANGLE/SQUARE/WAYFARER score lowest since
  they double down on the face's existing angularity.
- OVAL face (balanced proportions, considered the "universal fit" in styling guides):
  most frame shapes work reasonably well, so scores stay closer together; slight
  preference for versatile everyday shapes (WAYFARER, RECTANGLE, AVIATOR) over the
  most extreme/statement shapes.
- HEART face (wide forehead/cheekbones tapering to a narrow chin): frame shapes that
  are wider at the bottom or draw the eye downward/evenly balance the face. Bottom-
  heavy/rimless-bottom-weighted looks (RIMLESS, OVAL, ROUND) score highest; frames
  that add MORE width up top (bold CAT_EYE, AVIATOR) score lowest since they
  exaggerate the already-wide upper face.
- DIAMOND face (widest at the cheekbones, narrower forehead and jaw): frames with
  detailing on the brow line add width up top and balance the cheekbones. CAT_EYE and
  OVAL score highest (softens angular cheekbones, adds brow-line emphasis), RIMLESS
  scores lowest (no brow-line emphasis at all, does nothing to balance the cheekbones).
- OBLONG face (notably longer than wide): frames that add width (rather than more
  length) and break up the face's length work best. Frames with more depth top-to-
  bottom and strong horizontal lines (AVIATOR, WAYFARER, ROUND) score highest;
  RECTANGLE and narrow frames score lowest since they emphasize length further.

These are a documented judgment call (consistent with how
`face-processing-service/app/services/face_shape_service.py` documents its own
rule-based classification thresholds as literature-based approximations, not a
trained/validated model) — reasonable starting heuristics for a thesis project, easy
to tune later without touching any code path that consumes this table.
"""
from app.schemas.recommend import FaceShape, FrameShape

FACE_SHAPE_TO_FRAME_SHAPES: dict[FaceShape, list[tuple[FrameShape, float]]] = {
    FaceShape.ROUND: [
        (FrameShape.SQUARE, 10.0),
        (FrameShape.RECTANGLE, 9.0),
        (FrameShape.CAT_EYE, 7.0),
        (FrameShape.WAYFARER, 7.0),
        (FrameShape.AVIATOR, 5.0),
        (FrameShape.RIMLESS, 4.0),
        (FrameShape.OVAL, 2.0),
        (FrameShape.ROUND, 1.0),
    ],
    FaceShape.SQUARE: [
        (FrameShape.ROUND, 10.0),
        (FrameShape.OVAL, 9.0),
        (FrameShape.CAT_EYE, 7.0),
        (FrameShape.AVIATOR, 7.0),
        (FrameShape.RIMLESS, 5.0),
        (FrameShape.WAYFARER, 3.0),
        (FrameShape.RECTANGLE, 2.0),
        (FrameShape.SQUARE, 1.0),
    ],
    FaceShape.OVAL: [
        (FrameShape.WAYFARER, 9.0),
        (FrameShape.RECTANGLE, 9.0),
        (FrameShape.AVIATOR, 8.0),
        (FrameShape.SQUARE, 8.0),
        (FrameShape.CAT_EYE, 8.0),
        (FrameShape.ROUND, 7.0),
        (FrameShape.OVAL, 7.0),
        (FrameShape.RIMLESS, 7.0),
    ],
    FaceShape.HEART: [
        (FrameShape.RIMLESS, 10.0),
        (FrameShape.OVAL, 9.0),
        (FrameShape.ROUND, 8.0),
        (FrameShape.WAYFARER, 6.0),
        (FrameShape.RECTANGLE, 5.0),
        (FrameShape.SQUARE, 4.0),
        (FrameShape.AVIATOR, 3.0),
        (FrameShape.CAT_EYE, 2.0),
    ],
    FaceShape.DIAMOND: [
        (FrameShape.CAT_EYE, 10.0),
        (FrameShape.OVAL, 9.0),
        (FrameShape.WAYFARER, 6.0),
        (FrameShape.ROUND, 6.0),
        (FrameShape.AVIATOR, 5.0),
        (FrameShape.SQUARE, 4.0),
        (FrameShape.RECTANGLE, 3.0),
        (FrameShape.RIMLESS, 2.0),
    ],
    FaceShape.OBLONG: [
        (FrameShape.AVIATOR, 10.0),
        (FrameShape.WAYFARER, 9.0),
        (FrameShape.ROUND, 8.0),
        (FrameShape.CAT_EYE, 6.0),
        (FrameShape.OVAL, 5.0),
        (FrameShape.SQUARE, 4.0),
        (FrameShape.RIMLESS, 3.0),
        (FrameShape.RECTANGLE, 2.0),
    ],
}


def get_ranked_frame_shapes(face_shape: FaceShape) -> list[tuple[FrameShape, float]]:
    """Return the `(FrameShape, score)` candidates for `face_shape`, highest score first."""
    return FACE_SHAPE_TO_FRAME_SHAPES[face_shape]
