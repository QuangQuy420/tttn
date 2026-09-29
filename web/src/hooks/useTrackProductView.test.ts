import { renderHook } from "@testing-library/react";

jest.mock("@/lib/tracking/tracker", () => ({ track: jest.fn() }));

import { track } from "@/lib/tracking/tracker";
import { useTrackProductView } from "./useTrackProductView";

const mockedTrack = track as jest.Mock;

describe("useTrackProductView", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("leaving the page before 2 s sends no VIEW", () => {
    const { unmount } = renderHook(() => useTrackProductView("p1"));

    jest.advanceTimersByTime(1999);
    unmount();
    jest.advanceTimersByTime(5000);

    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it("staying 2 s sends exactly one VIEW for the product", () => {
    const { rerender } = renderHook(() => useTrackProductView("p1"));

    jest.advanceTimersByTime(2000);
    rerender();
    jest.advanceTimersByTime(10_000);

    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack).toHaveBeenCalledWith("VIEW", "p1", { durationMs: expect.any(Number) });
  });
});
