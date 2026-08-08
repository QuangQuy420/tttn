/**
 * Frame shape taxonomy (kính gọng shapes) — used by `Product.frameShape`. Normalized so
 * `recommendation-service` can reuse this value directly (see product-service/README.md).
 *
 * NOT the same taxonomy as `FaceShape` (khuôn mặt shapes) — do not conflate the two.
 */
export enum FrameShape {
  ROUND = 'ROUND',
  SQUARE = 'SQUARE',
  OVAL = 'OVAL',
  CAT_EYE = 'CAT_EYE',
  AVIATOR = 'AVIATOR',
  RECTANGLE = 'RECTANGLE',
  WAYFARER = 'WAYFARER',
  RIMLESS = 'RIMLESS',
}
