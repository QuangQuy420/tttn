// Mirrors order-service's order DTOs field-for-field (api-gateway passes these through
// unchanged — see plan NFR1, no response reshaping in the proxy). See
// order-service/src/main/java/com/tttn/orderservice/dto/response/*.java and dto/request/*.java,
// plus com.tttn.orderservice.enums.OrderStatus / PaymentStatus.

// Mirrors com.tttn.orderservice.enums.OrderStatus.
export type OrderStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

// Mirrors com.tttn.orderservice.enums.PaymentStatus.
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

// Mirrors OrderItemResponse.
export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  skuVariant: string;
  color: string;
  size: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

// Mirrors OrderStatusHistoryResponse.
export interface OrderStatusHistoryEntry {
  id: string;
  status: OrderStatus;
  changedBy: string | null;
  note: string | null;
  changedAt: string;
}

// Mirrors OrderSummaryResponse (the row shape used in the paginated order list).
export interface OrderSummary {
  id: string;
  orderCode: string;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  receiverName: string;
  receiverPhone: string;
  createdAt: string;
}

// Mirrors OrderResponse (order detail).
export interface Order {
  id: string;
  orderCode: string;
  userId: string;
  totalAmount: number;
  status: OrderStatus;
  paymentId: string | null;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  receiverName: string;
  receiverPhone: string;
  shippingAddress: string;
  note: string | null;
  items: OrderItem[];
  statusHistories: OrderStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// Mirrors CheckoutRequest. `variantIds` (T-checkout-select) is the subset of the cart the user
// picked to check out — order-service creates the order from just these and leaves the rest of
// the cart untouched (see CartService.removeItems, used instead of clearCart post-payment).
export interface CheckoutPayload {
  receiverName: string;
  receiverPhone: string;
  shippingAddress: string;
  note?: string;
  paymentMethod: string;
  variantIds: string[];
}

// Mirrors CheckoutResponse.
export interface CheckoutResult {
  orderId: string;
  orderCode: string;
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentId: string;
  paymentStatus: PaymentStatus;
  paymentUrl: string | null;
}

// Mirrors CancelOrderRequest.
export interface CancelOrderPayload {
  reason: string;
}

// Mirrors PageResponse<T> (order-service's own paginated envelope — NOT product-service's flat
// PaginatedResponse<T> shape in src/types/api.ts; field names differ, see
// order-service/src/main/java/com/tttn/orderservice/dto/response/PageResponse.java).
export interface OrderPageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

// Mirrors OrderController.getOrders' query params.
export interface GetOrdersParams {
  status?: OrderStatus;
  page?: number;
  size?: number;
}

// Mirrors AdminOrderSummaryResponse (order-service dto/response/AdminOrderSummaryResponse.java) —
// the admin dashboard's order totals. `ordersByStatus` is Partial since the backend's Map only
// contains statuses that have at least one order.
export interface AdminOrdersSummary {
  totalOrders: number;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
}
