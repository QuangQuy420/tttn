// Landmark indices in MediaPipe's 468/478-point face mesh topology — same numbering scheme
// face-processing-service already documents server-side (face_shape_service.py). Used to derive
// where/how large/how tilted to draw the glasses image. Shared by useFaceTracking.ts (live camera)
// and useStaticFaceOverlay.ts (static photo) so the tuned constants stay single-sourced.
export const EYE_OUTER_L = 33;
export const EYE_OUTER_R = 263;
export const NOSE_BRIDGE = 168;
export const CHEEK_L = 234;
export const CHEEK_R = 454;
export const NOSE_TIP = 1;

// numFaces raised to 2 (not 1) purely so 2+ faces can be *distinguished* from exactly 1 for the
// "only one face at a time" hint — same reasoning face_shape_service.py already uses server-side.
export const MAX_FACES_TO_DETECT = 2;

// Normalized landmark (0..1 of the image size). Structurally compatible with MediaPipe's
// NormalizedLandmark, so the math modules here need no MediaPipe import (only mediapipe.ts does).
export type Point = { x: number; y: number };
