"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getSagaLogDays } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { formatIsoDateVi } from "@/lib/format/date";
import type { SagaLogDay } from "@/types/saga-log";

// Nhật ký xử lý đơn hàng — day list (T30, FR18, AC11). Mirrors AdminOrdersPage.tsx's table layout:
// one row per day that has at least one saga-log entry, most recent first (already ordered
// that way by order-service — see OrderSagaLogService.getLogDays()). Days with at least one
// WARN-level entry (`hasWarning`) are highlighted so an operator immediately sees which days
// need attention.
export function SagaLogDaysPage() {
  const [days, setDays] = useState<SagaLogDay[]>([]);
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
        const result = await getSagaLogDays(token);
        if (!cancelled) setDays(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải nhật ký đơn hàng.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Nhật ký xử lý đơn hàng</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        {isLoading && <LoadingState label="Đang tải nhật ký..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <div className="admin-table">
            <div className="admin-table__row admin-table__row--saga-days admin-table__row--head">
              <span>Ngày</span>
              <span>Tổng số bản ghi</span>
              <span>Cảnh báo</span>
            </div>
            {days.map((day) => (
              <Link
                key={day.date}
                href={`/admin/saga-logs/${day.date}`}
                className={`admin-table__row admin-table__row--saga-days admin-table__row--body${
                  day.hasWarning ? " admin-table__row--warning" : ""
                }`}
              >
                <span className="admin-table__name">{formatIsoDateVi(day.date)}</span>
                <span>{day.totalCount}</span>
                <span>
                  {day.hasWarning ? (
                    <span className="admin-status-badge admin-status-badge--warning">
                      Có cảnh báo
                    </span>
                  ) : (
                    <span className="admin-status-badge admin-status-badge--active">
                      Bình thường
                    </span>
                  )}
                </span>
              </Link>
            ))}
            {days.length === 0 && (
              <div className="admin-table__empty">Chưa có nhật ký đơn hàng nào.</div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
