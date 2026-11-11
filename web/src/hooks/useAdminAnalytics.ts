"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  getDailyEventCounts,
  getFaceShapeDistribution,
  getFunnel,
  getTopProducts,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type {
  AnalyticsSource,
  DailyEventCounts,
  FaceShapeDistribution,
  Funnel,
  FunnelEventType,
  TopProducts,
} from "@/types/admin-analytics";

const TOP_PRODUCTS_LIMIT = 10;

interface UseAdminAnalyticsParams {
  days: number;
  source: AnalyticsSource;
  eventType: FunnelEventType;
}

interface AdminAnalyticsData {
  daily: DailyEventCounts;
  funnel: Funnel;
  topProducts: TopProducts;
  faceShapes: FaceShapeDistribution;
}

interface UseAdminAnalyticsResult {
  daily: DailyEventCounts | null;
  funnel: Funnel | null;
  topProducts: TopProducts | null;
  faceShapes: FaceShapeDistribution | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const LOGIN_REQUIRED = "Vui lòng đăng nhập lại.";
const LOAD_FAILED = "Không thể tải dữ liệu hành vi người dùng.";

// YYYY-MM-DD from the browser's LOCAL calendar day — never toISOString(), which is UTC and
// would shift the day for Vietnamese admins before 07:00.
function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// The last `days` calendar days including today: "90 ngày" is exactly 90 days (the API max).
function rangeOfLastDays(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  return { from: toLocalIsoDate(from), to: toLocalIsoDate(to) };
}

async function fetchAnalytics(
  token: string,
  { days, source, eventType }: UseAdminAnalyticsParams,
): Promise<AdminAnalyticsData> {
  const range = rangeOfLastDays(days);
  const [daily, funnel, topProducts, faceShapes] = await Promise.all([
    getDailyEventCounts(token, { ...range, source }),
    getFunnel(token, { ...range, source }),
    getTopProducts(token, { ...range, source, eventType, limit: TOP_PRODUCTS_LIMIT }),
    // Face analyses are not behavior events — the source filter does not apply.
    getFaceShapeDistribution(token, range),
  ]);
  return { daily, funnel, topProducts, faceShapes };
}

// Hành vi người dùng (plan 2026-09-29-15, T14) — the four admin analytics calls for one
// range/source/event-type selection. Same result shape as useOrders.ts.
export function useAdminAnalytics(params: UseAdminAnalyticsParams): UseAdminAnalyticsResult {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // One request sequence shared by the effect and refetch: only the latest request may update
  // state, so a slow older response (e.g. "Làm mới" then a filter change) never overwrites a
  // newer one or clears isLoading early. The effect cleanup bumps it to drop its request.
  const latestRequestRef = useRef(0);

  const { days, source, eventType } = params;

  const load = useCallback(async () => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;
    const isCurrent = () => latestRequestRef.current === requestId;

    const token = getAccessToken();
    if (!token) {
      setData(null);
      setIsLoading(false);
      setError(LOGIN_REQUIRED);
      return;
    }

    // Previous data stays visible while reloading; it is only replaced (or cleared on error)
    // once this request settles.
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAnalytics(token, { days, source, eventType });
      if (isCurrent()) setData(result);
    } catch (err) {
      if (isCurrent()) {
        setData(null);
        setError(err instanceof ApiError ? err.message : LOAD_FAILED);
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [days, source, eventType]);

  useEffect(() => {
    // Effect-local async wrapper, same shape as the runEffect() in useOrders.ts.
    async function runEffect() {
      await load();
    }

    void runEffect();

    return () => {
      latestRequestRef.current += 1;
    };
  }, [load]);

  return {
    daily: data?.daily ?? null,
    funnel: data?.funnel ?? null,
    topProducts: data?.topProducts ?? null,
    faceShapes: data?.faceShapes ?? null,
    isLoading,
    error,
    refetch: load,
  };
}
