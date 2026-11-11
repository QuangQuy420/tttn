import type { ForYouResponse } from "@/types/recommendation";
import { getForYouRecommendations, getRecommendations } from "./recommendations";

const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalFetch = global.fetch;

function mockFetchOnce(body: unknown) {
  const mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

function headersOf(mockFetch: jest.Mock): Record<string, string> {
  return mockFetch.mock.calls[0][1].headers as Record<string, string>;
}

describe("recommendations api client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080/api";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("getForYouRecommendations GETs /recommendations/for-you with the bearer token + query and returns data (AC13)", async () => {
    const payload: ForYouResponse = {
      items: [],
      faceShape: "OVAL",
      faceAnalysisId: "fa-1",
      modelVersion: "v1",
      alpha: 0.6,
      beta: 0.4,
    };
    const mockFetch = mockFetchOnce({ success: true, message: "OK", data: payload });

    const result = await getForYouRecommendations("token-123", 8, "fa-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/recommendations/for-you?limit=8&faceAnalysisId=fa-1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );
    expect(result).toEqual(payload);
  });

  it("getRecommendations sends the bearer token only when one is passed (AC3)", async () => {
    const page = {
      success: true,
      message: "OK",
      data: [],
      meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
    };

    const withToken = mockFetchOnce(page);
    await getRecommendations("OVAL", { page: 1 }, "token-123");
    expect(withToken).toHaveBeenCalledWith(
      "http://localhost:8080/api/recommendations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ faceShape: "OVAL", page: 1 }),
      }),
    );
    expect(headersOf(withToken).Authorization).toBe("Bearer token-123");

    const withoutToken = mockFetchOnce(page);
    await getRecommendations("OVAL", { page: 1 });
    expect(headersOf(withoutToken)).not.toHaveProperty("Authorization");
  });
});
