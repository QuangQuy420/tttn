-- Optimistic locking for orders (Order.@Version): concurrent writers (customer/admin requests,
-- saga listener, reconciliation job, outbox relay) no longer overwrite each other — the later
-- write fails and is retried. DEFAULT 0 so existing rows get a valid version.
ALTER TABLE orders
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
