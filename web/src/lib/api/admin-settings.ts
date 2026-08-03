// Admin-only checkout-saga reconciliation settings (T13, AC1/AC2/AC4) — retry interval, stuck
// threshold, and max attempts for order-service's SagaReconciliationJob. Copies the
// authHeaders/apiFetch pattern from admin-saga-logs.ts. Calls api-gateway's
// AdminSagaSettingsController (api-gateway/src/routes/orders.controller.ts,
// @Controller('api/admin/saga-settings')), which forwards to order-service's
// /api/v1/admin/saga-settings routes, guarded by JwtGuard + PermissionsGuard +
// saga-settings:manage.

import { apiFetch } from "./client";

// Mirrors order-service's ReconciliationSettingsResponse, returned by both GET and PUT.
export interface SagaSettings {
  intervalMs: number;
  stuckThresholdMinutes: number;
  maxAttempts: number;
  updatedAt: string;
  updatedBy: string | null;
}

// Mirrors api-gateway's UpdateSagaSettingsDto — body for PUT.
export interface UpdateSagaSettingsRequest {
  intervalMs: number;
  stuckThresholdMinutes: number;
  maxAttempts: number;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getSagaSettings(token: string): Promise<SagaSettings> {
  return apiFetch<SagaSettings>("/admin/saga-settings", {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function updateSagaSettings(
  token: string,
  payload: UpdateSagaSettingsRequest,
): Promise<SagaSettings> {
  return apiFetch<SagaSettings>("/admin/saga-settings", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}
