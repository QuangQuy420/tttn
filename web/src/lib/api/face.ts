import type { FaceAnalysisResult } from "@/types/face";
import { apiFetch } from "./client";

// Forwards to api-gateway's POST /api/face-analysis/analyze, which proxies to
// face-processing-service's POST /analyze. Mirrors uploadProductImage's FormData pattern
// (src/lib/api/products.ts). The multipart field name "file" matches
// face-processing-service/app/routers/face.py's `file: UploadFile` parameter.
export function analyzeFace(file: File): Promise<FaceAnalysisResult> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<FaceAnalysisResult>("/face-analysis/analyze", {
    method: "POST",
    body: form,
  });
}
