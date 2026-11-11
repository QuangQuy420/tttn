import type { GlassesPose } from "./pose";

export interface LostFaceTrackerOptions {
  holdMs?: number;
  fadeMs?: number;
}

export interface TrackedPose {
  pose: GlassesPose | null;
  alpha: number;
  lost: boolean;
}

// Short landmark dropouts: keep the last pose for holdMs, then fade it out over fadeMs. The
// caller passes the already-smoothed pose and checks isLost() before smoothing a new raw pose to
// decide whether to reset its smoother.
export class LostFaceTracker {
  private readonly holdMs: number;
  private readonly fadeMs: number;
  private lastPose: GlassesPose | null = null;
  private lastSeenMs = 0;

  constructor({ holdMs = 300, fadeMs = 250 }: LostFaceTrackerOptions = {}) {
    this.holdMs = holdMs;
    this.fadeMs = fadeMs;
  }

  isLost(nowMs: number): boolean {
    return this.lastPose === null || nowMs - this.lastSeenMs > this.holdMs;
  }

  update(pose: GlassesPose | null, nowMs: number): TrackedPose {
    if (pose) {
      this.lastPose = pose;
      this.lastSeenMs = nowMs;
      return { pose, alpha: 1, lost: false };
    }
    if (!this.lastPose) return { pose: null, alpha: 0, lost: true };

    const gap = nowMs - this.lastSeenMs;
    if (gap <= this.holdMs) return { pose: this.lastPose, alpha: 1, lost: false };

    const fadeElapsed = gap - this.holdMs;
    if (fadeElapsed >= this.fadeMs) return { pose: null, alpha: 0, lost: true };
    return { pose: this.lastPose, alpha: 1 - fadeElapsed / this.fadeMs, lost: true };
  }

  reset(): void {
    this.lastPose = null;
    this.lastSeenMs = 0;
  }
}
