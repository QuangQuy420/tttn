"use client";

import { useEffect, useState } from "react";
import { ApiError, getAdminOrdersSummary, getProducts, listUsers } from "@/lib/api";
import { useAdminProfile } from "@/components/admin/AdminGuard";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { hasPermission } from "@/lib/auth/admin-access";
import { getAccessToken } from "@/lib/auth/session";
import { formatOrderStatusVi, ORDER_STATUSES } from "@/lib/labels";
import type { AdminOrdersSummary } from "@/types/order";

// Admin dashboard (T11, AC5) — total products/customers/orders plus a per-status order-count
// breakdown, all read-only. Reuses getProducts/listUsers (already used by the products/users
// admin pages for the same "total" numbers) alongside the new getAdminOrdersSummary.
// Each card loads only when the user holds the permission its API needs (AC7).
export default function AdminDashboardPage() {
  const permissions = useAdminProfile()?.permissions ?? [];
  const canSeeProducts = hasPermission(permissions, "product:manage");
  const canSeeCustomers = hasPermission(permissions, "user:manage-roles");
  const canSeeOrders = hasPermission(permissions, "order:manage");

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
          // Token + includeAllStatuses: "Tổng sản phẩm" counts every status (AC69).
          canSeeProducts ? getProducts({ limit: 1, includeAllStatuses: true }, token) : null,
          canSeeCustomers ? listUsers(token, 1, 1) : null,
          canSeeOrders ? getAdminOrdersSummary(token) : null,
        ]);
        if (!cancelled) {
          setTotalProducts(productsResult?.meta.total ?? 0);
          setTotalCustomers(usersResult?.meta.total ?? 0);
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
  }, [canSeeProducts, canSeeCustomers, canSeeOrders]);

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
            {(canSeeProducts || canSeeCustomers || canSeeOrders) && (
              <div className="admin-stats">
                {canSeeProducts && (
                  <div className="admin-stat-card">
                    <div className="admin-stat-card__label">Tổng sản phẩm</div>
                    <div className="admin-stat-card__value">{totalProducts}</div>
                  </div>
                )}
                {canSeeCustomers && (
                  <div className="admin-stat-card">
                    <div className="admin-stat-card__label">Tổng khách hàng</div>
                    <div className="admin-stat-card__value">{totalCustomers}</div>
                  </div>
                )}
                {canSeeOrders && (
                  <div className="admin-stat-card">
                    <div className="admin-stat-card__label">Tổng đơn hàng</div>
                    <div className="admin-stat-card__value">{ordersSummary?.totalOrders ?? 0}</div>
                  </div>
                )}
              </div>
            )}

            {canSeeOrders && (
              <>
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
          </>
        )}
      </section>
    </>
  );
}
