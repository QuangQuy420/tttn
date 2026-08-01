CREATE TABLE addresses (
    id              UUID PRIMARY KEY,
    created_at      TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP NOT NULL,
    user_id         UUID NOT NULL,
    receiver_name   VARCHAR(100) NOT NULL,
    receiver_phone  VARCHAR(20) NOT NULL,
    address         VARCHAR(255) NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_addresses_user_id FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_addresses_user_id ON addresses (user_id);
