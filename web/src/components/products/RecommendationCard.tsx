"use client";

import Link from "next/link";
import { useState } from "react";
import { AddToCartModal } from "@/components/cart/AddToCartModal";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { ApiError, getProductById } from "@/lib/api";
import { formatPriceVnd } from "@/lib/format/price";
import { formatFrameShapeVi } from "@/lib/labels";
import type { Product } from "@/types/product";
import type { RecommendedProduct } from "@/types/recommendation";

interface RecommendationCardProps {
  product: RecommendedProduct;
  // Present only on the face-analysis page (RecommendationPreview → RecommendationGrid), where a
  // second "Thử lên ảnh này" action draws the frame onto the already-uploaded static photo. In
  // that context the primary action is "Thêm vào giỏ hàng" instead of the live-camera "Thử kính
  // AR" — /recommendations (onTryOnPhoto absent) keeps the AR action instead.
  onTryOnPhoto?: (product: RecommendedProduct) => void;
}

// Same card-style layout as ProductCard, but built for RecommendedProduct's narrower shape
// (no genderTarget/category/variants — recommendation-service only returns what a card needs
// plus a ranking `score`), so ProductCard itself isn't reused directly.
export function RecommendationCard({ product, onTryOnPhoto }: RecommendationCardProps) {
  const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];

  // AddToCartModal needs variants (for color/size selection), which RecommendedProduct doesn't
  // carry — fetch the full Product on demand when the user actually asks to add to cart, rather
  // than widening recommendation-service's response for every recommendation just for this.
  const [fullProduct, setFullProduct] = useState<Product | null>(null);
  const [isAddToCartOpen, setIsAddToCartOpen] = useState(false);
  const [isFetchingProduct, setIsFetchingProduct] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function handleAddToCartClick() {
    setFetchError(null);
    if (fullProduct) {
      setIsAddToCartOpen(true);
      return;
    }
    setIsFetchingProduct(true);
    try {
      const fetched = await getProductById(product.id);
      setFullProduct(fetched);
      setIsAddToCartOpen(true);
    } catch (err) {
      setFetchError(err instanceof ApiError ? err.message : "Không thể tải thông tin sản phẩm.");
    } finally {
      setIsFetchingProduct(false);
    }
  }

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
        {onTryOnPhoto ? (
          <>
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => onTryOnPhoto(product)}
            >
              Thử lên ảnh này
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={handleAddToCartClick}
              disabled={isFetchingProduct}
            >
              {isFetchingProduct ? "Đang tải..." : "Thêm vào giỏ hàng"}
            </button>
          </>
        ) : (
          <Link href={`/products/${product.id}/try-on`} className="btn btn--primary btn--small">
            Thử kính AR
          </Link>
        )}
      </div>
      {fetchError && (
        <p role="alert" className="error-state">
          {fetchError}
        </p>
      )}

      {isAddToCartOpen && fullProduct && (
        <AddToCartModal product={fullProduct} onClose={() => setIsAddToCartOpen(false)} />
      )}
    </div>
  );
}
