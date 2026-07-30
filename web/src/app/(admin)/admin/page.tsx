"use client";

import { useEffect, useState } from "react";
import { ApiError, getAdminOrdersSummary, getProducts, listUsers } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { formatOrderStatusVi, ORDER_STATUSES } from "@/lib/labels";
import type { AdminOrdersSummary } from "@/types/order";

// Admin dashboard (T11, AC5) — total products/customers/orders plus a per-status order-count
// breakdown, all read-only. Reuses getProducts/listUsers (already used by the products/users
// admin pages for the same "total" numbers) alongside the new getAdminOrdersSummary.
export default function AdminDashboardPage() {
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [ordersSummary, setOrdersSummary] = useState<AdminOrdersSummary | null>(null);
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
        const [productsResult, usersResult, summaryResult] = await Promise.all([
          getProducts({ limit: 1 }),
          listUsers(token, 1, 1),
          getAdminOrdersSummary(token),
        ]);
        if (!cancelled) {
          setTotalProducts(productsResult.total);
          setTotalCustomers(usersResult.data.total);
          setOrdersSummary(summaryResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải dữ liệu tổng quan.");
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
        <div className="admin-header__title">Tổng quan</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        {isLoading && <LoadingState label="Đang tải dữ liệu tổng quan..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <>
            <div className="admin-stats">
              <div className="admin-stat-card">
                <div className="admin-stat-card__label">Tổng sản phẩm</div>
                <div className="admin-stat-card__value">{totalProducts}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-card__label">Tổng khách hàng</div>
                <div className="admin-stat-card__value">{totalCustomers}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-card__label">Tổng đơn hàng</div>
                <div className="admin-stat-card__value">{ordersSummary?.totalOrders ?? 0}</div>
              </div>
            </div>

            <h2>Đơn hàng theo trạng thái</h2>
            <div className="admin-stats">
              {ORDER_STATUSES.map((status) => (
                <div key={status} className="admin-stat-card">
                  <div className="admin-stat-card__label">{formatOrderStatusVi(status)}</div>
                  <div className="admin-stat-card__value">
                    {ordersSummary?.ordersByStatus[status] ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
