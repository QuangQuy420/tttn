import type { GlassesPose } from "./pose";

// Fixed-size window of the latest samples (e.g. detect latency in ms).
export class RollingStats {
  private readonly windowSize: number;
  private readonly values: number[] = [];

  constructor(windowSize: number) {
    this.windowSize = windowSize;
  }

  push(v: number): void {
    this.values.push(v);
    if (this.values.length > this.windowSize) this.values.shift();
  }

  mean(): number {
    return mean(this.values);
  }

  percentile(p: number): number {
    return percentile(this.values, p);
  }
}

// Frames rendered in the last 1000 ms.
export class FpsMeter {
  private readonly ticks: number[] = [];
  private lastNowMs = 0;

  tick(nowMs: number): void {
    this.ticks.push(nowMs);
    this.lastNowMs = nowMs;
    while (this.ticks.length > 0 && nowMs - this.ticks[0] > 1000) this.ticks.shift();
  }

  fps(): number {
    return this.ticks.filter((t) => this.lastNowMs - t <= 1000).length;
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Nearest-rank percentile on the sorted values; 0 when empty.
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

// Population standard deviation; 0 for fewer than 2 samples.
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export interface Jitter {
  cx: number;
  cy: number;
  width: number;
}

export function jitter(poses: GlassesPose[]): Jitter {
  return {
    cx: stdDev(poses.map((p) => p.cx)),
    cy: stdDev(poses.map((p) => p.cy)),
    width: stdDev(poses.map((p) => p.width)),
  };
}

export interface BenchmarkFrame {
  tMs: number;
  latencyMs: number;
  faceFound: boolean;
  raw: GlassesPose | null;
  ema: GlassesPose | null;
  oneEuro: GlassesPose | null;
}

export interface BenchmarkSummary {
  frames: number;
  fpsMean: number;
  latencyMs: { mean: number; p50: number; p95: number };
  faceFoundRatio: number;
  jitter: { raw: Jitter; ema: Jitter; oneEuro: Jitter };
}

export interface BenchmarkMeta {
  durationS: number;
  [key: string]: unknown;
}

function posesOf(frames: BenchmarkFrame[], key: "raw" | "ema" | "oneEuro"): GlassesPose[] {
  return frames
    .filter((f) => f.faceFound)
    .map((f) => f[key])
    .filter((p): p is GlassesPose => p !== null);
}

export function summarize(frames: BenchmarkFrame[], durationS: number): BenchmarkSummary {
  const latencies = frames.map((f) => f.latencyMs);
  const found = frames.filter((f) => f.faceFound).length;
  return {
    frames: frames.length,
    fpsMean: durationS > 0 ? frames.length / durationS : 0,
    latencyMs: {
      mean: mean(latencies),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    },
    faceFoundRatio: frames.length > 0 ? found / frames.length : 0,
    jitter: {
      raw: jitter(posesOf(frames, "raw")),
      ema: jitter(posesOf(frames, "ema")),
      oneEuro: jitter(posesOf(frames, "oneEuro")),
    },
  };
}

export function toJson(meta: BenchmarkMeta, frames: BenchmarkFrame[]): string {
  const summary = summarize(frames, meta.durationS);
  return JSON.stringify({ meta, summary, frames }, null, 2);
}

const POSE_FIELDS = ["cx", "cy", "width", "roll", "yaw"] as const;
const CSV_PREFIXES = ["raw", "ema", "oneeuro"] as const;

function poseCells(pose: GlassesPose | null): string[] {
  return POSE_FIELDS.map((field) => (pose ? String(pose[field]) : ""));
}

export function toCsv(frames: BenchmarkFrame[]): string {
  const header = [
    "t_ms",
    "latency_ms",
    "face_found",
    ...CSV_PREFIXES.flatMap((prefix) => POSE_FIELDS.map((field) => `${prefix}_${field}`)),
  ].join(",");
  const rows = frames.map((f) =>
    [
      String(f.tMs),
      String(f.latencyMs),
      f.faceFound ? "1" : "0",
      ...poseCells(f.raw),
      ...poseCells(f.ema),
      ...poseCells(f.oneEuro),
    ].join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}
