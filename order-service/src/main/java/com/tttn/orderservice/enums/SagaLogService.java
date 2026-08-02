package com.tttn.orderservice.enums;

/**
 * Which service a {@code OrderSagaLog} entry's event was sent from ({@code sourceService}) or
 * to ({@code targetService}) — lets the admin UI show a saga entry as an edge between two
 * services, not just a bare stage label. {@code MESSAGE_BROKER} covers dead-letter entries,
 * where the "source" is RabbitMQ's own dead-letter routing rather than a specific service reply.
 */
public enum SagaLogService {

    ORDER_SERVICE,

    PRODUCT_SERVICE,

    PAYMENT_SERVICE,

    MESSAGE_BROKER
}
