import type { FrameShape } from "@/types/product";

// AC6: `basePrice` is treated as a VND amount (see plan Open Questions Q2 — no backend/unit
// change, purely a display-formatting decision here), formatted with vi-VN grouping,
// e.g. formatPriceVnd(1890000) -> "1.890.000 ₫".
export function formatPriceVnd(basePrice: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(basePrice);
}

const FRAME_SHAPE_LABELS: Record<FrameShape, string> = {
  ROUND: "Round",
  SQUARE: "Square",
  OVAL: "Oval",
  CAT_EYE: "Cat-eye",
  AVIATOR: "Aviator",
  RECTANGLE: "Rectangle",
  WAYFARER: "Wayfarer",
  RIMLESS: "Rimless",
};

// Human-readable label for a raw FrameShape enum value (e.g. "ROUND" -> "Round").
export function formatFrameShape(shape: FrameShape): string {
  return FRAME_SHAPE_LABELS[shape];
}
