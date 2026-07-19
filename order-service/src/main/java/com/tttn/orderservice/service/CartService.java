package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.request.AddCartItemRequest;
import com.tttn.orderservice.dto.request.UpdateCartItemRequest;
import com.tttn.orderservice.dto.response.CartResponse;
import com.tttn.orderservice.model.cart.Cart;

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

    Cart getCartEntity(UUID userId);
}