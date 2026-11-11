import type { Paginated } from "@/types/api";
import type {
  ForYouResponse,
  RecommendRequest,
  RecommendedProduct,
} from "@/types/recommendation";
import { apiFetchData, apiFetchPage } from "./client";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// Forwards to api-gateway's POST /api/recommendations, which proxies to
// recommendation-service's POST /recommend. Works without a token (mirrors GET /products'
// unauthenticated precedent); an optional token lets the gateway forward X-User-Id so the
// ranking can be personalised. Paginated via `page`/`limit` in the POST body (not the query string).
export function getRecommendations(
  faceShape: RecommendRequest["faceShape"],
  filters: Omit<RecommendRequest, "faceShape"> = {},
  token?: string,
): Promise<Paginated<RecommendedProduct>> {
  const body: RecommendRequest = { faceShape, ...filters };
  return apiFetchPage<RecommendedProduct>("/recommendations", {
    method: "POST",
    headers: token ? authHeaders(token) : undefined,
    body: JSON.stringify(body),
  });
}

// Forwards to api-gateway's GET /api/recommendations/for-you (JwtGuard — 401 without a token),
// which proxies to recommendation-service's GET /recommendations/for-you. Single envelope, no
// pagination. faceAnalysisId pins one of the user's own analyses instead of the latest one.
export function getForYouRecommendations(
  token: string,
  limit?: number,
  faceAnalysisId?: string,
): Promise<ForYouResponse> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (faceAnalysisId) params.set("faceAnalysisId", faceAnalysisId);
  const query = params.toString();
  return apiFetchData<ForYouResponse>(
    `/recommendations/for-you${query ? `?${query}` : ""}`,
    {
      method: "GET",
      headers: authHeaders(token),
    },
  );
}
