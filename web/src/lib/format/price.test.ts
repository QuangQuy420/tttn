import { formatPriceVnd } from "./price";

describe("formatPriceVnd", () => {
  // The exact whitespace character Intl.NumberFormat places before "₫" is ICU-version-dependent
  // (regular vs. narrow no-break space), so match on it loosely rather than hardcoding one.
  it("formats a whole VND amount with vi-VN grouping", () => {
    expect(formatPriceVnd(1_890_000)).toMatch(/^1\.890\.000\s₫$/);
  });

  it("rounds to the nearest VND (no decimal places)", () => {
    expect(formatPriceVnd(129.5)).toMatch(/^130\s₫$/);
  });
});
