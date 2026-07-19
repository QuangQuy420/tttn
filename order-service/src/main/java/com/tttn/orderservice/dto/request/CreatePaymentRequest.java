package com.tttn.orderservice.dto.request;

import java.math.BigDecimal;
import java.util.UUID;

public record CreatePaymentRequest(
        UUID orderId,
        UUID userId,
        String orderCode,
        BigDecimal amount,
        String paymentMethod
) {
}