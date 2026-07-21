CREATE TABLE permissions (
    id          UUID PRIMARY KEY,
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL,
    code        VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    CONSTRAINT uk_permissions_code UNIQUE (code)
);

INSERT INTO permissions (id, created_at, updated_at, code, description) VALUES
    (gen_random_uuid(), now(), now(), 'product:manage', 'Tạo, sửa, xóa sản phẩm và ảnh sản phẩm'),
    (gen_random_uuid(), now(), now(), 'role:manage', 'Tạo, sửa, xóa vai trò và gán quyền cho vai trò'),
    (gen_random_uuid(), now(), now(), 'user:manage-roles', 'Gán hoặc gỡ vai trò của người dùng');
