package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.response.IdempotentCheckoutResult;

import java.util.UUID;

public interface CheckoutIdempotencyService {

    /**
     * Runs checkout at most once per {@code (userId, idempotencyKey)} within the key's TTL: a
     * retry with the same body replays the stored response, a different body is a 409. A
     * {@code null} key falls back to a plain (non-idempotent) checkout.
     */
    IdempotentCheckoutResult checkout(
            UUID userId,
            String idempotencyKey,
            CheckoutRequest request
    );
}
