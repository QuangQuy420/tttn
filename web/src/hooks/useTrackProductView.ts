"use client";

import { useEffect } from "react";
import { track } from "@/lib/tracking/tracker";

// A product page counts as "viewed" only after this dwell time (AC5).
const VIEW_DWELL_MS = 2000;

// Sends one VIEW once the product page has been open for 2 s; leaving (unmount or switching
// product) before that sends nothing. `track` itself skips anonymous visitors.
export function useTrackProductView(productId: string | null): void {
  useEffect(() => {
    if (!productId) return;

    const startedAt = Date.now();
    const timer = setTimeout(() => {
      track("VIEW", productId, { durationMs: Date.now() - startedAt });
    }, VIEW_DWELL_MS);

    return () => clearTimeout(timer);
  }, [productId]);
}
