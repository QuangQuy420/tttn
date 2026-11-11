// Admin "Model AI" + "Hành vi người dùng" pages (plan 2026-09-29-15, T11). Shapes mirror the
// `data` of api-gateway's /api/admin/ai/* and /api/admin/analytics/* routes, which pass the
// face-processing-service / recommendation-service /admin/* responses through unchanged.

import type { FaceShapeTag } from "./product";

// `real` = every source except the simulator (default), `simulator` = simulated events only.
export type AnalyticsSource = "real" | "simulator" | "all";

// The 5 funnel steps, in funnel order. UNLIKE is deliberately not part of the admin stats.
export type FunnelEventType = "VIEW" | "TRY_ON" | "LIKE" | "ADD_TO_CART" | "PURCHASE";

export interface FaceShapeClassMetrics {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  support: number | null;
}

export interface FaceShapeModelMetrics {
  accuracy: number | null;
  macroF1: number | null;
  perClass: Partial<Record<FaceShapeTag, FaceShapeClassMetrics>> | null;
}

// Rule mode: method "rule", modelVersion "rule-v0", everything else null.
export interface FaceShapeModelInfo {
  method: "ml" | "rule";
  modelVersion: string;
  algorithm: string | null;
  classes: string[] | null;
  metrics: FaceShapeModelMetrics | null;
  createdAt: string | null;
}

export interface PreferenceModelMetrics {
  ndcgAt10: number | null;
  hitRateAt10: number | null;
  precisionAt10: number | null;
  recallAt10: number | null;
}

// PREFERENCE_NORM: how PreferenceScores are rescaled before FinalScore — `rank` = rank-normalized
// within the candidate list, `none` = raw model score.
export type PreferenceNorm = "none" | "rank";

// loaded=false (legacy mode) → version/algorithm/objective/createdAt/metrics are null;
// alpha/beta/preferenceNorm are always the configured values.
export interface PreferenceModelInfo {
  loaded: boolean;
  version: string | null;
  algorithm: string | null;
  objective: string | null;
  createdAt: string | null;
  metrics: PreferenceModelMetrics | null;
  alpha: number;
  beta: number;
  preferenceNorm: PreferenceNorm;
}

export interface AnalyticsRange {
  from: string; // YYYY-MM-DD, inclusive (Asia/Ho_Chi_Minh calendar day)
  to: string; // YYYY-MM-DD, inclusive
}

export interface AnalyticsRangeParams {
  from?: string;
  to?: string;
}

export interface AnalyticsEventsParams extends AnalyticsRangeParams {
  source?: AnalyticsSource;
}

export interface TopProductsParams extends AnalyticsEventsParams {
  eventType?: FunnelEventType;
  limit?: number;
}

export interface DailyEventCount {
  date: string; // YYYY-MM-DD
  counts: Record<FunnelEventType, number>;
}

// One entry per day of the range, ascending, zeros filled.
export interface DailyEventCounts extends AnalyticsRange {
  source: AnalyticsSource;
  days: DailyEventCount[];
}

export interface FunnelStep {
  eventType: FunnelEventType;
  users: number;
  // users[i] / users[i-1]; null for the first step and when the previous step is 0.
  conversionFromPrevious: number | null;
}

export interface Funnel extends AnalyticsRange {
  source: AnalyticsSource;
  steps: FunnelStep[];
}

export interface TopProductItem {
  productId: string;
  count: number;
  // null when the product is no longer in the published catalog (or the catalog was unreachable).
  name: string | null;
  slug: string | null;
  thumbnailUrl: string | null;
}

export interface TopProducts extends AnalyticsRange {
  source: AnalyticsSource;
  eventType: FunnelEventType;
  items: TopProductItem[];
}

export interface FaceShapeCount {
  faceShape: FaceShapeTag;
  count: number;
}

// Always 6 items in FaceShape enum order. Not filtered by source.
export interface FaceShapeDistribution extends AnalyticsRange {
  total: number;
  items: FaceShapeCount[];
}
