interface RatingStarsProps {
  rating: number;
  className?: string;
}

// Read-only 5-star row (rounded to the nearest whole star) with the exact value for screen readers.
export function RatingStars({ rating, className }: RatingStarsProps) {
  const filled = Math.round(rating);
  return (
    <span
      className={`rating-stars${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`${rating.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} trên 5 sao`}
    >
      {"★".repeat(filled)}
      <span className="rating-stars__empty">{"★".repeat(5 - filled)}</span>
    </span>
  );
}
