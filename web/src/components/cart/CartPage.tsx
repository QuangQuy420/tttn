"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { dispatchCartChange, useCart } from "@/hooks/useCart";
import { ApiError, removeCartItem, updateCartItem } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";

// FR1/T16: list cart items, let the user change quantity or remove an item, show the running
// total, and lead into checkout. Cart CRUD is done here directly (not via AddToCartModal, which
// only handles the initial add) so it can dispatch "cart-change" the same way after every
// mutation, keeping the Header badge and this page's own useCart() in sync.
//
// T-checkout-select: checkout is per-selection, not "always the whole cart" — the user ticks
// which items to pay for, the total only reflects those, and "Tiến hành thanh toán" carries the
// selected variantIds to /checkout via the query string (CheckoutPage reads them back out;
// order-service only ever sees the selected subset, see CheckoutPayload.variantIds).
export function CartPage() {
  const { cart, isLoading, error, refetch } = useCart();
  const [mutatingVariantId, setMutatingVariantId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  function toggleSelected(variantId: string) {
    setSelectedVariantIds((current) => {
      const next = new Set(current);
      if (next.has(variantId)) {
        next.delete(variantId);
      } else {
        next.add(variantId);
      }
      return next;
    });
  }

  async function handleUpdateQuantity(variantId: string, quantity: number) {
    const token = getAccessToken();
    if (!token || quantity < 1) return;

    setMutatingVariantId(variantId);
    setMutationError(null);
    try {
      await updateCartItem(token, variantId, { quantity });
      dispatchCartChange();
      await refetch();
    } catch (err) {
      setMutationError(
        err instanceof ApiError ? err.message : "Không thể cập nhật số lượng sản phẩm.",
      );
    } finally {
      setMutatingVariantId(null);
    }
  }

  async function handleRemove(variantId: string) {
    const token = getAccessToken();
    if (!token) return;

    setMutatingVariantId(variantId);
    setMutationError(null);
    try {
      await removeCartItem(token, variantId);
      dispatchCartChange();
      await refetch();
    } catch (err) {
      setMutationError(
        err instanceof ApiError ? err.message : "Không thể xóa sản phẩm khỏi giỏ hàng.",
      );
    } finally {
      setMutatingVariantId(null);
    }
  }

  if (isLoading) return <LoadingState label="Đang tải giỏ hàng..." />;
  if (error) return <ErrorState message={error} />;

  const items = cart?.items ?? [];

  const selectedItems = items.filter((item) => selectedVariantIds.has(item.variantId));
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const selectedCount = selectedItems.length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  function toggleSelectAll() {
    setSelectedVariantIds(
      allSelected ? new Set() : new Set(items.map((item) => item.variantId)),
    );
  }

  return (
    <section aria-labelledby="cart-heading" className="cart-page">
      <h1 id="cart-heading">Giỏ hàng của bạn</h1>

      {items.length === 0 ? (
        <p className="cart-page__empty">
          Giỏ hàng của bạn đang trống. Hãy khám phá sản phẩm và thêm vào giỏ hàng.
        </p>
      ) : (
        <>
          {mutationError && (
            <p role="alert" className="error-state">
              {mutationError}
            </p>
          )}

          <label className="cart-page__select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Chọn tất cả sản phẩm"
            />
            Chọn tất cả
          </label>

          <ul className="cart-page__items">
            {items.map((item) => (
              <li key={item.variantId} className="cart-item">
                <input
                  type="checkbox"
                  className="cart-item__checkbox"
                  checked={selectedVariantIds.has(item.variantId)}
                  onChange={() => toggleSelected(item.variantId)}
                  aria-label={`Chọn ${item.productName}`}
                />

                {item.productImageUrl ? (
                  <ImageWithFallback
                    src={item.productImageUrl}
                    alt={item.productName}
                    className="cart-item__image"
                    placeholderClassName="cart-item__image cart-item__image--placeholder"
                  />
                ) : (
                  <div className="cart-item__image cart-item__image--placeholder" />
                )}

                <div className="cart-item__info">
                  <p className="cart-item__name">{item.productName}</p>
                  <p className="cart-item__variant">
                    Màu: {item.color} · Kích thước: {item.size}
                  </p>
                  <p className="cart-item__price">{formatPriceVnd(item.unitPrice)}</p>
                </div>

                <div className="quantity-stepper">
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(item.variantId, item.quantity - 1)}
                    disabled={mutatingVariantId === item.variantId || item.quantity <= 1}
                    aria-label={`Giảm số lượng ${item.productName}`}
                  >
                    −
                  </button>
                  <span aria-live="polite">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(item.variantId, item.quantity + 1)}
                    disabled={mutatingVariantId === item.variantId || item.quantity >= 99}
                    aria-label={`Tăng số lượng ${item.productName}`}
                  >
                    +
                  </button>
                </div>

                <p className="cart-item__subtotal">{formatPriceVnd(item.subtotal)}</p>

                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => handleRemove(item.variantId)}
                  disabled={mutatingVariantId === item.variantId}
                >
                  Xóa
                </button>
              </li>
            ))}
          </ul>

          <div className="cart-page__summary">
            {selectedCount > 0 ? (
              <p className="cart-page__total">
                Tổng cộng ({selectedCount} sản phẩm): <strong>{formatPriceVnd(selectedTotal)}</strong>
              </p>
            ) : (
              <p className="cart-page__total cart-page__total--empty">
                Chọn sản phẩm để xem tổng tiền
              </p>
            )}
            {selectedCount > 0 ? (
              <Link
                href={`/checkout?variantIds=${Array.from(selectedVariantIds)
                  .map(encodeURIComponent)
                  .join(",")}`}
                className="btn btn--primary"
              >
                Tiến hành thanh toán
              </Link>
            ) : (
              <button type="button" className="btn btn--primary" disabled>
                Tiến hành thanh toán
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
