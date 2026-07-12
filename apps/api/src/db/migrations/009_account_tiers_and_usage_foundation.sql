CREATE TABLE IF NOT EXISTS account_access (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free',
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_access_tier_check CHECK (tier IN ('free', 'creator', 'founder')),
  CONSTRAINT account_access_version_non_negative CHECK (version >= 0)
);

CREATE TABLE IF NOT EXISTS tier_assignments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_tier text NOT NULL,
  new_tier text NOT NULL,
  reason text NOT NULL,
  admin_user_id text NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tier_assignments_previous_tier_check CHECK (previous_tier IN ('free', 'creator', 'founder')),
  CONSTRAINT tier_assignments_new_tier_check CHECK (new_tier IN ('free', 'creator', 'founder')),
  CONSTRAINT tier_assignments_reason_present CHECK (length(btrim(reason)) > 0),
  CONSTRAINT tier_assignments_admin_idempotency_unique UNIQUE (admin_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS quota_grants (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period text NOT NULL,
  amount integer NOT NULL,
  reversed_amount integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  admin_user_id text NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quota_grants_period_format CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT quota_grants_amount_positive CHECK (amount > 0),
  CONSTRAINT quota_grants_reversed_amount_valid CHECK (reversed_amount >= 0 AND reversed_amount <= amount),
  CONSTRAINT quota_grants_reason_present CHECK (length(btrim(reason)) > 0),
  CONSTRAINT quota_grants_admin_idempotency_unique UNIQUE (admin_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS quota_grant_reversals (
  id text PRIMARY KEY,
  grant_id text NOT NULL REFERENCES quota_grants(id),
  amount integer NOT NULL,
  reason text NOT NULL,
  admin_user_id text NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quota_grant_reversals_amount_positive CHECK (amount > 0),
  CONSTRAINT quota_grant_reversals_reason_present CHECK (length(btrim(reason)) > 0),
  CONSTRAINT quota_grant_reversals_admin_idempotency_unique UNIQUE (admin_user_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION apply_quota_grant_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE quota_grants
  SET reversed_amount = reversed_amount + NEW.amount
  WHERE id = NEW.grant_id
    AND reversed_amount + NEW.amount <= amount;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM quota_grants WHERE id = NEW.grant_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quota grant reversal exceeds remaining amount';
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0002',
    MESSAGE = 'quota grant not found';
END;
$$;

DROP TRIGGER IF EXISTS quota_grant_reversals_apply_amount ON quota_grant_reversals;
CREATE TRIGGER quota_grant_reversals_apply_amount
AFTER INSERT ON quota_grant_reversals
FOR EACH ROW
EXECUTE FUNCTION apply_quota_grant_reversal();

CREATE TABLE IF NOT EXISTS ai_operations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  reservation_period text NOT NULL,
  reserved_generations integer NOT NULL DEFAULT 1,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  CONSTRAINT ai_operations_feature_check CHECK (feature IN ('image_create', 'shader_create', 'shader_refine')),
  CONSTRAINT ai_operations_status_check CHECK (
    status IN ('reserved', 'running', 'succeeded', 'failed', 'cancelled', 'expired')
  ),
  CONSTRAINT ai_operations_period_format CHECK (reservation_period ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT ai_operations_reserved_generations_check CHECK (reserved_generations IN (0, 1)),
  CONSTRAINT ai_operations_user_feature_idempotency_unique UNIQUE (user_id, feature, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_operations_one_active_per_user_idx
  ON ai_operations (user_id)
  WHERE status IN ('reserved', 'running');

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id text PRIMARY KEY,
  operation_id text NULL REFERENCES ai_operations(id) ON DELETE SET NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL,
  provider_request_id text NULL,
  usage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  pricing_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_events_feature_check CHECK (feature IN ('image_create', 'shader_create', 'shader_refine')),
  CONSTRAINT ai_usage_events_status_check CHECK (status IN ('succeeded', 'failed')),
  CONSTRAINT ai_usage_events_cost_non_negative CHECK (cost_micro_usd >= 0),
  CONSTRAINT ai_usage_events_pricing_version_present CHECK (length(btrim(pricing_version)) > 0)
);

CREATE TABLE IF NOT EXISTS provider_reconciliations (
  id text PRIMARY KEY,
  provider text NOT NULL,
  usage_date date NOT NULL,
  status text NOT NULL,
  provider_cost_micro_usd bigint NULL,
  internal_cost_micro_usd bigint NOT NULL DEFAULT 0,
  error_code text NULL,
  synced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_reconciliations_status_check CHECK (status IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT provider_reconciliations_provider_cost_non_negative CHECK (
    provider_cost_micro_usd IS NULL OR provider_cost_micro_usd >= 0
  ),
  CONSTRAINT provider_reconciliations_internal_cost_non_negative CHECK (internal_cost_micro_usd >= 0),
  CONSTRAINT provider_reconciliations_provider_date_unique UNIQUE (provider, usage_date)
);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id text PRIMARY KEY,
  admin_user_id text NOT NULL REFERENCES users(id),
  target_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  reason text NOT NULL,
  before_json jsonb NULL,
  after_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_events_reason_present CHECK (length(btrim(reason)) > 0)
);

ALTER TABLE ai_generation_jobs
  ADD COLUMN IF NOT EXISTS operation_id text NULL REFERENCES ai_operations(id) ON DELETE SET NULL;

ALTER TABLE ai_shader_requests
  ADD COLUMN IF NOT EXISTS operation_id text NULL REFERENCES ai_operations(id) ON DELETE SET NULL;

ALTER TABLE ai_usage_monthly
  ADD COLUMN IF NOT EXISTS committed_generation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_generation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_cost_micro_usd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_call_count integer NOT NULL DEFAULT 0;

ALTER TABLE ai_usage_monthly
  DROP CONSTRAINT IF EXISTS ai_usage_monthly_committed_generation_count_non_negative,
  ADD CONSTRAINT ai_usage_monthly_committed_generation_count_non_negative CHECK (committed_generation_count >= 0),
  DROP CONSTRAINT IF EXISTS ai_usage_monthly_reserved_generation_count_non_negative,
  ADD CONSTRAINT ai_usage_monthly_reserved_generation_count_non_negative CHECK (reserved_generation_count >= 0),
  DROP CONSTRAINT IF EXISTS ai_usage_monthly_provider_cost_micro_usd_non_negative,
  ADD CONSTRAINT ai_usage_monthly_provider_cost_micro_usd_non_negative CHECK (provider_cost_micro_usd >= 0),
  DROP CONSTRAINT IF EXISTS ai_usage_monthly_input_tokens_non_negative,
  ADD CONSTRAINT ai_usage_monthly_input_tokens_non_negative CHECK (input_tokens >= 0),
  DROP CONSTRAINT IF EXISTS ai_usage_monthly_output_tokens_non_negative,
  ADD CONSTRAINT ai_usage_monthly_output_tokens_non_negative CHECK (output_tokens >= 0),
  DROP CONSTRAINT IF EXISTS ai_usage_monthly_failed_call_count_non_negative,
  ADD CONSTRAINT ai_usage_monthly_failed_call_count_non_negative CHECK (failed_call_count >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS ai_generation_jobs_operation_id_unique_idx
  ON ai_generation_jobs (operation_id)
  WHERE operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_shader_requests_operation_id_unique_idx
  ON ai_shader_requests (operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tier_assignments_user_created_idx
  ON tier_assignments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quota_grants_user_period_created_idx
  ON quota_grants (user_id, period, created_at DESC);

CREATE INDEX IF NOT EXISTS quota_grant_reversals_grant_created_idx
  ON quota_grant_reversals (grant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_operations_user_created_idx
  ON ai_operations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON ai_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_provider_created_idx
  ON ai_usage_events (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_events_target_created_idx
  ON admin_audit_events (target_user_id, created_at DESC);

INSERT INTO account_access (user_id, tier)
SELECT id, 'free'
FROM users
ON CONFLICT (user_id) DO NOTHING;
