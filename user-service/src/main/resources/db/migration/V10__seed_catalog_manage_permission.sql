INSERT INTO permissions (id, created_at, updated_at, code, description)
SELECT gen_random_uuid(), now(), now(), 'catalog:manage', 'Tạo, sửa, xóa thương hiệu và danh mục sản phẩm'
WHERE NOT EXISTS (
    SELECT 1
    FROM permissions
    WHERE code = 'catalog:manage'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.code = 'catalog:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
