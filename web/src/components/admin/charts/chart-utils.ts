// Pure helpers for the admin analytics charts (plan 2026-09-29-15, T12). No React, no I/O.

import type { DailyEventCount, FunnelEventType } from "@/types/admin-analytics";

// Funnel order — also the stacking order (bottom → top) and the series color order
// (--admin-chart-1..5) of the daily bar chart.
export const FUNNEL_EVENT_TYPES: FunnelEventType[] = [
  "VIEW",
  "TRY_ON",
  "LIKE",
  "ADD_TO_CART",
  "PURCHASE",
];

export const EVENT_TYPE_LABELS_VI: Record<FunnelEventType, string> = {
  VIEW: "Xem",
  TRY_ON: "Thử kính",
  LIKE: "Thích",
  ADD_TO_CART: "Thêm giỏ",
  PURCHASE: "Mua",
};

export function formatEventTypeVi(eventType: FunnelEventType): string {
  return EVENT_TYPE_LABELS_VI[eventType];
}

// CSS variable of an event type's series color — fixed per event type, never per rank.
export function eventTypeColorVar(eventType: FunnelEventType): string {
  return `var(--admin-chart-${FUNNEL_EVENT_TYPES.indexOf(eventType) + 1})`;
}

export function dayTotal(day: DailyEventCount): number {
  return FUNNEL_EVENT_TYPES.reduce((sum, type) => sum + (day.counts[type] ?? 0), 0);
}

export interface StackSegment {
  eventType: FunnelEventType;
  start: number; // cumulative count below this segment
  value: number;
}

// Non-zero segments of one day's stacked bar, bottom → top in funnel order.
export function stackSegments(day: DailyEventCount): StackSegment[] {
  const segments: StackSegment[] = [];
  let start = 0;
  for (const eventType of FUNNEL_EVENT_TYPES) {
    const value = day.counts[eventType] ?? 0;
    if (value > 0) {
      segments.push({ eventType, start, value });
      start += value;
    }
  }
  return segments;
}

// Highest stacked total across the days (0 when there is no data).
export function maxDayTotal(days: DailyEventCount[]): number {
  return days.reduce((max, day) => Math.max(max, dayTotal(day)), 0);
}

// Sum of one event type over the whole range (shown in the legend).
export function seriesTotals(days: DailyEventCount[]): Record<FunnelEventType, number> {
  const totals = { VIEW: 0, TRY_ON: 0, LIKE: 0, ADD_TO_CART: 0, PURCHASE: 0 };
  for (const day of days) {
    for (const type of FUNNEL_EVENT_TYPES) {
      totals[type] += day.counts[type] ?? 0;
    }
  }
  return totals;
}

// Integer axis ticks from 0 up to the first multiple of a "nice" step (1, 2, 5 × 10^k, at least
// 1) that covers `max`, aiming for about `targetSteps` steps — only as many ticks as needed, so
// small or awkward maxima do not leave the plot mostly empty. [0, 1] when max is 0.
export function niceTicks(max: number, targetSteps = 4): number[] {
  const rawStep = max > 0 ? max / targetSteps : 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(niceNormalized * magnitude));
  const count = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}

// 0.4567 → "45,7%"; null → "—". Ratios above 1 are possible (independent funnel steps).
export function formatPercent(ratio: number | null, fractionDigits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

// Model metric in [0, 1] → "0,873"; null → "—".
export function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("vi-VN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function formatCount(value: number): string {
  return value.toLocaleString("vi-VN");
}

// "2026-09-29" → "29/09" for compact axis labels.
export function formatShortDateVi(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  if (!month || !day) return isoDate;
  return `${day}/${month}`;
}

// Share of `part` in `total` as a ratio; 0 when total is 0.
export function shareOf(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}
