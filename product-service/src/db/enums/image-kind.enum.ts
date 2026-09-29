/**
 * `ProductImage.kind` — `TRY_ON` marks the transparent PNG used by the virtual try-on
 * overlay (at most one per product); everything else is `GALLERY`.
 */
export enum ImageKind {
  GALLERY = 'GALLERY',
  TRY_ON = 'TRY_ON',
}
