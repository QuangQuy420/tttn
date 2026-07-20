"use client";

import { useEffect, useState } from "react";
import { ApiError, getOrders } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { GetOrdersParams, OrderPageResponse, OrderSummary } from "@/types/order";

interface UseOrdersResult {
  orders: OrderSummary[];
  page: number;
  totalPages: number;
  totalElements: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Order history is always for the logged-in user — reads the access token itself, same as
// useCart. See useProducts.ts for the state/effect/cancellation pattern this mirrors.
export function useOrders(params: GetOrdersParams): UseOrdersResult {
  const [response, setResponse] = useState<OrderPageResponse<OrderSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, page, size } = params;

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
      const result = await getOrders(token, { status, page, size });
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
        const result = await getOrders(token, { status, page, size });
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
  }, [status, page, size]);

  return {
    orders: response?.content ?? [],
    page: response?.page ?? 0,
    totalPages: response?.totalPages ?? 0,
    totalElements: response?.totalElements ?? 0,
    isLoading,
    error,
    refetch: run,
  };
}
