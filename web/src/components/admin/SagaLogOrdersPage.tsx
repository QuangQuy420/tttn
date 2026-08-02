"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getSagaLogsForDay } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { formatIsoDateVi } from "@/lib/format/date";
import { formatSagaLogLevelVi } from "@/lib/labels";
import type { OrderLogSummary } from "@/types/saga-log";

interface SagaLogOrdersPageProps {
  date: string;
}

// Nhật ký xử lý đơn hàng — order list for one day (T30, FR18, AC11/AC12). One row per order with
// saga-log activity on `date`, showing how many entries it has and the worst (most severe)
// level among them, so an operator can tell at a glance which orders need a closer look.
export function SagaLogOrdersPage({ date }: SagaLogOrdersPageProps) {
  const [orders, setOrders] = useState<OrderLogSummary[]>([]);
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
        const result = await getSagaLogsForDay(token, date);
        if (!cancelled) setOrders(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Không thể tải danh sách đơn hàng trong ngày.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Nhật ký xử lý đơn hàng — ngày {formatIsoDateVi(date)}</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <Link href="/admin/saga-logs" className="product-detail__back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Về danh sách ngày
        </Link>

        {isLoading && <LoadingState label="Đang tải danh sách đơn hàng..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <div className="admin-table">
            <div className="admin-table__row admin-table__row--saga-orders admin-table__row--head">
              <span>Mã đơn hàng</span>
              <span>Số bản ghi</span>
              <span>Mức cao nhất</span>
              <span>Hoạt động gần nhất</span>
            </div>
            {orders.map((order) => (
              <Link
                key={order.orderId}
                href={`/admin/saga-logs/${date}/${order.orderId}`}
                className={`admin-table__row admin-table__row--saga-orders admin-table__row--body${
                  order.worstLevel === "WARN" ? " admin-table__row--warning" : ""
                }`}
              >
                <span className="admin-table__name">{order.orderCode}</span>
                <span>{order.entryCount}</span>
                <span>
                  <span
                    className={`admin-status-badge${
                      order.worstLevel === "WARN" ? " admin-status-badge--warning" : " admin-status-badge--active"
                    }`}
                  >
                    {formatSagaLogLevelVi(order.worstLevel)}
                  </span>
                </span>
                <span>{new Date(order.lastOccurredAt).toLocaleString("vi-VN")}</span>
              </Link>
            ))}
            {orders.length === 0 && (
              <div className="admin-table__empty">
                Không có đơn hàng nào có hoạt động trong ngày này.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
