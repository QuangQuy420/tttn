-- Local-dev convenience seed: a ready-to-use admin account with the ADMIN role, so a
-- fresh `docker compose up --build` (or the watch variant) always has an admin login without
-- any manual setup. Guarded with NOT EXISTS so re-running against a DB that already has an
-- "admin" account (e.g. created by hand before this migration existed) is a no-op.
-- Login: username "admin", password "Admin@123" (meets RegisterRequest's password rule —
-- 8-24 chars, at least one letter and one digit — since login/register both enforce it).

INSERT INTO users (id, created_at, updated_at, email, username, password_hash, status)
SELECT gen_random_uuid(), now(), now(), 'admin@example.com', 'admin',
       '$2b$12$1UjHn8ti8Y.Wqi//fNBQ4uGmrgAN0p9RE.C8nMzTPjO2c0y6sRXGO', 'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE username = 'admin' OR email = 'admin@example.com'
);

INSERT INTO profiles (id, created_at, updated_at, user_id, full_name)
SELECT gen_random_uuid(), now(), now(), u.id, 'Quản trị viên'
FROM users u
WHERE u.username = 'admin'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username = 'admin' AND r.name = 'ADMIN'
  AND NOT EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
  );
