import type {
  CancelOrderPayload,
  CheckoutPayload,
  CheckoutResult,
  GetOrdersParams,
  Order,
  OrderSummary,
} from "@/types/order";
import type { Paginated } from "@/types/api";
import { apiFetchData, apiFetchPage } from "./client";

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
  return apiFetchData<CheckoutResult>("/orders/checkout", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function getOrders(
  token: string,
  params: GetOrdersParams = {},
): Promise<Paginated<OrderSummary>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.limit !== undefined) query.set("limit", String(params.limit));

  const queryString = query.toString();
  return apiFetchPage<OrderSummary>(
    `/orders${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      headers: authHeaders(token),
    },
  );
}

export function getOrderById(token: string, id: string): Promise<Order> {
  return apiFetchData<Order>(`/orders/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function cancelOrder(token: string, id: string, reason: string): Promise<Order> {
  const payload: CancelOrderPayload = { reason };
  return apiFetchData<Order>(`/orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}
