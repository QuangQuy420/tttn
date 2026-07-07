import Link from "next/link";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { formatFrameShape, formatPriceVnd } from "@/lib/format/price";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
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
          <p className="product-card__shape">{formatFrameShape(product.frameShape)} frame</p>
          <p className="product-card__price">{formatPriceVnd(product.basePrice)}</p>
        </div>
      </Link>
      <div className="product-card__actions">
        <button
          type="button"
          className="btn btn--primary btn--small"
          disabled
          title="Coming soon"
          aria-label="Try AR (coming soon)"
        >
          Try AR
        </button>
        <button
          type="button"
          className="btn btn--outline btn--small"
          disabled
          title="Coming soon"
          aria-label="Add to cart (coming soon)"
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}
