import { CHEEK_L, CHEEK_R, EYE_OUTER_L, EYE_OUTER_R, NOSE_BRIDGE, NOSE_TIP } from "./landmarks";
import type { Point } from "./landmarks";

// Glasses placement in un-mirrored video/photo pixel space. `width` is the real (un-foreshortened)
// frame width; drawGlasses applies the horizontal cos(yaw) squeeze.
export interface GlassesPose {
  cx: number;
  cy: number;
  width: number;
  roll: number;
  yaw: number;
  visible: boolean;
}

export interface GlassesPoseOptions {
  widthFactor?: number;
  verticalOffset?: number;
  maxYawDeg?: number;
  // Radians, e.g. from yawFromMatrix; falls back to estimateYaw2D when omitted.
  yaw?: number;
}

// Width factor = drawn frame width / outer-eye-corner distance. Products with a frame width use
// frameWidthMm / 90 clamped to [1.3, 1.8]; otherwise 1.55 (plan Q2).
export const DEFAULT_WIDTH_FACTOR = 1.55;
export const MIN_WIDTH_FACTOR = 1.3;
export const MAX_WIDTH_FACTOR = 1.8;
export const FRAME_WIDTH_MM_PER_FACTOR = 90;
export const DEFAULT_VERTICAL_OFFSET = 0.05;
export const DEFAULT_MAX_YAW_DEG = 45;
// Lower bound for cos(yaw) so a strongly turned head never collapses/explodes the width.
export const MIN_COS_YAW = 0.35;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Yaw (radians) from MediaPipe's column-major 4×4 facial transformation matrix: atan2 of the
// third column's x and z. Only |yaw| and cos(yaw) are used downstream, so the sign convention
// does not matter.
export function yawFromMatrix(data: number[]): number {
  return Math.atan2(data[8], data[10]);
}

// Fallback yaw estimate from 2D landmarks: the nose tip moves toward one cheek as the head turns.
export function estimateYaw2D(landmarks: Point[], w: number, h: number): number {
  const nose = landmarks[NOSE_TIP];
  const left = landmarks[CHEEK_L];
  const right = landmarks[CHEEK_R];
  const dL = Math.hypot((nose.x - left.x) * w, (nose.y - left.y) * h);
  const dR = Math.hypot((nose.x - right.x) * w, (nose.y - right.y) * h);
  if (dL + dR === 0) return 0;
  return Math.asin(clamp((dR - dL) / (dR + dL), -1, 1));
}

export function widthFactorFor(frameWidthMm?: number | null): number {
  if (typeof frameWidthMm === "number" && Number.isFinite(frameWidthMm) && frameWidthMm > 0) {
    return clamp(frameWidthMm / FRAME_WIDTH_MM_PER_FACTOR, MIN_WIDTH_FACTOR, MAX_WIDTH_FACTOR);
  }
  return DEFAULT_WIDTH_FACTOR;
}

// Anchor on the nose bridge (168), shifted along the face's "down" axis; width from the outer eye
// corners (33→263) and the yaw; roll from the eye line.
export function computeGlassesPose(
  landmarks: Point[],
  w: number,
  h: number,
  opts: GlassesPoseOptions = {},
): GlassesPose {
  const {
    widthFactor = DEFAULT_WIDTH_FACTOR,
    verticalOffset = DEFAULT_VERTICAL_OFFSET,
    maxYawDeg = DEFAULT_MAX_YAW_DEG,
  } = opts;

  const left = landmarks[EYE_OUTER_L];
  const right = landmarks[EYE_OUTER_R];
  const bridge = landmarks[NOSE_BRIDGE];

  const dx = (right.x - left.x) * w;
  const dy = (right.y - left.y) * h;
  const eyeDist = Math.hypot(dx, dy);
  const roll = Math.atan2(dy, dx);

  const offset = verticalOffset * eyeDist;
  const cx = bridge.x * w - Math.sin(roll) * offset;
  const cy = bridge.y * h + Math.cos(roll) * offset;

  const yaw = opts.yaw ?? estimateYaw2D(landmarks, w, h);
  const width = (widthFactor * eyeDist) / Math.max(Math.cos(yaw), MIN_COS_YAW);
  const visible = Math.abs(yaw) <= (maxYawDeg * Math.PI) / 180;

  return { cx, cy, width, roll, yaw, visible };
}
