package com.tttn.orderservice.dto.response;

import java.math.BigDecimal;
import java.util.UUID;

public record ProductVariantResponse(
        UUID id,
        String color,
        String size,
        BigDecimal extraPrice,
        String skuVariant
) {
}