// Admin-only saga-log calls (T29) — read-only "nhật ký đơn hàng" for the checkout saga
// (reconciliation resends, dead-letters, saga milestones — see plan FR14-FR16). Copies the
// authHeaders/apiFetch pattern from admin-orders.ts. Calls api-gateway's
// AdminSagaLogsController (api-gateway/src/routes/saga-logs.controller.ts,
// @Controller('api/admin/saga-logs')), which forwards to order-service's
// /api/v1/admin/saga-logs/* routes, guarded by the same JwtGuard + PermissionsGuard +
// order:manage as the existing admin-orders routes.

import type { OrderLogSummary, OrderSagaLog, SagaLogDay } from "@/types/saga-log";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getSagaLogDays(token: string): Promise<SagaLogDay[]> {
  return apiFetch<SagaLogDay[]>("/admin/saga-logs/days", {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function getSagaLogsForDay(token: string, date: string): Promise<OrderLogSummary[]> {
  return apiFetch<OrderLogSummary[]>(`/admin/saga-logs/days/${encodeURIComponent(date)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function getOrderSagaLogs(token: string, orderId: string): Promise<OrderSagaLog[]> {
  return apiFetch<OrderSagaLog[]>(`/admin/saga-logs/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}
