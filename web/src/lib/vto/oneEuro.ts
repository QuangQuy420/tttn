import type { GlassesPose } from "./pose";

export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export type SmoothingMode = "raw" | "ema" | "oneEuro";

export const DEFAULT_FILTER_PARAMS: OneEuroParams = { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 };
export const DEFAULT_EMA_ALPHA = 0.4;

function smoothingFactor(te: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / te);
}

// One Euro Filter (Casiez et al., CHI 2012 — https://gery.casiez.net/1euro/): a low-pass filter
// whose cutoff rises with the signal's speed, so it is smooth when still and responsive when moving.
export class OneEuroFilter {
  private readonly params: OneEuroParams;
  private prevX: number | null = null;
  private prevDx = 0;
  private prevT = 0;

  constructor(params: OneEuroParams) {
    this.params = params;
  }

  filter(x: number, tSeconds: number): number {
    if (this.prevX === null) {
      this.prevX = x;
      this.prevDx = 0;
      this.prevT = tSeconds;
      return x;
    }
    const te = tSeconds - this.prevT;
    if (te <= 0) return this.prevX;

    const { minCutoff, beta, dCutoff } = this.params;
    const dx = (x - this.prevX) / te;
    const aD = smoothingFactor(te, dCutoff);
    const dxHat = aD * dx + (1 - aD) * this.prevDx;
    const cutoff = minCutoff + beta * Math.abs(dxHat);
    const a = smoothingFactor(te, cutoff);
    const xHat = a * x + (1 - a) * this.prevX;

    this.prevX = xHat;
    this.prevDx = dxHat;
    this.prevT = tSeconds;
    return xHat;
  }

  reset(): void {
    this.prevX = null;
    this.prevDx = 0;
    this.prevT = 0;
  }
}

export class EmaFilter {
  private readonly alpha: number;
  private prev: number | null = null;

  constructor(alpha: number) {
    this.alpha = alpha;
  }

  filter(x: number): number {
    if (this.prev === null) {
      this.prev = x;
      return x;
    }
    this.prev = this.alpha * x + (1 - this.alpha) * this.prev;
    return this.prev;
  }

  reset(): void {
    this.prev = null;
  }
}

type Channel = "cx" | "cy" | "width" | "roll" | "yaw";
const CHANNELS: Channel[] = ["cx", "cy", "width", "roll", "yaw"];

// One filter per pose channel; `visible` is passed through untouched.
export class PoseSmoother {
  private readonly mode: SmoothingMode;
  private readonly filters: Record<Channel, { filter(x: number, t: number): number; reset(): void }>;
  private prevRawRoll: number | null = null;
  private rollOffset = 0;

  constructor(
    mode: SmoothingMode,
    params: OneEuroParams = DEFAULT_FILTER_PARAMS,
    emaAlpha: number = DEFAULT_EMA_ALPHA,
  ) {
    this.mode = mode;
    const make = () => (mode === "ema" ? new EmaFilter(emaAlpha) : new OneEuroFilter(params));
    this.filters = {
      cx: make(),
      cy: make(),
      width: make(),
      roll: make(),
      yaw: make(),
    };
  }

  smooth(pose: GlassesPose, tSeconds: number): GlassesPose {
    if (this.mode === "raw") return pose;

    // Unwrap roll against the previous raw roll (±2π) so a jump across ±π is filtered as a
    // small step instead of a full turn.
    let roll = pose.roll + this.rollOffset;
    if (this.prevRawRoll !== null) {
      while (roll - this.prevRawRoll > Math.PI) {
        roll -= 2 * Math.PI;
        this.rollOffset -= 2 * Math.PI;
      }
      while (roll - this.prevRawRoll < -Math.PI) {
        roll += 2 * Math.PI;
        this.rollOffset += 2 * Math.PI;
      }
    }
    this.prevRawRoll = roll;

    const input: Record<Channel, number> = {
      cx: pose.cx,
      cy: pose.cy,
      width: pose.width,
      roll,
      yaw: pose.yaw,
    };
    const out = { ...pose };
    for (const channel of CHANNELS) {
      out[channel] = this.filters[channel].filter(input[channel], tSeconds);
    }
    return out;
  }

  reset(): void {
    for (const channel of CHANNELS) this.filters[channel].reset();
    this.prevRawRoll = null;
    this.rollOffset = 0;
  }
}
