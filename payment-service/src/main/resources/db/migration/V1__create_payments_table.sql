CREATE TABLE payments
(
    id               UUID PRIMARY KEY,
    order_id         UUID           NOT NULL,
    user_id          UUID           NOT NULL,
    amount           NUMERIC(19, 2) NOT NULL,
    currency         VARCHAR(3)     NOT NULL DEFAULT 'VND',
    payment_method   VARCHAR(30)    NOT NULL,
    status           VARCHAR(30)    NOT NULL,
    transaction_id   VARCHAR(100),
    payment_url      VARCHAR(1000),
    failure_reason   VARCHAR(500),
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ    NOT NULL,
    updated_at       TIMESTAMPTZ    NOT NULL,

    CONSTRAINT uk_payments_order_id UNIQUE (order_id),
    CONSTRAINT uk_payments_transaction_id UNIQUE (transaction_id),
    CONSTRAINT chk_payments_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_payments_user_id
    ON payments (user_id);

CREATE INDEX idx_payments_status
    ON payments (status);

CREATE INDEX idx_payments_created_at
    ON payments (created_at);