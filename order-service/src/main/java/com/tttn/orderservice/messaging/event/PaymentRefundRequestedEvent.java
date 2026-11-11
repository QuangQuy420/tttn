package com.tttn.orderservice.messaging.event;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Payload of {@code payment.refund.requested}: payment-service refunds the order's PAID payment
 * and replies {@code payment.refunded} (an {@link OrderSagaReplyEvent} carrying {@code paymentId}).
 */
public record PaymentRefundRequestedEvent(
        UUID orderId,
        LocalDateTime occurredAt,
        String reason
) {
}
