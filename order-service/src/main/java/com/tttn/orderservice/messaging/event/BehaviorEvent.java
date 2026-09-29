package com.tttn.orderservice.messaging.event;

import java.util.Map;
import java.util.UUID;

/**
 * Payload published on the {@code behavior-events} topic exchange (ADD_TO_CART / PURCHASE from
 * this service) and consumed by recommendation-service — see
 * {@code infra/contracts/behavior-events.md}. {@code occurredAt} is an ISO-8601 UTC string with
 * a {@code Z} suffix (the consumer rejects zone-less timestamps), and {@code context} is never
 * {@code null}.
 */
public record BehaviorEvent(
        UUID eventId,
        String eventType,
        UUID userId,
        UUID productId,
        String occurredAt,
        String source,
        Map<String, Object> context
) {
}
