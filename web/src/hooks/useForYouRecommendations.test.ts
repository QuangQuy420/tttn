import { renderHook, waitFor } from "@testing-library/react";
import { ApiError, getForYouRecommendations } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { RecommendedProduct } from "@/types/recommendation";
import { useForYouRecommendations } from "./useForYouRecommendations";

jest.mock("@/lib/api", () => ({
  getForYouRecommendations: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

jest.mock("@/lib/auth/session", () => ({
  getAccessToken: jest.fn(),
}));

const mockedGetForYou = getForYouRecommendations as jest.Mock;
const mockedGetAccessToken = getAccessToken as jest.Mock;

describe("useForYouRecommendations", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("does not fetch and returns no items when logged out (AC14)", async () => {
    mockedGetAccessToken.mockReturnValue(null);

    const { result } = renderHook(() => useForYouRecommendations(8));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedGetForYou).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("loads the for-you items with the access token when logged in (AC13)", async () => {
    const items = [{ id: "p1", name: "Aviator Classic" }] as RecommendedProduct[];
    mockedGetAccessToken.mockReturnValue("token-123");
    mockedGetForYou.mockResolvedValue({
      items,
      faceShape: "OVAL",
      faceAnalysisId: "fa-1",
      modelVersion: "v1",
      alpha: 0.6,
      beta: 0.4,
    });

    const { result } = renderHook(() => useForYouRecommendations(8));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedGetForYou).toHaveBeenCalledWith("token-123", 8);
    expect(result.current.items).toEqual(items);
    expect(result.current.error).toBeNull();
  });

  it("surfaces an API error message and clears items (AC13)", async () => {
    mockedGetAccessToken.mockReturnValue("token-123");
    mockedGetForYou.mockRejectedValue(new ApiError("Phiên đăng nhập đã hết hạn", 401));

    const { result } = renderHook(() => useForYouRecommendations(8));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Phiên đăng nhập đã hết hạn");
    expect(result.current.items).toEqual([]);
  });
});
