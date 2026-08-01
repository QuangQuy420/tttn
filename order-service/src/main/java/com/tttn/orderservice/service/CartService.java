package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.request.AddCartItemRequest;
import com.tttn.orderservice.dto.request.UpdateCartItemRequest;
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
}