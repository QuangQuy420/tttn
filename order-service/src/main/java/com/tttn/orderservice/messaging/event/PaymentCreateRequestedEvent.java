package com.tttn.orderservice.messaging.event;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record PaymentCreateRequestedEvent(
        UUID orderId,
        LocalDateTime occurredAt,
        UUID userId,
        String orderCode,
        BigDecimal amount,
        String paymentMethod
) {
}
