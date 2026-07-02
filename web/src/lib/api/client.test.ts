import { ApiError, apiFetch } from "./client";

const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalFetch = global.fetch;

describe("apiFetch", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080/api";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("calls the gateway base URL and returns parsed JSON on success", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "1", name: "Aviator" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await apiFetch<{ id: string; name: string }>("/products/1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/products/1",
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) }),
    );
    expect(result).toEqual({ id: "1", name: "Aviator" });
  });

  it("never calls a URL other than NEXT_PUBLIC_API_BASE_URL + path (gateway-only)", async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = mockFetch as unknown as typeof fetch;

    await apiFetch("/categories");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl.startsWith("http://localhost:8080/api")).toBe(true);
  });

  it("returns undefined for a 204 No Content response", async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await apiFetch("/products/1");

    expect(result).toBeUndefined();
  });

  it("throws an ApiError with the downstream message when the response is not ok", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ message: "Product not found" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(apiFetch("/products/missing")).rejects.toMatchObject({
      message: "Product not found",
      status: 404,
    });
  });

  it("falls back to statusText when the error response body isn't JSON", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("not json");
      },
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(apiFetch("/products")).rejects.toMatchObject({
      message: "Internal Server Error",
      status: 500,
    });
  });

  it("wraps a network failure (gateway unreachable) as an ApiError", async () => {
    const mockFetch = jest.fn().mockRejectedValue(new TypeError("fetch failed"));
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(apiFetch("/products")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/products")).rejects.toMatchObject({ status: 0 });
  });

  it("throws without calling fetch when NEXT_PUBLIC_API_BASE_URL is not configured", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(apiFetch("/products")).rejects.toBeInstanceOf(ApiError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
