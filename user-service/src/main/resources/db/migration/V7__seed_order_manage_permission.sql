INSERT INTO permissions (id, created_at, updated_at, code, description) VALUES
    (gen_random_uuid(), now(), now(), 'order:manage', 'Xem và cập nhật trạng thái đơn hàng của mọi khách hàng');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'ADMIN' AND p.code = 'order:manage';
