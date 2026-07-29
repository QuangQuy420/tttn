package com.tttn.orderservice.messaging;

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

    private OrderSagaRoutingKeys() {
    }
}
