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
export function CartPage() {
  const { cart, isLoading, error, refetch } = useCart();
  const [mutatingVariantId, setMutatingVariantId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

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

          <ul className="cart-page__items">
            {items.map((item) => (
              <li key={item.variantId} className="cart-item">
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
            <p className="cart-page__total">
              Tổng cộng: <strong>{formatPriceVnd(cart?.totalAmount ?? 0)}</strong>
            </p>
            <Link href="/checkout" className="btn btn--primary">
              Tiến hành thanh toán
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
