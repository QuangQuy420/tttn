package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.request.AddCartItemRequest;
import com.tttn.orderservice.dto.request.UpdateCartItemRequest;
import com.tttn.orderservice.dto.response.CartRefreshResponse;
import com.tttn.orderservice.dto.response.CartResponse;
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

    Cart getCartEntity(UUID userId);

    /**
     * Re-applies the latest state of one product (price, name, image, status, stock) to every
     * cart holding it — called from the {@code product-events} listener. A 404 marks its items
     * {@code PRODUCT_UNAVAILABLE}; any other product-service failure propagates so the message
     * is retried instead of wrongly marking items unavailable.
     */
    void syncProduct(UUID productId);

    /**
     * Re-fetches every product in the user's cart and saves the refreshed snapshot, returning
     * the variants whose price or availability changed.
     */
    CartRefreshResponse refreshCart(UUID userId);
}