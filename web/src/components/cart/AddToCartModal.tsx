"use client";

import { useState } from "react";
import { ApiError, addCartItem } from "@/lib/api";
import { dispatchCartChange } from "@/hooks/useCart";
import { getAccessToken } from "@/lib/auth/session";
import { getColorSwatch } from "@/lib/format/color";
import type { Product } from "@/types/product";

// Matches order-service's CartServiceImpl.MAX_ITEM_QUANTITY (99) — see
// order-service/src/main/java/com/tttn/orderservice/service/impl/CartServiceImpl.java:36.
const MAX_ITEM_QUANTITY = 99;
const MIN_ITEM_QUANTITY = 1;

interface AddToCartModalProps {
  product: Product;
  onClose: () => void;
}

// Shared color/size/quantity picker popup (FR7/T13), reused from ProductCard, ProductDetailPage
// and TryOnPage — since AddCartItemRequest needs a specific variantId, this is the only place
// that resolves color+size back to a variant.
function sizesFor(product: Product, color: string): string[] {
  return [
    ...new Set(
      product.variants.filter((variant) => variant.color === color).map((variant) => variant.size),
    ),
  ];
}

export function AddToCartModal({ product, onClose }: AddToCartModalProps) {
  const colors = [...new Set(product.variants.map((variant) => variant.color))];

  // A product with only one color (or, once a color is picked, only one size) has nothing to
  // actually choose — auto-pick it so the user isn't blocked on clicking a swatch/button that
  // looks like a static indicator rather than a control. It's still rendered (and shown as
  // selected, via `.swatch--selected`/`.btn--selected`) so the choice stays visible, not hidden.
  const [selectedColor, setSelectedColor] = useState<string | null>(() =>
    colors.length === 1 ? colors[0] : null,
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(() => {
    if (colors.length !== 1) return null;
    const sizes = sizesFor(product, colors[0]);
    return sizes.length === 1 ? sizes[0] : null;
  });
  const [quantity, setQuantity] = useState(MIN_ITEM_QUANTITY);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sizesForColor = selectedColor ? sizesFor(product, selectedColor) : [];

  function handleSelectColor(color: string) {
    setSelectedColor(color);
    const sizes = sizesFor(product, color);
    setSelectedSize(sizes.length === 1 ? sizes[0] : null);
    setValidationError(null);
  }

  function handleSelectSize(size: string) {
    setSelectedSize(size);
    setValidationError(null);
  }

  function handleStepQuantity(delta: number) {
    setQuantity((current) =>
      Math.min(MAX_ITEM_QUANTITY, Math.max(MIN_ITEM_QUANTITY, current + delta)),
    );
  }

  async function handleConfirm() {
    if (!selectedColor || !selectedSize) {
      setValidationError("Vui lòng chọn màu sắc và kích thước trước khi thêm vào giỏ hàng.");
      return;
    }

    const variant = product.variants.find(
      (candidate) => candidate.color === selectedColor && candidate.size === selectedSize,
    );
    if (!variant) {
      setValidationError("Không tìm thấy phiên bản sản phẩm phù hợp. Vui lòng chọn lại.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setSubmitError("Bạn cần đăng nhập để thêm sản phẩm vào giỏ hàng.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await addCartItem(token, {
        productId: product.id,
        variantId: variant.id,
        quantity,
      });
      dispatchCartChange();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Không thể thêm vào giỏ hàng.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-cart-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id="add-to-cart-heading">Thêm vào giỏ hàng</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <p className="modal__product-name">{product.name}</p>

        <section aria-label="Chọn màu sắc" className="modal__section">
          <p className="modal__section-label">Màu gọng kính</p>
          {colors.length === 0 ? (
            <p>Chưa có phiên bản màu nào.</p>
          ) : (
            <ul className="product-detail__swatches">
              {colors.map((color) => {
                const swatch = getColorSwatch(color);
                const isSelected = color === selectedColor;
                return (
                  <li key={color} className="swatch-item">
                    <button
                      type="button"
                      className={`swatch swatch--selectable${isSelected ? " swatch--selected" : ""}`}
                      style={{ backgroundColor: swatch.hex }}
                      aria-pressed={isSelected}
                      aria-label={color}
                      title={color}
                      onClick={() => handleSelectColor(color)}
                    />
                    {!swatch.isKnown && <span className="swatch-label">{color}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selectedColor && (
          <section aria-label="Chọn kích thước" className="modal__section">
            <p className="modal__section-label">Kích thước</p>
            <ul className="modal__size-list">
              {sizesForColor.map((size) => (
                <li key={size}>
                  <button
                    type="button"
                    className={`btn btn--outline btn--small${size === selectedSize ? " btn--selected" : ""}`}
                    aria-pressed={size === selectedSize}
                    onClick={() => handleSelectSize(size)}
                  >
                    {size}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Số lượng" className="modal__section">
          <p className="modal__section-label">Số lượng</p>
          <div className="quantity-stepper">
            <button
              type="button"
              onClick={() => handleStepQuantity(-1)}
              disabled={quantity <= MIN_ITEM_QUANTITY}
              aria-label="Giảm số lượng"
            >
              −
            </button>
            <span aria-live="polite">{quantity}</span>
            <button
              type="button"
              onClick={() => handleStepQuantity(1)}
              disabled={quantity >= MAX_ITEM_QUANTITY}
              aria-label="Tăng số lượng"
            >
              +
            </button>
          </div>
        </section>

        {validationError && (
          <p role="alert" className="error-state">
            {validationError}
          </p>
        )}
        {submitError && (
          <p role="alert" className="error-state">
            {submitError}
          </p>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Đang thêm..." : "Thêm vào giỏ hàng"}
          </button>
        </div>
      </div>
    </div>
  );
}
