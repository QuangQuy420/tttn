// Mirrors order-service's cart DTOs (com.tttn.orderservice.dto.response/request) field-for-field.
// See order-service/src/main/java/com/tttn/orderservice/controller/CartController.java and its
// DTOs — CartResponse/CartItemResponse/AddCartItemRequest/UpdateCartItemRequest.

// Mirrors order-service's cart availability reasons — why an item can't be checked out right now.
export type CartUnavailableReason =
  | "PRODUCT_UNAVAILABLE"
  | "VARIANT_REMOVED"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK";

// Mirrors CartItemResponse.
export interface CartItem {
  productId: string;
  variantId: string;
  productName: string;
  skuVariant: string;
  color: string;
  colorHex: string | null;
  size: string;
  productImageUrl: string | null;
  basePrice: number;
  extraPrice: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  // Kept in sync with product-service by order-service; an unavailable item stays in the cart
  // but can't be selected for checkout.
  available: boolean;
  unavailableReason: CartUnavailableReason | null;
  availableStock: number | null;
}

// Mirrors CartResponse.
export interface Cart {
  userId: string;
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

// Mirrors CartRefreshResponse (POST /cart/refresh) — the re-synced cart plus the variants whose
// price or availability changed during this refresh.
export interface CartRefreshResult {
  cart: Cart;
  changedVariantIds: string[];
}

// Mirrors AddCartItemRequest.
export interface AddCartItemPayload {
  productId: string;
  variantId: string;
  quantity: number;
}

// Mirrors UpdateCartItemRequest.
export interface UpdateCartItemPayload {
  quantity: number;
}
