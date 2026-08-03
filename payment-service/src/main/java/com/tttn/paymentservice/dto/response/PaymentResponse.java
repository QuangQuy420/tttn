package com.tttn.paymentservice.dto.response;

import com.tttn.paymentservice.entity.enums.PaymentMethod;
import com.tttn.paymentservice.entity.enums.PaymentStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record PaymentResponse(
        UUID id,
        UUID orderId,
        UUID userId,
        BigDecimal amount,
        String currency,
        PaymentMethod paymentMethod,
        PaymentStatus status,
        String transactionId,
        String paymentUrl,
        String failureReason,
        Instant paidAt,
        Instant createdAt,
        Instant updatedAt
) {
}