// Base HTTP wrapper for all gateway calls. Every function in src/lib/api goes through
// this module — never fetch a downstream service (product-service, user-service, ...)
// directly, and never hardcode a URL other than NEXT_PUBLIC_API_BASE_URL. See
// .claude/refs/coder.md §4.

import { expireSession } from "@/lib/auth/session";
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

// The token of the request's `Authorization: Bearer <token>` header (any HeadersInit shape), or
// null. Read by hand because `Headers` is not available in every runtime this module runs in
// (jest/jsdom).
function bearerTokenOf(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  let value: string | null | undefined;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    value = headers.get("Authorization");
  } else {
    const entries = Array.isArray(headers) ? headers : Object.entries(headers);
    value = entries.find(([name]) => name.toLowerCase() === "authorization")?.[1];
  }
  const match = value ? /^Bearer\s+(.+)$/i.exec(value.trim()) : null;
  return match ? match[1] : null;
}

// Turns `ApiError.details` into a field → message map for showing errors next to form fields
// (AC65). user-service validation errors send an object `{ field: message }`, which is used as
// is; gateway class-validator errors send a `string[]` (no field names) and anything else yields
// an empty map, so the form falls back to the general error message.
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const { details } = error;
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};

  const result: Record<string, string> = {};
  for (const [field, message] of Object.entries(details as Record<string, unknown>)) {
    if (typeof message === "string" && message) result[field] = message;
  }
  return result;
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
    // A 401 on a request that sent a token means the token expired or was revoked (AC6).
    const sentToken = response.status === 401 ? bearerTokenOf(options.headers) : null;
    if (sentToken) expireSession(sentToken);

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
