-- Baseline migration: reproduces the schema Hibernate's ddl-auto=update had already created,
-- so Flyway and Hibernate (now ddl-auto=validate) agree on the current shape.

CREATE TABLE users (
    id             UUID PRIMARY KEY,
    created_at     TIMESTAMP NOT NULL,
    updated_at     TIMESTAMP NOT NULL,
    email          VARCHAR(100) NOT NULL,
    username       VARCHAR(50) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(20) NOT NULL,
    status         VARCHAR(20) NOT NULL,
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT uk_users_username UNIQUE (username)
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_username ON users (username);

CREATE TABLE profiles (
    id             UUID PRIMARY KEY,
    created_at     TIMESTAMP NOT NULL,
    updated_at     TIMESTAMP NOT NULL,
    user_id        UUID NOT NULL,
    full_name      VARCHAR(100) NOT NULL,
    phone          VARCHAR(20),
    avatar_url     VARCHAR(500),
    address        VARCHAR(255),
    date_of_birth  DATE,
    CONSTRAINT uk_profiles_user_id UNIQUE (user_id),
    CONSTRAINT fk_profiles_user_id FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY,
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL,
    user_id     UUID NOT NULL,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    used_at     TIMESTAMP,
    CONSTRAINT uk_password_reset_tokens_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_password_reset_tokens_user_id FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_password_reset_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX idx_password_reset_user_id ON password_reset_tokens (user_id);
