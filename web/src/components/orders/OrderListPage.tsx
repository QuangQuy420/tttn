"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Pagination } from "@/components/common/Pagination";
import { useOrders } from "@/hooks/useOrders";
import { usePageParam } from "@/hooks/usePageParam";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi, ORDER_STATUSES } from "@/lib/labels";
import type { OrderStatus } from "@/types/order";

const PAGE_SIZE = 10;

// FR3/T18: paginated order history for the logged-in user, with an optional status filter.
export function OrderListPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [page, setPage] = usePageParam();

  const { orders, meta, isLoading, error } = useOrders({ status, page, limit: PAGE_SIZE });

  function handleStatusChange(value: string) {
    setStatus(value ? (value as OrderStatus) : undefined);
    setPage(1);
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
          <div className="admin-table">
            <div className="admin-table__row admin-table__row--orders admin-table__row--head">
              <span>Mã đơn hàng</span>
              <span>Người nhận</span>
              <span>Tổng tiền</span>
              <span>Trạng thái</span>
              <span>Ngày đặt</span>
            </div>
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
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
          </div>

          {meta && <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />}
        </>
      )}
    </section>
  );
}
