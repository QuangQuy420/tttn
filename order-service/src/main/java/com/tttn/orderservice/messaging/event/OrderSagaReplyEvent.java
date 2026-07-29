package com.tttn.orderservice.messaging.event;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Generic shape for saga reply messages consumed off {@code order-saga-events}
 * ({@code stock.reserved} / {@code stock.reserve.rejected} / {@code payment.completed} /
 * {@code payment.failed}). Not every field applies to every routing key — {@code reason} is
 * only set on the two rejection/failure keys, {@code paymentId}/{@code transactionCode} only
 * on {@code payment.completed}. See {@link com.tttn.orderservice.messaging.OrderSagaEventListener}
 * for which fields are read for which key.
 */
public record OrderSagaReplyEvent(
        UUID orderId,
        LocalDateTime occurredAt,
        String reason,
        UUID paymentId,
        String transactionCode
) {
}
