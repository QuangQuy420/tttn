package com.tttn.orderservice.dto.response;

/**
 * Result of an idempotent checkout: {@code replayed} is {@code true} when {@code response} is the
 * stored response of an earlier request with the same {@code Idempotency-Key} (no new order).
 */
public record IdempotentCheckoutResult(
        CheckoutResponse response,
        boolean replayed
) {
}
