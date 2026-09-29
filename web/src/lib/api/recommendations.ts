import type { Paginated } from "@/types/api";
import type { RecommendRequest, RecommendedProduct } from "@/types/recommendation";
import { apiFetchPage } from "./client";

// Forwards to api-gateway's POST /api/recommendations, which proxies to
// recommendation-service's POST /recommend. Unauthenticated (Q2 in the plan) — mirrors
// GET /products' unauthenticated precedent, matches src/lib/api/face.ts:16-24's shape.
// Paginated via `page`/`limit` in the POST body (not the query string).
export function getRecommendations(
  faceShape: RecommendRequest["faceShape"],
  filters: Omit<RecommendRequest, "faceShape"> = {},
): Promise<Paginated<RecommendedProduct>> {
  const body: RecommendRequest = { faceShape, ...filters };
  return apiFetchPage<RecommendedProduct>("/recommendations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
