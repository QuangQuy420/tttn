CREATE TABLE order_saga_logs
(
    id              UUID PRIMARY KEY,
    order_id        UUID          NOT NULL,
    stage           VARCHAR(40)   NOT NULL,
    level           VARCHAR(10)   NOT NULL,
    message         VARCHAR(1000) NOT NULL,
    source_service  VARCHAR(20)   NOT NULL,
    target_service  VARCHAR(20),
    error_detail    VARCHAR(1000),
    retry_count     INTEGER,
    occurred_at     TIMESTAMP     NOT NULL,

    CONSTRAINT fk_order_saga_logs_order
        FOREIGN KEY (order_id)
            REFERENCES orders (id)
            ON DELETE CASCADE
);

CREATE INDEX idx_order_saga_logs_order_id
    ON order_saga_logs (order_id);

CREATE INDEX idx_order_saga_logs_occurred_at
    ON order_saga_logs (occurred_at);
