BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text UNIQUE NULL,
  role text NOT NULL DEFAULT 'user',
  ai_enabled boolean NOT NULL DEFAULT false,
  plus_status text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  storage_key text NOT NULL,
  public_uri text NULL,
  mime_type text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  size_bytes integer NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT assets_dimensions_positive CHECK (width > 0 AND height > 0),
  CONSTRAINT assets_size_bytes_non_negative CHECK (size_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  model text NOT NULL,
  prompt text NOT NULL,
  negative_prompt text NULL,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  output_asset_id text NULL REFERENCES assets(id),
  error_code text NULL,
  error_message text NULL,
  retryable boolean NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  estimated_cost numeric NULL,
  provider_usage_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  expires_at timestamptz NULL,
  CONSTRAINT ai_generation_jobs_status_check CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')
  ),
  CONSTRAINT ai_generation_jobs_attempt_count_non_negative CHECK (attempt_count >= 0),
  CONSTRAINT ai_generation_jobs_estimated_cost_non_negative CHECK (
    estimated_cost IS NULL OR estimated_cost >= 0
  ),
  CONSTRAINT ai_generation_jobs_user_id_idempotency_key_unique UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ai_usage_monthly (
  user_id text NOT NULL REFERENCES users(id),
  period text NOT NULL,
  generation_limit integer NOT NULL,
  generation_count integer NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period),
  CONSTRAINT ai_usage_monthly_period_format CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT ai_usage_monthly_generation_limit_non_negative CHECK (generation_limit >= 0),
  CONSTRAINT ai_usage_monthly_generation_count_non_negative CHECK (generation_count >= 0),
  CONSTRAINT ai_usage_monthly_estimated_cost_non_negative CHECK (estimated_cost >= 0)
);

CREATE TABLE IF NOT EXISTS ai_rate_limit_events (
  id text PRIMARY KEY,
  user_id text NULL REFERENCES users(id),
  ip_hash text NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS assets_user_id_created_at_idx
  ON assets (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS assets_storage_key_unique_idx
  ON assets (storage_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ai_generation_jobs_user_id_created_at_idx
  ON ai_generation_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_generation_jobs_status_queued_at_idx
  ON ai_generation_jobs (status, queued_at);

CREATE INDEX IF NOT EXISTS ai_generation_jobs_output_asset_id_idx
  ON ai_generation_jobs (output_asset_id)
  WHERE output_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_rate_limit_events_user_id_created_at_idx
  ON ai_rate_limit_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_rate_limit_events_ip_hash_created_at_idx
  ON ai_rate_limit_events (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

COMMIT;
