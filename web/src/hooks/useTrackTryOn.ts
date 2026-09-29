"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/tracking/tracker";

// Face must be tracked with the same frame for this long (cumulative) to count as a try-on (AC6).
const TRY_ON_MIN_MS = 3000;
const TICK_MS = 250;

// Sends one TRY_ON per product per mount once the live camera has been in the "tracking" state
// for 3 s in total with that frame. Time accumulates across tracking on/off gaps and resets when
// the frame (productId) changes.
export function useTrackTryOn(productId: string | null, isTracking: boolean): void {
  const firedRef = useRef<Set<string>>(new Set());
  const accumulatedRef = useRef<{ productId: string | null; ms: number }>({ productId: null, ms: 0 });

  useEffect(() => {
    if (accumulatedRef.current.productId !== productId) {
      accumulatedRef.current = { productId, ms: 0 };
    }
    if (!productId || !isTracking || firedRef.current.has(productId)) return;

    const accumulated = accumulatedRef.current;
    let lastTick = Date.now();
    const addElapsed = () => {
      const now = Date.now();
      accumulated.ms += now - lastTick;
      lastTick = now;
    };

    const interval = setInterval(() => {
      addElapsed();
      if (accumulated.ms >= TRY_ON_MIN_MS && !firedRef.current.has(productId)) {
        firedRef.current.add(productId);
        clearInterval(interval);
        track("TRY_ON", productId, { durationMs: accumulated.ms });
      }
    }, TICK_MS);

    return () => {
      clearInterval(interval);
      addElapsed();
    };
  }, [productId, isTracking]);
}
