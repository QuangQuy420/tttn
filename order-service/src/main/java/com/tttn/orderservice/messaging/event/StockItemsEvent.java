package com.tttn.orderservice.messaging.event;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Shared payload shape for {@code stock.reserve.requested} and {@code stock.release.requested}
 * — both just need the order id and the line items (variant + quantity) to act on.
 */
public record StockItemsEvent(
        UUID orderId,
        LocalDateTime occurredAt,
        List<OrderSagaItem> items
) {
}
