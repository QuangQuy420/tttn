"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, getForYouRecommendations } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { RecommendedProduct } from "@/types/recommendation";

const LOAD_ERROR_MESSAGE = "Không thể tải danh sách gợi ý dành cho bạn.";

interface UseForYouRecommendationsResult {
  items: RecommendedProduct[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// "Dành cho bạn" is always for the logged-in user — reads the access token itself (mirrors
// useCart.ts) and skips the fetch when there is none, since GET /recommendations/for-you requires
// auth. Refetches on "auth-change" so login/logout shows/hides the list without a reload.
export function useForYouRecommendations(limit?: number): UseForYouRecommendationsResult {
  const [items, setItems] = useState<RecommendedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Request-generation counter (same pattern as useRecommendations.ts): every run bumps it, so a
  // slower response from an earlier run (e.g. user A's fetch still in flight after logout, or
  // after logging in as user B) never overwrites the newer state.
  const latestRequestId = useRef(0);

  async function run() {
    const requestId = ++latestRequestId.current;
    const isStale = () => requestId !== latestRequestId.current;

    const token = getAccessToken();
    if (!token) {
      setItems([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setItems([]);
    try {
      const response = await getForYouRecommendations(token, limit);
      if (!isStale()) setItems(response.items);
    } catch (err) {
      if (!isStale()) {
        setItems([]);
        setError(err instanceof ApiError ? err.message : LOAD_ERROR_MESSAGE);
      }
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runEffect() {
      const requestId = ++latestRequestId.current;
      const isStale = () => cancelled || requestId !== latestRequestId.current;

      const token = getAccessToken();
      if (!token) {
        if (!isStale()) {
          setItems([]);
          setIsLoading(false);
          setError(null);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      setItems([]);
      try {
        const response = await getForYouRecommendations(token, limit);
        if (!isStale()) setItems(response.items);
      } catch (err) {
        if (!isStale()) {
          setItems([]);
          setError(err instanceof ApiError ? err.message : LOAD_ERROR_MESSAGE);
        }
      } finally {
        if (!isStale()) setIsLoading(false);
      }
    }

    void runEffect();

    function handleAuthChange() {
      void runEffect();
    }

    window.addEventListener("auth-change", handleAuthChange);

    return () => {
      cancelled = true;
      window.removeEventListener("auth-change", handleAuthChange);
    };
  }, [limit]);

  return { items, isLoading, error, refetch: run };
}
