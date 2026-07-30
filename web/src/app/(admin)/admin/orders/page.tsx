"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, listAdminOrders } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi, ORDER_STATUSES } from "@/lib/labels";
import type { OrderStatus, OrderSummary } from "@/types/order";

const PAGE_SIZE = 20;

// Admin order list (T12, AC6) — all orders across every customer, with a status filter and
// pagination. Pagination is 0-indexed (useState(0), displaying page + 1) because order-service's
// admin list endpoint is 0-indexed, unlike AdminUsersPage's 1-indexed convention — see
// OrderListPage.tsx for the customer-facing equivalent this mirrors.
export default function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Vui lòng đăng nhập lại.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await listAdminOrders(token, { status, page, size: PAGE_SIZE });
        if (!cancelled) {
          setOrders(result.content);
          setTotalElements(result.totalElements);
          setTotalPages(result.totalPages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải danh sách đơn hàng.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [status, page]);

  function handleStatusChange(value: string) {
    setStatus(value ? (value as OrderStatus) : undefined);
    setPage(0);
  }

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Quản lý đơn hàng</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <div className="admin-toolbar">
          <label htmlFor="admin-orders-status-filter" className="orders-page__filter">
            Lọc theo trạng thái
            <select
              id="admin-orders-status-filter"
              value={status ?? ""}
              onChange={(event) => handleStatusChange(event.target.value)}
            >
              <option value="">Tất cả</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {formatOrderStatusVi(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading && <LoadingState label="Đang tải đơn hàng..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <div className="admin-table">
            <div className="admin-table__row admin-table__row--orders admin-table__row--head">
              <span>Mã đơn hàng</span>
              <span>Khách hàng</span>
              <span>Tổng tiền</span>
              <span>Trạng thái</span>
              <span>Ngày đặt</span>
            </div>
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className="admin-table__row admin-table__row--orders admin-table__row--body"
              >
                <span className="admin-table__name">{order.orderCode}</span>
                <span>
                  {order.receiverName}
                  <span className="admin-table__tag"> · {order.receiverPhone}</span>
                </span>
                <span className="admin-table__price">{formatPriceVnd(order.totalAmount)}</span>
                <span className="admin-status-badge">{formatOrderStatusVi(order.status)}</span>
                <span>{new Date(order.createdAt).toLocaleString("vi-VN")}</span>
              </Link>
            ))}
            {orders.length === 0 && (
              <div className="admin-table__empty">Chưa có đơn hàng nào.</div>
            )}
          </div>
        )}

        {!isLoading && !error && totalPages > 1 && (
          <div className="orders-page__pagination">
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page <= 0}
            >
              Trang trước
            </button>
            <span>
              Trang {page + 1} / {totalPages} ({totalElements} đơn hàng)
            </span>
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              disabled={page >= totalPages - 1}
            >
              Trang sau
            </button>
          </div>
        )}
      </section>
    </>
  );
}
