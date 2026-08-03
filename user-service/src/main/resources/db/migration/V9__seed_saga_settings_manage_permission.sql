INSERT INTO permissions (id, created_at, updated_at, code, description) VALUES
    (gen_random_uuid(), now(), now(), 'saga-settings:manage', 'Xem và chỉnh sửa cấu hình retry của checkout saga');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'ADMIN' AND p.code = 'saga-settings:manage';
