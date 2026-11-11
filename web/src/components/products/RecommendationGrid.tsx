"use client";

import { useDebugFlag } from "@/hooks/useDebugFlag";
import type { RecommendedProduct } from "@/types/recommendation";
import { RecommendationCard } from "./RecommendationCard";

// Mirrors ProductGrid.tsx's shape (dumb grid, no loading/error/empty handling of its own —
// callers own that, since RecommendationsPage's and RecommendationPreview's empty-state copy
// differ from ProductGrid's).
interface RecommendationGridProps {
  products: RecommendedProduct[];
  // Forwarded to each RecommendationCard — see RecommendationCard.tsx for when this is present.
  onTryOnPhoto?: (product: RecommendedProduct) => void;
}

export function RecommendationGrid({ products, onTryOnPhoto }: RecommendationGridProps) {
  // `?debug=1` shows the Preference/FaceFit score bars on each card (see useDebugFlag.ts).
  const showScores = useDebugFlag();

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
