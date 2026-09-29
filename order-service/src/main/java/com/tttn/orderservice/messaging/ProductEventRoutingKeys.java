package com.tttn.orderservice.messaging;

/**
 * Exchange name and routing keys of the {@code product-events} topic exchange published by
 * product-service (product/variant/image changes — never checkout stock moves).
 */
public final class ProductEventRoutingKeys {

    public static final String EXCHANGE = "product-events";

    public static final String PRODUCT_UPDATED = "product.updated";
    public static final String PRODUCT_DELETED = "product.deleted";

    private ProductEventRoutingKeys() {
    }
}
