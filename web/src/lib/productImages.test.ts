import type { ProductImage } from "@/types/product";
import { pickTryOnImage } from "./productImages";

function image(overrides: Partial<ProductImage>): ProductImage {
  return {
    id: "img",
    imageUrl: "/img.jpg",
    isThumbnail: false,
    sortOrder: 0,
    variantId: null,
    kind: "GALLERY",
    ...overrides,
  };
}

describe("pickTryOnImage", () => {
  it("prefers the TRY_ON image over any thumbnail", () => {
    const thumbnail = image({ id: "thumb", isThumbnail: true });
    const tryOn = image({ id: "try-on", kind: "TRY_ON", sortOrder: 1 });

    expect(pickTryOnImage({ images: [thumbnail, tryOn] })).toBe(tryOn);
  });

  it("falls back to the product-level thumbnail when there is no TRY_ON image", () => {
    const variantThumbnail = image({ id: "variant-thumb", isThumbnail: true, variantId: "v1" });
    const productThumbnail = image({ id: "product-thumb", isThumbnail: true, sortOrder: 1 });

    expect(pickTryOnImage({ images: [variantThumbnail, productThumbnail] })).toBe(productThumbnail);
  });

  it("falls back to the first image when there is no TRY_ON image and no thumbnail", () => {
    const first = image({ id: "first" });
    const second = image({ id: "second", sortOrder: 1 });

    expect(pickTryOnImage({ images: [first, second] })).toBe(first);
  });
});
