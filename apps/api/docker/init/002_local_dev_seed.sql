INSERT INTO users (id, email, role, ai_enabled, plus_status)
VALUES ('dev-user', 'dev@artifact.local', 'admin', true, 'active')
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  ai_enabled = EXCLUDED.ai_enabled,
  plus_status = EXCLUDED.plus_status,
  disabled_at = NULL,
  updated_at = now();
