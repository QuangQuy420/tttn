package com.tttn.orderservice.messaging.event;

import java.util.UUID;

/**
 * Thin catalog event published by product-service on {@code product.updated} /
 * {@code product.deleted} (raw amqplib, payload {@code { productId, occurredAt }}, no type
 * headers — deserialized via the INFERRED-type converter in
 * {@link com.tttn.orderservice.config.RabbitMqConfig#jsonMessageConverter()}). Deliberately
 * carries no product data: the consumer re-fetches the CURRENT product state via
 * {@link com.tttn.orderservice.client.ProductClient}, so duplicated or reordered events
 * converge to the same result — see {@link com.tttn.orderservice.messaging.ProductEventListener}.
 */
public record ProductEvent(
        UUID productId,
        String occurredAt
) {
}
