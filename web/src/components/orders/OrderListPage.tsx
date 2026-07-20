"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrders } from "@/hooks/useOrders";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi, ORDER_STATUSES } from "@/lib/labels";
import type { OrderStatus } from "@/types/order";

const PAGE_SIZE = 10;

// FR3/T18: paginated order history for the logged-in user, with an optional status filter.
export function OrderListPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [page, setPage] = useState(0);

  const { orders, totalPages, isLoading, error } = useOrders({ status, page, size: PAGE_SIZE });

  function handleStatusChange(value: string) {
    setStatus(value ? (value as OrderStatus) : undefined);
    setPage(0);
  }

  return (
    <section aria-labelledby="orders-heading" className="orders-page">
      <h1 id="orders-heading">Đơn hàng của tôi</h1>

      <label htmlFor="orders-status-filter" className="orders-page__filter">
        Lọc theo trạng thái
        <select
          id="orders-status-filter"
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

      {isLoading && <LoadingState label="Đang tải đơn hàng..." />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && orders.length === 0 && (
        <p className="orders-page__empty">Bạn chưa có đơn hàng nào.</p>
      )}

      {!isLoading && !error && orders.length > 0 && (
        <>
          <ul className="orders-page__list">
            {orders.map((order) => (
              <li key={order.id} className="order-summary-item">
                <Link href={`/orders/${order.id}`} className="order-summary-item__link">
                  <span className="order-summary-item__code">{order.orderCode}</span>
                  <span className="order-summary-item__status">
                    {formatOrderStatusVi(order.status)}
                  </span>
                  <span className="order-summary-item__total">
                    {formatPriceVnd(order.totalAmount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
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
                Trang {page + 1} / {totalPages}
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
        </>
      )}
    </section>
  );
}
