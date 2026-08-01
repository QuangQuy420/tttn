"use client";

import { useEffect, useState } from "react";
import { getProducts } from "@/lib/api";
import type { FrameShape } from "@/types/product";

interface UseAvailableFrameShapesResult {
  frameShapes: FrameShape[];
}

// Only the frame shapes that actually appear in the catalog should show up as filter
// pills — the FrameShape enum has entries (e.g. OVAL, WAYFARER) no seeded product uses
// yet, and a pill for those would filter to an empty grid.
export function useAvailableFrameShapes(): UseAvailableFrameShapesResult {
  const [frameShapes, setFrameShapes] = useState<FrameShape[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const response = await getProducts({ limit: 100 });
        if (cancelled) return;
        const distinct = Array.from(new Set(response.items.map((product) => product.frameShape)));
        setFrameShapes(distinct);
      } catch {
        if (!cancelled) setFrameShapes([]);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { frameShapes };
}
