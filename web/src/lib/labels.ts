import type { FaceShapeTag, FrameShape, GenderTarget } from "@/types/product";

// Vietnamese labels for the admin area (Admin Products.dc.html / Product Edit.dc.html mockups
// use Vietnamese copy throughout) — also reused by the storefront (ProductFilters/ProductCard/
// ProductDetailPage), since the whole `web` UI is Vietnamese (see CLAUDE.md).
export const FRAME_SHAPE_LABELS_VI: Record<FrameShape, string> = {
  ROUND: "Gọng tròn",
  SQUARE: "Gọng vuông",
  OVAL: "Oval",
  CAT_EYE: "Mắt mèo",
  AVIATOR: "Phi công",
  RECTANGLE: "Chữ nhật",
  WAYFARER: "Wayfarer",
  RIMLESS: "Không viền",
};

export function formatFrameShapeVi(shape: FrameShape): string {
  return FRAME_SHAPE_LABELS_VI[shape];
}

// FaceShape tag picker labels — matches the mockup's faceShapeDefs where present (oval/round/
// square/heart/diamond); OBLONG isn't in the mockup (only 5 of the 6 backend enum values are
// shown there) so "Dài" is a reasonable Vietnamese label picked for consistency (plan Q2).
export const FACE_SHAPE_LABELS_VI: Record<FaceShapeTag, string> = {
  OVAL: "Oval",
  ROUND: "Tròn",
  SQUARE: "Vuông",
  HEART: "Tim",
  DIAMOND: "Kim cương",
  OBLONG: "Dài",
};

export function formatFaceShapeVi(shape: FaceShapeTag): string {
  return FACE_SHAPE_LABELS_VI[shape];
}

// Fixed display order for the face-shape tag picker (matches the mockup's faceShapeDefs order,
// with OBLONG appended last since the mockup doesn't show it).
export const FACE_SHAPE_TAGS: FaceShapeTag[] = [
  "OVAL",
  "ROUND",
  "SQUARE",
  "HEART",
  "DIAMOND",
  "OBLONG",
];

// Fixed display order for the frame-shape select (matches the mockup's shapeOptions order where
// possible; CAT_EYE/AVIATOR/RECTANGLE renamed to their Vietnamese equivalents already appear
// there, WAYFARER/RIMLESS appended since the mockup's list predates those enum values).
export const FRAME_SHAPES: FrameShape[] = [
  "ROUND",
  "SQUARE",
  "RECTANGLE",
  "AVIATOR",
  "CAT_EYE",
  "OVAL",
  "WAYFARER",
  "RIMLESS",
];

// GenderTarget isn't shown in the mockup (like brandId, it's a required backend field the mockup
// doesn't surface — see plan FR8) — added as a minimal required select so the form can submit a
// valid CreateProductDto.
export const GENDER_TARGET_LABELS_VI: Record<GenderTarget, string> = {
  UNISEX: "Unisex",
  MALE: "Nam",
  FEMALE: "Nữ",
};

export const GENDER_TARGETS: GenderTarget[] = ["UNISEX", "MALE", "FEMALE"];
