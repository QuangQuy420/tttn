CREATE TABLE reconciliation_settings
(
    id                       UUID PRIMARY KEY,
    interval_ms              INTEGER   NOT NULL,
    stuck_threshold_minutes  INTEGER   NOT NULL,
    max_attempts             INTEGER   NOT NULL,
    updated_at               TIMESTAMP NOT NULL,
    updated_by               UUID
);

-- Single-row table: seed exactly one row with the same defaults the old
-- app.reconciliation.* env vars used (interval-ms=60000, stuck-threshold-minutes=2,
-- max-attempts=3), so behavior is unchanged until an admin edits it.
INSERT INTO reconciliation_settings (id, interval_ms, stuck_threshold_minutes, max_attempts, updated_at, updated_by)
VALUES (gen_random_uuid(), 60000, 2, 3, now(), NULL);
