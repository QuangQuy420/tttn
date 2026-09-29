package com.tttn.orderservice.messaging.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Thin payload of {@code product.updated} / {@code product.deleted} on {@code product-events}
 * — only the id; consumers re-fetch the product for its current state.
 */
public record ProductChangedEvent(
        UUID productId,
        Instant occurredAt
) {
}
