package com.tttn.orderservice.client.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record PaymentServiceCreateRequest(
        UUID orderId,
        UUID userId,
        BigDecimal amount,
        String paymentMethod
) {
}