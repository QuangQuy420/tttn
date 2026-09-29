package com.tttn.orderservice.service;

import java.util.UUID;

public interface OutboxService {

    /**
     * Stores {@code event} (serialized to JSON) as a {@code PENDING} outbox row. Must run inside
     * the caller's transaction, so the row commits or rolls back together with the business
     * change; {@code OutboxRelay} publishes it afterwards.
     */
    void enqueue(
            String exchange,
            String routingKey,
            String aggregateType,
            UUID aggregateId,
            Object event
    );
}
