ALTER TABLE orders
    ADD COLUMN reconciliation_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN last_reconciliation_attempt_at TIMESTAMP NULL,
    ADD COLUMN reconciliation_exhausted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN stock_release_pending BOOLEAN NOT NULL DEFAULT FALSE;
