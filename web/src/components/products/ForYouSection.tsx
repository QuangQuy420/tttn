"use client";

import { useForYouRecommendations } from "@/hooks/useForYouRecommendations";
import { RecommendationGrid } from "./RecommendationGrid";

// Home-page "Dành cho bạn" list (GET /recommendations/for-you). Renders nothing when logged out,
// on error, or with zero items — items start empty, so nothing shows until the fetch resolves
// (no loading spinner pushing the catalog down on every home visit).
export function ForYouSection() {
  const { items, error } = useForYouRecommendations();

  if (error || items.length === 0) return null;

  return (
    <section className="for-you" aria-labelledby="for-you-heading">
      <h2 id="for-you-heading" className="for-you__title">
        Dành cho bạn
      </h2>
      <RecommendationGrid products={items} />
    </section>
  );
}
