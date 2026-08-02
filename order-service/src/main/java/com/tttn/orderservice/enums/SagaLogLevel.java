package com.tttn.orderservice.enums;

/**
 * Severity of an {@code OrderSagaLog} entry (FR15) — {@code INFO} for normal saga milestones,
 * {@code WARN} for abnormal ones ({@code stock.reserve.rejected}, {@code payment.failed}, a
 * failed {@code stock.release.requested} publish, {@code reconciliationExhausted}, dead-letter).
 */
public enum SagaLogLevel {

    INFO,

    WARN
}
