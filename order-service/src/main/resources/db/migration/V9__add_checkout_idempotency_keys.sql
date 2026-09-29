-- Idempotency-Key storage for POST /users/{userId}/checkout: one row per (user, key), written in
-- the same transaction as the order it created, so a retried or concurrent duplicate request
-- replays the stored response instead of creating a second order.
CREATE TABLE checkout_idempotency_keys
(
    id               UUID PRIMARY KEY,
    user_id          UUID         NOT NULL,
    idempotency_key  VARCHAR(100) NOT NULL,
    request_hash     VARCHAR(64)  NOT NULL,
    order_id         UUID         NOT NULL,
    response_body    JSONB        NOT NULL,
    created_at       TIMESTAMP    NOT NULL,
    expires_at       TIMESTAMP    NOT NULL,

    CONSTRAINT uk_checkout_idempotency_keys_user_key
        UNIQUE (user_id, idempotency_key),

    CONSTRAINT fk_checkout_idempotency_keys_order
        FOREIGN KEY (order_id)
            REFERENCES orders (id)
            ON DELETE CASCADE
);

CREATE INDEX idx_checkout_idempotency_keys_expires_at
    ON checkout_idempotency_keys (expires_at);
