// Admin-only saga-log calls (T29) — read-only "nhật ký đơn hàng" for the checkout saga
// (reconciliation resends, dead-letters, saga milestones — see plan FR14-FR16). Copies the
// authHeaders/apiFetch pattern from admin-orders.ts. Calls api-gateway's
// AdminSagaLogsController (api-gateway/src/routes/saga-logs.controller.ts,
// @Controller('api/admin/saga-logs')), which forwards to order-service's
// /api/v1/admin/saga-logs/* routes, guarded by the same JwtGuard + PermissionsGuard +
// order:manage as the existing admin-orders routes.

import type { OrderLogSummary, OrderSagaLog, SagaLogDay } from "@/types/saga-log";
import type { PageParams, Paginated } from "@/types/api";
import { apiFetchPage } from "./client";
import { pageQuery } from "./query";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getSagaLogDays(
  token: string,
  params: PageParams = {},
): Promise<Paginated<SagaLogDay>> {
  return apiFetchPage<SagaLogDay>(`/admin/saga-logs/days${pageQuery(params)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function getSagaLogsForDay(
  token: string,
  date: string,
  params: PageParams = {},
): Promise<Paginated<OrderLogSummary>> {
  return apiFetchPage<OrderLogSummary>(
    `/admin/saga-logs/days/${encodeURIComponent(date)}${pageQuery(params)}`,
    {
      method: "GET",
      headers: authHeaders(token),
    },
  );
}

export function getOrderSagaLogs(
  token: string,
  orderId: string,
  params: PageParams = {},
): Promise<Paginated<OrderSagaLog>> {
  return apiFetchPage<OrderSagaLog>(
    `/admin/saga-logs/orders/${encodeURIComponent(orderId)}${pageQuery(params)}`,
    {
      method: "GET",
      headers: authHeaders(token),
    },
  );
}
