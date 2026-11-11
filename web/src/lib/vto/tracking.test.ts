import { LostFaceTracker } from "./tracking";
import type { GlassesPose } from "./pose";

const pose: GlassesPose = { cx: 100, cy: 200, width: 300, roll: 0, yaw: 0, visible: true };

describe("LostFaceTracker (AC7, AC8)", () => {
  function seen(): LostFaceTracker {
    const tracker = new LostFaceTracker();
    tracker.update(pose, 1000);
    return tracker;
  }

  it("holds the last pose at full alpha for a 200 ms dropout", () => {
    const tracker = seen();

    expect(tracker.update(null, 1200)).toEqual({ pose, alpha: 1, lost: false });
    expect(tracker.isLost(1200)).toBe(false);
  });

  it("fades the last pose after 300 ms and reports it lost", () => {
    const tracker = seen();

    const out = tracker.update(null, 1400);

    expect(out.pose).toBe(pose);
    expect(out.alpha).toBeGreaterThan(0);
    expect(out.alpha).toBeLessThan(1);
    expect(out.lost).toBe(true);
    expect(tracker.isLost(1400)).toBe(true);
  });

  it("drops the pose after a 1 s dropout", () => {
    const tracker = seen();

    expect(tracker.update(null, 2000)).toEqual({ pose: null, alpha: 0, lost: true });
  });

  it("shows a new pose at full alpha when the face comes back", () => {
    const tracker = seen();
    tracker.update(null, 2000);
    const next = { ...pose, cx: 150 };

    expect(tracker.update(next, 2100)).toEqual({ pose: next, alpha: 1, lost: false });
    expect(tracker.isLost(2100)).toBe(false);
  });
});
