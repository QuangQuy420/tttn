CREATE TABLE roles (
    id          UUID PRIMARY KEY,
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL,
    name        VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    CONSTRAINT uk_roles_name UNIQUE (name)
);

INSERT INTO roles (id, created_at, updated_at, name, description) VALUES
    (gen_random_uuid(), now(), now(), 'CUSTOMER', 'Khách hàng'),
    (gen_random_uuid(), now(), now(), 'ADMIN', 'Quản trị viên');
