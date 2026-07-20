package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.PaymentStatus;

import java.util.UUID;

public record PaymentCreationResponse(
        UUID paymentId,
        UUID orderId,
        PaymentStatus status,
        String paymentUrl,
        String transactionCode
) {
}