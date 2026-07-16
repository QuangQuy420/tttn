import type { FaceAnalysisResult } from "@/types/face";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// Forwards to api-gateway's POST /api/face-analysis/analyze, which proxies to
// face-processing-service's POST /analyze. Mirrors uploadProductImage's FormData pattern
// (src/lib/api/products.ts). The multipart field name "file" matches
// face-processing-service/app/routers/face.py's `file: UploadFile` parameter.
// Requires a logged-in user (JwtGuard on the gateway route) — the token's userId is forwarded
// by api-gateway as X-User-Id so face-processing-service knows who uploaded the photo.
export function analyzeFace(file: File, token: string): Promise<FaceAnalysisResult> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<FaceAnalysisResult>("/face-analysis/analyze", {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
}

// Forwards to api-gateway's GET /api/face-analysis/history, which proxies to
// face-processing-service's GET /analyses — returns only the calling user's past analyses.
export function getFaceAnalysisHistory(token: string): Promise<FaceAnalysisResult[]> {
  return apiFetch<FaceAnalysisResult[]>("/face-analysis/history", {
    method: "GET",
    headers: authHeaders(token),
  });
}
