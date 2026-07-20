// Mirrors order-service's cart DTOs (com.tttn.orderservice.dto.response/request) field-for-field.
// See order-service/src/main/java/com/tttn/orderservice/controller/CartController.java and its
// DTOs — CartResponse/CartItemResponse/AddCartItemRequest/UpdateCartItemRequest.

// Mirrors CartItemResponse.
export interface CartItem {
  productId: string;
  variantId: string;
  productName: string;
  skuVariant: string;
  color: string;
  size: string;
  productImageUrl: string | null;
  basePrice: number;
  extraPrice: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
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
