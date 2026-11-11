import { OneEuroFilter, PoseSmoother } from "./oneEuro";
import type { GlassesPose } from "./pose";

const FPS = 30;

function run(filter: OneEuroFilter, input: (i: number) => number, frames: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < frames; i++) out.push(filter.filter(input(i), i / FPS));
  return out;
}

describe("OneEuroFilter (AC6)", () => {
  it("returns a constant input unchanged", () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });

    const out = run(filter, () => 42, 30);

    out.forEach((v) => expect(v).toBeCloseTo(42, 10));
  });

  it("smooths a step and then converges to the new value", () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });

    const out = run(filter, (i) => (i < 10 ? 0 : 100), 10 + 3 * FPS);

    // First frame after the step is damped, not a jump to 100.
    expect(out[10]).toBeGreaterThan(0);
    expect(out[10]).toBeLessThan(50);
    expect(out[out.length - 1]).toBeGreaterThan(99);
  });

  it("lags less on a ramp when beta is higher", () => {
    const ramp = (i: number) => i * 10;
    const frames = 60;
    const slow = run(new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 }), ramp, frames);
    const fast = run(new OneEuroFilter({ minCutoff: 1, beta: 1, dCutoff: 1 }), ramp, frames);

    const lagSlow = ramp(frames - 1) - slow[frames - 1];
    const lagFast = ramp(frames - 1) - fast[frames - 1];
    expect(lagFast).toBeLessThan(lagSlow);
  });

  it("forgets its state after reset()", () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    run(filter, () => 0, 10);

    filter.reset();

    // The first sample after a reset is passed through as-is.
    expect(filter.filter(100, 10)).toBe(100);
  });
});

describe("PoseSmoother (AC6)", () => {
  const pose: GlassesPose = { cx: 100, cy: 200, width: 300, roll: 0.1, yaw: 0.2, visible: true };

  it("is the identity in raw mode", () => {
    const smoother = new PoseSmoother("raw");

    expect(smoother.smooth(pose, 0)).toBe(pose);
    const moved = { ...pose, cx: 500 };
    expect(smoother.smooth(moved, 1 / FPS)).toBe(moved);
  });

  it("damps a jump in every channel in oneEuro mode and keeps visible", () => {
    const smoother = new PoseSmoother("oneEuro");
    smoother.smooth(pose, 0);

    const out = smoother.smooth({ ...pose, cx: 200, visible: false }, 1 / FPS);

    expect(out.cx).toBeGreaterThan(100);
    expect(out.cx).toBeLessThan(200);
    expect(out.cy).toBeCloseTo(200, 10);
    expect(out.visible).toBe(false);
  });
});
