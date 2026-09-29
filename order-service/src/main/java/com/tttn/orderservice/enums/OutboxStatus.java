package com.tttn.orderservice.enums;

/**
 * Lifecycle of an {@code OutboxEvent} row: {@code PENDING} until {@code OutboxRelay} gets a
 * broker ack for it ({@code SENT}), or gives up after {@code app.outbox.max-attempts}
 * ({@code FAILED}).
 */
public enum OutboxStatus {

    PENDING,

    SENT,

    FAILED
}
