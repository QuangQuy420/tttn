import Link from "next/link";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { formatPriceVnd } from "@/lib/format/price";
import { formatFrameShapeVi } from "@/lib/labels";
import type { RecommendedProduct } from "@/types/recommendation";

// Same card-style layout as ProductCard, but built for RecommendedProduct's narrower shape
// (no genderTarget/category/variants — recommendation-service only returns what a card needs
// plus a ranking `score`), so ProductCard itself isn't reused directly.
export function RecommendationCard({ product }: { product: RecommendedProduct }) {
  const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];

  return (
    <div className="product-card">
      <Link href={`/products/${product.id}`} className="product-card__link">
        {thumbnail ? (
          <ImageWithFallback
            src={thumbnail.imageUrl}
            alt={product.name}
            className="product-card__image"
            placeholderClassName="product-card__image product-card__image--placeholder"
          />
        ) : (
          <div className="product-card__image product-card__image--placeholder" />
        )}
        <div className="product-card__body">
          <h3 className="product-card__name">{product.name}</h3>
          <p className="product-card__shape">{formatFrameShapeVi(product.frameShape)}</p>
          <p className="product-card__price">{formatPriceVnd(product.basePrice)}</p>
        </div>
      </Link>
      <div className="product-card__actions">
        <Link href={`/products/${product.id}/try-on`} className="btn btn--primary btn--small">
          Thử kính AR
        </Link>
      </div>
    </div>
  );
}
