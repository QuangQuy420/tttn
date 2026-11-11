import { act, renderHook, waitFor } from "@testing-library/react";
import {
  ApiError,
  getDailyEventCounts,
  getFaceShapeDistribution,
  getFunnel,
  getTopProducts,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { useAdminAnalytics } from "./useAdminAnalytics";

jest.mock("@/lib/api", () => ({
  getDailyEventCounts: jest.fn(),
  getFunnel: jest.fn(),
  getTopProducts: jest.fn(),
  getFaceShapeDistribution: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

jest.mock("@/lib/auth/session", () => ({
  getAccessToken: jest.fn(),
}));

const mockedDaily = getDailyEventCounts as jest.Mock;
const mockedFunnel = getFunnel as jest.Mock;
const mockedTop = getTopProducts as jest.Mock;
const mockedFaceShapes = getFaceShapeDistribution as jest.Mock;
const mockedGetAccessToken = getAccessToken as jest.Mock;

const daily = { from: "x", to: "y", source: "real", days: [] };
const funnel = { from: "x", to: "y", source: "real", steps: [] };
const topProducts = { from: "x", to: "y", source: "real", eventType: "VIEW", items: [] };
const faceShapes = { from: "x", to: "y", total: 0, items: [] };

// Only Date is faked: built from LOCAL parts (00:30 local on 29 Sep 2026), so the expected
// local dates hold in any machine timezone. 00:30 also catches a UTC (toISOString) bug in
// timezones east of UTC such as Asia/Ho_Chi_Minh, where UTC is still 28 Sep.
const NOW = new Date(2026, 8, 29, 0, 30);

function mockAllResolved() {
  mockedDaily.mockResolvedValue(daily);
  mockedFunnel.mockResolvedValue(funnel);
  mockedTop.mockResolvedValue(topProducts);
  mockedFaceShapes.mockResolvedValue(faceShapes);
}

describe("useAdminAnalytics", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("starts loading, then returns the four datasets for the last 7 local days (AC4–AC7)", async () => {
    mockedGetAccessToken.mockReturnValue("token-123");
    mockAllResolved();

    const { result } = renderHook(() =>
      useAdminAnalytics({ days: 7, source: "simulator", eventType: "LIKE" }),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const range = { from: "2026-09-23", to: "2026-09-29" };
    expect(mockedDaily).toHaveBeenCalledWith("token-123", { ...range, source: "simulator" });
    expect(mockedFunnel).toHaveBeenCalledWith("token-123", { ...range, source: "simulator" });
    expect(mockedTop).toHaveBeenCalledWith("token-123", {
      ...range,
      source: "simulator",
      eventType: "LIKE",
      limit: 10,
    });
    // Face-shape distribution ignores the source filter.
    expect(mockedFaceShapes).toHaveBeenCalledWith("token-123", range);

    expect(result.current.daily).toEqual(daily);
    expect(result.current.funnel).toEqual(funnel);
    expect(result.current.topProducts).toEqual(topProducts);
    expect(result.current.faceShapes).toEqual(faceShapes);
    expect(result.current.error).toBeNull();
  });

  it("makes '90 ngày' exactly 90 days, crossing month boundaries (AC4, AC11)", async () => {
    mockedGetAccessToken.mockReturnValue("token-123");
    mockAllResolved();

    const { result } = renderHook(() =>
      useAdminAnalytics({ days: 90, source: "real", eventType: "VIEW" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 2026-07-02 .. 2026-09-29 inclusive = 30 (Jul) + 31 (Aug) + 29 (Sep) = 90 days.
    expect(mockedFaceShapes).toHaveBeenCalledWith("token-123", {
      from: "2026-07-02",
      to: "2026-09-29",
    });
  });

  it("keeps the latest filter's data when an older load resolves after it", async () => {
    mockedGetAccessToken.mockReturnValue("token-123");
    mockAllResolved();

    // Manually controlled daily responses: first load (7 days) and second load (30 days).
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const firstDaily = { ...daily, from: "2026-09-23", days: [] };
    const secondDaily = { ...daily, from: "2026-08-31", days: [] };
    mockedDaily
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));

    const { result, rerender } = renderHook(
      (props: { days: number }) =>
        useAdminAnalytics({ days: props.days, source: "real", eventType: "VIEW" }),
      { initialProps: { days: 7 } },
    );
    rerender({ days: 30 });
    expect(mockedDaily).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(true);

    // The latest (second) load finishes first.
    await act(async () => {
      resolveSecond(secondDaily);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.daily).toEqual(secondDaily);

    // The stale first load finishes last and must not overwrite anything.
    await act(async () => {
      resolveFirst(firstDaily);
    });
    expect(result.current.daily).toEqual(secondDaily);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces an ApiError message and no data when a request fails", async () => {
    mockedGetAccessToken.mockReturnValue("token-123");
    mockAllResolved();
    mockedFunnel.mockRejectedValue(new ApiError("recommendation-service không phản hồi.", 503));

    const { result } = renderHook(() =>
      useAdminAnalytics({ days: 30, source: "real", eventType: "VIEW" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("recommendation-service không phản hồi.");
    expect(result.current.daily).toBeNull();
    expect(result.current.funnel).toBeNull();
  });

  it("asks to log in again and calls nothing without a token", async () => {
    mockedGetAccessToken.mockReturnValue(null);

    const { result } = renderHook(() =>
      useAdminAnalytics({ days: 30, source: "real", eventType: "VIEW" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Vui lòng đăng nhập lại.");
    expect(mockedDaily).not.toHaveBeenCalled();
  });
});
