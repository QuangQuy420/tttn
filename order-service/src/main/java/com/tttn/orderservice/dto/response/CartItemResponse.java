package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.CartItemUnavailableReason;

import java.math.BigDecimal;
import java.util.UUID;

public record CartItemResponse(
        UUID productId,
        UUID variantId,
        String productName,
        String skuVariant,
        String color,
        String colorHex,
        String size,
        String productImageUrl,
        BigDecimal basePrice,
        BigDecimal extraPrice,
        BigDecimal unitPrice,
        Integer quantity,
        BigDecimal subtotal,
        boolean available,
        CartItemUnavailableReason unavailableReason,
        Integer availableStock
) {
}