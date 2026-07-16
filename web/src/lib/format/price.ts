// AC6: `basePrice` is treated as a VND amount (see plan Open Questions Q2 — no backend/unit
// change, purely a display-formatting decision here), formatted with vi-VN grouping,
// e.g. formatPriceVnd(1890000) -> "1.890.000 ₫".
export function formatPriceVnd(basePrice: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(basePrice);
}

// Frame/face-shape labels live in @/lib/labels (formatFrameShapeVi/formatFaceShapeVi) — the
// storefront's UI is Vietnamese throughout (see CLAUDE.md), so there is no separate English
// label set here anymore.
