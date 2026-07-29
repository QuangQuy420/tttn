package com.tttn.orderservice.messaging.event;

import java.util.UUID;

public record OrderSagaItem(
        UUID variantId,
        Integer quantity
) {
}
