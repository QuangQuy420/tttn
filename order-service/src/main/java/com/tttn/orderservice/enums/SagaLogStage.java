package com.tttn.orderservice.enums;

/**
 * Milestone an {@code OrderSagaLog} entry marks along a checkout saga's timeline (FR14) — one
 * entry per touchpoint, independent of whether {@code Order.status} itself changed (unlike
 * {@code OrderStatusHistory}, which only logs actual status transitions for customer-facing
 * history).
 */
public enum SagaLogStage {

    CREATED,

    STOCK_RESERVE_REQUESTED,

    STOCK_RESERVED,

    STOCK_RESERVE_REJECTED,

    PAYMENT_CREATE_REQUESTED,

    PAYMENT_COMPLETED,

    PAYMENT_FAILED,

    STOCK_RELEASE_REQUESTED,

    RECONCILIATION_RESENT,

    RECONCILIATION_EXHAUSTED,

    DEAD_LETTERED
}
