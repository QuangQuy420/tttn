package com.tttn.orderservice.messaging;

/**
 * Exchange name, routing keys and outbox aggregate type for the {@code behavior-events} topic
 * exchange this service publishes user behavior to (consumed by recommendation-service).
 */
public final class BehaviorEventRoutingKeys {

    public static final String EXCHANGE = "behavior-events";

    public static final String ADD_TO_CART = "behavior.add_to_cart";
    public static final String PURCHASE = "behavior.purchase";

    // Not OutboxEvent.AGGREGATE_ORDER, so a failed PURCHASE row never re-arms saga state; it still
    // writes one WARN OUTBOX_FAILED saga log on the order in aggregate_id (see OutboxRelay).
    public static final String AGGREGATE_BEHAVIOR = "BEHAVIOR_EVENT";

    private BehaviorEventRoutingKeys() {
    }
}
