// Admin "Model AI" + "Hành vi người dùng" calls (plan 2026-09-29-15, T11). Calls api-gateway's
// admin-analytics.controller.ts (@Controller('api/admin/ai') / ('api/admin/analytics')), which
// requires `order:manage` and forwards to face-processing-service / recommendation-service
// /admin/*. The gateway DTOs use forbidNonWhitelisted, so each function sends ONLY the query
// params its route accepts — an extra param is rejected with 400.

import type {
  AnalyticsEventsParams,
  AnalyticsRangeParams,
  DailyEventCounts,
  FaceShapeDistribution,
  FaceShapeModelInfo,
  Funnel,
  PreferenceModelInfo,
  TopProducts,
  TopProductsParams,
} from "@/types/admin-analytics";
import { apiFetchData } from "./client";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function rangeQuery(params: AnalyticsRangeParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return query;
}

function eventsQuery(params: AnalyticsEventsParams): URLSearchParams {
  const query = rangeQuery(params);
  if (params.source) query.set("source", params.source);
  return query;
}

function withQuery(path: string, query: URLSearchParams): string {
  const queryString = query.toString();
  return `${path}${queryString ? `?${queryString}` : ""}`;
}

function adminGet<T>(token: string, path: string): Promise<T> {
  return apiFetchData<T>(path, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function getFaceShapeModelInfo(token: string): Promise<FaceShapeModelInfo> {
  return adminGet<FaceShapeModelInfo>(token, "/admin/ai/face-shape-model");
}

export function getPreferenceModelInfo(token: string): Promise<PreferenceModelInfo> {
  return adminGet<PreferenceModelInfo>(token, "/admin/ai/preference-model");
}

export function getDailyEventCounts(
  token: string,
  params: AnalyticsEventsParams = {},
): Promise<DailyEventCounts> {
  return adminGet<DailyEventCounts>(token, withQuery("/admin/analytics/events/daily", eventsQuery(params)));
}

export function getFunnel(token: string, params: AnalyticsEventsParams = {}): Promise<Funnel> {
  return adminGet<Funnel>(token, withQuery("/admin/analytics/funnel", eventsQuery(params)));
}

export function getTopProducts(token: string, params: TopProductsParams = {}): Promise<TopProducts> {
  const query = eventsQuery(params);
  if (params.eventType) query.set("eventType", params.eventType);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  return adminGet<TopProducts>(token, withQuery("/admin/analytics/top-products", query));
}

// Face-shape distribution has no `source` filter (face analyses are not behavior events).
export function getFaceShapeDistribution(
  token: string,
  params: AnalyticsRangeParams = {},
): Promise<FaceShapeDistribution> {
  return adminGet<FaceShapeDistribution>(
    token,
    withQuery("/admin/analytics/face-shapes", rangeQuery(params)),
  );
}
