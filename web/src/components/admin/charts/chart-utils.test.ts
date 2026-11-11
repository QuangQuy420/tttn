import type { DailyEventCount } from "@/types/admin-analytics";
import {
  eventTypeColorVar,
  formatEventTypeVi,
  formatMetric,
  formatPercent,
  formatShortDateVi,
  maxDayTotal,
  niceTicks,
  seriesTotals,
  shareOf,
  stackSegments,
} from "./chart-utils";

const day1: DailyEventCount = {
  date: "2026-09-28",
  counts: { VIEW: 10, TRY_ON: 0, LIKE: 3, ADD_TO_CART: 2, PURCHASE: 1 },
};
const day2: DailyEventCount = {
  date: "2026-09-29",
  counts: { VIEW: 20, TRY_ON: 5, LIKE: 0, ADD_TO_CART: 0, PURCHASE: 0 },
};

describe("chart-utils", () => {
  it("stacks a day's non-zero counts bottom → top in funnel order (AC4)", () => {
    expect(stackSegments(day1)).toEqual([
      { eventType: "VIEW", start: 0, value: 10 },
      { eventType: "LIKE", start: 10, value: 3 },
      { eventType: "ADD_TO_CART", start: 13, value: 2 },
      { eventType: "PURCHASE", start: 15, value: 1 },
    ]);
  });

  it("computes per-series totals and the highest stacked day total (AC4)", () => {
    expect(seriesTotals([day1, day2])).toEqual({
      VIEW: 30,
      TRY_ON: 5,
      LIKE: 3,
      ADD_TO_CART: 2,
      PURCHASE: 1,
    });
    expect(maxDayTotal([day1, day2])).toBe(25);
    expect(maxDayTotal([])).toBe(0);
  });

  it("returns integer ticks on a nice step, only as many as needed to cover max (AC4, AC10)", () => {
    expect(niceTicks(25)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(41)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it("formats event types, percents, metrics and dates in Vietnamese (AC2, AC5)", () => {
    expect(formatEventTypeVi("TRY_ON")).toBe("Thử kính");
    expect(formatEventTypeVi("ADD_TO_CART")).toBe("Thêm giỏ");
    expect(eventTypeColorVar("VIEW")).toBe("var(--admin-chart-1)");
    expect(eventTypeColorVar("PURCHASE")).toBe("var(--admin-chart-5)");
    expect(formatPercent(0.4567)).toBe("45,7%");
    expect(formatPercent(null)).toBe("—");
    expect(formatMetric(0.8734)).toBe("0,873");
    expect(formatMetric(null)).toBe("—");
    expect(formatShortDateVi("2026-09-29")).toBe("29/09");
  });

  it("returns the share of a part, 0 when the total is 0 (AC7)", () => {
    expect(shareOf(25, 100)).toBe(0.25);
    expect(shareOf(0, 0)).toBe(0);
  });
});
