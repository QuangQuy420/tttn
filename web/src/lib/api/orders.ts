import type {
  CancelOrderPayload,
  CheckoutPayload,
  CheckoutResult,
  GetOrdersParams,
  Order,
  OrderPageResponse,
  OrderSummary,
} from "@/types/order";
import { apiFetch } from "./client";

// Calls api-gateway's orders proxy (api-gateway/src/routes/orders.controller.ts's
// OrdersController, @Controller('api/orders')), which forwards to order-service's
// /api/v1/users/{userId}/... using the userId from the caller's verified JWT — never passed
// from here. See plan T5/T6/T10.

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function checkout(token: string, payload: CheckoutPayload): Promise<CheckoutResult> {
  return apiFetch<CheckoutResult>("/orders/checkout", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function getOrders(
  token: string,
  params: GetOrdersParams = {},
): Promise<OrderPageResponse<OrderSummary>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.size !== undefined) query.set("size", String(params.size));

  const queryString = query.toString();
  return apiFetch<OrderPageResponse<OrderSummary>>(
    `/orders${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      headers: authHeaders(token),
    },
  );
}

export function getOrderById(token: string, id: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function cancelOrder(token: string, id: string, reason: string): Promise<Order> {
  const payload: CancelOrderPayload = { reason };
  return apiFetch<Order>(`/orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}
