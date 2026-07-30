// Admin-only order calls, kept separate from the self-service `orders.ts` (which only ever
// acts on the *caller's own* orders via /orders). Everything here acts on ANY order regardless
// of owner and requires the caller to hold `order:manage`. Calls api-gateway's
// AdminOrdersController (api-gateway/src/routes/orders.controller.ts, @Controller('api/admin/
// orders')), which forwards to order-service's /api/v1/admin/orders/* routes. See plan T6/T7/T10.

import type {
  AdminOrdersSummary,
  GetOrdersParams,
  Order,
  OrderPageResponse,
  OrderStatus,
  OrderSummary,
} from "@/types/order";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function listAdminOrders(
  token: string,
  params: GetOrdersParams = {},
): Promise<OrderPageResponse<OrderSummary>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.size !== undefined) query.set("size", String(params.size));

  const queryString = query.toString();
  return apiFetch<OrderPageResponse<OrderSummary>>(
    `/admin/orders${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      headers: authHeaders(token),
    },
  );
}

export function getAdminOrderDetail(token: string, id: string): Promise<Order> {
  return apiFetch<Order>(`/admin/orders/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function getAdminOrdersSummary(token: string): Promise<AdminOrdersSummary> {
  return apiFetch<AdminOrdersSummary>("/admin/orders/summary", {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function updateOrderStatusAdmin(
  token: string,
  id: string,
  status: OrderStatus,
  note?: string,
): Promise<Order> {
  return apiFetch<Order>(`/admin/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(note ? { status, note } : { status }),
  });
}
