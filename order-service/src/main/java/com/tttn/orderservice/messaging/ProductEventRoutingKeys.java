package com.tttn.orderservice.messaging;

/**
 * Routing keys and exchange name for catalog product events, consumed off the
 * {@code product-events} topic exchange product-service publishes to (separate from the
 * {@code order-saga-events} exchange in {@link OrderSagaRoutingKeys}).
 */
public final class ProductEventRoutingKeys {

    public static final String EXCHANGE = "product-events";

    public static final String PRODUCT_UPDATED = "product.updated";
    public static final String PRODUCT_DELETED = "product.deleted";

    private ProductEventRoutingKeys() {
    }
}
