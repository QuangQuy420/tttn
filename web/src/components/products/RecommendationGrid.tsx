"use client";

import { useSyncExternalStore } from "react";
import type { RecommendedProduct } from "@/types/recommendation";
import { RecommendationCard } from "./RecommendationCard";

// `?debug=1` shows the Preference/FaceFit score bars on each card. Read from window.location once
// via useSyncExternalStore (server snapshot false) instead of useSearchParams(), which would need
// a Suspense boundary on every page that renders this grid (e.g. /face-analysis has none).
function subscribe(): () => void {
  return () => {};
}

function getShowScoresSnapshot(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function getShowScoresServerSnapshot(): boolean {
  return false;
}

// Mirrors ProductGrid.tsx's shape (dumb grid, no loading/error/empty handling of its own —
// callers own that, since RecommendationsPage's and RecommendationPreview's empty-state copy
// differ from ProductGrid's).
interface RecommendationGridProps {
  products: RecommendedProduct[];
  // Forwarded to each RecommendationCard — see RecommendationCard.tsx for when this is present.
  onTryOnPhoto?: (product: RecommendedProduct) => void;
}

export function RecommendationGrid({ products, onTryOnPhoto }: RecommendationGridProps) {
  const showScores = useSyncExternalStore(
    subscribe,
    getShowScoresSnapshot,
    getShowScoresServerSnapshot,
  );

  return (
    <div className="product-grid">
      {products.map((product) => (
        <RecommendationCard
          key={product.id}
          product={product}
          onTryOnPhoto={onTryOnPhoto}
          showScores={showScores}
        />
      ))}
    </div>
  );
}
