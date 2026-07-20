"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { dispatchCartChange, useCart } from "@/hooks/useCart";
import { ApiError, checkout } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";

// CheckoutRequest.paymentMethod (order-service) is a free-form @NotBlank String, not an enum —
// so any non-empty string works. These are just reasonable Vietnamese-labeled options for the
// picker, not values order-service itself validates against.
const PAYMENT_METHODS = [
  { value: "COD", label: "Thanh toán khi nhận hàng" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản ngân hàng" },
];

const PHONE_PATTERN = /^(0|\+84)[0-9]{9,10}$/;

interface FieldErrors {
  receiverName?: string;
  receiverPhone?: string;
  shippingAddress?: string;
}

function validate(receiverName: string, receiverPhone: string, shippingAddress: string): FieldErrors {
  const errors: FieldErrors = {};

  if (!receiverName.trim()) {
    errors.receiverName = "Tên người nhận không được để trống.";
  }

  if (!receiverPhone.trim()) {
    errors.receiverPhone = "Số điện thoại không được để trống.";
  } else if (!PHONE_PATTERN.test(receiverPhone.trim())) {
    errors.receiverPhone = "Số điện thoại không hợp lệ.";
  }

  if (!shippingAddress.trim()) {
    errors.shippingAddress = "Địa chỉ giao hàng không được để trống.";
  }

  return errors;
}

// FR2/T17: checkout form + order summary from the current cart. Redirects to the new order's
// detail page on success and clears the cart badge via dispatchCartChange (order-service itself
// clears the cart server-side on checkout — see CartServiceImpl.clearCart).
export function CheckoutPage() {
  const router = useRouter();
  const { cart, isLoading, error: cartError } = useCart();

  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].value);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validate(receiverName, receiverPhone, shippingAddress);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const token = getAccessToken();
    if (!token) {
      setSubmitError("Bạn cần đăng nhập để thanh toán.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await checkout(token, {
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        shippingAddress: shippingAddress.trim(),
        note: note.trim() || undefined,
        paymentMethod,
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

  const items = cart?.items ?? [];

  if (items.length === 0) {
    return <p className="cart-page__empty">Giỏ hàng của bạn đang trống. Không có gì để thanh toán.</p>;
  }

  return (
    <section aria-labelledby="checkout-heading" className="checkout-page">
      <h1 id="checkout-heading">Thanh toán</h1>

      <div className="checkout-page__layout">
        <form className="checkout-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="checkout-receiver-name">
            Tên người nhận
            <input
              id="checkout-receiver-name"
              type="text"
              value={receiverName}
              onChange={(event) => setReceiverName(event.target.value)}
              autoComplete="name"
            />
            {fieldErrors.receiverName && (
              <span className="field-error">{fieldErrors.receiverName}</span>
            )}
          </label>

          <label htmlFor="checkout-receiver-phone">
            Số điện thoại
            <input
              id="checkout-receiver-phone"
              type="tel"
              value={receiverPhone}
              onChange={(event) => setReceiverPhone(event.target.value)}
              autoComplete="tel"
            />
            {fieldErrors.receiverPhone && (
              <span className="field-error">{fieldErrors.receiverPhone}</span>
            )}
          </label>

          <label htmlFor="checkout-shipping-address">
            Địa chỉ giao hàng
            <input
              id="checkout-shipping-address"
              type="text"
              value={shippingAddress}
              onChange={(event) => setShippingAddress(event.target.value)}
              autoComplete="street-address"
            />
            {fieldErrors.shippingAddress && (
              <span className="field-error">{fieldErrors.shippingAddress}</span>
            )}
          </label>

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
                <span>
                  {item.productName} ({item.color}, {item.size}) x{item.quantity}
                </span>
                <span>{formatPriceVnd(item.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="checkout-summary__total">
            Tổng cộng: <strong>{formatPriceVnd(cart?.totalAmount ?? 0)}</strong>
          </p>
        </aside>
      </div>
    </section>
  );
}
