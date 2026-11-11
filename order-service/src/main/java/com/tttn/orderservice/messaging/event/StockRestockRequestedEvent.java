package com.tttn.orderservice.messaging.event;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Payload of {@code stock.restock.requested}: product-service puts the order's committed stock
 * back (and releases rows still reserved). It derives the items from its own reservation rows,
 * so no line items are sent.
 */
public record StockRestockRequestedEvent(
        UUID orderId,
        LocalDateTime occurredAt
) {
}
