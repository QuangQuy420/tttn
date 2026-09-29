import { renderHook } from "@testing-library/react";

jest.mock("@/lib/tracking/tracker", () => ({ track: jest.fn() }));

import { track } from "@/lib/tracking/tracker";
import { useTrackTryOn } from "./useTrackTryOn";

const mockedTrack = track as jest.Mock;

describe("useTrackTryOn", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("accumulates tracking time across on/off gaps and sends one TRY_ON at 3 s", () => {
    const { rerender } = renderHook(({ tracking }) => useTrackTryOn("p1", tracking), {
      initialProps: { tracking: true },
    });

    // 2 s tracked, then the face is lost for 5 s (not counted).
    jest.advanceTimersByTime(2000);
    rerender({ tracking: false });
    jest.advanceTimersByTime(5000);
    expect(mockedTrack).not.toHaveBeenCalled();

    // Tracking resumes: 2 s + 0.75 s = 2.75 s total — still below the threshold.
    rerender({ tracking: true });
    jest.advanceTimersByTime(750);
    expect(mockedTrack).not.toHaveBeenCalled();

    // Reaching 3 s total fires exactly once, even if tracking continues.
    jest.advanceTimersByTime(250);
    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack).toHaveBeenCalledWith("TRY_ON", "p1", { durationMs: expect.any(Number) });
    expect(mockedTrack.mock.calls[0][2].durationMs).toBeGreaterThanOrEqual(3000);

    jest.advanceTimersByTime(10_000);
    rerender({ tracking: false });
    rerender({ tracking: true });
    jest.advanceTimersByTime(10_000);
    expect(mockedTrack).toHaveBeenCalledTimes(1);
  });
});
