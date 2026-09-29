-- Transactional outbox: saga events are inserted here in the same transaction as the business
-- change, then OutboxRelay publishes them to RabbitMQ (publisher confirms) and marks them SENT.
CREATE TABLE outbox_events
(
    id               UUID PRIMARY KEY,
    aggregate_type   VARCHAR(50)  NOT NULL,
    aggregate_id     UUID         NOT NULL,
    exchange         VARCHAR(100) NOT NULL,
    routing_key      VARCHAR(100) NOT NULL,
    payload          JSONB        NOT NULL,
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    attempts         INT          NOT NULL DEFAULT 0,
    next_attempt_at  TIMESTAMP    NOT NULL,
    last_error       TEXT,
    created_at       TIMESTAMP    NOT NULL,
    sent_at          TIMESTAMP,

    CONSTRAINT chk_outbox_events_status
        CHECK (status IN ('PENDING', 'SENT', 'FAILED'))
);

CREATE INDEX idx_outbox_events_pending_next_attempt_at
    ON outbox_events (next_attempt_at)
    WHERE status = 'PENDING';

CREATE INDEX idx_outbox_events_aggregate_id
    ON outbox_events (aggregate_id);
