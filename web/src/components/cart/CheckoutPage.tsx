"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AddressBook } from "@/components/account/AddressBook";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useAddresses } from "@/hooks/useAddresses";
import { dispatchCartChange, useCart } from "@/hooks/useCart";
import { ApiError, checkout } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";

// CheckoutRequest.paymentMethod (order-service) is a free-form @NotBlank String, not an enum —
// so any non-empty string works. This is the only payment method payment-service supports.
const PAYMENT_METHODS = [{ value: "CARD", label: "Thanh toán qua thẻ" }];

// FR2/T17: checkout form + order summary from the current cart. Redirects to the new order's
// detail page on success and clears the cart badge via dispatchCartChange (order-service itself
// removes just the checked-out items from the cart server-side — see
// CartServiceImpl.removeItems, called from OrderSagaEventListener post-payment).
//
// T-checkout-select: only checks out the variants the user selected on /cart, carried here via
// the `variantIds` query param (CartPage builds that URL) — never the whole cart.
//
// T-address-book: receiver/address fields are no longer typed by hand every time. The user
// picks one of their saved addresses via AddressBook (also used, in "manage" mode, on the
// profile page) — the chosen address's fields are copied into the CheckoutPayload at submit time
// (order-service still stores a denormalized snapshot per order, unrelated to the address book).
export function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cart, isLoading, error: cartError } = useCart();
  const {
    addresses,
    isLoading: isLoadingAddresses,
    error: addressesError,
    refetch: refetchAddresses,
  } = useAddresses();

  const selectedVariantIds = (searchParams.get("variantIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].value);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedAddress = addresses.find((address) => address.id === effectiveSelectedAddressId);
    if (!selectedAddress) {
      setSubmitError("Vui lòng chọn địa chỉ giao hàng.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setSubmitError("Bạn cần đăng nhập để thanh toán.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await checkout(token, {
        receiverName: selectedAddress.receiverName,
        receiverPhone: selectedAddress.receiverPhone,
        shippingAddress: selectedAddress.address,
        note: note.trim() || undefined,
        paymentMethod,
        variantIds: selectedVariantIds,
      });
      dispatchCartChange();
      router.push(`/orders/${result.orderId}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Đặt hàng thất bại. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingState label="Đang tải giỏ hàng..." />;
  if (cartError) return <ErrorState message={cartError} />;

  const allItems = cart?.items ?? [];

  if (allItems.length === 0) {
    return <p className="cart-page__empty">Giỏ hàng của bạn đang trống. Không có gì để thanh toán.</p>;
  }

  const items = allItems.filter((item) => selectedVariantIds.includes(item.variantId));

  if (items.length === 0) {
    return (
      <p className="cart-page__empty">
        Chưa chọn sản phẩm nào để thanh toán.{" "}
        <Link href="/cart">Quay lại giỏ hàng để chọn sản phẩm</Link>.
      </p>
    );
  }

  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const effectiveSelectedAddressId =
    selectedAddressId ?? (addresses.find((address) => address.isDefault) ?? addresses[0])?.id ?? null;

  return (
    <section aria-labelledby="checkout-heading" className="checkout-page">
      <h1 id="checkout-heading">Thanh toán</h1>

      <div className="checkout-page__layout">
        <form className="checkout-form" onSubmit={handleSubmit} noValidate>
          <p className="address-picker__label">Địa chỉ giao hàng</p>

          <AddressBook
            mode="picker"
            addresses={addresses}
            isLoading={isLoadingAddresses}
            error={addressesError}
            onAddressesChange={refetchAddresses}
            selectedAddressId={effectiveSelectedAddressId}
            onSelectAddress={(address) => setSelectedAddressId(address.id)}
          />

          <label htmlFor="checkout-note">
            Ghi chú (không bắt buộc)
            <textarea
              id="checkout-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <label htmlFor="checkout-payment-method">
            Phương thức thanh toán
            <select
              id="checkout-payment-method"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
            {isSubmitting ? "Đang đặt hàng..." : "Đặt hàng"}
          </button>

          {submitError && (
            <p role="alert" className="error-state">
              {submitError}
            </p>
          )}
        </form>

        <aside className="checkout-summary" aria-label="Tóm tắt đơn hàng">
          <h2>Tóm tắt đơn hàng</h2>
          <ul className="checkout-summary__items">
            {items.map((item) => (
              <li key={item.variantId}>
                {item.productImageUrl ? (
                  <ImageWithFallback
                    src={item.productImageUrl}
                    alt={item.productName}
                    className="checkout-summary__item-image"
                    placeholderClassName="checkout-summary__item-image checkout-summary__item-image--placeholder"
                  />
                ) : (
                  <div className="checkout-summary__item-image checkout-summary__item-image--placeholder" />
                )}
                <span className="checkout-summary__item-info">
                  {item.productName} ({item.color}, {item.size}) x{item.quantity}
                </span>
                <span>{formatPriceVnd(item.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="checkout-summary__total">
            Tổng cộng: <strong>{formatPriceVnd(totalAmount)}</strong>
          </p>
        </aside>
      </div>
    </section>
  );
}
