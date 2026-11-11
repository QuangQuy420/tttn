"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { dispatchCartChange } from "@/hooks/useCart";
import { ApiError, cancelOrder, getOrderById } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { getColorSwatch } from "@/lib/format/color";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi, formatPaymentStatusVi } from "@/lib/labels";
import type { Order } from "@/types/order";

interface OrderDetailPageProps {
  id: string;
}

const CANCELLABLE_STATUSES = new Set(["PENDING", "AWAITING_PAYMENT", "CONFIRMED"]);

// While the checkout saga is still running the page re-reads the order (AC59).
const IN_PROGRESS_STATUSES = new Set(["PENDING", "AWAITING_PAYMENT"]);
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_DURATION_MS = 2 * 60 * 1000;

// FR3/FR4/T18: full order detail (items + status history), plus a cancel action shown only
// while the order is still PENDING/AWAITING_PAYMENT/CONFIRMED (matches order-service's
// OrderServiceImpl.cancelOrder eligibility check).
export function OrderDetailPage({ id }: OrderDetailPageProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function loadOrder() {
    const token = getAccessToken();
    if (!token) {
      setError("Bạn cần đăng nhập để xem đơn hàng.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrderById(token, id);
      setOrder(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tải thông tin đơn hàng.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Bạn cần đăng nhập để xem đơn hàng.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getOrderById(token, id);
        if (!cancelled) setOrder(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải thông tin đơn hàng.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const isInProgress = order !== null && IN_PROGRESS_STATUSES.has(order.status);
  // A cancelled paid order is waiting for its refund (PAID → REFUNDED).
  const isRefundPending =
    order !== null && order.status === "CANCELLED" && order.paymentStatus === "PAID";
  const shouldPoll = isInProgress || isRefundPending;

  // Poll every 3 s (for at most 2 min) while the order is PENDING / AWAITING_PAYMENT, or
  // CANCELLED but still PAID (refund pending). Each poll starts only after the previous one
  // finished, so slow responses never pile up.
  useEffect(() => {
    if (!shouldPoll) return;
    const token = getAccessToken();
    if (!token) return;

    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    function schedule() {
      if (cancelled || Date.now() - startedAt >= POLL_MAX_DURATION_MS) return;
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    async function poll() {
      try {
        const result = await getOrderById(token as string, id);
        if (!cancelled) setOrder(result);
      } catch {
        // Keep showing the last known order; the next poll tries again.
      }
      schedule();
    }

    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, shouldPoll]);

  // The checked-out items leave the cart only once the saga finishes: refresh the cart badge when
  // the order leaves PENDING / AWAITING_PAYMENT.
  const wasInProgressRef = useRef(false);
  useEffect(() => {
    if (order === null) return;
    if (wasInProgressRef.current && !isInProgress) dispatchCartChange();
    wasInProgressRef.current = isInProgress;
  }, [order, isInProgress]);

  async function handleCancel() {
    const token = getAccessToken();
    if (!token) return;

    const reason = window.prompt("Vui lòng nhập lý do hủy đơn hàng:");
    if (reason === null) return;
    if (!reason.trim()) {
      setCancelError("Lý do hủy đơn không được để trống.");
      return;
    }

    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelOrder(token, id, reason.trim());
      await loadOrder();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "Không thể hủy đơn hàng.");
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) return <LoadingState label="Đang tải đơn hàng..." />;
  if (error) return <ErrorState message={error} />;
  if (!order) return <ErrorState message="Không tìm thấy đơn hàng." />;

  const canCancel = CANCELLABLE_STATUSES.has(order.status);

  return (
    <article aria-labelledby="order-detail-heading" className="order-detail">
      <Link href="/orders" className="product-detail__back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Về danh sách đơn hàng
      </Link>

      <h1 id="order-detail-heading">Đơn hàng {order.orderCode}</h1>
      <p className="order-detail__status">Trạng thái: {formatOrderStatusVi(order.status)}</p>
      <p className="order-detail__status">
        Thanh toán: {formatPaymentStatusVi(order.paymentStatus)}
      </p>

      <section aria-label="Lịch sử trạng thái" className="order-detail__section">
        <h2>Lịch sử trạng thái</h2>
        <ul className="order-detail__history">
          {order.statusHistories.map((entry) => (
            <li key={entry.id}>
              <span>{formatOrderStatusVi(entry.status)}</span>
              {entry.note && <span> — {entry.note}</span>}
              <span> ({new Date(entry.changedAt).toLocaleString("vi-VN")})</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Thông tin giao hàng" className="order-detail__section">
        <h2>Thông tin giao hàng</h2>
        <p>Người nhận: {order.receiverName}</p>
        <p>Số điện thoại: {order.receiverPhone}</p>
        <p>Địa chỉ: {order.shippingAddress}</p>
        {order.note && <p>Ghi chú: {order.note}</p>}
        <p>Phương thức thanh toán: {order.paymentMethod}</p>
      </section>

      <section aria-label="Sản phẩm trong đơn hàng" className="order-detail__section">
        <h2>Sản phẩm</h2>
        <ul className="order-detail__items">
          {order.items.map((item) => (
            <li key={item.id} className="order-item">
              <span className="order-item__product">
                <span
                  className="swatch swatch--inline"
                  style={{ backgroundColor: item.colorHex ?? getColorSwatch(item.color).hex }}
                  role="img"
                  aria-label={item.color}
                  title={item.color}
                />
                {item.productName} ({item.color}, {item.size}) x{item.quantity}
              </span>
              <span>{formatPriceVnd(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        <p className="order-detail__total">
          Tổng cộng: <strong>{formatPriceVnd(order.totalAmount)}</strong>
        </p>
      </section>

      {canCancel && (
        <div className="order-detail__actions">
          <button
            type="button"
            className="btn btn--outline"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? "Đang hủy đơn..." : "Hủy đơn hàng"}
          </button>
          {cancelError && (
            <p role="alert" className="error-state">
              {cancelError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
