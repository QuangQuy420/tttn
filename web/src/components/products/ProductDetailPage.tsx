"use client";

import Link from "next/link";
import { useState } from "react";
import { AddToCartModal } from "@/components/cart/AddToCartModal";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useProductBySlug } from "@/hooks/useProduct";
import { getColorSwatch } from "@/lib/format/color";
import { formatPriceVnd } from "@/lib/format/price";
import { formatFrameShapeVi, GENDER_TARGET_LABELS_VI } from "@/lib/labels";

interface ProductDetailPageProps {
  slug: string;
}

export function ProductDetailPage({ slug }: ProductDetailPageProps) {
  const { product, isLoading, error } = useProductBySlug(slug);
  const [isAddToCartOpen, setIsAddToCartOpen] = useState(false);
  // FR6/AC7: which swatch the customer picked, if any — drives which image group is shown below.
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Đang tải sản phẩm..." />;
  if (error) return <ErrorState message={error} />;
  if (!product) return <ErrorState message="Không tìm thấy sản phẩm." />;

  // FR7: one swatch per distinct variant.color, in first-seen order — colorHex takes priority
  // over the legacy name->hex lookup (AC13: colorHex null falls back to getColorSwatch).
  const colors: { color: string; hex: string; isKnown: boolean }[] = [];
  const seenColors = new Set<string>();
  for (const variant of product.variants) {
    if (seenColors.has(variant.color)) continue;
    seenColors.add(variant.color);
    const swatch = variant.colorHex
      ? { hex: variant.colorHex, isKnown: true }
      : getColorSwatch(variant.color);
    colors.push({ color: variant.color, hex: swatch.hex, isKnown: swatch.isKnown });
  }

  // FR6/AC7: when a color is selected, prefer images belonging to a variant of that color;
  // fall back to the base product's own images (variantId === null) when that variant has none.
  const selectedVariantIds = selectedColor
    ? new Set(
        product.variants
          .filter((variant) => variant.color === selectedColor)
          .map((variant) => variant.id),
      )
    : null;
  const variantImages = selectedVariantIds
    ? product.images.filter(
        (image) => image.variantId !== null && selectedVariantIds.has(image.variantId),
      )
    : [];
  const baseImages = product.images.filter((image) => image.variantId === null);
  const activeImages = variantImages.length > 0 ? variantImages : baseImages;

  const sortedImages = [...activeImages].sort((a, b) => a.sortOrder - b.sortOrder);
  const mainImage = activeImages.find((image) => image.isThumbnail) ?? sortedImages[0];
  const thumbnailImages = sortedImages.filter((image) => image.id !== mainImage?.id);

  return (
    <article aria-labelledby="product-heading" className="product-detail">
      <Link href="/" className="product-detail__back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Về trang danh mục
      </Link>

      <div className="product-detail__layout">
        <section aria-label="Hình ảnh sản phẩm" className="product-detail__gallery">
          {sortedImages.length === 0 ? (
            <p>Chưa có hình ảnh nào.</p>
          ) : (
            <>
              {mainImage && (
                <ImageWithFallback
                  src={mainImage.imageUrl}
                  alt={product.name}
                  className="product-detail__main-image"
                  placeholderClassName="product-detail__main-image product-detail__main-image--placeholder"
                />
              )}
              {thumbnailImages.length > 0 && (
                <ul className="product-detail__thumbnails">
                  {thumbnailImages.map((image) => (
                    <li key={image.id}>
                      <ImageWithFallback
                        src={image.imageUrl}
                        alt={product.name}
                        className="product-detail__thumbnail"
                        placeholderClassName="product-detail__thumbnail product-detail__thumbnail--placeholder"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <div className="product-detail__info">
          <h1 id="product-heading">{product.name}</h1>
          <p className="product-detail__shape">{formatFrameShapeVi(product.frameShape)}</p>
          <p className="product-detail__price">{formatPriceVnd(product.basePrice)}</p>
          {product.description && (
            <p className="product-detail__description">{product.description}</p>
          )}

          {/* FR7 focuses on the swatch row replacing the old variant list; brand/category/
              gender/material aren't in the design mock but nothing calls for dropping them, so
              they're kept as a compact secondary attributes list (same conservative call as the
              plan's own Q6 on the footer copyright line). */}
          <dl className="product-detail__attributes">
            <dt>Thương hiệu</dt>
            <dd>{product.brand.name}</dd>
            <dt>Danh mục</dt>
            <dd>{product.category.name}</dd>
            <dt>Giới tính</dt>
            <dd>{GENDER_TARGET_LABELS_VI[product.genderTarget]}</dd>
            {product.material && (
              <>
                <dt>Chất liệu</dt>
                <dd>{product.material}</dd>
              </>
            )}
          </dl>

          <section aria-label="Màu sắc có sẵn">
            <p className="product-detail__colors-label">Màu gọng kính</p>
            {colors.length === 0 ? (
              <p>Chưa có phiên bản màu nào.</p>
            ) : (
              <ul className="product-detail__swatches">
                {colors.map(({ color, hex, isKnown }) => {
                  const isSelected = color === selectedColor;
                  return (
                    <li key={color} className="swatch-item">
                      <button
                        type="button"
                        className={`swatch swatch--selectable${isSelected ? " swatch--selected" : ""}`}
                        style={{ backgroundColor: hex }}
                        aria-pressed={isSelected}
                        aria-label={color}
                        title={color}
                        onClick={() => setSelectedColor(isSelected ? null : color)}
                      />
                      {!isKnown && <span className="swatch-label">{color}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="product-detail__actions">
            <Link
              href={`/products/${product.slug}/try-on`}
              className="btn btn--primary"
              aria-label="Thử kính AR"
            >
              Thử kính AR
            </Link>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setIsAddToCartOpen(true)}
              aria-label="Thêm vào giỏ hàng"
            >
              Thêm vào giỏ hàng
            </button>
          </div>
        </div>
      </div>

      {isAddToCartOpen && (
        <AddToCartModal product={product} onClose={() => setIsAddToCartOpen(false)} />
      )}
    </article>
  );
}
