import type { RecommendRequest, RecommendResponse } from "@/types/recommendation";
import { apiFetch } from "./client";

// Forwards to api-gateway's POST /api/recommendations, which proxies to
// recommendation-service's POST /recommend. Unauthenticated (Q2 in the plan) — mirrors
// GET /products' unauthenticated precedent, matches src/lib/api/face.ts:16-24's shape.
export function getRecommendations(
  faceShape: RecommendRequest["faceShape"],
  filters: Omit<RecommendRequest, "faceShape"> = {},
): Promise<RecommendResponse> {
  const body: RecommendRequest = { faceShape, ...filters };
  return apiFetch<RecommendResponse>("/recommendations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
