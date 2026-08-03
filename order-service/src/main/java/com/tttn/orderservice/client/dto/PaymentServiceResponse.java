package com.tttn.orderservice.client.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record PaymentServiceResponse(
        UUID id,
        UUID orderId,
        UUID userId,
        BigDecimal amount,
        String currency,
        String paymentMethod,
        String status,
        String transactionId,
        String paymentUrl,
        String failureReason,
        Instant paidAt,
        Instant createdAt,
        Instant updatedAt
) {
}