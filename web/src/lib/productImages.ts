import type { ProductImage } from "@/types/product";

// Image used as the try-on overlay (live AR + the static face-analysis preview): the product's
// TRY_ON PNG when it has one, else the product-level thumbnail (seed has variant-scoped
// thumbnails too, so several images may be isThumbnail), else any thumbnail, else the first image.
export function pickTryOnImage(product: { images: ProductImage[] }): ProductImage | undefined {
  const { images } = product;
  return (
    images.find((image) => image.kind === "TRY_ON") ??
    images.find((image) => image.isThumbnail && image.variantId === null) ??
    images.find((image) => image.isThumbnail) ??
    images[0]
  );
}
