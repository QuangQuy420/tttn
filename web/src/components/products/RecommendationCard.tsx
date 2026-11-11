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
  // Debug view (`?debug=1`, read by RecommendationGrid): Preference/FaceFit score bars.
  showScores?: boolean;
}

const MAX_REASONS = 2;

function ScoreBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="recommendation-score">
      <span className="recommendation-score__label">{label}</span>
      <span className="recommendation-score__track" aria-hidden="true">
        <span className="recommendation-score__fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="recommendation-score__value">{percent}%</span>
    </div>
  );
}

// Same card-style layout as ProductCard, but built for RecommendedProduct's narrower shape
// (no genderTarget/category/variants — recommendation-service only returns what a card needs
// plus a ranking `score`), so ProductCard itself isn't reused directly.
export function RecommendationCard({
  product,
  onTryOnPhoto,
  showScores = false,
}: RecommendationCardProps) {
  const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];
  const reasons = product.reasons.slice(0, MAX_REASONS);

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
      <Link href={`/products/${product.slug}`} className="product-card__link">
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
      {reasons.length > 0 && (
        <ul className="recommendation-reasons" aria-label="Vì sao gợi ý">
          {reasons.map((reason) => (
            <li key={reason} className="recommendation-reasons__chip">
              {reason}
            </li>
          ))}
        </ul>
      )}
      {showScores && (
        <div className="recommendation-scores">
          <ScoreBar label="Preference" value={product.preferenceScore} />
          <ScoreBar label="FaceFit" value={product.faceFitScore} />
        </div>
      )}
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
          <Link href={`/products/${product.slug}/try-on`} className="btn btn--primary btn--small">
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
