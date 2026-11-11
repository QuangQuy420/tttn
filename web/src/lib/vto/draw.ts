import { MIN_COS_YAW } from "./pose";
import type { GlassesPose } from "./pose";

// Where the bridge sits in a glasses PNG, as a fraction of image height from the top. One constant
// for every product (no per-product override).
export const DEFAULT_ANCHOR_Y = 0.4;

// Overlay alpha when the head is turned past the max yaw (AC5).
export const TURNED_AWAY_ALPHA = 0.3;

// Draws the glasses image at `pose` (un-mirrored pixel space): rotate by roll, squeeze
// horizontally by cos(yaw), bridge anchored at (cx, cy).
export function drawGlasses(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pose: GlassesPose,
  alpha: number,
  anchorY: number = DEFAULT_ANCHOR_Y,
): void {
  const h = (pose.width * img.naturalHeight) / img.naturalWidth;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pose.cx, pose.cy);
  ctx.rotate(pose.roll);
  ctx.scale(Math.max(Math.cos(pose.yaw), MIN_COS_YAW), 1);
  ctx.drawImage(img, -pose.width / 2, -h * anchorY, pose.width, h);
  ctx.restore();
}
