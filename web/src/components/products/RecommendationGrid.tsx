import type { RecommendedProduct } from "@/types/recommendation";
import { RecommendationCard } from "./RecommendationCard";

// Mirrors ProductGrid.tsx's shape (dumb grid, no loading/error/empty handling of its own —
// callers own that, since RecommendationsPage's and RecommendationPreview's empty-state copy
// differ from ProductGrid's).
interface RecommendationGridProps {
  products: RecommendedProduct[];
}

export function RecommendationGrid({ products }: RecommendationGridProps) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <RecommendationCard key={product.id} product={product} />
      ))}
    </div>
  );
}
