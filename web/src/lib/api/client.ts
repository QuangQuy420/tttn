// Base HTTP wrapper for all gateway calls. Every function in src/lib/api goes through
// this module — never fetch a downstream service (product-service, user-service, ...)
// directly, and never hardcode a URL other than NEXT_PUBLIC_API_BASE_URL. See
// .claude/refs/coder.md §4.

import type { ApiErrorBody, ApiResponse, Paginated } from "@/types/api";

export class ApiError extends Error {
  readonly status: number;
  // `error.code` / `error.details` from the envelope (e.g. "CART_CHANGED"); null when the body
  // had none (network failure, non-JSON body).
  readonly code: string | null;
  readonly details: unknown;

  constructor(message: string, status: number, code: string | null = null, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new ApiError(
      "Chưa cấu hình địa chỉ API. Vui lòng liên hệ quản trị viên.",
      500,
    );
  }
  return baseUrl;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  // Multipart bodies (FormData, e.g. image uploads) must NOT get a JSON Content-Type — the
  // browser sets its own `multipart/form-data; boundary=...` header when it sees a FormData body.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(`Không thể kết nối đến cổng API (${path}).`, 0);
  }

  if (!response.ok) {
    let message = response.statusText || `Yêu cầu đến ${path} thất bại`;
    let code: string | null = null;
    let details: unknown = null;
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body?.message) message = body.message;
      code = body?.error?.code ?? null;
      details = body?.error?.details ?? null;
    } catch {
      // response body wasn't JSON — fall back to statusText.
    }
    throw new ApiError(message, response.status, code, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// Unwraps a single-item envelope and returns its `data` (undefined for a 204).
export async function apiFetchData<T>(path: string, options: RequestInit = {}): Promise<T> {
  const body = await apiFetch<ApiResponse<T> | undefined>(path, options);
  return body?.data as T;
}

// Unwraps a list envelope into `{ data, meta }`.
export async function apiFetchPage<T>(
  path: string,
  options: RequestInit = {},
): Promise<Paginated<T>> {
  const body = await apiFetch<ApiResponse<T[]>>(path, options);
  if (!body?.meta) {
    throw new ApiError(`Phản hồi từ ${path} thiếu thông tin phân trang.`, 500);
  }
  return { data: body.data, meta: body.meta };
}
