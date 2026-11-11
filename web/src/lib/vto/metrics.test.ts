import { jitter, RollingStats, summarize, toCsv } from "./metrics";
import type { BenchmarkFrame } from "./metrics";
import type { GlassesPose } from "./pose";

function pose(cx: number, cy = 0, width = 100): GlassesPose {
  return { cx, cy, width, roll: 0, yaw: 0, visible: true };
}

describe("RollingStats", () => {
  it("returns the nearest-rank p50 / p95 of the window", () => {
    const stats = new RollingStats(100);
    for (let v = 100; v >= 1; v--) stats.push(v);

    expect(stats.percentile(50)).toBe(50);
    expect(stats.percentile(95)).toBe(95);
    expect(stats.mean()).toBe(50.5);
  });
});

describe("jitter (AC10)", () => {
  it("is 0 for a constant series and the std dev otherwise", () => {
    expect(jitter([pose(5), pose(5), pose(5)])).toEqual({ cx: 0, cy: 0, width: 0 });
    expect(jitter([pose(0), pose(2)]).cx).toBeCloseTo(1, 10);
  });
});

const frames: BenchmarkFrame[] = [
  { tMs: 0, latencyMs: 10, faceFound: true, raw: pose(0), ema: pose(1), oneEuro: pose(1) },
  { tMs: 33, latencyMs: 20, faceFound: false, raw: null, ema: null, oneEuro: null },
  { tMs: 66, latencyMs: 30, faceFound: true, raw: pose(2), ema: pose(1), oneEuro: pose(1) },
  { tMs: 99, latencyMs: 40, faceFound: true, raw: pose(4), ema: pose(1), oneEuro: pose(1) },
];

describe("summarize (AC10)", () => {
  it("computes fps, latency percentiles, face ratio and jitter per filter", () => {
    const summary = summarize(frames, 2);

    expect(summary.frames).toBe(4);
    expect(summary.fpsMean).toBe(2);
    expect(summary.latencyMs).toEqual({ mean: 25, p50: 20, p95: 40 });
    expect(summary.faceFoundRatio).toBe(0.75);
    // raw cx = [0, 2, 4] → population std dev sqrt(8/3); ema/oneEuro constant → 0.
    expect(summary.jitter.raw.cx).toBeCloseTo(Math.sqrt(8 / 3), 10);
    expect(summary.jitter.ema.cx).toBe(0);
    expect(summary.jitter.oneEuro.cx).toBe(0);
  });
});

describe("toCsv (AC10)", () => {
  it("writes a header and one row per frame, empty cells for a missing pose", () => {
    const lines = toCsv(frames.slice(0, 2)).split("\n");

    expect(lines[0]).toBe(
      "t_ms,latency_ms,face_found," +
        "raw_cx,raw_cy,raw_width,raw_roll,raw_yaw," +
        "ema_cx,ema_cy,ema_width,ema_roll,ema_yaw," +
        "oneeuro_cx,oneeuro_cy,oneeuro_width,oneeuro_roll,oneeuro_yaw",
    );
    expect(lines[1]).toBe("0,10,1,0,0,100,0,0,1,0,100,0,0,1,0,100,0,0");
    expect(lines[2]).toBe("33,20,0" + ",".repeat(15));
    expect(lines[3]).toBe("");
  });
});
