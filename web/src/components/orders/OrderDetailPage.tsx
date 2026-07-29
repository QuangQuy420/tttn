"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ApiError, cancelOrder, getOrderById } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi } from "@/lib/labels";
import type { Order } from "@/types/order";

interface OrderDetailPageProps {
  id: string;
}

const CANCELLABLE_STATUSES = new Set(["PENDING", "AWAITING_PAYMENT", "CONFIRMED"]);

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
              <span>
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
