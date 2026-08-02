package com.tttn.orderservice.enums;

/**
 * Dev/test-only fault injection for the checkout saga, toggled via the {@code SAGA_CHAOS_MODE}
 * env var (default {@code NONE} — no effect). Lets a developer force the failure paths that are
 * otherwise hard to trigger on demand (a stuck order that never gets a reply, a message that
 * keeps failing until it's dead-lettered) so {@link com.tttn.orderservice.scheduling.SagaReconciliationJob}
 * and {@link com.tttn.orderservice.messaging.DeadLetterListener} can be exercised without a real
 * broker/network fault. Never read outside {@code OrderSagaEventPublisher}/
 * {@code OrderSagaEventListener} — this is a manual testing knob, not a feature.
 */
public enum SagaChaosMode {

    /** No fault injection — normal behavior. */
    NONE,

    /**
     * {@code OrderSagaEventPublisher.publishStockReserveRequested} silently skips the actual
     * publish (pretends it succeeded) — the order stays {@code PENDING} forever with no
     * {@code stock.reserved}/{@code stock.reserve.rejected} reply ever coming, so
     * {@code SagaReconciliationJob} picks it up as stuck and keeps resending (also silently
     * skipped) until {@code RECONCILIATION_EXHAUSTED}.
     */
    STUCK_STOCK_RESERVE,

    /**
     * Same idea as {@link #STUCK_STOCK_RESERVE} but for
     * {@code OrderSagaEventPublisher.publishPaymentCreateRequested} — the order stays
     * {@code AWAITING_PAYMENT} forever.
     */
    STUCK_PAYMENT,

    /**
     * {@code OrderSagaEventListener.handle} throws immediately for every saga reply it
     * receives, so the message keeps getting requeued until it exceeds the queue's
     * {@code x-delivery-limit} (see {@code RabbitMqConfig}, {@code SAGA_QUEUE_DELIVERY_LIMIT})
     * and the broker routes it to {@code order-saga-events.dlq} — lower
     * {@code SAGA_QUEUE_DELIVERY_LIMIT} to a small number first so this doesn't take too long.
     */
    FORCE_DEAD_LETTER
}
