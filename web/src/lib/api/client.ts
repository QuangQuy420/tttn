// Base HTTP wrapper for all gateway calls. Every function in src/lib/api goes through
// this module — never fetch a downstream service (product-service, user-service, ...)
// directly, and never hardcode a URL other than NEXT_PUBLIC_API_BASE_URL. See
// .claude/refs/coder.md §4.

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new ApiError(
      "NEXT_PUBLIC_API_BASE_URL is not set — web must always call api-gateway through this env var.",
      500,
    );
  }
  return baseUrl;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(`Could not reach the API gateway (${path}).`, 0);
  }

  if (!response.ok) {
    let message = response.statusText || `Request to ${path} failed`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // response body wasn't JSON — fall back to statusText.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
