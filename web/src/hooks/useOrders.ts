"use client";

import { useEffect, useState } from "react";
import { ApiError, getOrders } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { PageMeta, Paginated } from "@/types/api";
import type { GetOrdersParams, OrderSummary } from "@/types/order";

interface UseOrdersResult {
  orders: OrderSummary[];
  meta: PageMeta | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Order history is always for the logged-in user — reads the access token itself, same as
// useCart. See useProducts.ts for the state/effect/cancellation pattern this mirrors.
export function useOrders(params: GetOrdersParams): UseOrdersResult {
  const [response, setResponse] = useState<Paginated<OrderSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, page, limit } = params;

  async function run() {
    const token = getAccessToken();
    if (!token) {
      setResponse(null);
      setIsLoading(false);
      setError("Bạn cần đăng nhập để xem lịch sử đơn hàng.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrders(token, { status, page, limit });
      setResponse(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tải danh sách đơn hàng.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runEffect() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setResponse(null);
          setIsLoading(false);
          setError("Bạn cần đăng nhập để xem lịch sử đơn hàng.");
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getOrders(token, { status, page, limit });
        if (!cancelled) setResponse(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải danh sách đơn hàng.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void runEffect();

    return () => {
      cancelled = true;
    };
  }, [status, page, limit]);

  return {
    orders: response?.data ?? [],
    meta: response?.meta ?? null,
    isLoading,
    error,
    refetch: run,
  };
}
