CREATE TABLE IF NOT EXISTS ai_shader_spec_requests (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('openai', 'localFallback')),
  prompt text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  response_json jsonb NULL,
  provider_request_id text NULL,
  provider_usage_json jsonb NULL,
  error_status integer NULL,
  error_code text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT ai_shader_spec_requests_user_id_idempotency_key_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_shader_spec_requests_user_created_idx
  ON ai_shader_spec_requests (user_id, created_at DESC);
