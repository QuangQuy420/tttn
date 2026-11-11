package com.tttn.orderservice.messaging;

import java.util.Set;

/**
 * Routing keys and exchange name for the checkout saga, published/consumed against the
 * {@code order-saga-events} topic exchange shared with product-service (and, later,
 * payment-service).
 */
public final class OrderSagaRoutingKeys {

    public static final String EXCHANGE = "order-saga-events";

    public static final String STOCK_RESERVE_REQUESTED = "stock.reserve.requested";
    public static final String STOCK_RESERVED = "stock.reserved";
    public static final String STOCK_RESERVE_REJECTED = "stock.reserve.rejected";
    public static final String PAYMENT_CREATE_REQUESTED = "payment.create.requested";
    public static final String PAYMENT_COMPLETED = "payment.completed";
    public static final String PAYMENT_FAILED = "payment.failed";
    public static final String STOCK_RELEASE_REQUESTED = "stock.release.requested";

    // Refund flow (cancel of a paid order, or a payment that lands after the cancel).
    public static final String PAYMENT_REFUND_REQUESTED = "payment.refund.requested";
    public static final String PAYMENT_REFUNDED = "payment.refunded";
    public static final String STOCK_RESTOCK_REQUESTED = "stock.restock.requested";

    // Outbox rows with these keys are never marked FAILED: the money / stock must come back, and
    // both consumers are idempotent, so retrying forever is safe (see OutboxRelay).
    public static final Set<String> RETRIED_UNTIL_SENT = Set.of(
            PAYMENT_REFUND_REQUESTED,
            STOCK_RESTOCK_REQUESTED
    );

    private OrderSagaRoutingKeys() {
    }
}
