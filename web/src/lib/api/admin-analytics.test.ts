import { ApiError } from "./client";
import {
  getDailyEventCounts,
  getFaceShapeDistribution,
  getFaceShapeModelInfo,
  getFunnel,
  getPreferenceModelInfo,
  getTopProducts,
} from "./admin-analytics";

const BASE_URL = "http://localhost:8080/api";
const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalFetch = global.fetch;

function mockOk(data: unknown): jest.Mock {
  const mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, message: "OK", data }),
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

// Returns the requested path + parsed query of the single fetch call.
function calledUrl(mockFetch: jest.Mock): URL {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  return new URL(mockFetch.mock.calls[0][0] as string);
}

const range = { from: "2026-09-01", to: "2026-09-30" };

describe("admin-analytics api client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = BASE_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("GETs the face-shape and preference model cards with the bearer token (AC1, AC2)", async () => {
    const card = { method: "rule", modelVersion: "rule-v0" };
    const mockFetch = mockOk(card);

    await expect(getFaceShapeModelInfo("token-123")).resolves.toEqual(card);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/admin/ai/face-shape-model`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );

    const pref = { loaded: false, alpha: 0.5 };
    const prefFetch = mockOk(pref);
    await expect(getPreferenceModelInfo("token-123")).resolves.toEqual(pref);
    expect(prefFetch).toHaveBeenCalledWith(
      `${BASE_URL}/admin/ai/preference-model`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends from/to/source to events/daily and funnel (AC4, AC5)", async () => {
    let mockFetch = mockOk({ days: [] });
    await getDailyEventCounts("t", { ...range, source: "simulator" });
    let url = calledUrl(mockFetch);
    expect(url.pathname).toBe("/api/admin/analytics/events/daily");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...range, source: "simulator" });

    mockFetch = mockOk({ steps: [] });
    await getFunnel("t", { ...range, source: "all" });
    url = calledUrl(mockFetch);
    expect(url.pathname).toBe("/api/admin/analytics/funnel");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...range, source: "all" });
  });

  it("sends eventType and limit only to top-products (AC6)", async () => {
    const mockFetch = mockOk({ items: [] });
    await getTopProducts("t", { ...range, source: "real", eventType: "PURCHASE", limit: 10 });
    const url = calledUrl(mockFetch);
    expect(url.pathname).toBe("/api/admin/analytics/top-products");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ...range,
      source: "real",
      eventType: "PURCHASE",
      limit: "10",
    });
  });

  it("never sends source to face-shapes, even if one is passed (AC7)", async () => {
    const mockFetch = mockOk({ total: 0, items: [] });
    // The type forbids `source`; the cast mimics a caller spreading a wider params object.
    await getFaceShapeDistribution("t", { ...range, source: "real" } as typeof range);
    const url = calledUrl(mockFetch);
    expect(url.pathname).toBe("/api/admin/analytics/face-shapes");
    expect(Object.fromEntries(url.searchParams)).toEqual(range);
  });

  it("sends no query string when no params are given", async () => {
    const mockFetch = mockOk({ steps: [] });
    await getFunnel("t");
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/admin/analytics/funnel`);
  });

  it("throws ApiError with the gateway's Vietnamese message on 400 (AC11)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        message: "Khoảng thời gian tối đa là 90 ngày.",
        error: { code: "VALIDATION_ERROR" },
      }),
    }) as unknown as typeof fetch;

    const promise = getDailyEventCounts("t", { from: "2026-01-01", to: "2026-09-30" });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 400,
      message: "Khoảng thời gian tối đa là 90 ngày.",
    });
  });
});
