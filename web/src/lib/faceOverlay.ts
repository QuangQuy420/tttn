import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// Outer eye corner landmark indices in MediaPipe's 468/478-point face mesh topology — same
// numbering scheme face-processing-service already documents server-side
// (face_shape_service.py). Used to derive where/how large/how tilted to draw the glasses image.
// Shared by useFaceTracking.ts (live camera) and useStaticFaceOverlay.ts (static photo) so the
// tuned constants stay single-sourced.
export const LEFT_EYE_OUTER_CORNER = 33;
export const RIGHT_EYE_OUTER_CORNER = 263;

// numFaces raised to 2 (not 1) purely so 2+ faces can be *distinguished* from exactly 1 for the
// "only one face at a time" hint — same reasoning face_shape_service.py already uses server-side.
export const MAX_FACES_TO_DETECT = 2;

// Position/scale/rotation for the overlay image, derived from the two outer-eye-corner
// landmarks — position = their midpoint, scale = distance between them, rotation = angle of the
// line between them (see plan's "library research" section for the exact formula).
export function computeOverlayTransform(
  landmarks: NormalizedLandmark[],
  videoWidth: number,
  videoHeight: number,
) {
  const left = landmarks[LEFT_EYE_OUTER_CORNER];
  const right = landmarks[RIGHT_EYE_OUTER_CORNER];

  const leftX = left.x * videoWidth;
  const leftY = left.y * videoHeight;
  const rightX = right.x * videoWidth;
  const rightY = right.y * videoHeight;

  const centerX = (leftX + rightX) / 2;
  const centerY = (leftY + rightY) / 2;
  const eyeDistance = Math.hypot(rightX - leftX, rightY - leftY);
  const angle = Math.atan2(rightY - leftY, rightX - leftX);

  return { centerX, centerY, eyeDistance, angle };
}
