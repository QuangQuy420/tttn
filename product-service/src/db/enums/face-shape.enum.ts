/**
 * Face shape taxonomy (khuôn mặt shapes) — used only by `FaceShapeStyle.faceShape`.
 * This is a DIFFERENT taxonomy from `FrameShape` — do not conflate the two (see
 * the plan's Data model note and product-service/README.md).
 */
export enum FaceShape {
  ROUND = 'ROUND',
  SQUARE = 'SQUARE',
  OVAL = 'OVAL',
  HEART = 'HEART',
  DIAMOND = 'DIAMOND',
  OBLONG = 'OBLONG',
}
