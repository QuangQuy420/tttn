package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.CartItemUnavailableReason;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One selected cart item that no longer matches product-service at checkout time — sent in
 * {@code error.details} of the 409 {@code CART_CHANGED} response.
 */
public record CartChangedItemResponse(
        UUID productId,
        UUID variantId,
        String productName,
        BigDecimal cartUnitPrice,
        BigDecimal currentUnitPrice,
        boolean available,
        CartItemUnavailableReason unavailableReason
) {
}
