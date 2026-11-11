-- Tokens issued (JWT iat) before this UTC instant are rejected; set on password change / reset.
-- NULL = no revocation yet. TIMESTAMP like every other time column here (Hibernate jdbc.time_zone: UTC).
ALTER TABLE users ADD COLUMN tokens_valid_after TIMESTAMP;
