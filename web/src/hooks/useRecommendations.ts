"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, getRecommendations } from "@/lib/api";
import type { FaceShapeTag } from "@/types/product";
import type { RecommendedProduct } from "@/types/recommendation";

interface UseRecommendationsResult {
  items: RecommendedProduct[];
  isLoading: boolean;
  error: string | null;
  recommend: (faceShape: FaceShapeTag) => Promise<void>;
}

// Action-triggered (not fetch-on-mount) — mirrors useFaceAnalysis.ts's shape, called once the
// caller knows which face shape to ask for (e.g. read from a URL query param).
export function useRecommendations(): UseRecommendationsResult {
  const [items, setItems] = useState<RecommendedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Callers (RecommendationPreview, RecommendationsPage) re-call `recommend()` whenever their
  // `faceShape` changes — a request-generation counter (bumped on every call AND on unmount)
  // stops a slower, superseded response from clobbering a newer one, and stops any response
  // from setting state after the component using this hook has unmounted.
  const latestRequestId = useRef(0);

  useEffect(() => {
    return () => {
      latestRequestId.current += 1;
    };
  }, []);

  async function recommend(faceShape: FaceShapeTag) {
    const requestId = ++latestRequestId.current;
    setIsLoading(true);
    setError(null);
    setItems([]);
    try {
      const response = await getRecommendations(faceShape);
      if (requestId !== latestRequestId.current) return;
      setItems(response.items);
    } catch (err) {
      if (requestId !== latestRequestId.current) return;
      setItems([]);
      setError(
        err instanceof ApiError ? err.message : "Không thể tải danh sách gọng kính gợi ý.",
      );
    } finally {
      if (requestId === latestRequestId.current) setIsLoading(false);
    }
  }

  return { items, isLoading, error, recommend };
}
