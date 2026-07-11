ALTER TABLE ai_shader_requests
  DROP CONSTRAINT IF EXISTS ai_shader_spec_requests_status_check;

UPDATE ai_shader_requests
SET status = 'accepted'
WHERE status = 'succeeded';

ALTER TABLE ai_shader_requests
  ADD CONSTRAINT ai_shader_requests_status_check
  CHECK (status IN ('pending', 'generated', 'client_rejected', 'repairing', 'accepted', 'failed'));

ALTER TABLE ai_shader_requests
  ADD COLUMN IF NOT EXISTS compiler_diagnostic_json jsonb,
  ADD COLUMN IF NOT EXISTS repair_count integer NOT NULL DEFAULT 0
    CHECK (repair_count >= 0 AND repair_count <= 1);
