"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getOrderSagaLogs } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { formatSagaLogRowStatusVi, formatSagaLogServiceVi, formatSagaLogStageVi } from "@/lib/labels";
import type { OrderSagaLog } from "@/types/saga-log";

interface SagaLogDetailPageProps {
  orderId: string;
  date: string;
}

// Nhật ký xử lý đơn hàng — full saga timeline for one order (T30, FR14/FR18, AC11/AC12/AC13).
// Rendered as a table (not a bare timeline list) so each row reads as one saga event: which
// service fired it (sourceService), which service it was addressed to (targetService — for a
// RECONCILIATION_RESENT row this is also "which service the retry went to"), a plain
// success/failure status (derived from level), the error reason in its own "Ghi chú" column
// (errorDetail — only WARN rows ever have one), and how many automatic retry attempts the order
// had so far (retryCount — only set on RECONCILIATION_RESENT/RECONCILIATION_EXHAUSTED rows, the
// only stages that are part of the reconciliation retry loop). Oldest first — the API
// (OrderSagaLogRepository.findByOrderIdOrderByOccurredAtAsc) already returns entries in that
// order, the client-side sort here is just a defensive guarantee, not a correction.
//
// Note: OrderSagaLogResponse (the API contract) carries no orderCode — so the heading identifies
// the order by its id (the only identifier this screen has without extra plumbing beyond what
// the plan scoped).
export function SagaLogDetailPage({ orderId, date }: SagaLogDetailPageProps) {
  const [logs, setLogs] = useState<OrderSagaLog[]>([]);
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
        const result = await getOrderSagaLogs(token, orderId);
        if (!cancelled) setLogs(result);
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
  }, [orderId]);

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Chi tiết nhật ký xử lý đơn hàng</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <Link href={`/admin/saga-logs/${date}`} className="product-detail__back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Về danh sách đơn hàng trong ngày
        </Link>

        {isLoading && <LoadingState label="Đang tải nhật ký..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <article className="order-detail__section">
            <h2>Dòng thời gian đơn hàng {orderId}</h2>
            <div className="admin-table">
              <div className="admin-table__row admin-table__row--saga-detail admin-table__row--head">
                <span>Thời gian</span>
                <span>Mốc sự kiện</span>
                <span>Nơi bắn sự kiện</span>
                <span>Nơi nhận sự kiện</span>
                <span>Trạng thái</span>
                <span>Ghi chú</span>
                <span>Số lần retry</span>
              </div>
              {sortedLogs.map((entry, index) => (
                <div
                  key={`${entry.stage}-${entry.occurredAt}-${index}`}
                  className={`admin-table__row admin-table__row--saga-detail admin-table__row--body${
                    entry.level === "WARN" ? " admin-table__row--warning" : ""
                  }`}
                >
                  <span>{new Date(entry.occurredAt).toLocaleString("vi-VN")}</span>
                  <span className="admin-table__name">{formatSagaLogStageVi(entry.stage)}</span>
                  <span>{formatSagaLogServiceVi(entry.sourceService)}</span>
                  <span>{formatSagaLogServiceVi(entry.targetService)}</span>
                  <span>
                    <span
                      className={`admin-status-badge${
                        entry.level === "WARN" ? " admin-status-badge--warning" : " admin-status-badge--active"
                      }`}
                    >
                      {formatSagaLogRowStatusVi(entry.level)}
                    </span>
                  </span>
                  <span>{entry.errorDetail ?? "—"}</span>
                  <span>{entry.retryCount ?? "—"}</span>
                </div>
              ))}
            </div>
            {sortedLogs.length === 0 && (
              <div className="admin-table__empty">Chưa có nhật ký nào cho đơn hàng này.</div>
            )}
          </article>
        )}
      </section>
    </>
  );
}
