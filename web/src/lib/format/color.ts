// FR7: known color-name -> hex swatch lookup, for rendering ProductVariant.color as a visual
// swatch. `product-service` stores color as free text, so this is necessarily a partial map —
// unmapped names fall back to a neutral swatch plus a visible text label (never a hex-only
// circle with no accessible name for a color we don't recognize).
const COLOR_NAME_TO_HEX: Record<string, string> = {
  "đen": "#2B2420",
  "vàng": "#C9A24B",
  "bạc": "#B8B8B8",
  "đồi mồi": "#6B4A2B",
  "nâu": "#5A3E2B",
  "xanh navy": "#1F2A44",
};

const FALLBACK_SWATCH_HEX = "#B8B0A2";

export interface ColorSwatch {
  hex: string;
  isKnown: boolean;
}

export function getColorSwatch(colorName: string): ColorSwatch {
  const hex = COLOR_NAME_TO_HEX[colorName.trim().toLowerCase()];
  return hex ? { hex, isKnown: true } : { hex: FALLBACK_SWATCH_HEX, isKnown: false };
}
