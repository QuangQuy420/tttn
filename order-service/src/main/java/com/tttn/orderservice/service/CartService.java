package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.request.AddCartItemRequest;
import com.tttn.orderservice.dto.request.UpdateCartItemRequest;
import com.tttn.orderservice.dto.response.CartResponse;
import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.model.cart.Cart;

import java.util.List;
import java.util.UUID;

public interface CartService {

    CartResponse getCart(UUID userId);

    CartResponse addItem(
            UUID userId,
            AddCartItemRequest request
    );

    CartResponse updateItem(
            UUID userId,
            UUID productId,
            UpdateCartItemRequest request
    );

    CartResponse removeItem(
            UUID userId,
            UUID productId
    );

    void clearCart(UUID userId);

    /**
     * Removes just the given variants from the cart (checkout of a partial selection) —
     * unlike {@link #clearCart}, items NOT in {@code variantIds} are left in place. A no-op
     * if the cart doesn't exist or none of {@code variantIds} are in it.
     */
    void removeItems(UUID userId, List<UUID> variantIds);

    /**
     * Sweeps ALL carts in Redis and refreshes the snapshot (name, prices, variant fields,
     * image) of every item belonging to {@code product}; items whose variant no longer exists
     * on the product (soft-deleted) are removed. Quantity is never changed, stock is not
     * validated, and the cart's remaining TTL is preserved — a cart left empty is deleted.
     * Driven by {@code product.updated} events, see
     * {@link com.tttn.orderservice.messaging.ProductEventListener}.
     */
    void refreshProductInCarts(ProductResponse product);

    /**
     * Sweeps ALL carts in Redis and removes every item of the given product (product deleted
     * or no longer published). A cart left empty is deleted; remaining TTL is preserved
     * otherwise. Driven by {@code product.deleted} events, see
     * {@link com.tttn.orderservice.messaging.ProductEventListener}.
     */
    void removeProductFromCarts(UUID productId);

    Cart getCartEntity(UUID userId);
}