import { getColorSwatch } from "./color";

describe("getColorSwatch", () => {
  it("returns the known hex value for a recognized color name (case-insensitive)", () => {
    expect(getColorSwatch("Gold")).toEqual({ hex: "#C9A24B", isKnown: true });
    expect(getColorSwatch("gold")).toEqual({ hex: "#C9A24B", isKnown: true });
  });

  it("returns a neutral fallback swatch for an unmapped color name", () => {
    const swatch = getColorSwatch("Rose Quartz");
    expect(swatch.isKnown).toBe(false);
    expect(swatch.hex).toBe("#B8B0A2");
  });
});
