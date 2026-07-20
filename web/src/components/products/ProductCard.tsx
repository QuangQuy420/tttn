import Link from "next/link";
import { useState } from "react";
import { AddToCartModal } from "@/components/cart/AddToCartModal";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { formatPriceVnd } from "@/lib/format/price";
import { formatFrameShapeVi } from "@/lib/labels";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];
  const [isAddToCartOpen, setIsAddToCartOpen] = useState(false);

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
        <Link
          href={`/products/${product.id}/try-on`}
          className="btn btn--primary btn--small"
          aria-label="Thử kính AR"
        >
          Thử kính AR
        </Link>
        <button
          type="button"
          className="btn btn--outline btn--small"
          onClick={() => setIsAddToCartOpen(true)}
          aria-label="Thêm vào giỏ hàng"
        >
          Thêm vào giỏ hàng
        </button>
      </div>

      {isAddToCartOpen && (
        <AddToCartModal product={product} onClose={() => setIsAddToCartOpen(false)} />
      )}
    </div>
  );
}
