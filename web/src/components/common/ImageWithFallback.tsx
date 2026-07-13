"use client";

import { useState } from "react";

interface ImageWithFallbackProps {
  src: string;
  alt: string;
  className: string;
  placeholderClassName: string;
}

// Seeded catalog image URLs point at a placeholder CDN domain that doesn't resolve
// (see infra/seed/products.json), so a broken <img> is the common case today, not
// an edge case — render the same placeholder box used for "no image at all" instead
// of letting the browser show its broken-image glyph over the card/gallery.
export function ImageWithFallback({
  src,
  alt,
  className,
  placeholderClassName,
}: ImageWithFallbackProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return <div className={placeholderClassName} role="img" aria-label={alt} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see ProductCard
    <img src={src} alt={alt} className={className} onError={() => setErrored(true)} />
  );
}
