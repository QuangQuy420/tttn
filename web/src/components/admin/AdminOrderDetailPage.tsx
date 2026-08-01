"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ApiError, getAdminOrderDetail, updateOrderStatusAdmin } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi, ORDER_STATUSES } from "@/lib/labels";
import type { Order, OrderStatus } from "@/types/order";

interface AdminOrderDetailPageProps {
  id: string;
}

// Admin order detail (T13, AC7/AC8) — items, shipping info, full status history for ANY order
// (not just the caller's own, unlike OrderDetailPage.tsx which this pattern-matches), plus:
// - a "Lý do hủy đơn" callout when the order's current status is CANCELLED, sourced from the
//   most recent CANCELLED status-history entry's `note` (that's where
//   OrderSagaEventListener.handlePaymentFailed writes the failure reason).
// - a status-change control. The dropdown intentionally offers every OrderStatus rather than
//   re-implementing order-service's transition graph client-side (plan Q1) — an invalid choice
//   is rejected by the backend and its Vietnamese error is shown inline (AC8), not thrown.
export function AdminOrderDetailPage({ id }: AdminOrderDetailPageProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nextStatus, setNextStatus] = useState<OrderStatus>("PENDING");
  const [statusNote, setStatusNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function loadOrder() {
    const token = getAccessToken();
    if (!token) {
      setError("Bạn cần đăng nhập lại để xem đơn hàng.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getAdminOrderDetail(token, id);
      setOrder(result);
      setNextStatus(result.status);
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
          setError("Bạn cần đăng nhập lại để xem đơn hàng.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getAdminOrderDetail(token, id);
        if (!cancelled) {
          setOrder(result);
          setNextStatus(result.status);
        }
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

  async function handleStatusSubmit() {
    const token = getAccessToken();
    if (!token) {
      setStatusError("Bạn cần đăng nhập lại để thực hiện thao tác này.");
      return;
    }

    setIsSubmitting(true);
    setStatusError(null);
    try {
      await updateOrderStatusAdmin(token, id, nextStatus, statusNote.trim() || undefined);
      setStatusNote("");
      await loadOrder();
    } catch (err) {
      setStatusError(
        err instanceof ApiError ? err.message : "Không thể cập nhật trạng thái đơn hàng.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingState label="Đang tải đơn hàng..." />;
  if (error) return <ErrorState message={error} />;
  if (!order) return <ErrorState message="Không tìm thấy đơn hàng." />;

  // The most recent CANCELLED status-history entry — order.status already reflects the latest
  // transition, so "latest entry is CANCELLED" is exactly "order.status === CANCELLED"; among
  // (normally one) CANCELLED entries, pick the one with the newest changedAt for its note.
  const latestCancelEntry =
    order.status === "CANCELLED"
      ? [...order.statusHistories]
          .filter((entry) => entry.status === "CANCELLED")
          .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())[0]
      : undefined;

  return (
    <article aria-labelledby="admin-order-detail-heading" className="order-detail">
      <Link href="/admin/orders" className="product-detail__back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Về danh sách đơn hàng
      </Link>

      <h1 id="admin-order-detail-heading">Đơn hàng {order.orderCode}</h1>
      <p className="order-detail__status">Trạng thái: {formatOrderStatusVi(order.status)}</p>

      {latestCancelEntry?.note && (
        <div className="order-detail__failure-note" role="alert">
          <strong>Lý do hủy đơn:</strong> {latestCancelEntry.note}
        </div>
      )}

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

      <section aria-label="Cập nhật trạng thái đơn hàng" className="order-detail__section">
        <h2>Cập nhật trạng thái</h2>
        <div className="order-detail__actions">
          <label htmlFor="admin-order-status-select">
            Trạng thái mới
            <select
              id="admin-order-status-select"
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as OrderStatus)}
            >
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {formatOrderStatusVi(value)}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="admin-order-status-note">
            Ghi chú (tuỳ chọn)
            <input
              id="admin-order-status-note"
              type="text"
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              placeholder="Ghi chú cho lần đổi trạng thái này"
            />
          </label>

          <button
            type="button"
            className="btn btn--primary"
            onClick={handleStatusSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Đang cập nhật..." : "Cập nhật trạng thái"}
          </button>

          {statusError && (
            <p role="alert" className="error-state">
              {statusError}
            </p>
          )}
        </div>
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
    </article>
  );
}
